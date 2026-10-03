// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The template editor: .reb source with completions and the engine's markers, the compiled output,
// the form the template produces, and the PDF preview rendered with sample answers. Edits compile in
// the engine worker and are saved to the template as you type.

import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { clsx } from 'clsx';
import {
  AlertTriangle, ArrowLeft, Check, CircleAlert, Code2, Columns2, Database, Download, Eye, FileCode2, FileDown, FilePlus2,
  History, Image, Info, LayoutTemplate, ListChecks, Loader2, Package, PanelLeftClose, PanelLeftOpen, PlusCircle, Printer,
  Rows2, SquareStack,
} from 'lucide-react';
import type * as MonacoApi from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../app/router';
import { useSettings } from '../app/useSettings';
import { Badge, Button, Dialog, Label, Menu, TextArea, TextInput } from '../components/ui';
import { errorMessage } from '../components/format';
import { useToast } from '../components/toast';
import { engine } from '../engine/client';
import type { CompiledTemplate, CompileResult, Schema } from '../engine/types';
import { buildRebpack } from '../formats/rebpack';
import { useMemoryFiles } from '../form/fileSupport';
import { FormView } from '../form/FormView';
import { useFormState } from '../form/useFormState';
import { IS_DESKTOP, safeFileName, saveFile } from '../platform/bridge';
import { Preview, type PreviewHandle, type PreviewState } from '../render/Preview';
import { templateFiles, withFonts } from '../render/renderDocument';
import { defaultAnswers } from '../store/answers';
import { createDocument } from '../store/documents';
import { currentVersion, getTemplate, saveSource, updateTemplate } from '../store/templates';
import type { Template, TemplateVersion } from '../store/types';
import { AssetsDialog } from './AssetsDialog';
import { markersFor } from './diagnostics';
import { registerCompletions, setMarkers } from './monaco';
import { SNIPPETS } from './snippets';
import { VersionsDialog } from './VersionsDialog';

type Tab = 'reb' | 'html' | 'fields' | 'form';

// keepPreview keeps the last good sample preview when the new one failed to render (the engine then
// returns the bare compiled HTML, full of {{...}}): a half-typed tag must not blank the preview.
function keepPreview(next: CompiledTemplate, previous: CompiledTemplate | null): CompiledTemplate {
  return next.execError && previous ? { ...next, previewHtml: previous.previewHtml } : next;
}
type Layout = 'split' | 'stacked' | 'tabs';

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // preferences are a convenience
  }
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick(): void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'flex shrink-0 items-center gap-2 border-t-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition',
        active ? 'border-t-brand-amber bg-[#1e1e1e] text-brand-amber' : 'border-t-transparent text-zinc-500 hover:text-zinc-300',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function FormPreview({ schema, files: previewFiles }: { schema: Schema; files: ReturnType<typeof useMemoryFiles> }) {
  const settings = useSettings();
  const state = useFormState(schema, defaultAnswers(schema.fields));
  const keys = schema.fields.map((f) => `${f.key}:${f.kind}`).join('|');
  const { replace } = state;
  // A changed set of fields starts the preview over from the defaults.
  useEffect(() => {
    replace(defaultAnswers(schema.fields));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  return (
    <div className="h-full overflow-y-auto bg-brand-steel-dark p-6">
      <p className="mb-6 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">
        <Info size={14} /> The form this template produces. Answers here are a try-out and are not saved.
      </p>
      <FormView fields={schema.fields} state={state} files={previewFiles} photo={settings.photos} />
    </div>
  );
}

export default function EditorView({ templateId }: { templateId: string }) {
  const toast = useToast();
  const [template, setTemplate] = useState<Template | null>(null);
  const [version, setVersion] = useState<TemplateVersion | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [lastGood, setLastGood] = useState<CompiledTemplate | null>(null);
  const [saving, setSaving] = useState<'saved' | 'pending' | 'error'>('saved');
  const [missing, setMissing] = useState(false);

  const [tab, setTab] = useState<Tab>('reb');
  const [layout, setLayout] = useState<Layout>(() => stored<Layout>('rebar_layout_mode', 'split'));
  const [mainView, setMainView] = useState<'editor' | 'preview'>('editor');
  const [sidebar, setSidebar] = useState(() => stored<string>('rebar_sidebar_collapsed', '0') !== '1');
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(0.75);
  const [dialog, setDialog] = useState<'assets' | 'versions' | 'details' | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ rendering: false, pages: 0, error: null });
  const [assetFiles, setAssetFiles] = useState<Map<string, Blob>>(new Map());
  const [rendered, setRendered] = useState<{ html: string; files: Map<string, Blob>; fontCss: string }>({ html: '', files: new Map(), fontCss: '' });
  const [showProblems, setShowProblems] = useState(true);

  const panes = useRef<HTMLDivElement>(null);
  const editor = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const pending = useRef<string | null>(null);
  const formFiles = useMemoryFiles();

  useEffect(() => remember('rebar_layout_mode', layout), [layout]);
  useEffect(() => remember('rebar_sidebar_collapsed', sidebar ? '0' : '1'), [sidebar]);

  // Load the template and compile its current version.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getTemplate(templateId);
      if (!found) {
        if (!cancelled) setMissing(true);
        return;
      }
      const current = await currentVersion(templateId);
      const compiled = await engine.compile(current.rebSource);
      if (cancelled) return;
      setTemplate(found);
      setVersion(current);
      setSource(current.rebSource);
      setResult(compiled);
      if (compiled.ok) setLastGood(compiled);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const persist = useCallback(
    async (text: string) => {
      const compiled = await engine.compile(text);
      const written = await saveSource(templateId, text, compiled);
      return { compiled, written };
    },
    [templateId],
  );

  // Compile and save shortly after each edit.
  const edit = (text: string) => {
    setSource(text);
    pending.current = text;
    setSaving('pending');
  };
  useEffect(() => {
    if (source === null || pending.current === null) return;
    const text = pending.current;
    const timer = setTimeout(async () => {
      try {
        const { compiled, written } = await persist(text);
        if (pending.current !== text) return;
        pending.current = null;
        setResult(compiled);
        if (compiled.ok) setLastGood((previous) => keepPreview(compiled, previous));
        setVersion(written);
        setSaving('saved');
      } catch (e) {
        setSaving('error');
        toast(`Not saved: ${errorMessage(e)}`, 'error');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [source, persist, toast]);

  // Save what is pending when leaving the editor or closing the window.
  useEffect(() => {
    const flush = () => {
      if (pending.current !== null) void persist(pending.current);
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [persist]);

  // The template's images, then the preview's files (images and fonts).
  useEffect(() => {
    if (!version) return;
    void templateFiles(version).then(setAssetFiles);
  }, [version]);
  useEffect(() => {
    const html = lastGood?.previewHtml ?? '';
    let cancelled = false;
    void withFonts(html, assetFiles).then(({ files, fontCss }) => !cancelled && setRendered({ html, files, fontCss }));
    return () => {
      cancelled = true;
    };
  }, [lastGood, assetFiles]);

  const markers = useMemo(() => (source === null ? [] : markersFor(source, result)), [source, result]);
  useEffect(() => {
    const model = editor.current?.getModel();
    if (model && monacoRef.current && tab === 'reb') setMarkers(monacoRef.current, model, markers);
  }, [markers, tab]);

  const onMount: OnMount = (instance, monaco) => {
    editor.current = instance;
    monacoRef.current = monaco;
    registerCompletions(monaco);
    const model = instance.getModel();
    if (model) setMarkers(monaco, model, markers);
  };

  const insert = (text: string) => {
    const instance = editor.current;
    const selection = instance?.getSelection();
    if (!instance || !selection) {
      setTab('reb');
      return;
    }
    instance.executeEdits('snippets', [{ range: selection, text, forceMoveMarkers: true }]);
    instance.focus();
  };

  const reveal = (line: number, column: number) => {
    setTab('reb');
    requestAnimationFrame(() => {
      editor.current?.revealLineInCenter(line);
      editor.current?.setPosition({ lineNumber: line, column });
      editor.current?.focus();
    });
  };

  const drag = (direction: 'x' | 'y') => (event: React.PointerEvent) => {
    event.preventDefault();
    const move = (e: PointerEvent) => {
      const rect = panes.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = direction === 'x' ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
      setSplit(Math.min(80, Math.max(20, ratio * 100)));
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = direction === 'x' ? 'col-resize' : 'row-resize';
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const download = async (name: string, content: string | Uint8Array, type: string, extension: string, label: string) => {
    await saveFile({
      name,
      bytes: typeof content === 'string' ? new TextEncoder().encode(content) : content,
      type,
      filters: [{ name: label, extensions: [extension] }],
    });
  };

  const newDocument = async () => {
    try {
      if (pending.current !== null) {
        const { written } = await persist(pending.current);
        pending.current = null;
        setVersion(written);
      }
      navigate({ name: 'document', id: (await createDocument(templateId)).id });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const savePdf = async () => {
    const bytes = previewRef.current?.pdf();
    if (!bytes || !template) return;
    await download(`${safeFileName(template.name)} (sample).pdf`, bytes, 'application/pdf', 'pdf', 'PDF document');
  };

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-white">This template no longer exists.</p>
        <Button onClick={() => navigate({ name: 'library' })}>Back to templates</Button>
      </div>
    );
  }
  if (!template || !version || source === null) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-400">
        <Loader2 className="animate-spin" size={18} /> Opening the template…
      </div>
    );
  }

  const errorCount = markers.filter((m) => m.severity === 'error').length;
  const warningCount = markers.length - errorCount;
  const compileError = result && !result.ok ? result.error : null;
  const editorOptions: MonacoApi.editor.IStandaloneEditorConstructionOptions = { minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', padding: { top: 16 }, automaticLayout: true };

  const editorPane = (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#1e1e1e]">
      <div role="tablist" className="flex shrink-0 items-center overflow-x-auto border-b border-brand-steel-light bg-brand-steel">
        <TabButton active={tab === 'reb'} onClick={() => setTab('reb')} icon={<FileCode2 size={14} />}>Source</TabButton>
        <TabButton active={tab === 'form'} onClick={() => setTab('form')} icon={<ListChecks size={14} />}>Form</TabButton>
        <TabButton active={tab === 'html'} onClick={() => setTab('html')} icon={<Code2 size={14} />}>Compiled</TabButton>
        <TabButton active={tab === 'fields'} onClick={() => setTab('fields')} icon={<Database size={14} />}>Schema</TabButton>
      </div>
      <div className="relative min-h-0 flex-1">
        {tab === 'reb' && <Editor height="100%" defaultLanguage="html" theme="vs-dark" value={source} onChange={(v) => edit(v ?? '')} onMount={onMount} options={editorOptions} />}
        {tab === 'html' && <Editor height="100%" defaultLanguage="html" theme="vs-dark" value={lastGood?.htmlSource ?? ''} options={{ ...editorOptions, readOnly: true }} />}
        {tab === 'fields' && <Editor height="100%" defaultLanguage="json" theme="vs-dark" value={JSON.stringify(lastGood?.fields ?? {}, null, 2)} options={{ ...editorOptions, readOnly: true, wordWrap: 'off' }} />}
        {tab === 'form' && (lastGood ? <FormPreview schema={lastGood.fields} files={formFiles} /> : <p className="p-6 text-sm text-slate-400">Fix the template to see its form.</p>)}
      </div>
      {markers.length > 0 && (
        <div className="shrink-0 border-t border-brand-steel-light bg-brand-steel">
          <button type="button" onClick={() => setShowProblems((v) => !v)} className="flex w-full items-center gap-3 px-3 py-1.5 text-xs font-semibold text-slate-300">
            Problems
            {errorCount > 0 && <span className="flex items-center gap-1 text-red-400"><CircleAlert size={13} />{errorCount}</span>}
            {warningCount > 0 && <span className="flex items-center gap-1 text-amber-400"><AlertTriangle size={13} />{warningCount}</span>}
          </button>
          {showProblems && (
            <ul className="max-h-32 overflow-y-auto pb-1">
              {markers.map((marker, i) => (
                <li key={i}>
                  <button type="button" onClick={() => reveal(marker.line, marker.column)} className="flex w-full items-start gap-2 px-3 py-1 text-left text-xs hover:bg-white/5">
                    {marker.severity === 'error' ? <CircleAlert size={13} className="mt-0.5 shrink-0 text-red-400" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />}
                    <span className="flex-1 text-slate-300">{marker.message}</span>
                    <span className="font-mono text-slate-500">{marker.line}:{marker.column}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  const previewPane = (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-brand-steel px-4 py-2">
        <div className="flex min-w-0 items-center gap-3 text-xs">
          <span className="flex items-center gap-2 font-bold uppercase tracking-wider text-slate-400"><Eye size={14} /> Preview</span>
          <span className="truncate text-slate-500">sample answers</span>
          {preview.rendering && <span className="animate-pulse font-semibold text-brand-amber">Rendering…</span>}
          {!preview.rendering && preview.pages > 0 && <span className="text-slate-500">{preview.pages} page{preview.pages === 1 ? '' : 's'}</span>}
          {preview.error && <span className="truncate text-red-400" title={preview.error}>{preview.error}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="rounded px-2 py-0.5 text-sm font-bold text-slate-400 hover:text-white">−</button>
          <span className="w-10 text-center text-[11px] text-slate-400">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="rounded px-2 py-0.5 text-sm font-bold text-slate-400 hover:text-white">+</button>
          {IS_DESKTOP ? (
            <Button size="sm" icon={<FileDown size={14} />} onClick={savePdf} className="ml-2">Save PDF</Button>
          ) : (
            <Button size="sm" icon={<Printer size={14} />} onClick={() => previewRef.current?.print()} className="ml-2">Print</Button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-[#52525b]">
        <Preview ref={previewRef} html={rendered.html} files={rendered.files} fontCss={rendered.fontCss} zoom={zoom} onState={setPreview} />
      </div>
    </div>
  );

  const groups = ['Fields', 'Layout', 'Values'] as const;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-brand-steel px-4 py-2.5">
        <a href="#/" aria-label="Back to templates" className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><ArrowLeft size={18} /></a>
        <button type="button" onClick={() => setDialog('details')} className="min-w-0 max-w-[40ch] truncate text-left text-sm font-bold text-white hover:text-brand-amber" title="Edit name, description and tags">
          {template.name}
        </button>
        <Badge>v{version.number}</Badge>
        <span className="flex items-center gap-1 text-[11px] text-slate-500" aria-live="polite">
          {saving === 'saved' && (<><Check size={12} /> Saved</>)}
          {saving === 'pending' && 'Saving…'}
          {saving === 'error' && <span className="text-red-400">Not saved</span>}
        </span>
        {compileError && <Badge tone="red">Does not compile</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md bg-brand-steel-light p-0.5" role="group" aria-label="Layout">
            {([['split', Columns2, 'Side by side'], ['stacked', Rows2, 'Stacked'], ['tabs', SquareStack, 'Tabs']] as const).map(([mode, Icon, title]) => (
              <button key={mode} type="button" title={title} aria-label={title} aria-pressed={layout === mode} onClick={() => setLayout(mode)} className={clsx('rounded px-2 py-1', layout === mode ? 'bg-brand-amber text-brand-steel' : 'text-zinc-400 hover:text-white')}>
                <Icon size={14} />
              </button>
            ))}
          </div>
          <Button size="sm" icon={<Image size={14} />} onClick={() => setDialog('assets')}>Images</Button>
          <Button size="sm" icon={<History size={14} />} onClick={() => setDialog('versions')}>Versions</Button>
          <Menu
            label="Export"
            icon={<Download size={16} />}
            items={[
              { label: 'Template pack (.rebpack)', icon: <Package size={15} />, run: async () => download(`${safeFileName(template.name)}.rebpack`, await buildRebpack(template, version), 'application/zip', 'rebpack', 'Rebar template pack') },
              { label: 'Source (.reb)', icon: <FileCode2 size={15} />, run: () => download(`${safeFileName(template.name)}.reb`, source, 'text/plain', 'reb', '.reb template') },
              { label: 'Compiled HTML', icon: <Code2 size={15} />, disabled: !lastGood, run: () => download(`${safeFileName(template.name)}.html`, lastGood?.htmlSource ?? '', 'text/html', 'html', 'HTML') },
              { label: 'Schema (JSON)', icon: <Database size={15} />, disabled: !lastGood, run: () => download(`${safeFileName(template.name)}.schema.json`, JSON.stringify(lastGood?.fields ?? {}, null, 2), 'application/json', 'json', 'JSON') },
            ]}
          />
          <Button size="sm" variant="primary" icon={<FilePlus2 size={14} />} onClick={newDocument} disabled={!!compileError}>
            New document
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebar ? (
          <aside aria-label="Components" className="flex w-56 shrink-0 flex-col border-r border-brand-steel-light bg-[#191919]">
            <div className="flex items-center justify-between border-b border-brand-steel-light bg-brand-steel p-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
              <span className="flex items-center gap-2"><LayoutTemplate size={14} /> Components</span>
              <button type="button" aria-label="Hide components" onClick={() => setSidebar(false)} className="text-zinc-500 hover:text-brand-amber"><PanelLeftClose size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {groups.map((group) => (
                <div key={group} className="mb-3">
                  <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{group}</p>
                  <div className="flex flex-col gap-1">
                    {SNIPPETS.filter((s) => s.group === group).map((item) => (
                      <button key={item.label} type="button" title={item.help} onClick={() => insert(item.snippet)} className="group flex items-center justify-between rounded border border-[#333] bg-[#252526] px-3 py-1.5 text-left text-[11px] font-medium text-zinc-300 hover:border-[#444] hover:bg-[#2d2d2d] hover:text-white">
                        {item.label}
                        <PlusCircle size={13} className="text-brand-amber opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        ) : (
          <div className="flex w-10 shrink-0 flex-col items-center gap-3 border-r border-brand-steel-light bg-[#191919] py-3">
            <button type="button" aria-label="Show components" onClick={() => setSidebar(true)} className="text-zinc-400 hover:text-brand-amber"><PanelLeftOpen size={18} /></button>
          </div>
        )}

        {layout === 'tabs' ? (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div role="tablist" className="flex shrink-0 border-b border-brand-steel-light bg-brand-steel">
              <TabButton active={mainView === 'editor'} onClick={() => setMainView('editor')} icon={<FileCode2 size={14} />}>Editor</TabButton>
              <TabButton active={mainView === 'preview'} onClick={() => setMainView('preview')} icon={<Eye size={14} />}>Preview</TabButton>
            </div>
            <div className="min-h-0 flex-1">{mainView === 'editor' ? editorPane : previewPane}</div>
          </div>
        ) : (
          <div ref={panes} className={clsx('flex min-w-0 flex-1 overflow-hidden', layout === 'stacked' && 'flex-col')}>
            <div className="overflow-hidden" style={layout === 'stacked' ? { height: `${split}%` } : { width: `${split}%` }}>{editorPane}</div>
            <div
              role="separator"
              aria-orientation={layout === 'stacked' ? 'horizontal' : 'vertical'}
              onPointerDown={drag(layout === 'stacked' ? 'y' : 'x')}
              className={clsx('shrink-0 bg-brand-steel-light transition-colors hover:bg-brand-amber', layout === 'stacked' ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize')}
            />
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{previewPane}</div>
          </div>
        )}
      </div>

      {dialog === 'assets' && <AssetsDialog version={version} onChanged={setVersion} onClose={() => setDialog(null)} />}
      {dialog === 'versions' && (
        <VersionsDialog
          templateId={templateId}
          currentId={version.id}
          onClose={() => setDialog(null)}
          onRestored={async (restored) => {
            setDialog(null);
            setVersion(restored);
            pending.current = null;
            setSource(restored.rebSource);
            const compiled = await engine.compile(restored.rebSource);
            setResult(compiled);
            if (compiled.ok) setLastGood((previous) => keepPreview(compiled, previous));
          }}
        />
      )}
      {dialog === 'details' && <DetailsDialog template={template} onSaved={(t) => { setTemplate(t); setDialog(null); }} onClose={() => setDialog(null)} />}
    </div>
  );
}

function DetailsDialog({ template, onSaved, onClose }: { template: Template; onSaved(t: Template): void; onClose(): void }) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [tags, setTags] = useState(template.tags.join(', '));
  const save = async () => {
    onSaved(
      await updateTemplate(template.id, {
        name,
        description,
        tags: [...new Set(tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
      }),
    );
  };
  return (
    <Dialog title="Template details" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Label label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} required /></Label>
        <Label label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Label>
        <Label label="Tags" help="Separated by commas, for example: safety, daily"><TextInput value={tags} onChange={(e) => setTags(e.target.value)} /></Label>
      </form>
    </Dialog>
  );
}
