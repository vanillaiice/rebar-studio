// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Reading archives safely: entries are matched by exact name (no path is ever joined to a folder, so
// "../" names cannot escape anywhere), sizes are limited before and after inflating (the declared
// size can lie), and anything unexpected is ignored.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

export class FormatError extends Error {}

export interface ReadLimits {
  maxArchiveBytes: number;
  maxEntryBytes: (name: string) => number; // 0 skips the entry
  maxEntries: number;
}

export function readZip(bytes: Uint8Array, limits: ReadLimits): Map<string, Uint8Array> {
  if (bytes.byteLength > limits.maxArchiveBytes) throw new FormatError('The file is too large.');
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        if (file.name.endsWith('/')) return false;
        const limit = limits.maxEntryBytes(file.name);
        if (limit === 0) return false;
        if (file.originalSize > limit) throw new FormatError(`"${file.name}" is too large.`);
        if (++count > limits.maxEntries) throw new FormatError('The file holds too many entries.');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof FormatError) throw e;
    throw new FormatError('This is not a valid archive.');
  }
  const out = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (data.byteLength > limits.maxEntryBytes(name)) throw new FormatError(`"${name}" is too large.`);
    out.set(name, data);
  }
  return out;
}

export function writeZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const zippable: Zippable = {};
  for (const [name, data] of Object.entries(files)) {
    zippable[name] = typeof data === 'string' ? strToU8(data) : data;
  }
  return zipSync(zippable, { level: 6 });
}

export function text(data: Uint8Array | undefined): string | undefined {
  return data === undefined ? undefined : strFromU8(data);
}

export function json<T>(data: Uint8Array | undefined, what: string): T {
  if (!data) throw new FormatError(`The file has no ${what}.`);
  try {
    return JSON.parse(strFromU8(data)) as T;
  } catch {
    throw new FormatError(`The ${what} is not valid JSON.`);
  }
}

// A file name with letters, digits, ".", "-" and "_" only (what an archive entry may be named).
export function plainName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..';
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}
