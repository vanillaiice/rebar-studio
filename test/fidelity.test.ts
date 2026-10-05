// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// PDF fidelity: Studio's desktop PDF must match Rebar's. Each starter template is
// rendered with sample answers, then printed twice from the same page: by the desktop app's renderer
// (Electron's printToPDF) and by Gotenberg, as Rebar sends it (rebar-on-rails lib/gotenberg.rb). The
// pages are rasterized (pdftoppm) and compared pixel by pixel (ImageMagick).
//
//   FIDELITY=1 GOTENBERG_URL=http://127.0.0.1:3010 npm run test:fidelity
//
// Needs Gotenberg, Electron (with a display: xvfb-run in CI), pdftoppm and ImageMagick (6 or 7).
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { pdfDocument } from '../src/render/document';
import { fontFaceCss, fontsUsedBy } from '../src/render/fonts';
import { STARTERS } from '../src/starters';
import { testEngine } from './engine';

const run = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const gotenberg = process.env.GOTENBERG_URL ?? 'http://127.0.0.1:3010';
const enabled = process.env.FIDELITY === '1';
// The share of a page's ink allowed to differ (antialiasing, Chromium versions).
const THRESHOLD = Number(process.env.FIDELITY_THRESHOLD ?? 0.1);

async function printWithElectron(request: object, out: string) {
  const electron = createRequire(import.meta.url)('electron') as string;
  const file = out.replace(/\.pdf$/, '.json');
  await writeFile(file, JSON.stringify(request));
  await run(electron, [join(root, 'scripts/print-pdf.cjs'), '--no-sandbox', file, out], { timeout: 60_000 });
}

async function printWithGotenberg(page: ReturnType<typeof pdfDocument>, files: Map<string, Buffer>, out: string) {
  const form = new FormData();
  const add = (name: string, bytes: string | Buffer, type: string) => form.append('files', new Blob([bytes], { type }), name);
  add('index.html', page.html, 'text/html');
  if (page.footer) add('footer.html', page.footer, 'text/html');
  if (page.header) add('header.html', page.header, 'text/html');
  for (const [name, bytes] of files) add(name, bytes, 'application/octet-stream');
  const fields: Record<string, string> = {
    paperWidth: '8.27', paperHeight: '11.69', preferCssPageSize: 'true',
    marginTop: String(page.margins.top), marginBottom: String(page.margins.bottom),
    marginLeft: String(page.margins.left), marginRight: String(page.margins.right),
  };
  if (page.tailwind) fields.waitDelay = '1s';
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const response = await fetch(`${gotenberg}/forms/chromium/convert/html`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Gotenberg answered ${response.status}: ${await response.text()}`);
  await writeFile(out, Buffer.from(await response.arrayBuffer()));
}

async function rasterize(pdf: string): Promise<string[]> {
  const prefix = pdf.replace(/\.pdf$/, '');
  await run('pdftoppm', ['-r', '40', '-png', pdf, prefix]);
  const dir = join(prefix, '..');
  const base = prefix.split('/').pop()!;
  return (await readdir(dir)).filter((f) => f.startsWith(`${base}-`) && f.endsWith('.png')).sort().map((f) => join(dir, f));
}

// ImageMagick 7 has one `magick` command; version 6 (Ubuntu's) has compare and convert.
let im7: Promise<boolean> | null = null;
async function imagemagick(tool: 'compare' | 'convert', args: string[]) {
  im7 ??= run('magick', ['-version']).then(() => true, () => false);
  return (await im7) ? run('magick', tool === 'convert' ? args : [tool, ...args]) : run(tool, args);
}

// differingShare is the share of the page's ink (non-white pixels, in either rendering) that differs,
// so a sparse page is held to the same standard as a full one.
async function differingShare(a: string, b: string): Promise<number> {
  // compare exits 1 when the images differ; the count of differing pixels goes to stderr.
  const result = await imagemagick('compare', ['-metric', 'AE', '-fuzz', '10%', a, b, 'null:']).catch((e) => e);
  const differing = parseFloat(String(result.stderr).trim().split(/\s/)[0]);
  const ink = async (image: string) =>
    Number((await imagemagick('convert', [image, '-colorspace', 'Gray', '-threshold', '90%', '-negate', '-format', '%[fx:mean*w*h]', 'info:'])).stdout);
  return differing / Math.max(1, await ink(a), await ink(b));
}

describe.skipIf(!enabled)('PDF fidelity with Rebar (Gotenberg)', () => {
  for (const starter of STARTERS) {
    it(`${starter.name}: Studio's PDF matches Gotenberg's`, { timeout: 120_000 }, async () => {
      const result = (await testEngine()).compile(starter.source);
      if (!result.ok) throw new Error(result.error);
      const fonts = fontsUsedBy(result.previewHtml);
      const page = pdfDocument(result.previewHtml, fontFaceCss(fonts));
      const files = new Map<string, Buffer>();
      for (const font of fonts) for (const file of font.files) files.set(file.name, await readFile(join(root, file.url.replace(/^\//, ''))));
      if (page.tailwind) files.set('tailwindcss.js', await readFile(join(root, 'public/tailwindcss.js')));

      const dir = await mkdtemp(join(tmpdir(), `fidelity-${starter.id}-`));
      await printWithElectron(
        { ...page, files: Object.fromEntries([...files].map(([name, bytes]) => [name, bytes.toString('base64')])) },
        join(dir, 'studio.pdf'),
      );
      await printWithGotenberg(page, files, join(dir, 'rebar.pdf'));
      const studio = await rasterize(join(dir, 'studio.pdf'));
      const rebar = await rasterize(join(dir, 'rebar.pdf'));
      expect(studio.length, 'page count').toBe(rebar.length);
      for (let i = 0; i < studio.length; i++) {
        const share = await differingShare(studio[i], rebar[i]);
        if (process.env.FIDELITY_VERBOSE) console.log(`${starter.id} page ${i + 1}: ${(share * 100).toFixed(2)}%`);
        expect(share, `page ${i + 1} differs by ${(share * 100).toFixed(2)}% (${dir})`).toBeLessThan(THRESHOLD);
      }
    });
  }
});
