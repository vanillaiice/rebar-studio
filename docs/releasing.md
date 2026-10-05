# Releasing Rebar Studio

## A release

1. Make sure `master` is green (CI: lint, unit tests, end to end, PDF fidelity).
2. Bump the version with gover (`.gover`): it edits `package.json` and `package-lock.json`, commits,
   and tags `vX.Y.Z`. Push the commit and the tag.
3. The **Release** workflow builds the installers on Linux (AppImage, deb) and Windows (NSIS
   installer, portable), and uploads them with the update files (`latest*.yml`, `beta*.yml`) to a
   **draft** GitHub release. macOS is not built for now (the `build.mac` config is kept for later).
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
| `CSC_LINK`, `CSC_KEY_PASSWORD` | the signing certificate (a base64 `.p12`) and its password. On macOS, the Developer ID Application certificate. On Windows only for an old certificate with an exportable key (see below) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization (electron-builder notarizes when they are set) |

### Windows options

Since June 2023, certificate authorities keep Windows code signing keys on a hardware token or a cloud
HSM, so a new certificate never comes as a `.pfx` file for `CSC_LINK`. The choices:

| Option | Cost | How it plugs in |
|---|---|---|
| **SignPath Foundation** | free for open source | Apply with the public repository; they review the project. Signing becomes a step in the Release workflow (their GitHub Action), and the key stays with them. The installers must be built in CI from the public repository, not locally. |
| **Azure Trusted Signing** (renamed Artifact Signing) | about 10 USD a month | Microsoft's service. Configure `win.azureSignOptions` in `package.json` and give the `windows-latest` job the Azure credentials (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`). Identity validation is limited to organizations and to individuals in some countries (mainly the US and Canada); check eligibility first. |
| **OV certificate from a CA** (Certum, Sectigo, SSL.com, DigiCert) | about 50 to 400 USD a year | Certum's open source certificate is the cheapest. The key lives on a USB token (sign locally) or a cloud HSM such as SSL.com eSigner or DigiCert KeyLocker (sign in CI, through the provider's tool or a custom `win.signtoolOptions.sign` hook, e.g. with jsign). |

EV certificates no longer skip SmartScreen's reputation check (since 2024), so OV is enough: a signed
build shows the publisher's name, and the warning fades as downloads build reputation.

### macOS

An Apple Developer membership (about 99 USD a year) gives the Developer ID Application certificate
(`CSC_LINK`, `CSC_KEY_PASSWORD`, exported as a `.p12`) and notarization (`APPLE_*`). The Release
workflow does both once the secrets are set.

### Order

Unsigned betas with install notes, then Windows signing (SignPath first, as the project is open
source; Azure or a Certum certificate otherwise), then macOS notarization before a public v1.

### Electron fuses

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
