// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Documents filled from templates. A final document is locked: it can be duplicated or reopened as
// a new revision, an explicit action logged on both documents.

import type { Answers } from '../engine/types';
import { assetIdsIn, defaultAnswers, mapAssetRefs } from './answers';
import { putAsset } from './assets';
import { db, newId, now } from './db';
import { defaultSettings } from './settings';
import type { Asset, LogEntry, StudioDocument } from './types';
import { assetRef } from './types';

export async function listDocuments(filter: { templateId?: string; status?: string } = {}): Promise<StudioDocument[]> {
  const database = await db();
  const all = filter.templateId
    ? await database.getAllFromIndex('documents', 'templateId', filter.templateId)
    : await database.getAll('documents');
  return all
    .filter((d) => !filter.status || d.status === filter.status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDocument(id: string): Promise<StudioDocument | undefined> {
  return (await db()).get('documents', id);
}

function entry(action: string, note?: string): LogEntry {
  return note ? { at: now(), action, note } : { at: now(), action };
}

// takeNumber takes the next document number from the settings, in one transaction (nothing else
// may be awaited inside it, or IndexedDB commits it early).
async function takeNumber(): Promise<{ number: number; reference: string }> {
  const database = await db();
  const tx = database.transaction('settings', 'readwrite');
  const stored = await tx.store.get('settings');
  const defaults = defaultSettings();
  const settings = stored ? { ...defaults, ...stored, numbering: { ...defaults.numbering, ...stored.numbering } } : defaults;
  const number = settings.numbering.next;
  settings.numbering.next = number + 1;
  await tx.store.put(settings, 'settings');
  await tx.done;
  return { number, reference: `${settings.numbering.prefix}${number}` };
}

export async function createDocument(templateId: string, options: { title?: string } = {}): Promise<StudioDocument> {
  const database = await db();
  const template = await database.get('templates', templateId);
  if (!template) throw new Error('template not found');
  const version = await database.get('versions', template.currentVersionId);
  if (!version?.compiled) throw new Error('the template does not compile: fix it before filling documents');
  const { number, reference } = await takeNumber();
  const time = now();
  const document: StudioDocument = {
    id: newId(),
    templateId,
    templateVersionId: version.id,
    title: options.title?.trim() || `${template.name} ${reference}`,
    number,
    reference,
    project: '',
    status: 'draft',
    answers: defaultAnswers(version.compiled.fields.fields),
    createdAt: time,
    updatedAt: time,
    finalizedAt: null,
    pdfHash: null,
    pdfAssetId: null,
    revisionOf: null,
    revision: 1,
    log: [entry('created', `from ${template.name} v${version.number}`)],
  };
  await database.put('documents', document);
  return document;
}

async function writeDraft(id: string, change: (document: StudioDocument) => void): Promise<StudioDocument> {
  const database = await db();
  const tx = database.transaction('documents', 'readwrite');
  const document = await tx.store.get(id);
  if (!document) throw new Error('document not found');
  if (document.status !== 'draft') throw new Error('a final document cannot change');
  change(document);
  document.updatedAt = now();
  await tx.store.put(document);
  await tx.done;
  return document;
}

export function saveAnswers(id: string, answers: Answers): Promise<StudioDocument> {
  return writeDraft(id, (document) => {
    document.answers = answers;
  });
}

export function updateDocumentMeta(id: string, change: { title?: string; project?: string }): Promise<StudioDocument> {
  return writeDraft(id, (document) => {
    if (change.title !== undefined) document.title = change.title;
    if (change.project !== undefined) document.project = change.project;
  });
}

// moveToVersion points a draft at another version of its template (usually the latest); answers
// for fields the new version lacks are dropped by the engine when it renders.
export async function moveToVersion(id: string, versionId: string): Promise<StudioDocument> {
  const version = await (await db()).get('versions', versionId);
  if (!version?.compiled) throw new Error('that version does not compile');
  return writeDraft(id, (document) => {
    if (version.templateId !== document.templateId) throw new Error('not a version of this template');
    for (const [key, value] of Object.entries(defaultAnswers(version.compiled!.fields.fields))) {
      if (!(key in document.answers)) document.answers[key] = value;
    }
    document.templateVersionId = versionId;
    document.log.push(entry('moved', `to template v${version.number}`));
  });
}

export async function finalizeDocument(id: string, pdf: Blob, pdfHash: string): Promise<StudioDocument> {
  const asset = await putAsset(pdf, { owner: id, kind: 'pdf', name: 'document.pdf' });
  return writeDraft(id, (document) => {
    document.status = 'final';
    document.finalizedAt = now();
    document.pdfHash = pdfHash;
    document.pdfAssetId = asset.id;
    document.log.push(entry('finalized', `PDF SHA-256 ${pdfHash}`));
  });
}

// copyFiles gives a copy of a document its own copies of the files its answers reference.
async function copyFiles(answers: Answers, owner: string): Promise<Answers> {
  const database = await db();
  const copies = new Map<string, string>();
  for (const id of assetIdsIn(answers)) {
    const asset: Asset | undefined = await database.get('assets', id);
    if (!asset) continue;
    const copy = await putAsset(asset.blob, {
      owner, kind: asset.kind, name: asset.name, width: asset.width, height: asset.height,
    });
    copies.set(id, copy.id);
  }
  return mapAssetRefs(answers, (id) => assetRef(copies.get(id) ?? id)) as Answers;
}

export async function duplicateDocument(id: string): Promise<StudioDocument> {
  const source = await getDocument(id);
  if (!source) throw new Error('document not found');
  const { number, reference } = await takeNumber();
  const copyId = newId();
  const time = now();
  const copy: StudioDocument = {
    ...source,
    id: copyId,
    number,
    reference,
    title: `${source.title} (copy)`,
    status: 'draft',
    answers: await copyFiles(structuredClone(source.answers), copyId),
    createdAt: time,
    updatedAt: time,
    finalizedAt: null,
    pdfHash: null,
    pdfAssetId: null,
    revisionOf: null,
    revision: 1,
    log: [entry('created', `as a copy of ${source.reference}`)],
  };
  await (await db()).put('documents', copy);
  return copy;
}

// reopenAsRevision makes a new draft revision of a final document, keeping its number.
export async function reopenAsRevision(id: string): Promise<StudioDocument> {
  const database = await db();
  const source = await database.get('documents', id);
  if (!source) throw new Error('document not found');
  if (source.status !== 'final') throw new Error('only a final document is reopened');
  const revisionId = newId();
  const time = now();
  const revision: StudioDocument = {
    ...source,
    id: revisionId,
    status: 'draft',
    answers: await copyFiles(structuredClone(source.answers), revisionId),
    createdAt: time,
    updatedAt: time,
    finalizedAt: null,
    pdfHash: null,
    pdfAssetId: null,
    revisionOf: source.id,
    revision: source.revision + 1,
    log: [...source.log, entry('reopened', `as revision ${source.revision + 1}`)],
  };
  source.log.push(entry('reopened', `revision ${source.revision + 1} started`));
  const tx = database.transaction('documents', 'readwrite');
  await tx.store.put(source);
  await tx.store.put(revision);
  await tx.done;
  return revision;
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['documents', 'assets'], 'readwrite');
  for (const key of await tx.objectStore('assets').index('owner').getAllKeys(id)) {
    await tx.objectStore('assets').delete(key);
  }
  await tx.objectStore('documents').delete(id);
  await tx.done;
}

// removeUnusedFiles deletes a draft's photos and signatures that its answers no longer reference.
export async function removeUnusedFiles(document: StudioDocument): Promise<void> {
  const used = new Set(assetIdsIn(document.answers));
  if (document.pdfAssetId) used.add(document.pdfAssetId);
  const database = await db();
  const tx = database.transaction('assets', 'readwrite');
  for (const key of await tx.store.index('owner').getAllKeys(document.id)) {
    if (!used.has(key)) await tx.store.delete(key);
  }
  await tx.done;
}
