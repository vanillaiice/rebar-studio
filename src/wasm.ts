// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs — Rebar Studio (.reb template editor)

// Loads the Go .reb compiler/renderer compiled to WebAssembly and exposes a
// synchronous compile() once initialized. Running the real Go code gives the
// preview full fidelity with the API/PDF backend.

import { parsePaperSize, type CompilationResult } from './compiler';

interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

declare global {
  interface Window {
    Go: new () => GoRuntime;
    __rebCompile?: (reb: string) => string;
  }
}

let initPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function instantiate(go: GoRuntime): Promise<WebAssembly.Instance> {
  // Prefer streaming, but fall back to arrayBuffer for environments where the
  // server doesn't send application/wasm (or for Electron's file:// scheme).
  try {
    const result = await WebAssembly.instantiateStreaming(fetch('./rebcompiler.wasm'), go.importObject);
    return result.instance;
  } catch {
    const bytes = await (await fetch('./rebcompiler.wasm')).arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, go.importObject);
    return result.instance;
  }
}

// initRebCompiler loads and starts the WASM module. Safe to call repeatedly;
// the work happens once.
export function initRebCompiler(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await loadScript('./wasm_exec.js');
      const go = new window.Go();
      const instance = await instantiate(go);
      // Do not await: the Go program blocks forever to keep __rebCompile alive.
      void go.run(instance);
      // go.run executes main() synchronously up to its blocking select, so the
      // export is registered by now; poll briefly as a safety net.
      for (let i = 0; i < 100 && typeof window.__rebCompile !== 'function'; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      if (typeof window.__rebCompile !== 'function') {
        throw new Error('WASM compiler failed to register __rebCompile');
      }
    })();
  }
  return initPromise;
}

interface WasmResult {
  schema?: string;
  htmlSource?: string;
  previewHtml?: string;
  error?: string;
  execError?: string;
}

// compile runs the full .reb pipeline. initRebCompiler() must have resolved.
// Throws on a fatal compilation error; non-fatal render errors surface via
// CompilationResult.execError.
export function compile(reb: string): CompilationResult {
  if (typeof window.__rebCompile !== 'function') {
    throw new Error('WASM compiler not initialized');
  }

  const result = JSON.parse(window.__rebCompile(reb)) as WasmResult;
  if (result.error) {
    throw new Error(result.error);
  }

  const { paperWidth, paperHeight } = parsePaperSize(reb);
  return {
    schema: result.schema ? JSON.parse(result.schema) : [],
    htmlSource: result.htmlSource ?? '',
    previewHtml: result.previewHtml ?? '',
    paperWidth,
    paperHeight,
    execError: result.execError,
  };
}
