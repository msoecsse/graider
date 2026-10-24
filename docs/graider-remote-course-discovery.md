# Remote Graider course discovery and managed bootstrap

Phase 2.4 implements identity-scoped initial course/admin bootstrap after discovery.
See [current bootstrap behavior, operational precedence and Phase 2.5](#phase-24--identity-scoped-managed-course-bootstrap).
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
changes during setup. An existing clean clone receives the same validation and is
reused **without clone, fetch, pull, reset or branch switching**.

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
  No synchronization, pre-mutation guard, dirty-cache repair/reset, transfer migration,
  student download manager, schema-v2 or lifecycle work is included.

### Phase 2.5 — managed course synchronization

Add explicit authorized refresh of existing managed course/admin caches: revalidate
identity/scopes/repository and organization binding, inspect cleanliness and HEAD,
fetch with the same operation-scoped OAuth transport, validate remote metadata,
and fast-forward only a clean cache with a safe matching upstream. Keep local
changes, unexpected branches, divergence and transfer cases intact as Needs
attention. Define cancellation, per-course progress/retry and account isolation for
sync, with focused transport/failure tests. Preserve legacy operational precedence
until a separately reviewed cutover. Do not include OAuth mutation migration,
student clones, schema-v2 migration, reset/conflict repair or synchronization timers
without a separately agreed scope.

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
