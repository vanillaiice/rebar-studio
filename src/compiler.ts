// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs — Rebar Studio (.reb template editor)

// Shared types and helpers for the .reb editor.
//
// The actual compilation/rendering is performed by the real Go pipeline compiled
// to WebAssembly (see wasm.ts) so previews match the API/PDF backend exactly.
// Only paper-size extraction stays here, since it is an editor-only concern
// (the preview canvas sizing) and never reaches the backend.

export interface RebFieldSchema {
  key: string;
  type: string;
  label: string;
  options?: string[];
}

export interface CompilationResult {
  schema: RebFieldSchema[];
  htmlSource: string; // Go template code for the backend
  previewHtml: string; // Executed HTML for the live editor preview
  paperWidth: string;
  paperHeight: string;
  execError?: string; // non-fatal template execution error, if any
}

// parsePaperSize reads a CSS `@page { size: ... }` rule to size the preview
// canvas. Defaults to A4 portrait when no rule is present.
export function parsePaperSize(raw: string): { paperWidth: string; paperHeight: string } {
  let paperWidth = '210mm';
  let paperHeight = '297mm';

  const pageMatch = raw.match(/@page\s*\{[^}]*size:\s*([^;}]+)/i);
  if (pageMatch) {
    const size = pageMatch[1].trim().toLowerCase();
    if (size.includes('a4 landscape')) {
      paperWidth = '297mm';
      paperHeight = '210mm';
    } else if (size.includes('a4')) {
      paperWidth = '210mm';
      paperHeight = '297mm';
    } else if (size.includes('a3 landscape')) {
      paperWidth = '420mm';
      paperHeight = '297mm';
    } else if (size.includes('a3')) {
      paperWidth = '297mm';
      paperHeight = '420mm';
    } else if (size.includes('letter landscape')) {
      paperWidth = '11in';
      paperHeight = '8.5in';
    } else if (size.includes('letter')) {
      paperWidth = '8.5in';
      paperHeight = '11in';
    } else if (size.split(/\s+/).length === 2) {
      const parts = size.split(/\s+/);
      if (!isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
        paperWidth = parts[0];
        paperHeight = parts[1];
      }
    }
  }

  return { paperWidth, paperHeight };
}
