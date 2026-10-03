// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The app shell: a navigation rail and the current route. The editor (Monaco, several MB) loads
// only when a template is opened, so someone who only fills documents never downloads it.

import { clsx } from 'clsx';
import { BookOpen, FileText, LayoutTemplate, Loader2, Settings as SettingsIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { engine } from '../engine/client';
import { ensureWorkspace } from '../store/seed';
import { DocumentsView } from '../documents/DocumentsView';
import { DocumentView } from '../documents/DocumentView';
import { LibraryView } from '../library/LibraryView';
import { SettingsView } from '../settings/SettingsView';
import { Onboarding } from './Onboarding';
import { OpenFileListener } from './OpenFileListener';
import { UpdatePrompt } from './UpdatePrompt';
import { href, useRoute, type Route } from './router';

const EditorView = lazy(() => import('../editor/EditorView'));
const ReferenceView = lazy(() => import('../reference/ReferenceView'));

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-400">
      <Loader2 className="animate-spin" size={18} />
      {label}
    </div>
  );
}

function NavItem({ to, icon, label, active }: { to: Route; icon: ReactNode; label: string; active: boolean }) {
  return (
    <a
      href={href(to)}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold transition',
        active ? 'bg-brand-amber/15 text-brand-amber' : 'text-slate-400 hover:bg-white/5 hover:text-white',
      )}
    >
      {icon}
      <span className="max-sm:hidden">{label}</span>
    </a>
  );
}

export default function App() {
  const route = useRoute();
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    engine
      .ready()
      .then(() => ensureWorkspace())
      .then(() => {
        // Ask the browser to keep the workspace (it may decline; Settings shows the outcome).
        void navigator.storage?.persist?.().catch(() => false);
        if (!cancelled) setState({ ready: true, error: null });
      })
      .catch((e) => !cancelled && setState({ ready: false, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, []);

  let content: ReactNode;
  if (state.error) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-lg font-bold text-white">Rebar Studio could not start</h1>
        <p className="max-w-md text-sm text-red-300">{state.error}</p>
      </div>
    );
  } else if (!state.ready) {
    content = <Loading label="Loading the engine…" />;
  } else {
    switch (route.name) {
      case 'library':
        content = <LibraryView />;
        break;
      case 'editor':
        content = (
          <Suspense fallback={<Loading label="Loading the editor…" />}>
            <EditorView key={route.id} templateId={route.id} />
          </Suspense>
        );
        break;
      case 'documents':
        content = <DocumentsView templateId={route.templateId} />;
        break;
      case 'document':
        content = <DocumentView key={route.id} documentId={route.id} />;
        break;
      case 'settings':
        content = <SettingsView />;
        break;
      case 'reference':
        content = (
          <Suspense fallback={<Loading label="Loading the reference…" />}>
            <ReferenceView />
          </Suspense>
        );
        break;
    }
  }

  const section = route.name === 'editor' ? 'library' : route.name === 'document' ? 'documents' : route.name;
  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-brand-steel-dark text-slate-200">
      <nav aria-label="Main" className="flex w-16 shrink-0 flex-col gap-1 border-r border-white/10 bg-brand-steel px-1.5 py-3 sm:w-[72px]">
        <div className="mb-3 flex justify-center" title="Rebar Studio">
          <img src="favicon.svg" alt="Rebar Studio" className="h-8 w-8" />
        </div>
        <NavItem to={{ name: 'library' }} icon={<LayoutTemplate size={20} />} label="Templates" active={section === 'library'} />
        <NavItem to={{ name: 'documents', templateId: null }} icon={<FileText size={20} />} label="Documents" active={section === 'documents'} />
        <div className="flex-1" />
        <NavItem to={{ name: 'reference' }} icon={<BookOpen size={20} />} label="Reference" active={section === 'reference'} />
        <NavItem to={{ name: 'settings' }} icon={<SettingsIcon size={20} />} label="Settings" active={section === 'settings'} />
      </nav>
      <main className="min-w-0 flex-1 overflow-hidden">{content}</main>
      {state.ready && <Onboarding />}
      {state.ready && <OpenFileListener />}
      <UpdatePrompt />
    </div>
  );
}
