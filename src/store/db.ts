// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The IndexedDB database. Schema changes add an `if (oldVersion < N)` step to upgrade(); existing
// steps never change, so every older database migrates forward.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Asset, Settings, StudioDocument, Template, TemplateVersion } from './types';

interface StudioDB extends DBSchema {
  templates: { key: string; value: Template; indexes: { updatedAt: string } };
  versions: { key: string; value: TemplateVersion; indexes: { templateId: string } };
  documents: {
    key: string;
    value: StudioDocument;
    indexes: { templateId: string; templateVersionId: string; updatedAt: string };
  };
  assets: { key: string; value: Asset; indexes: { owner: string } };
  settings: { key: string; value: Settings };
}

export type StudioDatabase = IDBPDatabase<StudioDB>;

export const DB_VERSION = 1;
let name = 'rebar-studio';
let opened: Promise<StudioDatabase> | null = null;

export function db(): Promise<StudioDatabase> {
  opened ??= openDB<StudioDB>(name, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('templates', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        database.createObjectStore('versions', { keyPath: 'id' }).createIndex('templateId', 'templateId');
        const documents = database.createObjectStore('documents', { keyPath: 'id' });
        documents.createIndex('templateId', 'templateId');
        documents.createIndex('templateVersionId', 'templateVersionId');
        documents.createIndex('updatedAt', 'updatedAt');
        database.createObjectStore('assets', { keyPath: 'id' }).createIndex('owner', 'owner');
        database.createObjectStore('settings');
      }
    },
    blocking() {
      // Another tab upgrades the database: let it, and reload here on next use.
      void opened?.then((d) => d.close());
      opened = null;
    },
  });
  return opened;
}

// For tests: use a fresh database under another name.
export async function useDatabase(databaseName: string): Promise<void> {
  if (opened) (await opened).close();
  opened = null;
  name = databaseName;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
