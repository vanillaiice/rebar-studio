// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// The engine's shared golden cases, through the WebAssembly build and prepare (the way Studio gets
// every formula): testdata/formula_cases.json of the pinned reb release (REB_DIR for a checkout).
// Studio has no formula or show-if evaluator of its own, so these are the only formula results it
// shows; show-if cases are run by reb's own tests.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Column, Schema } from '../src/engine/types';
import { testEngine } from './engine';

const rebDir =
  process.env.REB_DIR ?? execFileSync('go', ['list', '-m', '-f', '{{.Dir}}', 'github.com/vanillaiice/reb'], { encoding: 'utf8' }).trim();

interface FormulaCase {
  expression: string;
  row: Record<string, unknown>;
  precision: number;
  expected: string;
}

describe('engine golden cases', () => {
  const cases: FormulaCase[] = JSON.parse(readFileSync(join(rebDir, 'testdata/formula_cases.json'), 'utf8'));

  it('has the cases', () => expect(cases.length).toBeGreaterThanOrEqual(20));

  it.each(cases.map((c, i) => [i, c] as const))('formula case %i', async (_, c) => {
    const inputs: Column[] = Object.keys(c.row).map((key) => ({ key, kind: 'text', label: key }));
    const schema: Schema = {
      schemaVersion: 2,
      fields: [{ key: 't', type: 'table', kind: 'table', label: 'T', columns: [...inputs, { key: '__result', kind: 'formula', label: 'R', expression: c.expression, precision: c.precision }] }],
    };
    const prepared = (await testEngine()).prepare(schema, { t: [c.row] });
    expect((prepared.answers.t as Record<string, unknown>[])[0].__result).toBe(c.expected);
  });
});
