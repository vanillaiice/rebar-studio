// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Files: template images, photos, signatures, the profile logo and final PDFs, stored as Blobs.

import { db, newId, now } from './db';
import type { Asset, AssetKind } from './types';

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function putAsset(
  blob: Blob,
  meta: { owner: string; kind: AssetKind; name: string; width?: number; height?: number },
): Promise<Asset> {
  const asset: Asset = {
    id: newId(),
    ...meta,
    mime: blob.type || 'application/octet-stream',
    blob,
    size: blob.size,
    sha256: await sha256(blob),
    createdAt: now(),
  };
  await (await db()).put('assets', asset);
  return asset;
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  return (await db()).get('assets', id);
}

export async function getAssets(ids: string[]): Promise<Map<string, Asset>> {
  const database = await db();
  const found = new Map<string, Asset>();
  for (const id of new Set(ids)) {
    const asset = await database.get('assets', id);
    if (asset) found.set(id, asset);
  }
  return found;
}

export async function assetsOwnedBy(owner: string): Promise<Asset[]> {
  return (await db()).getAllFromIndex('assets', 'owner', owner);
}

export async function deleteAsset(id: string): Promise<void> {
  await (await db()).delete('assets', id);
}

export async function deleteAssetsOwnedBy(owner: string, keep: Set<string> = new Set()): Promise<void> {
  const database = await db();
  const tx = database.transaction('assets', 'readwrite');
  for (const key of await tx.store.index('owner').getAllKeys(owner)) {
    if (!keep.has(key)) await tx.store.delete(key);
  }
  await tx.done;
}

// Bytes used by every stored file.
export async function assetUsage(): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  let cursor = await (await db()).transaction('assets').store.openCursor();
  while (cursor) {
    count++;
    bytes += cursor.value.size;
    cursor = await cursor.continue();
  }
  return { count, bytes };
}
