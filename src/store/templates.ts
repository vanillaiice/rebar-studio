// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Templates and their versions. Editing a template changes its current version in place while no
// document uses it; once one does, the edit creates the next version instead, so
// an autosave per keystroke never creates a version per keystroke and documents never change.

import type { CompileResult } from '../engine/types';
import { putAsset } from './assets';
import { db, newId, now } from './db';
import type { CompiledVersion, Template, TemplateVersion } from './types';

// Template images follow Rebar's rules, so a .rebpack made here imports there (spec section 5.2).
export const TEMPLATE_ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
export const MAX_TEMPLATE_ASSETS = 20;
export const MAX_TEMPLATE_ASSET_BYTES = 10 * 1024 * 1024;
const RESERVED_ASSET_NAMES = ['index.html', 'header.html', 'footer.html', 'tailwindcss.js'];

// A file name as templates write it: letters, digits, ".", "-" and "_" (others become "-").
export function templateAssetName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '-');
}

// Why a template image is refused, or null when it is accepted.
export function templateAssetProblem(name: string, size: number, existing: string[]): string | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!TEMPLATE_ASSET_EXTENSIONS.includes(extension)) return 'Template images must be PNG, JPEG or WebP.';
  if (RESERVED_ASSET_NAMES.includes(name) || name.startsWith('asset-') || name.startsWith('organization-logo')) {
    return `"${name}" is a reserved file name.`;
  }
  if (size > MAX_TEMPLATE_ASSET_BYTES) return 'Template images are limited to 10 MB.';
  if (!existing.includes(name) && existing.length >= MAX_TEMPLATE_ASSETS) {
    return `A template holds at most ${MAX_TEMPLATE_ASSETS} images.`;
  }
  return null;
}

export function compiledFrom(result: CompileResult): { compiled: CompiledVersion | null; compileError: string | null } {
  if (!result.ok) return { compiled: null, compileError: result.error };
  return {
    compiled: {
      html: result.htmlSource,
      schema: result.schema,
      fields: result.fields,
      engineVersion: result.engineVersion,
    },
    compileError: null,
  };
}

export async function listTemplates(options: { archived?: boolean } = {}): Promise<Template[]> {
  const all = await (await db()).getAll('templates');
  return all
    .filter((t) => (options.archived === undefined ? true : t.archived === options.archived))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  return (await db()).get('templates', id);
}

export async function getVersion(id: string): Promise<TemplateVersion | undefined> {
  return (await db()).get('versions', id);
}

export async function currentVersion(templateId: string): Promise<TemplateVersion> {
  const template = await getTemplate(templateId);
  if (!template) throw new Error('template not found');
  const version = await getVersion(template.currentVersionId);
  if (!version) throw new Error('template version not found');
  return version;
}

export async function versionsOf(templateId: string): Promise<TemplateVersion[]> {
  const versions = await (await db()).getAllFromIndex('versions', 'templateId', templateId);
  return versions.sort((a, b) => b.number - a.number);
}

export async function createTemplate(input: {
  name: string;
  source: string;
  result: CompileResult;
  description?: string;
  tags?: string[];
  assets?: Record<string, Blob>;
}): Promise<Template> {
  const templateId = newId();
  const assets: Record<string, string> = {};
  for (const [name, blob] of Object.entries(input.assets ?? {})) {
    assets[name] = (await putAsset(blob, { owner: templateId, kind: 'template', name })).id;
  }
  const time = now();
  const version: TemplateVersion = {
    id: newId(),
    templateId,
    number: 1,
    rebSource: input.source,
    ...compiledFrom(input.result),
    assets,
    createdAt: time,
    updatedAt: time,
    note: '',
  };
  const template: Template = {
    id: templateId,
    name: input.name.trim() || 'Untitled template',
    description: input.description ?? '',
    tags: input.tags ?? [],
    createdAt: time,
    updatedAt: time,
    currentVersionId: version.id,
    archived: false,
  };
  const tx = (await db()).transaction(['templates', 'versions'], 'readwrite');
  await tx.objectStore('versions').put(version);
  await tx.objectStore('templates').put(template);
  await tx.done;
  return template;
}

// editCurrentVersion applies a change to the template's current version, or to a new version when
// documents use the current one. Returns the version that was written.
async function editCurrentVersion(
  templateId: string,
  change: (version: TemplateVersion) => void,
): Promise<TemplateVersion> {
  const tx = (await db()).transaction(['templates', 'versions', 'documents'], 'readwrite');
  const templates = tx.objectStore('templates');
  const versions = tx.objectStore('versions');
  const template = await templates.get(templateId);
  if (!template) throw new Error('template not found');
  const current = await versions.get(template.currentVersionId);
  if (!current) throw new Error('template version not found');

  const time = now();
  const inUse = (await tx.objectStore('documents').index('templateVersionId').count(current.id)) > 0;
  let written: TemplateVersion;
  if (inUse) {
    const numbers = (await versions.index('templateId').getAll(templateId)).map((v) => v.number);
    written = {
      ...current,
      id: newId(),
      number: Math.max(...numbers) + 1,
      assets: { ...current.assets },
      createdAt: time,
      updatedAt: time,
      note: '',
    };
    template.currentVersionId = written.id;
  } else {
    written = current;
    written.updatedAt = time;
  }
  change(written);
  template.updatedAt = time;
  await versions.put(written);
  await templates.put(template);
  await tx.done;
  return written;
}

// saveSource stores edited source with its compile result. An unchanged source writes nothing.
export async function saveSource(templateId: string, source: string, result: CompileResult): Promise<TemplateVersion> {
  const current = await currentVersion(templateId);
  if (current.rebSource === source && (current.compiled !== null) === result.ok) return current;
  return editCurrentVersion(templateId, (version) => {
    version.rebSource = source;
    Object.assign(version, compiledFrom(result));
  });
}

export async function setTemplateAsset(templateId: string, name: string, blob: Blob): Promise<TemplateVersion> {
  const asset = await putAsset(blob, { owner: templateId, kind: 'template', name });
  return editCurrentVersion(templateId, (version) => {
    version.assets[name] = asset.id;
  });
}

export async function removeTemplateAsset(templateId: string, name: string): Promise<TemplateVersion> {
  return editCurrentVersion(templateId, (version) => {
    delete version.assets[name];
  });
}

export async function renameTemplateAsset(templateId: string, from: string, to: string): Promise<TemplateVersion> {
  return editCurrentVersion(templateId, (version) => {
    const id = version.assets[from];
    if (!id || from === to) return;
    delete version.assets[from];
    version.assets[to] = id;
  });
}

// restoreVersion makes an older version's content current again (as a new edit).
export async function restoreVersion(templateId: string, versionId: string): Promise<TemplateVersion> {
  const old = await getVersion(versionId);
  if (!old || old.templateId !== templateId) throw new Error('version not found');
  return editCurrentVersion(templateId, (version) => {
    version.rebSource = old.rebSource;
    version.compiled = old.compiled;
    version.compileError = old.compileError;
    version.assets = { ...old.assets };
    version.note = `Restored from v${old.number}`;
  });
}

export async function updateTemplate(
  id: string,
  change: Partial<Pick<Template, 'name' | 'description' | 'tags' | 'archived'>>,
): Promise<Template> {
  const database = await db();
  const template = await database.get('templates', id);
  if (!template) throw new Error('template not found');
  Object.assign(template, change, { updatedAt: now() });
  if (!template.name.trim()) template.name = 'Untitled template';
  await database.put('templates', template);
  return template;
}

// duplicateTemplate copies the current version (with copies of its images) into a new template.
export async function duplicateTemplate(id: string): Promise<Template> {
  const template = await getTemplate(id);
  if (!template) throw new Error('template not found');
  const version = await currentVersion(id);
  const database = await db();
  const assets: Record<string, Blob> = {};
  for (const [name, assetId] of Object.entries(version.assets)) {
    const asset = await database.get('assets', assetId);
    if (asset) assets[name] = asset.blob;
  }
  const copy = await createTemplate({
    name: `${template.name} (copy)`,
    source: version.rebSource,
    result: version.compiled
      ? { ok: true, schema: version.compiled.schema, fields: version.compiled.fields, htmlSource: version.compiled.html,
          previewHtml: '', warnings: [], engineVersion: version.compiled.engineVersion }
      : { ok: false, error: version.compileError ?? 'not compiled' },
    description: template.description,
    tags: [...template.tags],
    assets,
  });
  return copy;
}

export async function documentCount(templateId: string): Promise<number> {
  return (await db()).countFromIndex('documents', 'templateId', templateId);
}

// deleteTemplate removes a template, its versions, its images, and (when asked) its documents with
// their files. Without withDocuments it refuses while documents exist.
export async function deleteTemplate(id: string, withDocuments = false): Promise<void> {
  const database = await db();
  const documents = await database.getAllFromIndex('documents', 'templateId', id);
  if (documents.length > 0 && !withDocuments) throw new Error('this template has documents');
  const owners = [id, ...documents.map((d) => d.id)];
  const tx = database.transaction(['templates', 'versions', 'documents', 'assets'], 'readwrite');
  for (const key of await tx.objectStore('versions').index('templateId').getAllKeys(id)) {
    await tx.objectStore('versions').delete(key);
  }
  for (const document of documents) await tx.objectStore('documents').delete(document.id);
  for (const owner of owners) {
    for (const key of await tx.objectStore('assets').index('owner').getAllKeys(owner)) {
      await tx.objectStore('assets').delete(key);
    }
  }
  await tx.objectStore('templates').delete(id);
  await tx.done;
}
