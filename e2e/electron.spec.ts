// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fillPermit, start } from './helpers';

let app: ElectronApplication;
let page: Page;
let profile: string;

test.beforeEach(async () => {
  // A throwaway profile: never the developer's own workspace.
  profile = await mkdtemp(join(tmpdir(), 'rebar-studio-e2e-'));
  app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, REBAR_STUDIO_USER_DATA: profile } });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
});

test.afterEach(async () => {
  await app.close();
  await rm(profile, { recursive: true, force: true });
});

test('finalizes a document to a PDF and exports it', async () => {
  await page.getByRole('button', { name: 'Fill' }).first().click();
  await fillPermit(page);
  await page.getByRole('button', { name: 'Finalize' }).click();
  await page.getByRole('dialog', { name: 'Finalize this document?' }).getByRole('button', { name: 'Finalize' }).click();
  await expect(page.getByText(/SHA-256 [0-9a-f]{16}/)).toBeVisible({ timeout: 60_000 });

  const target = join(profile, 'exported.pdf');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
  }, target);
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect.poll(async () => (await readFile(target).catch(() => Buffer.alloc(0))).subarray(0, 5).toString(), { timeout: 30_000 }).toBe('%PDF-');
  const pdf = (await readFile(target)).toString('latin1');
  expect(pdf).toMatch(/\/Type\s*\/Page\b/);
});

test('opens exported PDFs after saving when the setting is on, never Studio files', async () => {
  await page.getByRole('link', { name: 'Settings' }).click();
  const setting = page.getByLabel('Open files automatically after saving them');
  await setting.click();
  await expect(setting).toBeChecked(); // saved, then shown (settings are written before they show)
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'Fill' }).first().click();
  await page.getByLabel('Location').fill('Opened site');

  await app.evaluate(({ dialog, shell }, folder) => {
    const opened: string[] = [];
    (globalThis as unknown as { opened: string[] }).opened = opened;
    shell.openPath = (async (target: string) => {
      opened.push(target);
      // Model a desktop opener that keeps waiting while the external PDF viewer is running.
      return await new Promise<string>(() => {});
    }) as never;
    let n = 0;
    dialog.showSaveDialog = (async (_win: unknown, options: { defaultPath?: string }) => ({
      canceled: false,
      filePath: `${folder}/${++n}-${options.defaultPath}`,
    })) as never;
  }, profile);
  const opened = () => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened);

  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect.poll(opened, { timeout: 30_000 }).toHaveLength(1);
  expect((await opened())[0]).toMatch(/\.pdf$/);
  await expect(page.getByText('Rendering the PDF…', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();

  // Batch exports must also reply as soon as their files are saved.
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as never;
  }, profile);
  const batch = await page.evaluate(async () => {
    const bridge = (window as unknown as { rebarStudio: { saveFiles(files: { name: string; bytes: Uint8Array }[], open: boolean): Promise<{ count: number }> } }).rebarStudio;
    return await bridge.saveFiles([{ name: 'register.csv', bytes: new TextEncoder().encode('Reference\nD-1') }], true);
  });
  expect(batch.count).toBe(1);
  await expect.poll(opened).toHaveLength(2);

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Export .rebdoc' }).click();
  await page.waitForTimeout(1500);
  expect(await opened()).toHaveLength(2); // the .rebdoc was saved, not opened
});

test('renders templates without network access', async () => {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? '');
    response.end('x');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const source = `<link rel="stylesheet" href="${origin}/style.css"><p>Leak test</p><img src="${origin}/pixel.png">
<div style="background: url(${origin}/bg.png)">x</div><script>fetch('${origin}/fetch'); new Image().src = '${origin}/js.png';</script>`;
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import' }).click();
    await (await choosing).setFiles({ name: 'leak.reb', mimeType: 'text/plain', buffer: Buffer.from(source) });
    await page.getByRole('heading', { name: 'leak' }).click();
    await expect(page.getByLabel('PDF preview').locator('canvas').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    expect(hits).toEqual([]);
  } finally {
    server.close();
  }
});

test('updates the PDF preview in place, keeping the reader where they were', async () => {
  const source = `<p>Page one</p><reb-pagebreak></reb-pagebreak><p>Page two</p><reb-pagebreak></reb-pagebreak>
<p>Last page: <reb-text name="note" label="Note"></reb-text></p>`;
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await choosing).setFiles({ name: 'three pages.reb', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'three pages' }) }).getByRole('button', { name: 'Fill' }).click();
  await expect(page.getByLabel('Note')).toBeVisible();
  if (await page.getByRole('button', { name: 'Preview', exact: true }).isVisible()) await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const pages = page.getByLabel('PDF preview');
  await expect(pages.locator('canvas')).toHaveCount(3, { timeout: 60_000 });

  await pages.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    (el.querySelector('canvas') as HTMLCanvasElement & { old?: boolean }).old = true;
  });
  const before = await pages.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.getByLabel('Note').fill('Changed');
  // The new pages replace the old ones (a fresh first canvas), at the same place.
  await expect.poll(() => pages.evaluate((el) => !(el.querySelector('canvas') as { old?: boolean }).old), { timeout: 30_000 }).toBe(true);
  expect(await pages.evaluate((el) => el.scrollTop)).toBe(before);
  await expect(pages.locator('canvas')).toHaveCount(3);
});

// pdf-forms:boxes, pdf-forms:fields
test('exports a PDF form and takes the answers of a filled one back', async () => {
  const rebDir = process.env.REB_DIR ?? execFileSync('go', ['list', '-m', '-f', '{{.Dir}}', 'github.com/vanillaiice/reb'], { encoding: 'utf8' }).trim();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await choosing).setFiles(join(rebDir, 'testdata/golden/fillable.reb'));
  await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'fillable' }) }).getByRole('button', { name: 'Fill', exact: true }).click();
  await page.getByLabel('Supplier').fill('Gulf Steel');
  await page.getByLabel('Priority').selectOption('Urgent');

  await page.getByRole('radio', { name: 'Fillable' }).click();
  const target = join(profile, 'form.pdf');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never;
  }, target);
  await page.getByRole('button', { name: 'Export PDF form' }).click();
  await expect.poll(async () => (await readFile(target).catch(() => Buffer.alloc(0))).subarray(0, 5).toString(), { timeout: 60_000 }).toBe('%PDF-');

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(await readFile(target)) }).promise;
  const widgets = (await (await pdf.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Widget');
  expect(widgets.map((w) => [w.fieldName, w.fieldValue])).toEqual([
    ['supplier', 'Gulf Steel'],
    ['quantity', ''],
    ['delivery', ''],
    ['crane', 'Off'],
    ['remarks', ''],
    ['supplier', 'Gulf Steel'],
  ]);

  const opening = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Import filled PDF…' }).click();
  await (await opening).setFiles(join(rebDir, 'internal/rebpdf/testdata/filled.pdf'));
  const confirm = page.getByRole('dialog', { name: 'Take the answers from the PDF?' });
  await expect(confirm).toContainText('5 answers');
  await confirm.getByRole('button', { name: 'Take the answers' }).click();
  await expect(page.getByLabel('Supplier')).toHaveValue('Qatar Steel – Ras Laffan');
  await expect(page.getByLabel('Quantity')).toHaveValue('40');
  await expect(page.getByLabel('Remarks')).toHaveValue('Gate 3 only.\nCall 30 min ahead.');
  await expect(page.getByLabel('Crane needed')).toBeChecked();
  await expect(page.getByLabel('Priority')).toHaveValue('Urgent'); // not fillable: kept
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Supplier')).toHaveValue('Gulf Steel');
});
