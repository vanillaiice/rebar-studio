// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

import { useEffect, useState } from 'react';
import { defaultSettings, getSettings, subscribeSettings } from '../store/settings';
import type { Settings } from '../store/types';

// useSettings is the stored settings (the defaults until they load), kept current.
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  useEffect(() => {
    let cancelled = false;
    void getSettings().then((s) => !cancelled && setSettings(s));
    const unsubscribe = subscribeSettings(setSettings);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return settings;
}
