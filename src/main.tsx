// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs — Rebar Studio (.reb template editor)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loader } from '@monaco-editor/react'
// Only what the editor uses: the core editor features plus the HTML (.reb source, compiled
// output) and JSON (schema) languages. Importing 'monaco-editor' itself registers every
// language and made the build ship unused TypeScript and CSS workers (about 8 MB).
import 'monaco-editor/esm/vs/editor/editor.all.js'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/language/html/monaco.contribution.js'
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker.js?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker.js?worker'

// One worker per language service, plus the core editor worker; without this Monaco runs them on
// the main thread (and warns). Labels are the language ids Monaco asks for.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    return new EditorWorker()
  },
}

// Force the editor to use the localized bundled engine instead of jsdelivr CDN
loader.config({ monaco: monaco as unknown as typeof import('monaco-editor') });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
