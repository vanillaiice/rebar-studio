// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs — Rebar Studio (.reb template editor)
import { useState, useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { Monaco, OnMount } from '@monaco-editor/react';
import type * as MonacoApi from 'monaco-editor';
import { FileCode2, Eye, Download, Upload, Code2, Database, LayoutTemplate, PlusCircle, Columns2, Rows2, SquareStack, PanelLeftClose, PanelLeftOpen, FileDown } from 'lucide-react';
import type { CompilationResult } from './compiler';
import { compile, initRebCompiler } from './wasm';

const EMPTY_RESULT: CompilationResult = {
  schema: [],
  htmlSource: '',
  previewHtml: '',
  paperWidth: '210mm',
  paperHeight: '297mm',
};

// Locally-bundled Tailwind browser build (same version the PDF backend embeds),
// resolved to an absolute URL so it loads inside the sandboxed srcdoc iframe —
// offline-capable (Electron) and pixel-matched to the rendered PDF.
const TAILWIND_HREF = new URL('tailwindcss.js', document.baseURI).href;

// Locally-bundled paged.js polyfill (CSS Paged Media) — web-preview fallback.
const PAGED_HREF = new URL('paged.polyfill.js', document.baseURI).href;

// Under the Electron desktop build (nodeIntegration), the renderer can reach the main
// process to render the document with Chromium's own print engine — the same
// engine the Gotenberg backend uses — for a true-to-PDF preview (named landscape
// pages, footers, @page sizes that paged.js can't do). In the browser
// (`npm run dev`) we fall back to paged.js.
type ElectronIpc = { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
const electronIpc: ElectronIpc | null = (() => {
  try {
    const req = (window as unknown as { require?: (m: string) => { ipcRenderer: ElectronIpc } }).require;
    return req ? req('electron').ipcRenderer : null;
  } catch {
    return null;
  }
})();
const IS_ELECTRON = electronIpc !== null;

let tailwindSourcePromise: Promise<string> | null = null;
function getTailwindSource(): Promise<string> {
  if (!tailwindSourcePromise) {
    tailwindSourcePromise = fetch(TAILWIND_HREF).then((r) => r.text());
  }
  return tailwindSourcePromise;
}

// Build a standalone HTML document + Chromium footer template for printToPDF.
// Tailwind is inlined so the temp file the main process renders has no external
// dependencies. Chromium paginates natively, so named @page rules just work.
async function buildElectronDocument(previewHtml: string): Promise<{ html: string; footer: string }> {
  const doc = new DOMParser().parseFromString(previewHtml, 'text/html');
  doc.querySelectorAll('script[src$="tailwindcss.js"]').forEach((s) => s.remove());

  // Preserve author <style> attributes (esp. type="text/tailwindcss" for custom
  // @theme colors). Chromium honors @page from anywhere, but Tailwind needs its
  // input style present before the script runs.
  let userStyles = '';
  doc.querySelectorAll('style').forEach((s) => {
    userStyles += s.outerHTML + '\n';
    s.remove();
  });
  const hasUserSize = /@page[^{]*\{[^}]*\bsize\s*:/i.test(userStyles);

  // reb-footer becomes Chromium's footer template (its .pageNumber/.totalPages
  // spans are exactly the classes Chromium fills — same as the Gotenberg path).
  let footer = '';
  doc.querySelectorAll('rebar-pdf-footer-extract').forEach((el) => {
    footer += el.innerHTML;
    el.remove();
  });

  const tailwind = await getTailwindSource();

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { ${hasUserSize ? '' : 'size: A4;'} margin: 0.5in; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
${userStyles}
<script>${tailwind}</script>
<script>
  (function () {
    function settled(cb) {
      var done = false, t = null;
      function finish() {
        if (done) return; done = true;
        observer.disconnect(); clearTimeout(hardCap);
        (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(cb);
      }
      function bump() { clearTimeout(t); t = setTimeout(finish, 120); }
      var observer = new MutationObserver(bump);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      var hardCap = setTimeout(finish, 5000);
      bump();
    }
    window.addEventListener('load', function () { settled(function () { window.__rebReady = true; }); });
  })();
</script>
</head>
<body>${doc.body.innerHTML}</body>
</html>`;

  const footerTemplate = footer
    ? `<div style="font-size:9px; width:100%; padding:0 12mm; box-sizing:border-box;">${footer}</div>`
    : '';

  return { html, footer: footerTemplate };
}

// buildPagedDocument assembles the live preview document: the faithfully-compiled
// HTML laid out by paged.js (CSS Paged Media) in the editor's own Chromium engine.
// This IS the final PDF — same pagination, A4/0.5in margins, the reb-footer as a
// running element in every page's bottom margin with live counters, and real page
// breaks. Printing it (Ctrl/Cmd+P → Save as PDF) reproduces it exactly, the same
// way the Gotenberg/Chromium backend renders it.
function buildPagedDocument(previewHtml: string): string {
  const doc = new DOMParser().parseFromString(previewHtml, 'text/html');

  // Tailwind is loaded in <head> below (before pagination) for correct layout.
  doc.querySelectorAll('script[src$="tailwindcss.js"]').forEach((s) => s.remove());

  // Hoist author <style> blocks into <head>: paged.js does not process @page
  // rules (page size/orientation) from a <style> in the body, and Tailwind's
  // <style type="text/tailwindcss"> input (custom @theme colors, etc.) must be
  // present before the Tailwind script runs. Emit outerHTML so attributes like
  // type="text/tailwindcss" are preserved — otherwise custom theme colors are
  // silently dropped and the document renders without color.
  let userStyles = '';
  let userCss = '';
  doc.querySelectorAll('style').forEach((s) => {
    userStyles += s.outerHTML + '\n';
    userCss += (s.textContent ?? '') + '\n';
    s.remove();
  });

  // paged.js only recognizes uppercase page-size names ("A4", not "a4"); a
  // lowercase name silently falls back to US Letter. Chromium (the real backend)
  // is case-insensitive, so normalize for the preview.
  userStyles = userStyles.replace(
    /(\bsize\s*:\s*)([^;}<]+)/gi,
    (_, pre, val) => pre + val.replace(/\b([ab]\d{1,2})\b/gi, (t: string) => t.toUpperCase()),
  );

  // Turn the hidden footer-extract into a paged.js running element. It must sit
  // at the START of the body so paged.js makes it "running" from the first page
  // (running elements only repeat on pages at/after their source position).
  let footerHtml = '';
  doc.querySelectorAll('rebar-pdf-footer-extract').forEach((el) => {
    const cls = ('reb-print-footer ' + (el.getAttribute('class') ?? '')).trim();
    footerHtml += `<div class="${cls}">${el.innerHTML}</div>`;
    el.remove();
  });

  // Respect a template-specified page size (e.g. `@page { size: A4 landscape }`).
  // Only default to A4 when the template sets no size (paged.js defaults to US
  // Letter), mirroring the backend's preferCssPageSize behavior.
  const hasUserSize = /@page[^{]*\{[^}]*\bsize\s*:/i.test(userCss);

  const footerCss = footerHtml
    ? `@page { margin-bottom: 1in; @bottom-center { content: element(rebFooter); } }
       .reb-print-footer { position: running(rebFooter); }`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  /* Base page setup — author @page rules (hoisted below) override size/margin. */
  @page { ${hasUserSize ? '' : 'size: A4;'} margin: 0.5in; }
  /* On-screen page styling. paged.js strips @media screen rules, so these are
     unconditional (harmless in the print box: backgrounds/shadows don't print). */
  body { margin: 0; padding: 16px 0; }
  .pagedjs_page { background: #fff; margin: 0 auto 16px; box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.35); border-radius: 9999px; }
</style>
${userStyles}
<style>
  /* Footer margin box last, so its margin-bottom survives author margin rules. */
  ${footerCss}
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
<script src="${TAILWIND_HREF}"></script>
<script>window.PagedConfig = { auto: false };</script>
<script src="${PAGED_HREF}"></script>
<script>
  // The Tailwind v4 browser build exposes no "done" event — it injects a <style>
  // via a microtask-scheduled MutationObserver. So instead of a fixed delay, wait
  // until <head> mutations settle (Tailwind stopped writing CSS) and fonts are
  // ready, then paginate. A hard cap keeps it from hanging.
  function paginate() {
    window.PagedPolyfill.preview().then(function (flow) {
      var total = flow ? flow.total : document.querySelectorAll('.pagedjs_page').length;
      document.querySelectorAll('.pagedjs_page').forEach(function (page, i) {
        page.querySelectorAll('.pageNumber').forEach(function (s) { s.textContent = String(i + 1); });
        page.querySelectorAll('.totalPages').forEach(function (s) { s.textContent = String(total); });
      });
      // Restore the previous scroll position across debounced re-renders.
      var y = sessionStorage.getItem('rebPreviewScroll');
      if (y) window.scrollTo(0, parseInt(y, 10));
      window.addEventListener('scroll', function () {
        sessionStorage.setItem('rebPreviewScroll', String(window.scrollY));
      });
      parent.postMessage({ type: 'reb-paged-done', pages: total }, '*');
    });
  }

  function whenStylesSettled(callback) {
    var done = false;
    var settleTimer = null;
    function finish() {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(hardCap);
      Promise.resolve(document.fonts && document.fonts.ready).then(callback);
    }
    function bump() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, 120); // quiet window after last CSS write
    }
    var observer = new MutationObserver(bump);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    var hardCap = setTimeout(finish, 5000);
    bump(); // also proceed if Tailwind already finished before load
  }

  window.addEventListener('load', function () { whenStylesSettled(paginate); });
</script>
</head>
<body>
${footerHtml}${doc.body.innerHTML}
</body>
</html>`;
}

const DEFAULT_REB = `<!-- Explicitly request Tailwind CSS styling for this document -->
<reb-tailwind></reb-tailwind>

<style>
  body {
    font-family: Arial, sans-serif;
    color: #1a202c;
    line-height: 1.6;
  }
  .header-card {
    border-left: 6px solid #d97706;
    background-color: #fef3c7;
    padding: 16px;
    margin-bottom: 20px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 30px;
  }
</style>

<div class="max-w-3xl mx-auto bg-white p-8 shadow-sm">
  <div class="header-card">
    <h2 class="text-xl font-bold">High Risk Work Authorization Certificate</h2>
  </div>

  <div class="meta-grid">
    <div>
      <strong class="block text-sm text-slate-500 mb-1">Permit Reference:</strong>
      <reb-number name="permit_number" label="Authorized Permit Number" class="text-slate-800 font-semibold"></reb-number>
    </div>
    <div>
      <strong class="block text-sm text-slate-500 mb-1">Clearance Category:</strong>
      <reb-select name="clearance_type" label="Operational Clearance Category" options="Hot Work, Confined Space Entry, Electrical Isolation"></reb-select>
    </div>
  </div>

  <div class="status-box bg-slate-50 p-4 border border-slate-200 rounded">
    <div class="mb-4">
      <strong class="block text-sm text-slate-500 mb-1">PPE Controls Verified:</strong> 
      <reb-text name="ppe_verified" label="Protective Gears Inspected"></reb-text>
    </div>
    
    <h3 class="mt-4 font-bold text-slate-700">Additional Notes</h3>
    <reb-textarea name="inspector_notes" label="Inspector Comments" class="mt-2 text-sm italic"></reb-textarea>
  </div>
</div>

<reb-footer>
  <div style="width: 100%; display: block; padding: 0 40px; box-sizing: border-box;">
    <div style="border-top: 1px solid #cbd5e1; margin-bottom: 8px; width: 100%; display: block;"></div>
    <div style="text-align: center; font-size: 10px; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; letter-spacing: 0.1em; text-transform: uppercase; width: 100%; display: block;">
      Rebar Automated Document System — Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </div>
  </div>
</reb-footer>`;

type EditorTab = 'reb' | 'html' | 'json';
type LayoutMode = 'split' | 'stacked' | 'tabs';
type MainView = 'editor' | 'preview';

const REBAR_SNIPPETS = [
  { label: 'Text Field', snippet: '<reb-text name="field_name" label="Field Label"></reb-text>' },
  { label: 'Text Area', snippet: '<reb-textarea name="field_name" label="Field Label"></reb-textarea>' },
  { label: 'Number', snippet: '<reb-number name="field_name" label="Field Label"></reb-number>' },
  { label: 'Date', snippet: '<reb-date name="field_name" label="Field Label"></reb-date>' },
  { label: 'Select Dropdown', snippet: '<reb-select name="field_name" label="Field Label" options="Option 1, Option 2"></reb-select>' },
  { label: 'Radio Buttons', snippet: '<reb-radio name="field_name" label="Field Label" options="Yes, No"></reb-radio>' },
  { label: 'Photo Grid', snippet: '<reb-photogrid name="photos" label="Photo Evidence"></reb-photogrid>' },
  { label: 'File Attachments', snippet: '<reb-attachments name="attachments" label="Document Attachments"></reb-attachments>' },
  { label: 'Signature Pad', snippet: '<reb-signature name="inspector_sig" label="Inspector Signature"></reb-signature>' },
  { label: 'Data Table', snippet: '<reb-table name="table_data" label="Data Table" options="col1:text,col2:text"></reb-table>' },
  { label: 'Formula Table (Estimate)', snippet: '<reb-table name="estimate_items" label="Estimate Details" options="description:text,quantity:number,unit_price:number,amount:formula[quantity*unit_price|2]">\n  <table class="w-full text-sm border-collapse">\n    <thead>\n      <tr class="bg-slate-100">\n        <th class="p-2 border">Description</th>\n        <th class="p-2 border w-24">Qty</th>\n        <th class="p-2 border w-32">Rate</th>\n        <th class="p-2 border w-32">Amount</th>\n      </tr>\n    </thead>\n    <tbody>\n      <tr reb-row>\n        <td class="p-1 border"><reb-declare name="description"></reb-declare>{{.description}}</td>\n        <td class="p-1 border"><reb-declare name="quantity" type="number"></reb-declare>{{.quantity}}</td>\n        <td class="p-1 border"><reb-declare name="unit_price" type="number"></reb-declare>${{.unit_price}}</td>\n        <td class="p-1 border font-bold">${{multiply .quantity .unit_price | formatNumber 2}}</td>\n      </tr>\n    </tbody>\n  </table>\n  <div class="text-right font-bold mt-2 text-lg">\n    Grand Total: ${{sumColumn .estimate_items "amount" | formatNumber 2}}\n  </div>\n</reb-table>' },
  { label: 'Table Row', snippet: '<tr reb-row></tr>' },
  { label: 'Page Break', snippet: '<reb-pagebreak></reb-pagebreak>' },
  { label: 'Footer', snippet: '<reb-footer>\n  <div style="width: 100%; display: block; padding: 0 40px; box-sizing: border-box;">\n    <div style="border-top: 1px solid #cbd5e1; margin-bottom: 4px; width: 100%; display: block;"></div>\n    <div style="text-align: center; font-size: 14px; font-family: sans-serif; width: 100%; display: block; color: #64748b;">\n      Page <span class="pageNumber"></span> of <span class="totalPages"></span>\n    </div>\n  </div>\n</reb-footer>' },
  { label: 'Hidden Field', snippet: '<reb-declare name="field_name" label="Hidden Field" type="string"></reb-declare>' },
  { label: 'Section Divider', snippet: '<reb-declare type="section" name="section_1" label="Section Title"></reb-declare>' },
  { label: 'Current Date/Time', snippet: '{{ now | formatDate "02/01/2006" }}' },
  { label: 'Tailwind Config', snippet: '<reb-tailwind></reb-tailwind>' }
];

function App() {
  const [activeTab, setActiveTab] = useState<EditorTab>('reb');
  const [previewZoom, setPreviewZoom] = useState(0.75);
  const [editorWidth, setEditorWidth] = useState(50);
  const [editorHeight, setEditorHeight] = useState(50);
  const isDragging = useRef(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    () => (localStorage.getItem('rebar_layout_mode') as LayoutMode | null) ?? 'split',
  );
  const [mainView, setMainView] = useState<MainView>('editor');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('rebar_sidebar_collapsed') === '1',
  );

  // The live preview document (paged.js-rendered), rebuilt debounced as the
  // template changes. `rendering` tracks layout in progress; `pageCount` is
  // reported back from the iframe once paged.js finishes.
  const [previewDoc, setPreviewDoc] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [rendering, setRendering] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  // Raw bytes of the most recent rendered PDF (Electron), for "Save PDF".
  const latestPdfBytes = useRef<Uint8Array | null>(null);
  
  const [rebCode, setRebCode] = useState(() => {
    const saved = localStorage.getItem('rebar_editor_code');
    return saved !== null ? saved : DEFAULT_REB;
  });

  const [wasmReady, setWasmReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Load the WebAssembly compiler once on mount.
  useEffect(() => {
    let cancelled = false;
    initRebCompiler()
      .then(() => { if (!cancelled) setWasmReady(true); })
      .catch((e) => { if (!cancelled) setInitError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  // Compilation is a pure function of the source once the compiler is ready.
  const { compiled, compileError } = useMemo(() => {
    if (!wasmReady) {
      return { compiled: EMPTY_RESULT, compileError: initError };
    }
    try {
      const result = compile(rebCode);
      return { compiled: result, compileError: result.execError ?? null };
    } catch (e) {
      return { compiled: EMPTY_RESULT, compileError: e instanceof Error ? e.message : String(e) };
    }
  }, [rebCode, wasmReady, initError]);

  // Rebuild the paged preview document, debounced — re-running paged.js + Tailwind
  // on every keystroke would be wasteful, so we wait for a pause in editing.
  useEffect(() => {
    if (!wasmReady) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setRendering(true);
      if (IS_ELECTRON && electronIpc) {
        // True PDF via Chromium's print engine (named landscape pages, etc.).
        try {
          const { html, footer } = await buildElectronDocument(compiled.previewHtml);
          const data = (await electronIpc.invoke('render-pdf', { html, footer })) as Uint8Array;
          if (cancelled) return;
          const bytes = new Uint8Array(data);
          latestPdfBytes.current = bytes;
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
          setPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setRenderError(null);
        } catch (e) {
          if (!cancelled) setRenderError(e instanceof Error ? e.message : String(e));
        } finally {
          if (!cancelled) setRendering(false);
        }
      } else {
        // Browser fallback: paged.js layout (reports completion via postMessage).
        setPreviewDoc(buildPagedDocument(compiled.previewHtml));
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [compiled.previewHtml, wasmReady]);

  // The preview iframe reports completion (and its page count) once paged.js
  // finishes laying out the document.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'reb-paged-done') {
        setPageCount(e.data.pages ?? 0);
        setRendering(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register Auto-completion provider for reb- elements
    monaco.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: (model: MonacoApi.editor.ITextModel, position: MonacoApi.Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = REBAR_SNIPPETS.map(snippet => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.snippet,
          documentation: `Insert a ${snippet.label} component`,
          range: range,
        }));

        return { suggestions };
      }
    });
  };

  const insertSnippet = (snippet: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection) return;
    editor.executeEdits('snippets', [
      {
        range: selection,
        text: snippet,
        forceMoveMarkers: true
      }
    ]);
    editor.focus();
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // 224px is the width of the left sidebar (w-56)
      const containerWidth = window.innerWidth - 224; 
      let newWidth = ((e.clientX - 224) / containerWidth) * 100;
      if (newWidth < 20) newWidth = 20;
      if (newWidth > 80) newWidth = 80;
      setEditorWidth(newWidth);
    };

    const stopDrag = () => {
      isDragging.current = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDrag);
  };

  const startVDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'row-resize';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // 56px is the height of the top header (h-14)
      const containerHeight = window.innerHeight - 56;
      let newHeight = ((e.clientY - 56) / containerHeight) * 100;
      if (newHeight < 20) newHeight = 20;
      if (newHeight > 80) newHeight = 80;
      setEditorHeight(newHeight);
    };

    const stopDrag = () => {
      isDragging.current = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDrag);
  };

  // Persist the chosen layout mode.
  useEffect(() => {
    localStorage.setItem('rebar_layout_mode', layoutMode);
  }, [layoutMode]);

  // Persist sidebar collapsed state.
  useEffect(() => {
    localStorage.setItem('rebar_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  // Persist the REB code whenever it changes (compilation is derived via useMemo)
  useEffect(() => {
    localStorage.setItem('rebar_editor_code', rebCode);
  }, [rebCode]);

  const handleDownload = () => {
    let content = '';
    let filename = '';
    let type = '';

    if (activeTab === 'reb') {
      content = rebCode;
      filename = 'template.reb';
      type = 'text/plain';
    } else if (activeTab === 'html') {
      content = compiled.htmlSource;
      filename = 'template.html';
      type = 'text/html';
    } else if (activeTab === 'json') {
      content = JSON.stringify(compiled.schema, null, 2);
      filename = 'schema.json';
      type = 'application/json';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Save the current rendered PDF (Electron only) via a native save dialog.
  const handleSavePdf = async () => {
    if (!electronIpc || !latestPdfBytes.current) return;
    try {
      await electronIpc.invoke('save-pdf', latestPdfBytes.current);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setRebCode(content);
        setActiveTab('reb');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  // Editor pane — fills its slot; the layout wrappers size it.
  const editorPane = (
    <div className="flex flex-col h-full w-full bg-[#1e1e1e] overflow-hidden">
      {/* Editor Tabs */}
      <div className="flex items-center bg-brand-steel shrink-0 border-b border-brand-steel-light">
        <button
          onClick={() => setActiveTab('reb')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${activeTab === 'reb' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
        >
          <FileCode2 size={14} />
          Source (.reb)
        </button>
        <button
          onClick={() => setActiveTab('html')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${activeTab === 'html' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
        >
          <Code2 size={14} />
          Compiled HTML
        </button>
        <button
          onClick={() => setActiveTab('json')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${activeTab === 'json' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
        >
          <Database size={14} />
          Compiled JSON
        </button>
      </div>

      {/* Monaco Editor Container */}
      <div className="flex-1 relative">
        {activeTab === 'reb' && (
          <Editor
            height="100%"
            defaultLanguage="html"
            theme="vs-dark"
            value={rebCode}
            onChange={(val) => setRebCode(val || '')}
            onMount={handleEditorDidMount}
            options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', padding: { top: 16 } }}
          />
        )}
        {activeTab === 'html' && (
          <Editor
            height="100%"
            defaultLanguage="html"
            theme="vs-dark"
            value={compiled.htmlSource}
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', padding: { top: 16 } }}
          />
        )}
        {activeTab === 'json' && (
          <Editor
            height="100%"
            defaultLanguage="json"
            theme="vs-dark"
            value={JSON.stringify(compiled.schema, null, 2)}
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, padding: { top: 16 } }}
          />
        )}
      </div>
    </div>
  );

  // Preview pane — fills its slot; the layout wrappers size it.
  const previewPane = (
    <div className="flex flex-col h-full w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between bg-white dark:bg-slate-950 shrink-0 border-b border-slate-200 dark:border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Eye size={14} />
            Live PDF Preview
          </div>
          {!wasmReady && !compileError && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-amber animate-pulse">
              Loading compiler…
            </span>
          )}
          {wasmReady && rendering && !compileError && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-amber animate-pulse">
              Rendering…
            </span>
          )}
          {wasmReady && !rendering && !compileError && pageCount > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </span>
          )}
          {compileError && (
            <span
              className="max-w-[260px] truncate text-[10px] font-bold uppercase tracking-wider text-red-500"
              title={compileError}
            >
              Error: {compileError}
            </span>
          )}
          {!compileError && renderError && (
            <span
              className="max-w-[260px] truncate text-[10px] font-bold uppercase tracking-wider text-red-500"
              title={renderError}
            >
              Render error: {renderError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-zinc-800/50 rounded-md p-0.5 border border-slate-200 dark:border-zinc-700/50 mr-2">
            <button
              onClick={() => setPreviewZoom(z => Math.max(0.25, z - 0.25))}
              className="px-2 py-0.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              -
            </button>
            <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 px-2 min-w-[40px] text-center">
              {Math.round(previewZoom * 100)}%
            </span>
            <button
              onClick={() => setPreviewZoom(z => Math.min(3, z + 0.25))}
              className="px-2 py-0.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              +
            </button>
          </div>
          <span className="flex h-2 w-2 rounded-full bg-red-400"></span>
          <span className="flex h-2 w-2 rounded-full bg-amber-400"></span>
          <span className="flex h-2 w-2 rounded-full bg-green-400"></span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-[#52525b] relative">
        {IS_ELECTRON
          ? pdfUrl && (
              <iframe
                title="Live PDF Preview"
                // Drive the native PDF viewer's own zoom via its URL fragment so
                // the level is restored on every re-render (avoids the CSS-zoom
                // vs viewer-fit double-zoom that drifted on each edit).
                src={`${pdfUrl}#toolbar=0&zoom=${Math.round(previewZoom * 100)}`}
                className="w-full h-full border-0"
              />
            )
          : previewDoc && (
              <iframe
                title="Live PDF Preview"
                srcDoc={previewDoc}
                className="w-full h-full border-0"
                style={{ zoom: previewZoom }}
                sandbox="allow-scripts allow-same-origin"
              />
            )}
        {rendering && (
          <div className="absolute top-3 right-3 rounded-md bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
            Rendering PDF…
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-brand-steel-dark text-slate-200 font-sans overflow-hidden">
      {/* Top Navigation */}
      <header className="h-14 shrink-0 border-b border-brand-steel-light bg-brand-steel flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-amber text-brand-steel flex items-center justify-center font-black">
            <Code2 size={18} />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white">Rebar Studio</h1>
            <p className="text-[10px] text-brand-amber font-mono tracking-widest uppercase mt-0.5">Live Template Compiler</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-brand-steel-light rounded-md p-0.5 mr-1">
            {([
              ['split', Columns2, 'Side by side'],
              ['stacked', Rows2, 'Stacked (top / bottom)'],
              ['tabs', SquareStack, 'Tabs'],
            ] as const).map(([mode, Icon, title]) => (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                title={title}
                className={`flex items-center justify-center px-2 py-1 rounded transition ${layoutMode === mode ? 'bg-brand-amber text-brand-steel' : 'text-zinc-400 hover:text-white'}`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".reb,.html,.txt"
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-brand-steel-light hover:bg-zinc-700 text-white rounded-md transition"
          >
            <Upload size={14} />
            Import .REB
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-brand-steel-light hover:bg-zinc-700 text-white rounded-md transition"
          >
            <Download size={14} />
            Export {activeTab.toUpperCase()}
          </button>
          {IS_ELECTRON && (
            <button
              onClick={handleSavePdf}
              disabled={!pdfUrl}
              title="Save the rendered PDF to disk"
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-brand-amber hover:bg-brand-amber-dark text-brand-steel rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown size={14} />
              Save PDF
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Far Left Pane: Snippets Toolbar (collapsible) */}
        {sidebarCollapsed ? (
          <div className="w-10 shrink-0 flex flex-col items-center border-r border-brand-steel-light bg-[#191919] py-3 gap-3">
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="Show components"
              className="text-zinc-400 hover:text-brand-amber transition"
            >
              <PanelLeftOpen size={18} />
            </button>
            <LayoutTemplate size={16} className="text-zinc-600" />
          </div>
        ) : (
          <div className="w-56 shrink-0 flex flex-col border-r border-brand-steel-light bg-[#191919]">
            <div className="flex items-center justify-between gap-2 p-3 text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-brand-steel-light bg-brand-steel shrink-0">
              <span className="flex items-center gap-2">
                <LayoutTemplate size={14} />
                Components
              </span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Hide components"
                className="text-zinc-500 hover:text-brand-amber transition"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
              {REBAR_SNIPPETS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => insertSnippet(item.snippet)}
                  className="flex items-center justify-between px-3 py-2 text-[11px] font-medium text-left text-zinc-300 hover:text-white bg-[#252526] hover:bg-[#2d2d2d] border border-[#333] hover:border-[#444] rounded transition group"
                >
                  <span>{item.label}</span>
                  <PlusCircle size={14} className="opacity-0 group-hover:opacity-100 text-brand-amber transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Center + Preview, arranged per layout mode */}
        {layoutMode === 'tabs' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center bg-brand-steel shrink-0 border-b border-brand-steel-light">
              <button
                onClick={() => setMainView('editor')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${mainView === 'editor' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
              >
                <FileCode2 size={14} />
                Editor
              </button>
              <button
                onClick={() => setMainView('preview')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${mainView === 'preview' ? 'bg-[#1e1e1e] text-brand-amber border-t-2 border-t-brand-amber' : 'text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent'}`}
              >
                <Eye size={14} />
                Preview
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{mainView === 'editor' ? editorPane : previewPane}</div>
          </div>
        ) : layoutMode === 'stacked' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="w-full overflow-hidden border-b border-brand-steel-light" style={{ height: `${editorHeight}%` }}>
              {editorPane}
            </div>
            <div
              className="h-1.5 cursor-row-resize hover:bg-brand-amber active:bg-brand-amber transition-colors flex shrink-0 items-center justify-center z-10 relative group"
              onMouseDown={startVDrag}
            >
              <div className="w-8 h-0.5 bg-zinc-600 rounded-full group-hover:bg-brand-steel-dark transition-colors"></div>
            </div>
            <div className="w-full overflow-hidden" style={{ height: `${100 - editorHeight}%` }}>
              {previewPane}
            </div>
          </div>
        ) : (
          <>
            <div className="h-full overflow-hidden border-r border-brand-steel-light" style={{ width: `${editorWidth}%` }}>
              {editorPane}
            </div>
            <div
              className="w-1.5 cursor-col-resize hover:bg-brand-amber active:bg-brand-amber transition-colors flex shrink-0 items-center justify-center z-10 relative group"
              onMouseDown={startDrag}
            >
              <div className="h-8 w-0.5 bg-zinc-600 rounded-full group-hover:bg-brand-steel-dark transition-colors"></div>
            </div>
            <div className="h-full overflow-hidden" style={{ width: `${100 - editorWidth}%` }}>
              {previewPane}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default App;
