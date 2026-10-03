// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

export const THEMES = [
  { id: 'amber', name: 'Amber', color: '#facc15' },
  { id: 'ocean', name: 'Ocean', color: '#7dd3fc' },
  { id: 'forest', name: 'Forest', color: '#6ee7b7' },
  { id: 'violet', name: 'Violet', color: '#c4b5fd' },
] as const;

export type Theme = typeof THEMES[number]['id'];
