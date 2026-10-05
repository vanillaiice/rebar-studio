# Rebar Studio landing page: proposed stack

Status: approved, implemented, and deployed on 2026-10-05 as a landing-only service at
`https://studio.rebarhq.app/`.
The browser app stays at its verified existing GitHub Pages host:
`https://vanillaiice.github.io/rebar-studio/`. Deployment follows STS landing.

## Decision

Build a standalone static landing page in this repository under `landing/`, using semantic HTML,
plain CSS with Rebar design tokens, and small progressively enhanced JavaScript. Serve it from a
Caddy container deployed as its own `rebar-studio-landing` Kamal service on the existing shared VPS.

This follows the actual STS landing deployment rather than adding another application runtime.
For one product page, static HTML gives indexable content, fast initial rendering, and working
download and launch links without JavaScript. There is no server-side application or database.
The existing React/Vite/TypeScript stack remains the stack for Studio itself.

| Layer | Choice | Purpose |
| --- | --- | --- |
| Landing markup | Semantic HTML | Product copy, screenshots, navigation, downloads, FAQ |
| Styling | Plain CSS, custom properties | Rebar palette, responsive layout, accessible controls |
| Interaction | Small vanilla JS module | Mobile navigation and optional screenshot tabs/lightbox |
| Product visuals | Actual Studio screenshots and existing SVG logo | Show the product and preserve its identity |
| Browser app | Link to its existing public URL | Launch Studio on its current host |
| HTTP server | Caddy 2 Alpine, pinned version/digest during implementation | Static files, compression, cache headers, `/up` |
| Packaging | Docker | Image contains only static landing files and Caddy |
| Deployment | Kamal 2.12, matching the existing Rebar toolchain | Build, image delivery, health checks, traffic switch, rollback |
| Public ingress | Existing shared kamal-proxy | Host-based routing and Let's Encrypt HTTPS |
| Desktop downloads | Links to published GitHub release assets | Keep installers and updater metadata on the release infrastructure |
| Verification | Existing Playwright tooling plus container HTTP checks | Responsive behavior, links, launch destination and deployment routing |

The landing page needs no npm dependencies or build step. Use separately scoped
verification/configuration for the landing page so its
scripts and tests do not accidentally enter the application's existing lint/test globbing.

## Rebar visual foundation

The current Rails platform, Studio, and archived Rebar landing page establish the foundation:

| Token | Value / treatment |
| --- | --- |
| Suite amber | `#f5b700`, stronger `#d99a00` |
| Studio amber | `#facc15`, stronger `#ca8a04`; retain in Studio's logo and actual product UI |
| Steel surfaces | `#020617`, `#0f172a`, `#1e293b` |
| Concrete | `#e4e7eb` |
| Light ink | `#111827` |
| Dark text / muted text | `#f1f5f9` / `#94a3b8` |
| Typography | Suite's system sans-serif stack; monospace for `.reb` examples |
| Brand motif | Existing amber/steel hazard stripe, used sparingly as a divider |
| Components | Restrained rounded panels, fine borders, clear amber primary actions, line icons |

Use a steel header and hero, the suite amber for primary marketing actions, and concrete/light
surfaces for supporting sections. The hero shows the real Studio editor and document preview.
Keep Studio's existing icon; do not silently change either application's global theme tokens.
Define the landing tokens locally with semantic names for surface, text, border, and accent.

Maintain visible keyboard focus, sufficient contrast, reduced-motion behavior, 44px touch targets,
and a usable 360px layout. Use system fonts so the page makes no external font requests.

## Content and conversion

The page leads with Studio's actual purpose: author templates, fill documents, and produce PDFs
offline. Hero copy: “Form templates and PDFs.” Keep descriptions factual, avoid em dashes,
and explain each capability once rather than repeating slogans between sections.

1. Header: Rebar Studio identity, Features, Downloads, FAQ, launch action.
2. Hero: short product statement, “Open Studio” and “Download for desktop”, actual product image.
3. Trust strip: free, open source, no account required, local document storage.
4. Workflow: create a template, fill the generated form, export a PDF.
5. Product detail: live preview, versioned templates, tables and formulas, photos and signatures.
6. Suite connection: `.reb` / `.rebpack` interoperability with Rebar and the shared engine.
7. Downloads: available platform assets and an explicit beta label where applicable.
8. FAQ: browser versus desktop, offline use, storage/backups, license, compatibility with Rebar.
9. Footer: Rebar, source repository, documentation, license, hblabs.

Match release availability to published artifacts during implementation. The current workflow
builds Linux and Windows; macOS configuration exists but its release job is absent. Do not show
a working macOS download unless an artifact actually exists. Do not assume GitHub's stable
`/releases/latest` points to the current beta. Keep a reviewed release/version/link map in one
place, with a release-page fallback, rather than fetching the GitHub API on every visitor's load.

Describe the template editor accurately: it edits `.reb` source with a live preview. Do not
advertise drag-and-drop editing, cloud sync, team collaboration, or browser/desktop pixel parity.
Offline browser use requires the initial app download and completed caching. Explain that local
browser data requires backups; a Studio download or app launch is not a Rebar account signup.

Set title, description, canonical URL, social preview, and sitemap/robots entries for the final
hostname. The landing content and all primary links work without JavaScript. Start with English;
translated pages can share the same styles and assets if requested.

## Hosting layout

Landing-only deployment:

```text
Internet
  -> existing kamal-proxy on VPS ports 80/443 (host routing + TLS)
     -> rebar-studio-landing Caddy container, internal port 80
        /             landing page
        /assets/      landing assets
        /up           health endpoint, HTTP 200

“Open Studio” -> browser app on its existing host
“Download”    -> published GitHub release assets
```

Serve real static paths; unknown paths/assets return 404. The landing page has no service worker.
HTML and unversioned styles/scripts revalidate; use long immutable caching only for fingerprinted
assets. Enable compression. Keep launch and download destinations in one reviewed link map,
with real HTML links that work before JavaScript runs.

The browser app's hosting, PWA, IndexedDB origin, and update behavior stay as they are.

## Kamal deployment design

Existing configurations agree on VPS `62.169.20.136`, SSH user `vanillaiice`, local image registry
`localhost:5555`, and `amd64` builds. Rebar currently routes `s.rebarhq.app`; the STS landing routes
`sts.hblabs.xyz`. The initial deployment verified the DNS A record, Studio's HTTPS response,
its health endpoint, and the existing STS/Rebar routes. The proxy lists all four services,
including Binoculars, as running with TLS.

Configure the distinct `rebar-studio-landing` service/image, explicit chosen proxy host, `ssl: true`, internal
`app_port: 80`, and health path `/up`. Caddy listens on `:80` internally and does not manage
certificates. Kamal attaches the service to its existing network; no published container host
ports, accessories, database, persistent volumes, or additional public reverse proxy are needed.
Limit the Docker build context to required inputs and keep secrets out of the final image.

Package the static files on the deploying machine and push/pull through the existing local
registry over SSH. Use an isolated standalone Kamal config/launcher for the landing page;
the launcher uses `../../app/rails/bin/kamal`, matching STS landing’s use of its bundled
Rails Kamal. As STS does, build the working tree from `landing/` with `builder.context: .`
and an allowlisted `.dockerignore`. No Node or Go build is involved.

The implementation should document DNS setup, local container preview, first deployment,
updates, logs, and `kamal rollback <version>`. Deploy through the existing proxy configuration;
global proxy port/network settings belong to the shared VPS setup. Verify the Studio route and
the existing STS/Rebar routes after switching traffic.

For the initial iteration, deploy manually with the existing operator toolchain after checks.
The desktop release and browser app workflows remain separate from landing hosting. Automated deployment can
follow once image registry and SSH credential handling are deliberately configured.

## Proposed repository additions

```text
landing/
  index.html
  styles.css
  main.js
  assets/                 logo, product screenshots, social preview
  README.md               content and local preview instructions
  Caddyfile
  Dockerfile
  .dockerignore
  config/deploy.yml        standalone Kamal configuration
  bin/deploy              launcher selecting landing config and build context
```

The existing root `index.html`, `src/`, Electron packaging, and application `dist/` continue to
describe Studio. The final container serves only `landing/` at its web root. The implementation
will also update `docs/releasing.md` to distinguish VPS landing hosting from the existing browser
app and desktop release workflows.

## Implementation acceptance checks

- Responsive landing at phone, tablet, and desktop widths; keyboard navigation and reduced motion.
- Launch/download/source links work with JavaScript disabled and reflect actual release availability.
- Container validates its Caddy configuration; `/up` returns 200; missing assets return 404.
- “Open Studio” reaches the verified existing browser app URL.
- Cache behavior allows landing updates; metadata and canonical URLs use the selected hostname.
- Kamal configuration resolves to a distinct service and host without shared-proxy overrides.
- At deployment time, DNS/TLS and Studio's route work, with STS and Rebar still reachable.

## Evidence and references

Local foundations:

- Studio: `src/index.css`, `src/app/themes.ts`, `public/favicon.svg`, `README.md`,
  `vite.config.ts`, `.github/workflows/release.yml`, `docs/releasing.md`.
- Rebar: `../app/rails/app/assets/tailwind/application.css`,
  `../app/rails/docs/guide/16-ui-system.md`, `../app/rails/config/deploy.yml`,
  `../app/rails/deploy/README.md`.
- STS: `~/Projects/sts/landing/README.md`, `Dockerfile`, `Caddyfile`, `config/deploy.yml`.

Official behavior checked while preparing this proposal:

- [Kamal proxy: hosts, TLS, app port, health checks](https://kamal-deploy.org/docs/configuration/proxy/)
- [Caddy static file serving](https://caddyserver.com/docs/caddyfile/directives/file_server)
- [Service-worker registration and scope](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)
