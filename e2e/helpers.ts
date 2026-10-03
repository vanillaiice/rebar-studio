// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { expect, type Page } from '@playwright/test';

export async function start(page: Page) {
  await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible({ timeout: 30_000 });
  const tour = page.getByRole('dialog', { name: 'Welcome to Rebar Studio' });
  await expect(tour).toBeVisible();
  await tour.getByRole('button', { name: 'Skip' }).click();
  await expect(tour).toBeHidden();
}

// sign opens the signature pad from a button and draws a stroke.
export async function sign(page: Page, button: ReturnType<Page['getByRole']>) {
  await button.click();
  const pad = page.getByLabel('Signature area');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 30 + i * 25, box.y + box.height / 2 + (i % 2 ? -20 : 20));
  await page.mouse.up();
  await page.getByRole('button', { name: 'Use signature' }).click();
}

// fillPermit answers the permit starter's required fields for hot work.
export async function fillPermit(page: Page) {
  await page.getByLabel('Work type').selectOption('Hot work');
  await page.getByLabel('Location').fill('Level 3, east stair core');
  await page.getByLabel('Fire watch name').fill('A. Watcher');
  await page.getByLabel('PPE inspected and worn').check();
  await page.getByLabel('Issuer name').fill('I. Issuer');
  await sign(page, page.locator('[data-field="issuer_signature"]').getByRole('button', { name: 'Sign' }));
  await expect(page.getByRole('img', { name: 'Issuer signature (signed)' })).toBeVisible();
}
