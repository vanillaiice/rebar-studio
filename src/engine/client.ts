// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The app's handle on the engine worker: typed, promise-based calls. One worker serves the whole app.
// A call that runs longer than CALL_TIMEOUT (a template looping without end) terminates the worker:
// its calls fail with EngineTimeout and the next call starts a fresh one, so the app stays responsive.

import type {
  Answers,
  CompileResult,
  Prepared,
  RenderInput,
  RenderResult,
  Schema,
} from './types';
import type { EngineMethod, PdfMethod, WorkerRequest, WorkerResponse } from './worker';

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

// The same budget Rebar gives rebc on the server (lib/reb.rb).
export const CALL_TIMEOUT = 10_000;

export class EngineTimeout extends Error {
  constructor(method: string) {
    super(`the engine took longer than ${CALL_TIMEOUT / 1000} s to ${method} and was stopped`);
    this.name = 'EngineTimeout';
  }
}

class EngineClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readyPromise: Promise<string> | null = null;

  // ready resolves with the engine version once the engine is loaded.
  ready(): Promise<string> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const message = event.data;
          switch (message.type) {
            case 'ready':
              resolve(message.version);
              break;
            case 'failed':
              reject(new Error(message.error));
              break;
            case 'result':
              this.settle(message.id)?.resolve(message.value);
              break;
            case 'error':
              this.settle(message.id)?.reject(new Error(message.error));
              break;
          }
        };
        worker.onerror = (event) => reject(new Error(event.message || 'the engine worker failed'));
        const init: WorkerRequest = {
          type: 'init',
          wasmExecUrl: new URL('wasm_exec.js', document.baseURI).href,
          wasmUrl: new URL('rebcompiler.wasm', document.baseURI).href,
          pdfWasmUrl: new URL('rebpdf.wasm', document.baseURI).href, // pdf-forms:fields
        };
        worker.postMessage(init);
      });
    }
    return this.readyPromise;
  }

  private settle(id: number): Pending | undefined {
    const pending = this.pending.get(id);
    if (pending) clearTimeout(pending.timer);
    this.pending.delete(id);
    return pending;
  }

  // restart stops a worker stuck in a call: every call in flight fails, the next starts a new worker.
  private restart(method: string) {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    const error = new EngineTimeout(method);
    for (const id of [...this.pending.keys()]) this.settle(id)?.reject(error);
  }

  private async call<T>(method: EngineMethod | PdfMethod, ...args: unknown[]): Promise<T> {
    await this.ready();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.restart(method), CALL_TIMEOUT);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      const request: WorkerRequest = { type: 'call', id, method, args };
      this.worker!.postMessage(request);
    });
  }

  compile(source: string): Promise<CompileResult> {
    return this.call('compile', source);
  }

  prepare(fields: Schema, answers: Answers): Promise<Prepared> {
    return this.call('prepare', fields, answers);
  }

  render(input: RenderInput): Promise<RenderResult> {
    return this.call('render', input);
  }

  // pdf-forms:fields
  // fillable turns a PDF printed from a page rendered fillable into a PDF form (reb spec 4.5).
  fillable(pdf: Uint8Array, answers: Answers): Promise<Uint8Array> {
    return this.call('fillable', pdf, answers);
  }

  // pdfAnswers reads the template's fillable fields back from a filled PDF form.
  pdfAnswers(pdf: Uint8Array, fields: Schema): Promise<Answers> {
    return this.call('pdfAnswers', pdf, fields);
  }
}

export const engine = new EngineClient();
