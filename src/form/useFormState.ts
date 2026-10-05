// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A form's answers as typed, and what the engine makes of them: which fields show (show-if), the
// computed formula and row-number cells, and the refused answers. The engine is the only judge,
// so the form asks it on every change (debounced) instead of evaluating rules itself.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../engine/client';
import type { Answers, Field, FieldError, Prepared, Schema } from '../engine/types';
import { defaultAnswers } from '../store/answers';

export interface FormState {
  answers: Answers;
  prepared: Prepared | null;
  visible: Set<string>;
  errors: Map<string, FieldError>;
  setAnswer(key: string, value: unknown): void;
  replace(answers: Answers): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean; // changes not yet saved
  flush(): Promise<void>; // save now
}

const UNDO_LIMIT = 100;

// complete fills in every stored field the answers lack, so prepare reports each visible field.
function complete(fields: Field[], answers: Answers): Answers {
  const defaults = defaultAnswers(fields);
  const out: Answers = { ...answers };
  for (const field of fields) {
    if (field.kind !== 'section' && !(field.key in out)) out[field.key] = defaults[field.key];
  }
  return out;
}

export function useFormState(schema: Schema, initial: Answers, onSave?: (answers: Answers) => Promise<unknown>): FormState {
  const [answers, setAnswersState] = useState<Answers>(initial);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [steps, setSteps] = useState({ past: 0, future: 0 });
  const [dirty, setDirty] = useState(false);
  // What handlers read and write between renders: the answers as last set, the undo history, the
  // save callback. Written only in handlers and effects.
  const latest = useRef(initial);
  const history = useRef<{ past: Answers[]; future: Answers[] }>({ past: [], future: [] });
  const lastSnapshot = useRef<{ key: string; at: number } | null>(null);
  const save = useRef(onSave);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    save.current = onSave;
  }, [onSave]);

  const setAnswers = useCallback((next: Answers) => {
    latest.current = next;
    setAnswersState(next);
  }, []);
  const setHistory = useCallback((next: { past: Answers[]; future: Answers[] }) => {
    history.current = next;
    setSteps({ past: next.past.length, future: next.future.length });
  }, []);

  // Ask the engine after each change.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      engine.prepare(schema, complete(schema.fields, answers)).then(
        (result) => !cancelled && setPrepared(result),
        () => {
          // a template the engine cannot prepare shows no rules; the editor reports the template
        },
      );
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [schema, answers]);

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (save.current) await save.current(latest.current);
    setDirty(false);
  }, []);

  const schedule = useCallback(() => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 600);
  }, [flush]);

  // Save what is pending when the form goes away.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void save.current?.(latest.current);
      }
    },
    [],
  );

  const setAnswer = useCallback(
    (key: string, value: unknown) => {
      const previous = latest.current;
      // Typing in one field is one undo step until the person pauses.
      const now = Date.now();
      const coalesce = lastSnapshot.current?.key === key && now - lastSnapshot.current.at < 800;
      lastSnapshot.current = { key, at: now };
      if (!coalesce) setHistory({ past: [...history.current.past.slice(-UNDO_LIMIT + 1), previous], future: [] });
      setAnswers({ ...previous, [key]: value });
      schedule();
    },
    [schedule, setAnswers, setHistory],
  );

  const replace = useCallback(
    (next: Answers) => {
      setHistory({ past: [], future: [] });
      setAnswers(next);
    },
    [setAnswers, setHistory],
  );

  const undo = useCallback(() => {
    const h = history.current;
    if (h.past.length === 0) return;
    setHistory({ past: h.past.slice(0, -1), future: [latest.current, ...h.future] });
    setAnswers(h.past[h.past.length - 1]);
    lastSnapshot.current = null;
    schedule();
  }, [schedule, setAnswers, setHistory]);

  const redo = useCallback(() => {
    const h = history.current;
    if (h.future.length === 0) return;
    setHistory({ past: [...h.past, latest.current], future: h.future.slice(1) });
    setAnswers(h.future[0]);
    lastSnapshot.current = null;
    schedule();
  }, [schedule, setAnswers, setHistory]);

  const visible = useMemo(() => {
    if (!prepared) return new Set(schema.fields.map((f) => f.key));
    const keys = new Set(Object.keys(prepared.answers));
    // Sections are never answered: one shows while any field after it (up to the next) shows.
    let section: string | null = null;
    let sectionShown = false;
    const shown = new Set<string>();
    const close = () => {
      if (section && sectionShown) shown.add(section);
    };
    for (const field of schema.fields) {
      if (field.kind === 'section') {
        close();
        section = field.key;
        sectionShown = false;
      } else if (keys.has(field.key)) {
        shown.add(field.key);
        sectionShown = true;
      }
    }
    close();
    return shown;
  }, [prepared, schema]);

  const errors = useMemo(() => {
    const map = new Map<string, FieldError>();
    for (const error of prepared?.errors ?? []) if (!map.has(error.key)) map.set(error.key, error);
    return map;
  }, [prepared]);

  return {
    answers,
    prepared,
    visible,
    errors,
    setAnswer,
    replace,
    undo,
    redo,
    canUndo: steps.past > 0,
    canRedo: steps.future > 0,
    dirty,
    flush,
  };
}

// The words for the engine's error codes (reb specification section 8.2).
export function errorText(error: FieldError, field?: Field): string {
  const count = error.params?.count;
  switch (error.code) {
    case 'blank':
      return field?.kind === 'checkbox' ? 'This must be ticked.' : 'This is required.';
    case 'invalid':
      return field?.pattern ? 'This does not match the expected format.' : 'This answer is not valid.';
    case 'too_long':
      return `At most ${count} characters.`;
    case 'not_a_number':
      return 'Enter a number.';
    case 'invalid_date':
      return 'Enter a date.';
    case 'not_an_option':
      return 'Choose one of the options.';
    case 'too_many_files':
      return `At most ${count} files.`;
    case 'too_many_rows':
      return `At most ${count} rows.`;
    case 'too_small':
      return field?.kind === 'date' ? `On or after ${count}.` : `At least ${count}.`;
    case 'too_large':
      return field?.kind === 'date' ? `On or before ${count}.` : `At most ${count}.`;
    default:
      return 'This answer is not valid.';
  }
}
