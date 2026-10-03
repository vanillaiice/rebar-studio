// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The reference: enough to write a first template, with live examples (what you write, the form,
// the printed page). The full .reb specification of the engine release Studio is built with
// (copied by scripts/build-wasm.sh) is folded away at the end.

import { Bot, ChevronDown, Download, LayoutTemplate, Mail } from 'lucide-react';
import { marked } from 'marked';
import { useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../app/router';
import { saveFile } from '../platform/bridge';
import { Example, Source } from './Example';
import { ANYWHERE, FIELDS, HERO, LANDSCAPE, PAGES, PHOTOS, RULES, STARTING_ANSWERS, TABLES, VALUES } from './examples';
import './reference.css';

const CONTACT = 'vanillaiice@tutanota.com';

const SECTIONS = [
  ['fields', 'Fields'],
  ['rules', 'Required answers and conditions'],
  ['anywhere', 'Printing answers anywhere'],
  ['tables', 'Tables and totals'],
  ['photos', 'Photos and signatures'],
  ['values', 'Your details and the document’s'],
  ['pages', 'Pages, headers and footers'],
  ['looks', 'How it looks'],
  ['next', 'Where to go next'],
] as const;

function Step({ id, number, title, children }: { id: string; number: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-t border-white/10 pt-12 pb-4">
      <div className="relative">
        <span className="step-number absolute -left-14 top-0.5 hidden text-2xl xl:block" aria-hidden="true">
          {number}
        </span>
        <h2 id={`${id}-title`} className="mb-5">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Snippet({ code }: { code: string }) {
  return (
    <div className="my-6 max-w-[68ch] rounded-lg border border-white/10 bg-brand-steel-dark">
      <Source code={code} />
    </div>
  );
}

const SYSTEM_VALUES: [string, string][] = [
  ['{{.Name}}', 'The document’s title'],
  ['{{.Reference}}, {{.Number}}', 'Its reference (D-12) and number (12)'],
  ['{{.ProjectName}}', 'The project you give the document'],
  ['{{.CreatedAt}}', 'When it was created; print it with formatDate'],
  ['{{.ReporterName}}', 'Your name, from Settings'],
  ['{{.OrganizationName}}', 'Your organization, from Settings'],
  ['{{.OrganizationLogo}}', 'Your logo, for <img src="…">'],
  ['{{.TemplateName}}', 'The template’s name'],
];

const FIELD_TAGS: [string, string, string][] = [
  ['<reb-text>', 'One line of text', 'The text'],
  ['<reb-textarea>', 'A longer text; blank lines start paragraphs', 'Paragraphs'],
  ['<reb-number>', 'A number (min, max and step are optional)', 'The number'],
  ['<reb-date>', 'A date from a calendar', 'The date as 2026-10-03; use formatDate for another style'],
  ['<reb-select>', 'One choice from a list', 'The choice'],
  ['<reb-radio>', 'One choice, shown as buttons', 'The choice'],
  ['type="checkbox"', 'A tick box (on <reb-declare>)', 'Nothing by itself; test it with {{if}}'],
  ['<reb-photogrid>', 'Photos: camera, files, drop or paste', 'The photos'],
  ['<reb-signature>', 'A signature drawn with a finger or mouse', 'The signature as an image'],
  ['<reb-table>', 'Rows of answers', 'Your own table, one row per answer'],
];

function FullSpecification() {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || html) return;
    fetch(new URL('specification.md', document.baseURI))
      .then((r) => {
        if (!r.ok) throw new Error(`The specification is missing (${r.status}).`);
        return r.text();
      })
      .then((text) => setHtml(marked.parse(text, { async: false })))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, html]);
  return (
    <div className="mt-6 rounded-lg border border-white/10">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-sans">
        <span>
          <span className="block font-semibold text-white">The full specification</span>
          <span className="block text-sm text-slate-400">Every tag, attribute and rule of the engine in this version of Studio.</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-white/10 px-5 pb-6">
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          {html && <article className="reb-prose measure" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      )}
    </div>
  );
}

export default function ReferenceView() {
  const downloadGuide = async () => {
    const text = await (await fetch(new URL('reb-ai-guide.md', document.baseURI))).text();
    await saveFile({ name: 'reb-ai-guide.md', bytes: new TextEncoder().encode(text), type: 'text/markdown', filters: [{ name: 'Markdown', extensions: ['md'] }] });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="reference mx-auto flex max-w-[1500px] gap-10 px-6 pb-24 sm:px-10">
        <nav aria-label="On this page" className="sticky top-0 hidden w-52 shrink-0 self-start pt-16 font-sans text-sm 2xl:block">
          <p className="mb-3 font-semibold text-slate-300">On this page</p>
          <ol className="flex flex-col gap-1.5">
            {SECTIONS.map(([id, title], i) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex gap-2 text-slate-400 no-underline hover:text-white"
                  style={{ textDecoration: 'none' }}
                >
                  <span className="w-4 text-right tabular-nums text-slate-600">{i + 1}</span>
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 flex-1 xl:pl-14">
          <header className="pt-16 pb-6">
            <h1 className="measure">Write your first template</h1>
            <p className="measure mt-6 text-xl leading-relaxed text-slate-300">
              A template is an ordinary page with questions in it. You write the page once; Studio turns its questions into a form,
              and every filled form back into the page. Try it: type in the form and watch the page.
            </p>
          </header>

          <Example name="Site visit" source={HERO} answers={STARTING_ANSWERS.HERO} />

          <div className="measure mb-10">
            <p>
              Each tag that starts with <code>reb-</code> is a question. Its <code>name</code> is how the template refers to the
              answer (letters, digits and underscores), its <code>label</code> is what the form asks. Where the tag stands, the
              page prints the answer. Everything else is plain HTML, so a template looks like the document it prints.
            </p>
            <p>
              Templates live under <strong>Templates</strong>; open one to edit it with a live preview. Problems show as marks in the
              editor, with an explanation.
            </p>
          </div>

          <Step id="fields" number={1} title="Fields">
            <p className="measure">Pick the tag for the kind of answer you want. Choices come from <code>options</code>, separated by commas.</p>
            <Example name="Fields" source={FIELDS} answers={STARTING_ANSWERS.FIELDS} />
            <div className="measure overflow-x-auto">
              <table className="reference-table">
                <thead>
                  <tr>
                    <th scope="col">Tag</th>
                    <th scope="col">People fill in</th>
                    <th scope="col">The page prints</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_TAGS.map(([tag, asks, prints]) => (
                    <tr key={tag}>
                      <td><code>{tag}</code></td>
                      <td>{asks}</td>
                      <td>{prints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Step>

          <Step id="rules" number={2} title="Required answers and conditions">
            <p className="measure">
              Add <code>required</code> to a field that must be answered before a document can be finalized, and <code>help</code> for
              a hint under it. <code>show-if</code> shows a field only when a condition holds; a hidden field is not asked and not
              printed. Choose “Hot work” below.
            </p>
            <Example name="Conditions" source={RULES} answers={STARTING_ANSWERS.RULES} />
            <p className="measure">
              Conditions compare answers with <code>==</code> and <code>!=</code> and combine them with <code>and</code>,{' '}
              <code>or</code> and <code>not</code>: <code>show-if="permit and not isolated"</code>. A field alone is true when it is
              answered. Other helpers: <code>placeholder</code>, <code>default</code> (<code>default="today"</code> on a date),{' '}
              <code>min</code> and <code>max</code>, and <code>pattern</code> for a text’s format.
            </p>
          </Step>

          <Step id="anywhere" number={3} title="Printing answers anywhere">
            <p className="measure">
              A field tag prints where it stands. To ask a question without printing it there, declare it with{' '}
              <code>&lt;reb-declare&gt;</code> and its <code>type</code>, then print it wherever you like with{' '}
              <code>{'{{.name}}'}</code>, as often as you like. <code>{'{{if}}'}</code> prints a part only when an answer is given
              or a box is ticked.
            </p>
            <Example name="Answers anywhere" source={ANYWHERE} answers={STARTING_ANSWERS.ANYWHERE} />
          </Step>

          <Step id="tables" number={4} title="Tables and totals">
            <p className="measure">
              A table asks for rows. Its <code>options</code> list the columns, each <code>name:type</code>: <code>text</code>,{' '}
              <code>number</code>, <code>checkbox</code>, <code>photo</code>, <code>signature</code>,{' '}
              <code>select[A|B|C]</code>, <code>autoincrement</code> for the row number, and{' '}
              <code>formula[qty*rate|2]</code> for a computed column with 2 decimals. You design the table yourself: the row marked{' '}
              <code>reb-row</code> repeats once per answer.
            </p>
            <Example name="Priced items" source={TABLES} answers={STARTING_ANSWERS.TABLES} />
            <p className="measure">
              <code>sumColumn</code> adds up a column, <code>formatMoney</code> and <code>formatNumber</code> format the result. Formulas
              use the column names, <code>+ - * /</code> and parentheses; they are computed for you, the same way in Studio and in
              Rebar.
            </p>
          </Step>

          <Step id="photos" number={5} title="Photos and signatures">
            <p className="measure">
              <code>&lt;reb-photogrid&gt;</code> collects photos, from the camera on a tablet; Studio resizes them before storing them.
              A signature is drawn in the form and prints as an image. Declaring it and printing it inside{' '}
              <code>{'{{if}}'}</code> keeps an empty frame off the page until it is signed. Sign below.
            </p>
            <Example name="Photos and signature" source={PHOTOS} />
          </Step>

          <Step id="values" number={6} title="Your details and the document’s">
            <p className="measure">
              Besides its questions, a template can print values Studio fills in: your details from <strong>Settings</strong> and each
              document’s own.
            </p>
            <Example name="Document values" source={VALUES} />
            <div className="measure overflow-x-auto">
              <table className="reference-table">
                <tbody>
                  {SYSTEM_VALUES.map(([value, meaning]) => (
                    <tr key={value}>
                      <td className="whitespace-nowrap"><code>{value}</code></td>
                      <td>{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="measure mt-5">
              Dates print with a pattern written as Go writes 2 January 2006: <code>{'{{formatDate "02/01/2006" .CreatedAt}}'}</code>{' '}
              prints 03/10/2026, and <code>{'{{now | formatDate "2 Jan 2006"}}'}</code> prints today.
            </p>
          </Step>

          <Step id="pages" number={7} title="Pages, headers and footers">
            <p className="measure">
              Pages are A4 unless you say otherwise. <code>&lt;reb-header&gt;</code> and <code>&lt;reb-footer&gt;</code> repeat on every
              page, and fill in the page numbers; <code>&lt;reb-pagebreak&gt;</code> starts a new page.
            </p>
            <Snippet code={PAGES} />
            <p className="measure">
              A named page turns part of the document sideways, for a wide table. The desktop app shows it exactly; a browser preview
              cannot.
            </p>
            <Snippet code={LANDSCAPE} />
          </Step>

          <Step id="looks" number={8} title="How it looks">
            <p className="measure">
              Add <code>&lt;reb-tailwind&gt;&lt;/reb-tailwind&gt;</code> at the top to style with Tailwind classes (
              <code>class="text-2xl font-bold"</code>); the examples on this page include it for you. Or write CSS in a <code>&lt;style&gt;</code> block. For your logo or a
              stamp, add the image in the editor’s <strong>Images</strong> and use its name: <code>&lt;img src="logo.png"&gt;</code>.
              Links to the web never load: documents print without a connection.
            </p>
            <p className="measure">
              Studio brings four fonts: Inter, Source Serif 4, JetBrains Mono and Noto Sans Arabic. Name one with a fallback,{' '}
              <code>font-family: "Inter", Arial, sans-serif</code>, since Rebar’s PDF service does not have them.
            </p>
          </Step>

          <Step id="next" number={9} title="Where to go next">
            <div className="measure flex flex-col gap-8 font-sans">
              <div className="flex gap-4">
                <LayoutTemplate className="mt-1 shrink-0 text-brand-amber" size={22} />
                <div>
                  <h3>Start from a starter</h3>
                  <p className="mt-1 font-serif">
                    Permits, site diaries, inspections, snag lists, certificates, estimates and toolbox talks, ready to fill and to
                    change.
                  </p>
                  <button type="button" onClick={() => navigate({ name: 'library' })} className="text-sm font-semibold text-brand-amber hover:underline">
                    Open the templates
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <Bot className="mt-1 shrink-0 text-brand-amber" size={22} />
                <div>
                  <h3>Let an AI assistant write it</h3>
                  <p className="mt-1 font-serif">
                    Give the AI guide to ChatGPT, Claude or your own agent, describe your paper form (or attach a photo of it), and
                    paste the template it writes into a new template.
                  </p>
                  <button type="button" onClick={downloadGuide} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-amber hover:underline">
                    <Download size={15} /> Download the AI guide
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <Mail className="mt-1 shrink-0 text-brand-amber" size={22} />
                <div>
                  <h3>Have it made for you</h3>
                  <p className="mt-1 font-serif">
                    We make custom templates from your forms, paid per template. Write to{' '}
                    <a href={`mailto:${CONTACT}?subject=Custom%20Rebar%20template`}>{CONTACT}</a> with your form and what it should do.
                  </p>
                </div>
              </div>
            </div>
            <FullSpecification />
          </Step>
        </div>
      </div>
    </div>
  );
}
