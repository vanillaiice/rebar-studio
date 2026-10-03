// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

import { db } from './db';
import type { Settings } from './types';

const KEY = 'settings';

export function defaultSettings(): Settings {
  return {
    profile: { organizationName: '', authorName: '', address: '', logoAssetId: null },
    numbering: { prefix: 'D-', next: 1 },
    fileNamePattern: '{template}-{reference}-{date}',
    photos: { maxEdge: 2000, keepOriginal: false },
    lastBackupAt: null,
    backupReminderDays: 7,
    onboarded: false,
    updates: { autoCheck: true, channel: 'stable' },
  };
}

// Stored settings over the defaults, so a setting added later has a value in older databases.
export async function getSettings(): Promise<Settings> {
  const stored = await (await db()).get('settings', KEY);
  const defaults = defaultSettings();
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    profile: { ...defaults.profile, ...stored.profile },
    numbering: { ...defaults.numbering, ...stored.numbering },
    updates: { ...defaults.updates, ...stored.updates },
    photos: { ...defaults.photos, ...stored.photos },
  };
}

const listeners = new Set<(settings: Settings) => void>();

// subscribeSettings calls back after every change made through this module.
export function subscribeSettings(listener: (settings: Settings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await db()).put('settings', settings, KEY);
  listeners.forEach((listener) => listener(settings));
}

export async function updateSettings(change: (settings: Settings) => void): Promise<Settings> {
  const settings = await getSettings();
  change(settings);
  await saveSettings(settings);
  return settings;
}
