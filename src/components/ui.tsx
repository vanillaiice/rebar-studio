// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Small shared UI pieces in Studio's look: steel surfaces, amber for the main action.

import { clsx } from 'clsx';
import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { inputClass } from './format';
import { ToastContext, type Toast } from './toast';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-brand-amber text-brand-steel hover:bg-brand-amber-dark',
        variant === 'secondary' && 'bg-brand-steel-light text-slate-100 hover:bg-slate-700',
        variant === 'ghost' && 'text-slate-300 hover:bg-white/5 hover:text-white',
        variant === 'danger' && 'bg-red-600/90 text-white hover:bg-red-600',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-brand-steel shadow-2xl',
          wide ? 'max-w-4xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button data-close type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-300">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}


export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback((message: string, kind: Toast['kind'] = 'info', action?: Toast['action']) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { id, message, kind, action }]);
    if (!action) setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl',
              toast.kind === 'error' && 'border-red-500/40 bg-red-950 text-red-100',
              toast.kind === 'success' && 'border-emerald-500/40 bg-emerald-950 text-emerald-100',
              toast.kind === 'info' && 'border-white/10 bg-brand-steel-light text-slate-100',
            )}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="font-bold text-brand-amber hover:underline"
                onClick={() => {
                  toast.action!.run();
                  setToasts((all) => all.filter((t) => t.id !== toast.id));
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="text-current opacity-60 hover:opacity-100"
              onClick={() => setToasts((all) => all.filter((t) => t.id !== toast.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}


export function Label({ label, help, children, error }: { label: string; help?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      {children}
      {help && <span className="text-xs text-slate-500">{help}</span>}
      {error && <span className="text-xs font-medium text-red-400">{error}</span>}
    </label>
  );
}


export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputClass, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(inputClass, 'min-h-24', props.className)} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'amber' | 'red' | 'green' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'neutral' && 'bg-white/5 text-slate-300',
        tone === 'amber' && 'bg-brand-amber/15 text-brand-amber',
        tone === 'red' && 'bg-red-500/15 text-red-300',
        tone === 'green' && 'bg-emerald-500/15 text-emerald-300',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-16 text-center">
      <div className="text-slate-500">{icon}</div>
      <h3 className="text-base font-bold text-white">{title}</h3>
      {children && <div className="max-w-md text-sm text-slate-400">{children}</div>}
    </div>
  );
}

// Menu: a button that opens a list of actions.
export function Menu({ label, icon, items }: { label: string; icon: ReactNode; items: { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; run(): void }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
      >
        {icon}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 min-w-52 overflow-hidden rounded-lg border border-white/10 bg-brand-steel py-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className={clsx(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm disabled:opacity-40',
                item.danger ? 'text-red-300 hover:bg-red-500/10' : 'text-slate-200 hover:bg-white/5',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
