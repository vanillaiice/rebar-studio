// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// What a document becomes outside Studio: its final rendition (the PDF in the desktop app; in a
// browser, which can make a PDF only through its print dialog, a self-contained HTML page), PDF
// files named by the settings' pattern, and the register of a template's answers (CSV or JSON).

import { engine } from '../engine/client';
import type { Field } from '../engine/types';
import { getAsset, sha256 } from '../store/assets';
import { getSettings } from '../store/settings';
import { getTemplate, getVersion } from '../store/templates';
import type { Settings, StudioDocument, Template, TemplateVersion } from '../store/types';
import { assetIdOf } from '../store/types';
import { PDF_FORMS } from '../documents/pdfForms'; // pdf-forms
import { IS_DESKTOP, safeFileName } from '../platform/bridge';
import { engineAssetUrl, pagedDocument } from './document';
import { dataUrls, inlineFiles } from './files';
import { renderPdf } from './pdf';
import { renderDocument } from './renderDocument';

export interface Rendition {
  blob: Blob;
  hash: string;
}

async function text(url: string): Promise<string> {
  return (await fetch(url)).text();
}

export async function context(document: StudioDocument): Promise<{ version: TemplateVersion; template: Template; settings: Settings }> {
  const version = await getVersion(document.templateVersionId);
  const template = await getTemplate(document.templateId);
  if (!version || !template) throw new Error('the document\'s template is missing');
  return { version, template, settings: await getSettings() };
}

// htmlRendition is a page that paginates itself with no other file: scripts and files inlined.
export async function htmlRendition(document: StudioDocument): Promise<Blob> {
  const { version, template, settings } = await context(document);
  const rendered = await renderDocument(document, version, template, settings);
  const page = pagedDocument(rendered.html, {
    tailwindUrl: '',
    pagedUrl: '',
    fontCss: rendered.fontCss,
    inline: { tailwind: await text(engineAssetUrl('tailwindcss.js')), paged: await text(engineAssetUrl('paged.polyfill.js')) },
  });
  return new Blob([inlineFiles(page, await dataUrls(rendered.files))], { type: 'text/html' });
}

// pdf-forms:boxes, pdf-forms:fields
// fillablePdfOf is the document as a PDF form (desktop): its fillable fields as text fields,
// pre-filled with their answers, everything else printed with its answers. Without PDF_FORMS, the
// fields stay empty boxes to fill in by hand.
export async function fillablePdfOf(document: StudioDocument): Promise<Uint8Array> {
  const { version, template, settings } = await context(document);
  const rendered = await renderDocument(document, version, template, settings, document.answers, true);
  const printed = await renderPdf(rendered.html, rendered.files, rendered.fontCss);
  return PDF_FORMS ? engine.fillable(printed, rendered.answers) : printed;
}

export async function pdfOf(document: StudioDocument): Promise<Uint8Array> {
  if (document.pdfAssetId) {
    const stored = await getAsset(document.pdfAssetId);
    if (stored?.mime === 'application/pdf') return new Uint8Array(await stored.blob.arrayBuffer());
  }
  const { version, template, settings } = await context(document);
  const rendered = await renderDocument(document, version, template, settings);
  return renderPdf(rendered.html, rendered.files, rendered.fontCss);
}

// finalRendition renders what a final document keeps: its PDF (desktop) or HTML page (browser).
export async function finalRendition(document: StudioDocument): Promise<Rendition> {
  const blob = IS_DESKTOP
    ? new Blob([(await pdfOf(document)) as BlobPart], { type: 'application/pdf' })
    : await htmlRendition(document);
  return { blob, hash: await sha256(blob) };
}

// fileName applies the settings' pattern: {template}, {title}, {reference}, {number}, {date}, {status}.
export function fileName(pattern: string, document: StudioDocument, template: Template, extension: string): string {
  const values: Record<string, string> = {
    template: template.name,
    title: document.title,
    reference: document.reference,
    number: String(document.number),
    date: document.createdAt.slice(0, 10),
    status: document.status,
  };
  const name = pattern.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  return `${safeFileName(name)}.${extension}`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  // A leading =, +, - or @ makes spreadsheets run the cell as a formula: quote it as text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function exportValue(field: Field, value: unknown): unknown {
  if (field.kind === 'images') return Array.isArray(value) ? `${value.length} file${value.length === 1 ? '' : 's'}` : '';
  if (field.kind === 'signature') return assetIdOf(value) ? 'signed' : '';
  if (field.kind === 'table' && Array.isArray(value)) {
    return value.map((row) =>
      Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([k, v]) => [k, assetIdOf(v) ? 'file' : v])),
    );
  }
  return value;
}

// register lists the documents of one template with their answers, as the engine cleans them
// (formulas computed, hidden fields empty). Fields are those of the template's current version.
export async function register(documents: StudioDocument[], template: Template, format: 'csv' | 'json'): Promise<string> {
  const current = await getVersion(template.currentVersionId);
  const fields = (current?.compiled?.fields.fields ?? []).filter((f) => f.kind !== 'section');
  const rows: Record<string, unknown>[] = [];
  for (const document of documents) {
    const version = await getVersion(document.templateVersionId);
    const prepared: { answers: Record<string, unknown> } = version?.compiled
      ? await engine.prepare(version.compiled.fields, document.answers)
      : { answers: {} };
    const row: Record<string, unknown> = {
      reference: document.reference,
      title: document.title,
      project: document.project,
      status: document.status,
      template_version: version?.number ?? '',
      created_at: document.createdAt,
      finalized_at: document.finalizedAt ?? '',
    };
    for (const field of fields) row[field.key] = exportValue(field, prepared.answers[field.key]);
    rows.push(row);
  }
  if (format === 'json') return JSON.stringify(rows, null, 2);
  const keys = ['reference', 'title', 'project', 'status', 'template_version', 'created_at', 'finalized_at', ...fields.map((f) => f.key)];
  const header = ['Reference', 'Title', 'Project', 'Status', 'Template version', 'Created', 'Finalized', ...fields.map((f) => f.label || f.key)];
  return [header.map(csvCell).join(','), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))].join('\r\n') + '\r\n';
}
