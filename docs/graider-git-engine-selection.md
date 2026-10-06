# Graider bundled Git engine selection

**Status:** Selected; Phase 1.2B packaged macOS arm64 and Windows x64 private-transport proofs are
complete, production cutover remains incomplete

**Decision date:** 2026-10-04

**Selected candidate:** Dugite 3.2.3 with dugite-native 2.53.0-4 / Git 2.53.0

**Evidence legend:**

- **Spike verified** means the executable proof in `tests/spikes/git-engine` passed locally.
- **Upstream verified** means the statement follows from linked versioned upstream documentation or
  source.
- **Not yet verified** names work that must be run in Phase 1.2B; it is not an acceptance claim.

## 1. Requirements derived from the semantic contract

The completed `GitWorkspace` contract, rather than a clone/commit/push demo, is the selection
requirement. A viable engine must support or privately emulate:

- embedded-engine availability, repository detection/opening, canonical roots, default and
  no-checkout clone;
- attached, detached, and unborn HEAD; porcelain-quality staged/unstaged/untracked/conflicted and
  path-limited status; upstream and ahead/behind/diverged state; remote URL/default branch;
- exact revision and remote-branch resolution, bounded logs, recursive trees with mode/type/object
  ID, exact tree IDs, and first-parent commit/tree history;
- exact-path stage, normal and allow-empty commit, explicit branch create/reset/switch/delete,
  detached checkout, non-force upstream and `HEAD`-to-branch pushes, and remote branch deletion;
- binary-safe `diff --binary --full-index`, three-way indexed patch application, typed conflict
  classification, additions, deletions, executable modes, binary updates, preservation of unrelated
  student edits, and disposable `reset --hard` plus untracked cleanup; and
- operation-scoped private-GitHub credentials with no argv/config/URL persistence, prompting, ambient
  helper fallback, or secret-bearing public errors.

The selected engine must read and write ordinary `.git` repositories. Graider must not own a new
repository format or weaken the template-update behavior already proven with canonical Git.

## 2. Candidate comparison

| Criterion                               | Dugite 3.2.3                                               | isomorphic-git 1.43.0                                                    | NodeGit 0.27.0                                                                         |
| --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Maintenance                             | Active release on 2026-08-11; updated to Git 2.53.0        | Active release on 2026-10-03                                             | Latest release remains 2020-07-28                                                      |
| Node 24                                 | JS wrapper requires Node 20+; spike passed on Node 24.21.0 | Declares Node 14.17+; isolated probe ran                                 | Last release supplied Node 14 prebuilds; no credible Node 24/Electron support evidence |
| macOS arm64 / Windows x64               | Versioned payload manifest contains both                   | Pure JS, platform-neutral                                                | Obsolete native ABI/prebuild and signing risk                                          |
| Canonical Git semantics                 | Executes packaged canonical Git 2.53.0                     | Reimplements selected Git behavior                                       | libgit2 binding, but obsolete release line                                             |
| Binary diff and three-way indexed apply | Native canonical commands; spike passed                    | No public diff/apply commands; merge is not the required patch operation | No prototype justified given maintenance blocker                                       |
| Packaging cost                          | Large platform payload and executable unpack/sign work     | About 4.8 MiB package before dependencies; no executable                 | Native addon rebuild/signing complexity                                                |
| Selection                               | **Selected**                                               | Rejected for this contract                                               | Rejected before prototype                                                              |

Version and maintenance evidence comes from the [Dugite 3.2.3 release](https://github.com/desktop/dugite/releases/tag/v3.2.3),
the [dugite-native 2.53.0-4 release](https://github.com/desktop/dugite-native/releases/tag/v2.53.0-4),
the [isomorphic-git 1.43.0 release](https://github.com/isomorphic-git/isomorphic-git/releases/tag/v1.43.0),
and [NodeGit's release list](https://github.com/nodegit/nodegit/releases).

## 3. Dugite maintenance, installation, and platform evidence

**Upstream verified:** Dugite 3.2.3 is MIT-licensed, requires Node 20 or newer, and runs
`script/download-git.js` at postinstall. The npm package itself contains the wrapper and downloader;
postinstall selects a platform/architecture archive, verifies its SHA-256 checksum, and extracts it
to `node_modules/dugite/git`. See its versioned
[`package.json`](https://github.com/desktop/dugite/blob/v3.2.3/package.json),
[`download-git.js`](https://github.com/desktop/dugite/blob/v3.2.3/script/download-git.js), and
[`embedded-git.json`](https://github.com/desktop/dugite/blob/v3.2.3/script/embedded-git.json).

The 3.2.3 manifest includes `darwin-arm64` and `win32-x64` archives from dugite-native 2.53.0-4.
That release carries Git 2.53.0, Git for Windows 2.53.0.windows.4, Git LFS 3.7.1, and Git
Credential Manager 2.9.0.
The toolchain also bundles Git LFS. Updating Dugite updates a versioned, checksummed Git payload;
Graider must monitor both Dugite and dugite-native/Git security releases.

**Spike verified on macOS arm64:** `resolveGitBinary()` returned
`node_modules/dugite/git/bin/git`; its Mach-O header and `file`/`lipo` inspection identify arm64, and
the executable reports Git 2.53.0. All candidate operations passed an empty `PATH`, yet executed
successfully. The spawned executable's real path matched the resolved packaged binary. This is a
bundled Git executable, not a faculty/system-installed Git executable.

The root package pins Dugite as a `devDependency` and allows its install script for the Phase 1.2A
spike. Phase 1.2B-1 also pins the same version in the Electron application's runtime dependency
graph solely so the packaged proof can load the real application dependency. Production remains on
`SystemGitWorkspace`. Eliminated candidates were not added to the repository; the isomorphic-git
probe used an isolated temporary install.

## 4. Executable semantic evidence

The deterministic spike uses temporary directories whose names and repository paths contain spaces.
Except for a separately labeled interoperability case, every candidate child receives `PATH=""`.
No operation uses a shell or interpolated command string.

| Gate                                                         | Result                                                                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedded resolution / execution                              | **Spike verified:** resolved and spawned Dugite's package binary with empty `PATH`                                                                               |
| Native architecture                                          | **Spike verified:** Mach-O CPU type is arm64 on the local host                                                                                                   |
| Normal and no-checkout clone                                 | **Spike verified** with local bare remotes and space-containing paths                                                                                            |
| Status / detached HEAD / branch create-reset-switch          | **Spike verified** using the same porcelain/ref operations as `SystemGitWorkspace`                                                                               |
| Commit / allow-empty / first-parent log / recursive tree     | **Spike verified**                                                                                                                                               |
| Remote default branch                                        | **Spike verified** through `refs/remotes/origin/HEAD`                                                                                                            |
| Upstream push / explicit `HEAD:refs/heads/...` push / delete | **Spike verified**, non-force                                                                                                                                    |
| Hard reset and untracked clean                               | **Spike verified**                                                                                                                                               |
| Canonical repository interoperability                        | **Spike verified:** Dugite opened and committed to a repository made by `/usr/bin/git`; canonical Git then passed `fsck --full` and read the new commit          |
| Representative size sanity                                   | **Spike verified:** clone/status/tree/log completed in the normal suite on a 200-file, 21-commit fixture; the whole spike remains a few seconds, not a benchmark |

The executable proof does not duplicate every `SystemGitWorkspace` contract test. It proves Dugite
can be the executor beneath the existing parser/semantic adapter. Commands not individually repeated
here—including path-limited porcelain status, ahead/behind calculation, exact ref resolution, mode
reporting, and fetch/fast-forward—are the same canonical Git 2.53.0 operations already exercised by
the Phase 1.1 suite; no candidate translation layer is involved.

## 5. Critical template-sync gates

### Binary diff

**Spike verified:** Dugite executed exactly:

```text
diff --binary --full-index <base> <target> --
```

with `encoding: "buffer"` and a 10 MiB explicit output limit. The returned `Buffer` contained the
canonical `GIT binary patch` representation. The proof never converts patch bytes to UTF-8 on the
execution or application path.

### Three-way indexed apply

**Spike verified:** the private proof adapter writes the patch `Buffer` to child stdin and executes:

```text
apply --3way --index -
```

For a clean update it preserved an unrelated student edit, updated the template text, added a file,
deleted a file, updated a NUL-containing binary file byte-for-byte, staged every expected path, and
left no unstaged difference. For an incompatible overlapping edit, Git returned failure and left
index stages 1/2/3 plus porcelain `u` conflict state. The proof adapter classified that state as the
typed result `{ kind: "conflict" }`. `reset --hard <student-head>` plus `clean -fd` restored a clean
workspace afterward.

These gates establish the architectural advantage:

> `SystemGitWorkspace` already encapsulates canonical Git command semantics. A Dugite-backed
> executor can replace only the private process/binary resolution layer while leaving the public
> semantic contract and most parsing/behavior unchanged.

No template-sync requirement needs redesign.

## 6. Process, Buffer, limits, and cancellation

**Upstream and spike verified:** Dugite 3.x accepts argument arrays and invokes `execFile` directly,
with no shell. Its execution options accept `Buffer` stdin, `encoding: "buffer"`, `maxBuffer`, an
`AbortSignal`, a kill signal, per-call environment values, and a process callback. See the versioned
[`exec` types/source](https://github.com/desktop/dugite/blob/v3.2.3/lib/exec.ts) and
[`spawn` source](https://github.com/desktop/dugite/blob/v3.2.3/lib/spawn.ts).

The spike round-tripped NUL/non-UTF-8 bytes through stdin/object storage/stdout, observed enforcement
of a deliberately tiny output bound, and observed an already-aborted signal terminate execution.
Dugite's default output limit is infinite in 3.x, so the production executor must always supply
Graider's existing 10 MiB limit. Phase 1.2B should preserve the current process termination policy and
may use Dugite's `exec` Buffer/stdin path instead of maintaining a second raw `spawn` implementation.

## 7. Authentication and security

**Spike verified mechanically:** the existing operation-scoped strategy fits Dugite unchanged:

```text
GIT_CONFIG_COUNT=2
GIT_CONFIG_KEY_0=credential.helper
GIT_CONFIG_VALUE_0=
GIT_CONFIG_KEY_1=http.https://github.com/.extraHeader
GIT_CONFIG_VALUE_1=AUTHORIZATION: basic <encoded operation credential>
GIT_TERMINAL_PROMPT=0
```

The proof observed the scoped header inside only the child Git operation. The distinctive fake token
was absent from argv, the clean HTTPS remote URL, local repository configuration, enumerable error
data, and the redacted retained cause. Parent `process.env` remained unchanged.

**Upstream verified:** `setupEnvironment` starts with the parent environment, overlays per-call
values, resolves an absolute embedded binary, sets `GIT_EXEC_PATH`, prepends its MinGit paths on
Windows, selects Dugite's system config on macOS/Linux, and sets its template directory. Its macOS
system config includes `/etc/gitconfig` and a narrow Azure setting; it does not inject GitHub
credentials. See [`git-environment.ts`](https://github.com/desktop/dugite/blob/v3.2.3/lib/git-environment.ts).

The payload contains Git Credential Manager, and Windows MinGit can contain system credential
configuration. Explicit Graider-authenticated operations must therefore retain the empty
`credential.helper` entry and `GIT_TERMINAL_PROMPT=0`; that high-priority runtime configuration
suppresses ambient helper fallback without mutating global/system/repository config. Graider must
continue validating the effective remote as exact GitHub HTTPS before resolving credentials and
must redact token, encoded token, header, raw stdout/stderr, and candidate error objects before a
semantic error can escape.

**Spike verified:** packaged macOS arm64 and Windows x64 each completed private GitHub clone,
fetch, non-force push, ref verification, and remote branch deletion against the gated sandbox. Both
jobs cleaned their generated proof branches. The exact harness remains specified in
`tests/spikes/git-engine/README.md`.

## 8. isomorphic-git evaluation

isomorphic-git 1.43.0 is active and portable. Its maintained public APIs naturally cover clone
(including `noCheckout`), fetch, push, authentication callbacks/headers, status/statusMatrix,
index add/remove/update, commit, checkout/branch/ref operations, logs, object/tree reads, walking
HEAD/index/worktree, fast-forward, cherry-pick, and merge. Its tree walker preserves normalized
Git modes such as `100644`, `100755`, symlink, and submodule modes. See the
[command index](https://isomorphic-git.org/docs/en/alphabetic),
[clone API](https://isomorphic-git.org/docs/en/clone), and
[tree/index/worktree walker](https://isomorphic-git.org/docs/en/walk).

**Isolated executable probe:** version 1.43.0 opened a canonical Git repository in a path with
spaces, returned status/index/tree data including a binary blob and modes, and produced canonical
index stages 1/2/3 plus conflict markers for a text merge with `abortOnConflict: false`. This is real
capability and is recorded rather than dismissed.

It does not, however, expose a public canonical revision-diff/patch API or an equivalent to
`diff --binary --full-index` plus `apply --3way --index -`; executable export inspection confirmed
both `diff` and `apply` are absent. Its merge API merges refs/trees and normally creates a merge
result/commit; it is not a patch transport that stages the selected template delta on the student's
current commit. Its documentation also records merge limitations, including multiple merge bases
and incomplete-merge handling. See the [merge API](https://isomorphic-git.org/docs/en/merge.html).

Source inspection adds a binary-specific risk: when both sides modify a blob, the default merge
path converts all three blob buffers to UTF-8 strings before diff3 merging. One-sided binary updates
can select the unchanged/changed object ID safely, but conflicting binary updates do not preserve
canonical binary semantics automatically. Rename is inferred as tree add/delete rather than carried
by a canonical patch representation, and reproducing exact mode/rename/delete/add and indexed patch
semantics would require Graider to build an object/tree-delta planner, a binary-aware merge policy,
index-stage mutation, worktree application, rollback, and extensive cross-compatibility tests.

That is substantial Git internals ownership. The task explicitly rejects building a large custom
diff/patch engine merely to make this candidate viable, so isomorphic-git is rejected for Graider's
current template-sync contract despite its strengths elsewhere.

## 9. NodeGit / libgit2 bindings

NodeGit was stopped at documentation/release evaluation. Its latest stable release remains 0.27.0
from July 2020 and advertises prebuilds only through Node 14. That is not a credible basis for Node
24, current Electron ABI, macOS arm64 and Windows x64 prebuilds, packaging, signing, or security
maintenance. Prototyping an obsolete native dependency would add risk without resolving the
template-update selection question.

No other maintained candidate presented a material advantage that justified broadening the spike.

## 10. Object formats and performance

**Spike verified:** bundled Git creates, commits, inspects, and lists trees in both normal SHA-1 and
local SHA-256 repositories; the latter returned 64-character commit and tree IDs. This matches the
public validation that accepts 40- or 64-character exact IDs. Canonical Git's SHA-256 transition is
still incomplete at the hosting/protocol ecosystem level, so this is local-engine support, not a
claim that GitHub hosts SHA-256 repositories. GitHub course/student repositories remain SHA-1 today.
See Git's [hash transition design](https://git-scm.com/docs/hash-function-transition.html).

The 200-file/21-commit fixture completed clone, status, tree, and bounded log normally; binary
diff/apply is covered by the critical fixture. This is sufficient sanity evidence, not a benchmark.
Canonical Git subprocess startup is the main fixed cost, already present in the current engine.

## 11. Package size, licensing, and Electron packaging

### Size measured on macOS arm64

- Dugite JS build wrapper: approximately 128 KiB.
- Extracted Dugite package/payload: approximately 148 MiB (151,820 KiB by `du`).
- Extracted `git` payload alone: approximately 148 MiB (151,656 KiB).
- Downloaded dugite-native macOS arm64 archive: 59.5 MiB.
- Git LFS executable: approximately 12 MiB.
- Git Credential Manager brings its launcher/runtime assemblies and notices; measured `.dll` content
  is roughly 75 MiB, so GCM is a material part of the unpacked payload.
- Current local unpacked Graider macOS app is roughly 407 MiB before this production dependency.

Installer compression should be measured from an actual Phase 1.2B artifact; the 59.5 MiB native
archive is only a useful order-of-magnitude indicator. Tens of megabytes do not outweigh semantic
correctness, but the installed-app increase is material and should be disclosed.

### Licensing/distribution

Dugite's JS wrapper is MIT. The bundled canonical Git is GPL-2.0-only; dugite-native's toolchain is
GPL-2.0, Git LFS is MIT with additional third-party terms, and Git Credential Manager is MIT with a
bundled `NOTICE`. Relevant authoritative texts are Git's
[`COPYING`](https://github.com/git/git/blob/v2.53.0/COPYING), Git LFS's
[`LICENSE.md`](https://github.com/git-lfs/git-lfs/blob/main/LICENSE.md), and GCM's
[`LICENSE`](https://github.com/git-ecosystem/git-credential-manager/blob/main/LICENSE).

This is an engineering inventory, not a legal conclusion. Before distribution, Phase 1.2B/release
work must inventory the exact platform archive, preserve applicable license/notice files in the app,
and choose a compliant corresponding-source or written-offer mechanism for GPL-covered binaries.
The repository has no existing third-party notice assembly system; integration belongs beside the
Electron packaging/release documents and artifact assembly scripts, not in this spike.

### Electron and ASAR

**Upstream and spike verified:** `resolveEmbeddedGitDir()` derives `dugite/git` relative to the JS
module and rewrites any `/app.asar/` segment to `/app.asar.unpacked/`. The test copies Dugite's JS
wrapper under a simulated `app.asar` path, places the native payload under the corresponding
`app.asar.unpacked` path, resolves that exact binary, and executes it successfully.

The current Electron Builder configuration will **not** package Dugite correctly without Phase
1.2B changes:

1. Dugite currently exists only in the root proof `devDependencies`; the packaged Electron project
   is `ui`, whose runtime dependency graph does not include it.
2. Current `asarUnpack` includes only `dist-graider-cli/**/*`; arbitrary Dugite executables are not
   covered.
3. Add Dugite to `ui/package.json` runtime dependencies (and retain whatever root dependency is
   needed to build/test shared source), leave the JS wrapper resolvable from the packaged backend,
   and explicitly unpack `node_modules/dugite/git/**/*`.
4. Keep wrapper and payload at matching relative locations so Dugite's `app.asar` rewrite resolves
   `resources/app.asar.unpacked/node_modules/dugite/git/...`.
5. Include the unpacked Git, Git LFS, GCM, and helper executables in macOS/Windows signing and
   notarization inspection. Verify executable permissions on macOS.
6. Install/download the target payload on its native build host or add an explicit target-aware
   asset-staging mechanism. The current macOS-to-Windows portable cross-build cannot simply reuse a
   macOS-installed `node_modules/dugite/git` directory.

No production packaging configuration was changed during Phase 1.2A. Phase 1.2B-1 changes and
packaged evidence are recorded below.

## 12. Decision and remaining proof at selection time

## Selected

Dugite 3.2.3 is recommended for Phase 1.2B because every critical semantic selection gate passed
and no architectural blocker remains. It eliminates the faculty-installed Git prerequisite by
shipping canonical Git, preserves the exact mechanics on which template synchronization depends,
fits the current operation-scoped credential environment, and permits a narrow executor-layer
migration rather than a second Git implementation.

The following records completed and remaining acceptance work:

1. **Packaged macOS arm64:** deterministic and credentialed private-GitHub transport proof passed.
2. **Packaged Windows x64:** deterministic and credentialed private-GitHub transport proof passed.
3. **Private GitHub:** both Phase 1.2B-2 jobs completed the gated clone, fetch, non-force push,
   ref verification, and managed proof-branch deletion flow, and cleaned their generated branches.
4. **Normal-size packaged repositories:** repeat the sanity fixture plus a representative real
   course/student sandbox repository on both packaged platforms and record wall time/memory only to
   identify gross regressions.
5. **Distribution compliance:** finish the exact notices/source-availability review and integrate it
   into release artifact assembly.

No semantic-contract requirement requires redesign. Production remains on `SystemGitWorkspace`, its
availability checks and diagnostics are unchanged, and the Phase 1.1 architecture guard remains in
force. Phase 1.2B should decide whether to inject a bundled executor into the existing semantic
implementation or rename the implementation more neutrally; production integration remains a
separate Phase 1.2C task.

## 13. Phase 1.2B-1 deterministic packaged proof

### Runtime dependency and packaged layout

`ui/package.json` now pins `dugite` exactly at 3.2.3 as a runtime dependency and authorizes only
`dugite@3.2.3` for its postinstall download. The root 3.2.3 development dependency remains for the
independent Phase 1.2A spike. There is no workspace restructuring or dependency-graph
deduplication.

Electron Builder retains `dist-graider-cli/**/*` in `asarUnpack` and additionally unpacks
`node_modules/dugite/git/**/*`. In the native macOS arm64 artifact the JS entry point, package
metadata, and Dugite MIT `LICENSE` resolve beneath:

```text
Graider.app/Contents/Resources/app.asar/node_modules/dugite/
```

The selected executable resolves to:

```text
Graider.app/Contents/Resources/app.asar.unpacked/node_modules/dugite/git/bin/git
```

The unpacked payload also contains `git-lfs`, `git-credential-manager`, the Git remote helpers, and
GCM's `NOTICE`. The proof canonicalizes the payload and executable paths and rejects resolution
outside that exact unpacked tree.

### Reusable packaged-runtime proof

`ui/scripts/run-packaged-dugite-proof.cjs` locates the normal packaged application executable and
launches it with `ELECTRON_RUN_AS_NODE=1`. The external proof script then uses
`createRequire(<resources>/app.asar/package.json)`; it does not load Dugite from either root or UI
development `node_modules`. Every candidate operation starts from `PATH=""`, removes inherited
`LOCAL_GIT_DIRECTORY` and `GIT_EXEC_PATH`, invokes Dugite's packaged API, and verifies the spawned
file is the same canonical packaged executable returned by `resolveGitBinary()`.

The proof fails closed and emits one safe success line beginning with
`PACKAGED_DUGITE_PROOF_OK`. It verifies wrapper/package layout, Git/Git LFS/GCM helper presence,
native executable headers, the 10 MiB configured Buffer-output bound plus a deliberately exceeded
four-byte bound, and paths with spaces. It covers init, identity configuration, normal and
no-checkout clone, status, HEAD, detached checkout, branch create/reset/switch, normal and
allow-empty commit, recursive tree/first-parent log, fetch, upstream and explicit branch push,
remote-ref verification/deletion, hard reset, and untracked cleanup using only packaged Git.

The same packaged process generates a Buffer with
`diff --binary --full-index <base> <target> --`, verifies text addition/deletion/change and the
canonical binary-patch marker, and passes that Buffer directly to `apply --3way --index -`. The
clean case preserves an unrelated student edit, applies the addition/deletion and byte-exact binary
update, stages every expected path, and leaves no unstaged change. The conflict case exposes index
stages 1/2/3 and porcelain `u` state, then restores cleanly.

The mechanical authentication proof supplies a distinctive fake GitHub header through
`GIT_CONFIG_COUNT`, indexed key/value variables, an empty `credential.helper`, and
`GIT_TERMINAL_PROMPT=0`. The value is observed only in that child, never enters argv, does not alter
the parent environment, and is absent from repository config and the clean remote URL. Normal proof
runs do not contact GitHub.

### Native platform results

On 2026-10-04 a native `darwin/arm64` host packaged the unsigned directory application with
Electron 44.1.0 and ran the complete proof successfully. The proof inspected a Mach-O 64-bit Git
executable with arm64 CPU type `0x0100000c` and reported Git 2.53.0 at the unpacked path above. This
establishes the deterministic macOS arm64 packaged acceptance for Slice 1.2B-1; it is not a signing
or notarization claim.

`.github/workflows/bundled-git-proof.yml` provides the isolated native Windows acceptance job. It
runs on `windows-latest` with Node 24, installs both dependency graphs on that host, reruns the root
Phase 1.2A spike, typechecks/builds, packages the x64 directory application, runs the same packaged
Electron-as-Node proof, and independently checks `git.exe` for the PE signature and machine type
`0x8664`. GitHub Actions checkout may use runner Git; candidate repository operations cannot.

On 2026-10-05, native Windows x64
[workflow run 37304994199](https://github.com/msoecsse/graider/actions/runs/37304994199) exited
green. The packaged process reported Git 2.53.0.windows.4 at
`app.asar.unpacked/node_modules/dugite/git/cmd/git.exe`; the independent inspection confirmed its PE
x64 machine type. The same proof passed empty-initial-`PATH` repository mechanics, clone/fetch/
status/commit, local push/ref deletion, binary diff, clean and conflicting three-way apply, the
byte-exact binary update, output bounding, and fake-auth isolation. This establishes deterministic
Windows x64 packaged acceptance for Slice 1.2B-1.

### Measured distribution cost

The native macOS directory artifact measured 534,892 KiB (about 522.4 MiB). Its unpacked Dugite Git
tree measured 74,964 KiB allocated in the packaged application; the complete unpacked resources
directory measured 76,668 KiB and `app.asar` measured 148,272 KiB. Compared with the earlier
approximately 407 MiB local-app measurement, the total artifact is approximately 115 MiB larger;
that comparison is approximate because the historical baseline was not rebuilt from the same
dependency state. The installed UI `node_modules/dugite/git` source tree measures 151,656 KiB.

The native Windows x64 unpacked directory artifact measured 641,796,956 bytes (about 612.1 MiB) in
the green workflow. A same-dependency-state pre-Dugite Windows artifact was not retained, so no
defensible Windows-specific increase is claimed. Size is recorded here as distribution evidence,
not optimized in this slice.

### Packaged notices and Phase 3 follow-up

This is an engineering inventory, not a legal conclusion. The actual macOS artifact contains
Dugite's MIT `LICENSE` in `app.asar` and GCM's `NOTICE` beside the unpacked helper. That notice names
and includes MIT terms for GitHub/VisualStudio and dotnet/runtime material. The native Windows proof
also inspected the actual artifact and confirmed the packaged Dugite metadata plus Git LFS, GCM,
and that helper `NOTICE`. The selected payload contains Git 2.53.0, Git LFS 3.7.1, GCM 2.9.0, its
.NET runtime assemblies, and other Git helper/runtime files, but it does not itself contain
standalone Git `COPYING`, Git LFS `LICENSE.md`, or a standalone GCM `LICENSE` file.

Before a public Stable release, Phase 3 must assemble and package the exact Dugite, Git, Git LFS,
GCM, .NET/runtime, and other applicable third-party license/notice texts; retain version/source and
checksum provenance for each native archive; and implement the reviewed corresponding-source or
source-offer release mechanism required for the GPL-covered payload. Release validation must inspect
the final installers rather than relying on npm metadata.

Phase 3 signing/notarization must also enumerate nested unpacked executables and libraries before
signing the outer application. At minimum this includes Git, Git LFS, GCM, Git remote/helper
executables, and GCM native/.NET runtime libraries on macOS and Windows. The present unsigned proof
does not establish nested signing behavior.

### Phase 1.2B-2 completion

The gated `--live-private` packaged proof completed successfully on native macOS arm64 and native
Windows x64 against the dedicated private sandbox. Each job used a unique non-default proof branch,
performed clone, fetch, non-force push, ref verification, and `finally` remote deletion; both
generated proof branches were cleaned. Phase 1.2B is complete.

### Phase 1.2C transition state

C-1 proved the `SystemGitWorkspaceFactory` executor seam with Dugite. C-2A composes that proven
runner in `src/git/dugite-git-runners.ts` for direct Electron-main workspace consumers (local
HEAD/history, Course Publish, and Student Access Pages readiness/publication). C-2B-1 now also
uses it for production template sync. The semantic workspace contract and architecture boundary
remain unchanged.

Repository download and the bundled `graider assignment download-repositories` CLI still use the
system-Git repository-download factory. They are the remaining production system-Git consumer and
require the separate C-2B-2 bundled-CLI packaging/module-resolution decision. Phase 1.2 is not yet
complete.
