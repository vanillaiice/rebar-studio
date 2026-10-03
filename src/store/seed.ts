// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// First run: the template the old single-buffer editor kept in localStorage becomes a real
// template, so nobody loses work by updating; a new workspace starts with the permit starter.

import { engine } from '../engine/client';
import { STARTERS } from '../starters';
import { db } from './db';
import { createTemplate } from './templates';

const LEGACY_SOURCE_KEY = 'rebar_editor_code';

export async function ensureWorkspace(): Promise<void> {
  const database = await db();
  if ((await database.count('templates')) > 0) return;
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_SOURCE_KEY);
  } catch {
    // storage blocked: nothing to migrate
  }
  if (legacy?.trim()) {
    await createTemplate({ name: 'My template', source: legacy, result: await engine.compile(legacy) });
    localStorage.removeItem(LEGACY_SOURCE_KEY);
    return;
  }
  const starter = STARTERS[0];
  await createTemplate({
    name: starter.name,
    description: starter.description,
    tags: starter.tags,
    source: starter.source,
    result: await engine.compile(starter.source),
  });
}
