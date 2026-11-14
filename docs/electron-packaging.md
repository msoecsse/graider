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

The CLI bundle includes every root JavaScript runtime dependency except Dugite,
which is explicitly external and unpacked with its native distribution. The
dependency contract test checks that list against the root manifest. Installed
apps must not depend on source-checkout `node_modules`; the NSIS proof runs from
an installed temporary directory outside the checkout to validate this boundary.

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

The portable Windows target is x64 only; this command does not create an installer
or an ARM build. The separate [NSIS test path](#windows-nsis-installer-foundation-phase-31a)
below prepares installer support.
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
warnings are expected for now. Phase 3.1 adds a signed Windows installer separately;
the portable Preview handoff remains available. Full Phase 3.3 will replace short-lived workflow
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

## Windows NSIS installer foundation (Phase 3.1A)

Issue [#49](https://github.com/msoecsse/graider/issues/49) adds a separate
**unsigned test-only installer**, using the existing electron-builder 26 tooling.
It does not complete production Windows signing or provide in-app updates.
Portable Preview commands, output and workflow remain unchanged.

On a **native Windows x64** host with both lockfiles installed, run from the root:

```powershell
# Use this nonfunctional value only for packaging validation, never faculty distribution.
$env:GRAIDER_GITHUB_OAUTH_CLIENT_SECRET = 'ci-only-nonfunctional-nsis-test'
npm --prefix ui run package:win:installer-test
```

Outputs are isolated under `ui/release/windows-installer-test/`:

```text
Graider-<version>-win-x64-unsigned-test-setup.exe
Graider-<version>-win-x64-unsigned-test-setup.exe.blockmap
win-unpacked/
```

The command builds the CLI and app before invoking NSIS with `--publish never`.
The config also sets `publish: null`, preventing repository/CI inference of an
update feed or `latest.yml`. The wrapper removes inherited certificate file/password
variables, disables signing identity discovery, and the config disables executable
signing. Signature verification for future updates remains enabled. The OAuth
packaging guard is unchanged; tests use the nonfunctional value above and cannot
sign in. Test packages are neither signed production releases nor update clients.

The installer retains `appId: edu.graider.ui`, product name `Graider`, and the UI
package's version. Builder derives the NSIS installation GUID from this app ID;
do not change it between production versions. One-click, per-user installation
uses the standard builder location without requiring administrator privileges;
normal installer completion does not launch Graider. Uninstall retains app data.
The bundled CLI and complete Dugite distribution keep the existing unpacked
layout. Built-in differential packaging creates a blockmap; real differential
downloads and full-installer fallback require later electron-updater integration
and end-to-end update validation. See the versioned
[NSIS documentation](https://www.electron.build/v26/docs/nsis/).

`Windows NSIS installer test` runs automatically for scoped packaging changes on
`remote-course-v2`, and supports manual dispatch once available on the default
branch. On a clean native Windows x64 runner it runs deterministic packaging
tests, builds with no real credentials, checks the unsigned installer and its
blockmap, verifies no update feed/metadata, silently installs and reinstalls to
a temporary path with spaces, checks installed Electron x64 and bundled Git using
the existing offline packaged proof, then uninstalls. It records the commit and
SHA-256 but uploads no test package and publishes no release. Normal CI retains
macOS arm64 and Windows x64 regression coverage. This proves installer construction
and local installation, not signed version-to-version updates or faculty UI acceptance.

### Personal owner signing and external prerequisites

The source repository remains `msoecsse/graider`. Signing identities belong to the
project owner's **personal** accounts; the repository organization does not imply
an MSOE publisher identity. Windows provisioning remains pending; the owner has
confirmed active personal Apple membership, a verified Developer ID Application
identity/exported password-protected P12 and validated App Store Connect Team API
credentials. Protected CI credentials and native signed acceptance remain pending.

- **Windows:** finish personal Microsoft signing-account enrollment, identity
  verification and eligibility for the selected Authenticode signing service.
  Provision its signing certificate/profile, authorized signing role and protected
  CI authentication. Confirm the actual certificate publisher identity before
  configuring builder's publisher verification; do not invent a publisher name.
  Validate the supported signing integration against the locked builder 26 version.
  See [Windows signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).
- **macOS (3.2):** configure the owner's existing Developer ID and Team API
  credentials in the protected environment below. Validate signed/notarized arm64
  DMG **and ZIP** on a native Apple Silicon host before claiming acceptance.
- **GitHub Releases (3.3):** verify public unauthenticated release-asset access for
  `msoecsse/graider`, protected release credentials and an explicit human approval
  gate before a release can become visible to clients. Publishing authorization
  belongs only to release automation. Never use faculty OAuth tokens for public
  update retrieval. Configure the existing OAuth release secret separately from
  signing credentials; no actual secret belongs in source or logs.

Before production distribution, add a separate fail-closed signed configuration
(`forceCodeSigning: true`), verify Authenticode signatures on the app, installer and
uninstaller, and validate a signed version-to-version update on native Windows.
Keep this unsigned command test-only. Signing alone does not guarantee SmartScreen
reputation or remove the need for Windows acceptance testing.

### Release/updater compatibility gate before first production update client

The approved design is electron-updater with electron-builder and public GitHub
Releases, Stable first. No custom updater, patch format or server is required.
Before publishing the first update-capable release, record and validate:

1. Stable monotonically increasing SemVer, the relationship between root/UI app
   versions and release tags, and the locked builder/updater metadata compatibility
   floor. The current `0.1.0` is a development version, not a production milestone.
2. Stable app/installer identity, Windows x64 per-user upgrade behavior, actual
   publisher verification identity and signing renewal/rotation handling. Portable
   Preview executables have no automatic migration into an installed updater.
3. Approved public GitHub feed and release visibility rules: no unapproved build
   reaches installed clients; draft/test/prerelease artifacts must not enter Stable.
   Retain versioned installers, macOS ZIP/DMG, blockmaps, checksums and matching
   metadata/release notes. Define channel behavior separately in 3.4.
4. Native signed version-to-version update tests on both platforms, differential
   download/full-package fallback, offline/failure recovery and explicit deferred
   restart during grading. Main owns asynchronous update work through validated,
   narrow IPC; renderer and faculty credentials never supply update authority.
5. A documented mapping from application release to operational course-schema
   support, including incompatible-client refusal. Packaging support does not enable
   Schema v2 migration or satisfy its production-enablement gates.

These are acceptance requirements for later slices, not capabilities of this
unsigned installer. Next is a narrow signed Windows configuration/verification
slice once the owner's signing identity and service are available. Production
3.1 remains incomplete until those prerequisites and signed acceptance pass.

## macOS arm64 archive foundation (Phase 3.2A)

Issue [#53](https://github.com/msoecsse/graider/issues/53) adds a separate unsigned,
**test-only** DMG and ZIP. On native Apple Silicon with Node 24 and both lockfiles
installed, run from the repository root:

```bash
npm --prefix ui run package:mac:archive-test
npm --prefix ui run verify:mac:archive-test
```

The first command builds the CLI/app once, then builds both archives using the
existing electron-builder toolchain. Outputs are isolated in
`ui/release/macos-archive-test/`:

```text
Graider-<version>-mac-arm64-unsigned-test.dmg
Graider-<version>-mac-arm64-unsigned-test.zip
mac-arm64/Graider.app
```

Identity remains `edu.graider.ui` / `Graider`; version comes from `ui/package.json`
(currently `0.1.0`, a development version). Existing unpacked macOS, RC1, Windows
portable Preview and NSIS commands retain their configurations and outputs.
The separate config explicitly sets `mac.identity: null`, `notarize: false`,
`dmg.sign: false` and `publish: null`. The wrapper disables identity discovery,
strips inherited certificate, Apple signing/notarization and GitHub credentials,
and invokes builder with `--publish never`. It ignores caller OAuth configuration
and embeds only `ci-only-nonfunctional-mac-archive-test`. It cannot sign in.
No signing/notarization credentials, release, upload, update feed or updater runtime
are involved. Builder diagnostic YAML and archive blockmaps may be generated;
they are not update feeds. Electron's upstream ad-hoc signature may remain;
no Developer ID identity is applied.

The native verifier extracts the ZIP and mounts the DMG read-only, copies its app
as for drag-to-Applications installation, and tests both outside the source tree
in temporary paths containing spaces. It checks archive integrity, app identity,
version, required ASAR resources, nonfunctional fixture, lack of update feed,
arm64 executable and absence of Developer ID signing. The existing offline packaged
proof checks native bundled Git architecture, CLI help and Dugite resolution,
repository operations and binary patches with empty PATH and isolated Git config.
It prints SHA-256 hashes and cleans up temporary copies/mounts. It never uses live
GitHub credentials. Keep generated test artifacts local and outside production
release directories; do not distribute them to faculty.

`macOS archive test` CI runs on native arm64 for scoped packaging changes pushed
to `remote-course-v2` (or manual dispatch once available on the default branch).
It has read-only repository permission, no secrets or artifact uploads, cleans the
loose fixture even on failure, and records exact-SHA acceptance. Ordinary source
changes use normal comprehensive cross-platform CI without rebuilding these
archives. No cross-platform CI checks are removed.

### Phase 3.2B signing configuration — acceptance pending (#54)

The separate `electron-builder.mac-production.cjs` and manual **macOS production
signing verification** workflow use the owner's personal Developer ID Application
identity. Existing unsigned archive-test, unpacked/RC1 and Windows paths retain
their behavior. The first real signing attempt at `0636ab0296e95a3baeb7e95642336f92406d29c0`
([run 43501894766](https://github.com/msoecsse/graider/actions/runs/43501894766))
passed preliminary checks/builds but failed in the signing wrapper. Its generic
error discarded the stage and cause; successful fallback cleanup cannot recover
that information. No signed acceptance was recorded. Issue #54 remains open.

Configure **Settings → Environments → macos-production-signing**. The environment
holds the owner-configured credentials. Restrict deployment branches to
`remote-course-v2`, require owner review where supported, and prevent unreviewed
workflow/source changes from accessing it. Only dispatch trusted reviewed commits.
The workflow itself allows only that branch in `msoecsse/graider`, checks out its
exact SHA with checkout credential persistence disabled, and has read-only contents
permission. Signing credentials are scoped to one packaging step, after dependency
installation, audits, typechecks, tests and builds without signing credentials.

Create these **environment secrets** (not source files, issue comments or chat):

| Secret                               | Exact value / encoding                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRAIDER_MAC_CERT_P12_BASE64`        | Standard single-line base64 of the entire exported binary `.p12`, including its private key and certificate chain. No data URI, URL, pathname, whitespace or line wrapping.                                                                              |
| `GRAIDER_MAC_CERT_PASSWORD`          | The P12 export password as literal text; no base64, quoting or escaping. A nonempty password is required.                                                                                                                                                |
| `GRAIDER_APPLE_API_KEY_P8_BASE64`    | Standard single-line base64 of the complete original `AuthKey_<ID>.p8` PEM file, including header, footer and its internal newlines. This is the validated **Team** API key, P-256/EC.                                                                   |
| `GRAIDER_APPLE_API_KEY_ID`           | The key's 10-character uppercase alphanumeric Key ID, literal text.                                                                                                                                                                                      |
| `GRAIDER_APPLE_API_ISSUER`           | The Team API issuer UUID (`8-4-4-4-12` hexadecimal characters), literal text. This is not the Apple Team ID.                                                                                                                                             |
| `GRAIDER_GITHUB_OAUTH_CLIENT_SECRET` | The existing Graider GitHub OAuth app client secret, literal text. Configure in this environment (or retain the existing repository secret with the same name). It is separate from Apple authentication and is embedded by the existing packaging hook. |

Create these **environment variables**:

| Variable                | Exact value / encoding                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRAIDER_MAC_CERT_SHA1` | SHA-1 fingerprint of the specific **Developer ID Application** certificate exported in the P12: exactly 40 uppercase hexadecimal characters, no spaces or colons. Obtain locally with `security find-identity -v -p codesigning`; use the hash beside the verified identity, not its display name. |
| `GRAIDER_APPLE_TEAM_ID` | Actual personal Apple Developer Team ID: exactly 10 uppercase alphanumeric characters, literal text. It must match the Developer ID certificate; do not infer it from repository ownership.                                                                                                        |

On macOS, encode each file directly to the clipboard without printing it to logs:

```bash
/usr/bin/base64 -i '/secure/path/DeveloperID.p12' | tr -d '\r\n' | pbcopy
# Paste into GRAIDER_MAC_CERT_P12_BASE64, then encode the original PEM file:
/usr/bin/base64 -i '/secure/path/AuthKey_KEYID.p8' | tr -d '\r\n' | pbcopy
```

No Apple ID, app-specific password, keychain profile, GitHub publishing token or
long-lived CI keychain password is needed. Store offline recovery copies securely.
Before certificate expiry, replace the P12/password and fingerprint together,
verify the Team ID, rerun signed archive checks and repeat native acceptance. Rotate
the API key by replacing P8/Key ID/issuer together, validate the replacement before
revoking the old key, and revoke compromised credentials immediately through Apple.
Never record private keys/passwords in rotation evidence.

After configuration, the owner may manually dispatch the workflow. GitHub's
workflow UI requires the file on the default branch first; integrate it through
normal review separately, then select `remote-course-v2`. This implementation does
not change `master` or dispatch signing. The new commands, after both dependency
trees are installed and built, are:

```bash
npm --prefix ui run build:cli
npm --prefix ui run build
# Supply the documented environment securely, never as literal shell arguments.
npm --prefix ui run package:mac:production
```

The wrapper rejects missing/malformed inputs and non-native hosts before importing
credentials. It creates mode-0600 P12/P8 files in a mode-0700 temporary directory,
imports only into a fresh randomly passworded keychain, requires the configured
certificate hash and Team ID, and passes only selected host settings and prepared
credentials to builder. Alternate identities, publishing/debug variables and raw
P12/password/base64 values are not inherited by builder. Command errors are redacted.
Diagnostics report a fixed `stage` and safe `category`, never external output,
arguments, paths, credential values, encoded secrets, key contents or raw errors.
Command categories distinguish start/I/O failure, termination and nonzero exit;
validation, filesystem and verification failures use fixed categories. The
`builder-sign-notarize-archive` stage is the fallback for an unclassified builder
subprocess exit. Inside builder, fixed stages distinguish initialization, packing,
app signing, app notarization/stapling, independent app verification, and archive
construction (including DMG signing). A dedicated pipe accepts only exact fixed
stage/category pairs; builder stdout/stderr and caught errors remain suppressed.
These identify the active operation, not an inferred external cause. DMG submission,
response parsing/acceptance, stapling and validation have separate stages.
Cleanup failures are reported separately without replacing the original failure,
and each cleanup action is attempted independently. Cleanup-only failure still
fails the command and prevents workflow uploads/acceptance.

A new owner-dispatched attempt is appropriate after the diagnostic commit has
passed normal and native cross-platform CI at its exact SHA and has been reviewed.
Do not change credentials based solely on the first run's generic error. Use the
next attempt's safe stage/category to guide further investigation; a successful
attempt still requires the downloaded native acceptance below.

It neither changes the default keychain nor persists notarization credentials.
Cleanup runs on success/failure; workflow `always()` cleanup also covers normal
cancellation on the ephemeral runner. Forced runner termination ultimately relies
on GitHub-hosted runner destruction; use no persistent/self-hosted signing runner.

Builder 26 signs nested Electron/native code with hardened runtime and only the
`allow-jit` exception, notarizes and staples the app before archive construction.
An `afterSign` gate independently checks the certificate fingerprint, Developer ID,
Team ID, hardened runtime and entitlements on every real Mach-O, including Dugite
executables/dylibs under `app.asar.unpacked`, plus the app's stapled ticket. Builder
creates the DMG; the wrapper explicitly signs it with the verified fingerprint,
temporary keychain and secure timestamp, then separately requires an Accepted DMG notarization result
and staples/validates it. ZIP itself cannot be stapled; it contains the stapled app.
No unsigned fallback is allowed. Actual runtime/entitlement compatibility remains
subject to native acceptance; do not relax entitlements just to pass packaging.

The second attempt at `afd2dba` failed inside builder without recoverable internal
evidence. Inspection of installed `app-builder-lib` **26.15.3** confirms
`MacPackager.sign` awaits `MacTargetHelper.notarizeIfProvided`; installed
`@electron/notarize` awaits acceptance and stapling before resolving.
`PlatformPackager.doSignAfterPack` then awaits `afterSign`, before
`packMacTargets` constructs archives. The staple gate is correctly placed.
Builder supplies runtime and the configured entitlements to every nested signing
operation. A local credential-free ad hoc probe on disposable copies of Dugite
Git and a dylib retained runtime and the JIT entitlement; it does not prove
Developer ID or notarization acceptance. Libraries inherit host entitlements, so
JIT is not intrinsically needed on every library, but no deterministic rejection
by the current verifier was established. Preserve the checks until a concrete
failure is demonstrated. Regression tests execute the installed lifecycle with
external operations stubbed and test safe builder failure propagation.

The third attempt, [run 43532058480](https://github.com/msoecsse/graider/actions/runs/43532058480)
at `2976b47`, completed builder but failed the independent DMG signature gate.
Inspection of installed `dmg-builder` **26.15.3**, `DmgTarget.build` and `signDmg`,
confirms `dmg.sign: true` awaits `codesign --sign <hash> --keychain <keychain> <dmg>`.
It can silently skip signing when signing is disallowed, identity is explicitly
disabled, or neither Developer ID Application nor fallback Mac Developer identity
is found. Builder completion alone therefore does not prove a signed DMG.

A deterministic verifier defect was reproduced without credentials: the `-R`
argument lacked the leading `=` that marks an inline requirement. macOS instead
interprets the certificate expression as a filename and reports an invalid
requirement specification. The fix supplies `=certificate leaf = H"<sha1>"` for
DMG, app and nested signatures. See Apple's [TN3127 requirement examples](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)
and the installed `codesign(1)` section **SPECIFYING REQUIREMENTS**. Tests assert
the exact argv on all platforms and compile that actual argument with Apple's
`csreq` on native macOS CI; no real certificate or keychain is needed.

Apple [supports Developer ID Application signing of disk images](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution).
Strict signature verification and an exact leaf certificate constraint apply to
DMGs. The fourth attempt, [run 43550080038](https://github.com/msoecsse/graider/actions/runs/43550080038)
at `fd2bfb3`, still failed the outer DMG gate after the inline requirement fix.
Its discarded native output cannot establish which verification operation failed.

The wrapper now explicitly signs the completed DMG with `codesign --sign` using
the already verified Developer ID fingerprint, `--keychain` pointing to its
private temporary keychain, and `--timestamp`. Production builder has `dmg.sign:
false` so there is one signing owner, with no silent builder lookup/fallback.
The separate `dmg-sign` stage distinguishes start/I/O, termination and exit failure.
Notarization runs only after all independent DMG checks pass.

Installed 26.15.3 implementation tests confirm that an explicit fingerprint
bypasses `CSC_IDENTITY_AUTO_DISCOVERY=false` suppression, both native identity
queries receive the supplied keychain, and unmatched fingerprints return null.
`MacPackager.codeSigningInfo` uses `CSC_KEYCHAIN` when no CSC link is supplied;
the wrapper excludes alternate CSC inputs. This proves the installed lookup
behavior, not whether the historical run actually signed its image.

The DMG verifier reports these fixed categories at `dmg-signature-verification`:

| Category                                             | Failing native operation                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `unsigned-dmg`                                       | Signature display reports Apple's unsigned marker.                                                                               |
| `signature-inspection-failure`                       | Display fails without the unsigned marker.                                                                                       |
| `invalid-signature`                                  | Independent `codesign --verify --strict` fails.                                                                                  |
| `certificate-requirement-mismatch`                   | Integrity passed; exact leaf SHA-1 requirement fails.                                                                            |
| `developer-id-team-requirement-mismatch`             | Integrity and leaf passed; native Apple anchor, Developer ID certificate extensions or certificate subject OU requirement fails. |
| `command-start-or-io-failure` / `command-terminated` | Native verification could not complete.                                                                                          |

Native output, certificate information, arguments and paths are never rendered.
Only errors held in the verifier's private WeakMap carry these categories through
the wrapper; forged error properties/messages remain generic failures.

A credential-free native DMG fixture passes strict verification after ad hoc
signing while displaying `TeamIdentifier=not set` and no Authority. Display text
is not a universal signed-DMG identity contract. This fixture does **not** prove
what a Developer ID DMG displays. A disposable self-signed certificate probe was
not accepted as a native signing identity; no trust settings were changed and
no Developer ID fixture coverage is claimed. The production DMG gate instead
uses Apple's native certificate requirement evaluator: the same exact leaf plus
`anchor apple generic`, Developer ID intermediate OID `1.2.840.113635.100.6.2.6`,
Developer ID Application leaf OID `1.2.840.113635.100.6.1.13`, and the configured
`certificate leaf[subject.OU]`. This is stronger than parsing Authority names.
See [Apple's Developer ID requirement example](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).
App and nested Mach-O display/runtime/entitlement checks remain unchanged.

Native regression fixtures distinguish unsigned images, strict-integrity damage,
and ad hoc signatures failing the exact certificate requirement. Native `csreq`
compiles the actual production requirement. Mocked operations separately exercise
every category and its propagation through cleanup, without real credentials.
No fixture proves real Developer ID/notarization acceptance. No production signing
workflow was dispatched. The next reviewed owner-authorized attempt will identify
the failing signing or verification operation, or proceed to mandatory DMG
notarization/stapling and both installation proofs. Native downloaded/quarantined
DMG and ZIP acceptance remains mandatory before closing #54.

Outputs live only under `ui/release/macos-production/`:

```text
Graider-<version>-mac-arm64-signed.dmg
Graider-<version>-mac-arm64-signed.zip
Graider-<version>-mac-arm64-signed.dmg.sha256
Graider-<version>-mac-arm64-signed.zip.sha256
```

Before generating checksums, the native verifier extracts ZIP, mounts DMG read-only,
copies its app outside the checkout, checks signatures/staples on both copies,
adds quarantine, runs Gatekeeper assessment, and runs the offline CLI/Dugite proof
with empty PATH and isolated Git configuration. No GUI launch is automated. Only
the two archives and checksums are uploaded for 7 days as
`graider-macos-signed-verification-<full-sha>`; diagnostic YAML, loose OAuth data,
certificates, keys and keychains are excluded. No GitHub Release is created and no
feed/channel/updater implementation is added. The current version is development
`0.1.0`, not a production release milestone.

**Remaining acceptance, required before closing #54:** record the signed workflow
run, archive hashes and green normal/native cross-platform CI at the exact commit.
Download both archives onto a clean native Apple Silicon Mac through a browser;
verify their hashes, preserve download quarantine, extract ZIP and drag-install DMG
separately into clean locations. Confirm Developer ID/team, `codesign --verify
--deep --strict`, app/DMG `xcrun stapler validate`, and Gatekeeper assessments. Launch
each installed app from Finder without bypasses or removing quarantine; check
normal renderer startup, OAuth sign-in, and bundled CLI/Git outside the checkout
without system Git/Node/npm. Record each archive's result and OS version without
secrets. The automatic offline proof can also be rerun on downloaded archives with
`npm --prefix ui run verify:mac:production` and only the two identity variables;
its synthetic quarantine checks do not replace real downloaded Finder acceptance.
Do not claim production acceptance from deterministic tests or unsigned #53.
Signed version-to-version updates, Phase 3.3/3.4/3.5 and Schema v2 remain separate.

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
an unsigned app. The separate production signing path above requires protected
credentials and its own acceptance; these local-development paths remain unsigned.

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
- macOS signing/notarization configuration is implemented separately; real signed
  archive and clean downloaded installation/launch acceptance remain pending #54.
- No custom app icon is configured.
- Native Windows x64 unsigned NSIS install/reinstall and bundled-Git validation
  run in CI; signed production Windows acceptance remains pending. Linux is not validated.
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
