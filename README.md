# Rebar Studio

Rebar Studio is a free, offline desktop and web app for `.reb` form templates:

- **author** templates with a live PDF preview, completions and the engine's error markers;
- **fill** documents from them: text, dates, choices, tables with computed totals, photos from the
  camera, signatures;
- **finalize** documents to a locked PDF with its SHA-256 fingerprint, and export them one by one,
  in batches, or as a register (CSV, JSON).

No account, no server, no network: everything stays on the device. It runs the
[`reb` engine](https://github.com/vanillaiice/reb), the engine Rebar's server runs, compiled to
WebAssembly, so a template behaves and prints the same in Studio and in Rebar.

- [User guide](docs/user-guide.md)
- [Releasing](docs/releasing.md)
- [Product plan and status](docs/plan.md)

## What is in it

| Area | What it does |
|---|---|
| Templates | Library with search, tags, archive, duplicate; a starter gallery of seven construction templates; versions (a template's next edit after a document uses it starts a new version, so documents never change) with restore; template images |
| Editor | Monaco with `.reb` snippets, the engine's errors and warnings as markers (unknown bindings, unused fields, invalid names and conditions), the compiled HTML, the schema, and the form the template produces |
| Documents | The form built from the schema; show-if conditions, formulas and validation from the engine; autosave, undo; live preview; finalize, duplicate, reopen as a revision, move a draft to the latest template version |
| PDF | Desktop: Chromium's `printToPDF` with the parameters Rebar sends Gotenberg (checked pixel by pixel, `npm run test:fidelity`). Browser: paged.js and the print dialog. Rendered pages cannot reach the network |
| Files | `.reb`, `.rebpack` (a template with its images, the format Rebar imports), `.rebdoc` (one document, self-contained), `.rebbackup` (the workspace); the desktop app and the installed web app open them |
| Offline | The web app installs as a PWA and works offline from its first visit; the desktop app is offline by nature |
| Updates | Desktop: electron-updater from GitHub Releases, stable or beta channel, never without asking. Web: a "reload" prompt |

## Development

Requirements: Node.js 22+ and Go 1.26+ on your `PATH`.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ (type check, app, service worker)
npm run lint
npm test             # unit tests, against the real engine
npm run test:e2e     # Playwright: the web build and the desktop app (build first)
npm run test:fidelity  # the desktop PDF against Gotenberg (GOTENBERG_URL, default :3010)
```

`npm run dev` and `npm run build` first run `build:wasm` (`scripts/build-wasm.sh`), which builds the
engine release pinned in `go.mod` to `public/rebcompiler.wasm` and copies what the engine ships for
browsers (`wasm_exec.js`, `tailwindcss.js`, `paged.polyfill.js`, `specification.md`). These files
are generated, not committed.

- Move to a new engine release: `go get -tool github.com/vanillaiice/reb/cmd/wasm@vX.Y.Z`.
- Build against a local `reb` checkout while changing the engine: `REB_DIR=../reb npm run dev`.

Playwright drives its own Chromium by default (`npx playwright install chromium`); set
`CHROMIUM_PATH=/usr/bin/chromium` to use the system one.

### Layout

```
src/
  app/        shell, router, onboarding, updates, files opened from the system
  engine/     the engine worker and its typed client
  store/      IndexedDB: templates, versions, documents, files, settings
  editor/     the template editor (loaded only when a template is opened)
  form/       the form filler: fields, tables, photos, signatures
  render/     rendering: the PDF and paged documents, fonts, exports
  formats/    .rebpack, .rebdoc, .rebbackup
  documents/  library/  settings/  reference/  starters/
electron/     main process, preload (the page's only bridge), the network-isolated PDF renderer
e2e/          Playwright tests        test/   Vitest tests
```

## Desktop app (Electron)

```bash
npm run electron:dev    # build, then launch Electron
npm run electron:pack   # unpacked build in release/ (fast, for testing)
npm run electron:dist   # installers: AppImage and deb, NSIS and portable, dmg and zip
```

`REBAR_STUDIO_USER_DATA=/some/folder` starts the app with a separate profile (the tests use one).

## Versions

Releases are tagged `vX.Y.Z` with [gover](https://github.com/vanillaiice/gover) (`.gover`); a tag
builds the installers (see [docs/releasing.md](docs/releasing.md)).

## License

Rebar Studio is licensed under the GNU General Public License v3.0 or later; see
[LICENSE](LICENSE). Copyright (C) 2026 hblabs.

The engine (`rebcompiler.wasm`) is built from [`reb`](https://github.com/vanillaiice/reb), also
GPL-3.0-or-later. Bundled third-party components, all under GPL-compatible licenses:

- React, Monaco Editor, Tailwind CSS, paged.js, Electron, electron-updater, idb, fflate, marked,
  lucide: MIT or ISC
- Go's `wasm_exec.js`: BSD-3-Clause (the Go authors)
- Fonts (Inter, Source Serif 4, JetBrains Mono, Noto Sans Arabic): SIL Open Font License 1.1
