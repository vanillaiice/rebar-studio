// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The real engine for unit tests: public/wasm_exec.js and public/rebcompiler.wasm, as built by
// `npm run build:wasm`, started under Node once per test file.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startEngine, type Engine } from '../src/engine/core';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let started: Promise<Engine> | null = null;

export function testEngine(): Promise<Engine> {
  started ??= (async () => {
    await import(pathToFileURL(publicDir + 'wasm_exec.js').href);
    return startEngine(await readFile(publicDir + 'rebcompiler.wasm'));
  })();
  return started;
}
