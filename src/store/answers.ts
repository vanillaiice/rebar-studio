// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// File references inside answers ("asset:<id>" at the top level, in lists and in table cells), and
// the answers a new document starts with.

import type { Answers, Field } from '../engine/types';
import { assetIdOf } from './types';

export function mapAssetRefs(value: unknown, map: (id: string) => string): unknown {
  const id = assetIdOf(value);
  if (id !== null) return map(id);
  if (Array.isArray(value)) return value.map((item) => mapAssetRefs(item, map));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapAssetRefs(v, map)]));
  }
  return value;
}

export function assetIdsIn(value: unknown): string[] {
  const ids: string[] = [];
  mapAssetRefs(value, (id) => {
    ids.push(id);
    return id;
  });
  return [...new Set(ids)];
}

export function localDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// defaultAnswers is what a new document starts with: each field's default (spec 3.2: "today" on a
// date is the creation day, "true" ticks a checkbox), empty lists for tables and images.
export function defaultAnswers(fields: Field[]): Answers {
  const answers: Answers = {};
  for (const field of fields) {
    switch (field.kind) {
      case 'section':
        break;
      case 'table':
      case 'images':
        answers[field.key] = [];
        break;
      case 'checkbox':
        answers[field.key] = ['true', '1', 'on'].includes((field.default ?? '').trim().toLowerCase());
        break;
      case 'date':
        answers[field.key] =
          (field.default ?? '').trim().toLowerCase() === 'today' ? localDate() : (field.default ?? '');
        break;
      default:
        answers[field.key] = field.default ?? '';
    }
  }
  return answers;
}
