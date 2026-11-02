# Graider Architecture Evolution — Dependency-Ordered Implementation Roadmap

## Guiding Approach

Implement this as a program of small, testable slices rather than one “multi-machine support” branch.

Each slice should:

- preserve current behavior unless intentionally migrating it;
- add tests before implementation;
- maintain Electron renderer/preload/main trust boundaries;
- avoid opportunistic UI redesign;
- automatically commit/push after the required validation suite is green;
- update the architecture/specification as implementation decisions become concrete.

The program should supersede the old narrow interpretation of ITEM-26.

A useful backlog split is:

- **REMOTE-COURSE** — remote discovery, managed course synchronization, identity, permissions, lifecycle;
- **DEEP-LINKS** — stable repository-ID-based `graider://` navigation;
- **GRADING-SYNC** — remotely durable grading state and concurrency;
- **ASSIGNMENT-REVISION** — section state, revision tracking, templates, selective propagation;
- **DISTRIBUTION** — authentication, packaged Git engine, signing, releases, auto-update;
- **MIGRATION** — existing-course schema migration and reconciliation.

---

# Phase 0 — Freeze the Design Contract

## Slice 0.1 — Architecture documents

Commit the requirements specification and derive:

- schema-v2 design notes;
- authorization matrix;
- lifecycle state diagrams;
- filesystem layout;
- migration decision table.

No production behavior changes.

## Slice 0.2 — Authorization matrix tests

Before changing implementation, encode the intended permission matrix in domain-level tests.

Cover:

- current section faculty;
- former section faculty;
- current coordinator;
- former coordinator;
- fallback administrator;
- historical normal faculty;
- Draft-term faculty;
- unrelated faculty.

This becomes the executable permission contract for later slices.

---

# Phase 1 — Foundational Remote and Packaging Abstractions — Complete

These are prerequisites for seamless new-machine operation.

## Slice 1.1 — Local Git workspace abstraction — Complete

Introduce a narrow local Git abstraction without changing behavior yet.

Required capabilities:

- status;
- clone;
- fetch;
- fast-forward/update;
- commit;
- push;
- diff;
- revision lookup;
- branch/default-branch inspection.

Do not bind domain code to a specific implementation.

Phase 1.1B completed the system-Git-backed abstraction and its production
execution boundary. Phase 1.2 embedded/bundled Git-engine proof and selection
is complete.

## Slice 1.2 — Embedded/bundled Git engine proof — Complete

Select and validate the implementation that eliminates the system-Git prerequisite.

Acceptance must include:

- macOS Apple Silicon packaged build;
- Windows x64 packaged build;
- private GitHub clone/fetch/push;
- repositories containing normal course/student project sizes;
- paths with spaces;
- no shell Git dependency.

This deserves an explicit technical spike before widespread refactoring.

Phase 1.2 is complete. Dugite 3.2.3 is selected and bundled in accepted macOS arm64 and Windows x64
packages. Acceptance includes private GitHub clone/fetch/push/delete, paths with spaces, no
shell/system-Git dependency, cutover of all production consumers, and removal of system-Git
execution.

## Slice 1.3 — GitHub host abstraction cleanup — Complete

Phase 1.3 — GitHub host abstraction cleanup — Complete. The host boundary,
CLI composition, generated backend composition, repository validation, and
workflow read/write migrations (1.3A through 1.3C-2) are complete. See
[the GitHub host boundary](graider-github-host-abstraction.md).

Template workflow editing uses metadata-bearing file reads and an explicit
conditional write. Caller blob SHA/expected absence remains authoritative;
HTTP 409/422 project as conflicts without refreshing the expected SHA.
Generic upsert semantics and renderer/preload/IPC DTOs are unchanged. No direct
REST feature exception remains, and architecture tests enforce centralized
GitHub API ownership. Future capabilities remain deferred until needed.

Phase 1 acceptance is complete:

- Semantic local Git workspace established.
- Dugite 3.2.3 packaged; macOS arm64 and Windows x64 validated.
- Private GitHub Git transport validated; no system-Git prerequisite.
- All production Git operations use the bundled engine.
- GitHub API boundary and production client composition centralized.
- Octokit/REST transport confined to the approved adapter/factory boundary.
- Git transport credentials remain separate from API-client composition.
- Architecture tests protect both local Git and GitHub host boundaries.

Phase 2 slices 2.1–2.9 are implemented: OAuth identity, organization access, course
discovery, account-scoped managed bootstrap/synchronization/reconciliation, safe explicit
legacy fast-forward, and registered-course managed operational cutover. Managed course-admin
mutations now validate and publish transactionally with OAuth; unrelated mutation transports
retain their existing credentials. Remote-only mutation enablement is next. See the
[Slice 2.9 contract](graider-remote-course-architecture.md#phase-2--slice-29-managed-course-mutation-cutover).

---

## Resolved post-Phase-1 publication regression

Discovered immediately after Phase 1 closure: assignment creation successfully saved
`assignment.yml`, but automatic Course Publish hung during an unauthenticated bundled-Git
push after committing locally. Student Access Pages contained the same latent defect.
Both publication paths now resolve trusted GitHub credentials before staging/committing
and use a fresh, uncached operation-scoped authenticated Dugite factory/context pair for
push. Missing authentication returns a safe failure, preserving saved files for retry;
manual Course Publish also pushes existing ahead commits without recreating assignments.
The Electron publication writer requires explicit push authentication. Transitional token
precedence remains transitional for existing mutation paths during Phase 2.

# Phase 2 — First-Class Authentication

## Slice 2.1 — Browser-based GitHub sign-in (complete)

One active immutable GitHub user identity, authorization-code + PKCE in the system
browser, OS-encrypted credential persistence, transactional account replacement,
sign-out and restart restoration. Credentials remain main-process only.

## Slice 2.2 — Organization access (complete)

Authoritative `read:org` capability evidence, paginated memberships, normalized
role/state, per-organization policy/SSO/pending/transient classification, and
transactional authorization upgrades. Committed as `81b0c88`.

## Slice 2.3 — Remote Graider course discovery

Read-only OAuth discovery of topic and legacy course/admin candidates, existing
schema-v1 validation and faculty section authorization, immutable repository IDs,
and reconciliation with the current path-based registry. Adds required `repo`
scope for private contents; scope breadth grants no slice-level write authority.
See [implementation details and limits](graider-remote-course-discovery.md).

## Slice 2.4 — App-managed course bootstrap (implemented)

Account/repository-ID storage under Electron userData, a per-account catalog,
fresh repository-ID/identity/scope/faculty validation, operation-scoped OAuth
Dugite clone, transactional validation/promotion, bounded workers, retry and
Needs attention states. Existing registered paths remain operational. Remote-only
courses offer cached course/term/assignment metadata inspection without registry
workarounds or mutation controls. No ongoing synchronization or student cloning.

## Slice 2.5 — Managed course synchronization (implemented)

Startup, Refresh courses and retry revalidate identity/capabilities/repository ID,
organization binding, schema-v1 metadata and faculty authorization, authenticate
bundled-Git fetch and inspect again. Only clean attached expected default branches
with expected origin upstream can fast-forward. Current caches stay untouched;
dirty/ahead/diverged/default-branch/structural/transfer states retain evidence as Needs
attention. Post-update metadata validates without rollback. Separate typed progress,
completed-course counts, retries, per-cache serialization, two-operation concurrency
and stale-account guards preserve legacy precedence and schema-1 compatibility.
No timers, repair/reset, push/REST writes, managed mutation migration or student Git
operations. See [semantics and validation](graider-remote-course-discovery.md#phase-25--managed-course-synchronization).

## Slice 2.6 — Dirty managed-cache handling and reconciliation (implemented)

Explicit review and confirmation preserve the entire app-owned repository, including
index, untracked/binary files, local history and interrupted operations. A validated fresh
authoritative clone is prepared first, then the old repository moves to account-scoped
recovery and the replacement is atomically promoted. Content fingerprints reject stale
plans. Promotion failure attempts rollback; manifests track incomplete transactions.
External/linked Git storage is manual-only; organization transfers remain excluded.
Recovery is retained indefinitely and revealed through an account-owned ID-only action.
No remote writes, in-place Git repair, managed mutation cutover or legacy/student changes.
See [implementation details](graider-remote-course-discovery.md#phase-26--dirty-managed-cache-handling-and-reconciliation).

## Slice 2.7 — Pre-mutation synchronization guard (implemented)

Guard existing mutation entry points with operational-target validation, synchronization
and canonical metadata/authorization checks. Block unsafe/stale/local-change states and
route eligible cases to explicit Phase 2.6 review. Preserve legacy operational precedence.
Do not bundle managed mutation cutover, OAuth push migration, organization migration,
periodic synchronization, student synchronization or schema-v2 changes.

---

# Phase 3 — Production Release and Update Foundation

This phase must be functional before a schema-breaking migration reaches Stable.

## Slice 3.1 — Windows production installer

Replace the portable-only release path with a signed Windows x64 installer.

## Slice 3.2 — macOS production signing

Configure:

- Developer ID signing;
- notarization;
- production DMG.

## Slice 3.3 — GitHub Release pipeline

Automate tagged releases with:

- macOS installer;
- Windows installer;
- checksums/metadata;
- release notes.

Preserve older releases.

## Slice 3.4 — Stable and Preview channels

Add update-channel metadata and channel selection.

## Slice 3.5 — Auto-update

Routine updates:

- check automatically;
- download in background;
- install on restart.

Add mandatory-update handling for incompatible course schemas.

## Slice 3.6 — Strict version/schema gate

A client encountering an unsupported newer course schema must stop and require application upgrade.

No partial course operation.

---

# Phase 4 — App-Managed Course Catalog and Discovery

Initially make this read-only.

## Slice 4.1 — Managed course cache

Create identity-scoped app-managed course storage.

Do not use faculty-selected folders for course/admin repositories.

## Slice 4.2 — Remote course identity

Add immutable GitHub repository ID to the course model.

Teach Graider to follow repository/organization renames by ID.

## Slice 4.3 — Course topic

New Graider course repositories receive `graider-course`.

Discovery treats it only as a hint.

## Slice 4.4 — Account-wide discovery

After authentication:

- enumerate accessible organizations/repositories;
- prioritize topic matches;
- validate `course.yml`;
- validate repository identity;
- resolve faculty identity;
- return only authorized courses.

## Slice 4.5 — Automatic bootstrap

Automatically clone all discovered course/admin repositories.

Include:

- archived;
- hidden;
- historical;
- shared.

## Slice 4.6 — Background discovery

Periodically detect newly granted course access without restarting Graider.

---

# Phase 5 — Synchronization Engine

## Slice 5.1 — Read-only synchronization

Implement startup and periodic fetch/update for clean managed course repositories.

## Slice 5.2 — Dirty managed-repo handling

Detect manual local edits.

Do not overwrite them.

Provide:

- validation;
- review;
- publish/reconcile path;
- Needs attention state.

## Slice 5.3 — Pre-mutation synchronization guard

Every mutation synchronizes and validates its source version before writing.

## Slice 5.4 — Remote-commit mutation semantics

Mutation success requires:

- local validation;
- commit;
- push success.

A failed push restores the managed clone to authoritative remote state.

## Slice 5.5 — Domain-aware conflict surface

Start with the highest-value conflicts:

- assignment stale edit;
- roster changed remotely;
- section assignment state changed remotely.

Do not attempt a generic Git conflict editor.

---

# Phase 6 — Schema v2 Core Identity and Authorization Model

Do not migrate user courses yet. First make loaders/models/tests understand the new schema.

## Slice 6.1 — Persistent faculty directory

Add logical faculty records containing:

- institutional username;
- immutable GitHub user ID;
- current login;
- identity history.

## Slice 6.2 — Fallback administrator

Add transferable course-level recovery authority.

## Slice 6.3 — Term coordinator model

Support:

- multiple current coordinators;
- former coordinators;
- historical coordinator access.

## Slice 6.4 — Section faculty history

Replace simple faculty username arrays with current/former assignment history.

## Slice 6.5 — Unified authorization resolver

Implement a reusable authorization service to eventually replace grading-only faculty scoping.
Slice 6.5 is complete as a Schema v2 domain core; production v1 scope and both operational
schema gates remain unchanged. Activation and Electron service migration are deferred.

It must answer both:

- what the faculty member may see;
- what mutation they may perform.

This should become the shared trust boundary for Electron services.

## Slice 6.6 — Remove grader role (complete)

The grader role is removed from the target model. Schema v2 strictly rejects
`github.grader_team` and `github.grader_permission`. Anyone who grades is section
faculty; `AuthorizationResolver` has no grader role fact or capability.

Course Setup still writes Schema 1 without grader fields. Individual/group planning,
Apply execution, GitHub readiness, and the Apply preview no longer introduce or act
on grader state. Existing faculty/student permission mechanisms remain in place.

Schema v1 retains deprecated parsing of old grader fields. Manifest v1 retains
historical grader permission records and opaque diagnostics, including round-trip
serialization to preserve evidence; these are never desired permissions. Manifest v2
and new v1 manifests introduce no grader state. No existing course is rewritten and
no GitHub team or permission is removed. Both operational schema gates remain **1**;
production faculty scope remains v1.

Phases 6 and 7 and Slices 8.1–8.6 are complete. Next: **Phase 9 / Slice 9.3 — Assignment Migration**.
Persisted configuration removal and GitHub team reconciliation remain explicitly
scheduled for **Phase 9.4**. See the
[Slice 6.6 inventory and compatibility boundary](graider-remote-course-architecture.md#phase-6--slice-66-remove-grader-role).

---

# Phase 7 — GitHub Desired-State Permission Model (complete)

## Slice 7.1 — Managed team identities (complete)

The pure desired-state identity model defines seven kinds:

- `course-read`, `course-write`, `course-current-coordinators` (no term/section scope);
- `term-current-coordinators`, `term-former-coordinators` (term required, section forbidden);
- `section-current-faculty`, `section-former-faculty` (term and section required).

Ownership uses the entire GitHub team description: `graider-team:v1:` followed by
canonical compact JSON with fixed field order `courseRepositoryId`, `kind`, optional
`termCode`, optional `sectionId`. The immutable course/admin repository ID comes
from trusted outer course context, not YAML or organization/repository/course names.
One renderer/parser validates scopes, existing term-code rules and opaque nonempty
term-model section IDs. Unsupported versions stay opaque; malformed/noncanonical
metadata cannot establish ownership. Human-readable names/slugs never identify teams.

Observed resources preserve numeric GitHub team IDs separately from logical identity;
renames change locators only. Classification distinguishes this course from other
courses and unmanaged teams, and fails closed for invalid concrete team IDs. Duplicate
selected-course claims by distinct team IDs produce **Needs attention** conflicts
containing all claiming resources, with no automatic winner or resolution. Legacy v1
`faculty_team`, historical grader teams and similar names are never auto-adopted.

Only the existing GitHub read projection gained description support; no live team,
membership, invitation, permission or rename reconciliation runs. Both operational
schema gates remain **1**, and production v1 faculty-team behavior is preserved.
See [the full metadata contract](graider-remote-course-architecture.md#115-managed-team-identity-contract-slice-71).
Organization invitation infrastructure and managed-team membership are complete in
7.2/7.3 below; course and student permissions are complete in 7.4/7.5, with explicit
legacy adoption in Phase 9.

## Slice 7.2 — Faculty organization invitation (complete)

Backend-only desired-state infrastructure derives organization membership intent from
every persistent faculty-directory identity, independently of current/former role.
Typed access states are Active, Pending invitation, Invitation required and Needs
attention. Immutable user IDs are verified against current login resolution, member
inventory and invitation invitees; directory identity is never silently rewritten.

Paginated membership/invitation reads feed read-only directory classification and a
single-identity reconciler. Verified active/pending access causes no mutation. One
explicit invitation uses immutable `invitee_id`, then rereads observable state after
success or ambiguous transport failure. Serialized retries and a caller-retained
unresolved-write guard prevent duplicate attempts; future production composition must
persist that guard durably and enforce trusted session/course/repository boundaries.

Owner privilege and appropriate GitHub write capability are required. Existing OAuth
scopes stay unchanged; missing scope, SSO/OAuth restrictions, forbidden/hidden access,
rate limiting, network and malformed results become typed Needs attention. Pending
remains valid intended course participation, preserves modeled authorization and must
not block future term activation solely due to incomplete GitHub access.

No production v2/IPC/setup invitation flow, team membership, removal, cancellation or
permission mutation is introduced. Both operational gates remain **1**. Slice 7.3
should consume these access states to defer team reconciliation for Pending faculty.
See [the access contract and trust requirements](graider-remote-course-architecture.md#116-faculty-organization-access-contract-slice-72).

Team membership, repository permissions and branch policy are implemented below. Phase 7 is complete.

## Slice 7.3 — Team membership reconciliation (complete)

Pure desired membership uses exact current/former coordinator and section-faculty
sets per supplied term/section. Course-wide teams use the single strongest role
across supplied terms: current coordinator → `course-current-coordinators`, otherwise
current section faculty → `course-write`, otherwise any former role → `course-read`.
Directory-only faculty and fallback administration do not implicitly enter a team.
No lifecycle filtering is inferred, and the caller supplies the complete intended term
set before course-wide removals. Unsupplied-term team cleanup remains deferred.

Backend reconciliation consumes 7.1 canonical managed identities and 7.2 organization
access. Complete paginated inventory, owner visibility, duplicate detection, numeric
resource verification and fresh preflight reads precede writes. Malformed/opaque
ownership and nested membership need attention; other-course, unmanaged and legacy
teams remain untouched. Missing teams are created with canonical metadata and
deterministic display names, journaled before POST and verified by rereading inventory.
An unresolved creation cannot be blindly repeated, including after an account switch.

Active faculty may be added; Pending, Invitation-required and Needs-attention faculty
remain explicit incomplete dependencies. Extra members are removed **only** from
proven managed teams. All login mutation locators are checked against immutable IDs.
PUT/DELETE success and ambiguous outcomes are verified by remote membership rereads;
idempotent reruns produce no writes once correct. Per-team/per-faculty outcomes
preserve partial progress and stop affected teams when snapshots become unsafe.

No production v1 workflow is wired to these APIs, and both operational schema gates
remain **1**. Production activation still requires trusted OAuth/course/repository/
revision authorization, complete term inputs, shared serialization and a durable
creation journal. No repository permissions, invitations, organization removal,
team rename/deletion, adoption, migration or lifecycle is introduced.
See [the full membership contract](graider-remote-course-architecture.md#117-managed-team-membership-contract-slice-73).

Repository permissions and branch policy are implemented below. Phase 7 is complete.

## Slice 7.4 — Course repository permissions (complete)

Backend-only reconciliation maps proven course-wide managed teams exactly:
`course-current-coordinators` → `admin`, `course-write` → `push`, `course-read` → `pull`.
It upgrades missing/lower access, reduces excessive access and leaves exact access alone.
It consumes fresh read-only 7.3 inspection, including safe Pending membership without
unauthorized extras; unsafe/missing/duplicate team outcomes cannot authorize a grant.
No parallel team creation or membership implementation is introduced.

Canonical repository and expected organization **IDs** bind every mutation to the
selected course. Fresh repository/session/team checks supply current locators and
accept renames; repository transfer is a migration condition. Complete repository-team
pagination and post-write observations verify both successful and ambiguous writes.
Later explicit idempotent retries require fresh observed drift, with no blind adapter retries.

Fallback administration receives separate direct admin after 7.2 Active identity
verification. GraphQL permission-source inventory proves a Repository grant independent
of team/organization access. Pending remains incomplete. Direct collaborators lack
ownership metadata and are never swept/revoked; former-fallback transfer cleanup needs
durable provenance and a future explicit policy.

Proven selected-course term/section course-repository grants may be removed only after
safe complete scoped membership, all exact course-wide grants with non-Pending membership,
and verified fallback admin. Other-course grants are surfaced as Needs attention;
unmanaged/legacy/malformed ownership is never adopted or mutated. 7.3's durable
creation journal remains a production requirement, with no second creation path.

Both operational gates remain **1** and production v1 Apply/setup/discovery/grading
behavior is unchanged. No student permissions, branch rules, invitations, organization
removal, migration or lifecycle is activated.
See [the full permission contract](graider-remote-course-architecture.md#118-courseadmin-repository-permission-contract-slice-74).

Student permissions and branch policy are implemented below. Phase 7 is complete.

## Slice 7.5 — Student repository permissions (complete)

Backend-only individual/group target validation requires trusted immutable repository,
course and organization IDs plus exact term/section/assignment/target identity and
single-section evidence. Duplicate/conflicting mappings are blocked before writes;
independent valid targets continue. Names/URLs never establish scope. Existing individual
manifest records may provide their observed numeric repository ID; ID-less legacy and
current group target projections require explicit trusted ID resolution. No manifest
schema or Phase 11 section-state migration is introduced.

Exact grants are current term coordinators → `admin`, current section faculty → `admin`,
former term coordinators → `pull`, former section faculty → `pull`, scoped precisely
to the target. Multiple roles remain independent sources of GitHub's strongest effective
permission. Course-wide teams and fallback-only administration receive no implicit grant.
Historical read is intentional; no Phase 8 lifecycle filtering is inferred.

7.4's canonical repository, pagination and numeric team checks are shared with this
slice. Fresh read-only 7.3 inspection permits safe Pending memberships, blocks unsafe
or missing teams, and never creates teams or changes members. Missing/lower/higher
grants reconcile exactly. Undesired selected-course managed grants are removed only
after all four replacements and complete ownership snapshots are safe; Pending alone
does not preserve wrong-section access. Unmanaged/legacy/malformed claims are never
adopted or removed, and other-course access is surfaced as Needs attention.

Repository transfers are migration conditions; renames refresh locators without changing
identity. PUT/DELETE success and lost responses require observed-state verification;
later explicit retries start with fresh reads. Per-repository/per-team outcomes preserve
partial progress and safe reasons. Direct student/group/arbitrary collaborators remain
untouched. Both operational gates remain **1**, with no production workflow wiring.
Future composition still requires trusted session/source/authorization/scope bindings,
complete intended term state, shared serialization and 7.3's durable creation journal.
See [the complete student/group permission contract](graider-remote-course-architecture.md#119-studentgroup-repository-permission-contract-slice-75).

Managed branch policy is implemented in 7.6 below. Slices 8.1–8.6 are complete; next: **Phase 9 / Slice 9.3 — Assignment Migration**.

## Slice 7.6 — Managed branch rules (complete)

Backend-only protection blocks force pushes and deletion on the canonical course
default branch and trusted individual/group submission branches, while preserving
ordinary student pushes and Graider's direct commits. Administrator enforcement is
enabled because students may hold admin permission; no automatic recovery bypass,
PR/check/approval/signature/history/deployment/lock/push-restriction policy is introduced.

GraphQL exact rules are tightened by immutable rule ID with only three owned fields:
`allowsForcePushes: false`, `allowsDeletions: false`, `isAdminEnforced: true`. Existing
compatible manual settings survive; incompatible/unknown policy fails closed. Complete
rule inventory, GitHub's effective ref rule ID and REST effective protection verify
identity and behavior. Compatible wildcards may satisfy policy; a weak minimal wildcard
may receive a verified exact exception, with no global wildcard edits or guessed winners.

Repository/parent rulesets and branch-effective rules are read only. Applicable active
rulesets, active push rulesets and unassessed semantics need attention rather than being
modified, adopted or layered over blindly. No retired/manual branch rule is cleaned up.

Course/student repository IDs and immutable organization/account identity are refreshed
before writes. 7.5 ID→scope/group validation is reused. Default branches come from fresh
GitHub state; trusted runtime `submissionBranch` overrides are supported without changing
assignment schema. Missing refs, transfers, default changes and rule ambiguity block
mutation. Independent targets continue safely after another branch failure.

Non-idempotent exact creation is journaled durably before POST in future production
composition; unresolved outcomes cannot automatically create again. Partial updates
and creations both require complete effective-policy rereads, including after lost
responses. Admin enforcement is corroborated by REST, and idempotent reruns do no work.
Both operational gates remain **1**, with no production v1 workflow wiring or Phase 8 work.
See [the full managed branch contract](graider-remote-course-architecture.md#1110-managed-branch-policy-contract-slice-76).

**Phase 7 and Slices 8.1–8.6 are complete. Slice 9.1 is complete. Slice 9.2 is complete. Next: Phase 9 / Slice 9.3 — Assignment Migration.**

---

# Phase 8 — Term Lifecycle

## Slice 8.1 — Draft / Active / Archived model — complete

Schema v2 requires persisted `term.status`: `draft`, `active`, or `archived`.
Missing or unknown status fails strict validation. Schema v1 is unchanged; dates,
academic year, semester, term code and assignment dates never infer lifecycle.

`CourseTermLifecycle` validates and deeply freezes a snapshot of the complete supplied
v2 term set, rejects duplicate term codes and multiple Active terms, and exposes
`getDraftTerms()`, `getArchivedTerms()`, `getActiveTerm()`, `requireActiveTerm()`,
`getTerm(code)` and `getStatus(code)`. Unknown lookups return `undefined`.
Any valid snapshot has **at most one Active**. Zero Active is valid for initial setup
before first activation, future course archive and recovery/intermediate inspection.
Workflows needing exactly one use `requireActiveTerm()`, which fails if none exists.
Multiple Draft and multiple Archived terms are allowed, including Draft-only,
Archived-only and mixed collections. Callers are responsible for supplying all terms.

The pure normal-transition contract allows only `draft → active → archived`.
`canTransitionTermStatus()` returns false for same-state assignment;
`assertTermStatusTransition()` accepts it as a no-op. Skips and backward transitions
fail. Slice 8.5 rollback uses a separate recovery-specific operation.

Lifecycle does not change coordinator or section faculty current/former history,
fallback administration or the faculty directory. Current/former records explicit
role removal, not the end of a term. The requirement for at least one current
coordinator is preserved for every status.

No lifecycle authorization or GitHub behavior is applied: Phase 6 decisions and
Phase 7 desired membership, repository permissions and branch policy remain unchanged
over all supplied terms. Activation, restrictions, deletion, recovery and course
archive remain deferred. Both operational schema gates remain **1**; Course Setup
still emits v1. No real course migration or production UI/Electron controls are added.

See [architecture §9](graider-remote-course-architecture.md#9-term-lifecycle).

Slice 8.2 below now applies Draft authorization through a separate policy wrapper.

## Slice 8.2 — Draft-term preparation permissions — complete

`DraftTermAuthorizationResolver` composes `CourseTermLifecycle`, the selected Draft's
Phase 6 `AuthorizationResolver`, the optional Active term's resolver and
`FallbackAdministrator`. It snapshots a validated course, the complete trusted v2
term set, the target code and authenticated immutable GitHub ID. Missing/non-Draft
targets, duplicate codes and multiple Active terms fail explicitly. Outer callers
remain responsible for course/source/session authenticity and term-set completeness.

Draft metadata visibility is limited to current Draft section faculty, current Draft
coordinators, current Active-term coordinators and fallback administration. Former-only
Draft roles and former Active coordinators gain no Draft visibility. Independent
current roles still apply. Zero Active is valid: native Draft roles and fallback
setup/recovery work normally, with no cross-term coordinator authority.

`canViewDraftSection()` / `canPrepareDraftSection()` allow current Draft faculty only
in their own sections by default. Draft or Active-term current coordinators can
explicitly expand via `coordinator-term`, including unassigned sections.
`getDraftSectionScope()` returns frozen visible/preparable IDs; preparation includes
rosters, section assignments/settings, deadlines/policies and grading workflows.
`canManageDraftStructure()` allows native Draft or current Active-term coordinators
to configure sections/faculty. Cross-term access never rewrites Draft role facts.

Fallback can view Draft metadata and use `canManageDraftCoordinatorSetup()` for
initial setup or handoff repair; current Active-term coordinators also have that
narrow recovery capability. It grants no ordinary section/roster/assignment visibility
or generic structure management to fallback-only administrators. Native Draft
coordinators retain their separate normal structure authority.

`canPerformStudentFacingOperation()` accepts the typed categories in
`DRAFT_STUDENT_FACING_OPERATIONS`: Apply/provisioning, grading dispatch, grading,
report publication and student-repository mutation. All are denied for every role
with `draft-student-facing-operation-prohibited`. Preparation permission must never
authorize execution. Decisions distinguish native, cross-term, recovery, former-role
and absent authority; all public results are immutable.

Phase 6's primitive and Active behavior are unchanged; Phase 7 still uses all supplied
terms without lifecycle filtering. No GitHub mutation, activation mutation or production
v1 wiring is added. Both operational schema gates remain **1**; Course Setup emits v1,
and no real course migrates. Archived policy is implemented separately in 8.4 below.

See [architecture §9.1](graider-remote-course-architecture.md#91-draft).
Slice 8.3 below now implements the metadata and desired-state transition as separate ordered steps.

## Slice 8.3 — Atomic activation — complete

Activation performs:

- authorize through `TermActivationAuthorizationResolver`: current existing Active
  coordinator or fallback; zero-Active initial activation requires fallback alone;
- plan with `planTermActivation()`: previous Active → Archived, selected Draft → Active,
  exactly one final Active and immutable before/after snapshots/codes;
- require durable boolean v2 `term.has_ever_been_active`: Active/Archived must be true,
  Draft can be false or true; activation sets true and never clears history;
- publish all changed term files in one exact-revision course/admin commit through
  `activateManagedTerm()` and the existing managed transaction semantics;
- reconcile external organization/team/permission desired state only after confirmed
  remote acceptance and refreshed revision/session/repository checks.

The metadata commit is atomic; GitHub organization/team APIs are external desired
state. A stale/rejected publication does no reconciliation. Lost push responses use
the existing remote commit/ancestry proof, without duplicate commits or blind retry.
No merge, rebase, force push or automatic replanning is added.

`buildLifecycleTeamMemberships()` explicitly projects course admin from Active current
coordinators; Draft preparation, Active section work and normally completed Archived
current roles grant course write; remaining former roles grant read. Admin > write >
read, with fallback separate. Term/section team identities and current/former histories
are unchanged. The membership reconciler's opt-in `term-lifecycle` strategy preserves
all existing Phase 7 default behavior.

`reconcileTermActivation()` composes Phase 7 organization access, team membership,
course permissions and existing trusted student-repository permissions, retaining
durable invitation/creation journals. No provisioning or branch-policy change occurs.
Pending faculty are allowed: activation remains committed, with incomplete access
reported. Results distinguish `activated_reconciled` and
`activated_needs_reconciliation`; student-facing readiness is blocked for incomplete
reconciliation, unknown freshness, or external failures. No lifecycle rollback occurs.
Explicit fresh-state reconciliation can converge later; no additional persisted enum
or checkpoint was introduced in 8.3. Slice 8.5 below adds the required recovery checkpoint.

The transaction's internal validation hook is used only by the uncalled v2 adapter;
v1 production callers keep the operational validator. Both operational gates remain
**1**, Course Setup emits v1, and no production v1 workflow, UI/IPC or real course is
changed. Archived restrictions are not implemented in this slice.

See [the activation contract](graider-remote-course-architecture.md#92-active).
Slice 8.4 below applies the Archived domain restrictions without changing desired state.

## Slice 8.4 — Term archival restrictions — complete

`ArchivedTermAuthorizationResolver` validates/snapshots a v2 course, the complete
trusted term set, target Archived code and immutable authenticated GitHub ID. It
composes `CourseTermLifecycle`, the target's Phase 6 role resolver and fallback
identity. Wrong/missing targets, invalid activation history, duplicate codes,
multiple Active terms and invalid role/directory state anywhere fail explicitly.
Zero Active remains valid and dates never infer lifecycle.

Archived current roles mean normal completion; former roles mean explicit removal
and historical read only. `canViewArchivedTerm()` allows current/former coordinators
and section faculty, plus fallback. Default inspection preserves current/former
teaching scope and former-coordinator term-wide historical read. Only current
coordinators of the target may explicitly expand via `coordinator-term`; no Active
or other Draft coordinator cross-term authority is invented.

`canPerformArchivedSectionOperation()` accepts closed typed categories: inspection,
grading/regrading, grading dispatch, report publication/republication, Apply and
generic student-repository mutation. Late work requires current target section
faculty in their own section, or current target coordinators with explicit expansion;
former-only and fallback-only identities cannot perform it. `getArchivedSectionScope()`
returns immutable visible/gradable/historical-read-only IDs, not generic mutable scope.
Apply and generic student-repository mutation are always denied with lifecycle-specific
bases, including for coordinators/fallback. Historical reads do not imply grading.

`canEditArchivedStructure()` always freezes ordinary section/roster/assignment
structure, deadline/late policy and faculty-assignment changes. The separate
`canPerformArchivedAdministrativeCorrection()` allows only current target coordinators
or fallback for those closed categories. This explicit exceptional path grants no
ordinary student visibility, grading, dispatch, publication, Apply, generic repository
mutation or reactivation to fallback-only administrators. Independent term roles
remain independent; no role facts are synthesized and unknown operations fail closed.

The 8.3 lifecycle projection and reconciliation need no change: current Archived
scoped teams and course write remain, former-only read remains, and current-role
student repository admin is not downgraded by structural freeze. GitHub permissions
are infrastructure capability, not domain authority. No role arrays, schema fields,
GitHub state or Phase 6–8.3 behavior are changed. All results are immutable and no
corrective mutation service, deletion, rollback or activity guard is introduced.

Both operational gates remain **1**, Course Setup emits v1, and no production
workflow/UI/IPC or real course is changed. Future callers must combine authorization
with source/session/reconciliation-readiness checks. See
[architecture §9.3](graider-remote-course-architecture.md#93-archived).
Slice 8.5 below implements Draft deletion and activation recovery.

## Slice 8.5 — Draft deletion and activation recovery — complete

Dedicated `DraftDeletionAuthorizationResolver` and
`TermActivationRecoveryAuthorizationResolver` compose the existing immutable role
resolver and complete lifecycle snapshot. With an Active term, only its current
coordinators or fallback may delete a never-Active Draft. With zero Active, the
target Draft's current coordinators or fallback may delete it. Recovery requires
fallback or the current Active target's current coordinator. Preparation and
Archived correction capabilities do not confer either authority.

Every future internal v2 activation writes strict version-1
`terms/<code>/activation-recovery.yml` in the same commit as both lifecycle edits.
The checkpoint binds a UUID activation, repository ID, source revision, target,
nullable predecessor and actor. Its state is `rollback_available` or
`recovery_required`, with first category/actor/time required for the latter.
Malformed, unsupported, missing or contradictory recovery metadata fails closed;
recovery verifies the source revision belongs to authoritative Git history.

Before first student-facing Apply, dispatch, grading, publication or repository
mutation, `markManagedStudentActivity()` commits the write-ahead transition to
`recovery_required`. `runAfterManagedActivityMarker()` calls an independently
authorized operation only after confirmed remote marking. Repeated marking preserves
the first evidence. Marker and recovery use the existing outer per-course lease and
exact-revision publication boundary; stale requests cannot both publish. No blind
retry, merge, rebase, force push or second Git transaction engine is introduced.

Safe rollback returns the target to Draft, restores an existing predecessor to
Active, and removes the checkpoint in one commit. Initial rollback legitimately
leaves zero Active. Every activated term retains `has_ever_been_active: true` and can
never be deleted through Draft deletion. Once activity is marked or corroborated,
simple rollback returns `recovery_required`. Explicit post-marker resolutions are
`accept-current` (unchanged lifecycle) or `restore-predecessor` (archive the mistaken
Active, restore its Archived predecessor). Neither removes student/history data.
Initial activation has no restore-predecessor resolution. Missing remotely deleted
predecessors produce Needs attention and are never recreated from cache.

Deletion and safe rollback require complete trusted remote absence evidence for all
five activity categories, bound to exact repository/revision/term/session identity.
Local file absence, dates and GitHub permissions prove nothing. Present, incomplete,
unknown or contradictory evidence blocks the operation. Deletion also rejects any
checkpoint, prior activation, trusted student target or unexpected/runtime file.
It removes the canonical preparatory term directory atomically; it never deletes
unrelated runtime/recovery data.

Metadata publication precedes lifecycle-aware Phase 7 reconciliation. Recovery uses
the unchanged 8.3 strongest-role projection. Deleted Draft scoped teams are emptied
through the existing membership engine, never recreated when absent; ambiguous
creation journals remain Needs attention. Fresh reconciliation can consume the
retired Draft snapshot from the committed result/Git parent. Empty and zero-Active
sets are supported with student-facing readiness false. External failure reports
`deleted_needs_reconciliation` or `recovered_needs_reconciliation` and never restores
or reverts published metadata. Checkpoints are removed on resolution; irreversible
history remains in Git and `has_ever_been_active`, without a recovery lifecycle enum.

Both operational gates remain **1**, Setup emits Schema 1, and no production v2
workflow, UI/IPC, real course migration or live GitHub mutation is enabled. See
[architecture §9.4](graider-remote-course-architecture.md#94-delete-and-rollback).

Slice 8.6 below completes Phase 8 with shared course archive state.

## Slice 8.6 — Course archive/unarchive — complete

Required v2 `course.lifecycle` persists `unarchived | archived`; strict parsing rejects
missing/unknown state. V1 remains unchanged. `CourseLifecycle` snapshots the validated
course and complete term set; `CourseLifecycleAuthorizationResolver` composes existing
immutable identity/role facts with archive guards. Archive requires no Active, no
Draft (including ever-Active recovery Drafts), and complete valid evidence of no
unresolved activation checkpoint. Nothing is automatically activated, deleted,
archived or resolved. Empty/all-Archived term sets are valid.

No authoritative term-creation order previously existed. Required v2
`course.term_creation_order` explicitly lists **existing** canonical term codes,
oldest-created first. Complete-set validation requires every term exactly once;
empty is valid only with zero terms. The final entry identifies the most recently
created existing term, independently of directory/input order, code/date/academic
ordering and local timestamps. A latest-only pointer could not safely select the
predecessor after deletion; this compact list supplies exactly that missing fact.
Future creation appends atomically. 8.5 deletion now removes the deleted entry in
the same commit as its preparatory directory, returning the updated course for
reconciliation. Dangling/missing entries fail closed, never infer replacements.

Fallback or a **current** coordinator of that most recent existing term may archive
or unarchive. Current Archived coordinators represent normal completion; former
coordinators, ordinary faculty, assignment owners, directory-only identities and
coordinators of older terms gain no lifecycle authority. With zero terms only
fallback qualifies. Same-state requests remain authorized no-ops without commits.

`changeManagedCourseLifecycle()` uses the existing isolated exact-revision managed
transaction under its caller's existing course lease: validate/authorize at the exact
source, change only `course.yml`, validate, scoped stage, one commit, non-force push
and lost-response remote verification. Stale/racing requests require a new invocation;
no merge, rebase, force push or blind retry. Immutable results identify before/after,
authority, revision and guard/attention reason. Unarchive changes only course state,
without creating/reactivating terms, changing history or student-facing readiness.

`checkCourseCreationLifecycle()` blocks only `create-term` / `create-assignment`
while archived. Passing the gate still requires role/ownership authorization.
Archived historical inspection/grading/regrading/dispatch/publication consume 8.4
unchanged. The 8.3 team/permission projection is unchanged and archive/unarchive
performs no organization, team, repository permission, branch or repository-archive
API mutation. The course/admin repository remains accessible and synchronized.

`projectCourseLifecycle()` is a pure future dashboard/discovery projection: archived
courses are omitted normally and included with Show archived, with local hide/show
orthogonal. Discovery, synchronization and bootstrap eligibility remain true for
already-authorized courses. No production v1 dashboard/discovery refactor is made.

The future outer trust/revalidation boundary must additionally prove no
`migration_required`, `migration_in_progress` or `migration_incomplete` once Phase 9
implements that model. No migration machinery is invented now. Both operational
gates remain **1**, Setup emits v1, no production v2/UI/IPC is wired and no real course
or GitHub resource is changed. No Delete course operation is added.

**Phase 8 is complete. Slice 9.1 is complete. Slice 9.2 is complete. Next: Phase 9 / Slice 9.3 — Assignment Migration.**
The analyzer must report missing lifecycle/creation-order facts and require a reviewed
authoritative order rather than guessing from academic chronology or local files.

---

# Phase 9 — Existing-Course Migration

Now that:

- updater exists;
- schema v2 exists;
- authorization exists;
- team reconciliation exists;

migration can safely ship.

## Slice 9.1 — Migration analyzer — COMPLETE

`analyzeSchemaV1Migration(snapshot)` produces a deterministic, deeply immutable
`CourseMigrationAnalysis`. `readSchemaV1MigrationAnalysis(request)` reads exact commit
blobs through the bundled GitWorkspace, with read-only Git DAG inspection and separately
supplied trusted source/runtime roots. It never reads working-tree configuration as
source authority or calls generated-output routing helpers, which may seed runtime files.

The report preserves immutable course/admin repository ID, exact source commit SHA,
authenticated GitHub user ID and available immutable organization evidence. Its opaque
fingerprint additionally covers source contents, runtime observations and trusted evidence.
Future review/publication must revalidate repository ID and authoritative SHA and reject
stale review; the fingerprint does not replace that remote check.

Results distinguish `ready_for_review`, `needs_attention`, `not_applicable` (valid v2)
and `blocked` (including malformed v1, unsupported schemas and identity conflicts).
`ready_for_review` never means ready to migrate. Config parsing and semantic validation
must succeed for the complete v1 inventory before any validated migration facts appear.

- Facts use `derived`, `requires_confirmation`, `unresolved` or `blocking`, with concise
  provenance. V1 faculty references retain exact case/spelling because v1 scope uses exact
  matching. Section faculty and assignment-only owners are included; v2 directory case/ID/
  current-login collisions block. Trusted exact username-to-numeric-ID evidence alone can
  resolve identities. Login similarity, authenticated ID alone and team membership cannot.
  Same-ID renames retain login history; unproven current-login ordering requires review.
- Only safely resolved faculty enter the provisional directory. Unresolved identities and
  section relationships remain explicit. Fallback selection is always required. Each term
  requires at least one explicitly selected current coordinator; no former history is invented.
- Every term requires lifecycle review with at most one reviewed Active. Source manifest
  operational repository evidence can prove prior activity true; absence and machine-local
  evidence never prove false. Course `unarchived` is a documented compatibility migration
  default, not a historical fact; local hide state is never consulted.
- Creation-order candidates require a complete Git DAG with unique, ancestrally ordered
  introductions and no deletion/reintroduction, ties or incomparable introductions. Missing,
  shallow, replaced, incomplete or ambiguous history supplies no order. Even proven order
  requires explicit 9.2 confirmation. Zero terms is supported.
- Assignment evidence preserves owner, sections, status/type, grading, repository mode/groups
  and exact shared deadline fan-out destinations. Ownerless assignments remain repair-required/
  read-only until coordinator repair. No assignment conversion occurs.
- Existing manifest-v1/v2 parsers inventory source/runtime repositories, immutable IDs where
  available, group targets/mappings, operation history and section evidence. Roster coverage,
  input anchors, failures, missing records, pending invitations and ambiguous targets prevent
  false Complete evidence. Group manifests remain review-required. Conflicts and unproven
  runtime completeness across machines are Needs attention; no evidence source is preferred.
  Orphan manifests and their grader debt remain visible.
- Course and manifest grader configuration is historical debt, never an active v2 role.
  Persisted removal and GitHub reconciliation belong to 9.4; no faculty role is synthesized.
- Organization assessment distinguishes reconciled immutable continuity, proven transfer
  requiring migration and unknown historical binding. Locator drift alone never proves
  transfer. Unresolved organization migration must block later schema publication.

The analyzer has no write/provider/journal capability. Reader tests inspect the complete
filesystem before/after, spy on writes and assert only read Git commands: zero writes,
commits, pushes, GitHub/team/member/permission/invitation changes or journal writes. No
checkpoint, final YAML/write model, UI, approval persistence or publication is introduced.
Both operational schema gates remain **1**, and Course Setup still emits Schema 1.

**Slices 9.1 and 9.2 are complete. Next: 9.3 — Assignment Migration.** The implemented
review below requires explicit faculty decisions before any migration write becomes possible.

## Slice 9.2 — Migration review UI — COMPLETE

`MigrationReviewSubmission` / `validateMigrationReview()` turn an exact immutable 9.1
analysis plus trusted identity-verification receipts into a deeply immutable
`schema-v1-migration-review` result. Status is `incomplete`, `complete`, `blocked`,
`stale` or `not_applicable`. **Complete means human review decisions are internally
valid, never publication readiness** (`publicationReady` remains literal false).

- Source assertions bind repository ID, exact authoritative source SHA, analyzer
  fingerprint and authenticated GitHub user ID. Electron retains its own analysis;
  returning those values from the renderer never makes them trusted. Session IDs and
  faculty receipts are main-process issued, owner/account/generation bound and ephemeral.
- Login verification uses read-only GitHub lookup to observe current login and immutable
  numeric user ID. The UI cannot type numeric identity authority. Each explicit mapping
  re-runs 9.1 at the same exact source with trusted evidence, refreshing faculty, section
  and assignment-owner proposals together. Same-ID renames retain verified login history;
  differing trusted IDs and directory case/ID/current-login collisions block completion.
  Explicitly added verified faculty may be chosen as fallback/coordinators without
  inventing v1 section assignments or former roles.
- Fallback requires exactly one explicit verified-directory selection. Every term requires
  at least one explicitly selected current coordinator, explicit Draft/Active/Archived
  status and an explicit yes/no activation-history decision when 9.1 cannot prove true.
  Source-proven history is locked true. At most one Active is independently enforced;
  Active/Archived require true and Draft allows either. Section faculty are candidates,
  never automatically selected coordinators.
- Creation order always requires explicit confirmation. Proven Git candidates may prefill
  it; otherwise terms must be appended manually. Accessible Move up/Move down controls
  preserve the chosen order without academic/code/date inference. Every canonical term
  occurs exactly once; zero terms permits the empty order. Course `unarchived` remains
  the documented compatibility default, with no course-archive selection added.
- Closed typed acknowledgements cover exact analyzer-owned ownerless, legacy `closed`
  and group-target decisions only. Ownerless assignments remain repair-required/read-only;
  no `closed` lifecycle mapping or group/Apply conversion occurs. Unknown keys fail closed.
  Manifest conflicts, partial/failed evidence, machine-local completeness, grader debt
  and unknown/required organization migration remain separate later-phase findings.
  Faculty acknowledgement never converts technical uncertainty into Complete evidence.
- Main-process completion observes the current remote default-branch revision through
  immutable repository lookup and current OAuth/legacy faculty authorization. Local HEAD
  is never remote authority. Advancement returns latched `stale`; refresh replaces the
  session and clears security decisions rather than merging them onto new evidence.
  Account/repository/organization mismatch fails closed. 9.5 must still revalidate again.
- The light-mode six-step page (Overview, Faculty, Course authority, Terms, Assignments &
  Apply evidence, Review) is reached via **Review migration** for authorized discovered
  Schema 1 courses using `managed-course:<userId>:<repositoryId>`. Remote-only review
  needs no legacy registration or cache bootstrap. Exact remote commit/tree/blob GETs
  and blob checksum checks feed the existing analyzer; existing local Git history and
  runtime evidence are read separately where available. A read-only catalog option avoids
  creating account directories. No cache synchronization/branch update is invoked.

Narrow load/verify/refresh/complete/close IPC methods expose DTOs only. Main retains the
completed artifact for a trusted 9.3 handoff through `getCompleted()`, never accepting a
renderer-returned artifact. No durable approval, checkpoint, config/assignment/manifest
write, Git commit/push, team/invitation/permission/branch mutation or journal write occurs.
The final action is **Complete migration review**; there is no migration/publication action.
Both operational schema gates remain **1** and Course Setup continues emitting Schema 1.

**Slice 9.2 is complete. Next: 9.3 — Assignment Migration.** It consumes the analyzer and
trusted completed review to plan assignment/section Apply conversion, retaining technical
Needs attention conditions. No assignment migration writes begin in 9.2.

## Slice 9.3 — Assignment migration

Convert:

- `faculty_owner` → owner array;
- shared deadline → per-section deadline;
- existing manifest → section apply state;
- incomplete Apply → Needs attention.

## Slice 9.4 — Grader removal

Remove obsolete persisted v1 grader configuration and reconcile existing GitHub
teams/permissions during explicit migration. Slice 6.6 already removed the active
role, v2 fields, and new grader planning/execution; it does not perform this cleanup.

## Slice 9.5 — Publish migrated schema

Checkpoint old state, write/validate v2, push, then enable v2 behavior.

---

# Phase 10 — Assignment Lifecycle and Ownership

## Slice 10.1 — Assignment owners

Support multiple owners and explicit owner management.

## Slice 10.2 — Draft / Active / Archived

Implement assignment lifecycle and permissions.

## Slice 10.3 — Shared assignment history

Record meaningful faculty-facing mutations.

## Slice 10.4 — Copy assignment to new term

Copy shared definition only.

Reset:

- deadlines;
- section usage;
- Apply state;
- grading state.

Carry only eligible new-term owners while preserving historical attribution.

---

# Phase 11 — Section-Specific Assignment State

This is one of the most consequential schema changes.

## Slice 11.1 — Per-section assignment-state files/model

Separate shared `assignment.yml` from section operational state.

## Slice 11.2 — Section-specific deadline and late policy

Remove the single shared deadline assumption.

## Slice 11.3 — Section usage states

Support:

- available;
- Not using;
- Applied.

Prevent Not using after provisioning exists.

## Slice 11.4 — Section-scoped Apply

Apply targets only the authenticated faculty member's sections unless coordinator scope is explicitly expanded.

## Slice 11.5 — Applied revision tracking

Persist the shared assignment revision associated with each section's Apply.

## Slice 11.6 — Update available / keep current

Shared edits create review state without touching student repos.

---

# Phase 12 — Student Repository Local Management

## Slice 12.1 — Per-course local root

Add machine/account-local default repository root.

## Slice 12.2 — Existing-clone registration

Verify remote identity before accepting arbitrary existing local clones.

## Slice 12.3 — Explicit download manager

Support bulk or selected missing repositories.

No automatic mass clone.

## Slice 12.4 — Safe auto-update before use

Clean → update.

Dirty/diverged → block and surface.

## Slice 12.5 — Storage management

Add:

- disk usage;
- repository inventory;
- safe local removal;
- dirty-repository safeguards.

## Slice 12.6 — Change-root migration

New root affects future downloads.

Optionally migrate clean existing repositories.

---

# Phase 13 — Student Identity and Enrollment Changes

## Slice 13.1 — Immutable GitHub student identity

Persist GitHub user IDs.

## Slice 13.2 — GitHub username rename handling

Update metadata without renaming repositories.

## Slice 13.3 — GitHub account replacement

Explicitly transfer repository access while retaining student/grading identity.

## Slice 13.4 — Dropped students

Preserve repositories/history, remove student access, stop future provisioning.

## Slice 13.5 — Section transfer

Preserve repository identity, update permissions, migrate grading-state location.

## Slice 13.6 — Group-transfer behavior

Preserve original group history and require explicit destination arrangement.

---

# Phase 14 — Remotely Durable Grading State

## Slice 14.1 — New canonical grading path

Move/standardize canonical state as:

`term + assignment + section + student/group`

## Slice 14.2 — Course-repository persistence

Meaningful autosaves become remote commits.

## Slice 14.3 — Grading audit trail

Persist actor/timestamp/mutation history.

## Slice 14.4 — Cross-machine restoration

Verify complete office → home continuation.

## Slice 14.5 — Submission commit pinning

Latest before grading; pinned afterward.

## Slice 14.6 — Newer submission workflow

Preserve grading decisions and revalidate source anchors.

## Slice 14.7 — Publication history

Keep latest report in student repo and durable publication history in course repo.

---

# Phase 15 — Grading Concurrency

This phase should start with a technical spike because the coordination mechanism must remain serverless.

## Slice 15.1 — GitHub-backed lease mechanism spike

Evaluate candidate mechanisms against:

- compare-and-set safety;
- latency;
- expiry;
- API rate limits;
- no ordinary Git-history pollution;
- crash recovery.

## Slice 15.2 — Advisory grading claims

Implement:

- claim;
- renew;
- release;
- stale expiry;
- same-faculty device takeover.

## Slice 15.3 — Optimistic grading-state version checks

Make this the final safety layer regardless of claim state.

## Slice 15.4 — Conflict reconciliation

Handle rare competing grading mutations without data loss.

---

# Phase 16 — Template Revision Management

## Slice 16.1 — Template commit pinning

Persist pinned commit and monitor configured branch.

## Slice 16.2 — Template update notifications

Target owners and using sections.

## Slice 16.3 — Adoption preview

Show compare/diff and affected sections.

## Slice 16.4 — Ordered file-management rules

Implement Instructor-managed / Student-editable / safe default.

## Slice 16.5 — Per-section update review

Generate safe default file selections.

## Slice 16.6 — Conflict-aware student update

Use the existing/new template baseline provenance to identify student modifications.

## Slice 16.7 — Selective distribution

Directly commit approved corrections to each student repo.

## Slice 16.8 — Partial state

Persist actual file-level distribution state and allow later continuation.

---

# Phase 17 — Stable Deep Links

## Slice 17.1 — Canonical course route identity

Replace local-folder assumptions in routing with course repository ID.

## Slice 17.2 — `graider://` protocol

Register on installed macOS/Windows builds.

## Slice 17.3 — Course/term/assignment resolution

Opening a deep link may trigger discovery/sync before routing.

## Slice 17.4 — Authorization failures

Refuse cleanly when the signed-in faculty member lacks access.

At this point the original ITEM-26 is fully addressed rather than cosmetically patched.

---

# Phase 18 — Organization Migration and Reconciliation

## Slice 18.1 — Detect manual organization transfer

Same repo ID under unexpected organization → Migration required.

## Slice 18.2 — Migration planner

Inventory:

- admin repo;
- student repos;
- course templates;
- managed teams;
- permissions.

## Slice 18.3 — Checkpointed migration executor

Record progress and resume safely.

## Slice 18.4 — Manual recovery reconciliation

Allow faculty/admin to make GitHub-side repairs and have Graider re-scan/verify them.

## Slice 18.5 — Retired-term cleanup

Offer explicit managed-team cleanup without inferring student-repository deletion.

---

# Phase 19 — Diagnostics and Operational Support

## Slice 19.1 — Structured safe logs

Ensure synchronization/migration/auth/update failures are diagnosable and redacted.

## Slice 19.2 — Export diagnostics

Generate privacy-conscious support bundle.

## Slice 19.3 — Opt-in crash reporting

No usage analytics.

No student/course/grading payload collection beyond technically necessary crash metadata.

---

# Phase 20 — Documentation and Faculty Onboarding

Replace old assumptions throughout documentation:

- no “Open a Course Folder” as the normal setup;
- no `gh auth login`;
- no system Git requirement;
- no manual course clone;
- document Sign in → courses appear;
- document student repository download/storage;
- document roles and historical access;
- document Stable/Preview channels;
- document conflict/recovery workflows.

---

# Deferred Major Programs

Only after this architecture is stable should the next major features begin.

## Canvas integration

Build against the clean concepts established here:

- remote course identity;
- one Active term;
- section identity;
- faculty/student identity;
- section-specific rosters;
- section-specific deadlines;
- shared assignments;
- grading state.

ITEM-33 roster CSV mapping should be absorbed into the Canvas/roster integration effort rather than independently expanded now.

## GitLab compatibility

Introduce GitLab through the remote-host/provider seam after the GitHub model is stable.

Do not compromise the current implementation by prematurely implementing unused generic provider behavior.

## Full visual redesign

A broader UI redesign should occur after these workflows are understood and implemented, because the new concepts—course discovery, archive state, coordinator scope, section state, update notifications, repository storage, conflict handling—will materially change what the UI needs to communicate.

---

# Recommended Immediate Next Work

Phase 2.9 now supports explicit managed operational cutover for eligible registered courses,
with expected read revisions and transactional OAuth course-repository publication. The next
course-management boundary is remote-only mutation/navigation enablement using these proven
semantics. Schema v2, domain-aware merge, and broader credential migration remain separate.
Signed release/update infrastructure is still needed before schema-breaking migration reaches Stable.

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

The legacy-source update portion is now implemented in Slice 2.8. The next boundary is a designed
managed-course mutation cutover with read-version and publication semantics. This slice adds no automatic legacy update, managed
mutation cutover, OAuth write migration, student synchronization, schema-v2 roles, periodic fetch,
automatic reconciliation, migration, or remotely durable grading state.

## Slice 2.8 — Safe legacy operational-source update (implemented)

Explicit **Update course source** shares the 2.7 per-account/repository operation queue. Managed
synchronization establishes the exact authoritative commit; only verified, wholly clean, attached
legacy sources with the expected upstream and strictly behind history can fast-forward. Current
sources are verified no-ops. OAuth authenticates fetch; exact-SHA FF-only prevents remote-fetch races
from selecting unvalidated newer revisions. Final legacy and managed HEAD must agree exactly.
Dirty/untracked/ahead/diverged/unsafe/mismatched states remain preserved; publication retry retains
its pending-work/local-commit recovery semantics. No managed-cache reconciliation touches legacy.

Source updates invalidate open documents in main. Assignment/roster stale form submissions and old
queued callbacks remain blocked until full view reload; no mutation automatically resumes. Startup
and Refresh retain managed synchronization and existing dashboard loading; legacy update stays
explicit to avoid background editor invalidation and another startup orchestration path.
See [Slice 2.8 safety and transition details](graider-remote-course-architecture.md#phase-2--slice-28-safe-legacy-operational-source-synchronization).

Next: design managed-course mutation/read-version/publication semantics before cutover. OAuth write
migration, schema v2, periodic fetch, branch/org migration and student sync remain excluded.

## Slice 2.9 — Managed-course mutation cutover (implemented)

Eligible registered courses can explicitly persist account/repository-scoped managed
operational mode after proving a clean/current registered legacy source. All course-driven
configuration reads then use managed state. Editable requests assert their exact loaded SHA;
main synchronizes and rejects stale versions before mutation. Course-admin changes run in
an isolated transaction clone, validate metadata and operation-scoped paths, and succeed
only after an OAuth-authenticated, non-force course-repository push. The shared managed
queue spans preconditions through publication/activation. Generated manifests, reports, and
local grading state use account/repository runtime storage outside the clean Git source.

Remote races synchronize the active clean cache to the winner without merge/rebase or
unpublished active state. Confirmed remote publication survives local activation failures;
main records the commit and reports refresh attention separately. The 2.8 document
invalidation boundary also covers managed updates. Legacy folders become optional external
working copies, with explicit 2.8 fast-forward refresh and no automatic mirroring. Manual
Publish Course Changes cannot publish a cut-over legacy copy.

This implements the remote-commit invariant described in Slice 5.4 for managed course-admin
repositories. Student/template/report write authentication remains unchanged. Remote-only
mutation enablement is the next boundary; schema v2 and domain-aware merge remain deferred.
See [Slice 2.9 operational and failure contracts](graider-remote-course-architecture.md#phase-2--slice-29-managed-course-mutation-cutover).
