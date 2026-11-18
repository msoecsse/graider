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
`remote-course-v2`, `master` and `release/**` pushes and pull requests targeting
`master` or `release/**`. It supports manual dispatch once available on the default
branch. The temporary #54 branch-push exclusion has been removed; see
[Windows CI restoration](#windows-ci-restoration-54). On a clean native Windows x64 runner it runs deterministic packaging
tests, builds with no real credentials, checks the unsigned installer and its
blockmap, verifies no update feed/metadata, silently installs and reinstalls to
a temporary path with spaces, checks installed Electron x64 and bundled Git using
the existing offline packaged proof, then uninstalls. It records the commit and
SHA-256 but uploads no test package and publishes no release. Normal CI retains
macOS arm64 and Windows x64 coverage for every selected native domain. This proves installer construction
and local installation, not signed version-to-version updates or faculty UI acceptance.

### Personal owner signing and external prerequisites

The source repository remains `msoecsse/graider`. Signing identities belong to the
project owner's **personal** accounts; the repository organization does not imply
an MSOE publisher identity. Windows provisioning remains pending; the owner has
confirmed active personal Apple membership, a verified Developer ID Application
identity/exported password-protected P12 and validated App Store Connect Team API
credentials. Protected macOS CI signing and owner-reported downloaded-artifact
acceptance have succeeded; see the [acceptance record](#macos-signing-acceptance-record-54).

- **Windows:** finish personal Microsoft signing-account enrollment, identity
  verification and eligibility for the selected Authenticode signing service.
  Provision its signing certificate/profile, authorized signing role and protected
  CI authentication. Confirm the actual certificate publisher identity before
  configuring builder's publisher verification; do not invent a publisher name.
  Validate the supported signing integration against the locked builder 26 version.
  See [Windows signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).
- **macOS (3.2):** retain the protected Developer ID and Team API configuration
  below. Both signed/notarized arm64 archives passed automated verification and
  owner-reported native installation/launch testing. Current CI closeout remains separate.
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

### macOS signing acceptance record (#54)

Recorded **2026-11-18 UTC** from GitHub run evidence and the owner's supplied
manual results; the owner did not supply the manual test date or macOS version.
**macOS production signing and the reported downloadable DMG/ZIP acceptance
checks are complete. Issue #54 remains open for current exact-SHA CI closeout
and reconciliation of the manual evidence limits below.**
This accepts the tested artifacts, not overall production-release readiness.

- [Production signing run 43670168047](https://github.com/msoecsse/graider/actions/runs/43670168047)
  succeeded on **2026-11-15 UTC**, at
  `15354c7260cb1c73014b2def0f91bd895cdd7835` on `remote-course-v2`.
  Job `signing`, step `Sign, notarize and verify both archives`, cleanup and upload
  all succeeded. Credential-free packaging checks passed **373 tests in 8 files**.
- [Historical CI 43669424182](https://github.com/msoecsse/graider/actions/runs/43669424182)
  succeeded at that exact SHA: normal checks (including audit), macOS arm64 grading
  boundary and permanent migration regression passed. Windows x64 jobs were
  omitted under the then-active #54 branch-push exception. This is historical
  macOS evidence, not exact-SHA cross-platform acceptance.
- Artifact **14144800103**, named
  `graider-macos-signed-verification-15354c7260cb1c73014b2def0f91bd895cdd7835`,
  belongs to that production run and SHA. Upload logs confirm four files:
  `Graider-0.1.0-mac-arm64-signed.dmg`,
  `Graider-0.1.0-mac-arm64-signed.zip`, and each archive's `.sha256` file.
  Retention is seven days (reported expiry **2026-11-22 03:11:42 UTC**).
  The Actions artifact-container digest is not an individual archive checksum.
  Individual digest values are not transcribed here; the owner reports both
  downloaded archive checksum comparisons as `OK`.

Inspection of the successful SHA's workflow and unchanged verification scripts
establishes the automated checks credited to that run:

| Requirement                                                                     | Verified evidence                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fail-closed protected signing; no unsigned fallback                             | Native arm64 guard, protected environment, step-scoped credentials, mandatory preflight and builder completion/artifact gates; signing and cleanup succeeded.                                                                                                                                |
| Developer ID, hardened runtime, entitlements, nested Electron/Dugite signatures | Independent exact certificate and Team ID verification, recursive Mach-O verification and component-specific entitlement policy passed before archives; repeated on both installed app copies.                                                                                               |
| Notarization and stapling                                                       | Builder app notarization and independent app staple gate; explicit signed DMG verification, Accepted notarization response, staple and validate; ZIP contains a stapled app.                                                                                                                 |
| Archive installation and Gatekeeper                                             | ZIP extraction and read-only DMG mount/install-copy outside checkout; both apps checked for identity/version/resources and arm64, synthetically quarantined and assessed; DMG signature, ticket, Gatekeeper and image integrity checked.                                                     |
| Bundled CLI/Git independence                                                    | Both installed copies run Electron-as-Node with empty PATH, isolated HOME/temp/Git configuration and the offline packaged Dugite proof: bundled resolution/architecture, CLI help and local Git operations/binary patches. No automated GUI launch or live GitHub authentication is claimed. |
| Checksums and provenance                                                        | Wrapper generates each archive's SHA-256 only after both installation proofs; successful upload contains only the archives and their checksum files.                                                                                                                                         |

The verifier's subprocess output is captured by the wrapper, so the signing log
does not contain individual proof markers or native command output. Credit comes
from the successful mandatory step and inspected fail-closed script sequence,
not invented per-command log entries. Codex reviewed this evidence without
rebuilding, rerunning signing or executing the owner's manual tests.

**Owner-reported manual acceptance on an Apple Silicon Mac:**

| Downloaded artifact                  | Owner's observed results                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Graider-0.1.0-mac-arm64-signed.dmg` | Downloaded and installed; launched normally without a Gatekeeper bypass. Independent `codesign --verify --strict --verbose=2` succeeded (`satisfies its Designated Requirement`). `xcrun stapler validate`: `The validate action worked!`. Downloaded-file SHA-256: `Graider-0.1.0-mac-arm64-signed.dmg: OK`.                                                                                            |
| `Graider-0.1.0-mac-arm64-signed.zip` | Extracted separately into a Desktop testing folder; app launched normally without a security bypass; GitHub OAuth succeeded. `codesign --verify --deep --strict --verbose=2` reported no verification errors. Stapler validation succeeded. `spctl --assess --type execute --verbose=4`: `accepted`, `source=Notarized Developer ID`. Downloaded-file SHA-256: `Graider-0.1.0-mac-arm64-signed.zip: OK`. |

The report does not separately document browser/Finder launch mechanics,
download-quarantine metadata/preservation, clean-host state, the owner's macOS
version, a DMG-specific OAuth test, or a manual bundled CLI/Git run. Do not infer
these from a normal launch or substitute synthetic quarantine for observed
download metadata. The automated isolated CLI/Git proof is credited separately.
Retain these evidence limits when reviewing the original clean-download checklist;
no additional owner results or individual digest values are assumed.
The original clean-download/Finder/quarantine requirement is not fully documented
by the supplied report. Reconcile those details with the owner before issue
closure; this does not demonstrate a need to rebuild or repeat signing.

**Current closeout blocker:** [#65](https://github.com/msoecsse/graider/issues/65)
prevents green required CI. At pre-closeout head
`ad75a0d0f47dd13966e7d4afbf79e26513029426`,
[CI 44206073153](https://github.com/msoecsse/graider/actions/runs/44206073153)
passed root/UI regression and all selected macOS arm64/Windows x64 jobs, including
migration and credential-free signing. Fast feedback failed the unchanged
high-severity picomatch audit (`GHSA-fc5q-39xc-vjpf`), making `CI required` fail.
The closeout commit must also receive green exact-SHA CI and restored native
unsigned NSIS validation before #54 closes. Keep the audit intact; remediation
belongs to #65. Historical green macOS CI cannot replace these gates or fill
unreported manual details.

Windows production signing remains intentionally deferred in
[#50](https://github.com/msoecsse/graider/issues/50) pending Microsoft identity/account
provisioning. Windows testing remains required. Public releases (3.3), channels
(3.4), auto-update and signed version-to-version validation (3.5), Schema v2
activation and overall production-release acceptance remain separate work.

### Phase 3.2B signing configuration

The separate `electron-builder.mac-production.cjs` and manual **macOS production
signing verification** workflow use the owner's personal Developer ID Application
identity. Existing unsigned archive-test, unpacked/RC1 and Windows paths retain
their behavior. The successful run and acceptance limits are recorded above.

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

Future credential rotation or demonstrated signing regressions require separately
authorized verification. The completed #54 signing run does not need a retry.

The wrapper captures the original user keychain search list before keychain
creation, then appends its private temporary keychain while preserving all
pre-existing entries and their order. In `finally` it restores that exact list
before attempting keychain deletion, including after creation, registration or
signing failure. An empty original list is restored with no path arguments.
Restoration failure is reported separately and fails closed; deletion and private
file cleanup are still attempted. The search list stays only in memory and is
never printed or persisted. It neither changes the default keychain nor persists
notarization credentials.
Cleanup runs on success/failure; workflow `always()` cleanup also covers normal
cancellation on the ephemeral runner. Forced runner termination ultimately relies
on GitHub-hosted runner destruction; use no persistent/self-hosted signing runner.

Builder 26 requests hardened runtime and only the `allow-jit` exception when
signing nested Electron/native code, then notarizes and staples the app before archive construction.
An `afterSign` gate independently checks the certificate fingerprint, Developer ID,
Team ID, hardened runtime and component-appropriate entitlements on every real Mach-O, including Dugite
executables/dylibs under `app.asar.unpacked`, plus the app's stapled ticket. Builder
creates the DMG; the wrapper explicitly signs it with the verified fingerprint,
temporary keychain and secure timestamp, then separately requires an Accepted DMG notarization result
and staples/validates it. ZIP itself cannot be stapled; it contains the stapled app.
No unsigned fallback is allowed. Actual runtime/entitlement compatibility remains
subject to native acceptance; do not relax entitlements just to pass packaging.

#### Historical signing investigations

The following investigations preserve evidence and uncertainty **as recorded at
each failed attempt**. Statements about pending acceptance or a next diagnostic
run are historical and superseded by the acceptance record above. They do not
authorize another signing run or describe today's signing status.

The first attempt at `0636ab0296e95a3baeb7e95642336f92406d29c0`
([run 43501894766](https://github.com/msoecsse/graider/actions/runs/43501894766))
failed in signing after preliminary checks/builds; discarded output prevents
recovery of its cause.

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
failure is demonstrated. This describes the evidence at that attempt; the later
[native entitlement investigation](#native-entitlement-policy-run-43667213149)
demonstrates a false rejection of absent library entitlements. Regression tests execute the installed lifecycle with
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

#### Actual DMG signing investigation (run 43556223888)

[Run 43556223888](https://github.com/msoecsse/graider/actions/runs/43556223888)
checked out `79cbf768dbe2e3ed799b96b0193ff411d80d9637`, completed builder, and
failed at `dmg-sign; category=command-exit-failure`. Cleanup passed and uploads
were skipped. The wrapper discarded native stderr, and the failed DMG was not
uploaded. That historical failure cannot establish a specific native cause.

Apple's [disk-image procedure](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)
specifies a Developer ID Application identity, `--timestamp`, an explicit unique
`-i` identifier, and UDZO for images made with third-party tools. The wrapper
already uses the verified Developer ID fingerprint, private keychain and secure
timestamp; it omits `-i`. Native credential-free UDZO fixtures sign and pass strict
verification both with and without `-i`. Thus omission alone is not demonstrated
to cause this failure; these ad hoc fixtures do not prove Developer ID behavior.
No signing arguments were changed in this investigation.

Tests execute installed dmg-builder 26.15.3's option computation and customization
settings generation: the production defaults select UDZO and HFS+, passed to the
vendor dmgbuild tool. This is evidence of the generator's configuration, not an
inspection of the unavailable failed production image. The wrapper now requires
native `hdiutil imageinfo -format` to report exactly UDZO before signing; other
formats fail at `dmg-format-inspection; category=unexpected-dmg-format`. A native
inspection failure at that commit reported recognized format/filesystem markers or
`image-inspection-failure` without exposing the response. The provenance gate below
now separates filesystem evidence from native inspection failure.

The native `codesign(1)` manual states that `--keychain` restricts identity lookup
to that keychain, while the normal search list is still used for certificate-chain
construction. At that commit the wrapper did not change the default keychain,
search list or trust settings; the reversible search-list correction below
supersedes that setup. An identity-query match does not by itself prove private-key
access. The same identity already signed the app in this run, which makes a
permanent global credential defect less likely but does not eliminate keychain,
trust, timing or timestamp failures. Apple's [timestamp guidance](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)
requires Internet access to its timestamp service; explicitly requesting a secure
timestamp can fail the signing operation. Timestamping remains mandatory.

Actual signing errors now use fixed native-marker categories at `dmg-sign` and
`dmg-preflight-sign`. Native output stays private in memory and is discarded:

| Condition reported by native tools                              | Safe category                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identity missing or ambiguous                                   | `identity-not-found`, `identity-ambiguous`                                                                                     |
| Unspecified missing Security/keychain item                      | `keychain-item-not-found`                                                                                                      |
| Key authorization/interaction denied or private key unavailable | `private-key-access-denied`, `private-key-unavailable`                                                                         |
| Invalid/missing keychain                                        | `keychain-unavailable`                                                                                                         |
| Certificate chain/trust/validity failure                        | `certificate-trust-failure`                                                                                                    |
| Timestamp failure                                               | `timestamp-service-failure`                                                                                                    |
| Existing image signature                                        | `already-signed-dmg`                                                                                                           |
| Invalid/unsupported image                                       | `invalid-or-unsupported-dmg`                                                                                                   |
| Filesystem access, missing file, space or I/O failure           | `filesystem-permission-denied`, `filesystem-read-only`, `filesystem-not-found`, `filesystem-no-space`, `filesystem-io-failure` |
| Disallowed metadata or missing identifier                       | `resource-fork-or-finder-info`, `identifier-required`                                                                          |
| Security subsystem internal error                               | `native-security-internal-error`                                                                                               |
| Unrecognized native failure                                     | `unrecognized-native-signing-error`                                                                                            |

Start/I/O failures and process termination retain their existing categories and
take precedence over stderr markers. `errSecInternalComponent` is deliberately
not translated into a claim about key permissions. Unknown errors remain unknown;
no raw output, paths, arguments, certificate details or credentials are printed.
Locale is fixed to C for native marker interpretation. Deterministic tests cover
all categories and redaction. Native macOS fixtures cover UDZO signing with/without
an identifier, strict integrity, duplicate-signing rejection, missing files and
an unavailable identity/keychain. Timestamp and private-key authorization errors
are simulated; no fixture uses real credentials or changes trust settings.

If actual signing fails, a diagnostic preflight creates a tiny private UDZO image
inside the existing mode-0700 signing directory and signs it using the same
identity, temporary keychain, basename and unchanged timestamp options. It independently
verifies that image's exact fingerprint and Developer ID/team requirements. A
fixed preflight result is appended to the original failure. Source/image files
remain private and are removed with the signing directory on every normal exit.
Preflight failures and cleanup failures cannot replace the original signing
failure. The failed Graider artifact is never retried, notarized or accepted.

A passing preflight proves that these credentials and timestamp options worked
for the disposable image at that moment. It points toward image-specific or
transient differences, but cannot rule out a transient timestamp/keychain problem
or other image-specific behavior. Matching preflight/actual failure
categories support a shared condition without proving its underlying cause.
Real signed/notarized artifacts and downloaded native acceptance remain pending;
#54 stays open. This investigation dispatches no production workflow or release.

#### Artifact provenance investigation (run 43560982686)

[Run 43560982686](https://github.com/msoecsse/graider/actions/runs/43560982686)
at `4f9d89ab738321950d552c291c07e49bde483385` returned zero from the builder
subprocess, then failed at `dmg-format-inspection; category=filesystem-not-found`.
The run has no uploaded artifacts. The wrapper discarded builder's returned
artifact list and suppressed stdout/stderr. Consequently the historical archive
names, locations and completion state cannot be recovered. A native “not found”
marker alone does not prove which filesystem object was unavailable.

Installed electron-builder/app-builder-lib/dmg-builder **26.15.3** evidence:

- `Platform.MAC.createTarget(["dmg", "zip"], Arch.arm64)` creates one explicit
  arm64 target map; installed target selection preserves it rather than using
  the base unpacked `dir` target.
- `Packager.doBuild` resolves `directories.output` against `projectDir`, which
  defaults to the working directory. The workflow runs the wrapper from `ui`.
  Therefore the configured output is `ui/release/macos-production`.
- Both `DmgTarget.build` and `ArchiveTarget.build` join their output directory
  with `PlatformPackager.expandArtifactNamePattern`. Precedence is target
  `artifactName`, macOS `artifactName`, global `artifactName`, then the default.
  Production has no target-specific naming override. Its explicit macOS pattern
  retains arm64 even when it is the default architecture and expands to the
  exact DMG/ZIP basenames listed below.
- Both targets emit `artifactBuildCompleted` with `file`, target and architecture.
  `Packager.emitArtifactBuildCompleted` also emits `artifactCreated`, collected
  into `artifactPaths`; the public `build` resolves to that list.
  A credential-free regression executes installed configuration loading, target
  selection, path expansion, target builds, completion emission and public
  result mapping with native packing/archive operations replaced. It reports
  both expected paths. It does not prove that the historical vendor subprocess
  created either archive.

**Proven defect:** no artifact completion or filesystem gate existed between
builder exit and native DMG operations. No deterministic naming, output-path or
target-selection defect was reproduced, so those rules are unchanged. The actual
cause of the historical native failure remains unknown.

The builder subprocess now consumes its returned artifact list and requires both
expected paths and nonempty regular files. Only exact fixed diagnostics cross the
private pipe. Missing completion evidence fails closed even on a zero subprocess
exit, preventing an incomplete build from passing via stale files. The wrapper
independently uses `lstat` on both expected archives before `hdiutil` or DMG
`codesign`; symlinks, directories and empty files fail. It never searches for or
substitutes a different archive.

Builder stages `builder-artifact-dmg` / `builder-artifact-zip` distinguish
`missing-artifact`, `unexpected-artifact-filename`,
`unexpected-output-directory`, `invalid-artifact-result`,
`artifact-not-regular-file`, `empty-artifact`, and
`artifact-filesystem-failure`. If directory and filename both differ, directory
takes precedence. The wrapper's independent `artifact-validation-dmg` /
`artifact-validation-zip` gates use the filesystem categories. An exact private
`builder-artifacts; category=validated` completion record is required; absent or
malformed completion reports `missing-completion-evidence`. A subsequent nonzero
`hdiutil` exit reports `dmg-format-inspection; category=image-inspection-failure`;
start/I/O and termination categories remain distinct. No diagnostic exposes
paths, filenames supplied by subprocesses, raw output or credentials.

The builder entry point, production/base configs and UI lockfile are identical at
`79cbf768dbe2e3ed799b96b0193ff411d80d9637` and `4f9d89a`. Thus an unavailable
archive could plausibly explain the earlier `dmg-sign; category=command-exit-failure`
in [run 43556223888](https://github.com/msoecsse/graider/actions/runs/43556223888).
It is a hypothesis, not a demonstrated shared root cause: that run also retained
neither the archive list nor native error. No certificate, keychain, signing
argument, notarization or acceptance check changes are justified by this evidence.

#### Builder lifecycle investigation (run 43564657085)

[Run 43564657085](https://github.com/msoecsse/graider/actions/runs/43564657085)
checked out `202e1206fc8f17471a03cadf672ff0970433fe27`. The builder returned
zero without the exact FD3 completion record. The old worker wrote records only
after `await builder.build()` resolved or rejected. Its logs cannot distinguish
an unresolved promise at event-loop quiescence, explicit termination, or a lost
record. The elapsed time establishes none of those causes.

Real Node 24 subprocess tests independently verify the original four-descriptor
`spawnSync` arrangement: child `fs.writeSync(3, record)` reaches parent
`result.output[3]` exactly for both fixed success and failure records. Another real
subprocess reproduces a pending promise with no handles exiting zero before its
continuation runs. An awaited promise alone does not keep Node alive; see
[Node's beforeExit contract](https://nodejs.org/docs/latest-v24.x/api/process.html#event-beforeexit).
The worker now guards this demonstrated lifecycle hole: guarded synchronous
`beforeExit` and `exit` observations produce a fixed failure and nonzero status.
It schedules no keepalive or retry. `uncaughtExceptionMonitor` observes fatal
exceptions without replacing Node's default handling. An exit without the
quiescence observation is classified as premature, not necessarily an explicit
`process.exit` call. Signals and start/I/O failures retain their parent categories.

FD3 still carries one exact terminal record. An independent FD4 observation pipe
reports only allowlisted stage/category identifiers: stage entry, promise
resolution/rejection, artifact completion hooks, validation, record write attempts
and results, and process exit. This separation can distinguish a successful FD3
write followed by a missing parent record. Missing, truncated or malformed
observation streams are discarded as a whole. Neither observations nor a zero
exit can establish success; the resolved builder result, exact expected filenames
and directories, nonempty regular DMG/ZIP files, and exact FD3 success record
remain mandatory. Error objects, native output, paths, arguments, certificate
information and credentials never cross either diagnostic channel.

Credential-free local probes with installed electron-builder **26.15.3** completed
real app packaging, DMG and ZIP creation, including the default Electron download
and extraction path. `builder.build()` resolved in those probes. A permanent
native macOS integration test runs the actual worker against an isolated unsigned
fixture through builder's default Electron download/extraction path, observing both real artifact hooks,
the resolved promise and exact FD3 success. It performs no signing/notarization
and uses no credentials. The subprocess regression also covers rejection,
explicit exit, uncaught exception, missing/empty artifacts, closed pipes,
malformed observations and wrapper acceptance. These probes do not reproduce the
historical stall or establish its internal root cause. No speculative builder,
signing, certificate or notarization change is justified by the evidence.

The next investigation should use the exact-SHA credential-free macOS CI evidence
and review these fixed observations before any separately owner-authorized
production attempt. No production workflow is dispatched by this investigation;
#54 stays open and signed/downloaded native acceptance remains pending.

#### Application-signing rejection investigation (run 43568638747)

[Run 43568638747](https://github.com/msoecsse/graider/actions/runs/43568638747)
used `0811d91153107d9404f7e7455cc5251c3f76cb38`. Its builder promise rejected
in application signing, and the failure record was written and received. It did
not reach app notarization, DMG creation or archive acceptance. The two old
application-sign stage entries were afterPack and the actual custom signing
callback, respectively; they were not evidence of two signer calls.

Installed electron-builder/app-builder-lib **26.15.3**:

- MacPackager obtains CSC_KEYCHAIN without importing another certificate when no
  CSC link is supplied. Identity selection queries the explicit temporary keychain
  and matches the configured fingerprint. The wrapper already requires its
  Developer ID Application identity and Team ID, unlocks the keychain and sets
  its private-key partition list. Identity discovery does not prove key access.
- MacTargetHelper.buildSignOptions supplies a fingerprint **string**, keychain,
  identityValidation=false, strict verification, disabled automatic entitlements,
  and per-file options to the custom callback. This is a supported osx-sign input:
  its Identity wrapper uses that string directly. The default builder signer uses
  the identity name instead; a fingerprint is not a demonstrated callback defect.
- macCodeSign.sign imports osx-sign.signAsync and retries three times after the
  initial attempt, with 5/10/15-second delays. The custom callback awaits this
  exact operation without altering options or retry behavior.
- osx-sign validates the app/options, walks nested binary files and app/framework
  bundles, and signs deeper children before the main app. Explicit extra binaries
  are also signed. Every nonignored target receives the configured JIT entitlement
  plist and hardened runtime. No timestamp override is configured, so osx-sign
  passes --timestamp on each signing command. It then performs deep strict
  verification and displays the app entitlements before resolving. A rejection
  can therefore originate in validation, traversal, signing or these final checks.
- osx-sign rejects execFile's Error without separately attaching captured native
  output; Node includes native stderr in that Error's message. Classifying only
  an error.stderr field would miss this installed implementation's failures.

The callback, signing options, entitlements, lockfile, keychain preparation and
identity selection at that failed SHA match
[run 43556223888](https://github.com/msoecsse/graider/actions/runs/43556223888)
at `79cbf768dbe2e3ed799b96b0193ff411d80d9637`, which reached the outer DMG
signing command. Later changes added artifact/lifecycle evidence and a C locale.
There is no demonstrated deterministic configuration or callback-contract defect
causing the latest rejection. No credentials, trust, timestamp or notarization
workaround is justified.

The callback now records signing-call-entered/resolved/rejected on FD4 at the
actual awaited call. afterPack instead records builder-sign-prepare. Rejection
inspects only data fields in memory and retains one tested, fixed FD3 category:
identity-not-found/ambiguous, private-key-access-denied/unavailable,
keychain-unavailable, certificate-trust-failure, timestamp-service-failure,
entitlements-failure, signing-configuration-failure, signing-target-missing/invalid,
filesystem-permission-denied/read-only/no-space/io-failure,
resource-fork-or-finder-info, or native-security-internal-error. Structural
fallbacks distinguish signing-command-start-or-io-failure, signing-command-terminated,
signing-command-exit-failure, signing-filesystem-failure and unknown-signing-rejection.
The implementation's explicit allowlist defines the exact spellings.
The vendor exception is replaced by a fixed error without its cause or fields.
Neither diagnostic pipe carries raw exceptions, native output, command arguments,
paths, certificate details or credentials; malformed streams remain rejected.

Credential-free native tests execute installed signing on disposable app, Node,
Dugite Git and dylib copies using ad hoc signing. They reproduce missing app and
additional-binary targets, unreadable entitlements and unavailable identity.
One real worker subprocess preserves all installed retry delays and verifies the
classified rejection and signing lifecycle markers reach FD3/FD4. Other native
probes remove retry delays only. These establish diagnostic behavior, not
Developer ID, private-key, timestamp-service or production acceptance.

**Still unproven:** the underlying native failure in run 43568638747. Key access,
trust, timestamp availability and production-specific target/configuration
problems remain hypotheses. The next separately authorized production run will
distinguish preparation failure from actual signer entry, resolution or rejection,
and report a recognized failure family after the installed retries, or an explicit
unknown rejection. errSecInternalComponent remains ambiguous and does not prove
an ACL problem. No target path or subprocess output is retained, and a category
alone cannot establish a specific nested target or exact root cause.
All existing signing, cleanup, notarization, archive and native acceptance gates
remain mandatory. This investigation dispatches no production run; #54 stays open.

#### Identity lookup versus native signing (run 43606279210)

[Run 43606279210](https://github.com/msoecsse/graider/actions/runs/43606279210)
at `850010b8701a118a33d6bfb8177917ea16c40c82` passed the wrapper's explicit
temporary-keychain identity/fingerprint/Team ID check, entered the application
signing callback and rejected with the old `identity-not-found` category. That
classifier also matched generic `errSecItemNotFound` / “specified item could not
be found in the keychain” messages. Those messages do not identify the missing
item and cannot establish certificate absence. Both application and DMG classifiers
now report them as `keychain-item-not-found`; explicit “no identity found” remains
distinct. Previously discarded native text cannot be reconstructed from the old
category, so this fixes a demonstrated diagnostic ambiguity, not a proven native
signing defect.

Installed `app-builder-lib` **26.15.3** selects the identity before calling the
custom signer: `MacPackager.sign` reads `CSC_KEYCHAIN`, `findSigningIdentity` uses
the configured SHA-1 qualifier and both `security find-identity` queries receive
that keychain. `buildSignOptions` passes the selected hash, keychain and
`identityValidation: false` to `@electron/osx-sign` **1.3.3** through the installed
retry helper. Therefore osx-sign bypasses its own discovery and “No identity found
for signing” branch in this production path. Its nested-file and top-level bundle
`codesign --sign` calls all carry that identity, `--keychain`, `--force`, mandatory
timestamp, hardened runtime and configured entitlements. Its subsequent strict
verification and entitlement-display commands do not sign or select an identity.
Credential-free tests execute these installed implementations, distinguish a
discovery rejection before any codesign call from a native signing rejection,
and assert every signing call's options. No omitted keychain/fingerprint was found.

Earlier [run 43550080038](https://github.com/msoecsse/graider/actions/runs/43550080038)
at `fd2bfb329609092c6b88257d4f66ed7bbed8b223` reached outer DMG verification;
[run 43556223888](https://github.com/msoecsse/graider/actions/runs/43556223888)
at `79cbf768dbe2e3ed799b96b0193ff411d80d9637` reached outer DMG signing. Their
application signing, notarization/stapling and after-sign verification gates had
resolved. Both used Node 24.22.2, as did the latest run. The locked dependencies,
identity configuration and effective application-signing options are unchanged;
later callback changes added observations/error classification. Historical logs
do not establish identical credential material, native state or service
availability. This comparison alone did not justify a search-list, trust, certificate or
production signing-argument change; the search-list discrepancy is tested by the
focused correction below.

After the existing identity query/match and before starting builder, a mandatory
preflight exclusively creates a copy of the running arm64 Node Mach-O executable
inside the existing private signing directory. It signs that disposable file
using the already imported certificate's SHA-1, the same temporary keychain,
`--force`, `--timestamp`, runtime and production JIT entitlements. The unchanged
runtime verifier requires strict integrity, the exact leaf certificate, expected
Developer ID/Team ID, runtime and the single allowed entitlement; an additional
native display inspection requires a secure `Timestamp`, rejecting local
`Signed Time` or no timestamp. The source executable and packaged artifacts are
never modified. The private copy is removed by the existing cleanup on success
or failure. Ad hoc fixture signing must fail the real Developer ID verifier.

Only fixed results are reported:

| Operation                                               | Fixed stage/result                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Identity query failed or certificate/team did not match | Existing `identity-query` command categories or `identity-match; category=identity-mismatch`                       |
| Disposable executable could not be prepared             | `app-preflight-prepare; category=filesystem-failure`                                                               |
| Actual signing failed                                   | `app-preflight-sign` with application-signing native categories; command start/I/O or termination takes precedence |
| Signature/identity/runtime/entitlements failed          | `app-preflight-verification; category=verification-failure`                                                        |
| Timestamp inspection failed or secure timestamp missing | `app-preflight-timestamp` with command failure categories or `verification-failure`                                |
| All preflight gates passed                              | `stage=app-preflight-verification; category=passed`                                                                |

No native output, paths, certificate details or secrets are emitted. Any preflight
failure stops before builder, notarization, archives or checksums; cleanup still
runs independently. Success cannot bypass the subsequent production gates.
The next separately owner-authorized run will establish whether lookup succeeds,
whether that identity can actually sign a disposable executable with these
options at that moment, and whether verification including timestamp succeeds.
If preflight passes but the app signer rejects, the new fixed category separates
the generic missing-item case from explicit identity-selection evidence. It will
not identify a nested target, a specific missing item, or a transient native cause.
Real Developer ID preflight success and production acceptance remain unproven;
no production workflow is dispatched by this investigation. Keep #54 open.

#### Disposable application-signing diagnostics (run 43609769054)

[Run 43609769054](https://github.com/msoecsse/graider/actions/runs/43609769054)
at `52bde19f7342b029e6f75f9c86407535a689778c` failed at
`app-preflight-sign; category=command-exit-failure`. The wrapper bypassed the
existing application-signing classifier at that stage and discarded native
stderr. The historical native cause cannot be recovered from this category.

Nonzero preflight signing exits now reuse `mac-app-signing.cjs`: only stderr and
exit status are inspected inside the trusted wrapper. The existing fixed
allowlist distinguishes missing keychain items, explicit identity-selection
failure, private-key access, timestamp service, certificate trust and other
recognized native markers. An unrecognized nonzero exit retains
`signing-command-exit-failure`; missing exit evidence retains
`unknown-signing-rejection`. Command start/I/O and termination keep their existing
categories and take precedence. Raw output, native Error objects, arguments,
paths, certificate details and credentials are never included in diagnostics.

Comparison with installed `@electron/osx-sign` **1.3.3** confirms the same signing
arguments: fingerprint, `--force`, explicit temporary `--keychain`, `--timestamp`,
`--options runtime` and the production entitlements plist. No demonstrated
argument incompatibility was found; signing behavior is unchanged. A disposable
Node executable does not exercise the application's nested targets, traversal,
installed signer retries or later notarization/archive gates.

The next separately authorized diagnostic run can establish a recognized native
failure family for this preflight, or an explicit unknown/command-exit result.
If all preflight gates pass, it establishes that this identity signed and verified
that disposable executable with the required runtime, entitlements and secure
timestamp at that moment. A category alone does not identify a specific missing
item, prove an ACL defect, locate a failing app target or establish the underlying
root cause. It cannot establish signed/notarized production archive acceptance.
No certificate, keychain search list, identity or notarization changes are made;
#54 remains open and this correction dispatches no production signing.

#### Temporary keychain search-list correction (run 43610967706)

[Run 43610967706](https://github.com/msoecsse/graider/actions/runs/43610967706)
at `994843f1a7549cb1005c2247ebfcfe102e696951` passed certificate import,
partition-list configuration and the explicit identity match, but actual signing
of the disposable Mach-O failed at
`app-preflight-sign; category=keychain-item-not-found`. This category does not
identify the missing item or prove a private-key access or certificate defect.

The native Apple `codesign(1)` manual's `--keychain` and **SIGNING IDENTITIES**
sections state that the user's search list remains relevant even with an explicit
keychain, including for certificate-chain construction. The wrapper previously
never registered its private temporary keychain. This is a documented setup
discrepancy worth correcting, not an established root cause of the failed run.
The correction captures `security list-keychains -d user` privately before
creation and uses argv arrays to append the existing temporary keychain after
partition-list setup, before identity validation and preflight. Parsing follows
[Apple's raw quoted-line output](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/keychain_list.c),
preserving spaces, quotes, backslashes and order without shell evaluation.
Malformed output fails before keychain creation; it is never partially accepted.

Setup failures use `keychain-search-list-query` or
`keychain-search-list-register` with fixed command categories; malformed output
uses `keychain-search-list-parse; category=invalid-response`. Restoration runs as
`cleanup-keychain-search-list` in `finally` before deletion, even if creation or
registration partially changed native state before failing. Only fixed safe
categories are reported. Restoration-only failure fails the command; simultaneous
signing and cleanup failures retain the original failure and independent cleanup
diagnostics. Tests cover empty/populated lists, exact ordered restoration,
partial mutation, native command failures, cleanup ordering and output suppression.
The exact SHA-1 and explicit `--keychain` remain on every signing operation;
certificate material, private-key access policy, default keychain, trust settings,
timestamp requirements and notarization configuration are unchanged.

Historical [run 43550080038](https://github.com/msoecsse/graider/actions/runs/43550080038)
at `fd2bfb329609092c6b88257d4f66ed7bbed8b223` reached DMG signature verification;
[run 43556223888](https://github.com/msoecsse/graider/actions/runs/43556223888)
at `79cbf768dbe2e3ed799b96b0193ff411d80d9637` reached DMG signing. Rechecked logs
and wrappers confirm that application signing/notarization and after-sign checks
resolved with the same search-list omission. Those runs therefore do not prove
that omission explains the later failure. Historical credentials, native search
lists, intermediate-certificate availability and service state cannot be assumed
identical. Credential-free tests prove wrapper sequencing and restoration, not
that this correction resolves real Developer ID signing. No production workflow
is dispatched or release acceptance claimed; #54 stays open pending real signing,
notarization and downloaded/quarantined native DMG and ZIP acceptance.

For subsequent #54 diagnostic slices, validate new/modified and directly affected
signing/packaging tests locally, plus applicable hygiene, lint, formatting and
typechecks; retain passed results when their inputs are unchanged. Do not run
complete root/UI, unrelated migration or Windows suites locally. Commit and push
after focused checks pass; report comprehensive exact-SHA CI status without
waiting for it after each diagnostic commit. Comprehensive exact-SHA CI on all
applicable platforms is required before release acceptance. Diagnostic commits
are not release acceptance and do not authorize production signing dispatch.

#### Application verification investigation (run 43613762829)

[Run 43613762829](https://github.com/msoecsse/graider/actions/runs/43613762829)
at `7120b27284499b5ddc0e548236c377f985205ebc` passed the disposable Developer ID
preflight and resolved the installed application signer. It entered
`builder-app-notarize-staple`, then `builder-app-verification`, which rejected with
the generic `verification-failure`. The failed gate and native cause cannot be
recovered from discarded output. Entering verification alone does not establish
notarization acceptance or a valid stapled ticket.

Reinspection of installed app-builder-lib **26.15.3** confirms that
`MacPackager.sign` awaits `MacTargetHelper.notarizeIfProvided` before
`PlatformPackager.doSignAfterPack` emits `afterSign`. That helper can return
without notarizing when options are disabled or credentials cannot be generated.
When invoked, installed `@electron/notarize` awaits accepted notarization and
stapling. Deterministic tests execute the installed success, rejected-notarization,
rejected-stapling and missing-authentication paths: missing authentication can
reach `afterSign`, where the independent ticket gate must still reject an
unstapled app. No historical skip or notarization success is inferred here.

The fixed terminal stage remains `builder-app-verification`. At `6656882`, its allowlisted
categories identified the independent operation that rejected (the entitlement
categories are superseded by the component policy below):

| Gate                                                                        | Category                      |
| --------------------------------------------------------------------------- | ----------------------------- |
| Main app strict signature and exact leaf certificate requirement            | `main-signature-failure`      |
| Main app Developer ID authority and exact TeamIdentifier                    | `main-identity-failure`       |
| Main app hardened runtime                                                   | `main-runtime-failure`        |
| Main app XML/plutil parsing and exactly the required JIT entitlement        | `main-entitlements-failure`   |
| Deep strict signature verification                                          | `deep-signature-failure`      |
| Recursive Mach-O inventory, including filesystem inspection                 | `native-inventory-failure`    |
| Required native Dugite payload presence                                     | `dugite-payload-missing`      |
| Every native executable/dylib's strict signature and exact leaf requirement | `native-signature-failure`    |
| Every native executable/dylib's Developer ID authority and TeamIdentifier   | `native-identity-failure`     |
| Every native executable/dylib's hardened runtime                            | `native-runtime-failure`      |
| Every native executable/dylib's exact required entitlements                 | `native-entitlements-failure` |
| Independent app stapled-ticket validation                                   | `stapled-ticket-failure`      |

These identify failing gates, not native root causes. For example, the signature
gate's combined strict/certificate command cannot alone distinguish damaged code
from a certificate mismatch. Only locally registered verifier errors carry a
category through builder; forged messages/properties remain the generic failure.
Native output, exception details, executable paths, certificate information and
credentials remain private. Every previous acceptance check and its ordering is
preserved; failure prevents archives. Focused tests inject each gate failure,
including extensionless Dugite code, malformed entitlements and ticket validation,
and verify safe propagation through the worker and parent pipe.

Historical comparisons distinguish passing app verification from passing a whole
production workflow; none of the listed workflows completed successfully:

| Run                                                                         | Observed result after app verification           | Signing-step elapsed time (approximately) |
| --------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| [43532058480](https://github.com/msoecsse/graider/actions/runs/43532058480) | Builder completed; outer DMG verification failed | 52 seconds                                |
| [43550080038](https://github.com/msoecsse/graider/actions/runs/43550080038) | Builder completed; outer DMG verification failed | 65 seconds                                |
| [43556223888](https://github.com/msoecsse/graider/actions/runs/43556223888) | Builder completed; explicit DMG signing failed   | 59 seconds                                |
| [43610967706](https://github.com/msoecsse/graider/actions/runs/43610967706) | Disposable app signing failed before builder     | Under 1 second                            |
| [43613762829](https://github.com/msoecsse/graider/actions/runs/43613762829) | App verification failed inside builder           | 31 minutes 27 seconds                     |

The historical app/native/ticket requirements match the current requirements;
later DMG verifier changes do not explain this app failure. Credentials, service
state and actual produced apps cannot be assumed identical across runs.

In 43613762829 the disposable preflight passed at **16:10:14 UTC** and the parent
rendered builder failure at **16:41:40 UTC**. Parent `spawnSync` buffers stdout,
stderr, FD3 and FD4 until child exit; all lifecycle observations consequently
share the final log time. The 31-minute gap cannot locate the delay in packing,
signing, notarization/stapling or verification, nor establish a hang.

Safe bounded duration reporting now uses monotonic time at existing stage
transitions/settlement and writes only fixed FD4 categories:
`stage-duration-under-1m`, `stage-duration-1m-to-5m`, `stage-duration-5m-to-15m`,
`stage-duration-15m-to-30m`, `stage-duration-30m-or-more`. No timer or handle is
added, preserving pending-promise exit detection. On failure the parent renders
these observations only after validating the entire newline-terminated stream,
with a maximum of 128 records. Malformed, truncated or excessive streams are
discarded in full. FD3 still requires its single exact terminal record; durations
cannot establish completion. Real subprocess tests retain closed-pipe, pending
promise, explicit-exit and output-suppression coverage.

This is post-exit stage timing, not live progress. Live reporting is technically
possible with a narrowly scoped asynchronous builder invocation and bounded pipe
parsing, but emitting records before whole-stream validation would change the
current integrity contract. No demonstrated subprocess transport defect warrants
that rewrite. No keepalive, timeout, retry, signing identity, credential, trust,
notarization or verification requirement is changed.

For the next separately owner-authorized attempt, first require exact-SHA CI for
the diagnostic commit. Preserve the exact terminal gate category and complete
validated duration/lifecycle observations to locate the slow stage and failed
requirement. A passing preflight or entered notarization/verification stage is
insufficient. Require all real signature, ticket, DMG notarization/stapling and
both installed CLI/Dugite proofs, then the downloaded/quarantined DMG **and** ZIP
Finder acceptance below. This change dispatches no production workflow and makes
no release acceptance claim; #54 remains open.

#### Native entitlement policy (run 43667213149)

[Run 43667213149](https://github.com/msoecsse/graider/actions/runs/43667213149)
at `6656882f322c78df4ed401359294a717badb6660`, on macOS **15.8.2**, rejected
`native-entitlements-failure` after the main-app checks, deep verification,
inventory and Dugite-presence gates. The failing file and native result were not
retained; stapled-ticket validation was not reached. It is not possible to prove
which native file failed or whether that result was empty, malformed, unexpected,
or a command failure from the old category alone.

Reinspection of installed app-builder-lib **26.15.3** `MacTargetHelper.getOptionsForFile`
and `@electron/osx-sign` `signApplication` confirms that Graider's main/inherit
plist and runtime option are passed to native signing commands. Neither adds
`--force-library-entitlements`. Passing a plist does not guarantee identical
stored entitlements on every component. Apple's
[Hardened Runtime contract](https://developer.apple.com/documentation/security/hardened-runtime)
assigns entitlements to executable processes; frameworks, libraries and in-process
plug-ins use their host's permissions. Apple's
[distribution signing procedure](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac)
specifically advises against applying entitlements to library code and documents
`file` classification and explicit XML entitlement extraction. The signing
configuration therefore stays unchanged; forcing library JIT permissions would
encode the verifier's incorrect assumption into signing.

The proven defect is the verifier's universal exactly-JIT requirement: a signed,
hardened library with no entitlement data is valid for this policy but was always
rejected. Disposable credential-free native fixtures reproduce that false rejection
using real Dugite executable/dylib copies, a library in framework layout and a V8
executable in helper layout. They also check native strict integrity, XML extraction
and continued missing-JIT rejection for the helper. Local macOS **14.7.6** retains
JIT when explicitly supplied even to a dylib; the absent-entitlement fixture omits
the plist deliberately. It proves the policy defect, not production's exact
signing output or Developer ID/notarization acceptance. The older local probe
which supplied JIT to a library could not test this absence case.

The independent verifier now uses native `file --brief` under the C locale to
classify actual Mach-O code; an extension or directory name alone cannot classify
an executable as a library. Unrecognized kinds and unrecognized universal slices
fail closed. All described slices are considered; any executable slice requires
the executable policy.

| Component                                                                                         | Entitlement requirement                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Main Electron app, its executable/Node CLI mode, all Electron helpers, and other executable code  | Exactly `com.apple.security.cs.allow-jit: true`                                                                                     |
| Bundled Dugite Git tools and the versioned Electron framework's `Helpers/chrome_crashpad_handler` | No entitlement data or an empty dictionary is allowed; if present, only `allow-jit: true` is accepted, matching the existing signer |
| Mach-O shared libraries, framework libraries and in-process bundles                               | Same bounded optional-JIT policy; their host provides runtime permissions                                                           |

Every component still requires strict integrity, the exact Developer ID leaf
fingerprint, expected Developer ID authority and Team ID, and the runtime flag.
The main app, deep verification, recursive native inventory, Dugite-presence and
stapled-ticket gates remain mandatory. DMG signing, notarization/stapling,
Gatekeeper, installed CLI/Dugite and downloaded/quarantined Finder acceptance
requirements remain unchanged. No unsigned/ad-hoc fallback is introduced.

Entitlements are extracted with `codesign --display --entitlements - --xml`;
only stdout is parsed, never stderr. Successful empty output is accepted only
where the table permits it. Nonempty data must parse through `plutil` to a
dictionary. False/string JIT values, additional keys (including debugging, unsigned
memory or disabled library validation) and malformed data are rejected everywhere.
The terminal stage remains `builder-app-verification` with these fixed categories:

| Failure                                                                                                    | Category (`main` or `native` prefix)       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Required entitlement data absent or dictionary empty                                                       | `<prefix>-entitlements-missing-failure`    |
| Invalid plist/JSON or non-dictionary result                                                                | `<prefix>-entitlements-malformed-failure`  |
| Additional permission or incorrect JIT value                                                               | `<prefix>-entitlements-unexpected-failure` |
| Inspection nonzero exit, command start/I/O failure or termination; parser start/I/O failure or termination | `<prefix>-entitlements-command-failure`    |
| Native kind cannot be inspected/classified                                                                 | `native-kind-failure`                      |

Only locally registered errors carry these categories through the worker and
parent; output, paths, certificate details, credentials and caught exceptions
remain suppressed. Tests cover optional absence, mandatory JIT, malformed and
extra permissions on executables and libraries, command failures, role/format
classification and exact safe diagnostic propagation. This investigation dispatches
no production signing and claims no release acceptance. #54 remains open.

### Windows CI restoration (#54)

The diagnostic branch-push pause is historical. The current change-aware
`ci.yml` already includes macOS arm64 and Windows x64 in every selected Apply,
grading, security/recovery, credential-free signing and migration matrix, with
no #54 branch exclusion. Run 44206073153 confirms both platforms executed at
`ad75a0d0f47dd13966e7d4afbf79e26513029426`.

This acceptance follow-up restores the two remaining exclusions:
`remote-course-v2` is again in the scoped unsigned NSIS workflow push list, and
`windowsInstallerConfig.test.ts` is again in the production macOS workflow's
credential-free test command. Existing master/release/PR coverage, unsigned
packaging, audit gates and protected manual signing behavior are preserved.
Regression assertions cover both restorations and the main-CI native matrices.
Native unsigned NSIS install/reinstall/uninstall and bundled Git must pass at the
closeout SHA alongside required main CI; restoring configuration alone is not
acceptance. Windows production signing remains deferred under #50.

### Signed archive outputs and acceptance checklist

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

Retain this original #54 checklist for reviewing the supplied acceptance record
and future signed builds. Unreported details remain unverified. Record the signed workflow run, archive checksums and
green normal/native cross-platform CI at the exact commit.
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
- macOS signing/notarization and owner-reported downloaded DMG/ZIP acceptance
  succeeded; #54 remains open for current exact-SHA CI closeout. See the
  [acceptance record and manual evidence limits](#macos-signing-acceptance-record-54).
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
