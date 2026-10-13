// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { start } from './helpers';

async function dropFiles(target: Locator, files: { name: string; type: string; bytes: number[] }[]) {
  await target.evaluate((element, incoming) => {
    const transfer = new DataTransfer();
    for (const file of incoming) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
    const box = element.getBoundingClientRect();
    const options = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    element.dispatchEvent(new DragEvent('dragover', options));
    element.dispatchEvent(new DragEvent('drop', options));
  }, files);
}

async function picture(name = 'photo.png', size = 192) {
  return { name, type: 'image/png', bytes: Array.from(await readFile(`public/pwa-${size}.png`)) };
}

async function exportSource(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Source (.reb)', exact: true }).click();
  return readFile(await (await downloading).path(), 'utf8');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await start(page);
});

test('drops, replaces and removes a table photo, rejects invalid drops, and persists changes', async ({ page }) => {
  await page.getByRole('button', { name: 'New template' }).click();
  await page.getByRole('button', { name: /Snag list/ }).click();
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('button', { name: 'Add row' }).click();
  const cell = page.getByLabel('Photo photo cell', { exact: true });
  await expect(cell.getByRole('button', { name: 'Add Photo', exact: true })).toBeVisible();
  await expect(cell.getByText('Drop photo')).toHaveCount(0);
  await expect(cell.getByRole('button', { name: 'Remove Photo', exact: true })).toHaveCount(0);
  await dropFiles(cell, [await picture()]);
  const img = cell.getByRole('img', { name: 'Photo', exact: true });
  await expect(img).toBeVisible();
  const original = await img.getAttribute('src');
  await dropFiles(cell, [{ name: 'notes.txt', type: 'text/plain', bytes: [65] }]);
  await expect(page.getByText('Drop one image into a photo cell.')).toBeVisible();
  await expect(img).toHaveAttribute('src', original!);
  await dropFiles(cell, [await picture('new.png', 512)]);
  await expect(img).not.toHaveAttribute('src', original!);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(cell.getByRole('img')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Preview"]').locator('tbody img').first()).toBeVisible();
  await cell.getByRole('button', { name: 'Remove Photo', exact: true }).click();
  await expect(cell.getByRole('img')).toHaveCount(0);
  await expect(cell.getByRole('button', { name: 'Add Photo', exact: true })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Preview"]').locator('tbody img')).toHaveCount(0);
  await page.reload();
  await expect(cell.getByRole('button', { name: 'Add Photo', exact: true })).toBeVisible();
  await expect(cell.getByRole('img')).toHaveCount(0);
});

test('drops template assets with validation and preserves duplicate filenames in the pack', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('button', { name: 'Images', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Template images' });
  const target = dialog.getByLabel('Drop template images');
  const first = await picture('my logo.png');
  const second = await picture('my logo.png', 512);
  await dropFiles(target, [first, second, { name: 'bad.pdf', type: 'application/pdf', bytes: [65] }, { name: 'broken.png', type: 'image/png', bytes: [65] }]);
  await expect(dialog.getByRole('img', { name: 'my-logo.png', exact: true })).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'my-logo-2.png', exact: true })).toBeVisible();
  await expect(page.getByText('bad.pdf: Template images must be PNG, JPEG or WebP.')).toBeVisible();
  await expect(page.getByText('broken.png: This file could not be read as an image.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Images', exact: true }).click();
  await expect(dialog.getByRole('img')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Template pack (.rebpack)', exact: true }).click();
  const packed = unzipSync(await readFile(await (await downloading).path()));
  expect(Array.from(packed['assets/my-logo.png'])).toEqual(first.bytes);
  expect(Array.from(packed['assets/my-logo-2.png'])).toEqual(second.bytes);
});

test('drops into source at the target line, renders with sizing defaults, and supports undo', async ({ page }) => {
  await page.getByRole('button', { name: 'New template' }).click();
  await page.getByRole('button', { name: /Blank template/ }).click();
  const editor = page.getByLabel('Template source editor');
  await expect(editor.locator('.view-lines')).toBeVisible();
  await editor.locator('.view-lines').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  const original = '<h1>Before</h1>\n\n<p>After</p>';
  await page.keyboard.insertText(original);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(await exportSource(page)).toBe(original);
  await dropFiles(editor.locator('.view-line').nth(1), [await picture('site photo.png')]);
  await expect(editor).toContainText('site-photo.png');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const source = await exportSource(page);
  expect(source).toMatch(/^<h1>Before<\/h1>\n<img src="site-photo.png"/);
  expect(source).toContain('width: 320px; max-width: 100%; height: auto;');
  const previewImage = page.frameLocator('iframe[title="Preview"]').locator('.pagedjs_page img').first();
  await expect(previewImage).toBeVisible();
  expect(await previewImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(192);
  await editor.locator('.view-lines').click();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(await exportSource(page)).toBe(original);
  await editor.locator('.view-lines').click();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  expect(await exportSource(page)).toBe(source);
  await expect(previewImage).toBeVisible();
});
