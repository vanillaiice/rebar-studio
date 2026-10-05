// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Draws the specification's Mermaid diagrams without Mermaid: a top-down graph that is a tree
// (graph TD, edges like A[Label] --> B[Label]) becomes nested lists drawn as an outline tree by
// reference.css. Anything else returns null and stays a code block.

const NODE = String.raw`([A-Za-z0-9_]+)(?:\[([^\]]*)\])?`;
const EDGE = new RegExp(`^${NODE}\\s*-->\\s*${NODE}$`);

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function treeDiagram(source: string): string | null {
  const [header, ...lines] = source.trim().split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%'));
  if (!/^(graph|flowchart)\s+(TD|TB)$/.test(header ?? '')) return null;

  const labels = new Map<string, string>();
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  const name = (id: string, label?: string) => {
    if (label !== undefined) labels.set(id, decode(label.trim()));
    else if (!labels.has(id)) labels.set(id, id);
  };
  for (const line of lines) {
    const m = EDGE.exec(line);
    if (!m) return null;
    const [, from, fromLabel, to, toLabel] = m;
    name(from, fromLabel);
    name(to, toLabel);
    if (parent.has(to) || to === from) return null; // not a tree
    parent.set(to, from);
    children.set(from, [...(children.get(from) ?? []), to]);
  }
  const roots = [...labels.keys()].filter((id) => !parent.has(id));
  if (roots.length !== 1) return null; // no root (a cycle) or a forest

  const item = (id: string): string => {
    const kids = children.get(id) ?? [];
    const sub = kids.length ? `<ul>${kids.map(item).join('')}</ul>` : '';
    return `<li><span class="reb-tree-node">${escape(labels.get(id)!)}</span>${sub}</li>`;
  };
  return `<div class="reb-tree"><ul>${item(roots[0])}</ul></div>`;
}
