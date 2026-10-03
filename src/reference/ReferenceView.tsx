// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The .reb specification, as shipped by the engine release Studio is built with (copied by
// scripts/build-wasm.sh), plus what is particular to Studio.

import { marked } from 'marked';
import { useEffect, useState } from 'react';
import { BUNDLED_FONTS } from '../render/fonts';

export default function ReferenceView() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(new URL('specification.md', document.baseURI))
      .then((r) => {
        if (!r.ok) throw new Error(`the specification is missing (${r.status})`);
        return r.text();
      })
      .then((text) => setHtml(marked.parse(text, { async: false })))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-white/10 bg-brand-steel px-6 py-4">
        <h1 className="text-lg font-bold text-white">.reb reference</h1>
        <p className="text-xs text-slate-400">The template format, as the engine in this version of Studio implements it.</p>
      </header>
      <div className="mx-auto max-w-4xl p-6">
        <section className="mb-8 rounded-xl border border-brand-amber/30 bg-brand-amber/5 p-5 text-sm text-slate-300">
          <h2 className="mb-2 font-bold text-white">In Rebar Studio</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>System values come from Settings (organization, logo, your name) and from each document (title, reference, project).</li>
            <li>Template images are added in the editor's Images dialog and referred to by file name.</li>
            <li>
              Bundled fonts work offline: {BUNDLED_FONTS.map((f) => `"${f.family}"`).join(', ')}. Name one in your CSS, with a fallback for Rebar,
              which does not have them: <code>font-family: "Inter", Arial, sans-serif</code>.
            </li>
            <li>The desktop app previews and exports the exact PDF Rebar makes. The browser preview cannot show mixed portrait and landscape pages.</li>
          </ul>
        </section>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {html && <article className="reb-prose" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}
