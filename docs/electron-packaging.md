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

## Clean typecheck contract

Install both dependency trees with `npm ci` and `npm ci --prefix ui` from the
repository root before validating Electron services. The generated backend
bridges and their declarations live in ignored `ui/dist-electron`; they must
never be committed or assumed to exist from a previous build/test run.

Both developer commands are self-contained, even when that directory is absent:

```bash
npm run typecheck
npm --prefix ui run typecheck
```

Root typecheck invokes `build:electron-backends`, which delegates to the existing
UI `build:template-sync` generator, then runs `typecheck:prepared`. UI typecheck
invokes the same generator directly before its own `typecheck:prepared`. The
prepared scripts retain the original strict TypeScript commands; they require
fresh generation first and are intended for a composed validation sequence.
No generator implementation or declarations are duplicated.

Normal CI and Windows Preview Build explicitly generate once after installing
both dependency trees, then share that output between the prepared typechecks:

```bash
npm run build:electron-backends
npm run typecheck:prepared
npm --prefix ui run typecheck:prepared
```

This avoids repeated generation within each CI run. A fresh checkout in both
workflows exercises the clean-state contract. To reproduce it locally, remove
only ignored `ui/dist-electron`, install both lockfiles, and run the sequence
above. Each direct developer typecheck can also be verified independently after
removing that directory. Backend generation needs no OAuth secret; the Preview
secret remains scoped only to packaging.

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
and renderer assets, and creates an unpacked macOS app. Expected output:

```text
ui/release/mac-arm64/Graider.app
```

`npm run package:mac` is the explicit equivalent macOS-only command.

To build the separate Windows x64 portable executable, run:

```bash
npm run package:win
```

Its output is:

```text
ui/release/Graider.exe
```

The Windows target is x64 only; it does not create an installer or an ARM build.
When building the Windows portable executable from macOS, electron-builder may
require Wine. Install Wine on the packaging host if `npm run package:win` reports
it is required; no application-code workaround is needed.

To build a DMG on macOS:

```bash
cd ui
npm run make
```

Expected output:

```text
ui/release/Graider-<version>-<arch>.dmg
```

## Windows Preview build artifact (Phase 3.3 precursor)

For a local Windows x64 package, configure the secret securely in PowerShell and
run from the repository root (after installing both sets of dependencies):

```powershell
$env:GRAIDER_GITHUB_OAUTH_CLIENT_SECRET = "<configured securely>"
npm run package:win
```

The root command delegates to `npm --prefix ui run package:win`. The existing
`beforePack` guard still fails release packaging when the secret is absent.
For native Windows dependencies, use a Windows x64 packaging host.

Testers do **not** build from source. Before the first workflow run, a repository
administrator must configure the repository Actions secret
`GRAIDER_GITHUB_OAUTH_CLIENT_SECRET` under **Settings → Secrets and variables →
Actions → New repository secret**.

GitHub exposes **Run workflow** only after the workflow file is present on the
repository's default branch (`master`). Integrate this workflow there through the
normal review process before using the Actions UI; then select `remote-course-v2`
or the intended branch. This precursor is committed to `remote-course-v2` and does
not change the default branch.

An authorized repository contributor:

1. Opens GitHub Actions and selects **Windows Preview Build**.
2. Chooses the intended branch/commit context through GitHub's workflow UI (the
   selected branch's current commit is checked out by its exact SHA).
3. Runs the workflow and waits for validation and packaging to pass.
4. Downloads `graider-windows-preview-<full-commit-sha>` from the run's artifacts.
5. Extracts `Graider.exe` and `Graider.exe.sha256`, then provides the executable
   to the tester or directs the tester to the artifact before its 7-day expiry.

The checksum file records SHA-256 for `Graider.exe`; the workflow summary also
reports the commit, artifact name and checksum. To verify a downloaded executable:

```powershell
Get-FileHash .\Graider.exe -Algorithm SHA256
```

Compare that hash with `Graider.exe.sha256` and the run summary. The tester launches
`Graider.exe`, opens **Faculty settings → Sign in with GitHub**, and completes the
normal browser OAuth + PKCE flow and loopback callback. Windows secure credential
persistence uses the existing runtime behavior. The tester needs no client secret,
Node.js, npm, system Git or GitHub CLI and is never prompted to configure a secret.

This is **unsigned Preview/testing software**; Windows security/SmartScreen
warnings are expected for now. Phase 3.1 will replace this portable handoff with a
signed Windows installer. Full Phase 3.3 will replace short-lived workflow
artifacts with the formal GitHub Release pipeline and permanent release archive.
This precursor does not complete Phase 3.3 or add update channels or auto-update.

The workflow is manual (`workflow_dispatch`) only, restricted to the upstream
repository, with no push, pull-request or automatic fork builds. All required
checks run on the selected commit before packaging. The secret is scoped only to
the packaging step; the loose generated OAuth configuration is deleted in an
`always()` cleanup step before upload. Only `Graider.exe` and its checksum are
uploaded. The embedded configuration remains in the application, as for a local
release package. Native applications cannot cryptographically hide it; PKCE and
state remain the OAuth security boundary. See [GitHub OAuth](../ui/GITHUB-OAUTH.md).

### Preview dependency audit gate

Before packaging, Windows Preview Build runs both `npm audit --audit-level=high`
and `npm audit --prefix ui --audit-level=high`, including development tooling.
High/critical findings fail the build. The gate uses neither force, legacy peer
resolution nor dependency omissions.

The security refresh after precursor commit `5b2c63f` updates:

| Package       | Root lockfile   | UI lockfile                      |
| ------------- | --------------- | -------------------------------- |
| Zod           | 4.4.3 → 4.6.7   | Not present                      |
| Vite          | 8.3.1 → 8.3.5   | 8.0.16 → 8.3.5                   |
| source-map-js | 1.2.1 → 1.2.2   | 1.2.1 → 1.2.2                    |
| PostCSS       | 8.5.28 → 8.5.32 | 8.5.26 → 8.5.32                  |
| Electron      | Not present     | 44.1.0 → 44.10.2                 |
| Undici        | Not present     | 6.29.0 → 6.29.1; 7.30.0 → 7.30.1 |
| fast-uri      | Not present     | 3.1.8 → 3.1.9                    |

Zod uses `^4.6.7`; Vite uses `^8.3.5` in both packages. Root now declares Vite
explicitly as the Vitest peer so its supported major and patched floor are clear.
UI Electron uses `^44.10.2`, preserving the existing major. Existing Vitest 5.0.3
and React plugin 6.0.2 accept Vite 8, so neither needs an upgrade. Lockfiles retain
exact resolutions; unchanged `latest` declarations are outside this refresh.

source-map-js originally entered root through `tsup@8.5.1 → postcss@8.5.28` and UI
through `vite@8.0.16 → postcss@8.5.26` and `jsdom@29.1.1 → css-tree@3.2.1`.
Both PostCSS and css-tree accepted `^1.2.1`. Normal targeted lockfile refreshes
resolve 1.2.2 without overrides; refreshed PostCSS explicitly requires `^1.2.2`.
Vite is also consumed by Vitest and, in UI, the React plugin. Additional audited
high findings required the compatible Electron 44 and Undici updates above:
UI `electron → @electron/get` and `jsdom` use Undici 7, while
`electron-builder → app-builder-lib → @electron/rebuild → node-gyp` uses Undici 6.
The compatible fast-uri patch belongs to `electron-builder → app-builder-lib → ajv`.

As of this refresh, the remaining minimatch advisory is
[moderate GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249),
with patched floor **11.0.1**. The affected locked paths are:

- Root: `eslint@10.4.0 → minimatch@10.2.5`;
  `eslint@10.4.0 → @eslint/config-array@0.23.5 → minimatch@10.2.5`;
  `typescript-eslint@8.60.0 → @typescript-eslint/typescript-estree@8.60.0 → minimatch@10.2.5`
  (also reached through its parser/plugin/utils).
- UI: `electron-builder@26.15.3 → app-builder-lib@26.15.3 → minimatch@10.2.5`;
  `electron-builder@26.15.3 → app-builder-lib@26.15.3 → @electron/universal@2.0.3 → minimatch@9.0.9`.

These are development-only lint and packaging dependencies (lockfile `dev: true`),
not application runtime dependencies. Current upstream ESLint 10.14.0 still
requires minimatch `^10.2.6`; current @eslint/js 10.0.1 peers with ESLint 10;
current typescript-eslint 8.72.1's typescript-estree still requires `^10.2.2`.
Current electron-builder 26.18.0's app-builder-lib still requires `^10.2.5` and
pins universal 2.0.3 (`^9.0.3`). None offers a supported path to 11.0.1 within
these ranges. Upgrading those tools cannot remove the advisory, so their existing
versions remain. Major overrides, ESLint 9 downgrades and forced audit fixes were
rejected to preserve the supported lint/packaging contracts. Keep the high gate;
revisit this moderate finding when the upstream ranges support the patched line.

The UI audit also retains moderate React Router 6 findings
[GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and
[GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg).
The reported fix requires React Router 7.18.0 or newer; an application router major
migration is outside this high-severity dependency refresh. These are runtime
dependencies and are not classified as development-only minimatch findings.

## RC1 Faculty Release Package

Maintainers can assemble the repeatable RC1 faculty package from the UI package:

```bash
cd ui
npm run release:rc1
```

The script runs `npm run package:mac`, locates the unpacked macOS app from
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

Graider's own Git operations use packaged Dugite, so faculty do not need a
system Git installation for repository operations in Graider. External or
manual workflows outside Graider are outside this guarantee. The Electron main
process may invoke a local tool for authentication:

- GitHub CLI (`gh`) when relying on `gh auth token`

The packaged layout includes the bundled CLI and Git engine:

```text
app.asar.unpacked/
  dist-graider-cli/
  node_modules/dugite/
```

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
