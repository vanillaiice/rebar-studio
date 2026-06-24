# Rebar Template Editor

This is a specialized standalone editor for authoring `.reb` Rebar Form Templates. It provides administrators with a WYSIWYG interface to construct custom HTML structures, inject JSON field schemas, and preview the PDF styling results in real-time.

Built with **React**, **TypeScript**, and **Vite**, utilizing the Monaco Editor for syntax highlighting.

## Features

- **Monaco Engine**: Code editor featuring HTML syntax highlighting and automatic JSON schema formatting.
- **Component Snippets**: One-click insertion of Rebar-specific fields (text, select, photo grids, formula tables, signatures, page breaks, footers, and more).
- **Live Compiler**: Compiles `.reb` source into Go-template HTML and a JSON field schema, viewable side-by-side in dedicated tabs. The compiler is the actual server-side Go pipeline (`pkg/rebcompiler` + `pkg/rebrender`) compiled to WebAssembly, so output matches the API/PDF backend exactly.
- **Live PDF Preview**: The preview *is* the final PDF. The executed template (filled with auto-generated sample data) is rendered to a real PDF:
  - In the **desktop app** (`editor-electron`), it's rendered by Chromium's own print engine via `webContents.printToPDF` — the same engine the Gotenberg backend uses — so named landscape pages (`@page name { size: a4 landscape }`), `@page` sizes, backgrounds, and footers (page counters via Chromium's footer template) all match the production PDF exactly.
  - In the **browser** (`npm run dev`), it falls back to [paged.js](https://pagedjs.org) (CSS Paged Media polyfill). This covers most layouts but cannot render named-page orientation — use the desktop app for full fidelity on those templates.
- **Import / Export**: Load existing `.reb`, `.html`, or `.txt` files, and export the current source, compiled HTML, or JSON schema as a download. Work is auto-saved to the browser's local storage.

## Getting Started

> **Requires Go** (1.26+) on your `PATH`. The live compiler is built from the
> `../server` Go module to WebAssembly. `npm run dev` and `npm run build` run
> `build:wasm` automatically (via `predev`/`prebuild`), emitting
> `public/rebcompiler.wasm` and `public/wasm_exec.js` (both gitignored).

1. Install dependencies:
```bash
npm install
```

2. Run the development server (runs independently of the main Web Client):
```bash
npm run dev
```

The editor will be available at [http://localhost:5173](http://localhost:5173).

## Compilation

To bundle the editor for production:
```bash
npm run build
```
This generates static HTML/JS/CSS assets in the `/dist` directory.

## Desktop app (Electron)

The same package ships a desktop build. The Electron main process lives in
[`electron/main.cjs`](./electron/main.cjs) and loads `dist/` directly. In the
desktop app the live preview renders the **real PDF** via Chromium's
`printToPDF` (the same engine as the Gotenberg backend).

```bash
npm run electron:dev    # build the web app, then launch Electron
npm run electron:pack   # unpacked build (release/, fast, for testing)
npm run electron:dist   # packaged installers (AppImage / nsis / dmg)
```

> **Requires Go** on your `PATH` (the live compiler is built to WebAssembly from
> the `../server` module during `build`).

## License

The Rebar Studio editor is licensed under the **GNU General Public License
v3.0-or-later** — see [`LICENSE`](./LICENSE). Copyright (C) 2026 hblabs.

The live compiler is built from the rebar server packages `pkg/rebcompiler`,
`pkg/rebrender`, and `cmd/wasm`, which are dual-licensed `BUSL-1.1 OR
GPL-3.0-or-later`; they are included here (as `rebcompiler.wasm`) under the GPL.

Bundled third-party components, all under GPL-compatible permissive licenses:

- React, Monaco Editor, Tailwind CSS, paged.js, Electron — MIT
- Go `wasm_exec.js` — BSD-3-Clause (the Go authors)
