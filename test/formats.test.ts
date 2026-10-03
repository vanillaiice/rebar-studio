// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import 'fake-indexeddb/auto';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testEngine } from './engine';

// The app's engine client runs a Web Worker; here it is the same engine, started under Node.
vi.mock('../src/engine/client', () => ({
  engine: {
    ready: async () => (await testEngine()).version,
    compile: async (source: string) => (await testEngine()).compile(source),
    prepare: async (fields: never, answers: never) => (await testEngine()).prepare(fields, answers),
    render: async (input: never) => (await testEngine()).render(input),
  },
}));

const { useDatabase } = await import('../src/store/db');
const { buildRebpack, importRebpack, readRebpack } = await import('../src/formats/rebpack');
const { buildRebdoc, importRebdoc } = await import('../src/formats/rebdoc');
const { buildBackup, restoreBackup } = await import('../src/formats/backup');
const { FormatError } = await import('../src/formats/zip');
const { createTemplate, currentVersion, getTemplate, listTemplates, setTemplateAsset } = await import('../src/store/templates');
const { createDocument, finalizeDocument, getDocument, listDocuments, saveAnswers } = await import('../src/store/documents');
const { getAsset, putAsset } = await import('../src/store/assets');
const { assetRef } = await import('../src/store/types');
const { renderDocument } = await import('../src/render/renderDocument');
const { getSettings } = await import('../src/store/settings');

// A document rendered, with its files' bytes; file names carry asset ids, which an import renews.
async function rendered(id: string) {
  const document = (await getDocument(id))!;
  const version = await currentVersion(document.templateId).then(async (current) =>
    current.id === document.templateVersionId ? current : (await import('../src/store/templates')).getVersion(document.templateVersionId).then((v) => v!),
  );
  const out = await renderDocument(document, version, (await getTemplate(document.templateId))!, await getSettings());
  const anonymous = (name: string) => name.replace(/asset-[0-9a-f-]{36}/g, 'asset-ID');
  const files = await Promise.all([...out.files].map(async ([name, blob]) => [anonymous(name), [...new Uint8Array(await blob.arrayBuffer())]] as const));
  return { html: anonymous(out.html), files: files.sort(([a], [b]) => a.localeCompare(b)) };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SOURCE = '<img src="logo.png"><reb-text name="site" label="Site"></reb-text><reb-photogrid name="photos" label="Photos"></reb-photogrid>';

let run = 0;
beforeEach(async () => {
  await useDatabase(`formats-${++run}`);
});

async function template() {
  const engine = await testEngine();
  const t = await createTemplate({ name: 'Diary', source: SOURCE, result: engine.compile(SOURCE), tags: ['daily'] });
  await setTemplateAsset(t.id, 'logo.png', new Blob([PNG], { type: 'image/png' }));
  return t;
}

describe('.rebpack', () => {
  it('round-trips a template with its images, in the layout Rebar reads', async () => {
    const t = await template();
    const bytes = await buildRebpack((await getTemplate(t.id))!, await currentVersion(t.id));
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['assets/logo.png', 'manifest.json', 'template.reb']);
    const imported = await importRebpack(bytes, 'x.rebpack');
    const version = await currentVersion(imported.id);
    expect(imported.name).toBe('Diary');
    expect(imported.tags).toEqual(['daily']);
    expect(version.rebSource).toBe(SOURCE);
    expect(new Uint8Array(await (await getAsset(version.assets['logo.png']))!.blob.arrayBuffer())).toEqual(PNG);
  });

  it('refuses unsafe or unexpected contents', () => {
    const pack = (files: Record<string, Uint8Array>) => zipSync(files);
    const reb = strToU8('<p>x</p>');
    expect(() => readRebpack(pack({ 'manifest.json': strToU8('{"formatVersion":1}') }))).toThrow(/no template/);
    expect(() => readRebpack(pack({ 'template.reb': reb, 'assets/a b.png': PNG }))).toThrow(FormatError);
    expect(() => readRebpack(pack({ 'template.reb': reb, 'assets/x.svg': PNG }))).toThrow(/PNG/);
    expect(() => readRebpack(pack({ 'template.reb': reb, 'assets/asset-1.png': PNG }))).toThrow(/reserved/);
    expect(() => readRebpack(pack({ 'template.reb': reb, 'manifest.json': strToU8('{"formatVersion":9}') }))).toThrow(/newer/);
    expect(() => readRebpack(strToU8('not a zip'))).toThrow(/not a valid archive/);
    // "../" entries are never read: only exact names are used.
    const contents = readRebpack(pack({ 'template.reb': reb, '../evil.reb': reb, 'assets/../../x.png': PNG }));
    expect([...contents.assets.keys()]).toEqual([]);
  });

  it('names a pack without a manifest after its file', () => {
    expect(readRebpack(zipSync({ 'template.reb': strToU8('<p>x</p>') }), 'Site diary.rebpack').name).toBe('Site diary');
  });
});

describe('.rebdoc', () => {
  it('round-trips a final document with its files and PDF, reusing the template', async () => {
    const t = await template();
    const doc = await createDocument(t.id);
    const photo = await putAsset(new Blob([PNG], { type: 'image/png' }), { owner: doc.id, kind: 'photo', name: 'p.png' });
    await saveAnswers(doc.id, { site: 'North', photos: [assetRef(photo.id)] });
    await finalizeDocument(doc.id, new Blob(['%PDF-1.7'], { type: 'application/pdf' }), 'abc123');
    const final = (await getDocument(doc.id))!;
    const bytes = await buildRebdoc(final, (await currentVersion(t.id)), (await getTemplate(t.id))!);
    const before = await rendered(doc.id);
    expect(before.html).toContain('North');
    expect(before.files.map(([name]) => name)).toEqual(['asset-ID.png', 'logo.png']);

    await useDatabase(`formats-other-${run}`);
    const imported = await importRebdoc(bytes);
    // The same page, with the same files: a .rebdoc re-renders identically.
    expect(await rendered(imported.id)).toEqual(before);
    expect(imported.status).toBe('final');
    expect(imported.pdfHash).toBe('abc123');
    expect(imported.answers.site).toBe('North');
    const [ref] = imported.answers.photos as string[];
    expect(new Uint8Array(await (await getAsset(ref.slice(6)))!.blob.arrayBuffer())).toEqual(PNG);
    expect(await (await getAsset(imported.pdfAssetId!))!.blob.text()).toBe('%PDF-1.7');
    const [created] = await listTemplates();
    expect((await currentVersion(created.id)).assets['logo.png']).toBeDefined();

    // Importing it again reuses that template and makes a new document.
    const again = await importRebdoc(bytes);
    expect(again.templateVersionId).toBe(imported.templateVersionId);
    expect(again.id).not.toBe(imported.id);
    expect(await listTemplates()).toHaveLength(1);
  });
});

describe('.rebbackup', () => {
  it('restores the whole workspace', async () => {
    const t = await template();
    const doc = await createDocument(t.id);
    await saveAnswers(doc.id, { site: 'Backed up' });
    const backup = await buildBackup();

    await useDatabase(`formats-restore-${run}`);
    await template();
    const counts = await restoreBackup(backup);
    expect(counts).toEqual({ templates: 1, documents: 1 });
    const [restored] = await listDocuments();
    expect(restored.answers.site).toBe('Backed up');
    expect((await currentVersion(restored.templateId)).assets['logo.png']).toBeDefined();
    await expect(restoreBackup(zipSync({ 'manifest.json': strToU8('{"kind":"rebpack"}') }))).rejects.toThrow(/not a .rebbackup/);
  });
});
