// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// .rebpack: a template with its images, to share it or move it into Rebar. The same
// format Rebar reads and writes (rebar-on-rails app/operations/form_templates/rebpack.rb): a zip of
// manifest.json, template.reb and assets/<file name>, with the same limits and image rules.

import { engine } from '../engine/client';
import { getAssets } from '../store/assets';
import { createTemplate, templateAssetName, templateAssetProblem } from '../store/templates';
import type { Template, TemplateVersion } from '../store/types';
import { blobBytes, FormatError, json, plainName, readZip, text, writeZip } from './zip';

export const REBPACK_FORMAT_VERSION = 1;
const MAX_PACK_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_BYTES = 2_000_000;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export interface RebpackManifest {
  formatVersion: number;
  kind: 'rebpack';
  name: string;
  description?: string;
  tags?: string[];
  version?: string;
  engineVersion?: string;
  exportedAt?: string;
  generator?: string;
}

export interface RebpackContents {
  name: string;
  description: string;
  tags: string[];
  source: string;
  assets: Map<string, Blob>;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

export async function buildRebpack(template: Template, version: TemplateVersion): Promise<Uint8Array> {
  const manifest: RebpackManifest = {
    formatVersion: REBPACK_FORMAT_VERSION,
    kind: 'rebpack',
    name: template.name,
    description: template.description,
    tags: template.tags,
    version: `v${version.number}`,
    engineVersion: version.compiled?.engineVersion,
    exportedAt: new Date().toISOString(),
    generator: 'Rebar Studio',
  };
  const files: Record<string, Uint8Array | string> = {
    'manifest.json': JSON.stringify(manifest, null, 2),
    'template.reb': version.rebSource,
  };
  const assets = await getAssets(Object.values(version.assets));
  for (const [name, id] of Object.entries(version.assets)) {
    const asset = assets.get(id);
    if (asset) files[`assets/${name}`] = await blobBytes(asset.blob);
  }
  return writeZip(files);
}

export function readRebpack(bytes: Uint8Array, fileName = ''): RebpackContents {
  const entries = readZip(bytes, {
    maxArchiveBytes: MAX_PACK_BYTES,
    maxEntries: 64,
    maxEntryBytes: (name) => {
      if (name === 'manifest.json') return 64 * 1024;
      if (name === 'template.reb') return MAX_SOURCE_BYTES;
      if (/^assets\/[^/]+$/.test(name)) return MAX_ASSET_BYTES;
      return 0;
    },
  });
  const manifestBytes = entries.get('manifest.json');
  const manifest = manifestBytes ? json<RebpackManifest>(manifestBytes, 'manifest') : null;
  if (manifest && (typeof manifest !== 'object' || !(manifest.formatVersion >= 1 && manifest.formatVersion <= REBPACK_FORMAT_VERSION))) {
    throw new FormatError('This .rebpack was made by a newer version, or is not a .rebpack.');
  }
  const source = text(entries.get('template.reb'));
  if (!source?.trim()) throw new FormatError('The .rebpack has no template.');

  const assets = new Map<string, Blob>();
  for (const [entry, data] of entries) {
    if (!entry.startsWith('assets/')) continue;
    const name = entry.slice('assets/'.length);
    if (!plainName(name) || templateAssetName(name) !== name) throw new FormatError(`"${name}" is not a valid image name.`);
    const problem = templateAssetProblem(name, data.byteLength, [...assets.keys()]);
    if (problem) throw new FormatError(problem);
    const extension = name.split('.').pop()!.toLowerCase();
    assets.set(name, new Blob([data as BlobPart], { type: MIME[extension] }));
  }

  const fallback = fileName.replace(/\.[^.]+$/, '').trim();
  return {
    name: String(manifest?.name ?? '').trim().slice(0, 255) || fallback || 'Imported template',
    description: typeof manifest?.description === 'string' ? manifest.description : '',
    tags: Array.isArray(manifest?.tags) ? manifest.tags.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
    source,
    assets,
  };
}

export async function importRebpack(bytes: Uint8Array, fileName: string): Promise<Template> {
  const contents = readRebpack(bytes, fileName);
  return createTemplate({
    name: contents.name,
    description: contents.description,
    tags: contents.tags,
    source: contents.source,
    result: await engine.compile(contents.source),
    assets: Object.fromEntries(contents.assets),
  });
}

// importReb makes a template from a bare .reb file.
export async function importReb(source: string, fileName: string): Promise<Template> {
  if (source.length > MAX_SOURCE_BYTES) throw new FormatError('The template is too large.');
  return createTemplate({
    name: fileName.replace(/\.[^.]+$/, '') || 'Imported template',
    source,
    result: await engine.compile(source),
  });
}
