// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// New versions: the web app's service worker, or the desktop app's updater, has one ready. Studio
// never reloads by itself (a form may be open): it asks.

import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/ui';
import { desktop, type UpdateStatus } from '../platform/bridge';
import { getSettings } from '../store/settings';

function Bar({ message, action, onAction, onClose }: { message: string; action: string; onAction(): void; onClose(): void }) {
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-brand-amber/40 bg-brand-steel px-4 py-3 text-sm text-slate-100 shadow-2xl">
      <RefreshCw size={18} className="text-brand-amber" />
      {message}
      <Button size="sm" variant="primary" onClick={onAction}>{action}</Button>
      <button type="button" aria-label="Later" onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
    </div>
  );
}

function WebUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  if (!needRefresh) return null;
  return <Bar message="A new version of Studio is available." action="Reload" onAction={() => void updateServiceWorker(true)} onClose={() => setNeedRefresh(false)} />;
}

function DesktopUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const unsubscribe = desktop!.onUpdateStatus(setStatus);
    void getSettings().then((settings) => {
      if (settings.updates.autoCheck) void desktop!.checkForUpdates(settings.updates.channel).then(setStatus);
    });
    return unsubscribe;
  }, []);
  if (closed || status.state !== 'ready') return null;
  return <Bar message={`Version ${status.version} is ready to install.`} action="Restart" onAction={() => void desktop!.installUpdate()} onClose={() => setClosed(true)} />;
}

export function UpdatePrompt() {
  return desktop ? <DesktopUpdate /> : <WebUpdate />;
}
