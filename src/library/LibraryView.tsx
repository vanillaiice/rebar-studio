// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The template library: every template with its current version, search, tags, archive, and the
// starter gallery for new templates.

import {
  Archive, ArchiveRestore, Copy, Download, FilePlus2, FileText, LayoutTemplate, MoreVertical, Package, Pencil, Plus,
  Search, Trash2, Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../app/router';
import { Badge, Button, Dialog, EmptyState, Menu, PageHeader, TextInput } from '../components/ui';
import { errorMessage, formatDate } from '../components/format';
import { useConfirm } from '../components/useConfirm';
import { useToast } from '../components/toast';
import { engine } from '../engine/client';
import { buildRebpack, importReb, importRebpack } from '../formats/rebpack';
import { importRebdoc } from '../formats/rebdoc';
import { openFiles, safeFileName, saveFile } from '../platform/bridge';
import { BLANK_SOURCE, STARTERS, type Starter } from '../starters';
import { createDocument } from '../store/documents';
import {
  createTemplate, currentVersion, deleteTemplate, documentCount, duplicateTemplate, listTemplates, updateTemplate,
} from '../store/templates';
import type { Template, TemplateVersion } from '../store/types';

interface Row {
  template: Template;
  version: TemplateVersion;
  documents: number;
}

export function LibraryView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    void listTemplates()
      .then((templates) =>
        Promise.all(
          templates.map(async (template) => ({
            template,
            version: await currentVersion(template.id),
            documents: await documentCount(template.id),
          })),
        ),
      )
      .then((next) => !cancelled && setRows(next));
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const tags = useMemo(() => [...new Set((rows ?? []).flatMap((r) => r.template.tags))].sort(), [rows]);
  const visible = (rows ?? []).filter((r) => {
    if (r.template.archived !== showArchived) return false;
    if (tag && !r.template.tags.includes(tag)) return false;
    const q = query.trim().toLowerCase();
    return !q || r.template.name.toLowerCase().includes(q) || r.template.description.toLowerCase().includes(q);
  });

  const run = async (work: () => Promise<unknown>, done?: string) => {
    try {
      await work();
      if (done) toast(done, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
    load();
  };

  const importFiles = async () => {
    const files = await openFiles('.reb,.rebpack,.rebdoc,.html,.txt', true);
    for (const file of files) {
      await run(async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (file.name.endsWith('.rebpack')) await importRebpack(bytes, file.name);
        else if (file.name.endsWith('.rebdoc')) await importRebdoc(bytes);
        else await importReb(new TextDecoder().decode(bytes), file.name);
      }, `Imported ${file.name}`);
    }
  };

  const createFrom = async (starter: Starter | null) => {
    setGallery(false);
    const source = starter?.source ?? BLANK_SOURCE;
    try {
      const template = await createTemplate({
        name: starter?.name ?? 'Untitled template',
        description: starter?.description ?? '',
        tags: starter?.tags ?? [],
        source,
        result: await engine.compile(source),
      });
      navigate({ name: 'editor', id: template.id });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const exportPack = (row: Row) =>
    run(async () => {
      const bytes = await buildRebpack(row.template, row.version);
      await saveFile({
        name: `${safeFileName(row.template.name)}.rebpack`,
        bytes,
        type: 'application/zip',
        filters: [{ name: 'Rebar template pack', extensions: ['rebpack'] }],
      });
    });

  const remove = async (row: Row) => {
    const ok = await confirm({
      title: 'Delete template',
      message:
        row.documents > 0
          ? `"${row.template.name}" and its ${row.documents} document${row.documents === 1 ? '' : 's'} (with their photos and PDFs) will be deleted. This cannot be undone.`
          : `"${row.template.name}" and all its versions will be deleted. This cannot be undone.`,
      action: 'Delete',
      danger: true,
    });
    if (ok) await run(() => deleteTemplate(row.template.id, true), 'Template deleted');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader title="Templates" description="Author .reb templates, then fill documents from them.">
        <Button icon={<Upload size={18} />} onClick={importFiles}>
          Import
        </Button>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setGallery(true)}>
          New template
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 px-8 py-4">
        <div className="relative w-full max-w-sm">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <TextInput aria-label="Search templates" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTag(tag === t ? null : t)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tag === t ? 'bg-brand-amber text-brand-steel' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            {t}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-amber" />
          Archived
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-10">
        {rows !== null && visible.length === 0 ? (
          <EmptyState icon={<LayoutTemplate size={36} />} title={showArchived ? 'No archived templates' : 'No templates here'}>
            {showArchived ? 'Archived templates are kept with their documents but hidden from the library.' : 'Start from a starter template, or import a .reb or .rebpack file.'}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-5">
            {visible.map((row) => (
              <li key={row.template.id} className="group flex flex-col rounded-xl border border-white/10 bg-brand-steel p-5 transition hover:border-brand-amber/50">
                <div className="flex items-start gap-2">
                  <a href={`#/templates/${row.template.id}`} className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold text-white group-hover:text-brand-amber">{row.template.name}</h2>
                    <p className="mt-1 line-clamp-3 text-sm text-slate-400">{row.template.description || 'No description'}</p>
                  </a>
                  <Menu
                    label={`Actions for ${row.template.name}`}
                    icon={<MoreVertical size={18} />}
                    items={[
                      { label: 'Edit template', icon: <Pencil size={17} />, run: () => navigate({ name: 'editor', id: row.template.id }) },
                      {
                        label: 'New document',
                        icon: <FilePlus2 size={17} />,
                        disabled: !row.version.compiled,
                        run: () => run(async () => navigate({ name: 'document', id: (await createDocument(row.template.id)).id })),
                      },
                      { label: 'Documents', icon: <FileText size={17} />, run: () => navigate({ name: 'documents', templateId: row.template.id }) },
                      { label: 'Duplicate', icon: <Copy size={17} />, run: () => run(() => duplicateTemplate(row.template.id), 'Template duplicated') },
                      { label: 'Export .rebpack', icon: <Package size={17} />, run: () => exportPack(row) },
                      {
                        label: 'Export .reb source',
                        icon: <Download size={17} />,
                        run: () =>
                          run(() =>
                            saveFile({
                              name: `${safeFileName(row.template.name)}.reb`,
                              bytes: new TextEncoder().encode(row.version.rebSource),
                              type: 'text/plain',
                              filters: [{ name: '.reb template', extensions: ['reb'] }],
                            }),
                          ),
                      },
                      row.template.archived
                        ? { label: 'Unarchive', icon: <ArchiveRestore size={17} />, run: () => run(() => updateTemplate(row.template.id, { archived: false })) }
                        : { label: 'Archive', icon: <Archive size={17} />, run: () => run(() => updateTemplate(row.template.id, { archived: true }), 'Template archived') },
                      { label: 'Delete', icon: <Trash2 size={17} />, danger: true, run: () => remove(row) },
                    ]}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>v{row.version.number}</Badge>
                  {row.version.compiled ? null : <Badge tone="red">Does not compile</Badge>}
                  {row.template.tags.map((t) => (
                    <Badge key={t} tone="amber">{t}</Badge>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between pt-5 text-xs text-slate-500">
                  <a href={`#/documents?template=${row.template.id}`} className="hover:text-white">
                    {row.documents} document{row.documents === 1 ? '' : 's'}
                  </a>
                  <span>Edited {formatDate(row.template.updatedAt)}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button className="flex-1" icon={<Pencil size={16} />} onClick={() => navigate({ name: 'editor', id: row.template.id })}>
                    Edit
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    icon={<FilePlus2 size={16} />}
                    disabled={!row.version.compiled}
                    title={row.version.compiled ? undefined : 'Fix the template before filling documents'}
                    onClick={() => run(async () => navigate({ name: 'document', id: (await createDocument(row.template.id)).id }))}
                  >
                    Fill
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {gallery && (
        <Dialog title="New template" onClose={() => setGallery(false)} wide>
          <p className="mb-5 text-slate-400">Start from a blank page or a starter, then make it your own.</p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            <li>
              <button type="button" onClick={() => createFrom(null)} className="flex h-full w-full flex-col rounded-lg border border-dashed border-white/20 p-5 text-left hover:border-brand-amber">
                <span className="text-base font-bold text-white">Blank template</span>
                <span className="mt-1 text-sm text-slate-400">A title and one field.</span>
              </button>
            </li>
            {STARTERS.map((starter) => (
              <li key={starter.id}>
                <button type="button" onClick={() => createFrom(starter)} className="flex h-full w-full flex-col rounded-lg border border-white/10 bg-brand-steel-dark p-5 text-left hover:border-brand-amber">
                  <span className="text-base font-bold text-white">{starter.name}</span>
                  <span className="mt-1 text-sm text-slate-400">{starter.description}</span>
                  <span className="mt-auto flex gap-1 pt-3">
                    {starter.tags.map((t) => (
                      <Badge key={t} tone="amber">{t}</Badge>
                    ))}
                  </span>
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
