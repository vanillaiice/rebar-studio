// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Files a rendered page refers to by bare name. The desktop app writes them next to the page; a
// browser frame cannot reach them, so they are inlined as data: URLs there.

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// inlineFiles replaces references to the files by their URLs: src/href/poster attributes and CSS
// url() values that name a file exactly.
export function inlineFiles(html: string, urls: Map<string, string>): string {
  let out = html;
  for (const [name, url] of urls) {
    const quoted = escapeRegExp(name);
    out = out
      .replace(new RegExp(`(\\b(?:src|href|poster)\\s*=\\s*)(["'])${quoted}\\2`, 'g'), (_, attr: string, q: string) => `${attr}${q}${url}${q}`)
      .replace(new RegExp(`url\\(\\s*(["']?)${quoted}\\1\\s*\\)`, 'g'), () => `url("${url}")`);
  }
  return out;
}

export async function dataUrls(files: Map<string, Blob>): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const [name, blob] of files) urls.set(name, await blobToDataUrl(blob));
  return urls;
}

export async function fileBytes(files: Map<string, Blob>): Promise<Record<string, Uint8Array>> {
  const bytes: Record<string, Uint8Array> = {};
  for (const [name, blob] of files) bytes[name] = new Uint8Array(await blob.arrayBuffer());
  return bytes;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

export function extensionFor(mime: string, fallback = 'bin'): string {
  return EXTENSIONS[mime] ?? fallback;
}
