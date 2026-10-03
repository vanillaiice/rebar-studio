// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// How a form stores and shows files. A document keeps them as assets ("asset:<id>"); the editor's
// form preview keeps them in memory only.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getAssets, putAsset } from '../store/assets';
import { assetIdOf, assetRef } from '../store/types';

export interface FileSupport {
  url(ref: unknown): string | undefined;
  add(blob: Blob, kind: 'photo' | 'signature', meta: { name: string; width?: number; height?: number }): Promise<string>;
  createdAt(ref: unknown): string | undefined;
}

// useDocumentFiles stores files as the document's assets and shows them through object URLs.
export function useDocumentFiles(owner: string, refs: string[]): FileSupport {
  const [urls, setUrls] = useState<Map<string, { url: string; createdAt: string }>>(new Map());
  const loading = useRef(new Set<string>());
  const key = refs.join('|');

  useEffect(() => {
    const missing = refs.map(assetIdOf).filter((id): id is string => id !== null && !urls.has(id) && !loading.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => loading.current.add(id));
    void getAssets(missing).then((assets) => {
      setUrls((current) => {
        const next = new Map(current);
        for (const [id, asset] of assets) next.set(id, { url: URL.createObjectURL(asset.blob), createdAt: asset.createdAt });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Object URLs are released when the form goes away (not on each change: photos on screen use them).
  const held = useRef(urls);
  useEffect(() => {
    held.current = urls;
  }, [urls]);
  useEffect(() => () => held.current.forEach((entry) => URL.revokeObjectURL(entry.url)), []);

  return useMemo(
    () => ({
      url: (ref) => {
        const id = assetIdOf(ref);
        return id ? urls.get(id)?.url : undefined;
      },
      createdAt: (ref) => {
        const id = assetIdOf(ref);
        return id ? urls.get(id)?.createdAt : undefined;
      },
      async add(blob, kind, meta) {
        const asset = await putAsset(blob, { owner, kind, ...meta });
        setUrls((current) => new Map(current).set(asset.id, { url: URL.createObjectURL(blob), createdAt: asset.createdAt }));
        return assetRef(asset.id);
      },
    }),
    [owner, urls],
  );
}

// useMemoryFiles keeps files for the editor's form preview: nothing is stored.
export function useMemoryFiles(): FileSupport {
  const files = useRef(new Map<string, { url: string; createdAt: string }>());
  useEffect(() => {
    const all = files.current;
    return () => all.forEach((entry) => URL.revokeObjectURL(entry.url));
  }, []);
  return useMemo(
    () => ({
      url: (ref) => (typeof ref === 'string' ? files.current.get(ref)?.url : undefined),
      createdAt: (ref) => (typeof ref === 'string' ? files.current.get(ref)?.createdAt : undefined),
      async add(blob) {
        const ref = assetRef(`preview-${crypto.randomUUID()}`);
        files.current.set(ref, { url: URL.createObjectURL(blob), createdAt: new Date().toISOString() });
        return ref;
      },
    }),
    [],
  );
}
