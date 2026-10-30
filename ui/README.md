# Graider UI

The Graider UI is an Electron desktop shell for the Graider CLI.

## Development

Run Vite and Electron in separate terminals:

```bash
npm install
npm run dev
```

```bash
npm run dev:electron
```

## Production Build

```bash
npm run build
```

The build writes renderer assets to `dist/` and Electron main/preload output to
`dist-electron/`.

## Package A Local App

Install root and UI dependencies before packaging from a fresh checkout:

```bash
npm install
cd ui
npm install
```

```bash
npm run package
```

The package script builds the bundled Graider CLI into `dist-graider-cli/`, then
builds the Electron app. It produces an unpacked macOS app under `release/`:

```text
release/mac-arm64/Graider.app
```

`npm run package:mac` is the explicit equivalent macOS-only command. To build
the separate Windows x64 portable executable, run `npm run package:win`; its
output is `release/Graider.exe`. Cross-packaging that executable from macOS may
require Wine.

To make a DMG on macOS:

```bash
npm run make
```

See [Electron Packaging Guide](../docs/electron-packaging.md) for bundled CLI
behavior, GitHub authentication requirements, unsigned app notes, and the
packaged app smoke-test checklist.

Course-derived Electron mutations must use the trusted boundary documented in
[remote course architecture](../docs/graider-remote-course-architecture.md#phase-2--slice-27-trusted-pre-mutation-synchronization).
Add new write handlers to the explicit `courseMutationIpc.ts` inventory before enabling them.

After building, run `node_modules/.bin/electron scripts/smoke-managed-course-guard.cjs` from `ui`
for the isolated guard smoke. It creates temporary local repositories and a separate Electron profile,
uses fixture identities and local transport, opens the production renderer, and prints its evidence
location. It covers stale-source blocking, cache review/cancel/reconciliation, explicit retry, pending
publication recovery, student-facing blocking, and sign-out. It never uses the real faculty profile.
