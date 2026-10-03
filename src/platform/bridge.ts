// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// What the app asks of its shell. The desktop app's preload (electron/preload.cjs) exposes
// window.rebarStudio; in a browser the same calls fall back to downloads and file inputs.

export interface PdfRequest {
  html: string;
  header: string;
  footer: string;
  margins: { top: number; bottom: number; left: number; right: number };
  files: Record<string, Uint8Array>; // written next to the page
}

export interface SaveRequest {
  name: string;
  bytes: Uint8Array;
  filters?: { name: string; extensions: string[] }[];
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error' | 'unsupported';
  version?: string;
  message?: string;
  percent?: number;
}

interface DesktopBridge {
  renderPdf(request: PdfRequest): Promise<Uint8Array>;
  saveFile(request: SaveRequest): Promise<boolean>;
  saveFiles(files: { name: string; bytes: Uint8Array }[]): Promise<{ folder: string; count: number } | null>;
  onOpenFile(callback: (file: OpenedFile) => void): () => void;
  getVersion(): Promise<string>;
  checkForUpdates(channel: 'stable' | 'beta'): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
}

export const desktop: DesktopBridge | null =
  (window as unknown as { rebarStudio?: DesktopBridge }).rebarStudio ?? null;

export const IS_DESKTOP = desktop !== null;

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// saveFile asks where to save on the desktop and downloads in a browser. False when cancelled.
export async function saveFile(request: SaveRequest & { type?: string }): Promise<boolean> {
  if (desktop) return desktop.saveFile(request);
  download(request.name, new Blob([request.bytes as BlobPart], { type: request.type ?? 'application/octet-stream' }));
  return true;
}

// saveFiles writes several files into a folder the user picks (desktop); a browser gets one zip.
export async function saveFiles(files: { name: string; bytes: Uint8Array }[], zipName: string): Promise<boolean> {
  if (desktop) return (await desktop.saveFiles(files)) !== null;
  const { zipSync } = await import('fflate');
  const zipped = zipSync(Object.fromEntries(files.map((f) => [f.name, f.bytes])), { level: 0 });
  download(zipName, new Blob([zipped as BlobPart], { type: 'application/zip' }));
  return true;
}

// openFiles shows the platform's file picker (a file input works in both shells).
export function openFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

// A name safe on every file system.
export function safeFileName(name: string): string {
  const visible = Array.from(name, (c) => (c.charCodeAt(0) < 32 ? '-' : c)).join('');
  return visible.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'file';
}
