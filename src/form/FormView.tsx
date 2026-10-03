// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The form a template produces, built from the engine's normalized schema (plan section 6). Sections
// become steps on narrow screens and anchored groups on wide ones. Errors show once a field was
// touched, or everywhere after an attempt to finalize.

import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, PenLine, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/ui';
import { inputClass } from '../components/format';
import type { Field } from '../engine/types';
import type { FileSupport } from './fileSupport';
import { ImagesField, type PhotoOptions } from './ImagesField';
import { SignaturePad } from './SignaturePad';
import { TableField } from './TableField';
import { fieldDomId } from './fields';
import { errorText, type FormState } from './useFormState';

interface Group {
  section: Field | null;
  fields: Field[];
}

function groups(fields: Field[]): Group[] {
  const out: Group[] = [{ section: null, fields: [] }];
  for (const field of fields) {
    if (field.kind === 'section') out.push({ section: field, fields: [] });
    else out[out.length - 1].fields.push(field);
  }
  return out.filter((g) => g.fields.length > 0);
}

function SignatureField({ field, value, onChange, files, readOnly }: { field: Field; value: unknown; onChange(v: string): void; files: FileSupport; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const url = files.url(value);
  const signedAt = files.createdAt(value);
  return (
    <div id={fieldDomId(field.key)} className="flex flex-wrap items-center gap-3">
      {url ? (
        <figure>
          <img src={url} alt={`${field.label} (signed)`} className="h-20 rounded-md bg-white px-2" />
          {signedAt && <figcaption className="mt-1 text-[11px] text-slate-500">Signed {new Date(signedAt).toLocaleString()}</figcaption>}
        </figure>
      ) : (
        readOnly && <span className="text-sm text-slate-500">Not signed</span>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Button icon={<PenLine size={15} />} onClick={() => setOpen(true)}>
            {url ? 'Sign again' : 'Sign'}
          </Button>
          {url && (
            <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => onChange('')}>
              Clear
            </Button>
          )}
        </div>
      )}
      {open && (
        <SignaturePad
          title={field.label}
          onClose={() => setOpen(false)}
          onDone={async (png) => {
            setOpen(false);
            onChange(await files.add(png, 'signature', { name: `${field.key}.png` }));
          }}
        />
      )}
    </div>
  );
}

function Control({ field, state, files, readOnly, photo, onTouch }: { field: Field; state: FormState; files: FileSupport; readOnly?: boolean; photo: PhotoOptions; onTouch(): void }) {
  const value = state.answers[field.key];
  const set = (v: unknown) => state.setAnswer(field.key, v);
  const id = fieldDomId(field.key);
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  switch (field.kind) {
    case 'textarea':
      return (
        <textarea
          id={id}
          disabled={readOnly}
          value={text}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
          onBlur={onTouch}
          rows={5}
          className={clsx(inputClass, 'min-h-28 resize-y')}
        />
      );
    case 'number':
      return (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          disabled={readOnly}
          value={text}
          min={field.min}
          max={field.max}
          step={field.step || 'any'}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
          onBlur={onTouch}
          className={clsx(inputClass, 'max-w-xs')}
        />
      );
    case 'date':
      return (
        <input id={id} type="date" disabled={readOnly} value={text} min={field.min} max={field.max} onChange={(e) => set(e.target.value)} onBlur={onTouch} className={clsx(inputClass, 'max-w-xs')} />
      );
    case 'select':
      if (field.type === 'radio') {
        return (
          <div id={id} role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-2">
            {(field.options ?? []).map((option) => (
              <label key={option} className={clsx('flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm', text === option ? 'border-brand-amber bg-brand-amber/10 text-white' : 'border-white/10 text-slate-300')}>
                <input type="radio" name={field.key} disabled={readOnly} checked={text === option} onChange={() => set(option)} onBlur={onTouch} className="accent-brand-amber" />
                {option}
              </label>
            ))}
          </div>
        );
      }
      return (
        <select id={id} disabled={readOnly} value={text} onChange={(e) => set(e.target.value)} onBlur={onTouch} className={clsx(inputClass, 'max-w-md')}>
          <option value="">Choose…</option>
          {(field.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    case 'checkbox':
      return (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-200">
          <input id={id} type="checkbox" disabled={readOnly} checked={value === true} onChange={(e) => { set(e.target.checked); onTouch(); }} className="h-5 w-5 accent-brand-amber" />
          {field.label}
        </label>
      );
    case 'images':
      return <ImagesField id={id} value={value} onChange={(refs) => { set(refs); onTouch(); }} files={files} readOnly={readOnly} photo={photo} />;
    case 'signature':
      return <SignatureField field={field} value={value} onChange={(v) => { set(v); onTouch(); }} files={files} readOnly={readOnly} />;
    case 'table':
      return (
        <div id={id}>
          <TableField field={field} value={value} computed={state.prepared?.answers[field.key]} onChange={(rows) => { set(rows); onTouch(); }} files={files} readOnly={readOnly} photo={photo} />
        </div>
      );
    default: {
      const list = field.options && field.options.length > 0 ? `${id}-options` : undefined;
      return (
        <>
          <input
            id={id}
            type="text"
            disabled={readOnly}
            value={text}
            maxLength={field.maxLength}
            pattern={field.pattern}
            placeholder={field.placeholder}
            list={list}
            onChange={(e) => set(e.target.value)}
            onBlur={onTouch}
            className={inputClass}
          />
          {list && (
            <datalist id={list}>
              {field.options!.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          )}
        </>
      );
    }
  }
}

function FieldBlock({ field, children, error, required }: { field: Field; children: ReactNode; error?: string; required?: boolean }) {
  const labelled = field.kind !== 'checkbox';
  return (
    <div className="flex flex-col gap-1.5" data-field={field.key}>
      {labelled && (
        <label htmlFor={fieldDomId(field.key)} className="text-sm font-semibold text-slate-200">
          {field.label || field.key}
          {required && <span className="ml-1 text-brand-amber" aria-hidden="true">*</span>}
          {required && <span className="sr-only"> (required)</span>}
        </label>
      )}
      {children}
      {field.help && <p className="text-xs text-slate-500">{field.help}</p>}
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormView({
  fields,
  state,
  files,
  readOnly,
  showAllErrors,
  photo,
  focus,
}: {
  fields: Field[];
  state: FormState;
  files: FileSupport;
  readOnly?: boolean;
  showAllErrors?: boolean;
  photo: PhotoOptions;
  focus?: { key: string; nonce: number } | null; // bring this field into view (its step first)
}) {
  const container = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 560));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const visibleGroups = useMemo(
    () =>
      groups(fields)
        .map((g) => ({ ...g, fields: g.fields.filter((f) => state.visible.has(f.key)) }))
        .filter((g) => g.fields.length > 0),
    [fields, state.visible],
  );
  const stepCount = visibleGroups.length;

  // A new focus request shows its step first (state adjusted while rendering), then the field.
  const [focused, setFocused] = useState(focus);
  if (focus !== focused) {
    setFocused(focus);
    const index = focus ? visibleGroups.findIndex((g) => g.fields.some((f) => f.key === focus.key)) : -1;
    if (index >= 0) setStep(index);
  }
  useEffect(() => {
    if (!focus) return;
    requestAnimationFrame(() => {
      const element = document.getElementById(fieldDomId(focus.key));
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (element?.matches('input, textarea, select, button, [tabindex]') ? element : element?.querySelector<HTMLElement>('input, textarea, select, button'))?.focus({ preventScroll: true });
    });
  }, [focus]);
  const current = Math.min(step, Math.max(0, stepCount - 1));
  const useSteps = narrow && stepCount > 1;
  const shown = useSteps ? [visibleGroups[current]] : visibleGroups;

  const render = (group: Group, index: number) => (
    <section key={group.section?.key ?? `group-${index}`} id={group.section ? fieldDomId(group.section.key) : undefined} className="scroll-mt-4">
      {group.section && <h2 className="mb-4 border-b border-white/10 pb-2 text-base font-bold text-white">{group.section.label}</h2>}
      <div className="flex flex-col gap-5">
        {group.fields.map((field) => {
          const error = state.errors.get(field.key);
          const show = !readOnly && error && (showAllErrors || touched.has(field.key));
          return (
            <FieldBlock key={field.key} field={field} required={field.required} error={show ? errorText(error, field) : undefined}>
              <Control
                field={field}
                state={state}
                files={files}
                readOnly={readOnly}
                photo={photo}
                onTouch={() => setTouched((t) => (t.has(field.key) ? t : new Set(t).add(field.key)))}
              />
            </FieldBlock>
          );
        })}
      </div>
    </section>
  );

  return (
    <div ref={container} className="flex gap-8">
      {!useSteps && visibleGroups.filter((g) => g.section).length > 1 && (
        <nav aria-label="Sections" className="sticky top-0 hidden w-44 shrink-0 self-start lg:block">
          <ul className="flex flex-col gap-1 text-sm">
            {visibleGroups.map(
              (g) =>
                g.section && (
                  <li key={g.section.key}>
                    <a href={`#${fieldDomId(g.section.key)}`} onClick={(e) => { e.preventDefault(); document.getElementById(fieldDomId(g.section!.key))?.scrollIntoView({ behavior: 'smooth' }); }} className="block rounded px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white">
                      {g.section.label}
                    </a>
                  </li>
                ),
            )}
          </ul>
        </nav>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        {useSteps && (
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Step {current + 1} of {stepCount}
          </p>
        )}
        {shown.map(render)}
        {fields.filter((f) => f.kind !== 'section').length === 0 && <p className="text-sm text-slate-500">This template has no fields to fill.</p>}
        {useSteps && (
          <div className="flex justify-between">
            <Button icon={<ChevronLeft size={16} />} disabled={current === 0} onClick={() => setStep(current - 1)}>
              Back
            </Button>
            <Button variant="primary" disabled={current >= stepCount - 1} onClick={() => setStep(current + 1)}>
              Next <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
