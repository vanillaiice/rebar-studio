// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A table's rows: add, remove, duplicate and reorder them; type each cell by its column's kind.
// Formula and row-number cells are read-only and show what the engine computed. Enter moves to the
// same cell of the next row (adding one at the end); Tab moves along the row.

import { ArrowDown, ArrowUp, Copy, ImagePlus, PenLine, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Column, Field } from '../engine/types';
import { inputClass } from '../components/format';
import type { FileSupport } from './fileSupport';
import { prepareImage } from './images';
import type { PhotoOptions } from './ImagesField';
import { SignaturePad } from './SignaturePad';

type Row = Record<string, unknown>;

function emptyRow(columns: Column[]): Row {
  return Object.fromEntries(columns.map((c) => [c.key, c.kind === 'checkbox' ? false : '']));
}

function formatTotal(total: number, column: Column): string {
  const decimals = column.kind === 'formula' ? (column.precision ?? 2) : Number.isInteger(total) ? 0 : 2;
  return total.toFixed(decimals);
}

export function TableField({
  field,
  value,
  computed,
  onChange,
  files,
  readOnly,
  photo,
}: {
  field: Field;
  value: unknown;
  computed: unknown;
  onChange(rows: Row[]): void;
  files: FileSupport;
  readOnly?: boolean;
  photo: PhotoOptions;
}) {
  const columns = field.columns ?? [];
  const rows: Row[] = useMemo(() => (Array.isArray(value) ? (value as Row[]) : []), [value]);
  const computedRows: Row[] = Array.isArray(computed) ? (computed as Row[]) : [];
  const [signing, setSigning] = useState<{ row: number; column: string } | null>(null);
  const table = useRef<HTMLTableElement>(null);

  // Images and signatures arrive after an await: they must update the rows as they are then.
  const current = useRef(rows);
  useEffect(() => {
    current.current = rows;
  }, [rows]);
  const setCell = (index: number, key: string, cell: unknown) => {
    onChange(current.current.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));
  };
  const addRow = () => onChange([...rows, emptyRow(columns)]);
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const duplicateRow = (index: number) => onChange([...rows.slice(0, index + 1), { ...rows[index] }, ...rows.slice(index + 1)]);
  const moveRow = (index: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    onChange(next);
  };

  const focusCell = (row: number, column: string) => {
    requestAnimationFrame(() => {
      table.current?.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`)?.focus();
    });
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number, column: string) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (index === rows.length - 1) addRow();
    focusCell(index + 1, column);
  };

  const pickImage = (index: number, key: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const prepared = await prepareImage(file, photo);
      setCell(index, key, await files.add(prepared.blob, 'photo', { name: file.name, width: prepared.width, height: prepared.height }));
    };
    input.click();
  };

  // Computed columns (amounts) get a total; a typed number may be a rate or a size, which adds up to nothing.
  const totals = columns.filter((c) => c.kind === 'formula');
  const sum = (column: Column) =>
    (column.kind === 'formula' ? computedRows : rows).reduce((total, row) => {
      const n = parseFloat(String(row?.[column.key] ?? ''));
      return Number.isFinite(n) ? total + n : total;
    }, 0);

  const cell = (row: Row, index: number, column: Column) => {
    const id = `${index}:${column.key}`;
    const shown = column.kind === 'formula' || column.kind === 'autoincrement' ? computedRows[index]?.[column.key] : row[column.key];
    if (column.kind === 'formula' || column.kind === 'autoincrement') {
      return <span className="block px-2 py-2 text-right font-mono text-sm text-slate-300">{String(shown ?? '')}</span>;
    }
    if (column.kind === 'checkbox') {
      return (
        <input
          data-cell={id}
          type="checkbox"
          aria-label={column.label}
          disabled={readOnly}
          checked={row[column.key] === true}
          onChange={(e) => setCell(index, column.key, e.target.checked)}
          className="mx-auto block h-5 w-5 accent-brand-amber"
        />
      );
    }
    if (column.kind === 'select') {
      return (
        <select
          data-cell={id}
          aria-label={column.label}
          disabled={readOnly}
          value={String(row[column.key] ?? '')}
          onChange={(e) => setCell(index, column.key, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, index, column.key)}
          className={`${inputClass} min-w-28`}
        >
          <option value="" />
          {(column.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    }
    if (column.kind === 'image' || column.kind === 'signature') {
      const url = files.url(row[column.key]);
      return (
        <div className="flex items-center gap-2">
          {url && <img src={url} alt={column.label} className={`h-12 rounded ${column.kind === 'signature' ? 'bg-white px-1' : 'w-16 object-cover'}`} />}
          {!readOnly && (
            <button
              type="button"
              data-cell={id}
              aria-label={url ? `Replace ${column.label}` : `Add ${column.label}`}
              onClick={() => (column.kind === 'image' ? pickImage(index, column.key) : setSigning({ row: index, column: column.key }))}
              className="rounded-md bg-brand-steel-light p-2 text-slate-200 hover:bg-slate-700"
            >
              {column.kind === 'image' ? <ImagePlus size={16} /> : <PenLine size={16} />}
            </button>
          )}
        </div>
      );
    }
    return (
      <input
        data-cell={id}
        aria-label={column.label}
        disabled={readOnly}
        type={column.kind === 'number' ? 'number' : 'text'}
        inputMode={column.kind === 'number' ? 'decimal' : undefined}
        step="any"
        value={String(row[column.key] ?? '')}
        onChange={(e) => setCell(index, column.key, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, index, column.key)}
        className={`${inputClass} ${column.kind === 'number' ? 'min-w-20 text-right' : 'min-w-36'}`}
      />
    );
  };

  return (
    <div className="relative overflow-x-auto rounded-lg border border-white/10">
      <table ref={table} className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-white/5 text-left text-xs uppercase tracking-wider text-slate-400">
            {columns.map((column) => (
              <th key={column.key} className="px-2 py-2 font-semibold">
                {column.label}
              </th>
            ))}
            {!readOnly && <th className="w-px px-2 py-2"><span className="sr-only">Row actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-white/5 align-middle">
              {columns.map((column) => (
                <td key={column.key} className="px-1.5 py-1.5">
                  {cell(row, index, column)}
                </td>
              ))}
              {!readOnly && (
                <td className="whitespace-nowrap px-1.5">
                  <div className="flex gap-0.5">
                    <button type="button" aria-label={`Move row ${index + 1} up`} disabled={index === 0} onClick={() => moveRow(index, -1)} className="rounded p-1.5 text-slate-400 hover:text-white disabled:opacity-30"><ArrowUp size={15} /></button>
                    <button type="button" aria-label={`Move row ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => moveRow(index, 1)} className="rounded p-1.5 text-slate-400 hover:text-white disabled:opacity-30"><ArrowDown size={15} /></button>
                    <button type="button" aria-label={`Duplicate row ${index + 1}`} onClick={() => duplicateRow(index)} className="rounded p-1.5 text-slate-400 hover:text-white"><Copy size={15} /></button>
                    <button type="button" aria-label={`Remove row ${index + 1}`} onClick={() => removeRow(index)} className="rounded p-1.5 text-red-300 hover:text-red-200"><Trash2 size={15} /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-sm text-slate-500">
                No rows yet
              </td>
            </tr>
          )}
        </tbody>
        {totals.length > 0 && rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-white/10 bg-white/5 font-semibold">
              {columns.map((column, i) => (
                <td key={column.key} className="px-2 py-2 text-right font-mono text-sm">
                  {totals.includes(column) ? formatTotal(sum(column), column) : i === 0 ? <span className="font-sans text-xs uppercase tracking-wider text-slate-400">Total</span> : ''}
                </td>
              ))}
              {!readOnly && <td />}
            </tr>
          </tfoot>
        )}
      </table>
      {!readOnly && (
        <button type="button" onClick={addRow} className="flex w-full items-center justify-center gap-2 border-t border-white/10 py-2.5 text-sm font-semibold text-brand-amber hover:bg-white/5">
          <Plus size={16} /> Add row
        </button>
      )}
      {signing && (
        <SignaturePad
          title={columns.find((c) => c.key === signing.column)?.label ?? 'Signature'}
          onClose={() => setSigning(null)}
          onDone={async (png) => {
            const target = signing;
            setSigning(null);
            setCell(target.row, target.column, await files.add(png, 'signature', { name: 'signature.png' }));
          }}
        />
      )}
    </div>
  );
}
