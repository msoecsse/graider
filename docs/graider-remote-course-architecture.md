# Graider Remote Course, Authorization, and Multi-Machine Architecture

**Status:** Draft requirements and architecture specification  
**Scope:** Multi-machine course access, synchronization, authorization, lifecycle, grading persistence, repository management, migration, distribution, and recovery  
**Explicitly out of scope:** Canvas integration, GitLab implementation, and the broader visual redesign

---

## 1. Purpose

Graider must evolve from a desktop application centered on locally registered course folders into a GitHub-backed faculty application that works naturally across multiple computers and among multiple faculty teaching the same course.

A faculty member should be able to install Graider on a new computer, sign in with GitHub, and immediately gain access to every Graider course for which they have current or historical authorization. Course configuration and grading state should synchronize automatically. Faculty should not need to understand Git, clone course administration repositories manually, manage tokens, or reconcile normal cross-machine changes themselves.

The system must preserve the existing goals of safety, determinism, auditability, and explicit control over student repositories.

---

## 2. Core Design Principles

### 2.1 GitHub is authoritative

The remote course/admin repository is the authoritative persistent store for course configuration, term configuration, assignments, rosters, grading state, shared comments, history, and other durable Graider state.

Local app-managed course repositories are synchronized working caches.

A Graider mutation is not considered successful until the corresponding remote GitHub state has been updated successfully.

### 2.2 GitHub connectivity is required for normal operation

Graider is not an offline-first application.

A live authenticated GitHub connection and successful synchronization check are prerequisites for normal course operations. Graider must not allow offline mutations that accumulate potentially conflicting state for later synchronization.

### 2.3 Course/admin repositories and student repositories have different ownership models

Course/admin repositories are:

- small;
- automatically discovered;
- automatically cloned;
- stored in Graider-managed application storage;
- automatically synchronized.

Student repositories are:

- potentially large;
- explicitly downloaded by faculty;
- stored in a faculty-selected filesystem location;
- directly accessible to faculty and IDEs;
- synchronized automatically only after they have been downloaded and only when the local repository is safe to update.

### 2.4 Section boundaries are fundamental

Ordinary faculty see, grade, and operate on only their own sections.

Term coordinators can access all sections in their term, but their normal interface remains section-focused. Broader coordinator access must be explicit.

Shared assignment definitions and shared reusable comments are course/term collaboration resources, while rosters, assignment operational state, repositories, grading state, deadlines, and student information remain section-scoped.

### 2.5 Historical access is preserved

Faculty retain access to terms and sections they previously taught.

Historical access is derived from persisted term/section role history, not from whether a faculty member happens to be teaching the course today.

Faculty removed from an active role during a term retain historical read-only access to the scope they previously held.

### 2.6 No surprise propagation

Changes to shared assignments, templates, or course configuration must never silently modify another faculty member's student repositories.

Faculty responsible for a section explicitly decide whether and when to apply shared changes to that section.

### 2.7 Graider remains serverless where practical

Durable state remains GitHub-backed.

Ephemeral coordination such as grading claims should use GitHub-backed coordination plus optimistic concurrency rather than introducing a Graider-hosted backend unless future requirements make that unavoidable.

---

## 3. Current Implementation Baseline

The current configuration schema is version 1. Important existing characteristics include:

- `course.yml` contains course and GitHub configuration.
- `term.yml` contains sections and optional faculty username arrays.
- assignments have a single `faculty_owner`;
- assignment deadlines are shared across all sections;
- assignments list target sections directly;
- Schema v1 still parses deprecated grader fields as compatibility data only;
- faculty authorization is currently resolved from a locally configured institutional username and section faculty lists.

The existing manifest model provides several useful foundations:

- repository records already include section identity;
- repository IDs are supported;
- manifest v2 supports individual/group repository targets;
- template commit SHA and student default-branch baseline SHA are already modeled;
- template synchronization can therefore build on existing provenance rather than starting from scratch.

The existing grading design already establishes several compatible principles:

- grading state is canonical and reports are derived;
- student repositories are read-only during interactive grading;
- grading state autosaves;
- faculty grading is section-scoped.

The current packaged application still relies on external authentication/tooling assumptions that this specification replaces:

- GitHub CLI may be required for authentication;
- system Git may be required by workflows;
- macOS builds are unsigned;
- Windows currently has only a portable x64 executable;
- auto-update is not configured.

---

## 4. Canonical Identities

### 4.1 Course identity

The canonical remote identity of a course is the immutable GitHub repository ID of its course/admin repository.

Human-readable properties such as organization name, repository name, and course code are metadata and may not be used as the ultimate cross-machine identifier.

Repository and organization renames therefore do not change course identity.

Moving a course to an entirely different organization is a migration, not a rename.

### 4.2 Faculty identity

The course repository contains a persistent faculty identity directory containing everyone who has ever been associated with the course.

Each identity records at least:

- institutional faculty username;
- immutable GitHub user ID;
- current GitHub username;
- identity history as needed.

Authorization is anchored to the immutable GitHub user ID.

GitHub usernames are display/account metadata and may change without creating a new faculty identity.

Removing a faculty member from current teaching does not delete their identity record.

### 4.3 Student identity

A roster retains the institutional student ID.

Once GitHub identity is resolved, Graider also records:

- immutable GitHub user ID;
- current GitHub username;
- account history when replacement occurs.

A GitHub username rename does not alter student identity, repository identity, or grading history.

Changing to a genuinely different GitHub account is an explicit faculty-confirmed identity replacement.

### 4.4 Immutable operational identifiers

The following become immutable after their operational lifecycle begins:

- course code: immutable after the first term becomes Active;
- term code: immutable once the term becomes Active;
- section ID: immutable once the term becomes Active;
- assignment slug: immutable once the assignment becomes Active.

Display names and titles remain editable.

---

## 5. Authentication

Graider owns the authentication experience.

### Requirements

- Browser-based GitHub authentication is built into Graider.
- Faculty do not configure PATs.
- Faculty do not run `gh auth login`.
- GitHub CLI is not a faculty prerequisite.
- Only one GitHub identity is active in Graider at a time.
- OAuth credentials/tokens are stored only in the operating system secure credential store.
- Tokens are refreshed automatically where possible.
- Revoked/invalid authorization triggers a normal “Sign in to GitHub again” flow.
- Mutations are blocked until authentication is restored.

Machine-local data is namespaced by GitHub identity.

This includes:

- Graider-managed course caches;
- hidden-course preferences;
- student-repository location mappings;
- default local repository roots;
- other machine-local settings.

Signing out does not normally delete cached course data. Graider provides an explicit **Remove Graider data from this computer** action.

Local data protection is delegated to normal OS account/filesystem protections. Graider does not add a separate encryption-at-rest layer.

---

## 6. Course Discovery and Bootstrap

Implementation status: Phase 2.6 adds explicit review and complete-cache preservation
on top of Phase 2.5 synchronization. Recoverable local state is reviewed using trusted
file/history/operation evidence and a content fingerprint. Only faculty confirmation
can prepare a validated fresh clone, preserve the old complete repository in account-scoped
recovery, and atomically activate the replacement. Failed promotion attempts rollback;
failed final authoritative validation retains the replacement with Needs attention.
External/linked Git storage is manual-only; organization transfer remains migration.
Recovery manifests and narrow ID-only reveal are account scoped; copies never synchronize
and are never automatically deleted. Legacy folders retain operational precedence until explicit 2.9 cutover.
Remote-only caches remain inspection-oriented. No GitHub writes or in-place Git repair
is added. See [Phase 2.6 transaction and safety details](graider-remote-course-discovery.md#phase-26--dirty-managed-cache-handling-and-reconciliation).

Phase 2.9 is implemented: the trusted main-process guard synchronizes the target managed cache,
proves one-time registered-source cutover eligibility, and persists managed operational mode.
Managed course-admin mutations enforce exact read versions and publish from isolated transactions
using OAuth. Legacy folders become optional external copies with explicit 2.8 refresh. Remote-only
mutation enablement is next. See the implementation summaries at the end of this document;
periodic timing, schema v2, student synchronization, and domain-aware merge remain future work.

After authentication, Graider automatically discovers every authorized Graider course accessible to the signed-in identity.

### Discovery scope

Search:

- repositories in all accessible GitHub organizations;
- accessible personal repositories where relevant to legacy discovery.

New Graider courses must live in GitHub organizations.

### Discovery hints

Graider-created course repositories receive the GitHub topic:

`graider-course`

The topic is only a discovery optimization.

It is not proof of validity and does not grant authorization.

### Validation

A discovered repository is accepted only after validating its Graider course metadata.

Validation includes at minimum:

- root `course.yml`;
- supported schema;
- repository identity consistency;
- organization consistency;
- explicit mapping of the authenticated GitHub identity into the course faculty directory;
- current or historical authorization through the term/section role model.

GitHub repository read access alone does not make a course visible in Graider.

### Bootstrap

All authorized course/admin repositories are automatically cloned into app-managed storage.

This includes:

- current courses;
- archived courses;
- locally hidden courses;
- historical courses;
- shared courses.

The repositories are small enough that synchronization eligibility is independent of UI visibility.

---

## 7. Course Visibility and Archive State

### Shared archive state

Course archive state is shared and persisted remotely.

An archived course:

- remains synchronized;
- is hidden from the normal dashboard;
- appears through **Show archived**;
- retains historical grading/regrading and report publication;
- cannot create new terms or assignments until unarchived.

A course can be archived only when:

- there is no Active term;
- there is no Draft term, including an ever-Active recovery Draft;
- there is no unresolved activation-recovery checkpoint; complete recovery state must validate.

Graider exposes no normal permanent **Delete course** operation.

### Machine-local visibility

Faculty may hide/show individual courses independently on each machine.

This preference:

- is local to that machine/account;
- does not synchronize;
- does not stop background synchronization.

### Archive authority

The course may be archived by:

- the course fallback administrator; or
- current coordinators of the most recently created existing term, including normally completed Archived coordinators.

The same authorities may unarchive it.

Unarchiving does not reactivate an old term.

### Implemented shared course lifecycle (Slice 8.6)

Schema v2 strictly requires shared persisted `course.lifecycle`:

```yaml
schema_version: 2
course:
  code: CSC1120
  title: Software Development II
  repository: csc1120-admin
  lifecycle: unarchived # unarchived | archived
  term_creation_order: [26s2, 27s1] # oldest-created existing term first
```

V1 has neither field. Course lifecycle is never inferred from terms, dates, local
visibility/cache placement or GitHub repository archive state. Archive/unarchive
never archives the GitHub repository itself. The shared course remains discoverable,
synchronizable and bootstrap-eligible for authorized faculty; no unregister/delete
or managed-cache removal occurs.

`CourseLifecycle` validates/snapshots the course, complete trusted term set, all
role/directory invariants and the explicit creation-order reference. Its status,
most-recent term and archive-guard decisions are immutable. At most one Active is
still valid; zero terms, zero Active and all-Archived sets remain representable.
An Archived course containing Draft/Active terms is contradictory and fails closed.
`canArchiveState()` / `assertArchiveGuards()` require a complete checkpoint inventory,
no unresolved recovery, no Active and no Draft. Missing/incomplete, malformed,
unsupported or contradictory checkpoint state blocks archive. The exact-revision
backend enumerates the canonical checkpoint namespace using the existing 8.5 reader.
No operation automatically clears another lifecycle's guard.

#### Authoritative most-recent-term identity

Earlier schemas contain no trusted term creation-order fact. V2 now requires
`course.term_creation_order`, an explicit oldest-to-newest list of **existing** exact
canonical codes. Complete-course validation requires a one-to-one match with the
trusted term set: no duplicates, missing or nonexistent entries. `[]` is valid only
for zero terms. The last entry, never term metadata or input/filesystem ordering,
identifies the most recently created existing term.

A latest-only pointer cannot determine which remaining term becomes latest after
that term is deleted. Persisting this narrow order avoids timestamps or guessed
academic chronology. Future creation must append in the same exact-revision commit
as the new term. 8.5 deletion now removes the entry in the same commit as the term
directory, including deleting the last Draft to leave `[]`. Returned reconciliation
uses the updated course. Intentional manual remote deletion must also maintain this
explicit reference; incomplete source state requires attention and is never repaired
by reviving stale terms. Migration must establish a reviewed authoritative order.

#### Authority, persistence and operation gates

`CourseLifecycleAuthorizationResolver.canArchiveCourse()` requires Unarchived plus
all archive guards and either fallback or a current coordinator of the most recent
existing term. `canUnarchiveCourse()` requires Archived and the same authority; no
Active is required. Former/removed coordinators retain historical reads but no course
lifecycle authority. Ordinary section faculty, assignment roles, directory-only faculty
and older-term coordinators cannot authorize. With zero terms, only fallback qualifies.
Same-state mutation requests validate authority but return `up_to_date` without a
commit; they never create authority for unrelated faculty.

`changeManagedCourseLifecycle()` is an uncalled future v2 adapter under the same
existing account/course lease and trusted repository/session boundary as 8.3–8.5.
It clones/validates the exact source, authorizes there, edits only `course.lifecycle`
in `course.yml`, validates the full post-edit set and publishes one scoped commit
with the established non-force/remote acceptance verification. Stale requests or
races fail without retry, merge or rebase. Accepted-but-lost responses do not cause
duplicate commits. Results are immutable and identify status (`archived`, `unarchived`,
`up_to_date`, `needs_attention`), before/after, authorization basis and publication
revision/refresh state when known. Existing transaction failures retain their standard
structured stale/publication errors; source/guard failures return Needs attention.

Unarchive changes no term, role, assignment, activation-history bit or recovery file;
it creates/restores nothing and changes no student-facing readiness. A later explicit
term-creation workflow may prepare the next Draft. The closed
`checkCourseCreationLifecycle()` gate denies `create-term` and `create-assignment`
with `course-archived`. When unarchived it removes only this prohibition and reports
that role/ownership authorization is still required. This is not a blanket mutation
gate: 8.4 historical inspection, late grading/regrading, dispatch and report
publication/republication retain their existing operation/scope decisions.

The 8.3 lifecycle-derived team/permission projection is identical across course
archive state. No Phase 7 reconciliation, membership removal, permission downgrade,
branch change, organization removal or GitHub repository archive API is triggered.
Historical work remains accessible. `projectCourseLifecycle()` supplies pure future
UI semantics: archived hidden normally, shown with Show archived, subject separately
to local hide/show. Discovery/sync/bootstrap remain eligible regardless of either
visibility setting. Local preferences never enter `course.yml`.

Future production composition must additionally reject unresolved organization
migration (`migration_required`, `migration_in_progress`, `migration_incomplete`).
The existing outer repository revalidation hook is the composition boundary when
Phase 9 owns those states; this slice introduces no migration model or bypass claim.
Both operational schema gates remain **1**, Course Setup emits Schema 1 and no
production v1 workflow/UI/IPC or discovery behavior is wired to these new APIs.
No normal permanent Delete course operation or real course migration is introduced.

**Slice 8.6 and Phase 8 are complete. Next: Phase 9 / Slice 9.1 — Migration Analyzer.**

---

## 8. Course Fallback Administrator

The faculty member who initially creates the course becomes its first fallback administrator.

This is not a permanent course-wide coordinator role.

The fallback administrator:

- can create a new term;
- can establish or repair coordinator handoff;
- can archive/unarchive the course;
- acts as administrative recovery authority;
- does not automatically see or grade all sections.

The role is transferable.

Slice 8.2 provides explicit Draft metadata visibility and coordinator setup/handoff
recovery authority. It grants no ordinary Draft section, roster or assignment access
from fallback status alone; independently held Draft teaching/coordinator roles still
apply. See [the Draft authorization contract](#91-draft).

A normal transfer may be performed by the current fallback administrator.

If that administrator is unavailable:

- a current-term coordinator may initiate recovery;
- when multiple current coordinators exist, another coordinator confirms the transfer;
- when only one coordinator exists, that coordinator may complete the recovery alone.

---

## 9. Term Lifecycle

Terms have the lifecycle:

**Draft → Active → Archived**

At most one term may be Active in any valid complete course snapshot. There must
never be two Active terms. A workflow requiring exactly one Active term must check
that explicitly; the invariant does not require every possible snapshot to have one.

Zero Active terms is valid during initial setup before first activation, future
course archive, and recovery/intermediate inspection. Multiple Draft and multiple
Archived terms are allowed, including Draft-only, Archived-only and mixed snapshots.
Later lifecycle operations may constrain creation or course archival separately.

A future Draft term may be prepared while the current term remains Active.

Schema v2 persists lifecycle explicitly under the existing `term` object:

```yaml
schema_version: 2
term:
  code: 27s1
  academic_year: 2027
  semester: 1
  display_name: Spring 2027
  status: draft
  has_ever_been_active: false
```

Allowed `term.status` values are exactly `draft`, `active`, and `archived`. The field
is required by strict v2 validation; missing or unknown values fail. Schema v1 has
no lifecycle field and remains unchanged. Lifecycle is never inferred from dates,
academic year, semester, term code, assignment dates or current production state.
A future-dated term may explicitly be Active; a past term may remain Draft.
There is no automatic activation.

**Slice 8.1 implementation contract (complete):** `CourseTermLifecycle` in
`src/terms/course-term-lifecycle.ts` validates/snapshots the complete supplied v2 term
set and rejects duplicate codes or more than one Active term. The caller must supply
all terms; the model does no I/O to establish completeness. All returned terms and
collections are deeply frozen, and caller mutation cannot alter the snapshot.
`TERM_LIFECYCLE_STATUSES` and `TermLifecycleStatus` are the canonical constant/type.

- `getDraftTerms()` / `getArchivedTerms()` classify all supplied terms.
- `getActiveTerm()` returns the single Active term or `undefined`.
- `requireActiveTerm()` returns that term or throws a clear error if none exists.
- `getTerm(code)` / `getStatus(code)` return `undefined` for unknown codes, consistent
  with faculty directory lookups.

Normal transitions are only `draft → active` and `active → archived`.
`canTransitionTermStatus(from, to)` rejects skips and all backward transitions.
Same-state assignment is a no-op, not a transition: the predicate returns false,
while `assertTermStatusTransition(from, to)` accepts it without changing state.
These pure helpers perform no mutations. Slice 8.5 exceptional activation rollback
must use a separate recovery contract; `active → draft` is not a normal transition.

Lifecycle is independent of role history. Changing status, including Active → Archived,
does not move `coordinators.current` or section `faculty.current` into `former`, or
change fallback administration or the faculty directory. Current/former records
explicit removal from a role. Faculty/coordinators completing a term normally may
remain current after archival, preserving the evidence later grading access needs.
`TermCoordinators` still requires at least one current coordinator for every status.

Slice 8.1 defines state only. `AuthorizationResolver` retains its Phase 6 decisions;
Slice 8.2 composes it through a separate Draft-only domain policy described below.
Phase 7 builders/reconcilers still use all supplied terms without lifecycle
filtering or permission transitions. Activation begins in 8.3,
Archived restrictions in 8.4, recovery/deletion in 8.5, and course archive in 8.6.
Both operational schema gates remain **1**, Course Setup emits v1, and no real course
migration or production UI/Electron lifecycle controls are introduced.

### 9.1 Draft

A Draft term permits preparatory work:

- configure sections;
- assign faculty;
- prepare/import rosters;
- create/copy assignments;
- configure assignment settings;
- establish deadlines;
- prepare grading workflows.

Draft terms prohibit student-facing operations:

- Apply/provision repositories;
- grading dispatch;
- grading;
- report publication;
- other student-repository mutations.

Draft visibility is limited to:

- current section faculty assigned to the Draft term;
- current coordinators of that Draft term;
- current coordinators of the currently Active term;
- course fallback administrator.

**Slice 8.2 implementation contract (complete):**
`DraftTermAuthorizationResolver` in `src/faculty/draft-term-authorization-resolver.ts`
accepts a validated v2 course, the complete trusted v2 term set, the target Draft
term code and the authenticated immutable GitHub user ID. It composes
`CourseTermLifecycle`, the Draft and optional Active term's `AuthorizationResolver`,
and `FallbackAdministrator`. Inputs are snapshotted; public role facts, decisions and
section scopes are frozen. The caller must still prove source/course/session
authenticity and completeness. Missing, Active and Archived targets throw explicit
construction errors. Duplicate codes and multiple Active terms fail lifecycle
validation. Existing coordinator/reference validation remains in force.

Zero Active terms is supported through `getActiveTerm()`, without a blanket
`requireActiveTerm()` call. There is then no cross-term Active-coordinator authority;
Draft coordinators, current Draft section faculty and fallback setup/recovery keep
their independent capabilities during initial course setup.

| API                                           | Implemented Draft authority                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canViewDraftTerm()`                          | Metadata: current Draft coordinator, current Draft section faculty, current Active-term coordinator, or fallback administrator.                                                                                           |
| `canViewDraftSection(id, scope)`              | Default: only current Draft faculty in that section. Explicit `coordinator-term`: current Draft or current Active-term coordinator.                                                                                       |
| `canPrepareDraftSection(id, scope)`           | Same scope as Draft section visibility, for preparation only: rosters, section assignment preparation/settings, deadlines/policies and grading-workflow preparation.                                                      |
| `getDraftSectionScope(scope)`                 | Frozen `visibleSectionIds` and `preparableSectionIds`; these never authorize student-facing execution.                                                                                                                    |
| `canManageDraftStructure()`                   | Current Draft or current Active-term coordinator may configure sections and faculty. No scope expansion is required for these coordinator-level structure operations.                                                     |
| `canManageDraftCoordinatorSetup()`            | Narrow setup/handoff recovery: fallback administrator (`course-recovery`) or current Active-term coordinator. Native Draft coordinators retain ordinary Draft structure management; this recovery capability is separate. |
| `canPerformStudentFacingOperation(operation)` | Always denied with `draft-student-facing-operation-prohibited`, regardless of role.                                                                                                                                       |

A coordinator's ordinary default section scope contains only their independently
assigned current Draft teaching sections. Both native and cross-term coordinators
must explicitly request `coordinator-term` to access/prepare every Draft section,
including unassigned sections. Unknown sections and invalid runtime scopes are denied.
Fallback status grants Draft metadata and the narrow setup capability without
injecting section data, student data or assignment content into either section scope.

Former-only Draft coordinators/faculty have no Draft metadata or section visibility,
including former-coordinator historical reads supported by the Phase 6 primitive.
Former Active-term coordinators do not get cross-term authority. Another independent
current role can still authorize the person. Current coordinators of Archived or
other Draft terms gain no cross-term access. Structured decision bases distinguish
`draft-current-section-faculty`, `draft-current-coordinator`, `active-term-coordinator`,
`fallback-administrator`, `former-role-not-authorized`, and `no-authorizing-role`.
The public `roleFacts` are exactly the selected Draft's Phase 6 facts: no Active-term
coordinator or fallback role is converted into stored Draft coordination/faculty.

`DRAFT_STUDENT_FACING_OPERATIONS` / `DraftStudentFacingOperation` define a closed
operation category: `apply` (including provisioning), `grading-dispatch`, `grading`,
`report-publication`, and `student-repository-mutation`. Every decision denies,
echoes the category, and identifies lifecycle prohibition rather than a role failure.
Preparation/structure decisions must never substitute for this execution gate.

This policy performs no I/O or GitHub mutation. Role histories, faculty directory,
fallback identity and managed-team membership are unchanged. Active-term Phase 6
behavior and Phase 7 membership, repository permissions and branch policy remain
unchanged. No production Apply/grading/publication/Setup/Electron IPC calls this
resolver. Both operational schema gates remain **1**, Course Setup emits v1, and
no real course is migrated. Archived authorization is implemented separately in §9.3.
Slice 8.3 below implements actual lifecycle mutation and the authorization/team
desired-state transition; 8.2 itself performs neither.

### 9.2 Active

Activation is explicit.

Dates may inform faculty but never activate a term automatically.

Activation authority belongs to:

- a coordinator of the currently Active term; or
- the course fallback administrator.

For the initial term, the fallback administrator provides activation authority.

The authoritative lifecycle metadata transition is atomic in the course/admin
repository. External GitHub organization/team/permission changes follow it as desired
state reconciliation; Git and organization APIs are not a distributed transaction.

Activation performs:

1. the previous Active term becomes Archived;
2. the selected Draft term becomes Active;
3. the single metadata commit is non-force pushed and remote acceptance verified;
4. derived coordinator/faculty team and permission state is reconciled afterward.

Future dashboards select the authoritative Active term; student-facing readiness is
separate from lifecycle status and remains blocked while required reconciliation is
incomplete. No current v1 dashboard/workflow switch is introduced.

There must never be two Active terms.

**Slice 8.3 implementation contract (complete):**

`TermActivationAuthorizationResolver` authorizes only a current coordinator of the
existing Active term or the course fallback administrator. With zero Active terms,
only fallback may activate. Target Draft coordination, teaching, former roles,
directory membership and 8.2 preparation/setup capabilities never imply activation
authority. Immutable decisions distinguish `current-active-term-coordinator`,
`fallback-administrator`, `initial-activation-fallback-required` and
`no-activation-authority`. Every term's coordinator/section-faculty references and
current-coordinator invariant are validated against the directory.

V2 requires explicit boolean `term.has_ever_been_active`. Active and Archived require
`true`; Draft allows `false` (new term) or `true` (future recovery compatibility).
Activation sets the target to `active`/`true`, archives the predecessor while
retaining `true`, and never resets history. V1 is unchanged. Dates never authorize
or trigger activation. `planTermActivation()` produces deeply frozen before/after
complete term snapshots, target/predecessor codes and changed codes; a successful
plan has exactly one Active, the target. All other domain fields and current/former
role histories are preserved.

`activateManagedTerm()` is an internal, uncalled v2 adapter over
`publishManagedCourseTransaction()`. The future trusted caller must hold the existing
account/repository lease, establish an exact synchronized revision and bind the
immutable course/organization/account identities. The adapter replans/authorizes
inside the exact transaction clone, edits all affected term YAML files, and validates
the complete post-edit v2 state. The transaction's operation-scoped allowlist stages
both lifecycle files in one commit (one target file for zero Active), then uses the
existing session/repository revalidation, freshness fetch, non-force push and remote
commit/ancestry verification for lost responses. No intermediate lifecycle snapshot
is committed or published. Stale views, clone races and remote changes before push
fail without merge, rebase, force, automatic replanning or retry.

The transaction gains only a trusted internal metadata-validator hook; existing
production callers retain their v1 validator and operational gates. The adapter
refuses v1 contexts and has no IPC/button/current production entry point. Metadata
is read from every canonical term directory, with folder/code and directory/role
validation. Changed YAML preserves unrelated domain fields and role records.

After confirmed publication, the adapter revalidates repository/session and pins the
refreshed revision to the published commit before any external reconciliation. If
the source has advanced or freshness cannot be established, activation remains
committed, reconciliation is skipped, and readiness is blocked pending explicit
fresh inspection. A confirmed publication is never undone because refresh or
reconciliation fails.
The same revision/session/repository boundary is checked again after external work
before reporting readiness; a concurrent remote change requires fresh reconciliation.

`buildLifecycleTeamMemberships()` is the explicit lifecycle projection consumed by
activation. Phase 7's `buildDesiredTeamMemberships()` and reconciler defaults retain
their original lifecycle-neutral behavior. `ManagedTeamMembershipReconciler` accepts
the opt-in `term-lifecycle` projection, using the existing team identity, creation,
membership verification and durable-journal machinery.

| Course-wide team              | Lifecycle-derived effective members                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course-current-coordinators` | Current coordinators of the one Active term only.                                                                                                        |
| `course-write`                | Current Draft coordinators/faculty, Active section faculty, and normally completed Archived current coordinators/faculty, excluding Active coordinators. |
| `course-read`                 | Remaining former coordinator/faculty historical roles without independent write/admin.                                                                   |

Strongest role wins: Active coordinator > write > read. Fallback is never inserted
merely for being fallback; its direct administration remains separate. On successor
activation, the previous current coordinator normally moves from course admin to
write and the new Active coordinator moves from write to admin. Every term/section
current/former team retains its identity and membership. Archival does not turn
current people into former people or remove normally completed late-grading access.
Archived authorization restrictions are applied separately by the §9.3 overlay.

`reconcileTermActivation()` composes 7.2 organization access, 7.3 membership with the
lifecycle projection, 7.4 course permissions, and 7.5 permissions for existing trusted
student repository evidence. Its permission readers use fresh observation and the
same projection, including verified renamed locators. It never provisions student
repositories or changes branch policy. Draft-scoped repository grants are rejected.
Relevant faculty and fallback organization access is reconciled with the existing
invitation journal; directory-only faculty are not automatically invited.

The activation result is `activated_reconciled` or
`activated_needs_reconciliation`, with commit, before/after plan, refresh status,
reconciliation outcomes and `studentFacingReady`. Pending faculty invitations are
permitted after activation: they make reconciliation incomplete, not metadata
publication a failure. Pending/Needs-attention organization, team or permission
outcomes block readiness. Scope/rate-limit/unverified/ambiguous write failures also
leave the activation committed and report Needs reconciliation. No blind retry or
automatic lifecycle rollback occurs. Explicit reconciliation can converge from fresh
authoritative metadata, observed GitHub state and retained durable journals.

No new lifecycle enum or persisted reconciliation state is introduced. Slice 8.5 adds
the activation recovery checkpoint alongside irreversible history and the structured
predecessor/target result. Exceptional recovery is implemented below before production
activation is enabled; ordinary backward transitions remain forbidden. Both operational
schema gates remain **1**; Course Setup emits v1 and no real course migrates.
Slice 8.4 below implements Archived authorization without changing this desired state.

### 9.3 Archived

An Archived term is structurally frozen for ordinary faculty.

Faculty/coordinators whose term/section role remains `current` completed the term
normally. In their authorized scope they may still:

- grade;
- regrade;
- dispatch grading workflows for late grading/regrading;
- publish/re-publish reports;
- inspect historical repositories and state.

Ordinary faculty may not change:

- section structure;
- roster structure;
- assignment structure;
- deadlines;
- faculty assignments.

Current coordinators of that Archived term or the fallback administrator may make
exceptional corrective administrative changes through an explicit corrective path.
Ordinary structural requests remain denied even for those identities.

**Slice 8.4 implementation contract (complete):**
`ArchivedTermAuthorizationResolver` composes `CourseTermLifecycle`, the target's
Phase 6 `AuthorizationResolver` and `FallbackAdministrator`. It accepts a validated
v2 course, the complete trusted term set, the target code and authenticated immutable
GitHub ID. Missing/non-Archived targets, invalid activation history, duplicate codes,
multiple Active terms, and invalid directory/role state anywhere in the supplied set
fail construction. Zero Active is valid; dates are never consulted. The caller still
proves complete course/source/session authenticity outside this domain model.

The existing serialized role history is sufficient: Archived `current` records mean
normal completion, and `former` records mean explicit removal before completion.
No current/former relationships, timestamps, end reasons or lifecycle fields are
rewritten. Public `roleFacts` are exactly the target's Phase 6 facts, with no
synthetic fallback/coordinator role. Inputs are snapshotted and all decisions/scopes
are immutable.

| API                                                        | Archived policy                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canViewArchivedTerm()`                                    | Metadata for current/former target coordinators or section faculty, plus fallback. No directory-only or unrelated access.                                             |
| `canPerformArchivedSectionOperation(operation, id, scope)` | Closed operation categories distinguish historical inspection, permitted late work, and absolute lifecycle prohibitions.                                              |
| `getArchivedSectionScope(scope)`                           | Frozen visible, gradable and historical-read-only section IDs. Gradable means late work only, never generic mutation.                                                 |
| `canEditArchivedStructure(operation)`                      | Always denies ordinary structural workflows with `archived-structure-frozen`, including for coordinators/fallback.                                                    |
| `canPerformArchivedAdministrativeCorrection(operation)`    | Explicit exceptional correction for the target's current coordinator or fallback, separate from ordinary structural editing. No corrective mutation service is added. |

`ARCHIVED_SECTION_OPERATIONS` / `ArchivedSectionOperation` are closed categories:

- `inspect`: follows Phase 6 historical visibility. Current and former section
  faculty inspect their own current/former sections; former coordinators have
  historical term-wide read in default scope.
- `grading`, `grading-dispatch`, `report-publication`: permit grading/regrading,
  workflow dispatch and publication/republication only for current target section
  faculty in their own sections, or current target coordinators after explicit
  `coordinator-term` expansion. A current coordinator's default scope contains only
  independently held teaching sections; no automatic whole-term expansion occurs.
  Former-only roles are historical read-only. An independent current section role
  still authorizes its own section even when the person is a former coordinator.
- `apply`: always denies provisioning with `archived-provisioning-prohibited`.
- `student-repository-mutation`: always denies generic mutation with
  `archived-student-repository-mutation-prohibited`. Late-work authority does not
  authorize template redistribution, restructuring or arbitrary source updates.

Former coordinators' default term-wide historical read does not grant
`coordinator-term` mutation scope. Only current coordinators of this Archived term
can expand. Current coordinators of a different Active or Draft term gain no
cross-term Archived authority. Unknown sections, invalid runtime scopes and unknown
operations fail safely.

`ARCHIVED_STRUCTURAL_OPERATIONS` / `ArchivedStructuralOperation` enumerate
`section-structure`, `roster-structure`, `assignment-structure`, `deadline` (including
late policy), and `faculty-assignment`. The same closed category is used by two
deliberately separate ordinary/exceptional APIs. Correction is available to the
target's current coordinator (`term`) or fallback (`course-recovery`), and denied
to ordinary section faculty, former-only roles and unrelated identities. A caller
must deliberately choose that exceptional repair path for future warning/audit
behavior. Correction grants no Apply, generic repository mutation, or reactivation.

Fallback alone gets term metadata and narrow corrective administration, without
ordinary section/student/repository inspection, grading workspace, dispatch or report
publication access. Its independent teaching/coordinator roles still apply normally.
Structured bases distinguish Archived current/former roles, `historical-read-only`,
fallback recovery, lifecycle prohibitions, invalid requests and absent authority.

The 8.3 GitHub projection and reconciliation remain unchanged: normally completed
Archived current coordinators/faculty keep course write and current scoped team
membership; former-only roles keep read unless independently stronger. Student
repository current-role admin/former-role read grants remain sufficient for late
work. GitHub write/admin access is infrastructure capability, never Graider
authorization truth. Domain restrictions do not downgrade those grants.

This overlay performs no I/O, role-history mutation or GitHub reconciliation. Phase
6, Draft preparation, activation authorization/planning/reconciliation and branch
policy are unchanged. Both operational schema gates remain **1**, Course Setup emits
v1, and no production workflow/UI/IPC or real course is changed. Future execution
must still enforce source/session/reconciliation readiness independently of these
operation decisions. Slice 8.5 below adds deletion, activity guards and activation rollback; exceptional
correction does not imply lifecycle recovery authority.

### 9.4 Delete and rollback

Slice 8.5 implements backend-only deletion, write-ahead activity marking and explicit
activation recovery. Both operational schema gates remain **1**; Course Setup emits
Schema 1 and no production workflow, UI/IPC or real course uses these services.

#### Authority and Draft deletion guards

`DraftDeletionAuthorizationResolver.canDeleteDraft()` requires a complete valid v2
term set and a never-Active Draft. With an Active term, only its current coordinators
or fallback may delete. With zero Active, the target Draft's current coordinators or
fallback may delete. Former roles and ordinary faculty cannot delete; Draft
preparation/setup authority is insufficient.

`planDraftDeletion()` and `recoverManagedTerm({ operation: "delete-draft", ... })`
require `status: draft`, `has_ever_been_active: false`, no checkpoint and complete
trusted remote activity-absence evidence. Evidence is strict version 1, bound to
repository ID, exact authoritative revision, term code and authenticated GitHub ID;
all five student-facing categories must explicitly be absent. Unknown, incomplete,
contradictory or present evidence fails closed. The caller must establish the remote
inventory's completeness and source/session authenticity. Empty local runtime files,
cached manifests, dates, repository names and observed GitHub permissions cannot
prove absence. Trusted student targets and tracked activity corroborate presence.

Deletion removes the canonical `terms/<code>/` preparatory directory in one managed
commit, including metadata, rosters and assignments. Unexpected files, recovery files,
symlinks or runtime/activity artifacts block deletion instead of being erased. No
unrelated external runtime data is removed. A previously Active Draft is never
eligible, even after safe rollback. Intentional remote deletion of old Archived data
remains authoritative; recovery never recreates a missing predecessor from cache.

#### Durable activation checkpoint

Every future internal v2 activation writes this strict versioned record at
`terms/<target>/activation-recovery.yml` in the same commit as old/new lifecycle
metadata. This file is recovery metadata, separate from `term.status`:

```yaml
schema_version: 1
activation_id: 2a57e327-5760-432b-90dd-9a3abe687a10
course_repository_id: 123456
activated_from_revision: 0123456789abcdef0123456789abcdef01234567
target_term_code: 27s1
previous_active_term_code: 26s2 # null for initial activation
activating_github_user_id: 24680
state: rollback_available
```

The UUID identifies the particular activation; source revision must be an ancestor
of the exact trusted course revision. The target must be current Active and a named
predecessor must still exist as Archived. Only one unresolved checkpoint is allowed;
activation cannot bypass it. Unsupported/malformed records, wrong binding, unknown
actors, missing checkpoints for recovery/first activity, or contradictory lifecycle
fail closed. Ordinary metadata inspection still permits earlier v2 fixtures with no
checkpoint; absence never establishes rollback eligibility.

#### Student-facing write-ahead barrier

Before first `apply`, `grading-dispatch`, `grading`, `report-publication` or
`student-repository-mutation`, a future trusted caller uses
`markManagedStudentActivity()` to publish:

```yaml
state: recovery_required
first_activity:
  category: grading-dispatch
  actor_github_user_id: 24680
  recorded_at: 2026-11-02T15:00:00.000Z
```

The remote marker must be confirmed before execution.
`runAfterManagedActivityMarker()` enforces this order for an independently authorized
callback. The marker is a necessary safety barrier, not operation authorization or
reconciliation readiness. Repeated marking is idempotent and preserves the first
record. Failed, stale or unconfirmed marking blocks execution; callback failure
never clears the marker. Recording intent conservatively blocks rollback even if
the subsequent operation fails before producing student artifacts.

All marker, activation and recovery calls share the existing outer account/course
serialization lease, held through the already-authorized operation or reconciliation.
The lease is not nested. Cross-machine exclusion uses the existing exact-revision
clone/freshness/non-force push boundary. A marker and rollback from the same base
cannot both publish; either winner makes the other stale. Accepted-but-lost push
responses use existing remote commit verification, without duplicate commits or
blind retries. No local runtime absence is consulted as authoritative evidence.

#### Safe rollback and explicit post-activity recovery

`TermActivationRecoveryAuthorizationResolver.canRecoverActivation()` allows fallback
or a current coordinator of the currently Active target. Former roles, Draft
preparation and Archived exceptional correction do not confer recovery authority.
`planActivationRecovery()` validates the entire lifecycle and immutable activation ID.

With `rollback_available` and complete trusted absence evidence, `safe-rollback`
restores the predecessor Archived → Active and target Active → Draft. Initial
activation rolls back to zero Active. Both retain `has_ever_been_active: true`;
coordinator/faculty history is untouched. These are explicit recovery exceptions,
never ordinary transitions. Checkpoint resolution and all lifecycle edits publish
in one commit without an intermediate zero/two-Active successor snapshot.

With `recovery_required`, simple rollback returns a typed `recovery_required`
outcome. Corroborated activity also blocks it; inconsistent evidence requires
attention. No student repositories, manifests, grading, reports or role history are
deleted to manufacture eligibility. After the durable activity marker, authorized
actors explicitly choose:

- `accept-current`: keep current lifecycle and remove the checkpoint.
- `restore-predecessor`: archive the mistaken Active and restore the existing
  Archived predecessor to Active, removing the checkpoint in the same commit.

The mistaken term remains Archived with activation history and all student data,
consuming the 8.4 late-work/history policy. Initial activation has no predecessor
resolution. A missing remote predecessor yields Needs attention, never recreation.
Resolved checkpoints are removed, not retained as a permanent recovery state; Git
history and `has_ever_been_active` preserve durable evidence. Missing resolved
checkpoints do not grant future rollback or first-operation authority.

#### Metadata first, reconciliation afterward

All changes use the existing isolated managed transaction: exact SHA, scoped paths,
one commit, non-force push and remote acceptance verification; no merge, rebase,
force push or automatic retry. `recoverManagedTerm()` returns committed plans and
publication hashes, followed by `reconcileCourseTermLifecycle()` using the unchanged
8.3 lifecycle projection. Restored Active coordinators regain course admin; current
Archived/Draft roles retain write and former-only roles read; fallback stays separate.

Draft deletion supplies the retired never-Active snapshot for empty scoped-team
membership plans in the existing Phase 7 engine. Missing retired teams are not
created; ambiguous creation journals remain Needs attention. Fresh reconciliation
may use the committed result or authoritative Git parent to identify retired scope.
No student repository cleanup is performed for a valid deleted Draft. Recovery
preserves trusted existing student permissions. Branch policy is unchanged.

External failure returns `deleted_needs_reconciliation` or
`recovered_needs_reconciliation`, preserving authoritative metadata. Successful
reconciliation never implies student readiness when zero Active remains. No external
GitHub write precedes publication and no external failure reverts its commit.
Pending organization invitations remain incomplete reconciliation, not metadata
failure. Explicit reconciliation uses fresh authoritative state.

Slice 8.5 is complete. Slice 8.6 above completes Phase 8.

---

## 10. Faculty Roles and Historical Access

Roles are term- and section-aware.

### 10.1 Term coordinators

A term supports multiple coordinators.

Term coordinators:

- can explicitly view/manage all sections in that term;
- normally see their own teaching sections first;
- can perform coordinator-wide operations after explicitly broadening scope.

Coordinator authority is historical to the term.

Coordinating one term does not generally grant authority over future terms.
The current Active term's current coordinators have the explicit Draft preparation
exception in §9.1, without becoming coordinators of that Draft. Former or Archived
term coordination does not grant this exception.

The coordinators of the most recently created term, with the fallback administrator as backup, may create the next term.

### 10.2 Section faculty

Section faculty:

- see students only in sections they currently teach;
- edit rosters only in those sections;
- Apply assignments only to those sections;
- manage section deadlines/policies only for those sections;
- grade only those sections;
- manage student GitHub identity changes in those sections.

Adding/removing sections and assigning faculty is coordinator-only.

### 10.3 Multiple faculty in one section

All current faculty assigned to a section share access to all students in that section.

Graider does not assign individual students to individual faculty members for grading.

Shared grading state records attribution and uses grading claims to avoid concurrent edits.

### 10.4 Former section faculty

If faculty are removed from a section during an Active term:

- the historical assignment is retained;
- future mutation authority ends immediately;
- they retain read-only historical access to that section.

If they remain assigned through the normal end of the term, Archived-term grading/regrading rights remain available.

Slice 8.4 interprets persisted Archived `faculty.current` as normal completion and
`faculty.former` as explicit removal. Former faculty may inspect their old section
but cannot grade, dispatch or publish merely from that former role. No role arrays
are changed by archival or by the authorization overlay.

### 10.5 Former coordinators

A coordinator removed during an Active term:

- immediately loses coordinator mutation authority;
- retains read-only historical access to the entire term they previously coordinated;
- retains stronger rights only where another active role independently grants them.

For an Archived term, `coordinators.current` retains eligible late-work and explicit
scope-expansion authority. `coordinators.former` retains historical term-wide read,
without coordinator mutation scope or late-work rights from that former role. An
independent current faculty role may still grade its own section.

---

## 11. GitHub Organization and Team Model

Each course has its own existing GitHub organization.

Graider selects and configures the organization; it does not create GitHub organizations.

Initial setup requires sufficient organization privileges to:

- create repositories;
- create/manage teams;
- manage repository permissions.

If those capabilities are absent, course setup fails before partial configuration is created.

### 11.1 Course/admin repository teams

Conceptually, Graider maintains:

- course faculty write team;
- course faculty read team;
- current coordinator admin team.

Permissions:

- current coordinators: `admin`;
- fallback administrator: `admin`;
- faculty with current or historical mutation rights: `write`;
- faculty whose remaining historical access is read-only: `read`.

A faculty member receives the strongest permission implied by any current role.

### 11.2 Term and section teams

Graider maintains term-specific teams representing:

- current coordinators;
- former coordinators;
- current faculty for each section;
- former faculty for each section.

Student-repository permissions:

- current section faculty: `admin`;
- current term coordinators: `admin`;
- former section faculty: `read`;
- former coordinators: `read` across the term.

Archived-term faculty/coordinators who completed the term normally retain the permissions needed for permitted late grading/regrading.

### 11.3 Students

Students are not added as organization members merely because they are enrolled.

They remain individual collaborators only on their own assignment/group repositories.

### 11.4 Desired-state reconciliation

Course configuration is authoritative for Graider-managed team membership.

Manual drift in Graider-managed teams is detected and reconciled.

Unrelated organization teams are left untouched.

If a faculty member has not yet accepted the organization invitation:

- the faculty/section assignment may exist in a Pending state;
- term activation is not blocked;
- Graider completes team membership after invitation acceptance;
- affected workflows clearly show that faculty access is incomplete.

### 11.5 Managed-team identity contract (Slice 7.1)

Slice 7.1 implements a pure identity subsystem in `src/github/managed-team-identity.ts`.
It performs no GitHub mutations and is not wired into production v1 behavior.
Team ownership must **never** be inferred from a human-readable name or slug.

The seven logical kinds align with Phase 6's independent coordinator, section-faculty
and course-administration concepts:

| Kind                          | Required scope          | Meaning                                    |
| ----------------------------- | ----------------------- | ------------------------------------------ |
| `course-read`                 | course repository       | Course-wide faculty read team              |
| `course-write`                | course repository       | Course-wide faculty write team             |
| `course-current-coordinators` | course repository       | Course-wide current-coordinator/admin team |
| `term-current-coordinators`   | course + term           | Current coordinators for one term          |
| `term-former-coordinators`    | course + term           | Former coordinators for one term           |
| `section-current-faculty`     | course + term + section | Current faculty for one section            |
| `section-former-faculty`      | course + term + section | Former faculty for one section             |

These identify roles/scopes only. They do not compute membership, map the fallback
administrator to a team, or calculate strongest effective repository permissions.
`AuthorizationResolver`, `TermCoordinators`, `SectionFaculty` and fallback-administrator
policy remain independent; membership and permission calculation belong to later slices.

#### Metadata representation and versioning

The [GitHub Teams REST API](https://docs.github.com/en/rest/teams/teams#get-a-team-by-name)
exposes numeric team ID, description, current name and slug, and supports descriptions
as a team field. Graider reserves the **entire description** for one compact marker:

```text
graider-team:v1:{"courseRepositoryId":1342086585,"kind":"section-current-faculty","termCode":"27s1","sectionId":"001"}
```

`graider-team:` explicitly identifies the Graider ownership namespace; `v1` is metadata
version 1, independent of course/term YAML schema versions. The payload is canonical
compact JSON in exactly this order: `courseRepositoryId`, `kind`, then `termCode` and
`sectionId` only where applicable. JSON escaping preserves opaque section IDs without
delimiter collisions. This representation is deterministic and is also the logical
identity key; property order in caller input does not affect rendering.

`createManagedTeamIdentity` strictly validates shape and returns an immutable snapshot.
Repository IDs must be positive safe integers. Course kinds reject all term/section
fields. Term kinds require a valid `YYsN` term code using the existing `TERM_CODE_PATTERN`
(semesters 1–3) and reject section fields. Section kinds require both term and section;
section IDs use the existing term schema's nonempty string definition without numeric
coercion, case folding or trimming. `001` remains distinct from `1`. Unknown kinds or
extra fields are rejected rather than stripped.

`renderManagedTeamMetadata` and `parseManagedTeamMetadata` are the sole serialization
boundary. The parser accepts only the exact canonical v1 representation. Duplicate
JSON keys, additional text, multiple markers, invalid scope, extra fields, whitespace
changes or reordered fields fail closed as `malformed_metadata`. An unknown positive
version is `unsupported_metadata_version`; its payload stays opaque and never receives
v1 semantics. Descriptions without the reserved marker namespace are `unmanaged`.
Invalid or unsupported metadata never establishes ownership or permission to modify.

#### Course isolation, concrete identity and conflicts

`courseRepositoryId` is the immutable GitHub **course/admin repository ID** supplied
by trusted outer course context (for example, Phase 2 discovery). Current v2 YAML does
not persist this ID, and this slice adds no YAML field or guessed identity. Organization
login, repository name, course code and local/managed paths are display/locator data.
Repository and organization renames do not create a new logical team identity.

`classifyManagedTeam(team, selectedCourseRepositoryId)` distinguishes `managed_for_course`
from `managed_for_other_course`, `unmanaged`, `malformed_metadata`,
`unsupported_metadata_version` and `invalid_team_resource`. Selected-course context
must itself be a valid repository ID. A marker for repository 111 cannot authorize
operations for repository 222, even when names and role/scope match. Recognized teams
retain an immutable `ObservedManagedTeam` snapshot containing logical `identity` and
the concrete `team` resource with its required positive safe-integer GitHub numeric ID.
Legacy read clients may omit ID, but such a resource cannot be recognized as manageable.

For a team with numeric ID 12345, changing name from `27s1-section-001-faculty` to
`CSC1020 Section 001 Faculty` and changing its slug leaves both logical identity and
concrete resource identity unchanged when metadata stays intact. Names and slugs are
locators only. A different numeric team ID is a different remote resource even if its
description claims the same logical role. Rename reconciliation is deferred.

`findDuplicateManagedTeams` inspects selected-course claims and returns immutable
conflict information with `status: needs_attention`,
`reason: duplicate_managed_team_identity`, logical identity and **every distinct
claiming resource**. Repeated observations of the same numeric team ID do not create
a duplicate. Different kinds, terms, sections and courses remain distinct; another
course's teams never enter the selected-course conflict groups. No winner, deletion,
merge or rename is inferred. Classification alone is neither mutation authorization
nor proof of uniqueness: future reconciliation must inspect the complete visible
inventory, stop on conflicts and enforce outer authenticated course/organization
authority. The description marker is an ownership declaration, not a cryptographic
proof against someone who already has permission to edit team descriptions.

The existing `GitHubTeam` read model gained optional nullable `description`; Octokit
projects it alongside existing ID/name/slug/org. ID remains optional for compatibility
with old v1 readers, while managed classification requires it. No new team discovery
or mutation endpoint was added. Legacy Schema-v1 `faculty_team` names, retained grader
evidence from 6.6 and unrelated teams without valid metadata remain unmanaged, even
when their names look generated. Explicit migration/adoption belongs to Phase 9.

Both `OPERATIONAL_COURSE_SCHEMA_VERSION` and `OPERATIONAL_TERM_SCHEMA_VERSION` remain
**1**. Existing v1 faculty-team handling is unchanged. No team creation, deletion,
rename, membership reconciliation, invitations, permission reconciliation, branch
rules or production-v2 activation occurs in Slice 7.1. Slice 7.2 adds organization
invitation infrastructure below; 7.3 adds team membership reconciliation, 7.4 course
repository permissions, and 7.5 student-repository permissions below. Branch rules remain deferred.

### 11.6 Faculty organization access contract (Slice 7.2)

Every persistent Schema v2 `faculty_directory` identity represents intended membership
in the selected course organization. This includes fallback administrators, current
and former coordinators, section faculty and historical faculty. Course metadata
records intended identity first; GitHub membership is reconciled external state.
Role changes never trigger removal or cancellation.

`FacultyOrganizationReconciler` is backend/domain infrastructure only. It snapshots a
validated v2 course, trusted canonical course repository ID and authenticated GitHub
account ID. Its operation accepts only a directory GitHub user ID; the organization
comes from that course snapshot. It rechecks the authenticated account and its active
organization membership, and rejects mismatched accounts/organizations. No Electron,
CLI, current Course Setup, discovery or Apply flow invokes it.

The future outer service must obtain metadata from the selected canonical repository,
bind the client to the selected authenticated OAuth session, enforce modeled course
mutation authorization and source-revision checks, serialize reconciliation, and
invalidate the context on session/account/course changes. Renderer-provided account,
organization, course metadata or arbitrary login must never construct this context.
The constructor is an internal trust boundary, not an IPC request validator.

The immutable GitHub user ID is canonical. The directory's current login is resolved
and must yield that ID before classification or invitation. A different returned
current login with the same ID is accepted, but metadata is never rewritten. A
recycled login, missing account or lookup failure needs attention. Institutional
usernames and login history are never lookup or invitation fallbacks.

`FacultyOrganizationAccess` carries faculty ID, canonical course repository ID,
selected organization and a typed state:

| State                 | Meaning                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `active`              | The verified immutable user ID appears in the selected organization's membership. |
| `pending_invitation`  | A verified invitation awaits acceptance; includes its invitation resource ID.     |
| `invitation_required` | Neither active membership nor a matching pending invitation exists.               |
| `needs_attention`     | Typed identity, capability, policy, transport or unexpected-response failure.     |

The reusable inventory keeps active members and pending invitations separate.
`inspect()` reads all pages (100 records/page, bounded at 1000 pages), then classifies
each directory identity without mutation. A faculty lookup failure does not stop
other classifications; inaccessible/incomplete inventory fails closed. Pagination
uses numbered requests, never provider-supplied destination URLs. Active member IDs
are checked directly. An invitation's `id` identifies the **invitation**, not its
invitee: the invitation login is resolved to an immutable user ID, also checked against
`invitee_id` if supplied. Conflicting claims, duplicate matching invitations and
non-membership roles need attention. An email-only/unresolvable invitation cannot
establish identity or safely prove absence for another intended invitation, so missing
membership remains Needs attention in that inventory. Existing verified active or
pending access can still be classified.

The [GitHub organization members API](https://docs.github.com/en/rest/orgs/members)
provides paginated `GET /orgs/{org}/members`, `GET /orgs/{org}/invitations` and
`POST /orgs/{org}/invitations`. Invitation writes use verified immutable `invitee_id`
and `role: direct_member`, with no email, mutable-login target or team IDs. GitHub
requires an organization owner; fine-grained tokens require organization **Members:
write**. Classic/OAuth organization membership write capability is `write:org` (or the
encompassing `admin:org` grant); GitHub enforces endpoint-specific permission. The current Phase 2
OAuth request remains `read:org repo`: it does not silently acquire broader access.
Reconciliation checks owner role and, where GitHub exposes classic scope evidence,
`write:org` or `admin:org`. Absent scope headers are not proof of permission; GitHub's endpoint
remains authoritative for fine-grained credentials. Future OAuth upgrade UX is deferred.

`reconcile(githubUserId)` reads fresh inventory. Active membership and existing pending
invitations cause no write. Missing verified membership plus sufficient capability
permits one invitation attempt. The adapter does not retry invitation POSTs. After
both a successful response and an ambiguous exception, the reconciler rereads session,
members and pending invitations. Only observed Active/Pending is success; an API
acknowledgment alone is insufficient. A bounded recovery read can still run after
the mutation transport was aborted. No observed result yields Needs attention.

An explicitly supplied `FacultyInvitationJournal` records attempts before POST and prevents
another write after an ambiguous or unobservable result. Retain it across service
recreation; every journal operation is awaited, and tests use an in-memory `Set`.
Future production wiring **must persist it durably before sending**, and
share serialization for the selected session/course. Definitive authorization/policy/
rate-limit rejection permits a later explicit retry after repair. Verified observable
success resolves uncertainty. This slice introduces no production persistence/IPC flow.

Failures follow Phase 2 status/header conventions and existing `GitHubClientError`
kinds: insufficient scope, denied/hidden access, SSO required, OAuth approval policy,
rate limiting, network failures and unexpected responses remain distinct typed
Needs-attention reasons. Provider text/credentials are not returned and no alternative
system or unauthenticated credential is used.

Pending is legitimate incomplete external access. Faculty remain in the directory;
coordinator and section references and course/term metadata validity are unchanged.
Future term activation must not be blocked solely by Pending. `AuthorizationResolver`
remains authoritative for course roles: pending GitHub access does not revoke modeled
roles, and arbitrary organization membership grants no Graider authorization.

Slice **7.3 — Team Membership Reconciliation** consumes these per-faculty access
results: Active can proceed to team reconciliation; Pending leaves team access
incomplete and should be surfaced clearly in eventual UI/workflows. Managed-team
identities from 7.1 are unchanged. No team mutation, repository permission, branch
rule, removal, cancellation, migration or term lifecycle is implemented here. Both
operational schema gates remain **1**, with current v1 behavior preserved.

### 11.7 Managed-team membership contract (Slice 7.3)

`buildDesiredTeamMemberships` is pure Schema v2 domain infrastructure. It validates
and snapshots the course and exactly the supplied terms, resolves role references
through `TermCoordinators` / `SectionFaculty` and their `FacultyDirectory`, and emits
immutable numeric GitHub user ID sets paired with the existing 7.1 team identities.
Duplicate supplied term/section scopes and unknown faculty references fail closed.

| Managed-team kind             | Desired membership                                               |
| ----------------------------- | ---------------------------------------------------------------- |
| `term-current-coordinators`   | That term's `coordinators.current`.                              |
| `term-former-coordinators`    | That term's `coordinators.former`.                               |
| `section-current-faculty`     | That exact term/section's `faculty.current`.                     |
| `section-former-faculty`      | That exact term/section's `faculty.former`.                      |
| `course-current-coordinators` | Any current coordinator across the supplied terms.               |
| `course-write`                | Any current section faculty without a current coordinator role.  |
| `course-read`                 | Any historical/former role without either stronger current role. |

A faculty identity occupies exactly its single strongest applicable **course-wide**
team: current coordinator, otherwise current section faculty, otherwise former
coordinator/section faculty. Term and section teams remain independent; the same
identity can occupy several exact scoped teams. Directory-only faculty receive no
team membership. Fallback administration is a separate course-recovery identity,
never an implicit team insertion; an independently assigned role still applies.
Fallback course-repository admin access belongs to 7.4.

Course-wide roles are the union/strongest role across exactly the supplied term set.
No Draft/Active/Archived filtering or other Phase 8 lifecycle policy is inferred.
The caller must supply the complete intended term set before permitting course-wide
drift removal. Teams for unsupplied terms are left untouched; their cleanup/lifecycle
is not inferred from omission. Current→former and restored-current transitions update
the corresponding section/term teams and course-wide strongest role. No reconciliation
operation modifies course/term metadata.

`ManagedTeamMembershipReconciler` composes 7.1 identities, that desired state, and the
7.2 `FacultyOrganizationReconciler.inspect` dependency. It remains backend-only,
with no production CLI/Electron/Apply/Course Setup/discovery/grading wiring. The
trusted caller must bind canonical course repository ID and validated metadata to
the selected OAuth session, enforce `AuthorizationResolver` and source-revision
authorization, provide the complete term set, serialize instances, and invalidate
contexts when the selected session/account/course changes. Organization/access/team
claims from the renderer must not construct this service.

Before any writes, the service completes paginated organization-team inventory with
numeric ID, name, slug, description and parent evidence. It requires an authenticated
active organization **owner** so secret teams are visible too. A member-visible subset
cannot establish uniqueness. All records are classified with 7.1, and
`findDuplicateManagedTeams` blocks each conflicting logical identity, reporting every
claiming numeric resource. It never chooses a winner. A malformed/unsupported ownership
marker cannot be proven unrelated using the canonical parser, so conservatively blocks
all desired teams in that organization. Conflicting numeric IDs/slugs, incomplete pages
or malformed resources also block writes. Unmanaged, other-course, legacy `faculty`
and historical grader teams never establish authority through names or slugs.

`GET /orgs/{org}/teams` and team-member reads paginate at 100 records per page, bounded
at 1000 pages; supplied next-page URLs are never followed. Before each membership
write, complete inventory is reread, uniqueness is checked again, and the concrete team
is fetched by numeric organization/team IDs to verify its canonical description and
organization. The [GitHub numeric team routes](https://docs.github.com/en/rest/teams/members)
use `/organizations/{org_id}/team/{team_id}` for resource reads, member inventory and
membership PUT/DELETE. Renames do not redirect writes to a reused slug. Because team
membership includes descendants, managed teams with a parent or children, or explicit
inherited members, need attention rather than modifying any related team hierarchy.
Hierarchy management is deferred.

If a desired team is missing, create a closed team with the exact canonical 7.1
description and a deterministic human-readable `managedTeamDisplayName`, including a
short identity digest. Names are presentation only. An unmanaged display-name/slug
collision yields typed `team_name_conflict`; it is never adopted, overwritten or renamed.
Creation assigns no repository permissions, parent, faculty or other team membership.
Any GitHub-supplied initial creator membership enters the ordinary observed drift set.
After creation, reread the complete inventory, require exactly one matching logical
team and retain its numeric ID; if creation supplied an ID, it must match. Only then
may membership reconciliation begin.

Team creation is journaled **before POST**, using the 7.2 awaited journal abstraction
with distinct keys bound to immutable organization ID and complete logical identity.
Keys survive account switches. After success or ambiguous failure, reread remote state;
one unique matching resource recovers the write, while none/multiple yields Needs
attention. A retained unresolved key forbids another automatic create. Production must
provide durable journal storage and shared serialization before enabling this service.
Tests use only in-memory journals and fake/mocked GitHub clients. A journal failure
prevents sending a create. No write endpoint has adapter-level blind retries.

For each verified team, exact desired IDs are compared to complete observed member IDs:

- Desired plus 7.2 `active`: add if missing; already present causes no write.
- Desired plus `pending_invitation`: no membership mutation for that faculty; report
  `pending_organization_access` / `organization_invitation_pending`.
- Desired plus `invitation_required`: no invitation is sent; report the incomplete
  `organization_invitation_required` dependency.
- Desired plus `needs_attention`: no membership mutation for that faculty; preserve
  its safe typed reason. Missing, duplicate or other-course access results fail closed.
- Observed but undesired: remove from this proven managed team only, including users
  outside the faculty directory. Organization membership and unrelated teams remain.

Before a missing desired user is added, refresh 7.2 access again. A membership API
locator is always verified through current account lookup against the intended numeric
ID: directory current login for additions, observed member login for removals. The
resolved current login may change while ID stays stable. Institutional username and
login history are never fallbacks. Existing members satisfy desired membership by
immutable ID. No role/maintainer changes are made to an already correct membership.

After PUT/DELETE, reread the complete team inventory, numeric resource and paginated
membership to verify the expected immutable ID is present/absent. Both successful HTTP
responses and lost responses require this observable verification. Unobserved results
are Needs attention, never fabricated success. A later explicit run may repeat an
idempotent membership PUT/DELETE only after fresh state still shows the drift and all
identity/access preconditions pass. GitHub offers no atomic conditional mutation over
metadata ownership, organization access and team membership; concurrent external drift
can still cause a mutation to fail or remain unverified and must be surfaced accordingly.

Per-team `ManagedTeamOutcome` includes logical identity, numeric team ID when known,
conflicting IDs when applicable, status and per-faculty ID/desired/observed outcomes.
Statuses are `up_to_date`, `reconciled`, `pending_organization_access`, `needs_attention`;
an unknown observation is `null`. User-specific failures do not block independent
faculty; Pending does not block active faculty or definitively undesired removals.
Any subsequent ownership or membership snapshot failure stops that affected team.
Independent logical teams continue where their own complete snapshot is safe.
Provider bodies and credentials never enter results. Existing Phase 2/7.2 error
classification is reused for capability, SSO/OAuth policy, rate-limit and transport errors.
Current OAuth scopes stay unchanged; known read-only grants cannot write, and GitHub
remains authoritative for endpoint permissions and organization restrictions.

Pending access never invalidates a persisted assignment or changes modeled course
authorization. `AuthorizationResolver` remains authoritative. Both operational schema
gates remain **1**; 7.1 metadata format and production v1 behavior remain unchanged.
No organization-member removal, invitation sending, team rename/deletion, v1 adoption,
repository permissions, branch rules, migration or term lifecycle is implemented.

Slice **7.4 — Course Repository Permissions** below consumes verified per-team/per-faculty
results, distinguishes incomplete access from modeled roles, and handles fallback
administration separately when assigning course/admin repository read/write/admin.

### 11.8 Course/admin repository permission contract (Slice 7.4)

`CourseRepositoryPermissionReconciler` is backend-only Schema v2 infrastructure. It
targets the selected canonical course/admin repository by immutable GitHub repository
ID, with an independently trusted immutable organization ID and authenticated account
ID from Phase 2 context. Metadata names, course code, local path and renderer-provided
owner/repository strings cannot authorize a write.

Every preflight refreshes `/user`, resolves `/repositories/{repository_id}`, verifies
the exact repository ID and expected organization owner ID/type, and requires current
repository admin authority plus active organization owner membership. Transfers are
typed `repository_transfer_requires_migration`; archived/disabled repositories and
identity mismatches block mutation. Repository/organization renames preserve identity:
the freshly resolved resource supplies current locators. Locator-based paginated reads
are bracketed by canonical re-resolution, and a rename during a read fails safely.
The last canonical resolution immediately before each mutation supplies its locators.
There is no GitHub atomic conditional write across these separate resources; concurrent
external changes may still cause failure or an unverified result.

The trusted outer service must bind validated metadata and source revision to this
canonical repository and OAuth session, enforce `AuthorizationResolver`, provide the
complete intended term set and share serialization across operations. Read dependencies
are backend factories/readers for the same course, session and revision. After a
verified organization rename, they may use an execution-only course snapshot with
the new organization locator; this never rewrites persisted metadata or faculty identity.
No production Electron/CLI/Apply/discovery/grading/Course Setup path invokes this service.

| Proven managed course-wide team | Exact repository permission | Concept                |
| ------------------------------- | --------------------------- | ---------------------- |
| `course-current-coordinators`   | `admin`                     | Course administration. |
| `course-write`                  | `push`                      | Course write.          |
| `course-read`                   | `pull`                      | Course read.           |

Role → membership remains owned by 7.3; team kind → permission is the only 7.4 mapping.
No permission is inferred from current team members, and `maintain` is not a substitute.
Missing/lower permissions are granted/upgraded, higher permissions are reduced to the
exact defined value, and exact access causes no write. GitHub combines independent
sources so fallback admin plus historical read still yields admin, and coordinator
plus section-faculty roles retain coordinator admin authority. Custom/unknown or
inconsistent repository-role evidence fails closed rather than guessing equivalence.

7.3 now exposes a **read-only `inspect()`** using its existing desired state, full
organization-team inventory, canonical metadata/duplicate checks, numeric resource
verification and complete member snapshots. Missing teams, extras, inaccessible
snapshots and ownership ambiguity produce per-team Needs attention without creating
teams or changing members. 7.4 consumes these fresh outcomes before and after writes;
it does not recalculate role membership, create teams or invoke membership mutations.
Missing teams must be reconciled through 7.3 explicitly. Its durable unresolved-create
journal and shared serialization remain required before production activation; 7.4
adds no alternate creation path.

Only `up_to_date`/`reconciled` membership or safe `pending_organization_access` may
receive a team grant. Pending is safe when the verified team has no observed
unauthorized extras; absent Pending faculty gain access later through 7.2/7.3.
Needs attention, duplicate/missing outcomes, unknown numeric IDs, unknown observations
or inconsistent desired/observed membership block changed permission for that team.
The concrete numeric team resource is refreshed and checked against the exact 7.1
description and organization before mutation. Numeric organization/team routes avoid
stale slug authority; owner/repository locators come from the canonical repository.

Repository team associations are fully paginated (100/page, at most 1000 pages),
retaining numeric ID, current name/slug, description, parent and exact permission.
Incomplete/conflicting snapshots block writes. Parent/inherited-team ambiguity is
not reconciled. Another course's managed association is surfaced as Needs attention
and left untouched. Unmanaged, legacy faculty/grader and malformed/unsupported claims
are never adopted or mutated based on a name.

Selected-course proven term/section teams are not desired course-repository permission
holders. Their direct association may be removed only after a complete snapshot,
fresh safe 7.3 outcome for that exact numeric team, **all three** course-wide teams
holding exact permissions with complete non-Pending membership, and verified separate
fallback admin access. Otherwise cleanup remains incomplete/Needs attention. This
conservative order establishes replacement access before removal. Unsupplied-term
teams without a safe 7.3 outcome are not cleaned up by inference.

The current `FallbackAdministrator` immutable faculty ID receives a separate direct
`admin` grant, including fallback-only faculty without team membership. 7.2 must report
Active for this exact course/organization identity; Pending/Invitation-required remain
incomplete, and Needs attention preserves its reason. Resolve only the directory's
current login and verify its immutable ID before using the returned current locator.
Institutional username and login history never serve as fallbacks. The fallback is
never inserted into `course-current-coordinators` by this slice.

The [collaborator REST API](https://docs.github.com/en/rest/collaborators/collaborators)
reports effective permissions across sources. Effective admin through a team does not
prove an independent fallback grant. A narrowly filtered, cursor-paginated GraphQL
collaborator query therefore uses the canonical repository node ID and
[`permissionSources`](https://docs.github.com/en/graphql/reference/repos#permissionsource)
to require a Repository source for this repository and organization, matched to the
fallback's immutable user ID. Team/organization sources alone do not satisfy that grant.
GraphQL errors, missing source evidence, identity mismatch or incomplete pagination
fail closed; provider error bodies are never exposed. If GitHub cannot expose or
establish a separate direct source (including account/policy restrictions), the result
remains Needs attention rather than fabricated independent access.

Direct collaborator grants have **no Graider ownership marker**. There is no direct
collaborator DELETE capability in this new transport, no arbitrary collaborator sweep,
and no guessed former-fallback revocation. A future fallback-transfer workflow needs
durable provenance and a separately authorized cleanup policy; old grants may remain
until that work is designed. They must not be removed based solely on the new fallback.

After every team permission PUT/DELETE or fallback admin PUT, reread observable access
and recheck identity/dependencies. An HTTP acknowledgment alone is insufficient.
Ambiguous transport outcomes recover only if the exact desired permission is observed;
unchanged or unknown state yields typed Needs attention. A later explicit run may
repeat idempotent writes only after fresh reads prove drift and authority. No
adapter-level blind retries or new permission-write journal are added. Existing error
classification preserves capability, SSO/OAuth policy, rate-limit and network reasons;
OAuth scopes remain unchanged and no alternate credential is used.

Outcomes include canonical repository ID, logical team/fallback identity, numeric team
or user ID, exact desired permission, observed permission (`null` when unknown), status
and safe reason. Statuses are `up_to_date`, `reconciled`, `pending_organization_access`
and `needs_attention`. Pending never invalidates the course/term model or grants a
modeled role; `AuthorizationResolver` remains authoritative.

Both operational schema gates remain **1**. Production v1 faculty-team Apply handling
is unchanged. No student-repository permissions, branch rules, invitations, organization
removal, team mutation/adoption, migration or term lifecycle is implemented here.

Slice **7.5 — Student Repository Permissions** below reuses canonical repository identity,
7.3 verified scoped membership and exact permission verification, preserving incomplete
access and unowned-grant boundaries rather than inferring authority from team names.

### 11.9 Student/group repository permission contract (Slice 7.5)

`StudentRepositoryPermissionReconciler` is backend-only Schema v2 desired-state
infrastructure. Each repository requires a trusted immutable numeric GitHub repository
ID and exact term/section ownership. Names, URLs, course codes, assignment patterns,
local paths and renderer-provided section/team fields cannot establish that authority.

`TrustedStudentRepositoryTarget` contains canonical course repository ID, immutable
organization ID, student repository ID, term code, exact section ID, assignment slug,
target ID, individual/group mode and complete trusted section evidence (`sectionIds`).
Both individual and group evidence must identify exactly one section matching `sectionId`.
Group membership/roster evidence must account for all members; groups spanning sections
are Needs attention. Validation returns immutable snapshots and typed incomplete/failure
results rather than guessing missing identity. Targets must name an existing exact
term/section in the supplied v2 state and cannot identify the course/admin repository.

The entire input batch is checked before remote work. Repeated repository IDs, conflicting
ID→term/section/assignment/target mappings, and the same logical target mapped to different
repository IDs are rejected for every affected row. An otherwise-invalid conflicting
row cannot authorize a valid-looking row for the same ID. Independent valid targets
continue. These checks validate consistency, not provenance: the future outer caller
must establish trust in the source state before constructing this context.

**Current persistence boundary:** individual Apply's `ManifestRepositoryIdentity.id`
is populated from the observed GitHub repository in `apply-executor.ts`, and round-trips
through the existing manifest loader/renderer. It is optional for old manifests, and
the existing loader's numeric type is not itself sufficient: 7.5 requires a positive
safe integer. `studentTargetsFromManifest` uses only explicit individual record ID,
section, student/target identity and assignment term/slug, plus trusted course/org IDs.
It never joins or resolves records by repository name/URL. The outer caller must
verify manifest/source revision and course binding before using this adapter.

Current `ApplyRepositoryTarget` and `ManifestRepositoryTarget` contain names and scope
but no immutable repository ID. Group execution temporarily observes a `GitHubRepository`,
but its result/checkpoint projection preserves target/name/URLs without that numeric ID.
Therefore group manifests and ID-less legacy records yield typed
`immutable_repository_id_required`, even when their names look correct. A trusted outer
resolver must supply an explicitly verified ID and single-section mapping for those
repositories. No manifest schema, group Apply projection or Phase 11 section-state
migration is changed, and no production flow is wired to this adapter in this slice.

For each trusted target, the exact four independent team grants are:

| Team identity scoped to the target       | Exact permission |
| ---------------------------------------- | ---------------- |
| `term-current-coordinators` / term       | `admin`          |
| `section-current-faculty` / term/section | `admin`          |
| `term-former-coordinators` / term        | `pull`           |
| `section-former-faculty` / term/section  | `pull`           |

Current roles receive admin; former roles intentionally retain historical read access
for grading/regrading. A current coordinator who is also former section faculty keeps
both independent grants, and GitHub naturally supplies effective admin. No role sources
are collapsed, and no Draft/Active/Archived filtering or other Phase 8 policy is invented.
Course-wide teams and fallback-only administration never create a desired student
grant. A fallback administrator with an independently relevant role receives that role's
ordinary team access through 7.3. Desired permissions are only `admin`, `pull`, `none`;
`push`, `maintain` and custom roles are never substitutes.

7.4's canonical repository/session checks, complete repository-team pagination,
numeric team verification and safe 7.3 outcome checks are shared through
`RepositoryTeamPermissionBoundary`. Existing course/admin behavior is retained.
For student work, both canonical course and target repositories are refreshed by ID;
expected immutable organization ownership, current session/owner/repository admin
authority and available GitHub capability must still hold. Transfer is a migration
condition. Renames preserve identity and only update runtime API locators. Locator-based
reads are bracketed by canonical re-resolution; names/slugs never authorize writes.

Fresh read-only 7.3 `inspect()` outcomes prove logical identity, numeric team ID,
uniqueness and membership. `up_to_date`/`reconciled` are safe. Safe Pending outcomes
with no observed unauthorized extras may receive their exact grant; missing faculty
gain access when 7.2/7.3 complete. Unknown or unsafe membership blocks changes for
that team. Missing teams require explicit 7.3 reconciliation, with no creation or
membership path in 7.5. Production composition must retain 7.3's durable unresolved-
creation journal and shared serialization requirement.

Missing/lower grants are added/upgraded, excessive grants are reduced exactly, and
exact permissions cause no write. Permission is chosen from the exact four identities,
never from team name or current member count. Complete association snapshots retain
numeric team ID, current name/slug, canonical description, parent evidence and observed
permission. Pagination remains bounded at 1000 pages of 100, with no supplied URLs
followed. Incomplete, conflicting, custom-role or inherited-team evidence fails closed.

Any other proven **selected-course** managed team directly associated with a student
repository is undesired access: wrong section, wrong term, obsolete scoped identity or
course-wide team. Cleanup first requires all four replacement desired grants to be exact,
with verified safe 7.3 membership and a complete repository snapshot. **Pending alone
does not prevent cleanup**: another section's access must not linger solely because
correct faculty are awaiting organization access. An unsafe/missing desired dependency
does block destructive cleanup, and ambiguous repository scope blocks every mutation.

Before removal, read the complete organization team inventory, rule out duplicate
logical ownership claims, and verify the exact numeric resource/7.1 marker/organization.
This also permits removing a proven obsolete identity outside supplied term state
without inventing its current membership or lifecycle policy. Parent/child ambiguity
is not reconciled. Another course's association is surfaced as Needs attention and
preserved; unmanaged, legacy faculty/grader and malformed/unsupported claims are never
adopted or removed. Historical `pull` on either of the four desired teams remains desired.

Students remain individual collaborators on their own individual/group repositories.
No direct collaborator read/write/removal, student permission calculation or arbitrary
collaborator sweep is introduced. Such grants lack Graider ownership metadata and
remain untouched, as in 7.4. This slice manages only faculty team repository associations.

Every write rechecks canonical repository/account/org identity, numeric team and marker,
desired scope and the applicable dependency/cleanup proof. After PUT/DELETE, reread
the canonical repository and complete associations and require the exact observed state.
HTTP success is insufficient; a lost response recovers only if desired state is visible.
Old/unknown state remains Needs attention, and a later explicit idempotent retry must
start from fresh observed drift. There are no adapter-level blind retries or new creation
paths. As in 7.4, GitHub has no atomic conditional write across all these resources;
concurrent external changes may cause failure or unverified results.

Results are per repository and per team, with repository ID, exact term/section/target,
logical identity, numeric team ID when known, desired/observed permission and safe
reason. Statuses remain `up_to_date`, `reconciled`, `pending_organization_access`,
`needs_attention`; unknown observations are `null`. One failed repository does not
prevent independent targets from proceeding. Credentials/provider bodies never enter
results. Persisted course/term role metadata and direct student/group collaborator
grants remain unchanged throughout reconciliation.

The future production caller must bind authenticated OAuth session, canonical course
and organization IDs, validated complete v2 term state, trusted repository ID→scope
evidence, source revisions and `AuthorizationResolver` authority. Renderer names,
sections or team slugs cannot construct this trust boundary. Both operational schema
gates remain **1**, and current v1 individual/group Apply, student permissions, faculty
scope, setup, grading and discovery behavior remain unchanged. No branch rules,
invitations, team creation/membership, adoption, migration or lifecycle is activated.

Managed branch rules are implemented in 7.6 below. Preserve explicit immutable
target/scope proof, the direct-collaborator non-ownership boundary and the
production/journal gates.

### 11.10 Managed branch policy contract (Slice 7.6)

`ManagedBranchReconciler` completes Phase 7 as backend-only desired-state
infrastructure. No production v1 setup, Apply, grading, discovery or publication
path invokes it. Both operational schema gates remain **1**. Slice 8.1 now defines
term lifecycle state in §9; this Phase 7 service applies no lifecycle policy and
does not activate production v2.

The exact managed policy for the course/admin canonical branch and every trusted
individual/group submission branch is:

- ordinary non-force direct pushes remain allowed;
- force pushes and branch deletion are blocked;
- administrators and custom bypass roles are subject to the protection;
- no automatic force-push bypass is created;
- no PR, approval, status-check, signature, linear-history, conversation-resolution,
  deployment, merge-queue, lock or push-allowlist requirement is introduced.

The implementation uses [GraphQL branch-protection rules](https://docs.github.com/en/graphql/reference/branches).
An existing exact rule is updated **by immutable rule ID**, sending only
`allowsForcePushes: false`, `allowsDeletions: false`, `isAdminEnforced: true`.
It never reconstructs or PUT-replaces an administrator's full protection object.
Omitted GraphQL input fields preserve unrelated configuration, including inactive
review settings and compatible branch-creation restrictions. A new exact rule
explicitly disables unrelated push requirements instead of relying on API defaults.

Administrator enforcement is intentional: current students can have repository admin
permission, and GitHub's ordinary [administrator bypass](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
would otherwise weaken force-push/deletion protection. The effective REST protection
must corroborate `enforce_admins.enabled: true` as well as disabled force pushes and
deletions; a GraphQL DTO alone does not establish success. This still permits normal
student pushes and Graider's non-force direct commits. Exceptional faculty/admin
recovery requires an authorized administrator to explicitly change/remove protection
first; the reconciler creates no automatic recovery bypass. Repository admin rights
to edit protection are not changed by this slice.

The canonical repository/session resolver extracted for 7.4/7.5 is reused, with a
narrow read-authority client rather than permission/team/collaborator mutation powers.
It resolves every repository by immutable numeric ID and verifies expected immutable
organization ID, account, active owner membership and repository admin capability.
Transfers require migration; renames only refresh runtime locators. Default branch
is a fresh optional projection from GitHub, with no hardcoded `main`/`master` fallback.

The course target always follows the current default branch, without adding a course
schema field. Student/group targets reuse 7.5's immutable ID→term/section/assignment/
target model, duplicate/conflict rejection and complete single-section evidence.
Cross-section groups, ID-less/name-only targets, wrong context or unknown scope receive
Needs attention without a branch mutation. A trusted execution-only `submissionBranch`
may override the student default; no persisted assignment schema field is introduced.
Without an override, the freshly observed default is the submission branch. Template
branch names and manifest URLs never select a branch. Literal Git branch names are
validated conservatively; glob-special targets are not accepted as exact patterns.

GraphQL reads use the canonical repository node ID. They verify repository/org identity,
the exact existing `refs/heads/` ref and its ID/name, and the server-selected
`Ref.branchProtectionRule` ID. Missing branches are never recreated or replaced with
another guess. Complete cursor-paginated rule inventory is paired with full inspected
policy fields, bypass counts and reported conflicts. REST effective protection provides
an independent check and rejects unknown/incompatible protection fields. Truncated
conflict information or contradictory evidence cannot authorize mutation.

Exactly one exact rule may target the branch. Multiple exact rules, unknown effective
IDs or unresolved conflicts need attention; rule age, response position and names
never choose a winner. For an exact rule, known wildcard overlaps can be resolved only
when GitHub reports that exact ID as effective and the complete inventory/conflict
references establish the other identities. This uses GitHub's [specific-name precedence](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule),
with no local fnmatch or guessed creation-time ordering.

A compatible effective wildcard already satisfying the full policy causes no write.
A weak otherwise minimal wildcard may be superseded by a new literal exact rule,
whose effective ID and protection must then be reread and verified. The wildcard and
other branches remain untouched. A wildcard carrying other manual settings is not
overridden if that would discard them. Competing wildcard conflicts fail closed.
Manual PR/check/signature/history/deployment/lock/push-restriction requirements and
force-push bypass actors produce `incompatible_existing_branch_protection` with safe
condition codes, rather than weakening administrator policy or claiming normal pushes
will work. Compatible stricter exact policy is preserved by the three-field patch.

Rulesets are **read-only and unowned**. Complete repository ruleset inventory includes
parent organization/enterprise policy, and the branch-effective rules endpoint checks
active applicable branch rules. Active push rulesets also block reconciliation because
they can constrain ordinary pushes independently of the branch endpoint. Unknown
enforcement/target semantics and any applicable active ruleset return
`unassessed_existing_ruleset`; this slice does not claim to prove their bypass/actor
semantics or layer classic protection over unknown policy. Disabled/evaluate rulesets,
tag-only policy and branch rulesets proven nonapplicable by the effective endpoint are
left untouched. There are no ruleset creation/update/delete methods in this transport.

Rule and ruleset inventories paginate at 100 records/page, bounded at 1000 pages.
No provider-supplied pagination destination is followed. Unknown response shapes,
partial GraphQL errors, rate limits, SSO/OAuth restrictions or forbidden reads remain
typed Needs attention; credentials and provider bodies never enter results.

Creation is a non-idempotent GraphQL POST and uses the existing awaited journal
abstraction. Before sending, record an unresolved key bound to immutable organization
and repository IDs plus the literal branch. Production composition must commit this
durably, retain it across service/account changes and serialize writers. A successful
HTTP acknowledgment or a lost response is followed by complete remote rereads. Exactly
one compatible exact rule must be effective and satisfy admin/force/deletion checks;
an acknowledged created ID must match. Otherwise the unresolved key remains and another
automatic create is forbidden. Observed safe protection resolves uncertainty. There
is no alternate team/journal/credential fallback and no blind adapter retry.

Updates are separate idempotent partial mutations by immutable rule ID; they use no
creation journal. Before either mutation the reconciler refreshes repository, branch,
effective rule and compatibility, including a full refresh after asynchronous journal
work. Default-based targets must still identify the original freshly selected default;
a change produces `default_branch_changed` and requires a later explicit run. Explicit
submission branches are unaffected by a default rename. Missing/changed branch refs
or rule identities block mutation. GitHub supplies no atomic conditional write across
repository default, ref and protection configuration; post-mutation rereads must also
validate them and surface concurrent external changes rather than fabricate success.

After create/update, reread effective GraphQL and REST policy and rulesets. An unobserved
or ambiguous result is Needs attention; a lost update response recovers only from the
same observed immutable rule ID and desired policy. Correct reruns produce no writes.
The course target and each student/group target return independent structured outcomes:
repository ID/kind, student term/section/assignment/target when applicable, branch name,
`default`/`explicit` source, desired/observed protection, safe status/reason/conditions,
and immutable rule ID when known. Statuses are `up_to_date`, `reconciled`, `needs_attention`;
there is no intrinsic faculty Pending state for branch protection.

No retired branch, manual rule or ruleset cleanup occurs. There is no branch creation,
deletion, collaborator mutation, invitation, membership or repository permission
reconciliation. The trusted outer production caller must bind source revision,
`AuthorizationResolver`, session/course/org identity, complete v2 state and trusted
7.5 target evidence, retain durable journals and enforce shared serialization before
enabling these paths. Persisted metadata and current v1 behavior remain unchanged.

**Phase 7 and Slices 8.1–8.6 are complete. Phase 8 is complete. Next: Phase 9 / Slice 9.1 — Migration Analyzer.**

---

## 12. Course Creation

Creating a course through Graider:

1. authenticates the faculty member;
2. selects an existing GitHub organization;
3. validates required organization permissions;
4. creates a private course/admin repository;
5. initializes course metadata;
6. records the creating faculty identity;
7. establishes that person as fallback administrator;
8. creates the initial Draft term;
9. establishes initial coordinator information;
10. configures Graider-managed teams and branch protections;
11. adds the `graider-course` topic;
12. begins managed synchronization.

Course/admin repositories are always private.

---

## 13. Assignment Lifecycle

Assignments remain term-scoped.

Their lifecycle is:

**Draft → Active → Archived**

### Draft

- visible to relevant faculty;
- collaboratively editable by faculty active in the term;
- cannot be Applied;
- may be deleted by an assignment owner.

### Active

- available to all sections in the term by default;
- each section independently decides whether to use it;
- cannot be deleted;
- may be archived by an owner or term coordinator.

### Archived

- hidden from normal assignment lists;
- remains available under **Show archived**;
- existing grading/regrading/report publication remains available;
- no new Apply/provisioning is permitted;
- may be unarchived by an owner/coordinator if needed.

---

## 14. Assignment Ownership

Assignment ownership is distinct from course creation and coordination.

The faculty member who creates an assignment becomes its initial assignment owner.

Assignments may have multiple owners.

Existing owners may add/remove co-owners.

Term coordinators may repair/change ownership.

At least one effective owner is required for normal assignment lifecycle management.

Ordinary active-term faculty may collaboratively edit shared assignment content without automatically becoming owners.

Assignment-owner privileges include:

- activating a Draft assignment;
- managing owner membership;
- archiving the assignment;
- deleting it while Draft;
- adopting a newer template revision.

A term coordinator may override those operations.

---

## 15. Shared Assignment Definition vs Section State

The academic assignment definition is shared across the term.

Shared fields include:

- title;
- points;
- rubric;
- required files;
- grading configuration;
- template repository;
- pinned template revision;
- file-management rules;
- assignment type/group configuration;
- other assignment-wide grading/content settings.

Section-specific state includes:

- whether the section is using the assignment;
- due date/time;
- late policy;
- Apply/provisioning status;
- applied assignment revision;
- update-review status;
- template distribution state.

A useful physical layout is:

```text
terms/<term>/assignments/<slug>/assignment.yml
terms/<term>/assignments/<slug>/sections/<section-id>.yml
```

The exact schema may evolve, but shared and section-specific state should remain separately addressable to reduce merge conflicts and preserve authorization boundaries.

---

## 16. Section Assignment States

An Active assignment is initially available to every section.

A section may be:

- available/not yet applied;
- Not using;
- Applied/current;
- Update available;
- Reviewed/keep current revision;
- Partially updated;
- Apply incomplete/Needs attention.

A section may mark an assignment **Not using** only before student repositories have been provisioned.

Once repositories exist, the applied history is permanent.

Section faculty may change due date and late policy without re-applying the assignment.

Those changes:

- take effect immediately;
- do not change the applied assignment revision;
- do not modify student repositories.

---

## 17. Assignment Revisions

Changes to the shared assignment definition produce a new assignment revision.

Sections that have already Applied an older revision are not changed automatically.

They are marked **Update available**.

The section faculty may:

- review and adopt the change;
- remain intentionally on the existing applied revision;
- revisit the change later.

Acknowledging **Keep current applied revision** dismisses that specific update but does not suppress notifications for later revisions.

A shared-assignment save that will make sections out of date must explicitly warn the editor before committing.

Some revision changes may require student-repository updates; others may only require section acknowledgment of the new grading/configuration revision.

---

## 18. Section-Specific Deadlines and Lateness

Due dates and late policies are section-specific.

The late policy is informational.

Graider applies no automatic late deduction.

Normal submission selection uses the latest commit on the configured submission branch.

The submission is marked **Late** when the relevant commit timestamp is later than the section deadline.

Graider should show:

- Late/On time;
- commit timestamp;
- amount late where useful.

Faculty may explicitly choose an earlier commit as the submission to grade.

When that happens, lateness is evaluated against the selected commit.

---

## 19. Templates

Faculty prepare template repositories separately before using them in Graider.

Graider does not create template repositories as part of assignment creation.

Normal templates live in the course organization.

External templates are allowed explicitly and remain externally permission-managed.

Course-owned template permissions are managed by Graider:

- active-term faculty: `write`;
- current coordinators: `admin`;
- appropriate historical faculty: `read` where applicable.

Faculty normally access templates through GitHub. Graider does not automatically clone them locally.

---

## 20. Template Revision Pinning and Notifications

An assignment pins a specific template commit.

It does not silently follow the template branch.

Graider periodically detects newer commits on the configured template branch and surfaces **Template update available**.

Notifications are shown to:

- assignment owners;
- faculty whose sections use or have Applied the assignment.

Sections that explicitly marked the assignment Not using do not need the notification.

Only:

- assignment owners; or
- term coordinators

may update the assignment's pinned template revision.

Before adopting a newer revision, Graider shows:

- old/new commit hashes;
- changed files;
- GitHub comparison link;
- affected already-applied sections;
- warning that this changes the shared assignment definition.

No student repository changes occur merely because the pinned revision changes.

---

## 21. Template File-Management Rules

The shared assignment definition classifies template paths for later updates.

Supported conceptual classifications:

- **Instructor-managed**
- **Student-editable**
- **Unclassified**

Rules use ordered glob patterns with explicit precedence.

Unmatched files default to Student-editable/safe behavior.

Classification affects later updates only.

Initial Apply always provisions the complete pinned template.

During later selective updates:

- changed Instructor-managed files are selected by default;
- changed Student-editable files are not selected by default;
- unclassified files are not selected by default;
- a file detected as student-modified is never selected automatically.

Faculty may override an individual file/repository explicitly, with a strong warning and audit record.

---

## 22. Selective Template Updates

When a section chooses to adopt template corrections after repositories already exist, Graider performs a conflict-aware reviewed update.

Graider compares:

- the template revision previously distributed;
- the newer pinned template revision;
- the student repository's current state.

Faculty can select only some changed files.

Student work is never blindly overwritten.

The update preview identifies files as:

- safely applicable;
- student modified;
- conflict/needs attention;
- intentionally skipped.

Selected corrections are committed directly to student repositories as Graider-generated instructor update commits.

Pull requests are not required.

Per-repository results record:

- updated;
- unchanged;
- partially updated;
- needs attention.

If only part of a revision is distributed, the section remains **Partially updated** and Graider records the actual file-level distribution state.

Future comparisons use the actual distributed state rather than pretending the entire earlier template revision was applied.

---

## 23. Student Repository Provisioning and Permissions

Each faculty member is responsible for Applying assignments to their own sections.

Term coordinators may Apply across sections only after explicitly broadening scope.

Student repositories inherit section authorization:

- section faculty team: admin;
- term coordinator team: admin;
- former section faculty: read;
- former coordinators: read where applicable;
- student: individual collaborator on their own repository.

Students are excluded from new provisioning after being marked dropped/inactive.

Existing repositories and grading history remain.

Student repository access is removed when a student drops, while faculty access remains.

---

## 24. Student Repository Local Storage

Student repositories are never bulk-cloned merely because Graider is installed.

Each course/account/machine stores a faculty-selected default student-repository root.

Conceptual layout:

```text
<faculty-selected-root>/
  <term>/
    <assignment>/
      <repositories>
```

Faculty may register verified existing clones located elsewhere.

Graider remembers the actual local location per repository.

### Download workflow

When repositories are missing locally, Graider shows availability such as:

`18 of 24 repositories available locally`

Faculty explicitly chooses:

- Download missing repositories; or
- selected repositories/students.

Graider does not silently download large amounts of student data.

### Updating existing clones

Before repository-dependent work:

- clean local repository → fetch/pull automatically;
- dirty repository → do not modify; show Local changes detected;
- divergent/conflicting repository → show Needs attention.

Graider never automatically resets or discards faculty local changes.

### Storage management

Graider provides per-course storage management showing:

- local repository root;
- present repositories;
- disk usage;
- assignments represented locally.

**Remove local copy** affects only local storage.

Dirty repositories block normal removal.

A stronger **Discard local changes and remove** action requires explicit confirmation.

Changing the default repository root affects future downloads immediately and may optionally migrate existing clean repositories.

Dirty repositories remain where they are until resolved.

---

## 25. Submission Branch and Repository Protection

The default branch is the normal submission branch unless the assignment explicitly overrides it.

Graider applies lightweight protection to student submission branches:

- normal student pushes remain allowed;
- force pushes are blocked;
- deletion of the submission branch is blocked;
- faculty/admin recovery remains possible.

The course/admin canonical branch similarly blocks:

- force pushes;
- branch deletion;

while continuing to permit Graider's direct commits without a pull-request requirement.

Slice 7.6 implements this backend policy with exact GraphQL partial updates and
administrator enforcement, preserving ordinary pushes even for current student admin
collaborators. Recovery requires an explicit authorized protection change; no force-push
bypass is maintained. Existing incompatible manual policy and unassessed applicable
rulesets remain Needs attention and are never weakened. The current assignment schema
has no persisted submission-branch override; an explicit trusted runtime target can
provide one, otherwise GitHub's freshly observed default is used. See
[the complete managed branch contract](#1110-managed-branch-policy-contract-slice-76)
for default-branch race checks, rule precedence, durable creation journaling and continued
production gates. No production v1 branch protection is activated by this slice.

---

## 26. Grading State

Durable grading state lives in the private course/admin repository.

Canonical identity is:

**term + assignment + section + student**

For group assignments:

**term + assignment + section + group**

Recommended layout:

```text
terms/<term>/grading/<assignment>/sections/<section>/<student>.json
```

and for groups:

```text
terms/<term>/grading/<assignment>/sections/<section>/groups/<group>.json
```

The record remains self-describing and includes the identifiers represented by its path.

Student repositories do not contain unpublished grading decisions.

The final student HTML report remains derived output.

---

## 27. Grading Autosave and Cross-Machine Continuity

Every successful meaningful grading mutation becomes remotely durable.

Examples:

- comment added/edited/deleted;
- adjustment changed;
- source anchor changed;
- grading status changed;
- student marked Complete;
- submission commit selection changed.

Graider should not push on every keystroke in an unfinished editor.

Unsaved editor text may remain a machine-local draft until the user performs the meaningful save action.

A faculty member can therefore:

1. grade students at the office;
2. close Graider;
3. open Graider at home;
4. synchronize;
5. continue from the same durable grading state.

---

## 28. Grading Audit History

Meaningful grading mutations maintain append-only history containing at least:

- actor;
- timestamp;
- mutation type;
- relevant before/after information.

This supports:

- co-faculty collaboration;
- conflict diagnosis;
- publication history;
- accountability.

Git history remains available underneath but is not the faculty-facing audit interface.

---

## 29. Grading Claims and Concurrency

Multiple faculty in the same section share the same grading pool.

Graider should discourage simultaneous editing of the same student.

### Claim behavior

Opening a student for active grading obtains a short-lived grading claim.

Other faculty:

- may see the student;
- see who currently holds the claim;
- are prevented from ordinary editing.

The claim is renewable while actively in use.

Leaving the student releases it immediately.

An abandoned claim becomes stale after approximately 20 minutes.

A stale claim can be taken over without coordinator intervention.

The same faculty member may transfer their own claim to another machine immediately, with a warning that the previous device/session loses mutation authority.

### Serverless implementation

Claims are ephemeral coordination state and must not create ordinary course-history commits for lease renewals.

Graider should use a GitHub-backed advisory-claim mechanism.

Claims are not treated as a perfect distributed mutex.

Every grading mutation also uses optimistic concurrency/version checks.

If two clients race despite the claim, Graider refuses to overwrite competing grading state and requires reconciliation.

---

## 30. Submission Commit Selection During Grading

Before grading begins, Graider uses the latest submission-branch state.

When grading state is first created, the grading record becomes pinned to that commit.

If the student later pushes a newer commit:

- Graider does not switch automatically;
- it shows **Newer submission available**;
- faculty explicitly decides whether to switch.

Faculty may also explicitly select an older commit.

A manual commit selection remains pinned until **Use latest submission** is explicitly chosen.

### Changing commits

When moving grading to another commit:

- general comments and rubric/manual adjustments remain;
- source-anchored comments are revalidated;
- anchors whose code changed/disappeared are marked for review.

If grading had been Complete or Published:

- status returns to In progress;
- the previous publication remains in audit history;
- the previously published report is considered out of date;
- faculty completes and republishes explicitly.

---

## 31. Publication

The student repository contains only the current/latest published report at the canonical report path.

The course/admin repository retains publication history including:

- submission commit;
- grading revision;
- faculty actor;
- timestamp;
- score/status.

Republishing replaces the current student-facing report without discarding the historical audit trail.

---

## 32. Group Assignments

Groups remain entirely within one section.

Cross-section groups are prohibited.

A group repository belongs to that section for authorization purposes.

Group grading uses one canonical group grading record.

Per-student adjustments may be layered onto that group result when necessary.

If a student transfers sections after a group repository exists:

- do not move the entire group;
- retain original group/repository history;
- prevent an implicit cross-section group;
- destination faculty explicitly determine the student's new assignment arrangement.

---

## 33. Section Transfers

When an individual student transfers sections:

- existing repositories retain their repository IDs and names;
- repository history is not reset;
- grading state moves to the destination section path;
- grading provenance records the original section;
- old/new faculty-team repository permissions are reconciled;
- the student's access remains attached to the same repositories.

If the destination section does not use a particular assignment, the existing repository remains historical and is excluded from normal destination-section workflows unless faculty explicitly adopts it.

---

## 34. Shared Reusable Comment Library

Reusable comments remain a course-level shared resource.

Current/latest-term faculty may:

- create comments;
- use comments;
- edit/delete comments they own.

Term coordinators may manage any shared comment.

Historical-only faculty may use existing comments when reviewing historical grading but may not modify the current shared library.

Comment ownership and mutation history are persisted.

---

## 35. Assignment History

Shared assignments maintain faculty-facing change history.

Meaningful events include:

- points/rubric changes;
- required-file changes;
- template revision changes;
- grading workflow changes;
- owner changes;
- section availability/lifecycle changes;
- archive/unarchive actions.

Faculty should not need to inspect raw Git history to understand why an assignment changed.

---

## 36. Course Synchronization

Synchronization occurs:

- after authentication/startup;
- periodically while Graider is open;
- immediately before course mutations;
- after successful mutations;
- when required to resolve a deep link or newly granted course access.

### Clean fast-forward cases

Graider synchronizes automatically.

### Local manual changes

Advanced users may inspect or manually modify the managed repository.

Graider must never overwrite an unexpectedly dirty managed repository.

Instead it:

- detects local external edits;
- validates them;
- allows review/publish when safe;
- surfaces invalid/conflicting state as **Needs attention**.

Manual editing is supported for advanced users but is not part of the expected faculty workflow.

### True conflicts

Domain-aware resolution is preferred.

Examples should refer to concepts such as:

- roster changed by both parties;
- assignment changed remotely while locally edited;
- section deadline changed concurrently.

Graider should avoid exposing raw Git conflict mechanics when it understands the domain.

When it cannot safely interpret a conflict:

- preserve both sides;
- block the affected mutation;
- require explicit recovery.

---

## 37. Mutation Semantics

For mutations confined to the course/admin repository:

1. synchronize;
2. validate the current authoritative version;
3. apply the intended change;
4. validate resulting state;
5. commit with faculty attribution;
6. push;
7. report success only after the remote push succeeds.

If the push fails:

- the operation is not successful;
- the app-managed local clone returns to the last known authoritative remote state;
- the intended change may be preserved temporarily for retry/review but must not remain as ambiguous unpublished state.

### Multi-system mutations

Operations spanning GitHub organization/team/repository configuration cannot be truly atomic.

These use desired-state reconciliation.

Example: adding faculty.

The course repository first records the intended valid assignment.

Graider then reconciles:

- organization membership;
- pending invitation;
- team membership;
- repository permissions.

Incomplete external reconciliation becomes **Pending / Needs attention** and is retried during later synchronization.

---

## 38. Stable Deep Links

Graider supports stable links independent of filesystem location.

Conceptually:

```text
graider://course/<repository-id>/term/<term-code>/assignment/<slug>
```

Opening a link:

1. identifies the course by immutable repository ID;
2. verifies current GitHub identity;
3. discovers/synchronizes the course if needed;
4. verifies authorization;
5. opens the requested resource.

Unauthorized users receive a clean access error.

Deep links do not encode local paths.

---

## 39. Manual and Automatic Course Discovery Changes

If faculty are added to a course while Graider is already running elsewhere:

- they accept the GitHub organization invitation;
- periodic discovery detects the newly authorized course;
- the course/admin repository is automatically cloned/synchronized;
- the course appears without manual folder registration.

If faculty authorization is reduced, Graider adjusts the visible/mutable scope according to persisted historical roles rather than simply deleting the course.

---

## 40. Organization Rename vs Migration

### Organization/repository rename

If the same course/admin repository ID appears under a renamed repository or renamed organization:

- Graider follows it automatically;
- local remotes update;
- deep links continue to work;
- course identity does not change.

### Transfer to a different organization

A course organization transfer is an explicit migration.

A manually transferred admin repository places the course into:

**Migration required**

Normal course mutations are blocked until reconciliation.

---

## 41. Course Organization Migration

An authorized migration workflow covers:

- course/admin repository;
- retained student repositories;
- course-owned template repositories;
- managed course teams;
- term coordinator teams;
- section teams;
- permissions;
- manifest/repository references;
- other organization-specific metadata.

The migration is previewed before execution.

Because it is not atomic, migration is checkpointed.

On failure:

- completed verified work is retained;
- the course enters **Migration incomplete**;
- normal mutations are blocked;
- migration may resume from verified progress.

Persistent failures support manual GitHub migration.

Graider then provides **Reconcile migration**, which:

- scans source/destination;
- matches repositories by immutable IDs where possible;
- verifies teams/memberships/permissions;
- identifies missing/inconsistent resources;
- updates Graider metadata only after destination validation succeeds.

---

## 42. Manual Deletion of Archived Terms

Advanced users may intentionally remove old archived term data directly from GitHub.

Graider treats remote deletion as authoritative.

It does not recreate deleted term data merely because an earlier local cache contained it.

Associated student repositories are never automatically deleted.

Term-specific teams become orphaned candidates for an explicit:

**Clean up retired term GitHub resources**

operation.

---

## 43. Schema Migration

Existing schema-v1 courses must be upgraded through a controlled migration.

Migration must:

- synchronize first;
- create a recoverable pre-migration checkpoint;
- derive only information that can be inferred safely;
- require confirmation for ambiguous information;
- validate the complete new model before publishing it.

### Required migration behavior

Faculty identities:

- match obvious identities where reliable;
- never guess ambiguous identities;
- require coordinator confirmation as needed.

Fallback administrator:

- explicitly selected during migration.

Assignment owners:

- existing single `faculty_owner` becomes a one-entry owner list;
- ownerless assignments remain ownerless until a coordinator assigns an owner;
- they cannot be edited/copied operationally until repaired.

Deadline:

- existing shared due date/late policy is copied to every section associated with that assignment.

Apply state:

- derive from existing manifest section records;
- partial manifests become partial/Needs attention rather than falsely complete;
- existing repository mappings/history remain intact.

Grader configuration:

- Phase 9.4 removes persisted legacy `grader_team` / `grader_permission` fields;
- Slice 6.6 already removed grader-specific authorization and active behavior;
- anyone requiring grading access is assigned as section faculty.

Term coordinators:

- migration requires explicit coordinator assignment where the old schema contains no reliable coordinator information.

No migration may silently invent a security-relevant role.

---

## 44. Version Compatibility

Course schema compatibility is strict.

If a synchronized course uses a schema newer than the installed Graider supports:

- the course cannot be opened for normal use;
- the older client does not attempt partial compatibility;
- the user must update Graider.

Graider never automatically downgrades course schemas.

---

## 45. Application Distribution

Initial production platforms:

- macOS Apple Silicon;
- Windows x64.

Linux x64 is deferred.

### macOS

Production release:

- signed;
- notarized;
- distributed as a normal DMG/installable application.

### Windows

Production release:

- signed;
- normal x64 installer;
- not merely a portable executable.

Faculty must not need security-warning workarounds as part of normal installation.

The packaged application must not require:

- system GitHub CLI;
- system Git;
- terminal configuration.

Graider must use an embedded/bundled Git implementation behind its own repository abstraction.

---

## 46. Releases and Auto-Update

GitHub Releases is the authoritative distribution and historical archive.

Each release contains signed platform installers and update metadata.

Channels:

- **Stable** — default faculty channel.
- **Preview/Beta** — explicit opt-in.

Routine compatible updates:

- download in the background;
- install on restart;
- expose release notes.

A schema-required or security-critical update may block course use until installed.

Switching from Preview back to Stable is allowed only when a compatible Stable version can open the schemas already present.

Graider never silently downgrades itself.

Older installers remain available through GitHub release history.

---

## 47. Diagnostics, Privacy, and Telemetry

Graider collects no product usage analytics.

There is no behavioral telemetry about:

- courses;
- assignments;
- students;
- features used;
- grading activity.

### Crash reporting

Automatic crash/error reporting may be enabled only through explicit faculty opt-in.

Crash reports exclude unnecessary course/student/grading content and credentials.

### Support bundle

Graider provides **Export diagnostics** containing appropriate technical information such as:

- Graider version;
- OS/architecture;
- update channel;
- synchronization status;
- recent application errors/logs;
- schema identifiers;
- GitHub API error codes;
- clean/dirty/conflicted repository summaries.

It must not include:

- OAuth tokens;
- secrets;
- student source code;
- grading comments;
- unnecessary student information.

---

## 48. Local Git Engine and Remote Host Boundaries

Graider must not require system Git.

Local repository operations should be behind a narrow `GitWorkspace` abstraction covering operations such as:

- clone;
- fetch;
- fast-forward/update;
- status;
- commit;
- push;
- diff;
- revision lookup.

GitHub-specific remote behavior should remain behind a separate host/API boundary covering:

- authentication;
- repository discovery;
- teams;
- organization membership;
- permissions;
- branch protection;
- Actions;
- releases;
- repository metadata.

This separation is useful even though GitLab implementation is out of scope because it prevents local Git behavior and GitHub API behavior from becoming inseparable.

---

## 49. Future GitLab Compatibility

GitLab support is not part of this project.

However, new architecture should avoid unnecessarily hard-coding GitHub-specific behavior into domain models where a small provider boundary is natural.

No effort should be spent building unused generic framework layers.

The immediate implementation remains GitHub-first.

---

## 50. Canvas Integration Boundary

Canvas integration is explicitly deferred.

This architecture should merely provide clean future integration points for:

- course mapping;
- term/section mapping;
- student identities;
- roster synchronization;
- assignment mapping;
- section deadlines;
- grades/publication.

Canvas API behavior, authentication, synchronization, and UI are not part of this effort.

---

## 51. Required System Invariants

The implementation must maintain these invariants:

1. Exactly one GitHub identity is active in Graider at a time.
2. A course is identified canonically by immutable remote repository ID.
3. At most one term may be Active in a valid snapshot; workflows requiring exactly one check explicitly.
4. A Draft term may not perform student-facing operations.
5. Course/admin GitHub state is authoritative.
6. A course mutation is not successful until the remote push succeeds.
7. Ordinary faculty cannot operate on other sections' student data.
8. Coordinators do not implicitly operate course-wide; broadened scope is explicit.
9. Historical faculty access is never inferred solely from current membership.
10. Shared assignment edits never silently mutate other sections' student repositories.
11. Student repositories are never cloned automatically merely because a course exists locally.
12. Dirty student repositories are never overwritten/reset automatically.
13. Student work is never silently overwritten during template propagation.
14. Grading state is durable in the private course/admin repository.
15. Student reports are derived output.
16. Once grading begins, its submission commit does not silently move.
17. Permanent grading mutations are audited.
18. Ephemeral grading claims do not pollute ordinary course history.
19. Repository/team permission reconciliation never modifies unrelated GitHub teams.
20. Graider does not routinely delete course, term, or student repositories.
21. Unsupported/newer course schemas require a Graider upgrade rather than partial operation.
22. No normal faculty workflow requires Terminal, Git, GitHub CLI, or PAT configuration.

---

## 52. Major Acceptance Scenarios

### New computer

1. Install Graider.
2. Sign in with GitHub.
3. Graider discovers all authorized current/historical courses.
4. Course/admin repositories synchronize automatically.
5. Archived courses remain hidden by default.
6. Student repositories are not downloaded.
7. Faculty can immediately continue course administration/grading after explicitly downloading any needed student repositories.

### Shared course

1. Two faculty teach different sections.
2. Both see the shared assignment.
3. Each sees only their own section's operational state.
4. Each sets their own deadline.
5. Each Applies independently.
6. One edits the shared assignment.
7. The other section receives Update available.
8. Nothing changes in the other section's repositories until its faculty acts.

### Cross-machine grading

1. Faculty grades several students at work.
2. Meaningful grading changes autosave remotely.
3. Faculty opens Graider at home.
4. State synchronizes.
5. Grading resumes with comments/deductions/status intact.
6. The same faculty may take over their own grading claim from the other machine.

### Concurrent grading

1. Faculty A opens a student and receives the grading claim.
2. Faculty B sees the claim and cannot normally edit.
3. If A disappears, the lease expires.
4. B takes over.
5. Optimistic concurrency remains the final protection against races.

### Historical access

1. Faculty teaches Section 111 in an old term.
2. The term is archived.
3. Faculty remains able to grade/regrade their historical section.
4. Faculty does not see unrelated historical sections.
5. Faculty does not automatically gain access to future terms.

### Faculty removed mid-term

1. Faculty is removed from Section 111.
2. Mutation rights end.
3. Historical section access remains read-only.
4. GitHub student-repository permissions are downgraded accordingly.

### Template correction

1. Template receives newer commits.
2. Owners/using faculty see Template update available.
3. Owner previews and pins the newer revision.
4. Applied sections become Update available.
5. Section faculty review changed files.
6. Safe instructor-managed corrections are preselected.
7. Student-modified files are protected.
8. Faculty selectively distributes approved corrections.
9. Partially distributed revisions remain visibly partial.

### Migration

1. Existing schema-v1 course is discovered.
2. Graider synchronizes and checkpoints it.
3. Safe values are migrated automatically.
4. Faculty identities/coordinators/fallback administrator are confirmed where required.
5. Existing deadlines/manifests become section-specific state.
6. Legacy grader configuration is removed.
7. The migrated repository is validated and pushed.
8. Older Graider clients refuse to operate on it until upgraded.

---

## 53. Explicit Non-Goals for This Architecture Effort

Do not include:

- Canvas API implementation;
- Canvas authentication;
- Canvas roster synchronization;
- Canvas assignment synchronization;
- Canvas grade submission;
- GitLab implementation;
- broad visual redesign;
- hosted Graider backend;
- usage analytics;
- automatic student-repository download;
- normal permanent course deletion;
- generic Git conflict-editor UI.

Those belong to later efforts or remain intentionally unsupported.

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

The legacy-source update portion is now implemented in Slice 2.8 below. The next boundary is
managed-course mutation semantics and cutover. This slice adds no automatic legacy update, managed
mutation cutover, OAuth write migration, student synchronization, schema-v2 roles, periodic fetch,
automatic reconciliation, migration, or remotely durable grading state.

### Slice 2.7 validation evidence

- Backend: 138 files; 1,508 passed, one skipped.
- UI/Electron: 183 files; 1,764 passed, 25 skipped. OAuth loopback tests require an unrestricted local listener.
- Focused guard/source tests cover exact baseline, pending/staged configuration, unrelated files,
  ahead/behind/divergent histories, publication retry, conflicts, unsafe storage, identity mismatch,
  stale accounts, per-repository serialization, independent courses, creation exception, and all
  inventoried blocked handler boundaries.
- Real bundled-Git fixtures cover remote advance, cache fast-forward with unchanged legacy source,
  publication recovery, publication conflict, and dirty-cache remediation.
- `ui/scripts/smoke-managed-course-guard.cjs` opens the production renderer in an isolated Electron
  profile with fixture identities/local remotes. It verifies stale-source messaging, zero blocked
  target writes/commits/pushes, zero stale dispatch/repair/report student writes, existing cache review,
  cancel, explicit reconciliation without mutation, fresh retry, publication recovery, and sign-out.
  The real csc1120 profile is untouched; this is not a live OAuth/GitHub write test.
- Backend/UI typechecks, lint, formatting, production builds, and diff whitespace checks pass.
  Production builds retain the existing large-chunk advisory.

## Phase 2 / Slice 2.8: safe legacy operational-source synchronization

The managed cache remains the authoritative freshness oracle. The registered legacy folder remains
all existing mutations' destination. **Update course source** is an explicit trusted main-process
operation accepting only a registered folder ID. Renderer paths, URLs, branches, revisions and
commands cannot choose an update target. This action never resumes the blocked mutation.

Eligibility requires a unique authorized discovery/registry mapping, active OAuth identity and
schema-v1 faculty authorization, matching immutable repository and organization IDs, valid metadata,
self-contained Git storage without links/external gitdirs/alternates, attached expected default
branch and expected `origin/<default-branch>` upstream, no interrupted operation, and a completely
clean index/worktree including **no untracked files**. Ignored files retain existing inspection
behavior. Local ahead/diverged history, branch/default-branch changes, authorization loss, organization
transfer, unsafe storage and any uncertain state remain blocked and preserved. This never invokes
Phase 2.6 managed-cache reconciliation on faculty-owned folders.

The existing account/repository mutation queue encloses managed synchronization, source validation,
authenticated fetch, exact-target ancestry checks, fast-forward and final verification. Ordering
remains operation queue -> managed synchronization queue; the managed queue releases before legacy
work. Reconciliation takes only the managed queue. Different course operations remain independent.
Queued operations retain the account generation. Sign-out/account switch also aborts active course
operation signals; bundled Git checks cancellation again immediately before fast-forward.

After managed synchronization supplies its exact validated commit, source ancestry is checked using
managed history, so eligibility does not depend on an already-fetched legacy object. Source identity,
branch/upstream, cleanliness and storage are re-inspected before and after authenticated fetch. The
existing managed repository/metadata/faculty verifier runs again after that network wait. Bundled Git
fetches only remote-tracking refs using the active OAuth token in transient process authentication.
It never honors configurable fetch destination refspecs. `fastForwardToCommit` requires the exact
validated target, expected starting HEAD/branch, a clean source, and ancestry from starting HEAD to
target to fetched default-branch tip. It executes `merge --ff-only --no-edit --no-autostash <exact SHA>`
with hooks and submodule recursion disabled. There is no pull, merge commit, rebase, reset, clean,
stash, checkout, push, branch switch, replacement or automatic repair. A current source still gets
verified/authenticated fetch and final inspection, without rewriting HEAD/worktree.

A remote advance during legacy fetch cannot substitute a newer target. Legacy may fast-forward only
to the exact managed-validated commit, even when origin's fetched tip is newer. Success requires clean
source, expected branch/upstream, and both legacy and managed HEAD equal to that exact commit. If a
concurrent managed synchronization moved the oracle, completion fails closed and faculty refresh/retry;
no rollback or arbitrary advancement occurs. A later update synchronizes managed state afresh.

The Phase 2.7 guard distinguishes proven clean-behind sources as `operational_source_updateable`
and offers **Update course source**. Generic stale/unsafe states retain attention messages without
an update button. The action shows **Updating course source…** and success reports **Course source
updated. Refresh/reopen this view before retrying the change.** Faculty must retry their original
operation, which runs the entire guard again. Unpublished Graider-managed working-tree changes or
local publication commits are ineligible; existing `publication_retry` remains responsible for them.
Remote divergence still blocks publication and update, preserving local evidence without force push.

Assignment and roster pages hold edit values in component state. Dashboard refresh updates shared
route data but does not safely replace those forms. Therefore source update does not refetch only the
dashboard or enable the old form. Before any possible worktree update, all open application documents
are invalidated in main and shown a required **Refresh view** overlay. Main refuses all inventoried
course mutation IPC from these documents, including requests already queued before invalidation.
The document epoch rejects old queued callbacks even after reload. **Refresh view** reloads the whole
document, discarding form values and dashboard cache and triggering normal assignment/roster loaders.
Only a completed reload clears the gate; failed/partial updates also require reload after crossing the
write boundary. Reload during preparation does not clear final invalidation. No mutation is replayed.

Startup and **Refresh courses** continue their existing managed-cache synchronization and dashboard
loading behavior; legacy synchronization is explicit in this slice. These are separate asynchronous
flows, and opportunistic legacy writes would require coordinating discovery, registry, operation
serialization and open editors during background startup. Keeping updates on the explicit operation
boundary avoids background form invalidation and does not block startup. No arbitrary registered
folder is updated. Periodic polling and student-repository synchronization remain excluded.

The remaining transition is a designed managed-course mutation cutover with renderer read-version
and write/publication semantics. Existing write credentials remain transitional; this slice uses OAuth
only for source freshness/fetch and does not migrate existing write transports or introduce schema v2.

Validation includes real local bare remotes and bundled Git for current/no-op, clean behind, dirty,
ahead/diverged, interrupted/unsafe storage, remote advance, exact-target authentication/command tracing,
publication preservation and post-fetch authorization/metadata refusal. Assignment/roster IPC tests
prove stale payloads cannot reach writes, including queued requests. The isolated production-renderer
smoke is `ui/scripts/smoke-managed-course-guard.cjs`; fixture accounts/remotes/profile never touch the
real csc1120 course and perform no live GitHub writes.

### Slice 2.8 validation evidence

- Backend: 138 files, 1,509 passed, one skipped.
- UI/Electron: 184 files, 1,803 passed, 25 skipped, with a permitted local OAuth callback listener.
- Focused synchronization/guard/session/stale-document/UI/security suites: six files, 128 passed.
  The affected Electron, publication, authentication, assignment and roster suites: ten files, 250 passed.
- Bundled-Git/auth focused suites: ten files, 213 passed. Transport tracing proves authenticated fetch and one exact-SHA FF-only merge, with no
  pull/reset/rebase/clean/stash/checkout/push. Real remotes exercise advancement during preparation,
  current no-op, preserved dirty/ahead/diverged histories and publication recovery/conflict.
- The isolated production Electron smoke passes 18 scenarios, including explicit update, exact HEAD
  agreement, no replay, stale-save refusal, full view reload, fresh guard and publication retry.
  Blocked target writes/commits/pushes and student writes are all zero. Screenshots confirm the safe
  stale action and required-refresh overlay. This uses fixture identities/local remotes, not live OAuth
  or the real csc1120 profile.
- Backend/UI typechecks, lint, formatting, production builds and `git diff --check` pass. The production
  renderer retains the existing large-chunk advisory.

## Phase 2 / Slice 2.9: managed-course mutation cutover

Registered courses can explicitly **Use managed course source** from their managed-cache
controls. This is a one-time operational decision, separate from cache bootstrap and
reconciliation. Remote-only courses remain inspection-only.

### Eligibility and persisted source mode

`ManagedCourseMutationGuard.cutover` uses the existing synchronized OAuth operation and
per-user/repository queue. It requires current identity/capabilities, exact repository and
organization IDs, valid synchronized managed storage, and an attached registered legacy
branch with the expected origin/upstream. **All** tracked, staged, untracked, conflicted,
interrupted, unpublished, ahead, or diverged legacy state blocks cutover. Legacy HEAD must
match the authoritative managed SHA. A proven clean-behind copy first requires the 2.8
**Update course source** action. Graider never imports, resets, or discards local work.

The existing account catalog persists `operationalSource: "managed"` and the registered
folder IDs under the immutable repository ID. Catalog parsing whitelists these fields;
synchronization/bootstrap/reconciliation preserve the completed decision. Folder IDs are
compatibility bindings, not a path authority. Discovery resolves persisted registrations
by repository ID, independently of the old folder's files/origin. Removed registrations do
not become remote-only mutation registrations. Signed-out, wrong-account, and lost-access
reads cannot silently fall back to a previously cut-over legacy copy.

### Trusted source routing and read versions

The same guard resolves user/repository IDs, managed path, authoritative SHA, metadata,
OAuth operation credential, abort signal, and session generation in main. Existing IPC
schemas may still carry a registered legacy path, but it must match the registry; main
projects its own managed/transaction path. The main-only async operation context also
covers services that resolve paths by folder ID (notably Comment Library). No token, Git
command, arbitrary managed path, or reusable authorization ticket is exposed to renderer.

All registered course identity requests through `courseMutationIpc` use this source after
cutover: assignment setup/edit/delete/group configuration, roster/section administration,
Access Pages settings, Comment Library, grading workspace/configuration, Apply and grading
previews/dispatch, workflow repair, report publication, Access Page generation/publication,
template workflow/distribution, downloads, and dashboard configuration reads. Uncut
courses keep their existing legacy behavior and publication recovery path.

Existing generated-output path constructors route Apply/template manifests, generated
reports, and per-student grading state into an account/repository `runtime` directory
beside the managed Git source. Main registers this mapping for its bundled domain backends
and supplies the same source/runtime pair to CLI subprocesses. Configuration and the shared
Comment Library remain in the authoritative course repository. Existing generated artifacts
in the managed source seed local runtime state once; subsequent local operation history is
preserved without dirtying the cache or staging it for course publication. Legacy artifacts
are not imported. This is local output routing, not another synchronization protocol.

Managed loads return `courseReadRevision`, the exact commit held under the repository
lease. Editable forms retain it and send `expectedCourseRevision` through previews and
saves. Main synchronizes again before comparing; a missing/mismatched revision produces
`remote_version_conflict` **before cloning, domain writes, staging, or publication**.
Course setup takes its initial read revision from its reviewed preview. Revisions assert
an expected version; current main-process authorization remains independently mandatory.
Fresh dispatches use current synchronized state, and Apply/template plans retain their
existing rebuild/revalidation behavior.

### Course-admin publication transaction

`managedCourseTransaction` uses the existing bundled Git factory and authenticated host
context. Under the existing user/repository lease, it clones into a main-owned account
`.transactions/course-*/repo` directory and verifies the checked-out default-branch HEAD
is **exactly** the synchronized expected base. A remote advance during cloning aborts;
there is no automatic checkout/rebase/merge of stale editable data.

Existing domain mutation services run on that isolated repository. Course/term/assignment,
roster, and Comment Library validators run before staging. Storage inspection rejects links,
external object storage, and interrupted Git state. The existing Graider-managed path
allowlist is intersected with an operation-specific path scope; unrelated staged/untracked
files, rename sources, unsafe paths, and unexpected domain files reject publication. A
transaction file snapshot includes ignored output, so ignored configuration cannot be
silently reported as published.
Only those explicit paths are staged. Commit attribution comes from the trusted OAuth
identity, without relying on a configured external Git author. Post-edit validation checks
metadata validity, not continued faculty membership: an authorized faculty edit may
intentionally change its own section assignment.

The transaction revalidates immutable repository/organization identity and remote authorization
before publication. It performs an authenticated fetch immediately before publication and requires
`origin/<defaultBranch>` still equal the expected base. The existing Git `pushBranch` uses
an explicit `HEAD:refs/heads/<defaultBranch>` refspec with no force flag. The active managed
cache is never the local editing/committing workspace. A successful push is followed by
normal synchronization and final managed validation. Derived roster Access Pages refresh
runs only after confirmed course publication and successful cache activation.

### Authentication boundary

Only managed **course-admin repository** publication changes write credentials in this
slice: assignment create/edit/delete/group settings; roster/section changes; existing-course
setup/configuration; Access Pages configuration in `course.yml`; and shared Comment Library
changes. These commits/pushes use the OAuth credential held by the main managed operation.
They bypass the legacy manual/CLI-token course publisher. Student/template/workflow/report
and Access Pages repository write transports retain their existing authentication. Their
course configuration source changes to the managed cache.

### Failure, races, and views

Before confirmed push success, failed validation/domain operations cannot publish, and the
active cache has no transaction changes or ahead commits. Push rejection never triggers a
force push, transaction merge/rebase, or mutation retry. Main fetches the remote outcome, synchronizes
the clean cache to the winning authoritative commit, invalidates sibling views, and returns
a typed stale/publication failure. If a transport error follows server acceptance, main
checks whether the remote contains the transaction commit before reporting failure.
Unverifiable outcomes are recorded as `outcome_unknown` and require attention, not a blind
retry.

After push success, the remote commit remains authoritative even if local activation fails.
The catalog records `lastPublication` with its commit and `published`/`refresh_required`
status. Results distinguish remote success with `publication.refreshRequired`, and the UI
shows **Published remotely. Local course refresh needs attention**. Normal subsequent
synchronization can recover the cache without publishing again. No rollback of the remote
commit is attempted. Post-publication activation validates shape/identity without requiring
faculty membership after an intentional faculty-assignment edit.

The 2.8 document mechanism invalidates other open views that loaded the previous revision;
main rejects stale requests even if renderer UI is unchanged. Originating forms update from
the successful result or refetch their data. Remote-version conflicts preserve the current
form in memory and offer explicit refresh; generic merge/conflict editing remains deferred.
Account switch/sign-out aborts stale/queued operations, and the shared managed repository
lease spans synchronization, expected-version checks, transaction, push, and activation.

### Legacy compatibility and next boundary

The old folder is an external/IDE working copy after cutover. Its HEAD, cleanliness, and
availability no longer choose the operational source. Managed mutations do not mirror into
it. **Update course source** remains an explicit, safety-checked fast-forward operation;
Graider never repairs/reset/cleans it. **Publish Course Changes** reports no pending managed
changes and cannot publish that legacy folder after cutover; uncut courses retain the
existing recovery action.

Next: enable remote-only navigation/mutation controls using these managed semantics, then
address schema v2 and domain-specific stale-edit resolution separately. This slice adds no
polling, student clone manager/synchronization, organization migration, automatic legacy
mirroring, generic Git editor, or broad write-credential migration.

### Slice 2.9 validation evidence

- Full backend: 139 files; 1,514 passed, one skipped.
- Full UI/Electron: 185 files; 1,870 passed, 25 skipped. OAuth callback tests ran
  with permission for their isolated loopback listener.
- Bundled-Git/auth focused coverage: ten files, 213 passed. The managed operational
  integration suite adds 63 cases covering cutover, path routing, expected versions,
  real local-remote publication/races, validation/staging refusal (including ignored
  output), account changes, remote acceptance after transport errors, refresh recovery,
  and real grading-state writes outside the clean managed source.
- `ui/scripts/smoke-managed-course-transactions.cjs` passes 14 isolated production-renderer
  scenarios: atomic publication, preserved stale form, sibling invalidation, losing push,
  post-push refresh attention/recovery, local grading state, no legacy publication, and
  explicit optional legacy refresh. Three transaction push attempts include one rejected
  race; legacy publication calls are zero and the final managed cache is clean.
- The existing `ui/scripts/smoke-managed-course-guard.cjs` also passes all 18 legacy/source
  compatibility scenarios, with zero blocked target writes/commits/pushes or student writes.
  Both smokes use disposable profiles and local bare remotes, never real course write fixtures.
- Backend/UI typechecks, lint, formatting, root/UI/bundled-CLI production builds, and
  `git diff --check` pass. The production renderer retains its existing large-chunk advisory.

## Phase 2 / Slice 2.10: remote-only managed operation

The trusted main-process guard accepts an account/repository selector in the existing
`courseFolderId` compatibility field. Its corresponding public source value is the same
opaque selector, never a cache path. Discovery must resolve that selector under the active
GitHub user ID and immutable repository ID; supplied filesystem paths are rejected. These
selectors are transient dashboard inputs and are never written to the course registry.

Three operational source states coexist:

1. Registered, uncut courses retain their legacy operational source.
2. Registered courses with persisted managed cutover retain the 2.9 managed source.
3. Authorized managed-only courses use the managed source implicitly, without cutover.

Managed-only dashboard entries feed the normal course/term routing and loaders. Registration
changes replace dashboard results rather than retaining duplicate cards. Repository renames
preserve selector identity. Account changes clear the dashboard projection. Local-folder controls
exclude managed-only selectors; cache remediation remains in the existing remote-course controls.

Reads, exact read revisions, transactional course-admin publication, target-specific operations,
account/repository runtime storage, and stale-view invalidation reuse the 2.9 operation context
and guard. Every operation synchronizes and authorizes in main. Cache review never replays a
mutation. Managed-only courses have no legacy source-update or cutover operation.

The next boundary remains schema v2 and domain-specific stale-edit resolution; student download
management, polling GitHub, organization migration, and broader write-credential migration remain
out of scope.

### Slice 2.10 validation evidence

- Full backend: 139 files, 1,514 passed, one skipped.
- Git/auth focused suites: 11 files, 231 passed.
- Focused operational identity/dashboard/UI suites: three files, 103 passed.
- Expanded production Electron transaction smoke: 17 scenarios passed, including
  managed-only loading, OAuth transaction publication and grading runtime writes after
  removing the fixture registration. Legacy publication calls remain zero; cache is clean.
  All write fixtures use disposable profiles and local bare remotes.
- Final full UI/Electron: 185 files, 1,873 passed, 25 skipped, with isolated
  OAuth loopback listeners permitted.
- Backend/UI typechecks, lint, formatting, root/UI/bundled-CLI production builds,
  and `git diff --check` pass. The existing renderer chunk-size advisory remains.

## Phase 6 / Slice 6.1: Schema v2 persistent faculty directory

This slice implements schema development only, following Phase 6 of the
[implementation roadmap](graider-architecture-evolution-roadmap.md#phase-6--schema-v2-core-identity-and-authorization-model).
Schema v1 remains production-compatible, including managed discovery, synchronization,
faculty authorization, and course publication. Course Setup still writes schema 1.
No user course is migrated, upgraded, or rewritten.

Schema v2 retains grading, reports, notifications, and transitional faculty-team
configuration, and adds the identity fields below. Slice 6.6 removed the initial
transitional grader fields from v2; they now parse only in v1 compatibility.

```yaml
schema_version: 2
# Existing course, github, defaults, grading, reports, notifications fields retained.
faculty_directory:
  - institutional_username: jones
    github_user_id: 22993125
    github_login: current-login
    github_login_history: []
fallback_administrator:
  github_user_id: 22993125
```

The [complete development fixture](../tests/fixtures/config/schema-v2-course.yml)
is pre-migration/schema-development material, not an operational course template.
`term.yml`, `assignment.yml`, and term section faculty arrays remain unchanged.

`rawCourseConfigV1Schema` and `rawCourseConfigV2Schema` are strict versioned schemas
sharing existing course fields. `RawCourseConfigV1` and `RawCourseConfigV2` form the
supported `RawCourseConfig` union. `parseCourseConfig` dispatches on `schema_version`
before validating shape; malformed v2 cannot fall through to v1. Unsupported numeric
versions retain the `invalid_schema_version` diagnostic. Term parsing support is versioned separately below; assignment schema support remains at version 1.

The directory must be nonempty. Institutional usernames and current GitHub logins
must be unique case-insensitively; GitHub user IDs must be unique positive safe
integers. Required identity values cannot be missing, empty, or malformed.
Institutional usernames cannot contain whitespace/control characters. GitHub logins
reuse the roster login validator, case-insensitively, preserving their supplied
spelling. Login history may be omitted (defaults to `[]`) or empty. Its entries must
be valid logins, but need not be unique across records: history is metadata only.

`FacultyDirectory` accepts a validated v2 course and exposes immutable snapshots via:

- `resolveByGithubUserId(userId)`: canonical authenticated account identity lookup;
- `resolveByInstitutionalUsername(username)`: case-insensitive transitional internal lookup.

Current login and login history are exposed as metadata on the returned record.
A changed current GitHub login with the same immutable user ID represents the same
faculty identity. Neither current nor historical login is an authentication fallback.
The model grants no permissions and never calls GitHub or updates YAML on rename.

Parsing support does not activate production v2 authorization. The explicit
`OPERATIONAL_COURSE_SCHEMA_VERSION` remains 1. The shared production metadata inspector
rejects v2 and later versions as `unsupported_schema` before faculty authorization.
Remote discovery, managed synchronization (including checked-out metadata), operational
source validation, and transaction mutation validation use that inspector. A parsed v2
course therefore cannot become writable through the managed production paths.
The lower-level `loadCourseConfig`/`parseCourseConfig` APIs understand v2 for
model/schema development. Existing `validateCourseConfig` operational validation stays
at schema 1, so aggregate `loadGraiderConfig` consumers (including CLI Apply, grading,
reporting, and workflow operations) also refuse v2 before executing. This preserves
the v1 authorization boundary outside managed remote paths.

## Phase 6 / Slice 6.2: Fallback Administrator

Schema v2 now requires exactly one `fallback_administrator` object containing only
`github_user_id`, a positive safe integer referencing a member of `faculty_directory`.
Missing/malformed objects, additional role fields, and unknown IDs fail schema validation.
The [development fixture](../tests/fixtures/config/schema-v2-course.yml) includes the
reference. Schema v1 remains unchanged and does not accept this field.

The relationship is `fallback administrator → immutable GitHub user ID → faculty record`.
No institutional username or login is copied into the role. Current login and login
history remain metadata; renaming a GitHub account does not change fallback authority.

`FallbackAdministrator` validates and snapshots a v2 course and uses `FacultyDirectory`
for identity lookup. Its domain API is:

- `getFacultyRecord()`: retrieve the current administrator's immutable faculty snapshot;
- `isFallbackAdministrator(authenticatedGithubUserId)`: compare immutable IDs only;
- `transferTo(githubUserId)`: return an independent, validated v2 course value referencing
  another existing directory member; throw if that member does not exist.

Transfer changes only the fallback-administrator reference. The original course and
model remain unchanged, the full directory is preserved, and the former administrator
remains a faculty identity. The returned course's nested values are also independent
of the source and model snapshot. Nothing is written or published.

This models course-level recovery/administrative identity, not a permanent coordinator
role. It grants no section visibility or grading rights. Transfer initiation, current
administrator authorization, and unavailable-administrator recovery involving coordinators
remain for later authorization slices; this transition does not authorize its caller.

`OPERATIONAL_COURSE_SCHEMA_VERSION` remains **1**. Discovery, synchronization, mutation
validation, aggregate CLI config loading, Course Setup, and current v1 faculty scope
retain the 6.1 production boundary. V2 remains schema/domain development material:
no real course is migrated, no fallback administrator is inferred, and no v2 publication
or transfer UI is enabled. Assignment schema and operational term behavior remain unchanged; development term v2 is described below.

## Phase 6 / Slice 6.3: Term Coordinator Model

Schema v2 terms retain the existing term metadata and section ID/roster fields and add:

```yaml
schema_version: 2
term:
  code: 27s1
  academic_year: 2027
  semester: 1
  display_name: Spring 2027
coordinators:
  current:
    - github_user_id: 22993125
    - github_user_id: 22993126
  former: []
sections:
  - id: "001"
    roster: rosters/section-001.csv
    faculty:
      current:
        - github_user_id: 22993125
      former:
        - github_user_id: 22993126
```

The [paired development term fixture](../tests/fixtures/config/schema-v2-term.yml)
references the [development course directory](../tests/fixtures/config/schema-v2-course.yml).
These are pre-migration/schema-development examples, not operational templates.
V1 section faculty arrays remain unchanged. V2 section history is described below;
no coordinators are inferred from section assignments.

`rawTermConfigV1Schema` and `rawTermConfigV2Schema` share metadata and section ID/roster
fields, with version-specific faculty shapes and corresponding `RawTermConfigV1`/`RawTermConfigV2` types and the supported
`RawTermConfig` union. `parseTermConfig` explicitly dispatches on `schema_version`;
malformed v2 cannot fall through to v1. Unsupported numeric versions retain the
`invalid_schema_version` diagnostic. Both versioned shapes remain strict.

`coordinators.current` and `coordinators.former` are required arrays of strict
`{ github_user_id }` references. IDs must be positive safe integers and unique within
and across both arrays. Institutional usernames, current logins, login history, and
other fields are not accepted in references. Raw term validation checks syntax only:
referential validation requires both a validated v2 course and term.

`TermCoordinators(course, term)` snapshots and validates both inputs, resolves every
current/former reference through `FacultyDirectory`, and rejects unknown faculty IDs.
Its domain API is:

- `getCurrentCoordinators()` / `getFormerCoordinators()`: immutable faculty snapshots;
- `isCurrentCoordinator(githubUserId)` / `isFormerCoordinator(githubUserId)`: immutable-ID
  role checks for this term only;
- `addCurrentCoordinator(githubUserId)`: add an existing faculty member with no coordinator
  history in this term;
- `removeCurrentCoordinator(githubUserId)`: move a current coordinator to former history;
- `restoreFormerCoordinator(githubUserId)`: move a former coordinator back to current.

Each transition returns an independent, validated v2 term. It changes only the term's
coordinator references, preserving other current/former identities and all section
metadata. Invalid/duplicate transitions and unknown faculty targets throw. Former
coordinators must be restored explicitly rather than added again. Course faculty
records and fallback administrator identity are never changed or removed.

Raw arrays may be empty because this slice introduces no term lifecycle state. The
domain model requires at least one current coordinator and refuses removal of the
last one. This is an explicit domain invariant, not a Draft/Active/Archived policy;
future lifecycle work can address transitional coordinator-free metadata separately.

Current means the faculty member currently holds the coordinator identity for this
term. Former means they previously held it; history is retained for later historical
access resolution. Neither status is inferred from another term or from fallback
administrator status. GitHub login renames do not change these identities. These
models grant no section, grading, mutation, or historical-access permissions yet.

`OPERATIONAL_COURSE_SCHEMA_VERSION` remains **1**; the explicit
`OPERATIONAL_TERM_SCHEMA_VERSION` is also **1**. Production `validateTermConfig` keeps
aggregate loading, remote faculty inspection, managed synchronization, and transaction
validation on v1 terms even when the course itself is v1. V2 course inspection stays
gated independently. Apply, grading, reports, Course Setup output, and current faculty
scope remain unchanged. No real course is rewritten or migrated.

## Phase 6 / Slice 6.4: Section Faculty History

V2 sections now require current/former immutable faculty references:

```yaml
sections:
  - id: "001"
    roster: rosters/section-001.csv
    faculty:
      current:
        - github_user_id: 22993125
      former:
        - github_user_id: 22993126
  - id: "002"
    roster: rosters/section-002.csv
    faculty:
      current:
        - github_user_id: 22993126
      former: []
```

The [development term fixture](../tests/fixtures/config/schema-v2-term.yml) uses the
new shape. It remains pre-migration/schema-development material. V1 retains optional
username arrays (`faculty: [jones, smith]`); no arrays are migrated, reinterpreted,
or used to infer v2 historical assignments. V2 rejects username arrays.

Both v2 `faculty.current` and `faculty.former` arrays are required. References use the
same strict `{ github_user_id }` shape as coordinators: positive safe integer IDs,
no copied usernames/logins, no unexpected fields. IDs must be unique within and across
both lists **for each section**. The same ID can be current in one section and former
in another. Raw schemas validate reference syntax without consulting course metadata.

`SectionFaculty(course, term, sectionId)` validates and snapshots both v2 inputs,
selects exactly one matching section, and resolves all section faculty references in
the term through `FacultyDirectory`. Missing/ambiguous section IDs and unknown faculty
references fail domain construction. The domain API is:

- `getCurrentFaculty()` / `getFormerFaculty()`: immutable faculty-record snapshots;
- `isCurrentFaculty(githubUserId)` / `isFormerFaculty(githubUserId)`: membership in the
  selected section, matched by immutable ID only;
- `addCurrentFaculty(githubUserId)`: add an existing faculty member without history in
  this section;
- `removeCurrentFaculty(githubUserId)`: move current membership into former history;
- `restoreFormerFaculty(githubUserId)`: move former membership back to current.

Transitions return independent validated v2 terms and change only the selected
section's faculty lists. They preserve term metadata, rosters, other sections,
coordinators, fallback administrator, and the entire faculty directory. Unknown IDs,
already-current additions, additions with former history, removal of non-current
faculty, and restoration of non-former faculty throw. Former identities must be
restored explicitly; historical faculty records are never deleted.

Current faculty teach this section now; former faculty previously taught this section.
The identity relationship is `immutable GitHub user ID → faculty directory → section role`.
Current login, login history, and institutional username remain metadata and cannot
serve as role-match fallbacks. Login renames do not change membership or rewrite YAML.

Both raw schema and domain model allow zero current faculty, including removal of the
last current member. Unassigned sections are valid at this stage. Requiring assignments
before activation belongs to future lifecycle policy; the coordinator model's minimum
current-coordinator invariant is not applied to section faculty.

Section membership is independent of coordinator and fallback-administrator roles.
Holding either role does not add section membership; adding section faculty does not
make them a coordinator or fallback administrator. One faculty identity may hold
several roles independently. No permissions or historical-read access are enforced
by this slice.

`OPERATIONAL_COURSE_SCHEMA_VERSION` and `OPERATIONAL_TERM_SCHEMA_VERSION` remain **1**.
Production aggregate loading, discovery authorization, managed synchronization and
transactions, Apply, grading, reports, and Course Setup remain on v1. Production scope
resolution explicitly narrows to v1 before interpreting username arrays. Course Setup
continues generating schema 1 with v1 faculty arrays. No real course is modified or
migrated, and no v2 publication is enabled.

### Phase 6 / Slice 6.5: Unified authorization resolver

`src/faculty/authorization-resolver.ts` implements the shared Schema v2 domain policy.
`AuthorizationResolver(course, term, authenticatedGithubUserId)` validates and snapshots
its inputs and composes `FallbackAdministrator`, `TermCoordinators`, and `SectionFaculty`,
which resolve persisted references through `FacultyDirectory`. The authenticated key is
only the immutable numeric GitHub user ID. Current login, login history, institutional
username, and directory membership never grant permissions.

The separation is **identity/role facts → authorization policy → decision**.
`roleFacts` is an immutable snapshot of the selected term code, authenticated ID,
fallback identity, current/former coordinator membership, and current/former faculty
section IDs. Roles remain independent; callers do not interpret raw YAML role arrays.

The resolver exposes separate visibility and mutation decisions:

| API                                  | Policy                                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canViewTerm()`                      | Term context/metadata for current/former coordinators or section faculty; does not authorize all-section reads.                                                                                    |
| `canViewSection(sectionId, scope)`   | Current/former faculty can read their sections. Former coordinators can read the entire selected term. Current coordinators reach other sections only through explicit expanded scope.             |
| `canMutateSection(sectionId, scope)` | Current section faculty can perform normal section operations in their current sections. Current coordinators can perform section operations across the term only through explicit expanded scope. |
| `canManageTermStructure()`           | Current coordinators can manage term structure and faculty assignments independently of section scope.                                                                                             |
| `hasFallbackAdministration()`        | Separate course-level recovery capability; grants no term/student/section visibility, coordinator membership, or general section mutation.                                                         |
| `getSectionScope(scope)`             | Immutable visible and mutable section IDs, plus effective historical read-only IDs (visible sections lacking independent current mutation authority).                                              |

Each decision contains `allowed`, a typed `basis`, and `effectiveScope`. Denials have
scope `none`; successful decisions distinguish section, term, term metadata, and course
recovery. An unknown section is denied even for a coordinator. Unassigned sections are
valid and are not implicitly visible or mutable to ordinary faculty.

`AuthorizationScope` is either `default` (also the omitted argument) or
`coordinator-term`. The expanded request is accepted only after proving current
coordinator membership in this selected term. A renderer-provided flag cannot create
authority. Invalid runtime scope values and expanded requests by non-current coordinators
are denied, including for former coordinators; their historical access remains available
through default scope. Scope requests do not persist or change subsequent default calls.

For example, a current coordinator teaching section 001 sees/mutates only 001 by default;
explicit `coordinator-term` scope enables 001, 002, and unassigned 003. A coordinator
without teaching assignments can view term metadata and manage structure but has no
default section scope.

Former section faculty retain read-only access to their former sections. Former
coordinators retain read-only access across their former term. Another independent
current role can still grant mutation in its own scope. No Draft/Active/Archived or
late-grading/regrading policy is inferred here; lifecycle policy will refine these
role-derived decisions later. Fallback transfer/recovery and term creation, activation,
archive, and unarchive actions are not authorized by these general capabilities.

The resolver is intended to become the shared authorization trust boundary for Electron
services when Schema v2 is activated. It requires trusted authenticated identity and
validated selected-course/term state; Electron must still enforce session freshness,
repository identity, source revision, and mutation publication checks. This slice does
not route existing services through the new resolver or replace the v1
`faculty-scope-resolver.ts`, `faculty-scope-context.ts`, or Electron faculty-scope service.

Both `OPERATIONAL_COURSE_SCHEMA_VERSION` and `OPERATIONAL_TERM_SCHEMA_VERSION` remain
**1**. Discovery, synchronization, grading, Apply, reports, roster management, mutation
guards, Course Setup, and production faculty scope retain v1 behavior. No real course is
modified and no v2 production operation is activated.

`tests/unit/faculty/authorization-resolver.test.ts` supplies the visibility/mutation
matrix for current/former section faculty, coordinators with/without teaching sections,
former coordinators, fallback-only identity, overlapping independent roles, directory-only
members, unrelated IDs, and unassigned sections. It checks default/expanded scope,
identity metadata spoofing, term/section isolation, role transitions, structured reasons,
input snapshots, invalid references, and the production gates.

Slice **6.6 — Remove Grader Role** is complete below. The resolver remains grader-free.

## Phase 6 / Slice 6.6: Remove grader role

The role model is faculty-directory identity → term coordinator and/or section faculty
→ authorization. Current section faculty is the ordinary grading authority; directory
membership alone grants nothing. Historical roles and explicit coordinator scope retain
Slice 6.5 semantics. There is no separate grader identity, team, permission, capability,
or replacement field. Production services still use v1 faculty scope, and both operational
course/term schema gates remain **1**. No v2 operational cutover occurs here.

The pre-edit inventory traced these remaining concepts and their callers:

| Reference / consumer                                                        | Slice 6.6 disposition                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config-schemas.ts` shared GitHub shape, v2 fixture                         | Grader fields removed from v2; strict parsing rejects each field. The shared shape is grader-free.                                                                                                                                                                                                                                                                                                               |
| v1 `grader_team` / `grader_permission`                                      | Deprecated, optional parse-only compatibility fields on the v1 schema. No permission-policy enforcement, authorization, team lookup, or mutations derive from them. Existing files remain untouched.                                                                                                                                                                                                             |
| `config-validation.ts` and grader permission constant                       | Grader-specific validation/constant removed; faculty/student policy retained.                                                                                                                                                                                                                                                                                                                                    |
| Course Setup (`courseSetupService.ts`), config writers, setup UI/IPC        | Setup already generated v1 without graders. Regression coverage pins schema 1 and absence of both fields. No separate grader UI setting exists. Other document-based writers preserve existing v1 data rather than migrating it.                                                                                                                                                                                 |
| `plan-builder.ts`, `operation-models.ts`, `repository-targets.ts`           | New and tracked individual targets generate faculty/student operations only; grader operation type and target permission removed. Apply rebuilds plans from current guarded config, not persisted renderer preview data.                                                                                                                                                                                         |
| `group-preview-planner.ts`, `group-target-executor.ts`                      | Grader target fields and team mutation removed. Existing faculty team and student admin behavior retained. No Phase 7 team model introduced.                                                                                                                                                                                                                                                                     |
| `apply-executor.ts`                                                         | Grader constant, dispatch, permission reconciliation, and new manifest grader state removed. Faculty permission updates preserve historical fields through the existing manifest merge.                                                                                                                                                                                                                          |
| `github-readiness-validation.ts`, diagnostic catalog                        | Faculty team still required. Missing legacy grader teams are never queried and cannot block. Grader-only diagnostic constants retired.                                                                                                                                                                                                                                                                           |
| Manifest loader/model/renderer                                              | Manifest versions unchanged. V1 optional `permissions.grader_team` / model `graderTeam` remain deprecated historical evidence. Existing records round-trip, with no refresh or desired permission semantics. New manifests do not introduce this field. Manifest v2 target format contains no grader permission field.                                                                                           |
| Persisted diagnostics/results                                               | Diagnostic codes are parsed as strings; old grader diagnostics remain readable without active catalog constants. No executable persisted-plan loader exists.                                                                                                                                                                                                                                                     |
| Apply preview normalization/types/merge/page/status labels                  | Grader target fields, displayed grader permission, and active operation label removed. Unknown fields in old JSON remain safely ignored. Grading-work terminology is unchanged.                                                                                                                                                                                                                                  |
| `AuthorizationResolver`                                                     | Already grader-free; focused regression checks facts/capabilities, current section-faculty mutation basis, directory-only denial, and unchanged production gates.                                                                                                                                                                                                                                                |
| Backend/UI tests, v1 fixtures                                               | Existing v1 course and legacy manifest fixtures retained as compatibility evidence; current typed target samples and mutation counts updated. Focused tests cover old fields with no grader GitHub team, fresh/repeated Apply, and historical manifest preservation.                                                                                                                                             |
| Examples, configuration/JSON/architecture/requirements/test/diagnostic docs | New config example omits grader fields; current contracts describe faculty access. Historical feature requests and UI redesign summaries remain historical records, not active role requirements. External autograders, grading tools, `GradeResult`/`GradeRow` names, and grading-work examples are unrelated and retained. Live-test setup no longer requires a grader team; no live tests run for this slice. |
| Phase 9.4 migration                                                         | Explicitly deferred: remove obsolete persisted config/manifest desired-state remnants, reconcile existing GitHub teams/permissions, and review needed faculty assignments. Never infer section authorization from legacy grader membership.                                                                                                                                                                      |

Phases 6 and 7 and Slices 8.1–8.6 are complete. The next planned work is **Phase 9 / Slice 9.1 —
Migration Analyzer**. These backend slices do not migrate courses, edit the real
`csc1120`, change production permissions or term lifecycle, or activate v2.
