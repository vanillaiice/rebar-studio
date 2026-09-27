// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs — Rebar Studio (Electron main process)
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// A single reusable hidden window renders every preview, avoiding the churn (and
// potential handle leaks) of creating/destroying a BrowserWindow per keystroke.
let renderWin = null;
// Serialize renders so overlapping requests don't interrupt each other's load.
let renderChain = Promise.resolve();
// The editor window; IPC is accepted only from it.
let mainWin = null;

function fromMainWindow(event) {
  return mainWin && !mainWin.isDestroyed() && event.sender === mainWin.webContents;
}

function getRenderWindow() {
  if (renderWin && !renderWin.isDestroyed()) return renderWin;
  renderWin = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    skipTaskbar: true,
    webPreferences: { offscreen: false, javascript: true },
  });
  return renderWin;
}

function destroyRenderWindow() {
  if (renderWin && !renderWin.isDestroyed()) renderWin.destroy();
  renderWin = null;
}

// Render a standalone HTML document to PDF using Chromium's own print engine —
// the same engine the Gotenberg backend uses — so the editor's live preview is
// the real final PDF (named landscape pages, @page sizes, backgrounds, footers).
async function renderPdf({ html, footer }) {
  const win = getRenderWindow();

  // Inlined assets mean no external/relative URLs, but we use a temp file rather
  // than a data: URL to avoid navigation length limits on large documents.
  const tmpFile = path.join(os.tmpdir(), `reb-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);

  try {
    fs.writeFileSync(tmpFile, html);
    await win.loadFile(tmpFile);

    // Wait until the in-page script signals Tailwind has finished generating CSS
    // (fonts ready + <head> mutations settled), so layout is final before print.
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const ready = await win.webContents
        .executeJavaScript('window.__rebReady === true')
        .catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: Boolean(footer),
      headerTemplate: '<span></span>',
      footerTemplate: footer || '<span></span>',
    }); // Buffer -> arrives as a Uint8Array in the renderer
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

ipcMain.handle('render-pdf', (event, payload) => {
  if (!fromMainWindow(event)) throw new Error('render-pdf refused: unknown sender');
  const result = renderChain.then(() => renderPdf(payload));
  // Keep the chain alive regardless of this render's outcome.
  renderChain = result.then(
    () => {},
    () => {},
  );
  return result;
});

// Save the current preview's PDF bytes to disk via a native save dialog.
ipcMain.handle('save-pdf', async (event, bytes) => {
  if (!fromMainWindow(event)) throw new Error('save-pdf refused: unknown sender');
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save PDF',
    defaultPath: 'template.pdf',
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, Buffer.from(bytes));
  return true;
});

app.on('before-quit', destroyRenderWindow);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    // No Node in the page: templates are user content. The preload exposes only renderPdf and
    // savePdf (electron/preload.cjs).
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
    title: 'Rebar Studio',
  });

  // Manually handle paste to bypass Linux hidden menu accelerator bugs.
  // We ONLY intercept 'v' (paste) because Monaco relies on a trusted native paste event to read the clipboard.
  // Monaco natively handles Ctrl+C, Ctrl+X, Ctrl+Z, and Ctrl+A via its internal keybindings,
  // so we must NOT intercept those, otherwise we break Monaco's internal editor state!
  win.webContents.on('before-input-event', (event, input) => {
    const isMac = process.platform === 'darwin';
    const modifier = isMac ? input.meta : input.control;

    if (modifier && input.type === 'keyDown' && input.key.toLowerCase() === 'v') {
      win.webContents.paste();
      event.preventDefault();
    }
  });

  // Tear down the hidden render window when the main window closes, otherwise it
  // keeps the app alive and 'window-all-closed' never fires.
  win.on('closed', destroyRenderWindow);

  // The editor never navigates or opens windows; links in a template must not take it over.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWin = win;

  // Load the built React app directly from dist (no copy step).
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  // Create default menu to ensure keyboard shortcuts (copy/paste) work natively
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
