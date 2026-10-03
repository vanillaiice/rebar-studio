// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A hash router: the app is one static page (the PWA and Electron both load it from files), so routes
// live in the URL fragment.
//
//   #/                    template library
//   #/templates/:id       editor
//   #/documents           documents (?template=<id>)
//   #/documents/:id       fill a document
//   #/settings            settings and storage
//   #/reference           the .reb specification

import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'editor'; id: string }
  | { name: 'documents'; templateId: string | null }
  | { name: 'document'; id: string }
  | { name: 'settings' }
  | { name: 'reference' };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  if (parts[0] === 'templates' && parts[1]) return { name: 'editor', id: parts[1] };
  if (parts[0] === 'documents' && parts[1]) return { name: 'document', id: parts[1] };
  if (parts[0] === 'documents') return { name: 'documents', templateId: params.get('template') };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'reference') return { name: 'reference' };
  return { name: 'library' };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'library':
      return '#/';
    case 'editor':
      return `#/templates/${encodeURIComponent(route.id)}`;
    case 'documents':
      return route.templateId ? `#/documents?template=${encodeURIComponent(route.templateId)}` : '#/documents';
    case 'document':
      return `#/documents/${encodeURIComponent(route.id)}`;
    case 'settings':
      return '#/settings';
    case 'reference':
      return '#/reference';
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
