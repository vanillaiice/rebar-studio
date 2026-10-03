// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

import type { Field } from '../engine/types';
import type { FormState } from './useFormState';

// The element id of a field's input (and of a section's heading).
export function fieldDomId(key: string): string {
  return `field-${key}`;
}

// firstErrorKey is the first visible field with an error, in form order.
export function firstErrorKey(fields: Field[], state: Pick<FormState, 'visible' | 'errors'>): string | null {
  return fields.find((f) => state.visible.has(f.key) && state.errors.has(f.key))?.key ?? null;
}
