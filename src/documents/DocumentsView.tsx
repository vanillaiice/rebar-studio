// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Every document, by template and status, with batch export: PDFs to a folder (the desktop app
// makes them; a browser exports .rebdoc files instead), .rebdoc files, and a template's register.

import { CheckSquare, FileDown, FilePlus2, FileSpreadsheet, FileText, Loader2, Package, Search, Square, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../app/router';
import { useSettings } from '../app/useSettings';
import { Badge, Button, Dialog, EmptyState, Menu, TextInput } from '../components/ui';
import { errorMessage, formatDate, inputClass } from '../components/format';
import { useConfirm } from '../components/useConfirm';
import { useToast } from '../components/toast';
import { buildRebdoc, importRebdoc } from '../formats/rebdoc';
import { IS_DESKTOP, openFiles, safeFileName, saveFile, saveFiles } from '../platform/bridge';
import { fileName, pdfOf, register } from '../render/exports';
import { createDocument, deleteDocument, listDocuments } from '../store/documents';
import { getVersion, listTemplates } from '../store/templates';
import type { StudioDocument, Template } from '../store/types';

export function StatusBadge({ document }: { document: StudioDocument }) {
  return document.status === 'final' ? <Badge tone="green">Final</Badge> : <Badge tone="amber">Draft</Badge>;
}

export function DocumentsView({ templateId }: { templateId: string | null }) {
  const [documents, setDocuments] = useState<StudioDocument[] | null>(null);
  const [templates, setTemplates] = useState<Map<string, Template>>(new Map());
  const [versionNumbers, setVersionNumbers] = useState<Map<string, number>>(new Map());
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const settings = useSettings();
  const toast = useToast();

  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [all, allTemplates] = await Promise.all([listDocuments({ templateId: templateId ?? undefined }), listTemplates()]);
      const numbers = new Map<string, number>();
      for (const id of new Set(all.map((d) => d.templateVersionId))) numbers.set(id, (await getVersion(id))?.number ?? 0);
      return { all, allTemplates, numbers };
    })().then(({ all, allTemplates, numbers }) => {
      if (cancelled) return;
      setTemplates(new Map(allTemplates.map((t) => [t.id, t])));
      setVersionNumbers(numbers);
      setDocuments(all);
      setSelected(new Set());
    });
    return () => {
      cancelled = true;
    };
  }, [templateId, reloads]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (documents ?? []).filter(
      (d) =>
        (!status || d.status === status) &&
        (!q || d.title.toLowerCase().includes(q) || d.reference.toLowerCase().includes(q) || d.project.toLowerCase().includes(q)),
    );
  }, [documents, status, query]);
  const chosen = visible.filter((d) => selected.has(d.id));
  const filterTemplate = templateId ? templates.get(templateId) : undefined;

  const task = async (label: string, work: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const done = await work();
      if (done) toast(done, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportPdfs = (list: StudioDocument[]) =>
    task('Exporting PDFs…', async () => {
      const files = [];
      for (const document of list) {
        const template = templates.get(document.templateId);
        if (!template) continue;
        files.push({ name: fileName(settings.fileNamePattern, document, template, 'pdf'), bytes: await pdfOf(document) });
      }
      if (await saveFiles(files, 'documents.zip')) return `${files.length} PDF${files.length === 1 ? '' : 's'} exported`;
    });

  const exportRebdocs = (list: StudioDocument[]) =>
    task('Exporting documents…', async () => {
      const files = [];
      for (const document of list) {
        const template = templates.get(document.templateId);
        const version = await getVersion(document.templateVersionId);
        if (!template || !version) continue;
        files.push({ name: fileName(settings.fileNamePattern, document, template, 'rebdoc'), bytes: await buildRebdoc(document, version, template) });
      }
      if (files.length === 1) {
        await saveFile({ ...files[0], type: 'application/zip', filters: [{ name: 'Rebar document', extensions: ['rebdoc'] }] });
        return 'Document exported';
      }
      if (await saveFiles(files, 'documents-rebdoc.zip')) return `${files.length} documents exported`;
    });

  const exportRegister = (format: 'csv' | 'json') =>
    task('Building the register…', async () => {
      if (!filterTemplate) return;
      const list = chosen.length > 0 ? chosen : visible;
      const content = await register(list, filterTemplate, format);
      await saveFile({
        name: `${safeFileName(filterTemplate.name)} register.${format}`,
        bytes: new TextEncoder().encode(format === 'csv' ? '﻿' + content : content),
        type: format === 'csv' ? 'text/csv' : 'application/json',
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
    });

  const removeSelected = async () => {
    const finals = chosen.filter((d) => d.status === 'final').length;
    const ok = await confirm({
      title: 'Delete documents',
      message: `${chosen.length} document${chosen.length === 1 ? '' : 's'} will be deleted with their photos${finals ? `, including ${finals} final document${finals === 1 ? '' : 's'} and their PDFs` : ''}. This cannot be undone.`,
      action: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await task('Deleting…', async () => {
      for (const document of chosen) await deleteDocument(document.id);
      return 'Deleted';
    });
    load();
  };

  const importFiles = async () => {
    const files = await openFiles('.rebdoc', true);
    for (const file of files) {
      await task(`Importing ${file.name}…`, async () => {
        await importRebdoc(new Uint8Array(await file.arrayBuffer()));
        return `Imported ${file.name}`;
      });
    }
    load();
  };

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allSelected = visible.length > 0 && chosen.length === visible.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-brand-steel px-6 py-4">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-lg font-bold text-white">{filterTemplate ? `${filterTemplate.name}: documents` : 'Documents'}</h1>
          <p className="text-xs text-slate-400">Fill documents from your templates; finalize them to lock their PDF.</p>
        </div>
        <Button icon={<Upload size={16} />} onClick={importFiles}>Import .rebdoc</Button>
        <Button
          variant="primary"
          icon={<FilePlus2 size={16} />}
          onClick={() => (filterTemplate ? task('Creating…', async () => navigate({ name: 'document', id: (await createDocument(filterTemplate.id)).id })) : setChoosing(true))}
        >
          New document
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <TextInput aria-label="Search documents" placeholder="Search title, reference, project" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <select aria-label="Template" value={templateId ?? ''} onChange={(e) => navigate({ name: 'documents', templateId: e.target.value || null })} className={`${inputClass} w-auto`}>
          <option value="">All templates</option>
          {[...templates.values()].map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Drafts and final</option>
          <option value="draft">Drafts</option>
          <option value="final">Final</option>
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {busy && <span className="flex items-center gap-2 text-xs text-brand-amber"><Loader2 size={14} className="animate-spin" />{busy}</span>}
          {chosen.length > 0 && (
            <>
              <span className="text-xs text-slate-400">{chosen.length} selected</span>
              {IS_DESKTOP && <Button size="sm" icon={<FileDown size={14} />} onClick={() => exportPdfs(chosen)}>Export PDFs</Button>}
              <Button size="sm" icon={<Package size={14} />} onClick={() => exportRebdocs(chosen)}>Export .rebdoc</Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={removeSelected}>Delete</Button>
            </>
          )}
          {filterTemplate && (
            <Menu
              label="Export the register"
              icon={<FileSpreadsheet size={18} />}
              items={[
                { label: 'Register as CSV', run: () => exportRegister('csv') },
                { label: 'Register as JSON', run: () => exportRegister('json') },
              ]}
            />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-8">
        {documents !== null && visible.length === 0 ? (
          <EmptyState icon={<FileText size={36} />} title="No documents">
            Create one from a template; it starts as a draft you can fill on any device.
          </EmptyState>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="w-10 py-2">
                  <button type="button" aria-label={allSelected ? 'Select none' : 'Select all'} onClick={() => setSelected(allSelected ? new Set() : new Set(visible.map((d) => d.id)))} className="text-slate-400 hover:text-white">
                    {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                <th className="py-2 font-semibold">Reference</th>
                <th className="py-2 font-semibold">Title</th>
                <th className="py-2 font-semibold">Template</th>
                <th className="py-2 font-semibold">Status</th>
                <th className="py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((document) => (
                <tr key={document.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2.5">
                    <input type="checkbox" aria-label={`Select ${document.title}`} checked={selected.has(document.id)} onChange={() => toggle(document.id)} className="h-4 w-4 accent-brand-amber" />
                  </td>
                  <td className="py-2.5 font-mono text-xs text-slate-300">
                    {document.reference}
                    {document.revision > 1 && <span className="ml-1 text-slate-500">rev {document.revision}</span>}
                  </td>
                  <td className="py-2.5">
                    <a href={`#/documents/${document.id}`} className="font-semibold text-white hover:text-brand-amber">{document.title}</a>
                    {document.project && <span className="block text-xs text-slate-500">{document.project}</span>}
                  </td>
                  <td className="py-2.5 text-slate-400">
                    {templates.get(document.templateId)?.name ?? 'Deleted template'}
                    <span className="ml-1 text-xs text-slate-600">v{versionNumbers.get(document.templateVersionId)}</span>
                  </td>
                  <td className="py-2.5"><StatusBadge document={document} /></td>
                  <td className="py-2.5 text-xs text-slate-500">{formatDate(document.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {choosing && (
        <Dialog title="New document from…" onClose={() => setChoosing(false)}>
          <ul className="flex flex-col gap-2">
            {[...templates.values()].filter((t) => !t.archived).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setChoosing(false);
                    void task('Creating…', async () => navigate({ name: 'document', id: (await createDocument(t.id)).id }));
                  }}
                  className="w-full rounded-lg border border-white/10 px-4 py-3 text-left hover:border-brand-amber"
                >
                  <span className="font-semibold text-white">{t.name}</span>
                  {t.description && <span className="block text-xs text-slate-400">{t.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {confirmDialog}
    </div>
  );
}
