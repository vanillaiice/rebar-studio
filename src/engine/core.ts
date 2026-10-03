// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Starts the reb engine's WebAssembly build and wraps its exported functions (__rebCompile,
// __rebPrepare, __rebRender, __rebVersion) in typed calls. Runs inside the engine worker in the app,
// and under Node in the tests, so both exercise the same code against the real engine.

import type {
  Answers,
  CompileResult,
  Prepared,
  RenderInput,
  RenderResult,
  Schema,
} from './types';

interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

type Exported = {
  __rebCompile?: (source: string) => string;
  __rebPrepare?: (json: string) => string;
  __rebRender?: (json: string) => string;
  __rebVersion?: () => string;
  Go?: new () => GoRuntime;
};

export interface Engine {
  version: string;
  compile(source: string): CompileResult;
  prepare(fields: Schema, answers: Answers): Prepared;
  render(input: RenderInput): RenderResult;
}

// startEngine instantiates the engine. Go's loader (wasm_exec.js) must already have defined
// globalThis.Go; the module is the bytes of rebcompiler.wasm.
export async function startEngine(module: BufferSource): Promise<Engine> {
  const scope = globalThis as unknown as Exported;
  if (!scope.Go) throw new Error('wasm_exec.js is not loaded');
  const go = new scope.Go();
  const { instance } = await WebAssembly.instantiate(module, go.importObject);
  // Not awaited: the Go program blocks forever so its exports stay callable. It registers them
  // synchronously before blocking.
  void go.run(instance);
  const { __rebCompile, __rebPrepare, __rebRender, __rebVersion } = scope;
  if (!__rebCompile || !__rebPrepare || !__rebRender || !__rebVersion) {
    throw new Error('the engine did not register its functions (is it reb v0.3.0 or later?)');
  }

  return {
    version: __rebVersion(),
    compile(source) {
      const out = JSON.parse(__rebCompile(source));
      if (out.error) return { ok: false, error: out.error, code: out.code, params: out.params };
      return {
        ok: true,
        schema: out.schema ? JSON.parse(out.schema) : [],
        fields: out.fields ?? { schemaVersion: 2, fields: [] },
        htmlSource: out.htmlSource ?? '',
        previewHtml: out.previewHtml ?? '',
        warnings: out.warnings ?? [],
        engineVersion: out.engineVersion ?? '',
        execError: out.execError,
      };
    },
    prepare(fields, answers) {
      const out = JSON.parse(__rebPrepare(JSON.stringify({ fields, answers })));
      if (out.error) throw new Error(out.error);
      return { answers: out.answers ?? {}, errors: out.errors ?? [] };
    },
    render(input) {
      const out = JSON.parse(__rebRender(JSON.stringify(input)));
      if (out.error) return { ok: false, error: out.error };
      return { ok: true, html: out.html };
    },
  };
}
