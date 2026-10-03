// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// .rebdoc: one filled document, self-contained and re-renderable (plan D4): the exact template
// version it was filled from, its answers, its files, the template's images and, for a final
// document, its PDF.
//
//   manifest.json          format and engine versions, the document's details, its files
//   template.reb           the template version's source
//   template-assets/<f>    the template's images
//   answers.json           the answers; files referenced as "asset:<id>"
//   assets/<id>.<ext>      the document's photos and signatures
//   document.pdf           the final PDF (final documents)

import { engine } from '../engine/client';
import { assetIdsIn, mapAssetRefs } from '../store/answers';
import { getAssets, putAsset } from '../store/assets';
import { db, newId, now } from '../store/db';
import { createTemplate, templateAssetName, templateAssetProblem } from '../store/templates';
import type { AssetKind, StudioDocument, Template, TemplateVersion } from '../store/types';
import { assetRef } from '../store/types';
import { extensionFor } from '../render/files';
import { blobBytes, FormatError, json, plainName, readZip, text, writeZip } from './zip';

export const REBDOC_FORMAT_VERSION = 1;

interface RebdocManifest {
  formatVersion: number;
  kind: 'rebdoc';
  generator: string;
  exportedAt: string;
  engineVersion: string;
  template: { name: string; description: string; tags: string[]; version: number };
  document: Pick<
    StudioDocument,
    'id' | 'title' | 'number' | 'reference' | 'project' | 'status' | 'createdAt' | 'updatedAt' | 'finalizedAt' | 'pdfHash' | 'revision' | 'log'
  >;
  assets: Record<string, { file: string; mime: string; kind: AssetKind; name: string; width?: number; height?: number }>;
}

export async function buildRebdoc(document: StudioDocument, version: TemplateVersion, template: Template): Promise<Uint8Array> {
  const ids = assetIdsIn(document.answers);
  const stored = await getAssets(document.pdfAssetId ? [...ids, document.pdfAssetId] : ids);
  const files: Record<string, Uint8Array | string> = {
    'template.reb': version.rebSource,
    'answers.json': JSON.stringify(document.answers, null, 2),
  };
  const assets: RebdocManifest['assets'] = {};
  for (const id of ids) {
    const asset = stored.get(id);
    if (!asset) continue;
    const file = `assets/${id}.${extensionFor(asset.mime)}`;
    files[file] = await blobBytes(asset.blob);
    assets[id] = { file, mime: asset.mime, kind: asset.kind, name: asset.name, width: asset.width, height: asset.height };
  }
  const templateAssets = await getAssets(Object.values(version.assets));
  for (const [name, id] of Object.entries(version.assets)) {
    const asset = templateAssets.get(id);
    if (asset) files[`template-assets/${name}`] = await blobBytes(asset.blob);
  }
  const pdf = document.pdfAssetId ? stored.get(document.pdfAssetId) : undefined;
  if (pdf) files['document.pdf'] = await blobBytes(pdf.blob);

  const manifest: RebdocManifest = {
    formatVersion: REBDOC_FORMAT_VERSION,
    kind: 'rebdoc',
    generator: 'Rebar Studio',
    exportedAt: now(),
    engineVersion: version.compiled?.engineVersion ?? '',
    template: { name: template.name, description: template.description, tags: template.tags, version: version.number },
    document: {
      id: document.id,
      title: document.title,
      number: document.number,
      reference: document.reference,
      project: document.project,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      finalizedAt: document.finalizedAt,
      pdfHash: document.pdfHash,
      revision: document.revision,
      log: document.log,
    },
    assets,
  };
  files['manifest.json'] = JSON.stringify(manifest, null, 2);
  return writeZip(files);
}

const MAX_ASSET = 25 * 1024 * 1024;

export async function importRebdoc(bytes: Uint8Array): Promise<StudioDocument> {
  const entries = readZip(bytes, {
    maxArchiveBytes: 500 * 1024 * 1024,
    maxEntries: 2000,
    maxEntryBytes: (name) => {
      if (name === 'manifest.json') return 2 * 1024 * 1024;
      if (name === 'template.reb') return 2_000_000;
      if (name === 'answers.json') return 20 * 1024 * 1024;
      if (name === 'document.pdf') return 200 * 1024 * 1024;
      if (/^(assets|template-assets)\/[^/]+$/.test(name)) return MAX_ASSET;
      return 0;
    },
  });
  const manifest = json<RebdocManifest>(entries.get('manifest.json'), 'manifest');
  if (manifest?.kind !== 'rebdoc' || !(manifest.formatVersion >= 1 && manifest.formatVersion <= REBDOC_FORMAT_VERSION)) {
    throw new FormatError('This is not a .rebdoc, or it was made by a newer version.');
  }
  const source = text(entries.get('template.reb'));
  if (!source) throw new FormatError('The .rebdoc has no template.');
  const answers = json<Record<string, unknown>>(entries.get('answers.json'), 'answers');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new FormatError('The answers are not valid.');

  const versionId = await templateVersionFor(source, manifest, entries);
  const database = await db();
  const documentId = manifest.document?.id && !(await database.get('documents', manifest.document.id)) ? manifest.document.id : newId();

  const mapped = new Map<string, string>();
  for (const [oldId, info] of Object.entries(manifest.assets ?? {})) {
    const data = entries.get(info.file);
    if (!data || !info.file.startsWith('assets/') || !plainName(info.file.slice('assets/'.length))) continue;
    const asset = await putAsset(new Blob([data as BlobPart], { type: info.mime }), {
      owner: documentId, kind: info.kind, name: info.name, width: info.width, height: info.height,
    });
    mapped.set(oldId, asset.id);
  }
  // References to files the archive does not hold are dropped.
  const clean = mapAssetRefs(answers, (id) => (mapped.has(id) ? assetRef(mapped.get(id)!) : '')) as Record<string, unknown>;

  const meta = manifest.document;
  const version = await database.get('versions', versionId);
  const pdfData = entries.get('document.pdf');
  const final = meta.status === 'final' && pdfData !== undefined;
  const pdf = final ? await putAsset(new Blob([pdfData as BlobPart], { type: 'application/pdf' }), { owner: documentId, kind: 'pdf', name: 'document.pdf' }) : null;
  const time = now();
  const document: StudioDocument = {
    id: documentId,
    templateId: version!.templateId,
    templateVersionId: versionId,
    title: String(meta.title ?? 'Imported document'),
    number: Number(meta.number) || 0,
    reference: String(meta.reference ?? ''),
    project: String(meta.project ?? ''),
    status: final ? 'final' : 'draft',
    answers: clean,
    createdAt: meta.createdAt ?? time,
    updatedAt: time,
    finalizedAt: final ? meta.finalizedAt : null,
    pdfHash: final ? meta.pdfHash : null,
    pdfAssetId: pdf?.id ?? null,
    revisionOf: null,
    revision: Number(meta.revision) || 1,
    log: [...(Array.isArray(meta.log) ? meta.log : []), { at: time, action: 'imported' }],
  };
  await database.put('documents', document);
  return document;
}

// templateVersionFor finds a stored version with the same source and images, or creates a template
// for the document's version.
async function templateVersionFor(source: string, manifest: RebdocManifest, entries: Map<string, Uint8Array>): Promise<string> {
  const images = new Map<string, Blob>();
  for (const [entry, data] of entries) {
    if (!entry.startsWith('template-assets/')) continue;
    const name = entry.slice('template-assets/'.length);
    if (!plainName(name) || templateAssetName(name) !== name || templateAssetProblem(name, data.byteLength, [...images.keys()])) continue;
    images.set(name, new Blob([data as BlobPart]));
  }
  const database = await db();
  for (const version of await database.getAll('versions')) {
    const sameImages = Object.keys(version.assets).sort().join('|') === [...images.keys()].sort().join('|');
    if (version.rebSource === source && version.compiled && sameImages) return version.id;
  }
  const template = await createTemplate({
    name: manifest.template?.name ?? 'Imported template',
    description: manifest.template?.description ?? '',
    tags: Array.isArray(manifest.template?.tags) ? manifest.template.tags : [],
    source,
    result: await engine.compile(source),
    assets: Object.fromEntries(images),
  });
  const version = await database.get('templates', template.id);
  return version!.currentVersionId;
}
