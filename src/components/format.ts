// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Formatting helpers and shared class names.

// inputBase has no width, for a control sized by its content (w-full and w-auto in one class list
// leave the winner to the stylesheet's order).
export const inputBase =
  'rounded-md border border-white/10 bg-brand-steel-dark px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-amber focus:outline-none disabled:opacity-60';
export const inputClass = `w-full ${inputBase}`;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
