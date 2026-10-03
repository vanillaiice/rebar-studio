// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// The PDF renderer: a hidden, network-isolated window that prints a page with the parameters Rebar's
// PDF service (Gotenberg) uses. Used by the app (main.cjs) and by the PDF fidelity check
// (scripts/fidelity.mjs), so both print the same way.
const { BrowserWindow, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

// Names a page's files may have: letters, digits, ".", "-" and "_" only (no folders).
const PLAIN_NAME = /^[A-Za-z0-9._-]+$/;

function createRenderer() {
  let win = null;
  let renderSession = null;
  let renderDir = null;

  // In memory, and refusing every request except the current render folder, data: and blob:.
  function getSession() {
    if (renderSession) return renderSession;
    renderSession = session.fromPartition('reb-render');
    renderSession.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url;
      const allowed =
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        url.startsWith('devtools:') ||
        (renderDir !== null && url.startsWith(pathToFileURL(renderDir).href + '/'));
      callback({ cancel: !allowed });
    });
    renderSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    return renderSession;
  }

  function getWindow() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      show: false,
      width: 1240,
      height: 1754,
      skipTaskbar: true,
      webPreferences: {
        session: getSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: true, // the Tailwind browser build styles the page
        webSecurity: true,
      },
    });
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return win;
  }

  // renderPdf writes the page and its files into a fresh folder, loads it, waits until the page is
  // styled (window.__rebReady) and prints it.
  async function renderPdf({ html, header, footer, margins, files }) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rebar-studio-'));
    try {
      for (const [name, bytes] of Object.entries(files || {})) {
        if (!PLAIN_NAME.test(name) || name === 'index.html') throw new Error(`refused file name: ${name}`);
        await fs.promises.writeFile(path.join(dir, name), Buffer.from(bytes));
      }
      const page = path.join(dir, 'index.html');
      await fs.promises.writeFile(page, html);
      renderDir = dir;
      const target = getWindow();
      await target.loadFile(page);
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const ready = await target.webContents.executeJavaScript('window.__rebReady === true').catch(() => false);
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const pdf = await target.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        pageSize: 'A4',
        margins: { top: margins.top, bottom: margins.bottom, left: margins.left, right: margins.right },
        displayHeaderFooter: Boolean(header || footer),
        headerTemplate: header || '<span></span>',
        footerTemplate: footer || '<span></span>',
      });
      return new Uint8Array(pdf);
    } finally {
      renderDir = null;
      fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  function destroy() {
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
  }

  return { renderPdf, destroy };
}

module.exports = { createRenderer };
