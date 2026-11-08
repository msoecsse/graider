# Graider Lifecycle State Models

**Status:** implementation-facing state/transition contract

**Authority:** [remote course architecture](graider-remote-course-architecture.md)

**Related:** [authorization matrix](graider-authorization-matrix.md),
[schema-v2 design](graider-schema-v2-design.md)

## 1. Modeling conventions

The diagrams show domain transitions, not UI navigation or Git operations.
Authorization is always resolved from the actor's immutable GitHub user ID and
the persisted role history. A transition is successful only after the
course/admin repository mutation has synchronized, validated, committed, and
pushed successfully. Multi-system GitHub work records desired state and may
finish later through reconciliation.

Several visible labels are projections of orthogonal fields. In particular,
course archive state is independent of organization migration state, and a
section assignment's usage, provisioning, revision review, and distribution
progress must not be collapsed into one lossy status enum.

## 2. Course lifecycle and migration condition

### 2.1 Shared archive lifecycle

```mermaid
stateDiagram-v2
    [*] --> Unarchived: create course
    Unarchived --> Archived: archive
    Archived --> Unarchived: unarchive
```

| Transition            | Initiator                                                     | Guards                                                                                             | Reversible                | Important side effects                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create → Unarchived   | Authenticated course creator                                  | Existing organization selected; required repository/team privileges validated before partial setup | No normal course deletion | Creator enters faculty directory and becomes fallback administrator; private admin repository, initial Draft term, managed teams, branch protection, topic, and synchronization are established |
| Unarchived → Archived | Fallback administrator or coordinator of the most recent term | No Active/Draft term, no unresolved activation checkpoint; no migration block                      | Yes                       | Shared remote archive flag changes; course remains synchronized and available through Show archived                                                                                             |
| Archived → Unarchived | Same authorities                                              | Authentication, sync, valid schema, no migration block                                             | Yes                       | Enables creation of terms/assignments; does not reactivate an old term                                                                                                                          |

New-course bootstrap must satisfy the [initial authority policy](graider-remote-course-architecture.md#initial-authority--approved-option-a-30):
explicit verified coordinator selection and separate verified section-faculty
selections. Becoming fallback administrator does not make the creator a coordinator.

Course archive is shared remote state. Machine-local hide/show is not a course
state and never controls whether the managed clone exists or synchronizes.
There is no normal permanent Delete course transition.

Slice 8.6 implements required v2 `course.lifecycle: unarchived | archived` and
`CourseLifecycle` / `CourseLifecycleAuthorizationResolver`. V1 is unchanged. Archive
requires complete valid course/term/checkpoint state, no Active, no Draft (including
rolled-back ever-Active Drafts), and no unresolved checkpoint. Unknown/malformed or
contradictory state fails closed. Empty or all-Archived term sets may archive; no
term/checkpoint is automatically resolved. Same-state authorized requests are no-ops.

Authority is fallback or a current coordinator of the most recently created existing
term, with current Archived coordinators representing normal completion. Former,
ordinary faculty, assignment-only and older-term roles do not qualify. Required v2
`course.term_creation_order` lists every existing canonical code exactly once, oldest
created first. Its last entry identifies that term without date, academic, code,
filesystem or caller-array inference. A list is needed to identify the next latest
when deleting the latest Draft; deletion removes its entry in the same commit as the
directory. Future creation appends atomically. With no terms the list is `[]` and
only fallback has lifecycle authority. Missing/dangling references require attention.

Archive/unarchive uses the existing exact-revision isolated managed transaction,
course.yml-only scope, non-force publication and lost-response verification. Races
require a fresh explicit invocation. Unarchive creates/reactivates nothing, preserves
all term/role/history/assignment/recovery state, and does not change readiness.
The closed course-creation gate blocks term/assignment creation only while Archived;
passing still requires independent role/ownership authorization. Historical 8.4
inspection/grading/regrading/dispatch/publication remain available in scope.

Pure future dashboard projection excludes shared Archived courses normally and
includes them with Show archived; local hiding is separate. Discovery, sync and
bootstrap remain eligible. The 8.3 GitHub desired roles/permissions are unchanged;
no team/permission/branch/organization/repository archive API mutation occurs.
Production gates remain 1, Setup emits v1 and production UI/IPC is untouched. The
future outer trust/revalidation boundary must also prove no unresolved Phase 9
organization migration once that model exists; it is not implemented here.

**Phase 8 is complete. Next: Phase 9 / Slice 9.1 — Migration Analyzer.**

### 2.2 Organization migration condition

```mermaid
stateDiagram-v2
    [*] --> Reconciled
    Reconciled --> MigrationRequired: admin repo appears in a different organization
    MigrationRequired --> MigrationInProgress: authorized migration starts
    MigrationInProgress --> MigrationIncomplete: step fails after checkpoint
    MigrationIncomplete --> MigrationInProgress: resume
    MigrationRequired --> Reconciling: manual GitHub migration
    MigrationIncomplete --> Reconciling: reconcile manual repairs
    Reconciling --> Reconciled: destination fully validates
    MigrationInProgress --> Reconciled: all resources verify
```

`Reconciled`, `MigrationRequired`, `MigrationInProgress`, and
`MigrationIncomplete` are independent of `Unarchived`/`Archived`. A repository
or organization rename under the same immutable course/admin repository ID
stays Reconciled and only refreshes locator metadata.

Migration required/incomplete blocks normal course mutations. Planning is
read-only. Execution is previewed and checkpointed; verified completed work is
retained on failure. Reconciliation updates Graider metadata only after the
destination repositories, managed teams, memberships, permissions, and other
organization-bound resources validate. Exact role authority to initiate and
reconcile migration is not assigned by the approved requirements and remains
an explicit decision; see the [authorization matrix](graider-authorization-matrix.md#9-organization-migration-and-reconciliation).

## 3. Term lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Active: explicit activation
    Draft --> [*]: delete (never Active)
    Active --> Archived: successor activation or explicit archival
    Active --> Draft: explicit safe activation rollback
    Archived --> Active: explicit predecessor recovery only
```

The backward arrows are explicit recovery exceptions, never ordinary reactivation.
Checkpoint state is separate from the lifecycle enum: `rollback_available` permits
safe rollback with trusted absence evidence; `recovery_required` prohibits returning
the mistaken Active to Draft. Explicit predecessor restoration after activity archives
the mistaken term, preserving student data. There is no `RecoveryRequired` lifecycle
value or ordinary “reactivate archived term” command.

Slice 8.1 implements only persisted v2 `term.status` (`draft`, `active`, `archived`)
and the pure normal-transition graph `draft → active → archived`. Same-state
assignment is a no-op; skips and backward transitions fail. Recovery-specific
exceptions in this diagram are implemented separately in 8.5 and do not weaken that contract.
Draft authorization is implemented in 8.2, and normal activation in 8.3 as described
below. Archived authorization is implemented in 8.4 and explicit recovery in 8.5. See
[architecture §9](graider-remote-course-architecture.md#9-term-lifecycle).

### 3.1 Term transition contract

| Transition                          | Initiator                                                                                          | Guards/preconditions                                                                                      | Reversible                               | Important side effects                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Create Draft                        | Coordinators of most recently created term, or fallback administrator                              | Course unarchived; schema compatible; no migration block                                                  | Draft may be deleted                     | Creates preparatory term scope and desired roles; no student-facing work                                                     |
| Draft → Active                      | Current Active-term coordinator or fallback administrator; fallback administrator for initial term | Explicit action; complete valid Draft; no unsupported schema/migration block; atomic single-Active update | Only by safe rollback guard below        | Previous Active becomes Archived; coordinator/faculty permissions and dashboards switch; desired-state reconciliation begins |
| Active → Archived during activation | Same actor as activation                                                                           | Happens in same logical transaction as successor Draft → Active                                           | Only as part of safe activation rollback | Preserves history and eligible late grading/regrading rights                                                                 |
| Draft → Deleted                     | Current-term coordinator, fallback administrator, or—if no Active term—a coordinator of that Draft | Term has never been Active                                                                                | No normal recovery except Git checkpoint | Removes only Draft data; student repos cannot exist from Draft operations                                                    |
| Mistaken activation rollback        | Authorized activation/recovery actor                                                               | Newly activated term has no student-facing activity                                                       | Special one-time recovery                | Restores one Active term and prior authorization desired state without erasing activation history                            |
| Checkpoint → recovery_required      | Write-ahead marker                                                                                 | Student-facing activity exists, so safe rollback guard fails                                              | Resolved only explicitly                 | Blocks simplistic rollback and preserves all activity for deliberate recovery                                                |

### 3.2 Term invariants

1. At most one term is Active in a valid snapshot. Initial setup, future course
   archive and recovery may have zero; workflows requiring exactly one check
   explicitly. Multiple Draft and Archived terms are allowed. Activation must
   never expose an intermediate durable state with two Active terms.
2. Draft terms permit configuration, sections, faculty, rosters, assignments,
   schedules, and grading-workflow preparation, but prohibit Apply,
   student-repository mutations, grading dispatch/grading, and publication.
3. Dates never activate terms automatically.
4. `has_ever_been_active` or equivalent history is irreversible. Once Active,
   a term is normally retained as Archived rather than deleted.
5. Archived terms freeze ordinary section, roster, assignment structure,
   deadline, and faculty changes. Normally completed faculty retain authorized
   grading/regrading/publication rights; faculty removed mid-term do not.
6. Remote manual deletion of old Archived term data is authoritative; a stale
   local cache must not recreate it.

### 3.3 Implemented activation boundary (Slice 8.3)

Activation requires the existing Active term's current coordinator or fallback;
with zero Active, only fallback. Draft preparation/setup authority is insufficient.
V2 persists explicit `term.has_ever_been_active`: Active/Archived require true;
Draft accepts false or true for future recovery. Normal activation never resets it.

The complete transition is planned/validated and published in one course/admin Git
commit through the existing managed exact-revision transaction, staging both old/new
term files together. There is no intermediate published snapshot, stale-state retry,
merge/rebase or force push. Remote-accepted/lost-response publication is verified
using the existing commit/ancestry semantics.

Only then does external GitHub reconciliation run. Active current coordinators form
course admin; Draft preparation and normally completed Archived current roles retain
write; remaining former roles retain read, with strongest effective role winning.
Scoped current/former team identities/history do not change. The projection is opt-in;
Phase 7 defaults are unchanged. Branch policy and provisioning are unaffected.

Pending faculty do not invalidate activation. Incomplete/failed external state yields
`activated_needs_reconciliation`, preserving the authoritative commit and blocking
student-facing readiness. `activated_reconciled` means required observed state is
complete. Unknown or superseded post-publication revision also blocks reconciliation
and readiness. Explicit fresh-state reconciliation can converge later; no automatic
Git rollback or blind retry is performed. Readiness is separate from the persisted
lifecycle enum.

Git activation history and irreversible evidence are retained; Slice 8.5 adds the
checkpoint and explicit recovery policy below. Both operational schema gates remain
1, with no production activation/IPC or real course changes. Slice 8.4 adds the
separate Archived authorization overlay below.

### 3.4 Implemented Archived authorization (Slice 8.4)

`ArchivedTermAuthorizationResolver` validates the complete trusted v2 term set and
requires an Archived target with activation history. It composes the target's
Phase 6 role resolver and fallback identity; caller inputs are snapshotted and
decisions/scopes frozen. No Active term is required and dates infer nothing.

Current Archived coordinator/faculty records represent normal completion; former
records represent explicit removal. Historical inspection preserves current/former
section scope and former-coordinator term-wide read. Metadata is visible to those
roles and fallback. Current target coordinators can explicitly expand via
`coordinator-term`; ordinary defaults never automatically expand. Coordinating
another Active/Draft term grants no Archived access.

Late grading/regrading, grading dispatch and report publication/republication require
current target section faculty in their own section, or current target coordinators
after explicit expansion. Former-only roles retain read only. Fallback alone gets
metadata and exceptional correction, without ordinary student/repository inspection
or late-work rights. Independently held current roles still apply.

Ordinary section/roster/assignment structure, deadline/late-policy and faculty changes
always deny with `archived-structure-frozen`, even for coordinators/fallback. A separate
closed correction capability authorizes only current target coordinators or fallback
for explicit exceptional repair. It implies neither student access nor lifecycle
recovery. Apply/provisioning and generic student-repository mutations always deny;
only the named late-work operations may mutate within their authorized scope.

No current role is converted to former on archival. The 8.3 effective course-write,
scoped current teams and student admin/read grants remain unchanged. GitHub permissions
are infrastructure capability, not Graider operation authorization. This pure overlay
does no GitHub reconciliation or corrective mutation. Both production gates remain 1;
v1 Setup/workflows remain unchanged, with no production UI/IPC or real course changes.
Slice 8.5 below adds deletion and activity guards. Exceptional correction does not
authorize reactivation or rollback.

### 3.5 Implemented deletion and activation recovery (Slice 8.5)

Every future activation atomically adds strict version-1
`terms/<target>/activation-recovery.yml`: activation UUID, immutable repository ID,
source revision, target, nullable predecessor, activating GitHub ID and checkpoint
state. `rollback_available` has no activity record; `recovery_required` requires the
first typed activity category/actor/time. Unknown versions, malformed/missing recovery
records, contradictory lifecycle/history or missing predecessors fail closed.

```mermaid
stateDiagram-v2
    [*] --> rollback_available: activation commit
    rollback_available --> recovery_required: confirmed write-ahead activity commit
    rollback_available --> [*]: safe rollback resolves checkpoint
    recovery_required --> [*]: accept current or restore predecessor
```

Before first Apply/provisioning, dispatch, grading, publication or student-repository
mutation, the durable marker must be remotely confirmed. Marker/rollback share the
existing account/course lease and exact-revision non-force transaction; one winner
makes same-base competing operations stale. Repeated marking is idempotent and no
operation proceeds on an unconfirmed marker. This barrier does not supply operation
authorization; the future trusted caller must separately enforce role/scope/readiness.

Deletion requires never-Active Draft, no checkpoint and complete exact-source remote
absence evidence for every student-facing category. With an Active, its current
coordinators or fallback authorize; with zero Active, target Draft current
coordinators or fallback authorize. Unknown evidence/files, provisioning targets,
activity or irreversible history block deletion. Only canonical preparatory data is
removed, in one commit. Local/runtime absence cannot establish safety.

Safe rollback requires `rollback_available` plus complete trusted absence evidence:
current target returns to Draft, predecessor returns to Active, and checkpoint is
removed together. Initial rollback leaves zero Active. Activation history stays true
and such a Draft can never be deleted. Roles and student/history files are untouched.
With `recovery_required`, simple rollback returns an explicit recovery-required result.
Only fallback or the current Active target's current coordinator may recover.

After the durable marker, explicit accept-current removes the checkpoint without
lifecycle change. Restore-predecessor archives the mistaken term and reactivates its
existing Archived predecessor atomically; all student/history state survives. Initial
activation has no predecessor to restore. Remote deletion is authoritative and missing
predecessors are never recreated. Checkpoints exist only while unresolved; Git history
and `has_ever_been_active` preserve permanent evidence.

Confirmed metadata always precedes lifecycle-aware reconciliation. Deleted scoped
teams are emptied through the existing engine without creating absent teams. Recovery
uses the unchanged 8.3 course-wide projection and scoped role history. Pending or failed
external state reports Needs reconciliation, never Git rollback. Empty/zero-Active
snapshots remain valid with student-facing readiness false. Gates remain 1, Setup emits
v1, and no production v2/UI/IPC or real resource is enabled. See
[architecture §9.4](graider-remote-course-architecture.md#94-delete-and-rollback).

Slice 8.6 above completes Phase 8; next is Phase 9 / Slice 9.1 — Migration Analyzer.

## 4. Assignment lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Active: activate
    Draft --> [*]: owner deletes
    Active --> Archived: archive
    Archived --> Active: unarchive
```

| Transition        | Initiator                                                   | Guards/preconditions                                                             | Reversible                                                 | Important side effects                                                                                              |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Create Draft      | Faculty active in the term                                  | Term visible/editable; creator becomes initial owner                             | Yes, by owner deletion                                     | Creates shared definition only; no section Apply state or grading is copied unless a separate copy workflow says so |
| Draft → Active    | Assignment owner or term coordinator                        | At least one effective owner; valid shared definition; term lifecycle permits it | Yes, by archive                                            | Assignment becomes available to all term sections; sections independently choose use                                |
| Draft → Deleted   | Assignment owner; coordinator may override owner operations | Assignment has never been Active and no provisioning exists                      | No normal restoration except repository history/checkpoint | Deletes Draft definition; no student repositories should be affected                                                |
| Active → Archived | Assignment owner or term coordinator                        | Valid synchronized state                                                         | Yes                                                        | Hides from normal lists; prevents new Apply; retains grading/regrading/publication                                  |
| Archived → Active | Assignment owner or term coordinator                        | Term/course lifecycle allows operation; owner repaired if needed                 | Yes                                                        | Restores availability; does not Apply or update any section automatically                                           |

### Assignment invariants

- Slug is immutable after activation; title remains editable.
- Active assignments cannot be deleted.
- At least one effective owner is required for normal lifecycle management.
  A migrated ownerless assignment remains repair-required and read-only until
  a coordinator assigns an owner.
- Faculty active in the term may collaboratively edit shared content without
  becoming owners. Owner authority controls lifecycle, ownership, and template
  revision adoption.
- Every meaningful shared-definition edit produces an assignment revision and
  faculty-facing history.
- A save that makes applied sections out of date warns the editor before
  commit. It never silently modifies student repositories.

## 5. Section assignment operational state

### 5.1 Orthogonal durable dimensions

| Dimension             | Representative values                                                    | Constraint                                                                               |
| --------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Usage                 | `available`, `using`, `not_using`                                        | `not_using` only before any provisioning exists                                          |
| Provisioning          | `not_started`, `in_progress`, `complete`, `incomplete`                   | Incomplete work retains per-target results and Needs attention                           |
| Applied revision      | none or a stable assignment revision                                     | Records what the section actually Applied, not current shared revision                   |
| Revision review       | none, `pending`, `keep_current`, `adopted` for a specific newer revision | Keep-current acknowledgement applies only to that reviewed revision                      |
| Template distribution | none, current, partial, needs attention with per-file/repository results | Actual distributed state is authoritative; never pretend a full revision was distributed |
| Schedule              | due date/time and informational late policy                              | Changes immediately without Apply or repository mutation                                 |

These dimensions produce the faculty-facing conceptual states:

| Visible state                      | Projection                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Available / not applied            | usage is available/using and provisioning has never completed                                                             |
| Not using                          | usage is `not_using` and no provisioning history exists                                                                   |
| Applied / current                  | provisioning is complete; applied revision equals current assignment revision; no partial distribution issue              |
| Update available                   | applied revision is older than current revision and review for that revision is pending/absent                            |
| Reviewed / keep current revision   | applied revision remains older and review records `keep_current` for exactly the current revision                         |
| Partially updated                  | some selected template changes reached some repositories/files and durable results remain incomplete by choice or outcome |
| Apply incomplete / Needs attention | provisioning or distribution was interrupted/failed and reconciliation is required                                        |

### 5.2 Conceptual transition diagram

```mermaid
stateDiagram-v2
    [*] --> Available
    Available --> NotUsing: section opts out before provisioning
    NotUsing --> Available: section opts back in
    Available --> Applying: Apply begins
    Applying --> AppliedCurrent: all targets verify
    Applying --> NeedsAttention: interrupted or partial failure
    NeedsAttention --> Applying: retry or reconcile
    AppliedCurrent --> UpdateAvailable: shared revision changes
    UpdateAvailable --> KeepCurrent: acknowledge reviewed revision
    UpdateAvailable --> Updating: select and distribute corrections
    KeepCurrent --> UpdateAvailable: a later shared revision appears
    Updating --> AppliedCurrent: selected adoption/distribution completes
    Updating --> PartiallyUpdated: only part is distributed
    Updating --> NeedsAttention: unresolved conflict or failure
    PartiallyUpdated --> Updating: continue reviewed distribution
```

The diagram is a projection; implementations should preserve the underlying
fields rather than encode every combination into one enum.

### 5.3 Initiators, guards, and side effects

| Action                       | Initiator                                                                           | Guards                                                                                           | Side effects/invariants                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Mark Not using               | Current section faculty; coordinator after explicit scope expansion                 | Active assignment; no repository has ever been provisioned for section                           | Stores section choice; suppresses template-update notification for that section                                                     |
| Set schedule                 | Current section faculty; coordinator after explicit expansion                       | Editable term/section lifecycle                                                                  | No assignment-revision or student-repository change; late status remains derived                                                    |
| Initial Apply                | Current section faculty; coordinator after explicit expansion                       | Term Active; assignment Active; section not Not using; authenticated/synchronized; targets valid | Provisions only selected section, records repository IDs, template/baseline and applied revision; incomplete results remain durable |
| Review/keep current          | Same section authorities                                                            | Newer assignment revision exists                                                                 | Acknowledges only that revision; later revisions notify again; no student-repository change                                         |
| Adopt/distribute corrections | Same section authorities; pinned template adoption itself is owner/coordinator-only | Explicit preview and file/repository selection; clean/safe targets or explicit warned override   | Protects student changes, writes audited instructor updates, records actual file-level result                                       |

Initial Apply provisions the complete pinned template regardless of later file
classification. Selective update defaults choose instructor-managed changes,
never automatically choose student-modified files, and require a strong warned
override to replace such a file.

## 6. Grading lifecycle

```mermaid
stateDiagram-v2
    [*] --> NotStarted
    NotStarted --> InProgress: first meaningful grading mutation
    InProgress --> Complete: faculty marks complete
    Complete --> InProgress: select different submission commit
    Complete --> Published: publish succeeds
    Published --> Complete: grading decision changes
    Published --> InProgress: select different submission commit
    Complete --> InProgress: resume grading
```

| Transition                       | Initiator                                                                                     | Guards/preconditions                                                                        | Reversible                         | Important side effects                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Not Started → In Progress        | Authorized current/historical section faculty                                                 | Student/group in authorized section; term not Draft; meaningful mutation succeeds remotely  | Yes, by completing                 | Creates canonical record pinned to selected submission commit and audit entry                                                              |
| In Progress → Complete           | Authorized section faculty                                                                    | Record valid; current optimistic version; explicit mark complete                            | Yes                                | Marks ready for publication; does not publish                                                                                              |
| Complete → Published             | Authorized publisher                                                                          | Report rendered from current canonical state; student repository write/commit/push succeeds | Yes through later change/republish | Appends publication history; student repo contains only latest report                                                                      |
| Published → Complete             | Authorized section faculty changes comments, adjustments, anchors, or other grading decisions | Mutation passes concurrency check                                                           | Yes by republishing                | Prior publication remains in history; current report is out of date                                                                        |
| Complete/Published → In Progress | Authorized section faculty explicitly selects newer or older submission commit                | Commit exists and is selected explicitly                                                    | Yes by completing again            | Preserves general comments/adjustments, revalidates source anchors, flags changed/missing anchors, and marks prior publication out of date |

### Grading invariants

1. Canonical identity includes term, assignment, section, and student/group.
2. Before grading, latest submission-branch state may be selected. Once the
   record exists, its commit is pinned until faculty explicitly chooses another
   commit or **Use latest submission**.
3. A newer student push only raises **Newer submission available**; it never
   silently moves grading.
4. Selecting another commit from Complete or Published always reopens grading
   as In Progress. Changing other grading decisions after publication returns
   to Complete so the existing work can be republished.
5. Every meaningful grading mutation is remotely durable and audited. Unsaved
   editor text may remain a machine-local draft.
6. Grading claims are short-lived advisory coordination, not lifecycle state.
   Lease renewals do not create ordinary Git history; optimistic concurrency is
   the final stale-write guard.
7. Final HTML is derived. Only the latest report resides in the student
   repository; publication history remains in the course/admin repository.

## 7. Relationship lifecycle and historical rights

Faculty and coordinator assignments use intervals with an explicit ending
outcome rather than destructive replacement:

```mermaid
stateDiagram-v2
    [*] --> Current
    Current --> RemovedMidTerm: explicit removal
    Current --> CompletedNormally: term archives with role intact
    RemovedMidTerm --> Current: new explicit assignment
    CompletedNormally --> Current: new explicit assignment in another term/section
```

`RemovedMidTerm` retains read-only historical visibility but no continuing
mutation authority. `CompletedNormally` preserves the approved Archived-term
grading/regrading/publication rights in the relationship's historical scope.
Neither state grants access to future terms. A new assignment creates a new
interval; it does not erase or reopen the old historical record.
