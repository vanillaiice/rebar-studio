// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The app's handle on the engine worker: typed, promise-based calls. One worker serves the whole app.

import type {
  Answers,
  CompileResult,
  Prepared,
  RenderInput,
  RenderResult,
  Schema,
} from './types';
import type { EngineMethod, WorkerRequest, WorkerResponse } from './worker';

type Pending = { resolve(value: unknown): void; reject(error: Error): void };

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
              this.pending.get(message.id)?.resolve(message.value);
              this.pending.delete(message.id);
              break;
            case 'error':
              this.pending.get(message.id)?.reject(new Error(message.error));
              this.pending.delete(message.id);
              break;
          }
        };
        worker.onerror = (event) => reject(new Error(event.message || 'the engine worker failed'));
        const init: WorkerRequest = {
          type: 'init',
          wasmExecUrl: new URL('wasm_exec.js', document.baseURI).href,
          wasmUrl: new URL('rebcompiler.wasm', document.baseURI).href,
        };
        worker.postMessage(init);
      });
    }
    return this.readyPromise;
  }

  private async call<T>(method: EngineMethod, ...args: unknown[]): Promise<T> {
    await this.ready();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
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
}

export const engine = new EngineClient();
