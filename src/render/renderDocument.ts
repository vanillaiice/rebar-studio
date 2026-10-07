// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The real-data pipeline: a document's answers, checked and computed by the engine
// (prepare: formulas, hidden fields dropped), rendered with the system values (spec 5.1) and its
// files named as the engine maps them, plus the template's images, the profile logo and fonts.

import { engine } from '../engine/client';
import type { Answers, FieldError } from '../engine/types';
import { assetIdsIn } from '../store/answers';
import { getAssets } from '../store/assets';
import type { Settings, StudioDocument, Template, TemplateVersion } from '../store/types';
import { assetRef } from '../store/types';
import { extensionFor } from './files';
import { fontFaceCss, fontFiles, fontsUsedBy } from './fonts';

export interface Rendered {
  html: string; // the rendered template
  files: Map<string, Blob>; // by the names the page uses
  fontCss: string;
  errors: FieldError[]; // what prepare refused (the document still renders without those answers)
  answers: Answers; // the answers as prepare returned them
}

export function systemValues(
  document: StudioDocument | null,
  template: Template,
  settings: Settings,
  logoName: string,
): Record<string, unknown> {
  return {
    ID: document?.id ?? '',
    Name: document?.title ?? template.name,
    Number: document?.number ?? 0,
    Reference: document?.reference ?? '',
    ProjectName: document?.project ?? '',
    ReporterName: settings.profile.authorName,
    TemplateName: template.name,
    CreatedAt: document?.createdAt ?? new Date().toISOString(),
    OrganizationName: settings.profile.organizationName,
    OrganizationLogo: logoName,
    Attachments: [],
    Photos: [],
  };
}

// templateFiles are the version's images by their file names.
export async function templateFiles(version: TemplateVersion): Promise<Map<string, Blob>> {
  const assets = await getAssets(Object.values(version.assets));
  const files = new Map<string, Blob>();
  for (const [name, id] of Object.entries(version.assets)) {
    const asset = assets.get(id);
    if (asset) files.set(name, asset.blob);
  }
  return files;
}

export async function withFonts(html: string, files: Map<string, Blob>): Promise<{ fontCss: string; files: Map<string, Blob> }> {
  const fonts = fontsUsedBy(html);
  if (fonts.length === 0) return { fontCss: '', files };
  const all = new Map(files);
  for (const [name, blob] of await fontFiles(fonts)) all.set(name, blob);
  return { fontCss: fontFaceCss(fonts), files: all };
}

export async function renderDocument(
  document: StudioDocument,
  version: TemplateVersion,
  template: Template,
  settings: Settings,
  answers: Answers = document.answers,
  fillable = false, // pdf-forms:boxes: fillable fields print as empty boxes, for a PDF form (reb spec 4.5)
): Promise<Rendered> {
  if (!version.compiled) throw new Error('the template version does not compile');
  const prepared = await engine.prepare(version.compiled.fields, answers);

  const files = await templateFiles(version);
  const ids = assetIdsIn(prepared.answers);
  const logoId = settings.profile.logoAssetId;
  const stored = await getAssets(logoId ? [...ids, logoId] : ids);
  const assets: Record<string, string> = {};
  for (const id of ids) {
    const asset = stored.get(id);
    if (!asset) continue;
    const name = `asset-${id}.${extensionFor(asset.mime, 'png')}`;
    assets[assetRef(id)] = name;
    files.set(name, asset.blob);
  }
  let logoName = '';
  const logo = logoId ? stored.get(logoId) : undefined;
  if (logo) {
    logoName = `organization-logo.${extensionFor(logo.mime, 'png')}`;
    files.set(logoName, logo.blob);
  }

  const result = await engine.render({
    html: version.compiled.html,
    system: systemValues(document, template, settings, logoName),
    answers: prepared.answers,
    assets,
    fields: version.compiled.fields,
    fillable,
  });
  if (!result.ok) throw new Error(result.error);
  const withFont = await withFonts(result.html, files);
  return { html: result.html, files: withFont.files, fontCss: withFont.fontCss, errors: prepared.errors, answers: prepared.answers };
}
