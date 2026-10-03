# Rebar Studio

Rebar Studio is an offline desktop and web app for `.reb` form templates: author a template with a
live PDF preview, fill documents from it, and render the filled documents to PDF. No account, no
server and no network connection are needed.

It runs the [`reb` engine](https://github.com/vanillaiice/reb), the same engine Rebar's server runs,
compiled to WebAssembly, so a template behaves the same in Studio and in Rebar.

The product plan is [docs/plan.md](docs/plan.md).

## Development

Requirements: Node.js 22+ and Go 1.26+ on your `PATH`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/
npm run lint
```

`npm run dev` and `npm run build` first run `build:wasm` (`scripts/build-wasm.sh`), which builds the
engine release pinned in `go.mod` to `public/rebcompiler.wasm` and copies the browser files it ships
(`wasm_exec.js`, `tailwindcss.js`, `paged.polyfill.js`). These files are generated, not committed.

- Move to a new engine release: `go get -tool github.com/vanillaiice/reb/cmd/wasm@vX.Y.Z`.
- Build against a local `reb` checkout while changing the engine: `REB_DIR=../reb npm run dev`.

## Desktop app (Electron)

The Electron main process is [`electron/main.cjs`](electron/main.cjs); it loads `dist/` from disk.
The desktop app renders the preview as a real PDF with Chromium's `printToPDF`, the engine Rebar's
PDF service (Gotenberg) uses, so named pages, `@page` sizes, headers and footers match Rebar's PDFs.
In a browser, the preview is paginated by [paged.js](https://pagedjs.org) instead.

```bash
npm run electron:dev    # build, then launch Electron
npm run electron:pack   # unpacked build in release/ (fast, for testing)
npm run electron:dist   # installers: AppImage, NSIS and portable, dmg
```

## Versions

Releases are tagged `vX.Y.Z` with [gover](https://github.com/vanillaiice/gover) (`.gover`).

## License

Rebar Studio is licensed under the GNU General Public License v3.0 or later; see
[LICENSE](LICENSE). Copyright (C) 2026 hblabs.

The engine (`rebcompiler.wasm`) is built from [`reb`](https://github.com/vanillaiice/reb), also
GPL-3.0-or-later. Bundled third-party components, all under GPL-compatible licenses:

- React, Monaco Editor, Tailwind CSS, paged.js, Electron: MIT
- Go's `wasm_exec.js`: BSD-3-Clause (the Go authors)
