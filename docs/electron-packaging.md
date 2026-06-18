# Electron Packaging Guide

This guide documents packaging for the Graider Electron app. The packaged app
contains the Electron shell, compiled main/preload code, built renderer assets,
and the bundled Graider CLI.

## Packaging Model

Graider UI uses `electron-builder`.

Primary target:

```text
macOS local development and faculty testing
```

The packaged app uses production renderer assets from:

```text
ui/dist/index.html
ui/dist/assets/
```

The Electron main and preload scripts are compiled to:

```text
ui/dist-electron/
```

The bundled CLI is built to:

```text
ui/dist-graider-cli/index.js
```

In packaged builds, `dist-graider-cli` is unpacked to:

```text
Graider.app/Contents/Resources/app.asar.unpacked/dist-graider-cli/
```

The main process invokes that unpacked helper with argv arrays and sets `cwd` to
the registered course folder. The course folder path is never shell-escaped,
quoted, split, or passed as a dashboard argument.

When `VITE_DEV_SERVER_URL` is unset, the app loads `dist/index.html`. The Vite
dev server is used only by `npm run dev:electron`.

## Build And Package

Install root dependencies for the CLI bundle, then install UI dependencies:

```bash
npm install
cd ui
npm install
```

Then package from the UI package:

```bash
npm run package
```

`npm run package` builds `ui/dist-graider-cli`, builds the Electron main/preload
and renderer assets, and creates an unpacked macOS app.
Expected output on macOS:

```text
ui/release/mac-arm64/Graider.app
```

On Intel macOS, the architecture folder may be `mac` or `mac-x64` depending on
the local Electron/electron-builder environment.

To build a DMG on macOS:

```bash
cd ui
npm run make
```

Expected output:

```text
ui/release/Graider-<version>-<arch>.dmg
```

## RC1 Faculty Release Package

Maintainers can assemble the repeatable RC1 faculty package from the UI package:

```bash
cd ui
npm run release:rc1
```

The script runs `npm run package`, locates the unpacked macOS app from
`ui/release/`, then creates:

```text
ui/dist-release/Graider-RC1/Graider.app
ui/dist-release/Graider-RC1/README-Start-Here.md
ui/dist-release/Graider-RC1/FACULTY-SMOKE-TEST.md
ui/dist-release/Graider-RC1/KNOWN-ISSUES.md
ui/dist-release/Graider-macOS-RC1.zip
```

The source RC documents live in [`docs/release/rc1/`](release/rc1/). The
`ui/dist-release/` output is a generated local artifact and is not intended for
source control.

## Running The Packaged App

Open the unpacked app from Finder or from a terminal:

```bash
open ui/release/mac-arm64/Graider.app
```

If macOS blocks the unsigned app, use the normal local-development override for
an unsigned app. This project does not configure Apple Developer ID signing or
notarization yet.

## External Dependencies

The packaged app uses the bundled Graider CLI and does not require faculty to
install, link, or put `graider` on `PATH`.

The app still shells out to local tools from the Electron main process when
those tools are part of authentication or the local course workflow:

- GitHub CLI (`gh`) when relying on `gh auth token`
- Git, if your course workflow needs it outside Graider

Development mode may still use the workspace or PATH `graider` command. For
local CLI testing from this repository:

```bash
npm install
npm run build
npm link
```

In packaged mode, the UI invokes the bundled CLI through Electron's Node helper
mode. If the bundled resource is missing or cannot be started, the UI shows:

```text
Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app.
```

In development mode, if the external command cannot be found, the UI shows:

```text
Graider CLI not found. Install Graider or make sure graider is available on PATH.
```

macOS apps launched from Finder may not inherit your shell startup files. If the
packaged app cannot find `gh`, either install it in a common location available
to GUI apps or launch Graider from a context whose `PATH` includes GitHub CLI.
The packaged app checks PATH first, then common GitHub CLI install locations
such as `/opt/homebrew/bin/gh`, `/usr/local/bin/gh`, and `/usr/bin/gh`.

## GitHub Token Behavior

Graider checks GitHub authentication on startup. The packaged app uses the same
token resolver as development mode:

1. `GRAIDER_GITHUB_TOKEN`
2. `gh auth token`

Recommended faculty setup for packaged macOS app use:

```bash
gh auth login
```

Double-clicked macOS apps may not see a `GRAIDER_GITHUB_TOKEN` exported from
`.zshrc`, `.zprofile`, `.bashrc`, or an interactive Terminal session. If the env
token is not visible to the app, GitHub CLI authentication is the practical
fallback. The app does not source shell startup files.

Resolved tokens are passed only to child Graider processes. They are not sent to
the renderer, stored in the course registry, or written to disk by the UI.
When `GRAIDER_UI_DEBUG=1` is set, the main process may log whether env token or
GitHub CLI auth was used. It must not log the token value.

If a private repository link opens as a GitHub 404 page, sign into GitHub in the
browser with the same account used for `gh auth login`.

## Security Boundaries

Packaging does not change the Electron security model:

- context isolation remains enabled
- renderer Node integration remains disabled
- renderer code does not call shell commands directly
- preload exposes only narrow `window.graiderUI` APIs
- there is no generic command, shell, file, or open-path IPC
- Graider commands are invoked with argv arrays from the main process

## Manual Packaged Smoke Test

Use only a safe sandbox course. Confirmed apply and confirmed grade dispatch can
mutate GitHub/course state or start GitHub Actions workflows.

- [ ] Run `cd ui && npm run package`.
- [ ] Launch the packaged app from `ui/release/`.
- [ ] Register or open a course folder.
- [ ] Confirm the dashboard loads.
- [ ] Temporarily hide external `graider` from `PATH` and confirm the packaged
      app still loads dashboard data through the bundled CLI.
- [ ] Open assignment detail.
- [ ] Open Apply Preview.
- [ ] Open Grade Dispatch Preview.
- [ ] Open Grade Status.
- [ ] Open Faculty Report.
- [ ] Confirm a broken packaged CLI resource shows the bundled-CLI error, not a
      generic renderer crash.
- [ ] Confirm startup shows GitHub authentication status and missing auth gives
      `gh auth login` guidance.
- [ ] Confirm external GitHub links open in the browser.
- [ ] Restart the packaged app and confirm the course folder registry persists.

## Known Limitations

- GitHub CLI is an external dependency for token fallback.
- No code signing or notarization is configured.
- No custom app icon is configured.
- Windows and Linux packaging are not validated.
- Auto-update is not configured.
- Student report publishing remains deferred in the UI.

## Troubleshooting

### Packaged App Opens A Blank Window

If development mode works but the packaged app opens a blank window:

1. Rebuild before packaging:

   ```bash
   cd ui
   npm run build
   npm run package
   ```

2. Verify production files exist before packaging:

   ```text
   ui/dist/index.html
   ui/dist/assets/
   ui/dist-electron/main.js
   ui/dist-electron/preload.js
   ui/dist-graider-cli/index.js
   ```

3. Verify the packaged app includes renderer/main files in `app.asar` and the
   bundled CLI in `app.asar.unpacked`:

   ```bash
   cd ui
   npx asar list release/mac-arm64/Graider.app/Contents/Resources/app.asar
   ```

   Look for `/dist/index.html`, `/dist/assets/...`,
   `/dist-electron/main.js`, and `/dist-electron/preload.js`.

   Then confirm:

   ```text
   release/mac-arm64/Graider.app/Contents/Resources/app.asar.unpacked/dist-graider-cli/index.js
   ```

4. Run the packaged app with debug diagnostics:

   ```bash
   GRAIDER_UI_DEBUG=1 open ui/release/mac-arm64/Graider.app
   ```

   Debug mode opens DevTools and the main process logs safe renderer load
   diagnostics such as `did-fail-load` and renderer process exits.

5. Confirm the app is loading production `index.html`, not the Vite dev server.
   Packaged mode should run without `VITE_DEV_SERVER_URL` and should load
   relative renderer assets from `dist/`.

Do not fix blank-window failures by enabling renderer Node integration or adding
generic shell/command IPC. The packaged app should keep the same security
boundary as development mode.

### Course Folder Opens But Dashboard Fails

Select the course root folder that contains `course.yml` and `terms/`. Paths
with spaces, such as `/Users/sean/Box Sync/.../csc1120`, are supported.

If the folder registers but dashboard refresh fails, use `Refresh` after fixing
GitHub authentication or course configuration issues. If the failure persists,
launch with debug diagnostics:

```bash
GRAIDER_UI_DEBUG=1 open ui/release/mac-arm64/Graider.app
```

Debug mode logs the selected folder path, validation result, dashboard `cwd`,
runner mode, helper path, argv, exit code, and redacted stdout/stderr snippets.
Do not include tokens in screenshots or bug reports.
