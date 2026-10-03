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
