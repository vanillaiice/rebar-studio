// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A photo grid: take a photo (the camera on a tablet), choose files, drop them or paste them. Each is
// resized and compressed on the device, then stored with the document.

import { ArrowLeft, ArrowRight, Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../components/toast';
import type { FileSupport } from './fileSupport';
import { isImage, prepareImage } from './images';

export interface PhotoOptions {
  maxEdge: number;
  keepOriginal: boolean;
}

export function ImagesField({
  id,
  value,
  onChange,
  files,
  readOnly,
  photo,
  max = 100,
}: {
  id: string;
  value: unknown;
  onChange(refs: string[]): void;
  files: FileSupport;
  readOnly?: boolean;
  photo: PhotoOptions;
  max?: number;
}) {
  const refs = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : [];
  // Photos are added after an await: append them to the list as it is then.
  const current = useRef(refs);
  useEffect(() => {
    current.current = refs;
  });
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const toast = useToast();

  const add = async (incoming: Blob[]) => {
    const images = incoming.filter(isImage);
    if (images.length === 0) return;
    if (refs.length + images.length > max) {
      toast(`At most ${max} photos.`, 'error');
      return;
    }
    setBusy(true);
    try {
      const added: string[] = [];
      for (const image of images) {
        const prepared = await prepareImage(image, photo);
        added.push(await files.add(prepared.blob, 'photo', {
          name: image instanceof File ? image.name : 'photo.jpg',
          width: prepared.width,
          height: prepared.height,
        }));
      }
      onChange([...current.current, ...added]);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const pick = (capture: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = !capture;
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => void add(Array.from(input.files ?? []));
    input.click();
  };

  const move = (index: number, by: number) => {
    const next = [...refs];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };

  return (
    <div
      id={id}
      tabIndex={readOnly ? undefined : 0}
      onPaste={(event) => {
        if (readOnly) return;
        const pasted = Array.from(event.clipboardData.files);
        if (pasted.length) {
          event.preventDefault();
          void add(pasted);
        }
      }}
      onDragOver={(event) => {
        if (readOnly) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (readOnly) return;
        event.preventDefault();
        setOver(false);
        void add(Array.from(event.dataTransfer.files));
      }}
      className={`rounded-lg border-2 border-dashed p-3 outline-none focus-visible:border-brand-amber ${over ? 'border-brand-amber bg-brand-amber/5' : 'border-white/10'}`}
    >
      {refs.length > 0 && (
        <ul className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
          {refs.map((ref, index) => (
            <li key={ref} className="group relative aspect-[4/3] overflow-hidden rounded-md bg-black/30">
              {files.url(ref) ? <img src={files.url(ref)} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" /> : null}
              {!readOnly && (
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button type="button" aria-label="Move left" disabled={index === 0} onClick={() => move(index, -1)} className="rounded p-1 text-white disabled:opacity-30"><ArrowLeft size={14} /></button>
                  <button type="button" aria-label="Remove photo" onClick={() => onChange(refs.filter((r) => r !== ref))} className="rounded p-1 text-red-300"><X size={14} /></button>
                  <button type="button" aria-label="Move right" disabled={index === refs.length - 1} onClick={() => move(index, 1)} className="rounded p-1 text-white disabled:opacity-30"><ArrowRight size={14} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? (
        refs.length === 0 && <p className="text-sm text-slate-500">No photos</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => pick(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-steel-light px-3 text-sm font-semibold text-white hover:bg-slate-700">
            <Camera size={16} /> Take photo
          </button>
          <button type="button" onClick={() => pick(false)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-steel-light px-3 text-sm font-semibold text-white hover:bg-slate-700">
            <ImagePlus size={16} /> Choose files
          </button>
          <span className="text-xs text-slate-500">or drop or paste images here</span>
          {busy && <Loader2 size={16} className="animate-spin text-brand-amber" />}
        </div>
      )}
    </div>
  );
}
