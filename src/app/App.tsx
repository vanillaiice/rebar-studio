// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The app shell: a sidebar and the current route. The sidebar names its sections on a wide window
// and folds to a rail of icons on a narrow one, when collapsed (remembered), and in the editor and
// a document, which need the width. The editor (Monaco, several MB) loads
// only when a template is opened, so someone who only fills documents never downloads it.

import { clsx } from 'clsx';
import { BookOpen, FileText, LayoutTemplate, Loader2, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { remember, stored } from '../components/preferences';
import { engine } from '../engine/client';
import { ensureWorkspace } from '../store/seed';
import { DocumentsView } from '../documents/DocumentsView';
import { DocumentView } from '../documents/DocumentView';
import { LibraryView } from '../library/LibraryView';
import { SettingsView } from '../settings/SettingsView';
import { Onboarding } from './Onboarding';
import { OpenFileListener } from './OpenFileListener';
import { UpdatePrompt } from './UpdatePrompt';
import { useSettings } from './useSettings';
import { href, useRoute, type Route } from './router';

const EditorView = lazy(() => import('../editor/EditorView'));
const ReferenceView = lazy(() => import('../reference/ReferenceView'));

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-400">
      <Loader2 className="animate-spin" size={20} />
      {label}
    </div>
  );
}

function NavItem({ to, icon, label, active, wide }: { to: Route; icon: ReactNode; label: string; active: boolean; wide: boolean }) {
  return (
    <a
      href={href(to)}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-xs font-semibold transition',
        wide && 'xl:flex-row xl:gap-3 xl:px-3 xl:text-sm',
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
  const settings = useSettings();
  const [collapsed, setCollapsed] = useState(() => stored<string>('rebar_nav_collapsed', '0') === '1');
  useEffect(() => remember('rebar_nav_collapsed', collapsed ? '1' : '0'), [collapsed]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
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
  const focused = route.name === 'editor' || route.name === 'document';
  const wide = !collapsed && !focused;
  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-brand-steel-dark text-slate-200">
      <nav
        aria-label="Main"
        className={clsx('flex w-16 shrink-0 flex-col gap-1 border-r border-white/10 bg-brand-steel px-2 py-3 sm:w-20', wide && 'xl:w-56 xl:px-3')}
      >
        <div className={clsx('mb-4 flex items-center justify-center gap-3', wide && 'xl:justify-start xl:px-2')} title="Rebar Studio">
          <img src="favicon.svg" alt="Rebar Studio" className="h-9 w-9 shrink-0" />
          {wide && <span className="hidden text-base font-bold tracking-tight text-white xl:inline">Rebar Studio</span>}
        </div>
        <NavItem to={{ name: 'library' }} icon={<LayoutTemplate size={22} />} label="Templates" active={section === 'library'} wide={wide} />
        <NavItem to={{ name: 'documents', templateId: null }} icon={<FileText size={22} />} label="Documents" active={section === 'documents'} wide={wide} />
        <div className="flex-1" />
        <NavItem to={{ name: 'reference' }} icon={<BookOpen size={22} />} label="Reference" active={section === 'reference'} wide={wide} />
        <NavItem to={{ name: 'settings' }} icon={<SettingsIcon size={22} />} label="Settings" active={section === 'settings'} wide={wide} />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx('mt-2 hidden items-center justify-center gap-3 rounded-lg py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-white', !focused && 'xl:flex', wide && 'xl:justify-start xl:px-3')}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          {wide && <span>Collapse</span>}
        </button>
      </nav>
      <main className="min-w-0 flex-1 overflow-hidden">{content}</main>
      {state.ready && <Onboarding />}
      {state.ready && <OpenFileListener />}
      <UpdatePrompt />
    </div>
  );
}
