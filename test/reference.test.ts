// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// What the reference and the AI guide teach must be true: their examples compile without warnings and
// render with no filtered value.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as examples from '../src/reference/examples';
import { testEngine } from './engine';

const SYSTEM = { Name: 'N', Reference: 'D-1', Number: 1, ProjectName: 'P', ReporterName: 'R', TemplateName: 'T', CreatedAt: '2026-10-03T08:00:00Z', OrganizationName: 'O', OrganizationLogo: '' };

async function check(source: string) {
  const engine = await testEngine();
  const result = engine.compile(source);
  if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
  expect(result.warnings.map((w) => w.message)).toEqual([]);
  expect(result.execError).toBeUndefined();
  expect(result.previewHtml).not.toContain('ZgotmplZ');
  const rendered = engine.render({ html: result.htmlSource, system: SYSTEM, answers: {}, assets: {}, fields: result.fields });
  expect(rendered.ok).toBe(true);
  return result;
}

describe('reference examples', () => {
  for (const [name, source] of Object.entries(examples).filter(([, v]) => typeof v === 'string') as [string, string][]) {
    it(`${name} compiles cleanly`, async () => {
      const result = await check(`<reb-tailwind></reb-tailwind>\n${source}`);
      // The starting answers are answers the engine accepts.
      const starting = examples.STARTING_ANSWERS[name];
      if (starting) expect((await testEngine()).prepare(result.fields, starting).errors).toEqual([]);
    });
  }
});

describe('AI guide', () => {
  const guide = readFileSync(new URL('../public/reb-ai-guide.md', import.meta.url), 'utf8');
  const blocks = [...guide.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]);

  it('gives the contact for custom templates', () => {
    expect(guide).toContain('vanillaiice@tutanota.com');
  });

  it('has a complete example that compiles cleanly and computes', async () => {
    const complete = blocks.find((b) => b.includes('Concrete pour inspection'))!;
    const result = await check(complete);
    expect(result.fields.fields.filter((f) => f.kind === 'section').map((f) => f.key)).toEqual(['s_pour', 's_checks', 's_sign']);
    const engine = await testEngine();
    const prepared = engine.prepare(result.fields, { element: 'Slab', poured_on: '2026-10-03', grade: 'C40', checks: [{ item: 'Cover', result: 'Fail' }], overall: 'Rejected' });
    expect(prepared.errors.map((e) => e.key).sort()).toEqual(['inspector', 'inspector_signature', 'reason']);
  });

  it('teaches tables, signatures and checkboxes that compile cleanly', async () => {
    const table = blocks.find((b) => b.startsWith('<reb-table'))!;
    await check(table);
    const signature = blocks.find((b) => b.includes('inspector_signature') && !b.includes('Concrete'))!;
    await check(signature);
  });
});
