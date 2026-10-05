// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { fillPermit, start } from './helpers';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await start(page);
  test.info().annotations.push({ type: 'page errors', description: errors.join('\n') });
});

test('fills a permit: show-if, required, signature, finalize', async ({ page }) => {
  await page.getByRole('button', { name: 'Fill' }).first().click();
  await expect(page.getByLabel('Location')).toBeVisible();

  // Finalizing with blanks names them.
  await page.getByRole('button', { name: 'Finalize' }).click();
  await expect(page.getByText(/answers? needs? attention/)).toBeVisible();
  await expect(page.getByText('This is required.').first()).toBeVisible();

  // show-if follows the work type.
  await page.getByLabel('Work type').selectOption('Confined space');
  await expect(page.getByLabel('Gas test reading (% LEL)')).toBeVisible();
  await expect(page.getByLabel('Fire watch name')).toBeHidden();

  await fillPermit(page);
  await expect(page.getByLabel('Gas test reading (% LEL)')).toBeHidden();
  await expect(page.getByText('Saved')).toBeVisible();

  await page.getByRole('button', { name: 'Finalize' }).click();
  await page.getByRole('dialog', { name: 'Finalize this document?' }).getByRole('button', { name: 'Finalize' }).click();
  await expect(page.getByText(/SHA-256 [0-9a-f]{16}/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
  // The browser keeps a self-contained rendition: it paginates by itself.
  await expect(page.frameLocator('iframe[title="Final document"]').locator('.pagedjs_page').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.frameLocator('iframe[title="Final document"]').getByText('A. Watcher')).toBeVisible();

  await page.reload();
  await expect(page.getByText(/SHA-256 [0-9a-f]{16}/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen as revision' })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen as revision' }).click();
  await expect(page.getByText('revision 2')).toBeVisible();
  await expect(page.getByLabel('Fire watch name')).toHaveValue('A. Watcher');
});

test('computes table formulas and totals in the form and the preview', async ({ page }) => {
  await page.getByRole('button', { name: 'New template' }).click();
  await page.getByRole('button', { name: /Price estimate/ }).click();
  await expect(page.getByRole('button', { name: 'New document' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'New document' }).click();

  await page.getByRole('textbox', { name: 'Client (required)' }).fill('ACME Contracting');
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByLabel('Description', { exact: true }).first().fill('Concrete C40');
  await page.getByLabel('Qty', { exact: true }).first().fill('10');
  await page.getByLabel('Rate', { exact: true }).first().fill('350');
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByLabel('Qty', { exact: true }).nth(1).fill('2');
  await page.getByLabel('Rate', { exact: true }).nth(1).fill('0.25');
  await expect(page.locator('td span', { hasText: '3500.00' })).toBeVisible();
  await expect(page.locator('tfoot')).toContainText('3500.50');
  await expect(page.frameLocator('iframe[title="Preview"]').getByText('QAR 3,500.50').first()).toBeVisible({ timeout: 30_000 });

  // An update never blanks the preview: the shown page stays until the next one is paginated.
  await page.getByLabel('Qty', { exact: true }).first().fill('11');
  for (let i = 0; i < 15; i++) {
    expect(await page.frameLocator('iframe[title="Preview"]').locator('.pagedjs_page').count()).toBeGreaterThan(0);
    await page.waitForTimeout(100);
  }
  await expect(page.frameLocator('iframe[title="Preview"]').getByText('QAR 3,850.50').first()).toBeVisible({ timeout: 30_000 });
});

test('marks template errors in the editor', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const editor = page.locator('.monaco-editor .view-lines');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('<reb-text name="9lives" label="Lives"></reb-text>');
  await expect(page.getByRole('button', { name: /Problems/ })).toBeVisible();
  await expect(page.getByText('Does not compile')).toBeVisible();
  await page.getByRole('tab', { name: 'Form' }).click();
  await expect(page.getByLabel('Location')).toBeVisible();
});

test('exports and imports a .rebpack', async ({ page }) => {
  await page.getByRole('button', { name: 'Actions for Permit to work' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export .rebpack' }).click();
  const pack = await (await downloading).path();
  expect((await readFile(pack)).subarray(0, 2).toString()).toBe('PK');

  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await choosing).setFiles({ name: 'Permit to work.rebpack', mimeType: 'application/zip', buffer: await readFile(pack) });
  await expect(page.getByText('Imported Permit to work.rebpack')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Permit to work' })).toHaveCount(2);
});

test('backs up and restores the workspace', async ({ page }) => {
  await page.getByRole('button', { name: 'Fill' }).first().click();
  await page.getByLabel('Location').fill('Backed-up location');
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up now' }).click();
  const backup = await readFile(await (await downloading).path());
  await expect(page.getByText('Backup saved')).toBeVisible();

  await page.getByRole('link', { name: 'Documents' }).click();
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No documents')).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore a backup' }).click();
  await (await choosing).setFiles({ name: 'studio.rebbackup', mimeType: 'application/zip', buffer: backup });
  await page.getByRole('button', { name: 'Replace and restore' }).click();
  await page.waitForLoadState('load');
  await page.goto('/#/documents');
  await page.getByRole('link', { name: /Permit to work D-1/ }).click();
  await expect(page.getByLabel('Location')).toHaveValue('Backed-up location');
});

test('works offline once loaded', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The page that registered the worker is not controlled by it yet: reload once online.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Fill' }).first().click();
  await expect(page.getByLabel('Location')).toBeVisible();
  await page.getByLabel('Location').fill('Offline site');
  await expect(page.getByText('Saved')).toBeVisible();
});

test('keeps settings changed with checkboxes and lists', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings' }).click();
  const original = page.getByLabel(/Keep original photos/);
  await original.click();
  await expect(original).toBeChecked();
  await page.getByLabel('Longest edge').selectOption('1600');
  await expect(page.getByLabel('Longest edge')).toHaveValue('1600');
  for (const [theme, accent] of [['ocean', '#7dd3fc'], ['forest', '#6ee7b7'], ['violet', '#c4b5fd'], ['amber', '#facc15']]) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-brand-amber').trim())).toBe(accent);
  }
  await page.getByLabel('Theme', { exact: true }).selectOption('ocean');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await page.reload();
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('ocean');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(page.getByLabel(/Keep original photos/)).toBeChecked();
  await expect(page.getByLabel('Longest edge')).toHaveValue('1600');
  // The desktop-only setting is not offered in a browser.
  await expect(page.getByLabel('Open files automatically after saving them')).toHaveCount(0);
});

test('replaces table photos through the thumbnail and keeps them after reload', async ({ page }) => {
  await page.getByRole('button', { name: 'New template' }).click();
  await page.getByRole('button', { name: /Snag list/ }).click();
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByLabel('Area or unit').fill('Level 3');
  await page.getByRole('button', { name: 'Add row' }).click();
  const photo = page.locator('td').filter({ has: page.getByRole('button', { name: 'Add Photo', exact: true }) });
  const choosing = page.waitForEvent('filechooser');
  await photo.getByRole('button').click();
  await (await choosing).setFiles('public/pwa-192.png');
  const replace = page.getByRole('button', { name: 'Replace Photo', exact: true });
  await expect(replace.getByRole('img', { name: 'Photo', exact: true })).toBeVisible();
  await expect(replace.locator('svg')).toHaveCount(0);
  const original = await replace.getByRole('img').getAttribute('src');
  const replacing = page.waitForEvent('filechooser');
  await replace.click();
  await (await replacing).setFiles('public/pwa-512.png');
  await expect(replace.getByRole('img')).not.toHaveAttribute('src', original!);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Replace Photo', exact: true }).getByRole('img')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Preview"]').locator('tbody img').first()).toBeVisible({ timeout: 30_000 });
});

test('teaches with live examples and hands out the AI guide', async ({ page }) => {
  await page.getByRole('link', { name: 'Reference' }).click();
  await expect(page.getByRole('heading', { name: 'Write your first template', level: 1 })).toBeVisible();
  const printed = page.frameLocator('iframe[title="Printed page"]').first();
  await expect(printed.getByText('Visited by Mariam Haddad')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Visitor').first().fill('Omar Saleh');
  await expect(printed.getByText('Visited by Omar Saleh')).toBeVisible();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download the AI guide' }).click();
  const guide = await readFile(await (await downloading).path(), 'utf8');
  expect(guide).toContain('vanillaiice@tutanota.com');
  expect(guide).toContain('<reb-table');

  await page.getByRole('button', { name: /The full specification/ }).click();
  await expect(page.getByRole('heading', { name: /Custom Form Elements/ })).toBeVisible();
  await expect(page.locator('.reb-tree-node', { hasText: 'Rebar .reb File' })).toBeVisible();
});
