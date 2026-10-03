// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// What Studio keeps in IndexedDB (docs/plan.md D3). A document always points at an immutable
// template version, so editing a template never changes existing documents.

import type { Answers, Schema } from '../engine/types';

export interface Template {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  currentVersionId: string;
  archived: boolean;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  number: number;
  rebSource: string;
  // The last successful compile of rebSource; null while the source does not compile.
  compiled: CompiledVersion | null;
  compileError: string | null;
  // Images the template refers to by file name (<img src="logo.png">): file name -> asset id.
  // A new version shares the previous one's assets.
  assets: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export interface CompiledVersion {
  html: string;
  schema: unknown[];
  fields: Schema;
  engineVersion: string;
}

export type DocumentStatus = 'draft' | 'final';

export interface LogEntry {
  at: string;
  action: string;
  note?: string;
}

export interface StudioDocument {
  id: string;
  templateId: string;
  templateVersionId: string;
  title: string;
  number: number;
  reference: string;
  project: string;
  status: DocumentStatus;
  // As typed, hidden fields included (the engine drops them when the document renders). Files are
  // referenced as "asset:<id>", never inlined.
  answers: Answers;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  pdfHash: string | null; // SHA-256 of the final PDF, hex
  pdfAssetId: string | null;
  revisionOf: string | null;
  revision: number;
  log: LogEntry[];
}

export type AssetKind = 'template' | 'photo' | 'signature' | 'logo' | 'pdf';

export interface Asset {
  id: string;
  owner: string; // template id, document id, or "settings"
  kind: AssetKind;
  name: string;
  mime: string;
  blob: Blob;
  size: number;
  width?: number;
  height?: number;
  sha256: string;
  createdAt: string;
}

export interface Settings {
  profile: {
    organizationName: string;
    authorName: string; // {{.ReporterName}}
    address: string;
    logoAssetId: string | null;
  };
  numbering: { prefix: string; next: number };
  fileNamePattern: string;
  openAfterSave: boolean; // desktop: open exported PDFs, registers and folders once saved
  photos: { maxEdge: number; keepOriginal: boolean };
  lastBackupAt: string | null;
  backupReminderDays: number;
  onboarded: boolean;
  updates: { autoCheck: boolean; channel: 'stable' | 'beta' };
}

export const ASSET_REF = 'asset:';

export function assetRef(id: string): string {
  return ASSET_REF + id;
}

export function assetIdOf(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith(ASSET_REF) ? value.slice(ASSET_REF.length) : null;
}
