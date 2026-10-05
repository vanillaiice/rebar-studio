// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A live example for the reference: what you write, the form it produces (the real form, to try),
// and the page it prints, rendered by the engine as the form changes.

import { clsx } from 'clsx';
import { FilePlus2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../app/router';
import { useSettings } from '../app/useSettings';
import { errorMessage } from '../components/format';
import { useToast } from '../components/toast';
import { engine } from '../engine/client';
import type { CompiledTemplate } from '../engine/types';
import type { FileSupport } from '../form/fileSupport';
import { FormView } from '../form/FormView';
import { useFormState } from '../form/useFormState';
import { contentSecurityPolicy, engineAssetUrl } from '../render/document';
import { blobToDataUrl, inlineFiles } from '../render/files';
import { defaultAnswers } from '../store/answers';
import { createTemplate } from '../store/templates';
import { assetIdOf, assetRef } from '../store/types';

// The values a document brings (specification 5.1), as an example document would have them.
const EXAMPLE_SYSTEM: Record<string, unknown> = {
  ID: 'example',
  Name: 'Site visit, east wing',
  Number: 12,
  Reference: 'D-12',
  ProjectName: 'Al Sadd Tower',
  ReporterName: 'Mariam Haddad',
  TemplateName: 'Site visit',
  CreatedAt: new Date().toISOString(),
  OrganizationName: 'Gulf Build Contracting',
  OrganizationLogo: '',
  Attachments: [],
  Photos: [],
};

// Source colouring: <reb-*> tags in amber, other tags quieter, {{...}} bindings in sky blue.
const TOKENS = /(\{\{[\s\S]*?\}\})|(<\/?reb-[\w-]+)|(<\/?[a-zA-Z][\w-]*|\/?>)|("[^"]*")|(\s[\w-]+(?==))/g;

export function Source({ code }: { code: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKENS)) {
    if (match.index > last) parts.push(code.slice(last, match.index));
    const [text, binding, reb, tag, string, attribute] = match;
    const className = binding
      ? 'text-sky-300'
      : reb
        ? 'font-semibold text-brand-amber'
        : tag
          ? 'text-slate-400'
          : string
            ? 'text-emerald-300'
            : attribute
              ? 'text-slate-300'
              : undefined;
    parts.push(
      <span key={match.index} className={className}>
        {text}
      </span>,
    );
    last = match.index + text.length;
  }
  parts.push(code.slice(last));
  return (
    <pre className="reference-code overflow-x-auto whitespace-pre-wrap break-words p-4 text-[13px] leading-relaxed text-slate-200">
      <code>{parts}</code>
    </pre>
  );
}

// Files added in an example stay in memory, with the data: URLs the printed page needs.
function useExampleFiles(): FileSupport & { dataUrl(ref: unknown): string | undefined } {
  const files = useRef(new Map<string, { url: string; dataUrl: string; createdAt: string }>());
  const [, bump] = useState(0);
  useEffect(() => {
    const all = files.current;
    return () => all.forEach((f) => URL.revokeObjectURL(f.url));
  }, []);
  return useMemo(
    () => ({
      url: (ref) => (typeof ref === 'string' ? files.current.get(ref)?.url : undefined),
      dataUrl: (ref) => (typeof ref === 'string' ? files.current.get(ref)?.dataUrl : undefined),
      createdAt: (ref) => (typeof ref === 'string' ? files.current.get(ref)?.createdAt : undefined),
      async add(blob) {
        const ref = assetRef(`example-${crypto.randomUUID()}`);
        files.current.set(ref, { url: URL.createObjectURL(blob), dataUrl: await blobToDataUrl(blob), createdAt: new Date().toISOString() });
        bump((n) => n + 1);
        return ref;
      },
    }),
    [],
  );
}

// The printed page is loaded once; later versions of its body are sent in and swapped in place
// (Tailwind restyles new content by itself), so typing never reloads or blanks it.
function pageBody(rendered: string): string {
  return rendered.replace(/<script[^>]*tailwindcss\.js[^>]*><\/script>/g, '');
}

function pageDocument(body: string, tailwind: boolean): string {
  const html = body;
  const origin = new URL(engineAssetUrl('tailwindcss.js')).origin;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy([origin === 'null' ? '' : origin, 'app:'].filter(Boolean))}">
<style>html,body{margin:0;background:#fff;color:#0f172a}body{padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5}img{max-width:100%}rebar-pdf-footer-extract,rebar-pdf-header-extract{display:none}</style>
${tailwind ? `<script src="${engineAssetUrl('tailwindcss.js')}"></script>` : ''}
<script>new ResizeObserver(function(){parent.postMessage({type:'reb-example-height',h:document.documentElement.scrollHeight},'*')}).observe(document.documentElement);
addEventListener('message',function(e){if(e.source===parent&&e.data&&e.data.type==='reb-example-body')document.body.innerHTML=e.data.html})</script>
</head><body>${html}</body></html>`;
}

function Pane({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <figure className={clsx('flex min-w-0 flex-col', className)}>
      <figcaption className="mb-2 font-sans text-xs font-semibold text-slate-400">{title}</figcaption>
      {children}
    </figure>
  );
}

function Live({ compiled, source, answers }: { compiled: CompiledTemplate; source: string; answers?: Record<string, unknown> }) {
  const settings = useSettings();
  const files = useExampleFiles();
  const state = useFormState(compiled.fields, { ...defaultAnswers(compiled.fields.fields), ...answers });
  const [page, setPage] = useState('');
  const [height, setHeight] = useState(160);
  const frame = useRef<HTMLIFrameElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const prepared = await engine.prepare(compiled.fields, state.answers);
      const names = new Map<string, string>();
      const assets: Record<string, string> = {};
      JSON.stringify(prepared.answers, (_key, value) => {
        const id = assetIdOf(value);
        if (id !== null && files.dataUrl(value)) {
          const name = `example-${names.size}.png`;
          assets[value] = name;
          names.set(name, files.dataUrl(value)!);
        }
        return value;
      });
      const result = await engine.render({ html: compiled.htmlSource, system: EXAMPLE_SYSTEM, answers: prepared.answers, assets, fields: compiled.fields });
      if (cancelled) return;
      const rendered = result.ok ? result.html : `<p style="color:#b91c1c">${result.error}</p>`;
      const body = inlineFiles(pageBody(rendered), names);
      const target = frame.current?.contentWindow;
      if (loaded.current && target) target.postMessage({ type: 'reb-example-body', html: body }, '*');
      else setPage(pageDocument(body, rendered.includes('tailwindcss.js')));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [compiled, state.answers, files]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === 'reb-example-height') {
        setHeight(Math.min(900, Math.max(80, Number(event.data.h) || 0)));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
      <Pane title="You write">
        <div className="rounded-lg border border-white/10 bg-brand-steel-dark">
          <Source code={source} />
        </div>
      </Pane>
      <Pane title="People fill in">
        <div className="reference-form rounded-lg border border-white/10 bg-brand-steel p-4 font-sans">
          <FormView fields={compiled.fields.fields} state={state} files={files} photo={settings.photos} />
        </div>
      </Pane>
      <Pane title="The page prints">
        <div className="rounded-sm bg-white shadow-[0_1px_0_rgba(255,255,255,0.06),0_18px_40px_-12px_rgba(0,0,0,0.7)]">
          {page && (
            <iframe
              ref={frame}
              title="Printed page"
              srcDoc={page}
              sandbox="allow-scripts"
              onLoad={() => (loaded.current = true)}
              className="block w-full border-0 transition-[height] duration-150 motion-reduce:transition-none"
              style={{ height }}
            />
          )}
        </div>
      </Pane>
    </div>
  );
}

// Every example is styled with Tailwind; the tag that asks for it is left out of the code shown.
const TAILWIND = '<reb-tailwind></reb-tailwind>\n';

// Example compiles the source once and shows it live; "Start a template from this" opens it in
// the editor as a new template.
export function Example({ source: shown, name, answers }: { source: string; name: string; answers?: Record<string, unknown> }) {
  const source = TAILWIND + shown;
  const [compiled, setCompiled] = useState<CompiledTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    void engine.compile(source).then((result) => {
      if (cancelled) return;
      if (result.ok) setCompiled(result);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const start = async () => {
    try {
      const template = await createTemplate({ name, source, result: await engine.compile(source) });
      navigate({ name: 'editor', id: template.id });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="not-prose my-8">
      {error && <p className="text-sm text-red-300">{error}</p>}
      {compiled && <Live compiled={compiled} source={shown} answers={answers} />}
      <button type="button" onClick={start} className="mt-3 inline-flex items-center gap-2 rounded-md px-2 py-1 font-sans text-sm font-semibold text-brand-amber hover:bg-brand-amber/10">
        <FilePlus2 size={17} /> Start a template from this
      </button>
    </div>
  );
}
