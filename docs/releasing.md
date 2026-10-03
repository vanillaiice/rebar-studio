# Releasing Rebar Studio

## A release

1. Make sure `master` is green (CI: lint, unit tests, end to end, PDF fidelity).
2. Bump the version with gover (`.gover`): it edits `package.json` and `package-lock.json`, commits,
   and tags `vX.Y.Z`. Push the commit and the tag.
3. The **Release** workflow builds the installers on Linux (AppImage, deb), Windows (NSIS installer,
   portable) and macOS (arm64 and x64; dmg, and zip for updates), and uploads them with the update
   files (`latest*.yml`, `beta*.yml`) to a **draft** GitHub release.
4. Check the draft, write its notes, publish it. Installed apps see the update on their next check.

A tag with a prerelease suffix (`v1.3.0-beta.1`) publishes to the **beta** channel: only apps whose
Settings choose "Beta" take it. Mark that GitHub release as a pre-release.

Updates need the releases to be public: electron-updater reads them without a token, so while the
repository is private, installed apps report an error when they check.

## Signing

Unsigned installers work, but macOS Gatekeeper blocks them (right-click, Open) and Windows SmartScreen
warns. The Release workflow signs when these repository secrets exist, and builds unsigned otherwise:

| Secret | For |
|---|---|
| `CSC_LINK`, `CSC_KEY_PASSWORD` | the signing certificate (a base64 `.p12`) and its password: a Developer ID Application certificate on macOS, an OV/EV code signing certificate on Windows |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization (electron-builder notarizes when they are set) |

Costs and options (plan section 10): an Apple Developer membership is about 99 USD a year; for
Windows, Azure Trusted Signing (about 10 USD a month; configure `win.azureSignOptions` in
`package.json`) or an OV certificate. SignPath signs open-source projects for free. A reasonable order
is unsigned betas with install notes, then Windows signing, then macOS notarization before a public
v1.

The Electron fuses (`package.json`, `build.electronFuses`) are set at packaging time: no running as
Node, no `NODE_OPTIONS` or inspector flags, and the app loads only from its integrity-checked asar.

## The web app

The **Pages** workflow builds `dist/` and deploys it to GitHub Pages; run it by hand once Pages is
enabled for the repository (source: GitHub Actions). `dist/` is static, with no backend, so any static
host serves it the same way (`base` is relative). The service worker precaches everything, the engine
included, so the app works offline after its first load and asks before reloading into a new version.

## The engine

Studio pins a `reb` release in `go.mod`. To take a new one:

```bash
GOOS=js GOARCH=wasm go get -tool github.com/vanillaiice/reb/cmd/wasm@vX.Y.Z
GOOS=js GOARCH=wasm go mod tidy
npm test && npm run test:fidelity
```
