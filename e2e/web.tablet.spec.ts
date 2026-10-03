// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// Tablets and phones (plan D2: the PWA serves them): a whole document filled on a touch screen.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { sign, start } from './helpers';

// A real image for the photo path to decode, resize and re-encode.
const PNG = readFileSync(new URL('../public/pwa-192.png', import.meta.url));

test.describe('tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('fills a site diary completely: table, condition, photo, signature', async ({ page }) => {
    await page.goto('/');
    await start(page);
    await page.getByRole('button', { name: 'New template' }).click();
    await page.getByRole('button', { name: /Site diary/ }).click();
    await page.getByRole('button', { name: 'New document' }).click();

    await expect(page.getByLabel(/^Date/)).not.toHaveValue('');
    await page.getByLabel('Weather').selectOption('Sunny');
    await page.getByLabel('Temperature (°C)').fill('34.5');
    await page.getByRole('radio', { name: 'Night' }).tap();
    await page.getByRole('button', { name: 'Add row' }).tap();
    await page.getByLabel('Trade', { exact: true }).fill('Formwork');
    await page.getByLabel('Company', { exact: true }).fill('Gulf Steel');
    await page.getByLabel('Headcount', { exact: true }).fill('12');
    await page.getByRole('textbox', { name: 'Work carried out (required)' }).fill('Level 4 slab poured.\n\nCuring started.');
    await page.getByLabel('Delays or incidents today').tap();
    await page.getByRole('textbox', { name: 'Delays and incidents (required)' }).fill('Pump arrived late.');

    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose files' }).tap();
    await (await choosing).setFiles({ name: 'slab.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible();
    await sign(page, page.locator('[data-field="signature"]').getByRole('button', { name: 'Sign' }));

    await page.getByRole('button', { name: 'Finalize' }).tap();
    await page.getByRole('dialog', { name: 'Finalize this document?' }).getByRole('button', { name: 'Finalize' }).tap();
    await expect(page.getByText(/SHA-256 [0-9a-f]{16}/)).toBeVisible({ timeout: 30_000 });
    const final = page.frameLocator('iframe[title="Final document"]');
    await expect(final.getByText('Pump arrived late.')).toBeVisible({ timeout: 30_000 });
    await expect(final.getByText('Gulf Steel')).toBeVisible();
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('fills a permit step by step and is sent to the step of the first error', async ({ page }) => {
    await page.goto('/');
    await start(page);
    await page.getByRole('button', { name: 'Fill' }).first().tap();
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await page.getByLabel('Work type').selectOption('Electrical isolation');
    await page.getByLabel('Location').fill('Substation 2');
    await page.getByRole('button', { name: 'Next' }).tap();
    await expect(page.getByText('Step 2 of 3')).toBeVisible();

    // Finalizing with the issuer missing on step 3 jumps there.
    await page.getByLabel('PPE inspected and worn').tap();
    await page.getByRole('button', { name: 'Finalize' }).tap();
    await expect(page.getByText('Step 3 of 3')).toBeVisible();
    await expect(page.getByText('This is required.').first()).toBeVisible();
    await page.getByRole('textbox', { name: 'Issuer name (required)' }).fill('P. Hone');
    await sign(page, page.locator('[data-field="issuer_signature"]').getByRole('button', { name: 'Sign' }));
    await page.getByRole('button', { name: 'Finalize' }).tap();
    await page.getByRole('dialog', { name: 'Finalize this document?' }).getByRole('button', { name: 'Finalize' }).tap();
    await expect(page.getByText(/SHA-256 [0-9a-f]{16}/)).toBeVisible({ timeout: 30_000 });
  });
});
