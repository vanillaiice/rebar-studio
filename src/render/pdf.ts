// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Printing a rendered page to PDF in the desktop app, with Rebar's PDF parameters (document.ts).

import { desktop } from '../platform/bridge';
import { engineAssetUrl, pdfDocument } from './document';
import { fileBytes } from './files';

let tailwindBytes: Promise<Uint8Array> | null = null;
function tailwindSource(): Promise<Uint8Array> {
  tailwindBytes ??= fetch(engineAssetUrl('tailwindcss.js'))
    .then((r) => r.arrayBuffer())
    .then((b) => new Uint8Array(b));
  return tailwindBytes;
}

// renderPdf prints a rendered page in the desktop app.
export async function renderPdf(html: string, files: Map<string, Blob>, fontCss: string): Promise<Uint8Array> {
  if (!desktop) throw new Error('PDF rendering needs the desktop app');
  const page = pdfDocument(html, fontCss);
  const bytes = await fileBytes(files);
  if (page.tailwind) bytes['tailwindcss.js'] = await tailwindSource();
  return new Uint8Array(
    await desktop.renderPdf({ html: page.html, header: page.header, footer: page.footer, margins: page.margins, files: bytes }),
  );
}

