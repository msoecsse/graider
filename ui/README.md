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
