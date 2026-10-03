// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// .rebbackup: the whole workspace (plan D4), to keep a copy or move to another machine. Browser
// storage can be evicted, so Studio reminds people to make one.
//
//   manifest.json     format version, counts
//   data.json         templates, versions, documents, settings
//   assets.json       every file's details
//   assets/<id>       every file's bytes

import { db } from '../store/db';
import { updateSettings } from '../store/settings';
import type { Asset, Settings, StudioDocument, Template, TemplateVersion } from '../store/types';
import { blobBytes, FormatError, json, plainName, readZip, writeZip } from './zip';

export const BACKUP_FORMAT_VERSION = 1;

interface BackupData {
  templates: Template[];
  versions: TemplateVersion[];
  documents: StudioDocument[];
  settings: Settings | null;
}

type AssetInfo = Omit<Asset, 'blob'>;

export async function buildBackup(): Promise<Uint8Array> {
  const database = await db();
  const data: BackupData = {
    templates: await database.getAll('templates'),
    versions: await database.getAll('versions'),
    documents: await database.getAll('documents'),
    settings: (await database.get('settings', 'settings')) ?? null,
  };
  const assets = await database.getAll('assets');
  const files: Record<string, Uint8Array | string> = {
    'manifest.json': JSON.stringify({
      formatVersion: BACKUP_FORMAT_VERSION,
      kind: 'rebbackup',
      generator: 'Rebar Studio',
      exportedAt: new Date().toISOString(),
      counts: { templates: data.templates.length, documents: data.documents.length, files: assets.length },
    }, null, 2),
    'data.json': JSON.stringify(data),
    'assets.json': JSON.stringify(assets.map((asset): AssetInfo => {
      const info: Partial<Asset> = { ...asset };
      delete info.blob;
      return info as AssetInfo;
    })),
  };
  for (const asset of assets) files[`assets/${asset.id}`] = await blobBytes(asset.blob);
  return writeZip(files);
}

// markBackedUp records the time of the last backup (for the reminder).
export async function markBackedUp(): Promise<void> {
  await updateSettings((settings) => {
    settings.lastBackupAt = new Date().toISOString();
  });
}

// restoreBackup replaces the whole workspace with the backup's.
export async function restoreBackup(bytes: Uint8Array): Promise<{ templates: number; documents: number }> {
  const entries = readZip(bytes, {
    maxArchiveBytes: 4 * 1024 * 1024 * 1024,
    maxEntries: 200_000,
    maxEntryBytes: (name) => {
      if (name === 'manifest.json') return 64 * 1024;
      if (name === 'data.json' || name === 'assets.json') return 512 * 1024 * 1024;
      if (/^assets\/[^/]+$/.test(name)) return 512 * 1024 * 1024;
      return 0;
    },
  });
  const manifest = json<{ kind?: string; formatVersion?: number }>(entries.get('manifest.json'), 'manifest');
  if (manifest.kind !== 'rebbackup' || !(Number(manifest.formatVersion) >= 1 && Number(manifest.formatVersion) <= BACKUP_FORMAT_VERSION)) {
    throw new FormatError('This is not a .rebbackup, or it was made by a newer version.');
  }
  const data = json<BackupData>(entries.get('data.json'), 'workspace data');
  const infos = json<AssetInfo[]>(entries.get('assets.json'), 'file list');
  if (!Array.isArray(data.templates) || !Array.isArray(data.versions) || !Array.isArray(data.documents) || !Array.isArray(infos)) {
    throw new FormatError('The backup is damaged.');
  }

  const database = await db();
  const tx = database.transaction(['templates', 'versions', 'documents', 'assets', 'settings'], 'readwrite');
  await Promise.all(['templates', 'versions', 'documents', 'assets', 'settings'].map((store) => tx.objectStore(store as 'templates').clear()));
  for (const template of data.templates) await tx.objectStore('templates').put(template);
  for (const version of data.versions) await tx.objectStore('versions').put(version);
  for (const document of data.documents) await tx.objectStore('documents').put(document);
  for (const info of infos) {
    const bytesOfAsset = plainName(info.id) ? entries.get(`assets/${info.id}`) : undefined;
    if (!bytesOfAsset) continue;
    await tx.objectStore('assets').put({ ...info, blob: new Blob([bytesOfAsset as BlobPart], { type: info.mime }) });
  }
  if (data.settings) await tx.objectStore('settings').put(data.settings, 'settings');
  await tx.done;
  return { templates: data.templates.length, documents: data.documents.length };
}
