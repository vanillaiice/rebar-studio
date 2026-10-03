// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The engine's coded errors and warnings, placed on the source: the engine names the field or tag,
// and the marker goes on the <reb-*> tag declaring it (the whole first line when nothing matches).

import type { CompileResult, Diagnostic } from '../engine/types';

export interface Marker {
  severity: 'error' | 'warning';
  message: string;
  line: number; // 1-based
  column: number;
  endLine: number;
  endColumn: number;
}

function position(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// locate finds the tag declaring a field (or the first match of a pattern) and spans it.
function locate(source: string, pattern: RegExp | null): Omit<Marker, 'severity' | 'message'> {
  const match = pattern ? pattern.exec(source) : null;
  if (!match) {
    const firstLine = source.split('\n')[0] ?? '';
    return { line: 1, column: 1, endLine: 1, endColumn: firstLine.length + 1 };
  }
  const start = position(source, match.index);
  const end = position(source, match.index + match[0].length);
  return { line: start.line, column: start.column, endLine: end.line, endColumn: end.column };
}

function fieldTag(name: string): RegExp {
  return new RegExp(`<reb-[a-z]+\\b[^>]*\\bname\\s*=\\s*(["'])${escapeRegExp(name)}\\1[^>]*>`, 'i');
}

function placeDiagnostic(code: string, params: Record<string, string> | undefined): RegExp | null {
  const field = params?.field;
  switch (code) {
    case 'invalid_field_name':
      return params?.name !== undefined ? fieldTag(params.name) : null;
    case 'invalid_show_if':
    case 'invalid_pattern':
    case 'missing_label':
    case 'show_if_unknown_field':
    case 'unused_field':
    case 'duplicate_field':
      return field ? fieldTag(field) : null;
    case 'unknown_binding':
      return params?.name ? new RegExp(`\\{\\{[^}]*\\.${escapeRegExp(params.name)}\\b[^}]*\\}\\}`) : null;
    case 'syntax': {
      // "template syntax: :12: function "foo" not defined": find the unknown name or the action.
      const quoted = /"([^"]+)"/.exec(params?.detail ?? '');
      return quoted ? new RegExp(`\\{\\{[^}]*${escapeRegExp(quoted[1])}[^}]*\\}\\}`) : /\{\{[^}]*$/m;
    }
    default:
      return null;
  }
}

export function markersFor(source: string, result: CompileResult | null): Marker[] {
  if (!result) return [];
  if (!result.ok) {
    return [{ severity: 'error', message: result.error, ...locate(source, placeDiagnostic(result.code ?? '', result.params)) }];
  }
  const markers = result.warnings.map((warning: Diagnostic) => ({
    severity: 'warning' as const,
    message: warning.message,
    ...locate(source, placeDiagnostic(warning.code, warning.params)),
  }));
  if (result.execError) {
    markers.push({ severity: 'warning', message: `The sample preview failed: ${result.execError}`, ...locate(source, null) });
  }
  return markers;
}
