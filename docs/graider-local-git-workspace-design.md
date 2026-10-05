# Graider Local Git Workspace Design

**Status:** Phase 1 / Slice 1.1B complete; the system-Git engine remains the
temporary underlying implementation

**Scope:** completed local Git abstraction and replaceable system-Git adapter;
Phase 1.2 embedded/bundled engine selection remains intentionally untouched

**Authority:** [remote-course architecture](graider-remote-course-architecture.md),
[architecture evolution roadmap](graider-architecture-evolution-roadmap.md), and
[repository layout v2](graider-repository-layout-v2.md)

**Related:** [schema v2 design](graider-schema-v2-design.md)

## 1. Purpose and decisions

Graider previously invoked the system `git` executable from several production
paths. Phase 1.1B has moved those behaviors behind the narrow boundary defined
by this document without changing them. Phase 1.1B uses a system-Git-backed
implementation. Phase 1.2 will prove and select an embedded or bundled engine.

The design makes these decisions:

- `GitWorkspace` represents one already-open local working copy and exposes
  semantic operations, never arbitrary argv or shell execution.
- `GitWorkspaceFactory` owns repository detection/opening and cloning because a
  workspace cannot clone itself into existence.
- Local Git transport and repository mechanics remain separate from the
  existing `GitHubClient` host/API boundary.
- Repository state is modeled with orthogonal working-tree, HEAD/branch, and
  upstream fields. User-facing labels such as **Needs attention** are domain
  projections, not Git-engine states.
- `TemplateSyncGitGateway` remains the template-domain boundary. Its local
  implementation will compose `GitWorkspace`; template concepts will not be
  flattened into the common interface.
- Push is a distinct operation and success boundary. `commit()` must never imply
  push, and `push()` must never imply that the surrounding domain mutation is
  successful.
- The common boundary returns stable semantic errors. Raw command output stays
  inside the engine and must be redacted before any diagnostic or log use.

This document does not design schema v2, course discovery/synchronization,
OAuth, an embedded engine, provider portability, Canvas, permissions, grading
synchronization, or UI changes.

## 2. Inventory method and exclusions

The inventory searched production and test sources for child-process APIs,
literal and indirect `git` executable names, Git subcommands, and wrappers. The
known files were supplemented by `ui/electron/localRepositoryCommitHistory.ts`,
which reuses the Git runner in `localRepositoryHead.ts`.

The following are not production local-Git dependencies:

- Tests use system Git to construct realistic temporary working copies and bare
  remotes. Those calls are fixture setup and integration assertions, not
  application execution.
- `src/workflows/java-junit-checkstyle-workflow.ts` emits `git log` into a
  generated GitHub Actions workflow. That command runs in GitHub Actions, not in
  the Graider application.
- `studentRepositoryAccessPagePublishStatusService.ts` returns suggested Git
  command strings for display. Only the fixed commands executed by the main
  process are production execution.
- `ui/electron/commandRunner.ts` runs controlled Graider CLI workflows. It does
  not itself invoke Git and must not become a generic Git or shell boundary.
- Packaging and screenshot scripts spawn non-Git tools and are outside the
  application-local Git abstraction.

## 3. Current production Git usage

| Subsystem                                      | Production files                                                                                                                                                               | Purpose and current operations                                                                                                                                                                                                                                                                                 | Repository type                                               | Mode / network / authentication                                                                                                                                                                               | Current failure behavior and test seam                                                                                                                                                                                                                                                                                                                                                                                                             | Future boundary                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assignment repository download                 | `src/repository-download/repository-download.ts` (called by the assignment CLI and Electron workflow)                                                                          | Probes `git --version`; clones each missing manifest target into a validated child path with `git clone <url> <path>`                                                                                                                                                                                          | Student; each result is a newly created faculty-managed clone | Mutating; network for non-local URLs; no explicit credential input, so system Git environment/configuration/credential helpers apply                                                                          | Missing Git becomes `repository_download_git_unavailable`; missing URL, unsafe/existing destination, and clone failure become per-target diagnostics; processing continues and reports success/partial/failure. `RepositoryDownloadDependencies.execFile` is an injectable raw-process seam. Unit tests assert argv and continuation.                                                                                                              | Yes. Availability probing disappears from callers; `GitWorkspaceFactory.clone` reports engine/repository errors. Target planning and partial-result diagnostics stay in the download domain.                                                                                                                           |
| Disposable template-sync workspace             | `src/template-sync/production-template-sync-workspace.ts`, used by `production-repository-sync-executor.ts`                                                                    | Creates a temporary directory; clones template and student repositories with `clone --no-checkout`; detached-checks out the pinned template commit; resolves `origin/HEAD`; verifies the remote branch; creates/resets the local student branch from `origin/<default>`; deletes the temporary directory       | Temporary clones of template and student repositories         | Mutating locally; clone is networked; token currently becomes a per-command `http.extraHeader`; later gateway pushes are networked                                                                            | Each stage is translated to a fixed `TemplateSyncOperationError` stage; cleanup cannot replace the primary error. `runGit` can be overridden for workspace tests, but the constructed local gateway has its own hard-coded runner. Integration tests cover real temporary repositories, nonstandard default branches, invalid `origin/HEAD`, safe messages, and cleanup.                                                                           | Yes for clone, revision checkout, remote default branch, and local branch reset. Credential construction moves into the engine boundary. Temporary-directory lifecycle remains an orchestration helper.                                                                                                                |
| Template update and recovery mechanics         | `src/template-sync/local-git-template-sync-gateway.ts` behind `TemplateSyncGitGateway`                                                                                         | Reads HEAD, trees, tree IDs, and first-parent histories; creates binary diffs; applies them with `apply --3way --index` via stdin; checks clean status; commits; non-force pushes default/conflict branches; creates/deletes branches; and uses hard reset plus clean to abort only its own disposable attempt | Template and student clones in a temporary workspace          | Read and mutation; pushes/delete-push are networked; this object receives no token, so pushes currently depend on ambient Git configuration/credential helpers rather than the token used for workspace setup | Domain stages classify clone/checkout/patch/commit/push failures. Conflict detection currently parses Git error text. Cleanup failures do not mask the primary error. `TemplateSyncGitGateway` is readily faked in domain tests; `LocalGitTemplateSyncGateway` integration tests use real system Git and local bare remotes.                                                                                                                       | Partly. The domain gateway remains. Its implementation uses common tree/history/diff/patch/branch/commit/push operations. Template baseline recovery and conflict-branch workflow remain specialized. Text parsing for conflicts moves into the engine.                                                                |
| Course/admin publish readiness and publication | `ui/electron/coursePublishService.ts`, composed by `courseMutationPublicationService.ts` and grading/comment/roster services                                                   | Detects repository root; lists unstaged, staged, and untracked paths separately; reads current branch and upstream; counts commits ahead; rejects unrelated staged files; stages only an allowlist; commits a fixed message; pushes                                                                            | Current manually registered course/admin clone                | Read and mutation; push is networked; authentication is implicit system Git configuration/environment                                                                                                         | Most Git failures collapse to fixed faculty-facing diagnostics. No-upstream and unrelated-staged states block before staging. Push failure leaves the new local commit intact; a stale clone therefore becomes `unpushed`. There is no injected Git seam; integration tests use temporary repositories/bare remotes and protect allowlisting, deletions, no-upstream behavior, unrelated changes, and divergent push preservation.                 | Yes for inspection, path-state, upstream/ahead, stage, commit, and push. File allowlisting and faculty diagnostics stay in the course publication service. Phase 1.1B must preserve the current push-failure behavior even though a later managed-course synchronization transaction will restore authoritative state. |
| Student grading revision reads                 | `ui/electron/localRepositoryHead.ts` and `ui/electron/localRepositoryCommitHistory.ts`, used by grading source/evidence/comment/completion/view-state/report/workflow services | Resolves and validates HEAD; verifies a supplied commit; reads at most ten commits with SHA, committer timestamp, and subject                                                                                                                                                                                  | Student faculty-managed clone                                 | Read-only; no network; no authentication                                                                                                                                                                      | Errors and malformed output become `submission_commit_unavailable` or `commit_history_unavailable`; raw paths/stderr do not cross the service. `LocalGitReader` is injectable, and callers also inject the higher-level readers. Unit tests assert fixed read-only operations, SHA validation, output bounds, and inert/sanitized subjects.                                                                                                        | Yes. Replace raw `LocalGitReader` with semantic revision and history calls while retaining the small grading readers/results as domain adapters.                                                                                                                                                                       |
| Student Access Pages readiness and publication | `ui/electron/studentRepositoryAccessPagePublishStatusService.ts` and `studentRepositoryAccessPagePublishService.ts`                                                            | Detects repository; gets whole-tree and path-specific porcelain status; reads branch, upstream, origin URL, and ahead/behind; stages only the generated page; commits a fixed message; pushes                                                                                                                  | Pages/auxiliary faculty-selected clone                        | Read and mutation; status checks use local refs only; push is networked; authentication is implicit system Git configuration/environment                                                                      | Readiness returns specific states including not-repository, no-upstream, behind, uncommitted, unpushed, and ready. Publication rechecks readiness and blocks missing/wrong paths, remote mismatch, configured-branch mismatch, no upstream, or behind state. Most errors are fixed diagnostics, but push failure currently includes raw Git stderr. There is no injected Git seam; integration tests use paths with spaces and local bare remotes. | Yes for all Git mechanics. Page path containment, configured-repository comparison, readiness projection, and diagnostics stay in the Pages domain. Raw stderr exposure must be removed while retaining useful fixed diagnostics.                                                                                      |

No current production path explicitly fetches an existing persistent clone or
fast-forwards it. The approved roadmap requires both for the first
synchronization work after Phase 1, so they belong in the initial contract.
Ahead/behind inspection is only relative to the locally stored upstream ref;
the synchronization orchestrator must fetch first when freshness matters.

## 4. Semantic operation inventory

The table separates operations required by current production behavior from
the smallest already-approved synchronization needs. It deliberately omits
general Git features.

| Area            | Semantic operation                                                                                               | Evidence and boundary decision                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creation/access | Open/detect a repository and return its canonical working-tree root                                              | Current course and Pages services use `rev-parse --show-toplevel`. A factory returns `not_repository` rather than making every caller probe. Opening must not search outside the trusted path policy supplied by the caller.                                                        |
| Creation/access | Clone into a caller-approved absent directory                                                                    | Current downloads and template sync require clone. Course bootstrap and explicit student download are approved future uses. Clone belongs to the factory, not an open workspace.                                                                                                    |
| Creation/access | Clone without checkout                                                                                           | Required by the disposable template workspace. This is a typed clone option, not arbitrary arguments.                                                                                                                                                                               |
| Synchronization | Fetch a configured remote                                                                                        | Approved for managed course and safe student synchronization. No current persistent-clone caller fetches. It must not merge, checkout, or reset implicitly.                                                                                                                         |
| Synchronization | Inspect upstream and ahead/behind                                                                                | Course publishing reads ahead only; Pages reads both. The result must distinguish missing upstream and divergence without message parsing.                                                                                                                                          |
| Synchronization | Fast-forward the current/configured branch                                                                       | Approved roadmap requirement. It must reject dirty, detached, missing-upstream, non-fast-forward, and conflict cases rather than choosing reset/rebase.                                                                                                                             |
| Synchronization | Push a branch/upstream target without force                                                                      | Current course, Pages, and template flows push. Force is not part of the public contract. An optional typed `setUpstream` flag is sufficient for the known first-push case; there is no general refspec string supplied by renderers.                                               |
| Working tree    | Inspect tracked working-tree, index/staged, untracked, and conflict state, optionally for trusted relative paths | Course publication needs separate staged/unstaged/untracked lists; Pages needs whole-tree and exact-path state; template sync needs cleanliness. A single structured status operation covers these cases.                                                                           |
| Revision/branch | Resolve a revision to a validated object ID; verify a commit exists; inspect HEAD/current branch                 | Grading and template sync require these. Revision input is typed/validated before engine use, and results are object IDs rather than raw output.                                                                                                                                    |
| Revision/branch | Inspect remote default branch                                                                                    | Template setup currently resolves `origin/HEAD`. This remains distinct from GitHub repository metadata: the former is local remote-ref state, while the latter is host/API metadata.                                                                                                |
| Revision/branch | Inspect a named remote URL                                                                                       | Pages compares `origin` with configured metadata. The Git layer returns a parsed/opaque locator value; the domain layer decides whether it matches the expected GitHub repository.                                                                                                  |
| Revision/branch | List bounded commit history, optionally first-parent and including tree IDs                                      | Grading needs ten subjects/timestamps; template recovery needs first-parent commit/tree pairs. Bounds are mandatory. No unrestricted log-format API is exposed.                                                                                                                     |
| Tree/content    | List a revision tree and resolve its tree ID                                                                     | Template baseline recovery compares path/object state and full tree IDs. Results are structured entries. File content lookup is not currently required by local Git callers.                                                                                                        |
| Differences     | List changed paths and create a binary-safe revision patch                                                       | Structured status covers working-copy name-only needs. Template sync needs a binary patch between two trusted revisions. The API describes the result, not `git diff` flags.                                                                                                        |
| Differences     | Apply a patch three-way to the index and classify conflicts                                                      | Required only by the local template adapter. The engine owns backend-specific conflict recognition. The operation accepts patch bytes, not command text.                                                                                                                            |
| Mutation        | Checkout a detached revision; create/reset a local branch from a known revision; switch to an existing branch    | Required by disposable template setup and conflict handling. These are explicit typed operations. A generic checkout-with-flags method is rejected.                                                                                                                                 |
| Mutation        | Stage an exact nonempty set of repository-relative paths                                                         | Course and Pages publication require exact-path staging. There is no `stageAll`.                                                                                                                                                                                                    |
| Mutation        | Commit staged changes with a message and optional trusted author identity                                        | Current flows use repository-configured identity; future course commits require faculty attribution. The engine returns the created commit ID.                                                                                                                                      |
| Mutation        | Delete a known local branch and delete a known remote branch without force                                       | Required by template conflict-branch cleanup. The template adapter owns the managed-branch naming/policy.                                                                                                                                                                           |
| Recovery        | Restore a disposable workspace to a known commit and remove untracked files                                      | Required by template sync after its own failed attempt. This destructive capability must be visibly named, accept the expected commit, and be available only to trusted backend orchestration. It is not used for persistent faculty-managed or managed-course recovery by default. |

Not included now: arbitrary config mutation, stash, rebase, cherry-pick, tag
management, submodule operations, generic merge, arbitrary refspecs, arbitrary
revision expressions from the renderer, or a generic ancestry query. Template
sync's present ancestry need is fully represented by bounded first-parent
history and tree comparison. Add another semantic operation only when an
approved workflow demonstrates a need.

## 5. Local Git versus GitHub host/API

The boundary is about responsibility, not protocol. A Git push can use GitHub
authentication and still belongs to the local repository engine; organization
and repository administration never do.

| Local repository engine (`GitWorkspace*`)                                 | GitHub host/API (`GitHubClient` and trusted auth services)                          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Clone/fetch/push Git objects and refs                                     | Discover accessible repositories and immutable repository IDs                       |
| Open a working copy and inspect status/index/conflicts                    | Read repository metadata from GitHub APIs                                           |
| Resolve revisions, branches, upstreams, remotes, and remote-tracking refs | Manage organizations, invitations, teams, collaborators, and permissions            |
| Read commit/tree history and compute/apply diffs                          | Configure Actions, branch protection/rulesets, topics, releases, and Pages settings |
| Checkout, stage, commit, and perform narrowly scoped branch operations    | Create repositories or pull requests through GitHub APIs                            |
| Report transport authentication failure as a semantic error               | Acquire/refresh/store GitHub credentials and determine authorization                |

`GitWorkspace` must not discover courses, infer authorization, create GitHub
repositories, manage pull requests, or interpret GitHub organization policy.
`GitHubClient` must not inspect a local index or working tree. Template sync
already demonstrates this composition: `TemplateSyncGitGateway` handles local
Git mechanics, while `TemplateSyncPullRequestGateway` uses `GitHubClient`.

This split leaves a clean future seam without defining a GitLab provider or a
generic hosting framework.

## 6. Proposed boundary

### 6.1 Object lifetime and path authority

`GitWorkspaceFactory.open` receives a trusted absolute path from backend/domain
code, validates repository presence, and returns a workspace bound to the
canonical root. Methods do not accept a new working directory. This prevents a
workspace obtained for one authorized repository from becoming arbitrary
filesystem Git access.

The factory also clones because no working copy exists before cloning. The
caller owns destination policy: app-managed course-cache roots, explicit
faculty-selected student roots, or a temporary directory. The factory validates
that the destination does not exist and does not choose a location.

### 6.2 Illustrative TypeScript contract

This is implementation guidance, not compiled code. Method names may be tuned
during Phase 1.1B, but their semantics and exclusions are the contract.

```ts
type ObjectId = string & { readonly __objectId: unique symbol };
type RelativeGitPath = string & { readonly __relativeGitPath: unique symbol };
type BranchName = string & { readonly __branchName: unique symbol };
type RemoteName = string & { readonly __remoteName: unique symbol };

interface GitAuthenticationContext {
  readonly id: string; // opaque trusted handle; never a token or header
}

interface CloneRequest {
  readonly remote: TrustedGitRemote;
  readonly destination: string;
  readonly checkout: "default" | "none";
  readonly authentication?: GitAuthenticationContext;
}

interface GitWorkspaceFactory {
  inspect(path: string): Promise<RepositoryInspection>;
  open(path: string): Promise<GitWorkspace>;
  clone(request: CloneRequest): Promise<GitWorkspace>;
}

interface GitWorkspace {
  readonly root: string;

  inspect(options?: { readonly paths?: readonly RelativeGitPath[] }): Promise<RepositoryState>;
  resolveRevision(revision: TrustedRevision): Promise<ObjectId>;
  listCommits(request: CommitHistoryRequest): Promise<readonly GitCommitSummary[]>;
  listTree(revision: TrustedRevision): Promise<readonly GitTreeEntry[]>;
  resolveTree(revision: TrustedRevision): Promise<ObjectId>;
  remoteUrl(remote: RemoteName): Promise<GitRemoteUrl | null>;
  remoteDefaultBranch(remote: RemoteName): Promise<BranchName | null>;

  fetch(request: FetchRequest): Promise<FetchResult>;
  fastForward(request: FastForwardRequest): Promise<FastForwardResult>;
  diff(request: RevisionDiffRequest): Promise<RevisionDiff>;
  applyPatchToIndex(request: ThreeWayPatchRequest): Promise<PatchApplyResult>;

  checkoutDetached(revision: TrustedRevision): Promise<ObjectId>;
  createOrResetBranch(request: CreateOrResetBranchRequest): Promise<void>;
  switchBranch(branch: BranchName): Promise<void>;
  stage(paths: readonly RelativeGitPath[]): Promise<void>;
  commit(request: CommitRequest): Promise<ObjectId>;
  push(request: PushRequest): Promise<PushResult>;
  deleteLocalBranch(branch: BranchName): Promise<void>;
  deleteRemoteBranch(request: DeleteRemoteBranchRequest): Promise<void>;

  restoreDisposableAttempt(request: {
    readonly expectedHead: ObjectId;
    readonly removeUntracked: true;
  }): Promise<void>;
}
```

`GitWorkspaceFactory.inspect` is the non-throwing repository-detection entry
point used when `not_repository` is an expected result. `open` requires a
repository and reports a categorized error otherwise.

`TrustedRevision`, `TrustedGitRemote`, branch names, and repository-relative
paths are validated values created in trusted code. They are not arbitrary
strings forwarded from IPC. `RevisionDiff` may contain structured changed paths
and optional binary patch bytes according to a typed request. It does not expose
backend flags or command output. `PushRequest` identifies a validated local
branch, remote, destination branch, authentication context, and optional
`setUpstream`; it cannot request force push.

The initial implementation may split `GitWorkspace` into capability interfaces
such as `GitWorkspaceReader`, `GitWorkspaceSynchronizer`, and
`GitWorkspaceWriter` so read-only consumers receive only what they need. That
is encouraged if it improves injection, but there must still be one replaceable
engine implementation and no public `runGit(args)` escape hatch.

### 6.3 Ownership above the boundary

The abstraction does not own:

- course or student repository identity and path registries;
- allowlists of domain-managed files;
- synchronization scheduling or mutation transactions;
- policy deciding whether a dirty repository may be updated;
- faculty-facing diagnostics;
- temporary-directory creation/removal;
- GitHub remote matching, authorization, or credential acquisition; or
- rollback policy after a failed domain mutation.

In particular, `push()` reports a push result. The course mutation orchestrator
decides that remote success is required and, in the future synchronization
phase, how to restore a managed clone after failure. Encoding rollback inside
`push()` would break current course-publication behavior and be unsafe for
faculty-managed student clones.

## 7. Repository state model

A single enum cannot represent dirty state and remote relationship without a
combinatorial set of values. Use a result union for availability and orthogonal
fields for an available repository.

```ts
type RepositoryInspection =
  | { readonly kind: "not_repository"; readonly requestedPath: string }
  | { readonly kind: "unavailable"; readonly error: GitError }
  | RepositoryState;

interface RepositoryState {
  readonly kind: "repository";
  readonly root: string;
  readonly head:
    | { readonly kind: "unborn"; readonly branch: BranchName | null }
    | { readonly kind: "attached"; readonly branch: BranchName; readonly commit: ObjectId }
    | { readonly kind: "detached"; readonly commit: ObjectId };
  readonly workingTree: {
    readonly trackedChanges: readonly PathChange[];
    readonly stagedChanges: readonly PathChange[];
    readonly untrackedPaths: readonly RelativeGitPath[];
    readonly conflicts: readonly ConflictPath[];
  };
  readonly upstream:
    | { readonly kind: "missing" }
    | {
        readonly kind: "configured";
        readonly remote: RemoteName | null;
        readonly branch: string;
        readonly ahead: number;
        readonly behind: number;
        readonly relation: "current" | "ahead" | "behind" | "diverged";
      };
}
```

`PathChange` must retain enough information to distinguish additions,
modifications, deletions, renames, and type changes. A path-limited inspection
returns the same shape filtered to the requested paths. Cleanliness is a
projection:

```ts
const clean =
  trackedChanges.length === 0 &&
  stagedChanges.length === 0 &&
  untrackedPaths.length === 0 &&
  conflicts.length === 0;
```

This supports all required combinations:

| Projection                 | State test                                                                   |
| -------------------------- | ---------------------------------------------------------------------------- |
| Not a repository           | `kind === "not_repository"`                                                  |
| Unavailable/error          | `kind === "unavailable"` with a categorized error                            |
| Clean/current              | clean and upstream relation `current`                                        |
| Clean/behind               | clean and `behind`                                                           |
| Clean/ahead                | clean and `ahead`                                                            |
| Diverged                   | configured upstream relation `diverged`, independently of cleanliness        |
| Dirty                      | any tracked, staged, untracked, or conflict entry, independently of upstream |
| Dirty plus behind/diverged | dirty plus the corresponding upstream relation                               |
| Missing upstream           | `upstream.kind === "missing"`                                                |

Conflicts are represented separately from ordinary tracked changes because
they always require attention. Staged changes are separate because current
course publication rejects unrelated staged work. Untracked files count as
dirty for automatic synchronization and template operations, even though
current allowlisted publication may leave unrelated untracked files alone.

The model is an observation, not a freshness guarantee. After `fetch`, a new
inspection is required before synchronization decisions. The future sync
engine, not the Git engine, projects these facts to policy:

- clean managed course/admin clone: fetch, inspect, then fast-forward when safe;
- dirty managed course/admin clone: preserve it and block automatic overwrite;
- clean downloaded student clone: fetch and fast-forward before dependent work;
- dirty student clone: preserve faculty changes and block automatic update;
- diverged or conflicted clone: **Needs attention**.

## 8. Authentication boundary

Authentication is supplied only for network operations through an opaque
`GitAuthenticationContext` created and resolved in trusted backend code. Domain
callers may select an already-authorized context; they do not construct HTTP
headers, credential URLs, environment fragments, or command arguments.

The engine implementation must ensure that credentials:

- never cross preload/IPC into the renderer;
- are not embedded in argv, exception messages, structured errors, logs, or
  diagnostics;
- are not persisted in repository config or rewritten remote URLs unless a
  separately approved design explicitly requires it;
- are redacted from captured backend output before it can leave the engine;
- have an operation-bounded lifetime and are not retained by `GitWorkspace`;
  and
- work for clone, fetch, and push without requiring `gh` or faculty-managed
  credential helpers in the packaged application.

The system-Git adapter used in Phase 1.1B implements the current
GitHub-compatible header semantics as a private engine detail. The public
contract carries only the opaque context. OAuth acquisition, refresh, and
secure-store design remain out of scope.

### 8.1 Phase 1.1B system-Git credential transport

The operation-scoped mechanism is now resolved for the temporary system-Git
adapter:

- The semantic API carries only a branded `GitAuthenticationContext` containing
  an assigned opaque ID. The ID is not derived from a token and JSON
  serialization exposes only that ID.
- Trusted backend composition supplies a narrow `GitCredentialResolver`. The
  resolver may temporarily be backed by the current token source, but raw and
  encoded credentials do not enter the semantic Git request. The resolver is
  not available to renderer or preload code.
- For each explicitly authenticated operation, the adapter resolves the
  credential, validates the effective remote, builds a fresh child-process
  environment from the normal parent environment, invokes Git, and releases
  the operation-local resolved value. A workspace retains the resolver, not a
  resolved credential or credential environment.
- GitHub credentials are bound to HTTPS operations whose effective host is
  exactly `github.com`. Clone rejects other HTTPS hosts, SSH remotes, local
  remotes, embedded URL credentials, and non-default ports before resolving or
  passing credential material to child Git. Authenticated upstream push also
  validates configured `pushurl` values, or the normal remote URLs when no
  `pushurl` is present.
- Runtime Git configuration is passed only through `GIT_CONFIG_COUNT` and
  matching `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n` child-environment entries.
  It clears `credential.helper` for the operation and sets
  `http.https://github.com/.extraHeader` to the existing GitHub-compatible Basic
  authorization value derived from `x-access-token:<token>`.
- `GIT_TERMINAL_PROMPT=0` disables terminal credential prompting. Clearing the
  helper list prevents Git Credential Manager or a keychain helper from
  supplying a different ambient credential. These protections affect only the
  authenticated child invocation; global, system, and repository Git config
  remain unchanged. No askpass script or platform shell mechanism is used.
- Credential material is absent from Git argv, remote URLs, repository config,
  semantic errors, diagnostics, and logs. Captured authenticated-process
  failures are scrubbed before a non-enumerable internal cause is retained.
- Operations without an authentication context preserve the existing ambient
  system-Git behavior. Each authenticated invocation receives a new environment,
  so sequential and concurrent contexts cannot share a current token.

This transport is deliberately an adapter detail, not the future acquisition
architecture. Phase 2 will replace the current token acquisition and storage
source behind the same resolver/context boundary without changing semantic Git
operations. Adoption-plan step 7 is complete. The production disposable template
workspace uses authenticated semantic no-checkout clone, detached checkout,
remote-default-branch discovery, and create/reset-from-remote branch preparation.
`LocalGitTemplateSyncGateway` receives those two workspaces directly and reuses
the same opaque operation authentication context for explicit branch pushes and
remote managed-branch deletion. Its current raw token input is bridged to an
operation-scoped opaque authentication context and resolver only at this trusted
orchestration boundary.

Network operations without an authentication context may remain possible for
public/local remotes and current behavior, but the caller must choose that
explicitly. The engine must never silently search renderer-controlled
credentials.

## 9. Error model

Use a small stable taxonomy and retain the backend cause only inside trusted
diagnostic context.

```ts
type GitErrorKind =
  | "engine_unavailable"
  | "repository_unavailable"
  | "not_repository"
  | "authentication_failed"
  | "remote_unavailable"
  | "revision_unavailable"
  | "dirty_workspace"
  | "conflict_or_divergence"
  | "operation_rejected"
  | "unknown_engine_failure";

interface GitError extends Error {
  readonly kind: GitErrorKind;
  readonly operation: GitOperationName;
  readonly safeDetail?: string;
  // backend cause/output is non-enumerable or otherwise trusted-only
}
```

The categories intentionally do not attempt to model every Git exit condition.
Typed successful results may express expected conditions such as missing
upstream, patch conflict, non-fast-forward, or no changes more precisely than
exceptions.

Layer ownership is:

1. The engine captures exit codes/library failures, bounds output, recognizes
   backend-specific messages when necessary, and scrubs credentials and paths.
2. `GitWorkspace` exposes a semantic result or categorized `GitError`; callers
   never parse stderr.
3. Domain adapters translate that result into existing subsystem diagnostics
   such as `repository_download_clone_failed`, `push_failed`,
   `submission_commit_unavailable`, or a faculty-facing Pages message.

Raw stderr is not an application contract. The current Pages publication
diagnostic that appends Git stderr should migrate to a fixed message plus a
safe category/correlation detail. Template sync already follows the desired
pattern by retaining the raw cause internally and exposing fixed stage text.

## 10. Existing template-sync abstractions

`TemplateSyncGitGateway` should remain. It expresses domain operations:

- recover template/student baseline anchors;
- apply and push a template delta;
- prepare a reviewed conflict branch; and
- delete that managed branch.

Those are not general workspace operations. Keeping the gateway also preserves
the strong fake used by `template-sync.test.ts` and
`assignment-template-sync.test.ts`.

`LocalGitTemplateSyncGateway` becomes an adapter over two injected
`GitWorkspace` instances. It uses common tree/history/diff/patch/commit/branch
operations but retains baseline matching, template commit messages, managed
branch policy, and cleanup sequencing. Conflict classification moves below it
so it no longer searches raw Git text.

`withProductionTemplateSyncWorkspace` remains a disposable-workspace
orchestrator. It should receive a `GitWorkspaceFactory`, create two no-checkout
clones with an opaque authentication context, prepare their revisions/branches,
construct the domain gateway, and clean the temporary directory. GitHub pull
request creation remains in `TemplateSyncPullRequestGateway` backed by
`GitHubClient`.

This is partial reuse, not replacement: the common abstraction owns Git
mechanics; the specialized gateway owns template semantics.

## 11. Testability and conformance

### 11.1 Unit tests

Domain services receive the narrowest capability or domain adapter they need:

- grading readers fake revision/history methods;
- download orchestration fakes the factory clone result per target;
- course and Pages services fake state, stage, commit, and push results;
- template domain tests continue to fake `TemplateSyncGitGateway`; and
- temporary template orchestration fakes the factory/workspaces.

Fakes return typed values and categorized errors, never simulated stdout. This
keeps most tests independent of GitHub, network, an installed Git executable,
and actual repositories.

### 11.2 Engine contract tests

Every Git engine implementation, including the initial system-Git adapter and
the Phase 1.2 candidate, must pass the same behavior suite using temporary
repositories. At minimum cover:

- open/not-repository/root discovery and paths containing spaces;
- normal and no-checkout clone;
- clean, tracked, staged, untracked, deleted, renamed, conflicted, and
  path-limited state;
- attached, detached, and unborn HEAD;
- missing upstream and all four ahead/behind relations;
- fetch followed by fast-forward, plus dirty and non-fast-forward rejection;
- revision verification, remote default branch, remote URL, bounded history,
  and tree listing;
- binary-safe diff and three-way apply success/conflict;
- exact-path staging, commit ID return, non-force push, first push with
  upstream, and rejected push;
- local/remote managed-branch cleanup;
- disposable-attempt restoration without touching files outside the workspace;
  and
- authentication/category redaction in errors and diagnostics.

### 11.3 Integration tests and existing fixtures

Focused integration tests should continue to use temporary working copies and
local bare remotes for domain workflows where this provides useful end-to-end
coverage. A small gated suite may exercise authenticated private GitHub
clone/fetch/push when Phase 1.2 requires it.

Existing tests may temporarily continue invoking system Git solely to build and
inspect fixtures. That does not make system Git a production dependency. Over
time, shared fixture helpers can reduce duplication, but rewriting them is not
part of Phase 1.1B and they must not be forced through the production
abstraction merely to satisfy the end-state search rule.

## 12. Electron trust boundary

The factory, workspaces, engine, and credential resolver live in trusted backend
code (core/CLI infrastructure or Electron main-process composition). They are
never imported by the renderer and are not exposed directly through preload.

Existing workflow-specific IPC remains the correct shape. The renderer may ask
to download authorized repositories, inspect a resolved course, load grading
history, or confirm a publication workflow. Electron main then:

1. resolves registered/canonical repository identity and an allowed local path;
2. validates faculty scope and operation-specific input;
3. resolves trusted remote and credential context;
4. invokes the domain service that composes `GitWorkspace`; and
5. returns bounded structured results and safe diagnostics.

No IPC may accept arbitrary Git arguments, arbitrary repository paths, raw
credentials, unrestricted revision expressions, or a remote URL selected by
the renderer. A faculty-selected folder is first registered/validated by its
specific workflow; it does not grant general filesystem Git access. This
preserves the rules in the
[Electron UI contract](codex-electron-ui-contract.md).

## 13. Phase 1.1B adoption plan

Each step preserves current domain results before the next direct caller moves.

| Order | Call sites                                                                                              | Operations introduced/used                                                                             | Existing protection                                                                                                              | Risk                                                                                                 |
| ----: | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
|     1 | New infrastructure only                                                                                 | Factory/open plus system-Git engine; semantic errors; trusted value validation                         | New engine contract tests using temporary repositories                                                                           | Medium: establishes parsing and cross-platform behavior, but no production caller changes yet        |
|     2 | `localRepositoryHead.ts`, `localRepositoryCommitHistory.ts`                                             | Resolve/verify revision and bounded commit history                                                     | Injected-reader unit tests and grading service tests                                                                             | Low: read-only, local-only, strong injection seams, small outputs                                    |
|     3 | `repository-download.ts`                                                                                | Clone with default checkout; semantic engine availability check                                        | Semantic factory fakes for per-target behavior plus system-Git clone contract tests                                              | Complete: network-capable, clone-only, and destinations remain safety-checked                        |
|     4 | `studentRepositoryAccessPagePublishStatusService.ts` and read-only portion of `coursePublishService.ts` | Open/root, structured status/path status, branch/upstream/ahead-behind, remote URL                     | Real-repository readiness/publish-status tests                                                                                   | Complete: structured inspection is adopted; publication mutation remains deferred to step 5          |
|     5 | Mutating portions of `coursePublishService.ts` and `studentRepositoryAccessPagePublishService.ts`       | Exact-path stage, commit, push                                                                         | Integration tests for allowlists, deletions, unrelated staged files, missing upstream, behind state, and rejected/divergent push | Complete: exact-path staging, configured-author commits, upstream push, and safe diagnostics adopted |
|     6 | `withProductionTemplateSyncWorkspace`                                                                   | Authenticated no-checkout clone, remote default branch, detached checkout, create/reset branch         | Workspace tests for stage classification, default branch, cleanup, and safe diagnostics                                          | Complete: disposable preparation and the explicit clone credential bridge now use the common engine  |
|     7 | `LocalGitTemplateSyncGateway`                                                                           | Tree/history, binary diff, three-way indexed apply, branch operations, commit/push, disposable restore | Extensive real-Git integration suite plus fake domain gateway tests                                                              | Complete: semantic workspaces now own all Git mechanics and authenticated transport                  |
|     8 | Repository-wide enforcement                                                                             | Complete: automated source-boundary test and direct-Git process-runner guard                           | The test permits only the system-Git engine and Electron non-Git runner child-process boundaries; the runner rejects direct Git  | Complete                                                                                             |

Course and Pages publication can share infrastructure without merging their
domain services: their allowed paths, readiness rules, messages, and repository
types differ. Likewise, the grading readers may remain small adapters even
after they use the common reader capability.

No step introduces automatic fetch/update of current clones in Phase 1.1B.
Fetch and fast-forward are implemented and contract-tested for the approved
future synchronization engine, but adopting synchronization policy belongs to
later roadmap slices.

`LocalGitTemplateSyncGateway` remains the template-domain adapter, but it no
longer executes Git directly. Tree and first-parent history inspection, remote
branch resolution, binary diff generation, three-way indexed patching, typed
conflict classification, commits, branch mechanics, explicit pushes/deletes,
and disposable rollback now live behind the common workspaces. Template
baseline ambiguity and subset-matching policy remain in the gateway. Network
pushes and deletes receive the same opaque operation authentication context as
the clones; no token, header, or resolver crosses into the gateway.

Phase 1.1B is complete. The implemented semantic surface covers repository
detection/open, default and no-checkout clone, operation-scoped authentication,
structured inspection, HEAD/revision/history, remote URL/default branch,
tree/tree history, binary diff, typed three-way patching, staging, normal and
allow-empty commit, upstream and explicit branch push, branch
prepare/create/switch/delete, remote branch deletion, and disposable rollback.
Fetch and fast-forward remain implemented contract capabilities for a later
synchronization slice; they do not introduce synchronization policy here.

## 14. Direct-system-Git end state

The measurable end state is:

> Production Graider code no longer directly invokes the system `git`
> executable outside the single replaceable Git-engine implementation.

Concretely:

- one infrastructure module may use child-process APIs to invoke `git` during
  Phase 1.1B;
- no domain, CLI command, Electron service, preload, renderer, or specialized
  template adapter imports child-process APIs for Git or constructs Git argv;
- searches for direct production `git` execution identify only that engine;
- tests may still use system Git for fixtures and contract verification; and
- generated GitHub Actions content is separately documented and does not count
  as packaged-application local Git execution.

Phase 1.1B is abstraction and behavioral convergence. It does not claim that
the packaged application is independent of system Git. Phase 1.2 replaces or
bundles the engine behind the same contract and proves private authenticated
clone/fetch/push on supported packaged platforms.

The completed architectural test enforces one production Git execution
implementation: `src/git/system-git-workspace.ts`. It rejects direct
child-process imports in all other production `src/` and `ui/electron/` source,
and rejects explicit process-runner requests for `git` or `git.exe` outside the
engine. `ui/electron/commandRunner.ts` remains the separately approved generic
non-Git process boundary for Graider CLI, temporary `gh` authentication, and
other trusted workflows; its runtime guard rejects direct Git executable paths.

`LocalGitTemplateSyncGateway` is fully migrated to semantic workspaces.
Operation-scoped authentication covers template no-checkout clone and network
pushes/deletes. The underlying engine is still system Git; Graider does not
become independent of system Git until Phase 1.2 proves the selected embedded
or bundled engine.

## 15. Resolved and open implementation questions

The first Phase 1.1B reader slice resolved the shared build-placement question:
the contract and single system-Git implementation live under `src/git`. Root
code consumes those modules directly, while the existing trusted generated-CJS
build includes a `systemGitWorkspaceBackend.cjs` entry for Electron main. A
small Electron-main loader exposes only the structural reader capability; no
Git implementation is copied into `ui`, preload, or renderer code. The initial
surface uses `GitWorkspaceReader` plus `GitWorkspaceFactory`, leaving later
capabilities to be added only as their migration slices require them.

Adoption step 5 resolves two additional decisions. During Phase 1.1B,
`commit()` preserves the repository's currently configured Git author identity;
it does not derive or override author fields. Verified faculty attribution is
deferred until first-class authentication can supply a trusted identity. Pages
publication now uses fixed faculty-facing failure messages. Raw Git stderr is
retained only as a non-enumerable internal engine cause and is never appended to
the publication result.

The operation-scoped credential question is resolved by the child-environment
runtime configuration described in section 8.1. This proof now covers
authenticated clone, upstream and explicit branch push, and remote branch
deletion through the replaceable system-Git engine. Phase 1.2 must prove the
equivalent private authenticated transport with the selected embedded or
bundled engine in packaged macOS Apple Silicon and Windows x64 applications.
That proof must not reintroduce a system-Git, shell, credential-helper, or
terminal-prompt dependency.

| Question                                                                                                                                                                   | Phase 1.1B blocker?                                                                                            | Resolution point       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Does the selected Phase 1.2 engine natively support binary three-way patch application and index semantics, or will the engine adapter need a private compatibility layer? | No for Phase 1.1B; the system-Git adapter proves the semantic contract. It is a Phase 1.2 selection criterion. | Embedded-engine proof. |

The Phase 1.2 engine must support or privately emulate recursive tree
inspection, first-parent history with tree IDs, binary revision diff generation,
three-way indexed patch application with typed conflict classification, exact
branch push/deletion, disposable reset/cleanup, and authenticated GitHub
clone/push. Any compatibility technique remains below the semantic interface;
callers do not depend on CLI flags, refspec strings, stderr wording, or process
execution.

The placement of clone on the factory, representation of missing upstream, and
continued existence of the template-domain gateway are resolved by this design
and are not open questions.

## 16. Phase boundaries and non-goals

Phase 1.1B implements this boundary and migrates existing behavior
incrementally. It does not begin schema v2, remote course discovery, automatic
course synchronization, OAuth, embedded-engine selection, GitLab, Canvas, UI
redesign, organization/team permissions, or grading-state synchronization.

Future features may add requirements only through demonstrated workflows. They
must not turn `GitWorkspace` into `runGit(args)`, a generic process runner, or a
GitHub provider abstraction.
