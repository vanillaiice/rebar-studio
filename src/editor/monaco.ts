// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Monaco, loaded with the editor route only. Just what the editor uses: the core editor plus the
// HTML (.reb source, compiled output) and JSON (schema) languages; importing 'monaco-editor' itself
// registers every language and ships unused TypeScript and CSS workers (about 8 MB).

import { loader, type Monaco } from '@monaco-editor/react';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/language/html/monaco.contribution.js';
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker.js?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker.js?worker';
import type { Marker } from './diagnostics';
import { SNIPPETS } from './snippets';

// One worker per language service, plus the core editor worker (labels are Monaco's language ids).
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    return new EditorWorker();
  },
};

// The bundled Monaco, never a CDN: Studio works offline.
loader.config({ monaco: monaco as unknown as typeof import('monaco-editor') });

// Monaco is shared by every editor mount: register completions once, or the list gains a copy of
// every snippet per mount.
let completionsRegistered = false;

export function registerCompletions(instance: Monaco) {
  if (completionsRegistered) return;
  completionsRegistered = true;
  instance.languages.registerCompletionItemProvider('html', {
    provideCompletionItems(model: import('monaco-editor').editor.ITextModel, position: import('monaco-editor').Position) {
      // Components go between tags, never inside one (an attribute value, a tag name).
      const before = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
      if (before.lastIndexOf('<') > before.lastIndexOf('>')) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: SNIPPETS.map((snippet) => ({
          label: snippet.label,
          kind: instance.languages.CompletionItemKind.Snippet,
          insertText: snippet.snippet,
          documentation: snippet.help ?? `Insert ${snippet.label.toLowerCase()}`,
          range,
        })),
      };
    },
  });
}

export function setMarkers(instance: Monaco, model: import('monaco-editor').editor.ITextModel, markers: Marker[]) {
  instance.editor.setModelMarkers(
    model,
    'reb',
    markers.map((marker) => ({
      severity: marker.severity === 'error' ? instance.MarkerSeverity.Error : instance.MarkerSeverity.Warning,
      message: marker.message,
      startLineNumber: marker.line,
      startColumn: marker.column,
      endLineNumber: marker.endLine,
      endColumn: marker.endColumn,
    })),
  );
}
