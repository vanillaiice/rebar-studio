// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The real engine for unit tests: public/wasm_exec.js and public/rebcompiler.wasm, as built by
// `npm run build:wasm`, started under Node once per test file.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startEngine, startPdfEngine, type Engine, type PdfEngine } from '../src/engine/core';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let started: Promise<Engine> | null = null;

export function testEngine(): Promise<Engine> {
  started ??= (async () => {
    await import(pathToFileURL(publicDir + 'wasm_exec.js').href);
    return startEngine(await readFile(publicDir + 'rebcompiler.wasm'));
  })();
  return started;
}

// pdf-forms:fields
let pdfStarted: Promise<PdfEngine> | null = null;

// testPdfEngine is the PDF form build, public/rebpdf.wasm, beside the engine.
export function testPdfEngine(): Promise<PdfEngine> {
  pdfStarted ??= (async () => {
    await testEngine(); // loads wasm_exec.js
    return startPdfEngine(await readFile(publicDir + 'rebpdf.wasm'));
  })();
  return pdfStarted;
}
