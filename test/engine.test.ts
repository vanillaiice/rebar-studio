// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { describe, expect, it } from 'vitest';
import { testEngine } from './engine';

const SOURCE = `<reb-text name="client" label="Client" required></reb-text>
<reb-select name="kind" label="Kind" options="Hot work, Cold work"></reb-select>
<reb-text name="torch" label="Torch" show-if="kind == 'Hot work'"></reb-text>
<reb-table name="items" label="Items" options="qty:number,rate:number,amount:formula[qty*rate|2]"></reb-table>
<p>{{.client}} {{.Reference}}</p>`;

describe('engine', () => {
  it('reports its version', async () => {
    const engine = await testEngine();
    expect(engine.version).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('compiles to the normalized schema', async () => {
    const engine = await testEngine();
    const result = engine.compile(SOURCE);
    if (!result.ok) throw new Error(result.error);
    expect(result.fields.schemaVersion).toBe(2);
    expect(result.fields.fields.map((f) => [f.key, f.kind])).toEqual([
      ['client', 'text'],
      ['kind', 'select'],
      ['torch', 'text'],
      ['items', 'table'],
    ]);
    expect(result.fields.fields[3].columns?.map((c) => c.kind)).toEqual(['number', 'number', 'formula']);
    expect(result.previewHtml).toContain('D-1');
  });

  it('renders sample images (reb v0.3.1)', async () => {
    const engine = await testEngine();
    const result = engine.compile('<reb-signature name="s" label="S"></reb-signature><img src="{{.OrganizationLogo}}">');
    if (!result.ok) throw new Error(result.error);
    expect(result.previewHtml).not.toContain('ZgotmplZ');
    expect(result.previewHtml).toContain('src="data:image/svg');
  });

  it('returns coded compile errors', async () => {
    const engine = await testEngine();
    const result = engine.compile('<reb-text name="1bad" label="x"></reb-text>');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_field_name');
  });

  it('prepares answers: formulas, show-if and required', async () => {
    const engine = await testEngine();
    const result = engine.compile(SOURCE);
    if (!result.ok) throw new Error(result.error);
    const prepared = engine.prepare(result.fields, {
      client: '',
      kind: 'Cold work',
      torch: 'kept?',
      items: [{ qty: '3', rate: '2.5' }],
    });
    expect(prepared.answers.torch).toBeUndefined();
    expect(prepared.answers.items).toEqual([{ qty: '3', rate: '2.5', amount: '7.50' }]);
    expect(prepared.errors).toEqual([{ key: 'client', code: 'blank' }]);
  });

  it('renders with system values and asset names', async () => {
    const engine = await testEngine();
    const rendered = engine.render({
      html: '<p>{{.Name}}</p><img src="{{.photo}}">',
      system: { Name: 'Daily report' },
      answers: { photo: 'asset:abc' },
      assets: { 'asset:abc': 'asset-abc.jpg' },
    });
    expect(rendered).toEqual({ ok: true, html: '<p>Daily report</p><img src="asset-abc.jpg">' });
  });
});
