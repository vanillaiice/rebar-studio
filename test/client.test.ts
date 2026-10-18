// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
// The engine worker's watchdog: a call past CALL_TIMEOUT (a template looping without end) stops the
// worker and fails, and the next call gets a fresh worker.
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
  static created: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.created.push(this);
  }
  postMessage(message: { type: string; id?: number; method?: string }) {
    if (message.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready', version: 'v0.8.0' } }));
    // compile answers, render never does (stuck)
    if (message.type === 'call' && message.method === 'compile') {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'result', id: message.id, value: 'compiled' } }));
    }
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWorker.created = [];
});

describe('engine client', () => {
  it('stops a worker stuck in a call and starts a fresh one for the next', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('document', { baseURI: 'http://studio.test/' });
    const { engine, CALL_TIMEOUT, EngineTimeout } = await import('../src/engine/client');

    const stuck = engine.render({ html: '{{range 100000000}}x{{end}}' } as never);
    const failed = expect(stuck).rejects.toBeInstanceOf(EngineTimeout);
    await vi.advanceTimersByTimeAsync(CALL_TIMEOUT);
    await failed;
    expect(FakeWorker.created[0].terminated).toBe(true);

    await expect(engine.compile('<p>hi</p>')).resolves.toBe('compiled');
    expect(FakeWorker.created).toHaveLength(2);
  });
});
