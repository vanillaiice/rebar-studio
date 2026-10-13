// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A template's images (spec section 5.2): referred to by file name (<img src="logo.png">), packed in
// .rebpack files and sent to Rebar's PDF service beside the page. Rebar's rules apply: PNG, JPEG or
// WebP, at most 20, 10 MB each.

import { Copy, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, TextInput } from '../components/ui';
import { errorMessage, formatBytes } from '../components/format';
import { useToast } from '../components/toast';
import { openFiles } from '../platform/bridge';
import { getAssets } from '../store/assets';
import { useImageDrop } from '../form/useImageDrop';
import { addTemplateImages } from './templateImages';
import {
  MAX_TEMPLATE_ASSETS, removeTemplateAsset, renameTemplateAsset, templateAssetName, templateAssetProblem,
} from '../store/templates';
import type { TemplateVersion } from '../store/types';

export function AssetsDialog({ version, onChanged, onClose }: { version: TemplateVersion; onChanged(v: TemplateVersion): void; onClose(): void }) {
  const [items, setItems] = useState<{ name: string; url: string; size: number }[]>([]);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const adding = useRef(false);

  useEffect(() => {
    const urls: string[] = [];
    let cancelled = false;
    void getAssets(Object.values(version.assets)).then((assets) => {
      if (cancelled) return;
      const next = Object.entries(version.assets).flatMap(([name, id]) => {
        const asset = assets.get(id);
        if (!asset) return [];
        const url = URL.createObjectURL(asset.blob);
        urls.push(url);
        return [{ name, url, size: asset.size }];
      });
      setItems(next.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => {
      cancelled = true;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [version]);

  const add = async (files: File[]) => {
    if (!files.length || adding.current) return;
    adding.current = true;
    setBusy(true);
    try {
      const added = await addTemplateImages(version.templateId, files, (message) => toast(message, 'error'));
      onChanged(added.version);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      adding.current = false;
      setBusy(false);
    }
  };
  const drop = useImageDrop((files) => void add(files), busy);

  const rename = async () => {
    if (!renaming || adding.current) return;
    const to = templateAssetName(renaming.to.trim());
    const existing = Object.keys(version.assets).filter((n) => n !== renaming.from);
    const problem = existing.includes(to) ? `"${to}" already exists.` : templateAssetProblem(to, 0, existing);
    if (problem) {
      toast(problem, 'error');
      return;
    }
    onChanged(await renameTemplateAsset(version.templateId, renaming.from, to));
    setRenaming(null);
  };

  return (
    <Dialog
      title="Template images"
      onClose={onClose}
      wide
      footer={
        <Button variant="primary" icon={<ImagePlus size={17} />} onClick={async () => void add(await openFiles('image/png,image/jpeg,image/webp', true))} disabled={busy || items.length >= MAX_TEMPLATE_ASSETS}>
          Add images
        </Button>
      }
    >
      <p className="mb-4 text-slate-400">
        Refer to an image by its file name: <code className="text-brand-amber">&lt;img src="logo.png"&gt;</code> or{' '}
        <code className="text-brand-amber">url(logo.png)</code> in CSS. PNG, JPEG or WebP, at most {MAX_TEMPLATE_ASSETS} images of 10 MB, as in Rebar.
      </p>
      <div
        aria-label="Drop template images"
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
        className={`rounded-lg border-2 border-dashed p-4 ${drop.over ? 'border-brand-amber bg-brand-amber/10' : 'border-white/10'}`}
      >
        <p className="mb-3 flex items-center justify-center gap-2 text-slate-400">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          {busy ? 'Adding images…' : 'Drop images here or use Add images'}
        </p>
        {items.length === 0 ? (
          <p className="py-3 text-center text-slate-500">No images yet.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {items.map((item) => (
              <li key={item.name} className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-brand-steel-dark">
                <div className="flex h-28 items-center justify-center bg-white/90 p-2">
                  <img src={item.url} alt={item.name} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {renaming?.from === item.name ? (
                    <form onSubmit={(e) => { e.preventDefault(); void rename(); }} className="flex gap-1">
                      <TextInput disabled={busy} aria-label="New file name" value={renaming.to} onChange={(e) => setRenaming({ ...renaming, to: e.target.value })} className="py-1 text-xs" />
                      <Button disabled={busy} size="sm" variant="primary" type="submit">OK</Button>
                    </form>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => setRenaming({ from: item.name, to: item.name })} className="truncate text-left font-mono text-xs text-white hover:text-brand-amber" title="Rename">
                      {item.name}
                    </button>
                  )}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    {formatBytes(item.size)}
                    <span className="flex gap-1">
                      <button type="button" aria-label={`Copy an img tag for ${item.name}`} title="Copy <img> tag" onClick={() => { void navigator.clipboard.writeText(`<img src="${item.name}" alt="">`); toast('Copied', 'success'); }} className="rounded p-1 hover:text-white">
                        <Copy size={16} />
                      </button>
                      <button type="button" disabled={busy} aria-label={`Remove ${item.name}`} onClick={async () => onChanged(await removeTemplateAsset(version.templateId, item.name))} className="rounded p-1 text-red-300 hover:text-red-200">
                        <Trash2 size={16} />
                      </button>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
