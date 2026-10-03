// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { describe, expect, it } from 'vitest';
import { BLANK_SOURCE, STARTERS } from '../src/starters';
import { testEngine } from './engine';

describe('starter templates', () => {
  for (const starter of [...STARTERS, { id: 'blank', source: BLANK_SOURCE }]) {
    it(`${starter.id} compiles and renders its sample without warnings`, async () => {
      const engine = await testEngine();
      const result = engine.compile(starter.source);
      if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
      expect(result.execError).toBeUndefined();
      expect(result.warnings).toEqual([]);
      expect(result.previewHtml).not.toContain('{{');
      expect(result.previewHtml).not.toContain('ZgotmplZ');
      // Every form section holds at least one field: a section groups the fields after it.
      const fields = result.fields.fields;
      fields.forEach((field, i) => {
        if (field.kind === 'section') expect(fields[i + 1]?.kind, `section ${field.key} is empty`).not.toBe('section');
      });
      if (fields.length > 0) expect(fields.at(-1)!.kind).not.toBe('section');
    });
  }

  it('computes the estimate totals', async () => {
    const engine = await testEngine();
    const result = engine.compile(STARTERS.find((s) => s.id === 'price-estimate')!.source);
    if (!result.ok) throw new Error(result.error);
    const prepared = engine.prepare(result.fields, {
      client: 'ACME', currency: 'QAR', vat_rate: '5',
      items: [{ description: 'Concrete', unit: 'm3', qty: '10', rate: '350' }, { description: 'Rebar', unit: 'kg', qty: '1000', rate: '3.5' }],
    });
    expect(prepared.errors).toEqual([]);
    const rendered = engine.render({ html: result.htmlSource, system: {}, answers: prepared.answers, assets: {}, fields: result.fields });
    if (!rendered.ok) throw new Error(rendered.error);
    expect(rendered.html).toContain('QAR 7,000.00');
    expect(rendered.html).toContain('QAR 350.00');
    expect(rendered.html).toContain('QAR 7,350.00');
  });
});
