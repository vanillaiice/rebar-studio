// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs — Rebar Studio (Electron preload)
//
// The only bridge between the editor page and the main process. The page runs without Node
// access (contextIsolation, sandbox), so an imported .reb template cannot reach the file system
// or run programs; it can only ask the main process to render or save a PDF.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rebarStudio', {
  renderPdf: (payload) => ipcRenderer.invoke('render-pdf', payload),
  savePdf: (bytes) => ipcRenderer.invoke('save-pdf', bytes),
});
