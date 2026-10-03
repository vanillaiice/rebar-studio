// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// The only bridge between the app page and the main process (src/platform/bridge.ts describes it).
// The page runs without Node (contextIsolation, sandbox), so an imported template cannot reach the
// file system or run programs: it can only ask for these calls.
const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('rebarStudio', {
  renderPdf: (request) => ipcRenderer.invoke('render-pdf', request),
  saveFile: (request) => ipcRenderer.invoke('save-file', request),
  saveFiles: (files) => ipcRenderer.invoke('save-files', files),
  onOpenFile: (callback) => {
    const stop = listen('open-file', callback);
    ipcRenderer.send('renderer-ready');
    return stop;
  },
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdates: (channel) => ipcRenderer.invoke('check-updates', channel),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => listen('update-status', callback),
});
