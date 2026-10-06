# Rebar Studio landing

Static marketing page at **https://studio.rebarhq.app/**. “Open Studio” launches the existing
GitHub Pages app at **https://vanillaiice.github.io/rebar-studio/**. Plain HTML, CSS, and small
JavaScript; no build, new packages, external fonts, or third-party page requests.

English is at `/` and French at `/fr.html`. The header's language link works without JavaScript.
Both pages share `styles.css`, `theme.css`, `theme.js`, and `main.js`. Translate both HTML files
when changing copy or release links; each includes its own metadata and screenshot captions.

The light and dark themes follow the device setting initially. The header toggle saves a choice
in browser storage and keeps it across reloads and language changes. If storage is unavailable,
the toggle still works for the current page. The real product screenshots keep the app's own colors.

The copy presents Studio as a free standalone template and document tool whose capabilities
are included in Rebar. Paid template development by hblabs has a separate email subject;
all contact links use `contact@hblabs.xyz`. Transfer to Rebar remains manual export/import.

The visual foundation is Rebar's steel/amber palette, system typography, and hazard stripe.
Product screenshots show the actual Studio app with fictional sample data. The document editor
is a source editor with live preview; the page does not advertise visual drag-and-drop editing.

## Local preview

From the Studio repository root:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory landing
```

Open http://127.0.0.1:8080/. `index.html` can also be opened directly. For a production preview:

```sh
docker build -t rebar-studio-landing-preview landing
docker run --rm --name rebar-studio-landing-preview -p 127.0.0.1:4183:80 rebar-studio-landing-preview
```

Container checks and browser smoke checks, using Studio's existing Playwright dependency:

```sh
node --check landing/main.js
node --check landing/theme.js
bash -n landing/bin/deploy
LANDING_URL=http://127.0.0.1:4183 CHROMIUM_PATH=/usr/bin/chromium node landing/tests/smoke.mjs
```

Omit `CHROMIUM_PATH` to use Playwright's installed Chromium. Smoke checks cover HTTP status,
headers, missing files, metadata, responsive overflow, screenshots, navigation, FAQ, and
JavaScript-disabled launch/download links. They do not download installers or modify Studio data.

## Content and releases

`index.html` and `fr.html` contain all public links and release information, including no-JavaScript
fallbacks. Current downloads point to the verified **v1.0.0-beta.3** GitHub prerelease assets for
Windows x64 and Linux x64. Update the version label, release-notes link, and all four asset links
together when adopting a release. Do not use `/releases/latest` for beta downloads. macOS visitors
are directed to the web app because the current release workflow does not build macOS installers.

`assets/editor.webp` and `assets/document.webp` were captured from the actual local Studio build.
`assets/social.png` and `assets/social-fr.png` are the localized social previews of the updated hero;
`assets/studio.svg` is the existing Studio logo.
Refresh screenshots deliberately when product UI changes, using a disposable local workspace.

Canonical URL, social metadata, `robots.txt`, and `sitemap.xml` use `studio.rebarhq.app`.

## Deploy: same pattern as STS landing

`Dockerfile`, `Caddyfile`, `config/deploy.yml`, `.dockerignore`, and `bin/deploy` follow
`~/Projects/sts/landing`. The separate **rebar-studio-landing** service runs on
**vanillaiice@62.169.20.136**. The existing kamal-proxy owns ports 80/443 and handles the host
route and Let's Encrypt certificate. Caddy only serves static files and `/up` on internal port 80.

The launcher invokes `../../app/rails/bin/kamal` from `landing/`, just as STS uses its Rails
app's bundled Kamal. Rebar Rails needs a working `bundle install` and its required Ruby version.
Local Docker with Buildx and SSH access to the VPS are required. The local registry
`localhost:5555` delivers images over the SSH connection; there is no registry account or
landing-specific `.env`. No database, accessories, persistent storage, or public port binding.

1. Set a DNS-only **A** record for `studio.rebarhq.app` to `62.169.20.136`.
2. First deployment: `landing/bin/deploy setup`.
3. Updates: `landing/bin/deploy`. Logs: `landing/bin/deploy logs`.
4. Inspect configuration: `landing/bin/deploy config`.
5. Roll back: `landing/bin/deploy rollback <version>`; inspect versions with
   `landing/bin/deploy app images`.

Kamal builds the working tree (`builder.context: .`), including uncommitted landing changes,
as STS does. Only the files allowlisted in `landing/.dockerignore` enter the build context.

If your shell exports a `GEM_HOME`/`GEM_PATH` for a different Ruby and Bundler fails, invoke the
launcher with `env -u GEM_HOME -u GEM_PATH landing/bin/deploy ...` under the Rails Ruby version.

After deployment, check `/`, `/up`, the launch link, a missing-asset 404, and the existing STS
and Rebar hostnames. Browser app hosting, data storage, and Electron release/update workflows
are independent of this landing service.

License: GPL-3.0-or-later, as in the parent repository. Copyright (C) 2026 hblabs.
