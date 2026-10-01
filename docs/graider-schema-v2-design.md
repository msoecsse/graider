# Graider Schema v2 Logical Design

**Status:** implementation-facing design contract; not an executable schema

**Authority:** [remote course architecture](graider-remote-course-architecture.md) and
[evolution roadmap](graider-architecture-evolution-roadmap.md)

## 1. Purpose and boundaries

Schema v2 describes durable Graider domain state in the private course/admin
repository. It deliberately does not prescribe Zod declarations, exact YAML
versus JSON boundaries, or one file per structure. The
[repository layout](graider-repository-layout-v2.md) defines required logical
separations and an illustrative physical layout.

In this document:

- a **canonical immutable identifier** is the value used to join records and
  survive renames;
- **mutable display metadata** may be refreshed without changing identity;
- **lifecycle state** controls allowed operations;
- **history** is append-only or interval-based and is not replaced by the
  current value; and
- **derived/transient state** is recomputed or machine-local and does not belong
  in the durable course schema.

## 2. Identity conventions

| Concept             | Canonical identity                                                                                                 | Mutable metadata                                                                | Never use as canonical identity           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Course              | Immutable GitHub course/admin repository ID                                                                        | Course title, repository name, organization name                                | Local path, repository name, course title |
| Faculty             | Immutable GitHub user ID                                                                                           | Current GitHub username; institutional username if institution metadata changes | GitHub username alone                     |
| Student             | Institutional student ID within the course record; resolved GitHub account is anchored by immutable GitHub user ID | Current GitHub username and roster display data                                 | GitHub username alone                     |
| Term                | Term code within a course; immutable after activation                                                              | Display name and academic metadata                                              | Folder path                               |
| Section             | Section ID within a term; immutable after activation                                                               | Display label and roster path/layout                                            | Faculty username                          |
| Assignment          | Assignment slug within a term; immutable after activation                                                          | Title                                                                           | Filesystem path                           |
| Student repository  | Immutable GitHub repository ID                                                                                     | Owner/name, URLs, default branch                                                | Repository name alone                     |
| Template repository | Immutable GitHub repository ID when resolvable                                                                     | Owner/name, configured branch                                                   | Owner/name alone                          |
| Revision            | Stable revision identifier for the shared assignment definition                                                    | Description and author/timestamp history                                        | File modification time                    |

Course code becomes immutable after the first term becomes Active. Term code,
section ID, and assignment slug become immutable when their respective
operational lifecycle begins as specified above. Exact serialization and
revision-ID generation are implementation decisions; implementations must make
revision comparison deterministic.

## 3. Course root

The course root carries the schema version, canonical remote identity, display
metadata, lifecycle, recovery authority, and organization association.

```yaml
schema_version: 2
course:
  repository_id: 123456789 # immutable GitHub repository ID
  code: CSC1120 # immutable after first activation
  title: Software Development II
  repository:
    organization: msoe-example # mutable locator metadata
    name: csc1120-admin
  lifecycle: unarchived # unarchived | archived
  fallback_administrator_github_user_id: 24680
  organization_binding:
    organization_id: 97531 # when available from GitHub
    organization_login: msoe-example
```

Archive is shared remote state. A user's hide/show preference is machine-local
and must not appear here.

Organization migration is orthogonal to course archive state. A course may
also have durable reconciliation state such as `migration_required` or
`migration_incomplete`; this must not replace its archive lifecycle field.

### Fallback administrator

The fallback administrator is a reference to exactly one persistent faculty
identity. Transfers must retain a domain-level history event with actor,
timestamp, previous administrator, new administrator, and recovery/normal
transfer reason. This role provides recovery and course lifecycle authority;
it does not imply section visibility or grading authority.

## 4. Persistent faculty directory

The directory retains every faculty identity ever associated with the course.
Removing all current roles never deletes its identity record.

```yaml
faculty:
  - github_user_id: 24680
    institutional_username: jones
    github_username: jones-now
    github_identity_history:
      - username: jones-old
        observed_from: 2025-01-10T15:00:00Z
        observed_until: 2026-03-01T18:00:00Z
      - username: jones-now
        observed_from: 2026-03-01T18:00:00Z
    lifecycle: current
```

- **Immutable:** GitHub user ID.
- **Mutable:** current GitHub username and other display metadata.
- **Historical:** username/account observations and domain role intervals.
- **Lifecycle:** a directory-level current/historical marker may aid display,
  but authorization is derived from role records, not this marker.
- **Not durable here:** OAuth tokens, current sign-in session, invitation polling
  status that can be read from GitHub, or computed effective permissions.

An actual change to a different GitHub account is not a username update. The
approved requirements define explicit account replacement for students but do
not define an equivalent faculty replacement workflow. Schema v2 must not
silently merge two faculty GitHub user IDs; handling a faculty account
replacement remains an implementation/product decision.

## 5. Terms, coordinators, and sections

### 5.1 Term

```yaml
term:
  code: 27s1
  display_name: Spring 2027
  academic_year: 2027
  semester: 1
  lifecycle: draft # draft | active | archived
  has_ever_been_active: false
  coordinators:
    - faculty_github_user_id: 24680
      from: 2026-10-01T14:00:00Z
      until: null
      end_reason: null
```

Coordinator relationships are interval/history records. Closing an interval
does not erase the former coordinator. `end_reason` must distinguish removal
during an active term from normal completion/archival because their later
rights differ. An equivalent explicit outcome field is acceptable.

`has_ever_been_active` (or an equivalent irreversible lifecycle event) is
durable because it prevents a formerly Active term from being treated as a
deletable Draft after recovery.

Exactly one term is Active. Activation rollback/checkpoint information is
durable only while recovery is possible or required; the normal term lifecycle
does not need a permanent rollback enum. See the
[lifecycle models](graider-lifecycle-state-models.md).

### 5.2 Section and faculty relationships

```yaml
sections:
  - id: "001"
    display_name: Section 001
    faculty_assignments:
      - faculty_github_user_id: 24680
        from: 2027-01-03T14:00:00Z
        until: null
        end_reason: null
      - faculty_github_user_id: 13579
        from: 2027-01-03T14:00:00Z
        until: 2027-02-15T17:00:00Z
        end_reason: removed_mid_term
```

- The section ID is canonical within its term and immutable once the term is
  Active.
- Current section faculty have open relationship intervals.
- Former faculty remain represented with closed intervals and an outcome that
  differentiates mid-term removal from normal term completion.
- GitHub invitation/reconciliation status may be attached to the intended
  relationship when external work is pending, but observed GitHub membership
  is not authorization truth.
- Effective course/team permissions are derived from all current and historical
  roles and are not duplicated as authoritative fields.

## 6. Students, enrollment, and GitHub identity

A roster entry uses the institutional student ID as its stable academic
identity and retains enrollment history rather than replacing prior section
membership.

```yaml
students:
  - student_id: adams
    display_name: Ada Adams
    enrollment_history:
      - section_id: "001"
        from: 2027-01-03T14:00:00Z
        until: null
        status: active
    github_identity:
      current:
        github_user_id: 86420
        username: ada-now
      history:
        - github_user_id: 75310
          username: ada-old-account
          from: 2027-01-03T14:00:00Z
          until: 2027-02-20T16:00:00Z
          replacement_reason: faculty_confirmed_replacement
```

A GitHub username rename updates metadata for the same immutable GitHub user
ID. A genuinely different account requires an explicit, attributed replacement
event. Repository and grading identities remain attached to the student, not
to either username. Ambiguous identity is stored as unresolved/Needs attention,
not guessed.

Dropped/inactive state, prior section membership, and section-transfer
provenance are durable. Current enrollment and eligible provisioning targets
are derived from the latest applicable records.

## 7. Shared assignment definition

Assignments are term-scoped and separate shared academic definition from
section operations.

```yaml
assignment:
  slug: lab04
  title: Linked Structures
  lifecycle: active # draft | active | archived
  has_ever_been_active: true
  owners:
    - faculty_github_user_id: 24680
  revision: rev-0007
  definition:
    type: individual
    points: 100
    required_files: [src/LinkedList.java]
    rubric: []
    grading: {}
  template:
    repository_id: 11223344
    owner: msoe-example
    name: lab04-template
    branch: main
    pinned_commit_sha: abcdef0123456789
  template_file_rules:
    - pattern: ".github/**"
      classification: instructor_managed
    - pattern: "src/**"
      classification: student_editable
```

### Ownership and history

Owners are references to faculty GitHub user IDs. The creator is the initial
owner; owners may be added or removed. Owner changes, lifecycle changes, and
meaningful definition revisions have faculty-facing history containing actor,
timestamp, event type, and relevant before/after details. Git history remains
the underlying record but is not a substitute for this domain history.

An ownerless migrated assignment is valid only as a repair-required state. It
cannot be edited, copied, activated, archived, or otherwise managed normally
until a term coordinator assigns an owner.

### Assignment revision

Every meaningful shared-definition change produces a new assignment revision.
The durable record must allow sections to compare their applied revision with
the current revision and must retain enough history to explain the change.
Whether the revision identifier is a sequence, content digest, or another
stable token is intentionally undecided.

Template repository identity and the pinned commit SHA are durable. A branch is
a monitoring locator; the assignment never silently follows it. File rules are
ordered, have explicit precedence, and classify paths as
`instructor_managed`, `student_editable`, or `unclassified`. Unmatched files
receive the safe Student-editable behavior.

## 8. Per-section assignment operational state

Each section has separately addressable state for each Active assignment.

```yaml
section_id: "001"
assignment_slug: lab04
usage: using # available | using | not_using
schedule:
  due_at: 2027-02-12T23:59:00-06:00
  late_policy: "Accepted with notation"
apply:
  provisioning: complete # not_started | in_progress | complete | incomplete
  applied_revision: rev-0006
  applied_template_commit_sha: abcdef0123456789
  review:
    revision: rev-0007
    disposition: pending # pending | keep_current | adopted
  repository_results: []
  file_distribution: []
```

This is deliberately multidimensional. `Update available`, `Reviewed/keep
current revision`, `Partially updated`, and `Apply incomplete/Needs attention`
are projections of usage, provisioning, revision comparison, review decision,
and per-repository/file outcomes; they need not be one monolithic enum.

Required durable facts include:

- section usage choice, including Not using;
- section due date/time and informational late policy;
- whether provisioning ever created repositories;
- applied assignment revision and template revision/baseline;
- actual per-repository and file-level results for partial work;
- review/keep-current acknowledgement for a specific newer revision; and
- interrupted operation/checkpoint information needed to resume or reconcile.

`Not using` is prohibited after provisioning exists. Changing due date or late
policy neither changes `applied_revision` nor modifies student repositories.
Adopting a shared template revision changes the assignment definition only;
selective propagation to student repositories is a separate, reviewed action.

## 9. Provisioned repository and Apply records

Manifest v2 repository records are a useful starting point. Schema v2 retains:

- immutable repository ID and mutable owner/name/URL;
- section and student/group target mapping;
- repository lifecycle and student-access state;
- exact template commit and student default-branch baseline;
- actual distribution results and unresolved conflicts;
- meaningful operation history and diagnostics needed for recovery.

Observed GitHub state, retry counters, live progress percentages, and API
responses are transient unless needed as a reconciliation checkpoint. A failed
multi-system operation persists intended desired state and a concise
Pending/Needs attention record; it does not persist credentials or raw API
payloads.

## 10. Grading state and publication

Canonical grading identity is:

```text
term + assignment + section + student
```

For groups it is:

```text
term + assignment + section + group
```

The record is self-describing and retains student/group identity, selected
submission commit SHA, status, grading decisions, applied-comment snapshots,
manual adjustments, durable view state where required by the grading spec,
optimistic-concurrency version, and append-only mutation history.

Group membership is section-local. Cross-section groups are invalid. A group
grading record may carry per-student adjustments without duplicating the group
result. Section transfers retain origin provenance and never implicitly move a
whole group.

Publication history is separate from the latest status and includes submission
commit, grading revision/version, faculty actor, timestamp, score/status, and
student-repository report result. Republishing appends history while replacing
only the current derived report in the student repository.

Do not persist as canonical grading data:

- rendered HTML reports;
- calculated totals that can be deterministically projected;
- GitHub Actions evidence or commit history merely because it was viewed;
- combined Monaco source documents; or
- grading claims/lease renewals.

Claims are ephemeral GitHub-backed coordination plus optimistic concurrency and
must not create ordinary course Git history.

## 11. Shared reusable comments

The comment library is a course-level shared resource. Each reusable comment
has a stable comment ID, content/defaults/tags, an owner identified by immutable
faculty GitHub user ID, and mutation history. Ownership controls normal
edit/delete rights; term coordinators may manage any shared comment.

Applied student comments remain immutable snapshots of the values used. A
library edit or deletion never rewrites applied comments. Historical-only
faculty may use existing comments during authorized historical grading but may
not mutate the current library.

## 12. Managed GitHub metadata

Persist only metadata needed to recognize and reconcile Graider-managed
resources without relying on display names:

- stable GitHub team IDs and their managed purpose;
- associated course/term/section identity;
- desired role/membership source;
- last verified reconciliation checkpoint or pending/Needs attention summary;
- immutable IDs of repositories involved in migration.

Human-readable team slugs/names are mutable locators. Effective permissions and
live memberships are derived by comparing schema desired state with GitHub.
Unrelated organization teams must never be represented as Graider-managed.

## 13. Organization migration and reconciliation

Repository/organization rename under the same course/admin repository ID is a
normal metadata refresh. Moving to another organization is explicit migration.
Persist enough state to represent:

- `migration_required` after an un-reconciled transfer;
- migration plan/source/destination identities;
- checkpointed verified steps;
- `migration_incomplete` and actionable discrepancies; and
- completed reconciliation history.

Normal mutations are blocked while migration is required or incomplete. Raw
scans and temporary API results are transient; verified checkpoints are durable
so execution can resume safely.

## 14. Explicitly derived or machine-local state

The following do not belong in the durable course schema:

- local managed-clone path and faculty-selected student repository root;
- hidden/show-archived dashboard preferences;
- current OAuth token or authentication session;
- computed current/historical authorization matrix;
- current GitHub team membership observations;
- course synchronization progress;
- template-update availability (derived from branch head versus pinned SHA);
- late/on-time label and amount late (derived from selected commit and due date);
- assignment `Update available` label (derived from revision fields);
- local dirty/diverged status;
- unsaved editor text; and
- grading claim leases.

Machine-local values are namespaced by the authenticated immutable GitHub user
ID and, where applicable, immutable course/admin repository ID.

## 15. Deferred integration seams

The durable concepts above preserve future mapping points for a learning
management system: course, term, section, institutional student identity,
assignment, section schedule, grade, and publication. Schema v2 does not define
Canvas credentials, API payloads, synchronization rules, or product behavior.
Likewise, GitHub is the implemented remote host; this design does not introduce
a speculative GitLab/provider schema.

## 16. Superseded schema-v1 concepts

| Schema v1 concept                                                  | Schema v2 treatment                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Local manually registered course folder                            | Replaced by remote discovery and identity-scoped app-managed course clone; legacy clone is left untouched |
| `course.repository`/organization/name as identity                  | Immutable course/admin repository ID is canonical; names are locators                                     |
| Local institutional username as authorization identity             | Persistent faculty directory anchored to immutable GitHub user ID                                         |
| `sections[].faculty: string[]`                                     | Current/former interval-based section faculty relationships                                               |
| No coordinator history                                             | Current and former term coordinator relationships with outcome/history                                    |
| `metadata.faculty_owner`                                           | Multiple assignment owners by immutable faculty identity                                                  |
| Assignment `sections[]` as operational truth                       | Active assignments are available term-wide; each section stores usage/Apply state                         |
| Assignment-level `deadline`                                        | Per-section due date and late policy                                                                      |
| Assignment status including `closed`                               | Draft/Active/Archived lifecycle; exact legacy `closed` migration requires review                          |
| Template repository name/branch only                               | Immutable repository ID where resolvable plus pinned commit SHA and monitored branch                      |
| `grader_team` / `grader_permission` and manifest grader permission | Removed; graders must be section faculty                                                                  |
| Grading identity `assignment + student`                            | `term + assignment + section + student/group`                                                             |
| Username-only student repository mapping                           | Immutable GitHub user and repository IDs with current-name metadata/history                               |
| Git history as sufficient audit                                    | Domain-level assignment, grading, publication, identity, and administrative history                       |

Detailed conversion rules are in the
[schema-v2 migration decision table](graider-schema-v2-migration.md).
