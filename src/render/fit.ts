// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The preview's 'fit' zoom: pages as wide as their pane allows.

// An A4 page in CSS pixels, until the first page says otherwise.
export const A4_WIDTH = 794;
// Room beside a fitted page: the scroll column's padding and a scrollbar.
const GUTTER = 48;

// fitZoom is the zoom that fits a page into the width, in steps of 5% so that resizing a pane
// redraws the pages a few times, not on every pixel.
export function fitZoom(width: number, pageWidth: number): number {
  if (width <= 0 || pageWidth <= 0) return 1;
  const exact = (width - GUTTER) / pageWidth;
  return Math.min(2, Math.max(0.25, Math.floor(exact * 20) / 20));
}
