// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The engine worker: loads Go's loader and the engine, then answers calls from client.ts. Keeping the
// engine off the main thread means a large template never blocks typing.

import { startEngine, type Engine } from './core';

export type EngineMethod = 'compile' | 'prepare' | 'render';

export type WorkerRequest =
  | { type: 'init'; wasmExecUrl: string; wasmUrl: string }
  | { type: 'call'; id: number; method: EngineMethod; args: unknown[] };

export type WorkerResponse =
  | { type: 'ready'; version: string }
  | { type: 'failed'; error: string }
  | { type: 'result'; id: number; value: unknown }
  | { type: 'error'; id: number; error: string };

let engine: Engine | null = null;

function post(message: WorkerResponse) {
  self.postMessage(message);
}

async function init(wasmExecUrl: string, wasmUrl: string) {
  try {
    // wasm_exec.js is a classic script that defines globalThis.Go; importing it runs it.
    await import(/* @vite-ignore */ wasmExecUrl);
    const bytes = await (await fetch(wasmUrl)).arrayBuffer();
    engine = await startEngine(bytes);
    post({ type: 'ready', version: engine.version });
  } catch (e) {
    post({ type: 'failed', error: e instanceof Error ? e.message : String(e) });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    void init(message.wasmExecUrl, message.wasmUrl);
    return;
  }
  if (!engine) {
    post({ type: 'error', id: message.id, error: 'the engine is not loaded' });
    return;
  }
  try {
    const fn = engine[message.method] as (...args: unknown[]) => unknown;
    post({ type: 'result', id: message.id, value: fn(...message.args) });
  } catch (e) {
    post({ type: 'error', id: message.id, error: e instanceof Error ? e.message : String(e) });
  }
};
