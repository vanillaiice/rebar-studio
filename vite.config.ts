/// <reference types="vitest/config" />
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative URLs: the desktop app loads dist/ from disk and the PWA may live under any path.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: { format: 'es' },
  // The chunks over Vite's 500 kB default are Monaco (loaded with the editor), its language workers
  // and pdf.js's worker: already split out and lazy, and not splittable further.
  build: { chunkSizeWarningLimit: 4000 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The app asks before reloading (UpdatePrompt); it registers the worker itself, and never in
      // the desktop app, which updates through electron-updater.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rebar Studio',
        short_name: 'Rebar Studio',
        description: 'Author .reb form templates, fill documents and render them to PDF, offline.',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Installed, the app opens .reb, .rebpack and .rebdoc files (OpenFileListener).
        file_handlers: [
          {
            action: './',
            accept: {
              'application/x-reb': ['.reb'],
              'application/x-rebpack': ['.rebpack'],
              'application/x-rebdoc': ['.rebdoc'],
            },
          },
        ],
      } as never,
      workbox: {
        // Everything, the engine included, so the app works offline from the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,woff2,md}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
