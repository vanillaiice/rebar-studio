// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// End-to-end tests: the web build (served by `vite preview`) and the desktop app. CHROMIUM_PATH
// points at a Chromium to drive (default: Playwright's own); `npm run build` must have run.
import { defineConfig } from '@playwright/test';

const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'web',
      testMatch: /web\..*spec\.ts/,
      use: { baseURL: 'http://localhost:4181/', viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } },
    },
    { name: 'electron', testMatch: /electron\..*spec\.ts/ },
  ],
  webServer: {
    command: 'npx vite preview --port 4181 --strictPort',
    url: 'http://localhost:4181/',
    reuseExistingServer: !process.env.CI,
  },
});
