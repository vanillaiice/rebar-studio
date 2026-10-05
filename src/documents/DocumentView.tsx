// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Filling one document: the form, the live PDF beside it, and the document's life: finalize (check
// with the engine, render, keep the PDF and its SHA-256, lock), duplicate, reopen as a revision.

import { clsx } from 'clsx';
import {
  ArrowLeft, ArrowUpCircle, Check, Copy, Eye, EyeOff, FileDown, Loader2, Lock, MoreVertical, Package, Printer, Redo2, RotateCcw,
  ShieldCheck, Trash2, Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../app/router';
import { useSettings } from '../app/useSettings';
import { Badge, Button, Dialog, Menu, TextInput } from '../components/ui';
import { errorMessage, formatDate } from '../components/format';
import { useConfirm } from '../components/useConfirm';
import { useToast } from '../components/toast';
import { engine } from '../engine/client';
import type { Answers } from '../engine/types';
import { buildRebdoc } from '../formats/rebdoc';
import { useDocumentFiles } from '../form/fileSupport';
import { firstErrorKey } from '../form/fields';
import { FormView } from '../form/FormView';
import { useFormState } from '../form/useFormState';
import { IS_DESKTOP, saveFile } from '../platform/bridge';
import { fileName, finalRendition, pdfOf } from '../render/exports';
import { Preview, type PreviewHandle, type PreviewState } from '../render/Preview';
import { renderDocument } from '../render/renderDocument';
import { assetIdsIn } from '../store/answers';
import { getAsset } from '../store/assets';
import {
  deleteDocument, duplicateDocument, finalizeDocument, getDocument, moveToVersion, removeUnusedFiles, reopenAsRevision, saveAnswers,
  updateDocumentMeta,
} from '../store/documents';
import { getTemplate, getVersion } from '../store/templates';
import type { StudioDocument, Template, TemplateVersion } from '../store/types';
import { StatusBadge } from './DocumentsView';

interface Loaded {
  document: StudioDocument;
  version: TemplateVersion;
  template: Template;
  latest: TemplateVersion | null;
}

export function DocumentView({ documentId }: { documentId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);

  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<Loaded | null> => {
      const document = await getDocument(documentId);
      const version = document && (await getVersion(document.templateVersionId));
      const template = document && (await getTemplate(document.templateId));
      if (!document || !version || !template) return null;
      return { document, version, template, latest: (await getVersion(template.currentVersionId)) ?? null };
    })().then((found) => {
      if (cancelled) return;
      if (found) setLoaded(found);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, reloads]);

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-white">This document no longer exists.</p>
        <Button onClick={() => navigate({ name: 'documents', templateId: null })}>Back to documents</Button>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-400">
        <Loader2 className="animate-spin" size={20} /> Opening the document…
      </div>
    );
  }
  if (!loaded.version.compiled) {
    return <p className="p-8 text-sm text-red-300">The template version of this document does not compile.</p>;
  }
  // Remount the filler when the document changes version or status, so the form starts over cleanly.
  return <DocumentFiller key={`${loaded.document.templateVersionId}:${loaded.document.status}`} {...loaded} reload={load} />;
}

function FinalRendition({ document }: { document: StudioDocument }) {
  const [url, setUrl] = useState<{ src: string; html: boolean } | null>(null);
  useEffect(() => {
    let created = '';
    void (async () => {
      const asset = document.pdfAssetId ? await getAsset(document.pdfAssetId) : undefined;
      if (!asset) return;
      if (asset.mime === 'application/pdf') {
        created = URL.createObjectURL(asset.blob);
        setUrl({ src: created, html: false });
      } else {
        setUrl({ src: await asset.blob.text(), html: true });
      }
    })();
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
  }, [document.pdfAssetId]);
  if (!url) return null;
  return url.html ? (
    <iframe title="Final document" srcDoc={url.src} sandbox="allow-scripts allow-modals" className="h-full w-full border-0" />
  ) : (
    <iframe title="Final document" src={`${url.src}#toolbar=1`} className="h-full w-full border-0" />
  );
}

function DocumentFiller({ document: initial, version, template, latest, reload }: Loaded & { reload(): void }) {
  const [document, setDocument] = useState(initial);
  const settings = useSettings();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const final = document.status === 'final';
  const fields = version.compiled!.fields;

  const save = useCallback(
    async (answers: Answers) => {
      const written = await saveAnswers(document.id, answers);
      setDocument(written);
    },
    [document.id],
  );
  const state = useFormState(fields, initial.answers, final ? undefined : save);
  const files = useDocumentFiles(document.id, assetIdsIn(state.answers).map((id) => `asset:${id}`));
  const [showErrors, setShowErrors] = useState(false);
  const [focus, setFocus] = useState<{ key: string; nonce: number } | null>(null);
  const [livePdf, setLivePdf] = useState(() => window.innerWidth >= 1100);
  const [previewState, setPreviewState] = useState<PreviewState>({ rendering: false, pages: 0, error: null });
  const [rendered, setRendered] = useState<{ html: string; files: Map<string, Blob>; fontCss: string }>({ html: '', files: new Map(), fontCss: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const previewRef = useRef<PreviewHandle>(null);

  // The live PDF follows the answers (debounced; the preview debounces its own rendering too).
  useEffect(() => {
    if (final || !livePdf) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const out = await renderDocument(document, version, template, settings, state.answers);
        if (!cancelled) setRendered({ html: out.html, files: out.files, fontCss: out.fontCss });
      } catch (e) {
        if (!cancelled) setPreviewState({ rendering: false, pages: 0, error: errorMessage(e) });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // document changes on every save; the render depends on its details, not its answers field
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.answers, livePdf, final, version, template, settings, document.title, document.project, document.reference]);

  // Undo and redo outside text inputs (inputs keep their own).
  useEffect(() => {
    if (final) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [final, state]);

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await work();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const finalize = () =>
    run('Checking…', async () => {
      await state.flush();
      const prepared = await engine.prepare(fields, state.answers);
      if (prepared.errors.length > 0) {
        setShowErrors(true);
        const key = firstErrorKey(fields.fields, { visible: state.visible, errors: new Map(prepared.errors.map((e) => [e.key, e])) }) ?? prepared.errors[0].key;
        setFocus({ key, nonce: Date.now() });
        toast(`${prepared.errors.length} answer${prepared.errors.length === 1 ? ' needs' : 's need'} attention before finalizing.`, 'error');
        return;
      }
      const ok = await confirm({
        title: 'Finalize this document?',
        message: (
          <>
            <p>The document is rendered and locked: its answers can no longer change. {IS_DESKTOP ? 'Its PDF' : 'Its rendered page'} is kept with a SHA-256 fingerprint.</p>
            <p className="mt-2 text-slate-400">You can still duplicate it, or reopen it as a new revision.</p>
          </>
        ),
        action: 'Finalize',
      });
      if (!ok) return;
      setBusy('Rendering the final document…');
      const current = (await getDocument(document.id))!;
      const rendition = await finalRendition(current);
      const locked = await finalizeDocument(document.id, rendition.blob, rendition.hash);
      await removeUnusedFiles(locked);
      toast('Finalized', 'success');
      reload();
    });

  const exportPdf = () =>
    run('Rendering the PDF…', async () => {
      await state.flush();
      const current = (await getDocument(document.id))!;
      await saveFile({
        name: fileName(settings.fileNamePattern, current, template, 'pdf'),
        bytes: await pdfOf(current),
        type: 'application/pdf',
        filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      });
    });

  const exportRebdoc = () =>
    run('Exporting…', async () => {
      await state.flush();
      const current = (await getDocument(document.id))!;
      await saveFile({
        name: fileName(settings.fileNamePattern, current, template, 'rebdoc'),
        bytes: await buildRebdoc(current, version, template),
        type: 'application/zip',
        filters: [{ name: 'Rebar document', extensions: ['rebdoc'] }],
      });
    });

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete document',
      message: final ? 'This final document, its PDF and its photos will be deleted. This cannot be undone.' : 'This draft and its photos will be deleted. This cannot be undone.',
      action: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteDocument(document.id);
    navigate({ name: 'documents', templateId: null });
  };

  const outdated = !final && latest && latest.id !== version.id && latest.compiled;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-brand-steel px-5 py-3">
        <a href="#/documents" aria-label="Back to documents" className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white"><ArrowLeft size={20} /></a>
        <div className="min-w-0">
          <button type="button" disabled={final} onClick={() => setDetails(true)} className="block max-w-[50ch] truncate text-left text-lg font-bold text-white enabled:hover:text-brand-amber">
            {document.title}
          </button>
          <p className="text-xs text-slate-500">
            <span className="font-mono">{document.reference}</span>
            {document.revision > 1 && <> · revision {document.revision}</>} · <a href={`#/templates/${template.id}`} className="hover:text-white">{template.name} v{version.number}</a>
          </p>
        </div>
        <StatusBadge document={document} />
        {!final && (
          <span className="flex items-center gap-1 text-sm text-slate-500" aria-live="polite">
            {state.dirty ? 'Saving…' : (<><Check size={14} /> Saved</>)}
          </span>
        )}
        {busy && <span className="flex items-center gap-2 text-xs text-brand-amber"><Loader2 size={16} className="animate-spin" />{busy}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!final && (
            <>
              <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!state.canUndo} onClick={state.undo} className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30"><Undo2 size={18} /></button>
              <button type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!state.canRedo} onClick={state.redo} className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30"><Redo2 size={18} /></button>
              <Button size="sm" variant="ghost" icon={livePdf ? <EyeOff size={16} /> : <Eye size={16} />} onClick={() => setLivePdf((v) => !v)}>
                {livePdf ? 'Hide preview' : 'Preview'}
              </Button>
            </>
          )}
          {IS_DESKTOP ? (
            <Button size="sm" icon={<FileDown size={16} />} onClick={exportPdf}>Export PDF</Button>
          ) : (
            !final && livePdf && <Button size="sm" icon={<Printer size={16} />} onClick={() => previewRef.current?.print()}>Print</Button>
          )}
          {final ? (
            <Button size="sm" variant="primary" icon={<RotateCcw size={16} />} onClick={() => run('Reopening…', async () => navigate({ name: 'document', id: (await reopenAsRevision(document.id)).id }))}>
              Reopen as revision
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<Lock size={16} />} onClick={finalize}>Finalize</Button>
          )}
          <Menu
            label="More actions"
            icon={<MoreVertical size={18} />}
            items={[
              { label: 'Export .rebdoc', icon: <Package size={17} />, run: exportRebdoc },
              { label: 'Duplicate', icon: <Copy size={17} />, run: () => run('Duplicating…', async () => { await state.flush(); navigate({ name: 'document', id: (await duplicateDocument(document.id)).id }); }) },
              { label: 'History', icon: <ShieldCheck size={17} />, run: () => setDetails(true) },
              { label: 'Delete', icon: <Trash2 size={17} />, danger: true, run: remove },
            ]}
          />
        </div>
      </header>

      {outdated && (
        <div className="flex flex-wrap items-center gap-3 border-b border-brand-amber/30 bg-brand-amber/10 px-4 py-2 text-sm text-amber-100">
          <ArrowUpCircle size={18} className="text-brand-amber" />
          This draft uses v{version.number} of the template; v{latest!.number} is the latest.
          <Button
            size="sm"
            onClick={() =>
              run('Moving…', async () => {
                await state.flush();
                await moveToVersion(document.id, latest!.id);
                toast(`Moved to v${latest!.number}`, 'success');
                reload();
              })
            }
          >
            Move to v{latest!.number}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {final ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-emerald-950/40 px-5 py-2.5 text-sm text-emerald-200">
              <Lock size={16} /> Finalized {formatDate(document.finalizedAt)}
              <span className="font-mono text-emerald-300/70" title="SHA-256 of the final rendition">SHA-256 {document.pdfHash?.slice(0, 16)}…</span>
            </div>
            <div className="min-h-0 flex-1 bg-[#52525b]"><FinalRendition document={document} /></div>
          </div>
        ) : (
          <>
            <div className={clsx('min-w-0 overflow-y-auto px-8 py-8', livePdf ? 'w-1/2 max-lg:w-full' : 'flex-1')}>
              <div className="mx-auto max-w-4xl">
                <FormView fields={fields.fields} state={state} files={files} photo={settings.photos} showAllErrors={showErrors} focus={focus} />
              </div>
            </div>
            {livePdf && (
              <div className="flex min-w-0 flex-1 flex-col border-l border-white/10 max-lg:hidden">
                <div className="flex items-center gap-3 border-b border-white/10 bg-brand-steel px-5 py-2.5 text-sm text-slate-400">
                  <Eye size={16} /> Live preview
                  {previewState.rendering && <span className="animate-pulse text-brand-amber">Rendering…</span>}
                  {previewState.pages > 0 && !previewState.rendering && <span>{previewState.pages} page{previewState.pages === 1 ? '' : 's'}</span>}
                  {previewState.error && <span className="truncate text-red-400">{previewState.error}</span>}
                </div>
                <div className="min-h-0 flex-1 bg-[#52525b]">
                  <Preview ref={previewRef} html={rendered.html} files={rendered.files} fontCss={rendered.fontCss} zoom="fit" onState={setPreviewState} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {details && <DetailsDialog document={document} onClose={() => setDetails(false)} onSaved={(d) => { setDocument(d); setDetails(false); }} />}
      {confirmDialog}
    </div>
  );
}

function DetailsDialog({ document, onSaved, onClose }: { document: StudioDocument; onSaved(d: StudioDocument): void; onClose(): void }) {
  const [title, setTitle] = useState(document.title);
  const [project, setProject] = useState(document.project);
  const final = document.status === 'final';
  return (
    <Dialog
      title="Document"
      onClose={onClose}
      footer={final ? <Button onClick={onClose}>Close</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={async () => onSaved(await updateDocumentMeta(document.id, { title, project }))}>Save</Button></>}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-300">Title <TextInput value={title} disabled={final} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-300">Project <span className="font-normal text-slate-500">printed as {'{{.ProjectName}}'}</span><TextInput value={project} disabled={final} onChange={(e) => setProject(e.target.value)} /></label>
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-300">History</p>
          <ul className="flex flex-col gap-1 text-xs text-slate-400">
            {document.log.map((entry, i) => (
              <li key={i}>
                <span className="text-slate-500">{formatDate(entry.at)}</span> · {entry.action}
                {entry.note && <span className="break-all text-slate-500"> · {entry.note}</span>}
              </li>
            ))}
          </ul>
        </div>
        {document.pdfHash && (
          <p className="break-all font-mono text-xs text-slate-500">
            <Badge tone="green">SHA-256</Badge> {document.pdfHash}
          </p>
        )}
      </div>
    </Dialog>
  );
}
