// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// Rebar Studio's Electron main process: the app window, the PDF renderer, files and updates.
//
// The app window loads dist/ from disk with no Node access; electron/preload.cjs is its only bridge.
// PDFs are printed in a separate hidden window that is network-isolated (plan section 9): templates
// are third-party content and documents hold personal data, so a rendered page can load only the
// files written next to it.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { createRenderer } = require('./render.cjs');
const { updateChannel } = require('./updates.cjs');

// A separate profile (tests, or a second workspace): REBAR_STUDIO_USER_DATA=/some/folder.
if (process.env.REBAR_STUDIO_USER_DATA) app.setPath('userData', process.env.REBAR_STUDIO_USER_DATA);

const OPENABLE = ['.reb', '.rebpack', '.rebdoc'];
const MAX_OPEN_BYTES = 500 * 1024 * 1024;

let mainWin = null;
let renderChain = Promise.resolve();
let rendererReady = false;
const pendingOpens = [];

function fromMainWindow(event) {
  return mainWin && !mainWin.isDestroyed() && event.sender === mainWin.webContents;
}

// --- Files opened from the system ------------------------------------------------------------------

function queueOpen(filePath) {
  if (!filePath || !OPENABLE.includes(path.extname(filePath).toLowerCase())) return;
  pendingOpens.push(filePath);
  flushOpens();
}

function flushOpens() {
  if (!rendererReady || !mainWin || mainWin.isDestroyed()) return;
  while (pendingOpens.length) {
    const filePath = pendingOpens.shift();
    try {
      if (fs.statSync(filePath).size > MAX_OPEN_BYTES) throw new Error('too large');
      mainWin.webContents.send('open-file', { name: path.basename(filePath), bytes: new Uint8Array(fs.readFileSync(filePath)) });
    } catch (e) {
      dialog.showErrorBox('Rebar Studio', `${path.basename(filePath)} could not be opened: ${e.message}`);
    }
  }
}

function filesInArgs(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter((arg) => !arg.startsWith('-') && OPENABLE.includes(path.extname(arg).toLowerCase()));
}

// --- The PDF renderer (electron/render.cjs) ---------------------------------------------------------

const renderer = createRenderer();

ipcMain.handle('render-pdf', (event, request) => {
  if (!fromMainWindow(event)) throw new Error('refused: unknown sender');
  // One render at a time: the render window holds one page.
  const result = renderChain.then(() => renderer.renderPdf(request));
  renderChain = result.then(
    () => {},
    () => {},
  );
  return result;
});

// --- Saving files ----------------------------------------------------------------------------------

// What "Open after saving" may open: documents to look at, never Studio's own formats (opening those
// would import them into Studio again) or anything that runs.
const OPEN_AFTER_SAVE = ['.pdf', '.csv', '.json', '.html'];

function openSaved(target) {
  // Some desktop openers keep their promise pending while the external app runs. The save IPC
  // must reply once the file is written, independently of that app's lifetime.
  setImmediate(() => {
    void shell.openPath(target).then((error) => {
      if (error) throw new Error(error);
    }).catch((error) => {
      dialog.showErrorBox('Rebar Studio', `${path.basename(target)} was saved but could not be opened: ${error.message}`);
    });
  });
}

ipcMain.handle('save-file', async (event, { name, bytes, filters, open }) => {
  if (!fromMainWindow(event)) throw new Error('refused: unknown sender');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
    defaultPath: path.basename(String(name || 'file')),
    filters: Array.isArray(filters) && filters.length ? filters : undefined,
  });
  if (canceled || !filePath) return false;
  await fs.promises.writeFile(filePath, Buffer.from(bytes));
  if (open === true && OPEN_AFTER_SAVE.includes(path.extname(filePath).toLowerCase())) openSaved(filePath);
  return true;
});

// Several files into a folder the person picks; an existing name gets " (2)", " (3)"...
ipcMain.handle('save-files', async (event, files, open) => {
  if (!fromMainWindow(event)) throw new Error('refused: unknown sender');
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: 'Choose a folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths[0]) return null;
  const folder = filePaths[0];
  for (const file of files) {
    const base = path.basename(String(file.name || 'file'));
    const ext = path.extname(base);
    let target = path.join(folder, base);
    for (let n = 2; fs.existsSync(target); n++) target = path.join(folder, `${base.slice(0, base.length - ext.length)} (${n})${ext}`);
    await fs.promises.writeFile(target, Buffer.from(file.bytes));
  }
  if (open === true) openSaved(folder);
  return { folder, count: files.length };
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.on('renderer-ready', (event) => {
  if (!fromMainWindow(event)) return;
  rendererReady = true;
  flushOpens();
});

// --- Updates (electron-updater, from GitHub Releases) ----------------------------------------------
// Studio downloads and installs an update by itself only when automatic updates are on in Settings;
// otherwise a check only reports it, and the person chooses to download and to install it.

let updater = null;

function sendUpdate(status) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update-status', status);
}

function getUpdater() {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  updater.on('update-available', (info) => sendUpdate({ state: 'available', version: info.version }));
  updater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  updater.on('download-progress', (progress) => sendUpdate({ state: 'downloading', percent: progress.percent }));
  updater.on('update-downloaded', (info) => sendUpdate({ state: 'ready', version: info.version }));
  updater.on('error', (error) => sendUpdate({ state: 'error', message: String(error && error.message ? error.message : error) }));
  return updater;
}

ipcMain.handle('check-updates', async (event, channel, automatic) => {
  if (!fromMainWindow(event)) throw new Error('refused: unknown sender');
  if (!app.isPackaged) return { state: 'unsupported', message: 'Updates work in installed builds only.' };
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return { state: 'unsupported', message: 'This build updates through your package manager.' };
  }
  const u = getUpdater();
  u.channel = updateChannel(channel, app.getVersion());
  u.allowPrerelease = u.channel === 'beta';
  u.autoDownload = automatic === true;
  u.autoInstallOnAppQuit = automatic === true;
  try {
    const result = await u.checkForUpdates();
    if (!result || !result.isUpdateAvailable) return { state: 'none' };
    return { state: 'available', version: result.updateInfo.version };
  } catch (e) {
    return { state: 'error', message: e.message };
  }
});

ipcMain.handle('download-update', async (event) => {
  if (!fromMainWindow(event)) throw new Error('refused: unknown sender');
  try {
    await getUpdater().downloadUpdate();
  } catch (e) {
    sendUpdate({ state: 'error', message: e.message });
  }
});

ipcMain.handle('install-update', (event) => {
  if (!fromMainWindow(event)) throw new Error('refused: unknown sender');
  getUpdater().quitAndInstall();
});

// --- The app window --------------------------------------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 500,
    backgroundColor: '#020617',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    // No Node in the page: imported templates are third-party content. The preload exposes only
    // the calls in electron/preload.cjs.
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
    title: 'Rebar Studio',
  });

  // Linux hides the menu, whose accelerators then miss Ctrl+V: paste through the web contents.
  // Only paste: Monaco handles copy, cut, undo and select-all itself.
  win.webContents.on('before-input-event', (event, input) => {
    const modifier = process.platform === 'darwin' ? input.meta : input.control;
    if (modifier && input.type === 'keyDown' && input.key.toLowerCase() === 'v' && !input.shift) {
      win.webContents.paste();
      event.preventDefault();
    }
  });

  // The app routes in the URL fragment and never navigates or opens windows.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(['clipboard-sanitized-write', 'clipboard-read', 'persistent-storage'].includes(permission)),
  );

  win.on('closed', () => {
    renderer.destroy();
    mainWin = null;
    rendererReady = false;
  });
  mainWin = win;
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch (double-clicking a file) hands its files to this one.
  app.on('second-instance', (_event, argv) => {
    filesInArgs(argv).forEach(queueOpen);
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });
  // macOS delivers opened files as events, possibly before the app is ready.
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    queueOpen(filePath);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
        {
          label: 'Edit',
          submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }],
        },
        {
          label: 'View',
          submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
        },
      ]),
    );
    createWindow();
    filesInArgs(process.argv).forEach(queueOpen);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => renderer.destroy());
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
