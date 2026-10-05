// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A template's images (spec section 5.2): referred to by file name (<img src="logo.png">), packed in
// .rebpack files and sent to Rebar's PDF service beside the page. Rebar's rules apply: PNG, JPEG or
// WebP, at most 20, 10 MB each.

import { Copy, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Dialog, TextInput } from '../components/ui';
import { errorMessage, formatBytes } from '../components/format';
import { useToast } from '../components/toast';
import { openFiles } from '../platform/bridge';
import { getAssets } from '../store/assets';
import {
  MAX_TEMPLATE_ASSETS, removeTemplateAsset, renameTemplateAsset, setTemplateAsset, templateAssetName, templateAssetProblem,
} from '../store/templates';
import type { TemplateVersion } from '../store/types';

export function AssetsDialog({ version, onChanged, onClose }: { version: TemplateVersion; onChanged(v: TemplateVersion): void; onClose(): void }) {
  const [items, setItems] = useState<{ name: string; url: string; size: number }[]>([]);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    let urls: string[] = [];
    void getAssets(Object.values(version.assets)).then((assets) => {
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
      urls.forEach(URL.revokeObjectURL);
      urls = [];
    };
  }, [version]);

  const add = async () => {
    const files = await openFiles('image/png,image/jpeg,image/webp', true);
    let current = version;
    for (const file of files) {
      const name = templateAssetName(file.name);
      const problem = templateAssetProblem(name, file.size, Object.keys(current.assets));
      if (problem) {
        toast(`${file.name}: ${problem}`, 'error');
        continue;
      }
      try {
        current = await setTemplateAsset(version.templateId, name, file);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    }
    onChanged(current);
  };

  const rename = async () => {
    if (!renaming) return;
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
        <Button variant="primary" icon={<ImagePlus size={17} />} onClick={add} disabled={items.length >= MAX_TEMPLATE_ASSETS}>
          Add images
        </Button>
      }
    >
      <p className="mb-4 text-slate-400">
        Refer to an image by its file name: <code className="text-brand-amber">&lt;img src="logo.png"&gt;</code> or{' '}
        <code className="text-brand-amber">url(logo.png)</code> in CSS. PNG, JPEG or WebP, at most {MAX_TEMPLATE_ASSETS} images of 10 MB, as in Rebar.
      </p>
      {items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">No images yet.</p>
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
                    <TextInput aria-label="New file name" value={renaming.to} onChange={(e) => setRenaming({ ...renaming, to: e.target.value })} className="py-1 text-xs" />
                    <Button size="sm" variant="primary" type="submit">OK</Button>
                  </form>
                ) : (
                  <button type="button" onClick={() => setRenaming({ from: item.name, to: item.name })} className="truncate text-left font-mono text-xs text-white hover:text-brand-amber" title="Rename">
                    {item.name}
                  </button>
                )}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  {formatBytes(item.size)}
                  <span className="flex gap-1">
                    <button type="button" aria-label={`Copy an img tag for ${item.name}`} title="Copy <img> tag" onClick={() => { void navigator.clipboard.writeText(`<img src="${item.name}" alt="">`); toast('Copied', 'success'); }} className="rounded p-1 hover:text-white">
                      <Copy size={16} />
                    </button>
                    <button type="button" aria-label={`Remove ${item.name}`} onClick={async () => onChanged(await removeTemplateAsset(version.templateId, item.name))} className="rounded p-1 text-red-300 hover:text-red-200">
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
