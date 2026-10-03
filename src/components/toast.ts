// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

import { createContext, useContext } from 'react';

export type Toast = { id: number; message: string; kind: 'info' | 'error' | 'success'; action?: { label: string; run(): void } };

export const ToastContext = createContext<(message: string, kind?: Toast['kind'], action?: Toast['action']) => void>(() => {});

// useToast shows a short message (with an optional action) at the bottom of the window.
export function useToast() {
  return useContext(ToastContext);
}
