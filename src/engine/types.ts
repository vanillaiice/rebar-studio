// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The reb engine's JSON contract (reb docs/specification.md section 8), as the WebAssembly build
// returns it. Studio reads the normalized schema (`fields`) and never parses options itself.

export type FieldKind =
  | 'section'
  | 'text'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'images'
  | 'signature'
  | 'table';

export type ColumnKind =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'image'
  | 'signature'
  | 'formula'
  | 'autoincrement';

export interface Column {
  key: string;
  kind: ColumnKind;
  label: string;
  options?: string[];
  expression?: string;
  precision?: number;
}

export interface Field {
  key: string;
  type: string; // as declared ("radio" and "select" share the select kind)
  kind: FieldKind;
  label: string;
  options?: string[];
  columns?: Column[];
  maxLength?: number;
  required?: boolean;
  help?: string;
  placeholder?: string;
  default?: string;
  min?: string;
  max?: string;
  step?: string;
  pattern?: string;
  showIf?: string;
  fillable?: boolean; // pdf-forms:boxes: typed into a PDF text field when the document is rendered fillable (spec 4.5)
}

export interface Schema {
  schemaVersion: number;
  fields: Field[];
}

// A coded message: consumers word it themselves from the code and params.
export interface Diagnostic {
  code: string;
  params?: Record<string, string>;
  message: string;
}

export interface CompiledTemplate {
  ok: true;
  schema: unknown[]; // the raw schema (version 1), kept for older consumers
  fields: Schema;
  htmlSource: string; // the Go template documents render with
  previewHtml: string; // the template rendered with sample answers
  warnings: Diagnostic[];
  engineVersion: string;
  execError?: string; // the sample render failed; previewHtml is the bare compiled HTML
}

export interface CompileFailure {
  ok: false;
  error: string;
  code?: string;
  params?: Record<string, string>;
}

export type CompileResult = CompiledTemplate | CompileFailure;

export type Answers = Record<string, unknown>;

export interface FieldError {
  key: string;
  code: string;
  params?: Record<string, unknown>;
}

// Answers cleaned by the engine: unknown keys and hidden fields dropped, formula and row-number
// cells computed.
export interface Prepared {
  answers: Answers;
  errors: FieldError[];
}

export interface RenderInput {
  html: string;
  system: Record<string, unknown>;
  answers: Answers;
  assets: Record<string, string>; // answer reference ("asset:<id>") -> file name
  fields?: Schema;
  fillable?: boolean; // pdf-forms:boxes: fillable fields print as empty boxes, for a PDF form
}

export type RenderResult = { ok: true; html: string } | { ok: false; error: string };
