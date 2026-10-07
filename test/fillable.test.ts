// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// pdf-forms:boxes, pdf-forms:fields
// Fillable PDF fields (reb spec 4.5) through the WebAssembly builds: the render switch, the PDF form
// and the answers taken back from a filled one. The PDFs are the engine's own fixtures (a page
// printed by Chromium, and the same form filled by another program).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importedChanges, withImported } from '../src/documents/pdfForms';
import { testEngine, testPdfEngine } from './engine';

const rebDir =
  process.env.REB_DIR ?? execFileSync('go', ['list', '-m', '-f', '{{.Dir}}', 'github.com/vanillaiice/reb'], { encoding: 'utf8' }).trim();
const fixture = (name: string) => new Uint8Array(readFileSync(join(rebDir, 'internal/rebpdf/testdata', name)));

const SOURCE = `<p>Supplier: <reb-text name="supplier" label="Supplier" fillable class="w-64"></reb-text></p>
<p>Quantity: <reb-number name="quantity" label="Quantity" fillable></reb-number></p>
<reb-textarea name="remarks" label="Remarks" fillable></reb-textarea>
<p>Crane needed: <reb-checkbox name="crane" label="Crane needed" fillable></reb-checkbox></p>
<p>Priority: <reb-select name="priority" label="Priority" options="Normal,Urgent"></reb-select></p>
{{if .Fillable}}<p>Type into the boxes.</p>{{end}}`;

async function compiled() {
  const result = (await testEngine()).compile(SOURCE);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('fillable fields', () => {
  it('marks the fields in the schema', async () => {
    const { fields } = await compiled();
    expect(fields.fields.filter((f) => f.fillable).map((f) => f.key)).toEqual(['supplier', 'quantity', 'remarks', 'crane']);
  });

  it('renders boxes or answers, as switched', async () => {
    const engine = await testEngine();
    const { htmlSource, fields } = await compiled();
    const answers = { supplier: 'Gulf Steel', quantity: '12', remarks: 'Gate 3', priority: 'Urgent' };
    const render = (fillable: boolean) => {
      const out = engine.render({ html: htmlSource, system: {}, answers, assets: {}, fields, fillable });
      if (!out.ok) throw new Error(out.error);
      return out.html;
    };
    const withAnswers = render(false);
    expect(withAnswers).toContain('<span class="w-64">Gulf Steel</span>');
    expect(withAnswers).not.toContain('reb-field:');
    expect(withAnswers).not.toContain('Type into the boxes');
    const form = render(true);
    expect(form).toContain('<a href="reb-field:supplier" class="reb-fillable w-64"></a>');
    expect(form).toContain('reb-field:remarks;multiline');
    expect(form).toContain('<a href="reb-field:crane;checkbox" class="reb-fillable reb-fillable-checkbox"></a>');
    expect(form).not.toContain('Gulf Steel');
    expect(form).toContain('Urgent'); // not fillable: still printed
    expect(form).toContain('Type into the boxes');
  });

  it('makes a PDF form and reads a filled one back', async () => {
    const pdfEngine = await testPdfEngine();
    const { fields } = await compiled();
    const form = pdfEngine.fillable(fixture('form.pdf'), { supplier: 'Gulf Steel', quantity: 12, crane: true });
    expect(pdfEngine.pdfAnswers(form, fields)).toEqual({ supplier: 'Gulf Steel', quantity: '12', remarks: '', crane: true });

    const filled = pdfEngine.pdfAnswers(fixture('filled.pdf'), fields);
    expect(filled).toEqual({ supplier: 'Qatar Steel – Ras Laffan', quantity: '40', remarks: 'Gate 3 only.\nCall 30 min ahead.', crane: true });

    const current = { supplier: 'Gulf Steel', quantity: '40', remarks: '', priority: 'Urgent', crane: false };
    const changes = importedChanges(fields.fields, current, filled);
    expect(changes.map((c) => [c.key, c.before, c.after])).toEqual([
      ['supplier', 'Gulf Steel', 'Qatar Steel – Ras Laffan'],
      ['remarks', '', 'Gate 3 only.\nCall 30 min ahead.'],
      ['crane', 'Not ticked', 'Ticked'],
    ]);
    expect(withImported(current, changes)).toEqual({ ...current, supplier: 'Qatar Steel – Ras Laffan', remarks: 'Gate 3 only.\nCall 30 min ahead.', crane: true });
    expect(importedChanges(fields.fields, { ...current, crane: true }, filled).map((c) => c.key)).not.toContain('crane');
  });

  it('refuses what is not a PDF form', async () => {
    const pdfEngine = await testPdfEngine();
    const { fields } = await compiled();
    expect(() => pdfEngine.pdfAnswers(fixture('form.pdf'), fields)).toThrow(/no form fields/);
    expect(() => pdfEngine.pdfAnswers(new TextEncoder().encode('hello'), fields)).toThrow();
  });
});
