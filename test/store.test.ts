// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../src/store/db';
import {
  createTemplate, currentVersion, deleteTemplate, duplicateTemplate, restoreVersion, saveSource,
  setTemplateAsset, templateAssetProblem, versionsOf,
} from '../src/store/templates';
import {
  createDocument, deleteDocument, duplicateDocument, finalizeDocument, getDocument, moveToVersion,
  reopenAsRevision, saveAnswers,
} from '../src/store/documents';
import { getAsset, putAsset, assetsOwnedBy } from '../src/store/assets';
import { getSettings, updateSettings } from '../src/store/settings';
import { assetRef } from '../src/store/types';
import { testEngine } from './engine';

let run = 0;
beforeEach(async () => {
  await useDatabase(`test-${++run}`);
});

async function template(source = '<reb-text name="a" label="A" default="x"></reb-text>') {
  const engine = await testEngine();
  return createTemplate({ name: 'Permit', source, result: engine.compile(source) });
}

describe('templates', () => {
  it('edits the current version in place while no document uses it', async () => {
    const engine = await testEngine();
    const t = await template();
    const source = '<reb-text name="b" label="B"></reb-text>';
    await saveSource(t.id, source, engine.compile(source));
    const versions = await versionsOf(t.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].rebSource).toBe(source);
    expect(versions[0].compiled?.fields.fields[0].key).toBe('b');
  });

  it('creates the next version once a document uses the current one', async () => {
    const engine = await testEngine();
    const t = await template();
    const doc = await createDocument(t.id);
    const v1 = await currentVersion(t.id);
    for (const source of ['<p>one</p>', '<p>two</p>']) await saveSource(t.id, source, engine.compile(source));
    const versions = await versionsOf(t.id);
    expect(versions.map((v) => v.number)).toEqual([2, 1]);
    expect(versions[0].rebSource).toBe('<p>two</p>');
    expect((await getDocument(doc.id))?.templateVersionId).toBe(v1.id);
  });

  it('keeps a failed compile without compiled output', async () => {
    const engine = await testEngine();
    const t = await template();
    const bad = '<reb-text name="9" label="x"></reb-text>';
    const version = await saveSource(t.id, bad, engine.compile(bad));
    expect(version.compiled).toBeNull();
    expect(version.compileError).toBeTruthy();
    await expect(createDocument(t.id)).rejects.toThrow(/does not compile/);
  });

  it('shares images with the next version and restores old versions', async () => {
    const engine = await testEngine();
    const t = await template();
    await setTemplateAsset(t.id, 'logo.png', new Blob(['png'], { type: 'image/png' }));
    await createDocument(t.id);
    await saveSource(t.id, '<p>v2</p>', engine.compile('<p>v2</p>'));
    const [v2, v1] = await versionsOf(t.id);
    expect(v2.assets['logo.png']).toBe(v1.assets['logo.png']);
    await createDocument(t.id);
    const restored = await restoreVersion(t.id, v1.id);
    expect(restored.number).toBe(3);
    expect(restored.rebSource).toBe(v1.rebSource);
  });

  it('applies Rebar rules to template images', () => {
    expect(templateAssetProblem('logo.png', 10, [])).toBeNull();
    expect(templateAssetProblem('logo.svg', 10, [])).toMatch(/PNG/);
    expect(templateAssetProblem('asset-1.png', 10, [])).toMatch(/reserved/);
    expect(templateAssetProblem('x.png', 11 * 1024 * 1024, [])).toMatch(/10 MB/);
    expect(templateAssetProblem('new.png', 1, Array.from({ length: 20 }, (_, i) => `${i}.png`))).toMatch(/20/);
  });

  it('duplicates with copies of the images, and deletes with documents and files', async () => {
    const t = await template();
    await setTemplateAsset(t.id, 'logo.png', new Blob(['png'], { type: 'image/png' }));
    const copy = await duplicateTemplate(t.id);
    const copyVersion = await currentVersion(copy.id);
    const original = await currentVersion(t.id);
    expect(copyVersion.assets['logo.png']).not.toBe(original.assets['logo.png']);
    const doc = await createDocument(t.id);
    await putAsset(new Blob(['jpg']), { owner: doc.id, kind: 'photo', name: 'p.jpg' });
    await expect(deleteTemplate(t.id)).rejects.toThrow(/documents/);
    await deleteTemplate(t.id, true);
    expect(await getDocument(doc.id)).toBeUndefined();
    expect(await assetsOwnedBy(doc.id)).toEqual([]);
    expect(await assetsOwnedBy(t.id)).toEqual([]);
    expect(await getAsset(copyVersion.assets['logo.png'])).toBeDefined();
  });
});

describe('documents', () => {
  it('numbers documents from the settings and starts from defaults', async () => {
    await updateSettings((s) => { s.numbering = { prefix: 'PTW-', next: 7 }; });
    const t = await template('<reb-text name="a" label="A" default="x"></reb-text><reb-date name="d" label="D" default="today"></reb-date><reb-checkbox name="c" label="C" default="true"></reb-checkbox>');
    const one = await createDocument(t.id);
    const two = await createDocument(t.id);
    expect([one.reference, two.reference]).toEqual(['PTW-7', 'PTW-8']);
    expect(one.answers.a).toBe('x');
    expect(one.answers.d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(one.answers.c).toBe(true);
    expect((await getSettings()).numbering.next).toBe(9);
  });

  it('locks a final document, duplicates and reopens it with copies of its files', async () => {
    const t = await template();
    const doc = await createDocument(t.id);
    const photo = await putAsset(new Blob(['jpg'], { type: 'image/jpeg' }), { owner: doc.id, kind: 'photo', name: 'p.jpg' });
    await saveAnswers(doc.id, { a: 'y', photos: [assetRef(photo.id)] });
    const final = await finalizeDocument(doc.id, new Blob(['%PDF']), 'abc');
    expect(final.status).toBe('final');
    await expect(saveAnswers(doc.id, {})).rejects.toThrow(/final/);

    const copy = await duplicateDocument(doc.id);
    expect(copy.status).toBe('draft');
    expect(copy.reference).not.toBe(doc.reference);
    expect(copy.answers.photos).not.toEqual([assetRef(photo.id)]);

    const revision = await reopenAsRevision(doc.id);
    expect(revision.reference).toBe(doc.reference);
    expect(revision.revision).toBe(2);
    expect(revision.revisionOf).toBe(doc.id);
    expect((await getDocument(doc.id))?.log.at(-1)?.action).toBe('reopened');

    await deleteDocument(doc.id);
    expect(await getAsset(photo.id)).toBeUndefined();
    expect(await assetsOwnedBy(copy.id)).toHaveLength(1);
  });

  it('moves a draft to a newer version, adding the new fields', async () => {
    const engine = await testEngine();
    const t = await template();
    const doc = await createDocument(t.id);
    const source = '<reb-text name="a" label="A"></reb-text><reb-text name="b" label="B" default="new"></reb-text>';
    const v2 = await saveSource(t.id, source, engine.compile(source));
    const moved = await moveToVersion(doc.id, v2.id);
    expect(moved.templateVersionId).toBe(v2.id);
    expect(moved.answers).toEqual({ a: 'x', b: 'new' });
  });
});
