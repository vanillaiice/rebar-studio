// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { describe, expect, it } from 'vitest';
import { markersFor } from '../src/editor/diagnostics';
import { testEngine } from './engine';

describe('editor markers', () => {
  it('puts an invalid field name on its tag', async () => {
    const source = '<p>x</p>\n<p>\n  <reb-text name="9lives" label="Lives"></reb-text>\n</p>';
    const [marker] = markersFor(source, (await testEngine()).compile(source));
    expect(marker).toMatchObject({ severity: 'error', line: 3, column: 3 });
  });

  it('marks fields without a label and unknown show-if fields as warnings', async () => {
    const source = '<reb-text name="a"></reb-text>\n<reb-text name="b" label="B" show-if="ghost"></reb-text>';
    const markers = markersFor(source, (await testEngine()).compile(source));
    expect(markers.map((m) => [m.severity, m.line])).toEqual([['warning', 1], ['warning', 2]]);
  });

  it('places template syntax errors on the action', async () => {
    const source = '<p>ok</p>\n<p>{{ nosuchfunc .a }}</p>';
    const result = (await testEngine()).compile(source);
    expect(result.ok).toBe(false);
    const [marker] = markersFor(source, result);
    expect(marker.line).toBe(2);
  });
});
