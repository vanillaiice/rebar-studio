// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
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
    await expect(page.locator('iframe[title="PDF preview"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    expect(hits).toEqual([]);
  } finally {
    server.close();
  }
});
