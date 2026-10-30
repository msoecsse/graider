# Remote Graider course discovery, bootstrap and synchronization

Phase 2.7 adds a trusted pre-mutation synchronization guard on top of Phase 2.6 explicit
managed-cache preservation and replacement. Legacy folders remain the mutation targets. See [synchronization and the next boundary](#phase-25--managed-course-synchronization).
The discovery foundation below describes Phase 2.3.

Phase 2.1 supplies browser authorization-code + PKCE, one active GitHub identity,
and OS-encrypted credentials. Phase 2.2 supplies organization access classification
(`81b0c88`). Phase 2.3 consumes only active memberships marked accessible by that
service; pending, restricted, SSO-blocked and inaccessible organizations are not scanned.

## OAuth capabilities and transaction

The centralized required scope list is `read:org repo`. GitHub OAuth Apps require
`repo` to read private repository contents. Although this scope also permits writes,
this slice authorizes **only reads**. Existing course/student/assignment mutations
retain their prior credential paths. No repository, topic, file, collaborator,
team, setting, branch or workflow is changed by discovery.

Capabilities come from GitHub's authoritative `X-OAuth-Scopes` header at `/user`,
not the exchange response or requested scope strings. Sanitized organization and
private-repository permissions cross IPC; tokens and raw scope headers do not.
A valid read:org-only session offers **Authorize course access**. Upgrade preserves
the old credential through browser cancellation/denial, PKCE/state failure, exchange
failure, provider outage, missing grants or secure replacement failure. The new
credential replaces it only after identity and scope validation succeed.

## Candidate selection and bounds

For each usable organization, the adapter fully paginates repository metadata in
100-item pages. The renderer never receives that private inventory. Candidates are
prioritized by the `graider-course` topic, then current naming conventions, known
registered origins and legacy root `course.yml` code-search hints. All hints require
normal contents-API validation; a topic is never proof of a course or faculty role.

Current setup writes `course.repository` from the course code and creates local
course files; it does not create a remote course/admin repository. Production v1
schema requires this field to be a nonempty logical string, and its validator does
not bind it to Git remote owner/name. The registered production clone is
`csc1120/csc1120`, while its local course code and `course.repository` are `csc1020`.
Discovery preserves these semantics, including across repository renames. It does
not reinterpret the logical field as owner/name or invent a v2 repository-ID field.
Missing/invalid required fields still fail canonical validation.

Legacy naming hints include a repository matching its organization login, course
codes (letters plus three/four digits), and course/admin/Graider naming forms. The
organization-name match is only a candidate hint, never course identity. Arbitrary
historical names can be found via `org:<login> filename:course.yml path:/` code search.
Only root-file results whose repository ID is in the authenticated organization
inventory are candidates. Search is paginated to GitHub's 1000-result search limit;
incomplete results and search/rate-limit failures are explicit diagnostics. Search
indexing/default-branch/fork limitations mean absence is not proof of absence.
Topic, naming and verified-origin paths still work when search is unavailable.

Organizations run sequentially; candidate inspections and local Git reads each use
four workers. Course contents are fetched once per candidate per run, candidates
are deduplicated by repository ID, and resolved local origins are cached per run.
A large student-repository inventory triggers metadata pagination, not a contents
request per student repository. Metadata files are limited to 512 KiB. Term
directory responses at the Contents API's 1000-entry cap are treated as incomplete,
not as proof of no faculty assignments. Requests have 30-second deadlines and
cancellation. Discovery alone reads no rosters, assignments, reports or grading
state. Managed bootstrap below clones the complete course/admin repository,
including its course-owned content; it never clones student repositories.

## Validation, faculty authorization and identity

Root `course.yml` is fetched at the default branch without cloning. Content-based
entry points extracted from the existing course/term loaders reuse the same safe
YAML parser, strict schemas and semantic validators. Unsupported versions remain
distinguishable even when their shapes differ. Course organization must match the
actual GitHub organization; disabled repositories are unavailable. Multiple valid
course repositories in one organization produce ambiguity and no selected course,
regardless of which faculty assignments happen to authorize the user.

Schema-v1 authorization uses the machine-local **Current faculty MSOE username**
and canonical `resolveFacultyScope` section assignment semantics across valid
`terms/<term>/term.yml` metadata. The resolver receives an empty roster because the
section-membership decision needs no student records. GitHub login is never
substituted. Missing MSOE identity retains a validated identity-required candidate:
**Set your MSOE username to verify course access.** Read access without matching
faculty assignment is not normal course availability. Invalid/inaccessible term
metadata produces unresolved authorization rather than a false negative; an
independent validated positive assignment can authorize the course.

The canonical course identifier is immutable GitHub repository ID. Organization
ID/login, repository name/full name/URL, node ID, branch, visibility and GitHub
archived flag are metadata. The archived flag is read-only attention, not a Graider
course lifecycle. A rename under the same ID remains one identity. An old GitHub
locator may resolve only through a protected API redirect to a numeric repository-ID
route. Organization mismatches/transfers require manual migration/reconciliation;
discovery never rewrites metadata or migrates repositories.

## Registry reconciliation and dashboard

Registered folders remain path-based. Trusted bundled Git opens the exact course
root and reads only `origin`; enclosing roots and non-GitHub/credential-bearing or
malformed origin URLs cannot establish identity. GitHub resolves owner/name to ID,
including verified repository rename redirects. ID matches enrich the existing
local card; no second remote card is rendered. Unmatched candidates are remote-only.
Local course/org metadata can flag a related wrong or unverifiable origin, but
never establish remote identity. No folder, remote, registry record or clone is
changed by reconciliation.

Authorized remote-only courses say **Available remotely** and have no fake Open
button. Faculty-identity candidates offer settings. Invalid, unauthorized,
ambiguous and unavailable diagnostics stay in a secondary details surface without
unrelated repository names. Local course routing and existing course workflows
continue working. Saving the faculty username re-runs discovery. **Refresh courses**
refreshes organization state, metadata, authorization and local reconciliation.

Discovery starts asynchronously after restored identity, scope validation and
organization discovery; it does not hold up Electron window creation. Results are
scoped by immutable authenticated user ID and discarded on successful replacement
or sign-out. Old in-flight results cannot replace another identity's state.
Transient/provider failures preserve sign-in and successful scoped results.
A repository 401 does not invalidate a global credential until `/user` also rejects
it. Provider bodies, tokens, codes and PKCE values remain behind the main/adapter
boundary. IPC exposes no generic private-repository file reader.

## Follow-up boundary

Course Setup currently does not create remote course/admin repositories. Adding
`graider-course` topic mutation here would introduce a new write path, so it is
explicitly deferred. Future app-managed remote creation must set that topic.

Phase 2.4 should bootstrap only authorized course/admin repositories: revalidate
repository ID, active-account capability, organization binding and faculty access;
resolve the latest locator; select an identity-scoped managed destination keyed by
repository ID; clone using trusted bundled Git and main-process credentials; verify
remote identity/default branch after clone; integrate the managed local course
without duplicating or moving legacy registrations. Handle cancellation, partial
clone cleanup, path collisions and retry explicitly. Keep student repositories,
background synchronization, OAuth course mutations, schema v2, role history,
transfer migration and course lifecycle outside that bootstrap slice.

## Implementation and validation evidence (2026-10-24)

Major implementation files:

- `src/github/github-client.ts`, `octokit-github-client.ts`: four GET-only discovery
  transport operations, metadata path allowlist, protected immutable-ID rename redirect.
- `src/config/load-course-config.ts`, `load-term-config.ts`: shared content parsing
  entry points used by local loading and remote validation.
- `ui/electron/githubRemoteRepositories.ts`: normalized read-only adapter facade,
  pagination/search, deadlines, size bounds, scoped sanitized errors.
- `ui/electron/remoteCourseDiscovery.ts`, `remoteCourseTypes.ts`: bounded candidate
  discovery, canonical identity, schema-v1 faculty authorization and read-only local
  origin inspection/reconciliation.
- `ui/electron/githubOAuthSession.ts`, `githubOAuthNetwork.ts`, `githubOAuthTypes.ts`,
  `githubOrganizations.ts`, `main.ts`: centralized scopes, sanitized capabilities,
  transactional upgrade, account-scoped asynchronous startup/refresh orchestration.
- `ui/scripts/remoteCourseMetadataBackend.ts`, `build-template-sync.mjs`: trusted
  canonical schema/faculty resolver bundle, never imported by renderer/preload.
- `ui/src/dashboard/RemoteCoursesPanel.tsx`, `GithubAccountPanel.tsx`,
  `DashboardPage.tsx`, `CourseCardGrid.tsx`: shared account snapshot, course refresh,
  remote-only/identity-required/diagnostic states and enrichment of existing local cards.

Focused coverage was added in `remote-course-reads.test.ts` (backend),
`githubRemoteRepositories.test.ts`, `remoteCourseDiscovery.test.ts`,
`RemoteCoursesPanel.test.tsx`, and the existing OAuth/organization/account-panel
suites. It covers authoritative scope evidence, upgrade rollback/persistence,
organization exclusions, full pagination, topic/legacy/search hints, invalid and
unsupported schemas, canonical validation reuse, faculty identity and section
semantics, ambiguity, repository rename/ID reconciliation, wrong/unverified local
origins, account isolation including late results, safe metadata paths, sanitized
provider failures, read-only dependency/transport architecture, and remote/local
rendering without duplicate cards. The large-org fixture has 1500 student-like
repositories plus 12 explicit candidates: only the 12 candidates receive contents
requests and peak concurrency is at most four.

Validation completed:

- Focused OAuth/organization/adapter/discovery/dashboard regressions passed.
- Full backend suite: **138 files passed; 1487 tests passed, 1 skipped**
  (`npm test -- --maxWorkers=2`). An initial run concurrent with the UI suite hit
  four existing Git/performance deadlines; the complete bounded-worker rerun passed.
- Full UI/Electron suite on final implementation: **176 files passed; 1492 tests
  passed, 25 skipped** (`npm test -- --maxWorkers=4`).
- Backend and UI/Electron typechecks, repository lint, repository formatting check,
  backend and UI production builds, and `git diff --check` passed.
- Builds retain the existing Vite large-chunk advisory. The full UI suite emits
  the existing PDF standard-font advisory; neither is a validation failure.
- Final diff inspected for repository mutations, token projection, generic private
  file IPC, name-based canonical identity, and React GitHub API access; none added.

Real Electron smoke test used the saved Phase 2.2 read:org-only OS-encrypted
credential and real `csc1120` organization. The application restored the existing
signed-in identity, offered **Authorize course access**, completed the browser
upgrade, and retained sign-in. Refresh discovered private `csc1120/csc1120`,
immutable repository ID **1342086585**, default branch `master`, schema 1, code
`csc1020`, title **CSC-1020 Data Structures, IO, and Graphical User Interfaces**.
Faculty username `jones` was authorized using remote term section assignments.
Discovery hints were legacy name, verified local origin and code search (no topic
was required or added).

The existing local registration reconciled by API repository ID: the real
dashboard rendered one local course card, zero duplicate remote articles, and
showed the repository ID. Sign-out cleared active remote courses and user ID;
browser sign-in rediscovered the same course. A simulated network failure retained
the authenticated identity. A new Electron process restored the upgraded secure
credential and automatically rediscovered the same ID. Existing local assignment
navigation opened `#/course/csc1020/27s1/e3` without an error boundary. Instrumented
live restart/discovery/navigation made **21 GitHub API reads and zero API writes**.
No GitHub course or student repository was modified by discovery. Topic/malformed/
student/large-org sandbox scenarios were covered by automated fakes; no live
sandbox repositories were created or mutated.

Phase 2.3 ends here. No clone/bootstrap, managed cache, student discovery/cloning,
background sync, OAuth mutation migration, schema-v2 directory/lifecycle, folder
migration, or transfer migration was implemented. Phase 2.4 should consume these
normalized authorized repository-ID records and follow the bootstrap boundary above.

## Phase 2.4 — identity-scoped managed course bootstrap

Phase 2.4 adds initial course/admin clone bootstrap and verified reuse after
Phase 2.3 discovery. It does **not** implement ongoing synchronization. No student
repository is selected or cloned, and bootstrap has no GitHub write capability.

Storage is machine-local Electron `userData`:

```text
managed-courses/<immutable-github-user-id>/catalog.json
managed-courses/<immutable-github-user-id>/<immutable-repository-id>/repo/
managed-courses/<immutable-github-user-id>/.bootstrap/course-bootstrap-<random>/repo/
```

Neither GitHub login, organization login, repository name, course code nor title
participates in the path. Two identities receive separate worktrees for the same
repository. Names are current locators/display metadata only. Root/path components
are validated positive safe integer IDs. Existing directory components and cache
contents are checked for symbolic links before Git/metadata traversal. Unknown
canonical contents are never removed. These internal paths are not faculty settings
and are never written to course files, GitHub, grading state or remote manifests.

The schema-1 per-account catalog has `userId` and repository-ID-keyed `courses`.
Entries retain user/repository IDs, reconstructed local managed path, organization
ID/login, current repository name/full name, default branch, bootstrap state and
last successful validation time. A write uses an exclusive temporary file and
atomic rename. Serialization uses an explicit field whitelist; credentials, OAuth
codes, client secrets and PKCE data never enter the catalog. A corrupt catalog
blocks setup as Needs attention and is preserved. Catalog data is a hint: every
new discovery/restart revalidates actual worktree identity and cleanliness. A
missing worktree is bootstrapped again; an invalid existing one is preserved.

The session publishes queued/bootstrapping progress asynchronously after trusted
course discovery. Only `authorized` candidates enter the bootstrap pool. A named
limit of two bounds both the session workers and the shared scheduler across
refreshes/account switches. Operations targeting the same identity/repository are
serialized. Individual failure does not stop other courses or clear global login.
Refresh courses also retries failed setup; the remote card offers **Retry course
setup** for transient failure. Persistent collisions, wrong identity, dirty cache,
invalid faculty metadata and organization transfers show **Needs attention**.

Immediately before bootstrap, main-process closures revalidate the active immutable
OAuth identity and both `read:org` and `repo` capabilities. The reader resolves
`GET /repositories/{repository_id}` for the current locator/default branch, then
rechecks root course metadata and schema-v1 MSOE section faculty assignments.
Both the discovery organization's immutable ID and any known catalog organization
binding must agree; transfer requires migration/reconciliation. Metadata remains
authoritative and is never generated, repaired or rewritten to pass validation.

Cloning uses the existing bundled Dugite semantic workspace factory with a fresh
operation-scoped authenticated context. The OAuth token remains main-process-only.
The established Git transport injects host-scoped authentication through ephemeral
`GIT_CONFIG_*` environment settings (including disabling credential helpers), not
URL credentials, command arguments, persisted config or files beside the clone.
The stored origin is a normal credential-free GitHub HTTPS URL. Existing publication
and other mutation workflows retain their previous credential resolution; this slice
does not migrate them to OAuth.

The clone goes into a newly created Graider-owned random bootstrap directory.
Before promotion, bundled Git must open the exact worktree root; origin must parse
as a credential-free GitHub locator and resolve to the expected immutable repository
and organization IDs. HEAD must be attached to the resolved default branch with a
commit; `master` is supported. Tracked/staged modifications, conflicts, untracked
files and unexpected HEAD prevent readiness. Ignored files follow the existing Git
inspection semantics. Canonical course/term parsers validate checked-out metadata
and faculty authorization, with current remote/local content comparisons to reject
changes during setup. In Phase 2.4, existing clean clones received the same validation without fetching.
Phase 2.5 checks existing caches structurally during bootstrap/reconciliation, then
classifies and validates their state through synchronization below. Stale local
metadata does not prevent a safe fast-forward to current remote metadata.

Successful validation is followed by a same-filesystem rename into the canonical
`repo` child and only then a ready catalog update. Failure leaves no partial clone
at that canonical path. Cleanup targets only the unique temporary directory created
by the current operation after verifying its account root, ancestry and prefix;
it never enumerates/deletes unknown directories. Crash-retained artifacts are not
automatically swept. Unsafe artifacts are retained for review. Disk-full, unwritable
storage, GitHub scope/SSO/policy/rate-limit and network/transport failures produce
sanitized diagnostics, without exposing raw stderr, absolute temporary paths or
provider payloads. Bootstrap does not invalidate global OAuth identity on its own.

Account switch/sign-out aborts the discovery/session signal and clears active
account course state. Bundled clone has no low-level cancellation API: an in-flight
clone may finish, but the session signal prevents stale promotion/activation; its
known temporary artifact is cleaned when safe. Existing account caches are not
deleted. Switching back revalidates and reuses that identity's own cache. Lost-access
courses disappear from active discovery while disk data remains untouched.

### Transitional operational source and usable workflows

- **Legacy registered course:** its existing registered path remains the operational
  source for dashboard, assignment navigation, grading and mutations. Bootstrap may
  create a separate managed cache for the same repository ID. The registry, origin
  and folder are not migrated; ordinary legacy dashboard refresh timestamps retain
  their existing behavior. One reconciled course card shows managed-cache status.
- **Remote-only managed course:** the same repository-ID card transitions from
  remote/pending through setup to **Cached locally**. **Inspect course** uses a
  narrow main-process ID resolver to read cached course details, term navigation
  and validated assignment titles/statuses. It accepts no URL or path and creates
  no legacy registry record. This metadata view offers no publish, Apply, grading,
  editable-folder, reveal, relocation or other mutation controls. Existing general
  assignment/grading routes continue to require the legacy operational source.
- **Future cutover:** managed paths are not yet authoritative for every operation.
  No pre-mutation guard, dirty-cache repair/reset, transfer migration,
  student download manager, schema-v2 or lifecycle work is included.

### Phase 2.5 — managed course synchronization

The main-process pipeline is OAuth restoration → organization access → remote course
rediscovery → bootstrap/structural reuse → synchronization → managed metadata refresh.
Startup runs asynchronously after window creation. **Refresh courses** repeats the
whole pipeline; **Retry synchronization** uses that same trusted refresh, including
fresh discovery and authorization. There is no periodic fetch timer or synchronization
polling loop. The existing renderer state reader only reads progress.

Identity remains immutable GitHub user ID plus repository ID. Paths are reconstructed
under `managed-courses/<user-id>/<repository-id>/repo`. Renderer cannot supply paths,
URLs, branches, credentials or generic Git commands. Legacy registered paths, student
repositories, templates and Pages repositories are excluded. Legacy paths retain all
operational/mutation workflows; their separate managed cache synchronizes independently
and still produces one dashboard course. Remote-only caches offer course/term/assignment
inspection, not managed mutations.

**Fetching is safe; changing checked-out files is conditional.** Bootstrap and sync
share a per-identity destination lock and a global two-operation limit, including
across overlapping refreshes/account switches. New clones finish bootstrap first.
Each sync revalidates the current immutable user and both OAuth capabilities, resolves
repository ID afresh, checks readability, disabled state and organization binding
against discovery/catalog, and reuses canonical course/term/faculty validation. Invalid
term metadata blocks synchronization. No parallel YAML parser or username identity is
introduced.

Before fetch, existing managed-path, symlink, real local `.git`, alternates and Git
operation protections run again. Origin must be credential-free and API-resolve to
the same repository/organization IDs. Structural corruption, lost authorization,
identity mismatch and organization transfer block fetch. Safe dirty worktrees may
fetch refs for diagnosis; their checked-out files/index remain untouched.

The bundled Git workspace adds semantic `fetchOrigin(authentication)` and
`fastForwardUpstream(expectedHead, expectedBranch)` operations. Fetch uses the verified
origin URL with an explicit remote-tracking refspec instead of trusting configured
destination refspecs. It disables tags/submodule recursion and does not write FETCH*HEAD.
Authentication reuses operation-scoped OAuth transport: ephemeral host-scoped
`GIT_CONFIG*\*` environment, disabled credential helpers and terminal prompting; no
credentials in URLs, argv, config, catalog, logs or renderer. No system Git, GitHub CLI,
environment PAT or credential-store fallback is added. Invalid auth contexts fail.

Each inspection rereads porcelain-v2 branch ahead/behind counts and upstream remote.
Fetched refs are reflected without reopening; post-fetch classification is authoritative:

| State                                                                      | Result                                                                |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Clean, attached expected default branch, expected origin upstream, current | Up to date; no worktree operation                                     |
| Same safety conditions, strictly behind                                    | Revalidate, fast-forward only, inspect and validate metadata; Updated |
| Tracked/staged/conflicted/untracked work                                   | Needs attention — local changes; preserve files/index                 |
| Ahead                                                                      | Needs attention — local commits; safe counts, no push/reset           |
| Diverged                                                                   | Needs attention — cache diverged; no merge/rebase/reset               |
| Detached/unborn HEAD                                                       | Needs attention; no checkout                                          |
| Missing/wrong upstream or missing upstream ref                             | Needs attention; no config changes                                    |
| Changed GitHub default branch                                              | Needs attention; preserve existing branch/upstream                    |
| Organization transfer                                                      | Needs attention — reconciliation; no fetch or relocation              |

Fast-forward freezes a full upstream commit and rechecks HEAD, branch, relationship,
cleanliness and operation markers immediately before `merge --ff-only --no-autostash`.
Hooks and submodule recursion are disabled. Git refuses divergence instead of creating
a merge commit. A refused update is reinspected and reported without force convergence.
After an update, validation requires attached expected branch/upstream, clean/current
relationship, canonical local course/term metadata, agreement with remote metadata,
current faculty authorization and current repository binding. Invalid authoritative
metadata consumed during a race stays checked out as Needs attention. Successful
remote changes are never rolled back to an older commit.

A rename under the same ID reuses its path and refreshes catalog locator metadata.
A safely API-resolved redirect from the old origin is sufficient; origin cleanup is
unnecessary. Default-branch transitions and organization transfers remain deliberate
reconciliation/migration operations.

Separate typed transient synchronization state reports queued/checking/fetching/updating,
up_to_date/updated, failed or needs_attention, safe reasons, commit identifiers/counts
and success timestamp. Schema-1 catalogs remain compatible without migration; successful
sync updates existing whitelisted locator/validation metadata. Transient state and raw
errors are not persisted. Missing catalog entries can be reconstructed from fresh
canonical identities and a validated cache; unknown fields are still discarded.

The compact dashboard shows real service transitions and completed-course counts.
Retryable provider access/policy/SSO, network, rate-limit, authentication and storage
failures preserve cache and sign-in. A Git rejection alone cannot sign out: the session
confirms global invalidity through the identity endpoint before existing credential
removal semantics apply. Lost faculty authorization disables active managed use.
Refresh reinspects manually corrected attention states without resetting them. Successful
sync refreshes open details, including new terms and assignments. Sign-out/account
switch aborts the generation and clears active display. A fetch may finish, but stale
results cannot update a new account UI/catalog or start a worktree update. Namespaces
and disk caches are preserved.

Remote access remains read-only: no REST writes, topics, workflow dispatch, permission
changes, Git push or commit. Fast-forward updates only the local managed cache. No
reset, clean, stash, rebase, merge commit, forced checkout, repair button or automatic
deletion is provided. Managed mutations remain deferred; Phase 2.7 now guards the existing legacy mutation boundaries.

**Phase 2.6 is implemented:** review evidence, explicitly confirm preservation, validate a
fresh authoritative clone, preserve the complete old repository, and atomically replace
the active cache. See the transaction details below. Organization transfer remains migration work.
**Phase 2.7 is implemented** as documented below. The next boundary is an explicit legacy-source
update/cutover policy; managed mutation cutover, OAuth push migration, periodic timing, schema-v2
and student synchronization remain deferred.

### Phase 2.5 validation and Electron evidence

Focused service/lifecycle/dashboard plus real bundled-Git two-clone tests pass
(142 tests). Coverage includes authenticated ref-only fetch, clean fast-forward,
post-update metadata visibility, local/staged/untracked/conflict/ahead/diverged
preservation, operation/path/origin/organization checks, missing/detached upstream,
rename, invalid post-update metadata without rollback, retry, serialization/bounds,
schema-1 catalog compatibility, stale accounts, sign-out and confirmed global auth
invalidity. A canceled fast-forward is refused before the local update. Final
inspection also detects local changes arriving during authorization validation.

On 2026-10-24 the real Electron app restored user **22993125**, reused course
repository **1342086585** (`csc1120/csc1120`) and authenticated its startup fetch.
Startup, process restart, Refresh courses and retry all reported **Up to date** at
`09e782a664f0b6bd31f2afc3655e8799ee7bf4e7`. No production remote changes were made.
The final instrumented run recorded four fetch attempts (one deliberately failed),
193 GitHub API reads, zero REST writes, zero clones/pushes/commits/merges or
reset/rebase/clean/stash operations, and zero system-Git calls. There was one legacy
card and no duplicate remote card. Traced assignment navigation read the original
registered folder. Its config/course files stayed unchanged. The managed cache
remained clean, attached to `master`, current with `origin/master`, on its original
account/repository path. Origin remained credential-free; config/catalog checks
found no credentials. Simulated fetch failure retained cache, encrypted credential
and sign-in; explicit retry recovered without restart.

An isolated remote-only Electron profile reused a copy of the cache with no catalog
entry, reconstructed its schema-1 catalog, fetched once and showed one course card,
one term and 19 assignment metadata entries. No mutation controls were present.
Sign-out removed active metadata/display while leaving the cache on disk; the real
profile remained signed in. There were zero clones, pushes or REST writes.

Separate isolated Electron two-clone smoke fixtures used local bare remotes:
clean-behind advanced exactly to fetched upstream and exposed the new course title;
dirty and diverged scenarios retained their worktree/HEAD evidence as Needs attention.
The synchronization measurements were three fetches, one fast-forward, zero pushes,
commits, merge commits, reset/rebase/clean/stash or system-Git operations. Fixture
setup alone committed/pushed to local temporary remotes. No student repositories
were selected, cloned or synchronized by this slice.

Full backend/UI suites, Git transport/authentication tests, backend/UI typechecks,
lint, formatting, production builds and `git diff --check` were run. Sandbox-only
OAuth callback failures were resolved by running the UI suite with loopback access.
Two backend Git-fixture five-second timeouts under concurrent build/test load were
rerun with two workers; no test timeout or production behavior was weakened.

### Phase 2.4 validation and Electron evidence

Focused managed bootstrap, lifecycle, preload and dashboard tests cover immutable
identity paths, account-scoped catalog persistence/corruption/missing clones,
authorization revalidation, rename/current-locator resolution, transfer blocking
without overwriting the known binding, transaction cleanup/promotion failure,
non-Git/wrong/dirty/unexpected Git states, symlink and external Git-directory
rejection, bounded workers, retry, stale session results, safe inspection and the
remote read-only boundary. Existing bundled-Git authentication/transport coverage
also passes: **3 files, 23 tests**.

Final full backend suite: **138 files, 1488 passed, 1 skipped** with two workers.
Final full UI/Electron suite: **178 files, 1564 passed, 25 skipped** with four workers.
Both backend/UI typechecks, repository lint and formatting, production builds and
`git diff --check` pass. The default-worker UI run encountered an existing async
review-import grading-workspace test failure; the complete four-worker run passed.
The initial sandboxed OAuth callback run could not bind loopback; its unsandboxed
focused rerun passed. Existing PDF standard-font and Vite chunk-size advisories
remain informational.

The real saved OAuth account **22993125**, with both capabilities available,
automatically bootstrapped course **1342086585** at
`<userData>/managed-courses/22993125/1342086585/repo`. Origin remained
`https://github.com/csc1120/csc1120.git`; canonical root metadata validated and
HEAD was attached to `master`. A refresh and a new Electron process reused the
same worktree. The real dashboard had **one legacy card, zero duplicate remote
cards**, with managed-cache readiness visible. Existing assignment navigation
opened `#/course/csc1020/27s1/e3` and finished loading without an error boundary.
The registered path, original origin and original `course.yml` remained unchanged;
ordinary dashboard refresh timestamps changed through the existing workflow.

Real sign-out cleared active managed courses and preserved disk data. Real browser
sign-in restored the same immutable identity and reused the ready clone without
recloning. An injected fresh-clone transport failure was retryable and preserved
sign-in. Restart instrumentation observed **31 bundled Git calls, zero clone/write
Git operations**, and the full live restart/sign-out/sign-in scenario recorded
**109 GitHub API reads and zero API writes**. Config, catalog and application logs
were inspected for both the real token and its encoded Git transport credential;
neither appeared.

An isolated Electron userData profile with the same real authorized account and
**no legacy registration** verified the complete remote-only path. Startup made
**one bundled-Git course clone**, showed one **Cached locally** article, and opened
course details, term navigation and validated assignment titles/statuses without
mutation controls. A new process showed the same card/details with **zero clones**.
The copied OS-encrypted test credential was removed after the restart check.
Only repository ID **1342086585** was cloned. All live scenarios performed **zero
student clones and zero course/GitHub repository writes**. Rename and account-switch
races, malformed/dirty caches, disk errors and rate-limit/access-loss cases use
focused fakes rather than modifying real repositories.

## Phase 2.6 — dirty managed-cache handling and reconciliation

Detection remains automatic; reconciliation never runs automatically. Local changes
(tracked, staged, untracked, conflicts), ahead/diverged history, detached HEAD,
missing/wrong upstream, changed default branch and interrupted operations offer
**Review cache**. A self-contained repository whose GitHub origin resolves to the wrong
repository ID can also be preserved; review explicitly identifies the different repository.
Organization transfer, authorization loss, inaccessible repositories, invalid authoritative
metadata, network/rate-limit/OAuth failure and local storage failures do not authorize replacement.
Transient remote failures retain retry semantics.

`MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`, `rebase-apply`,
`sequencer` and `BISECT_LOG` are recoverable operation markers. Synchronization refuses
to alter those caches; reconciliation preserves the interrupted operation, index and
worktree intact. No abort operation is run. Structural hazards remain **Manual review
required** with no restoration action: symlinks (including dangling links), external
`.git` files, `commondir`, `gitdir`, object alternates/http-alternates, linked/special
files, external worktree/include configuration and nested module storage. Moving such
storage cannot prove preservation of every dependency. Path/link checks are retained.

### Review and confirmation

The trusted main process resolves current account/repository/authorization and managed
path. Renderer inputs are repository ID, generated opaque plan ID and explicit confirmation;
there are no renderer revisions, commands, URLs, paths or editable evidence. Plans remain
in memory and cannot survive restart or account generation changes.

Review shows branch/detached state, original commit, expected current default branch,
upstream and ahead/behind relationship, categorized repository-relative file paths
(Modified, Added, Deleted, Renamed, Staged, Untracked, Conflict), interrupted operation
markers and local-only commit summaries. The semantic bundled-Git reader compares fixed
`HEAD` with origin remote-tracking refs, counts local-only commits, and bounds displayed
subjects/IDs/timestamps to `LOCAL_COMMIT_REVIEW_LIMIT` (10). It never accepts renderer
revisions. These counts describe the last observed origin history; a fresh authoritative
clone and final synchronization establish current remote state. No full commit bodies,
raw Git errors, OAuth context or managed absolute paths cross the review boundary.

The action is **Preserve local cache and restore from GitHub**. The review explains that
Graider creates and validates a new GitHub copy, preserves the entire current repository
locally, replaces only the active managed cache, uploads nothing from the preserved
copy and leaves legacy manually registered course folders alone. Cancel before the
transaction boundary leaves the old cache untouched. The review panel reports real
planning, cloning, validation, preservation and activation stages, without simulated percentages.

A SHA-256 fingerprint includes the trusted account/repository identity, HEAD/upstream,
status projection, local history and operation markers plus regular-file bytes, modes
and inode identities throughout the worktree and `.git` (including ignored/untracked
content, index, refs, objects and reflogs). Git status uses a read-only optional-lock
mode for review. The complete fingerprint is recomputed before preparation and again
immediately before preservation. Changed contents under an unchanged status/path are
therefore stale. A changed plan refuses execution with **Managed cache changed since
review. Review it again before restoring.** Fresh temporary state is fingerprinted too.

### Storage and manifests

Only the canonical account/repository path is active:

```text
<userData>/managed-courses/<github-user-id>/<repository-id>/repo
<userData>/managed-courses/<github-user-id>/.reconcile/replacement-<generated>/repo
<userData>/managed-courses/<github-user-id>/.recovery/<repository-id>/<recovery-id>/manifest.json
<userData>/managed-courses/<github-user-id>/.recovery/<repository-id>/<recovery-id>/repo
```

IDs and temporary/recovery names come from trusted main-process code. Names and user-selected
folders never determine paths. All moves stay on the account filesystem. Recovery is
machine-local evidence, never a registered/operational course or discovery/synchronization
target. No fetch, origin rewrite or other managed mutation runs on preserved repositories.

Each recovery has a private, strict schema-1 manifest; no separate index is needed. Its
whitelist includes generated recovery ID/timestamp, immutable account/repository IDs,
organization identity and display names, original reason/status, HEAD/upstream/history
and operation evidence, categorized changed-path counts, authoritative default branch,
replacement commit and completion state. Tokens, credential-bearing URLs, authentication
environments, arbitrary errors and executable paths are excluded. Completion distinguishes
preparing, preserved, replacement active, completed, rollback restored and manual review.
Manifest reads validate ownership, schema and field whitelist before reveal.

### Fresh clone and atomic transaction

The existing per-cache scheduler covers planning and the entire apply operation; its
global two-operation limit also bounds replacements. Preparation revalidates session,
faculty authorization, canonical remote course/term metadata, repository and organization.
An authenticated bundled-Dugite clone is created in a separately owned `.reconcile`
directory **before** the old cache is moved. Shared bootstrap validation verifies clean
worktree/index, no conflicts/untracked files, attached current default branch,
credential-free origin resolving to the expected repository/organization, canonical
course/term metadata and faculty authorization. Replacement upstream must be current.

After cloning, session/repository/organization/default branch/metadata and local fingerprint
are checked again. The final synchronous path checks and renames have no intervening
await. The old canonical `repo` moves to recovery `repo`, its full fingerprint is verified
without a Git mutation, the manifest advances to preserved, and the fresh `repo` is
renamed into the unchanged canonical path. Once the original moves, cancellation is
not honored until activation or rollback reaches a deterministic state. Filesystem
rename and path/inode checks minimize races; they do not lock out arbitrary external
processes writing the same OS-account storage.

If clone or validation fails, the existing cache stays untouched. If preservation fails,
activation is never attempted. If promotion fails after preservation, Graider tries to
rename the old repository back; successful rollback records rollback restored. Failed
rollback retains recovery evidence and reports local-storage/manual attention, never
healthy state. Manifest persistence failure cannot delete evidence or claim success.
A post-activation authoritative metadata failure keeps the new cache active and marks
Needs attention; it never restores the old dirty cache automatically. Normal synchronization
and metadata inspection run before success; dashboard metadata returns to Up to date.
Only owned temporary directories with matching inode/device and checked contents can
be removed. Recovery copies have **no automatic cleanup or retention expiration**.

Default-branch transitions rebuild from the new authoritative branch; missing/wrong
upstream and detached state rebuild normally without in-place config/checkout repair.
Local-ahead/divergent commits and operation/conflict/index/worktree state remain in
the preserved repository, including `.git`, untracked and binary files.

### Recovery access and boundaries

**Reveal preserved copy** accepts only repository/recovery IDs. Main reconstructs the
account-owned path, validates the manifest and storage, and invokes Electron's trusted
`showItemInFolder` boundary. It cannot reveal the active cache or arbitrary renderer paths.
Validated recovery references are rediscovered for the owning account after restart;
sign-out clears review/UI state but leaves disk evidence intact. Account generations
invalidate old plans and suppress late results. Switching back can reveal owned copies;
another account cannot access them through IPC. Legacy precedence remains unchanged,
with one course card when legacy and managed locations coexist.

Reconciliation has no push, GitHub REST writes, commit, reset, clean, stash, merge,
rebase, forced checkout, conflict resolution, student repository operations, managed
mutation cutover or organization migration. Fixture setup may create local commits,
remote fixture updates and interrupted operations; those are test-only operations.

**Phase 2.7 — pre-mutation synchronization guard** now connects this engine to existing
mutation entry points, with source-version checks and publication-retry semantics. See the
implemented boundary below. Managed mutation cutover, OAuth publishing, periodic sync, student
synchronization and organization migration remain deferred.

### Phase 2.6 validation evidence

Validation on 2026-10-24 passed:

- 50 real bundled-Git reconciliation tests: file/index/binary preservation; staged,
  untracked, normalized added/deleted/renamed paths and conflicts; bounded local history;
  ahead/diverged/detached/upstream/default-branch replacement; all operation markers;
  realistic interrupted merge and rebase; wrong repository; structural/manual-only and
  remote/auth exclusions; content/index/operation/account stale plans; cancellation
  before and during cloning; clone/validation failures; preservation/promotion/rollback/
  manifest failure injection; final authoritative metadata failure; recovery ownership,
  strict manifest whitelist and incomplete recovery restart projection.
- Eight review UI tests, two additional account lifecycle tests and a narrow preload
  identity/confirmation test. Existing discovery, legacy precedence, synchronization,
  bootstrap and security suites remained passing.
- Full backend: 138 files, 1,488 passed, one skipped. Full UI/Electron: 181 files,
  1,703 passed, 25 skipped. Focused bundled-Git transport/authentication regression:
  four files, 92 passed. Backend/UI typechecks, lint, root/UI formatting checks,
  both production builds and `git diff --check` passed. The UI build retains its
  existing bundle-size advisory. Loopback OAuth tests and backend config-cache/build
  writes required running outside the filesystem/network sandbox.
- Real Electron smoke used an isolated copy of the account profile and real `csc1120`
  managed cache. The production cache received healthy read-only inspection only.
  Healthy state had no Review cache control. Dirtying only isolated `course.yml`,
  refreshing, reviewing its changed path and confirming restoration produced a clean
  Up to date active cache and a recovery containing the edited file and Git index.
  The trusted reveal action opened the recovery; traversal input was rejected.
  Planning/cloning/validation/completion stages were observed through real state;
  preservation/activation stage emissions are also asserted in integration tests.
- Instrumented isolated restoration recorded 154 GitHub reads, zero GitHub writes,
  one authenticated bundled clone, three fetches, zero pushes, zero commits, zero
  reset/clean/stash/rebase/merge/abort commands and zero system-Git calls. Restart
  confirmed healthy active state and owned recovery rediscovery. Sign-out cleared
  UI and denied reveal while retaining disk recovery. Restoring the isolated copied
  credential on another launch tests ownership re-entry without interactive OAuth.
  No production remote, legacy course folder or student repository was mutated.
  Local fixture setup intentionally uses fixture commits/pushes and merge/rebase to
  construct test histories; those are separate from instrumented reconciliation.

## Phase 2 / Slice 2.7: trusted pre-mutation synchronization

The main-process `ManagedCourseMutationGuard` uses the managed clone as the freshness oracle.
The registered legacy folder remains the operational source and mutation destination. Remote-only
courses remain inspection-only. No managed path or reusable guard ticket crosses IPC.

`courseMutationIpc.ts` records the enforced mutation inventory. Course-admin handlers cover roster
save/remove, section remove, existing-course setup replacement, assignment setup/edit/delete/group configuration, Student Access Pages
configuration, and Comment Library create/edit/delete. Course-driven remote handlers cover Apply,
grading dispatch, individual/bulk workflow repair, individual/bulk report publication, Access Page
publication, template workflow save/replacement, and template distribution. Explicit Publish Course
Changes uses publication-retry mode. The existing save/publication services run inside the boundary.
Student Access Pages configuration remains a local save requiring subsequent publication.

Resolution uses the trusted registry ID/path and discovery's immutable-repository mapping, scoped to
the active immutable user ID. Ambiguous or unavailable mapping fails closed. One target-course session
operation invokes existing synchronization and repository/organization/schema-v1 faculty revalidation;
it does not rediscover every organization. The synchronization result supplies `currentCommit`, the
exact validated authoritative SHA. The source validator checks self-contained Git storage, origin's
resolved repository and organization IDs, attached default branch and origin upstream, conflicts,
and source version. Missing MSOE faculty identity blocks before mutation; existing section and
assignment authorization still runs. A GitHub login never substitutes for the MSOE username.

New mutations require legacy HEAD equal to authoritative HEAD and no staged, unstaged, renamed, or
untracked Graider-managed pending paths. Path classification reuses course publication policy.
Unrelated local files remain allowed subject to existing publication rules and storage safety.
Ahead, behind, diverged, detached, mismatched or unprovable sources block; Graider does not pull,
reset, replace or reconcile the legacy folder. Previous unpublished changes must be published or
resolved before another mutation.

Publication retry allows pending working-tree changes on the authoritative baseline, or committed
local history proven to descend from that baseline through the read-only exact-SHA `isAncestor`
primitive. Remote advance beyond the local baseline or divergent history blocks. Existing staging,
commit and non-force push semantics remain authoritative; publication failures preserve local evidence.
A remote race after the guard remains possible and existing write conflicts must still fail safely.

The per-account/repository mutation queue encloses synchronization, source validation, the existing
operation, and immediate publication. Lock ordering is mutation queue -> managed synchronization
queue; synchronization releases its cache lock before legacy mutation. Reconciliation takes only the
managed cache queue and never enters the mutation queue. Different courses remain independent.
Waiting requests retain the session generation; account change/sign-out invalidates them. Identity
is revalidated after source inspection before handing the internal frozen context to the operation.
Duplicate submissions of the same IPC action are refused while it is running. Bulk operations guard
once at the outer batch boundary; existing per-student checks remain intact.

Sanitized block reasons distinguish retryable synchronization, reviewable/manual cache problems,
authorization/faculty identity, organization migration, stale/mismatched/unsafe operational source,
remote-only mutation, and local storage failure. A shared notification surface shows checking and
remediation, reusing `ManagedCacheReview` directly. Review/cancel/reconciliation never resumes a
mutation: faculty must invoke the original action again, which runs a fresh guard. Notifications
cannot authorize writes. Apply still rebuilds its CLI plan from the guarded operational config and
runs the separate existing `evaluateMutationGuard`; renderer preview data is not executed as a plan.

Initial course setup remains outside the guard before course identity exists. Setup cannot overwrite
an existing course.yml or registered course through this exception. Subsequent discovered course
mutations use normal guarded handlers. OAuth authenticates freshness checks only; existing mutation
transport credentials remain transitional and unchanged.

Excluded: draft typing, local student comments/adjustments/completion, editor autosave, read-only
previews/reports, local/account settings, discovery/bootstrap/sync/reconciliation/recovery reveal,
student Pull Latest, clone/download, local Access Page generation, review import, and local grading
workspace preparation. These do not become network-guarded course mutations.

Next boundary: an explicit design for safely updating/cutting over the legacy operational source,
followed by managed-course mutation semantics. This slice adds no automatic legacy update, managed
mutation cutover, OAuth write migration, student synchronization, schema-v2 roles, periodic fetch,
automatic reconciliation, migration, or remotely durable grading state.
