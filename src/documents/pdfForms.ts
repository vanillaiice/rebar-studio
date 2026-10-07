// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Fillable PDFs (reb spec 4.5, experimental); ../docs/pdf-forms.md in the Rebar folder says how to
// remove them. Two parts, tagged in the code:
//
// - pdf-forms:boxes: the template's fillable fields print as empty boxes when a document is switched
//   to Fillable, to fill in by hand. Pure HTML.
// - pdf-forms:fields: those boxes become PDF text fields (rebpdf.wasm, pdfcpu), and a filled PDF's
//   answers can be imported. Off when PDF_FORMS is false: the switch then exports the boxes only.
//
// Below: taking answers back from a filled PDF form. The engine reads the template's fillable fields;
// this lists what would change, for the person to confirm before the answers are replaced.

import type { Answers, Field } from '../engine/types';

// PDF_FORMS turns the pdf-forms:fields part on.
export const PDF_FORMS = true;

export interface ImportedChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

// importedChanges lists the fillable fields whose answer the PDF changes, in the form's order.
export function importedChanges(fields: Field[], current: Answers, imported: Answers): ImportedChange[] {
  const changes: ImportedChange[] = [];
  for (const field of fields) {
    if (!field.fillable || !(field.key in imported)) continue;
    const before = asText(current[field.key]);
    const after = asText(imported[field.key]);
    if (before.trim() !== after.trim()) changes.push({ key: field.key, label: field.label || field.key, before, after });
  }
  return changes;
}

// withImported is the answers with the changes applied.
export function withImported(current: Answers, changes: ImportedChange[]): Answers {
  const next: Answers = { ...current };
  for (const change of changes) next[change.key] = change.after;
  return next;
}
