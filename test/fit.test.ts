// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { describe, expect, it } from 'vitest';
import { A4_WIDTH, fitZoom } from '../src/render/fit';

describe('fitZoom', () => {
  it('fits the page into the width in 5% steps', () => {
    expect(fitZoom(A4_WIDTH + 48, A4_WIDTH)).toBe(1);
    expect(fitZoom(920, A4_WIDTH)).toBe(1.05); // 1.098 rounds down: the page never overflows
    expect(fitZoom(640, A4_WIDTH)).toBe(0.7);
  });

  it('stays readable at the extremes', () => {
    expect(fitZoom(100, A4_WIDTH)).toBe(0.25);
    expect(fitZoom(5000, A4_WIDTH)).toBe(2);
    expect(fitZoom(0, A4_WIDTH)).toBe(1); // not measured yet
  });
});
