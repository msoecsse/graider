# Graider bundled Git engine selection

**Status:** Selected for Phase 1.2B; production cutover has not begun

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
That release carries Git 2.53.0, Git for Windows 2.53.0.windows.1, and Git Credential Manager 2.7.0.
The toolchain also bundles Git LFS. Updating Dugite updates a versioned, checksummed Git payload;
Graider must monitor both Dugite and dugite-native/Git security releases.

**Spike verified on macOS arm64:** `resolveGitBinary()` returned
`node_modules/dugite/git/bin/git`; its Mach-O header and `file`/`lipo` inspection identify arm64, and
the executable reports Git 2.53.0. All candidate operations passed an empty `PATH`, yet executed
successfully. The spawned executable's real path matched the resolved packaged binary. This is a
bundled Git executable, not a faculty/system-installed Git executable.

The root package pins Dugite as a `devDependency` and allows its install script solely because this
slice is an isolated proof. Phase 1.2B must move it to the Electron application's runtime dependency
graph when production cutover begins. Eliminated candidates were not added to the repository; the
isomorphic-git probe used an isolated temporary install.

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

**Not yet verified:** live private GitHub clone/fetch/push/delete from packaged macOS and Windows.
The exact gated proof is specified in `tests/spikes/git-engine/README.md`.

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

No production packaging configuration is changed in this slice.

## 12. Decision and remaining proof

## Selected

Dugite 3.2.3 is recommended for Phase 1.2B because every critical semantic selection gate passed
and no architectural blocker remains. It eliminates the faculty-installed Git prerequisite by
shipping canonical Git, preserves the exact mechanics on which template synchronization depends,
fits the current operation-scoped credential environment, and permits a narrow executor-layer
migration rather than a second Git implementation.

The following are acceptance work, not completed claims:

1. **Packaged macOS arm64:** move Dugite into the Electron runtime graph, add the explicit ASAR
   unpack rule, package/sign helpers, launch the packaged app, and rerun embedded-path, empty-PATH,
   binary diff/apply, and private-GitHub operations. The local native arm64 proof is complete; the
   packaged app proof is not.
2. **Packaged Windows x64:** install on native Windows x64, run the shared spike including PE machine
   `0x8664`, package with the Windows payload, verify `app.asar.unpacked` resolution/signing, and run
   empty-PATH clone/status/commit/binary diff/apply/push/delete in paths containing spaces.
3. **Private GitHub:** run the explicitly gated sandbox proof for clone, fetch, non-force push,
   ref verification, and managed proof-branch deletion on both packaged platforms. Confirm no
   helper/prompt fallback and inspect argv, config, remote URL, errors, and logs for the distinctive
   test token.
4. **Normal-size packaged repositories:** repeat the sanity fixture plus a representative real
   course/student sandbox repository on both packaged platforms and record wall time/memory only to
   identify gross regressions.
5. **Distribution compliance:** finish the exact notices/source-availability review and integrate it
   into release artifact assembly.

No semantic-contract requirement requires redesign. Production remains on `SystemGitWorkspace`, its
availability checks and diagnostics are unchanged, and the Phase 1.1 architecture guard remains in
force. Phase 1.2B should decide whether to inject a bundled executor into the existing semantic
implementation or rename the implementation more neutrally; this slice does not introduce a
production `DugiteGitWorkspace`.
