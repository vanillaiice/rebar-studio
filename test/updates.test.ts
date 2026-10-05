// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { updateChannel } = createRequire(import.meta.url)('../electron/updates.cjs') as { updateChannel(setting: string, version: string): string };

describe('updateChannel', () => {
  it('follows the setting on a stable build', () => {
    expect(updateChannel('stable', '1.0.0')).toBe('latest');
    expect(updateChannel('beta', '1.0.0')).toBe('beta');
  });

  it('keeps a beta build on the betas, whatever the setting', () => {
    expect(updateChannel('stable', '1.0.0-beta.1')).toBe('beta');
    expect(updateChannel('beta', '1.0.0-beta.1')).toBe('beta');
  });
});
