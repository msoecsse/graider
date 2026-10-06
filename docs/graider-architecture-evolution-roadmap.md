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

# Phase 1 — Foundational Remote and Packaging Abstractions

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
is the next architectural task.

## Slice 1.2 — Embedded/bundled Git engine proof

Select and validate the implementation that eliminates the system-Git prerequisite.

Acceptance must include:

- macOS Apple Silicon packaged build;
- Windows x64 packaged build;
- private GitHub clone/fetch/push;
- repositories containing normal course/student project sizes;
- paths with spaces;
- no shell Git dependency.

This deserves an explicit technical spike before widespread refactoring.

Engine selection and packaged cross-platform/private transport proof are complete: native macOS
arm64 and Windows x64 packaged jobs passed the explicitly gated private GitHub clone, fetch, push,
verification, and delete proof. Production integration and cutover from `SystemGitWorkspace` remain
in progress in Phase 1.2C; Phase 1.2 is not complete.

## Slice 1.3 — GitHub host abstraction cleanup

Separate GitHub API behavior from local Git transport.

Centralize:

- authentication;
- repository metadata;
- immutable IDs;
- organization/team operations;
- permission operations;
- branch rules;
- Actions;
- release metadata.

Do not implement GitLab.

---

# Phase 2 — First-Class Authentication

## Slice 2.1 — Browser-based GitHub sign-in

Replace normal packaged-app dependence on:

- `GRAIDER_GITHUB_TOKEN`;
- `gh auth token`;
- GitHub CLI setup.

Implement one active GitHub account.

## Slice 2.2 — Secure credential persistence

Store credentials in the OS secure credential facility.

Test:

- restart;
- sign out;
- switch account;
- revoked credential;
- reauthentication;
- token redaction.

## Slice 2.3 — Identity-scoped local application state

Namespace:

- course cache;
- hidden-course preferences;
- student clone mappings;
- default repository roots;

by authenticated GitHub user ID.

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

Replace grading-only faculty scoping with a reusable authorization service.

It must answer both:

- what the faculty member may see;
- what mutation they may perform.

This should become the shared trust boundary for Electron services.

## Slice 6.6 — Remove grader role

Remove:

- grader-team configuration;
- grader permission path;
- grader-specific planning/execution behavior.

Anyone who grades is section faculty.

---

# Phase 7 — GitHub Desired-State Permission Model

## Slice 7.1 — Managed team identities

Define stable managed-team metadata for:

- course read;
- course write;
- current coordinators;
- term current/former coordinators;
- section current/former faculty.

Do not depend solely on human-readable team names to recognize managed teams.

## Slice 7.2 — Faculty organization invitation

Adding faculty records intended organization membership and supports Pending invitation.

## Slice 7.3 — Team membership reconciliation

Course config becomes authoritative for managed team membership.

## Slice 7.4 — Course repository permissions

Reconcile read/write/admin permissions according to strongest effective course role.

## Slice 7.5 — Student repository permissions

Reconcile:

- section current faculty → admin;
- term coordinator → admin;
- historical/former → required read access.

## Slice 7.6 — Managed branch rules

Apply course and student branch protections.

---

# Phase 8 — Term Lifecycle

## Slice 8.1 — Draft / Active / Archived model

Implement lifecycle validation and exactly-one-Active invariant.

## Slice 8.2 — Draft-term preparation permissions

Allow preparatory configuration while blocking student-facing operations.

## Slice 8.3 — Atomic activation

Activation performs:

- old Active → Archived;
- new Draft → Active;
- authorization/team desired-state transition.

## Slice 8.4 — Term archival restrictions

Freeze ordinary structural edits while preserving grading/regrading.

## Slice 8.5 — Draft deletion and activation recovery

Implement:

- safe Draft deletion;
- pre-student-activity activation rollback;
- explicit recovery once student-facing state exists.

## Slice 8.6 — Course archive/unarchive

Require no Active or Draft terms before archive.

---

# Phase 9 — Existing-Course Migration

Now that:

- updater exists;
- schema v2 exists;
- authorization exists;
- team reconciliation exists;

migration can safely ship.

## Slice 9.1 — Migration analyzer

Read schema-v1 course and produce a non-mutating migration report.

Identify:

- faculty identities;
- unresolved identities;
- terms;
- required coordinator selections;
- assignment owners;
- deadlines;
- manifests;
- grader configuration.

## Slice 9.2 — Migration review UI

Require explicit confirmation for:

- fallback administrator;
- ambiguous faculty identities;
- coordinators where not inferable.

## Slice 9.3 — Assignment migration

Convert:

- `faculty_owner` → owner array;
- shared deadline → per-section deadline;
- existing manifest → section apply state;
- incomplete Apply → Needs attention.

## Slice 9.4 — Grader removal

Remove obsolete configuration and reconcile GitHub teams.

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

The first implementation work should **not** be schema migration.

Start with:

1. commit the architecture/specification;
2. define the schema-v2 logical model and authorization matrix;
3. establish the local Git and GitHub host abstractions;
4. prove packaged Git operation without system Git;
5. implement first-class authentication;
6. establish signed release/update infrastructure;
7. then build remote course discovery/synchronization.

That sequence gives Graider the deployment and compatibility foundation needed before any production course repository is irreversibly migrated.
