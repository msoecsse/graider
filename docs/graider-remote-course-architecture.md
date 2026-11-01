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
- the schema still contains optional grader-team configuration;
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
- there is no unresolved Draft term.

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
- coordinators of the most recent term.

The same authorities may unarchive it.

Unarchiving does not reactivate an old term.

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

A normal transfer may be performed by the current fallback administrator.

If that administrator is unavailable:

- a current-term coordinator may initiate recovery;
- when multiple current coordinators exist, another coordinator confirms the transfer;
- when only one coordinator exists, that coordinator may complete the recovery alone.

---

## 9. Term Lifecycle

Terms have the lifecycle:

**Draft → Active → Archived**

Exactly one term may be Active at a time.

A future Draft term may be prepared while the current term remains Active.

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

- faculty assigned to the Draft term;
- future coordinators of that Draft term;
- coordinators of the currently Active term;
- course fallback administrator.

### 9.2 Active

Activation is explicit.

Dates may inform faculty but never activate a term automatically.

Activation authority belongs to:

- a coordinator of the currently Active term; or
- the course fallback administrator.

For the initial term, the fallback administrator provides activation authority.

Activation is atomic:

1. the previous Active term becomes Archived;
2. the selected Draft term becomes Active;
3. new coordinator/faculty permissions take effect;
4. dashboards and normal workflows switch to the new Active term.

There must never be two Active terms.

### 9.3 Archived

An Archived term is structurally frozen for ordinary faculty.

Faculty who taught the term may still:

- grade;
- regrade;
- publish/re-publish reports;
- inspect historical repositories and state.

Ordinary faculty may not change:

- section structure;
- roster structure;
- assignment structure;
- deadlines;
- faculty assignments.

Term coordinators or the fallback administrator may make exceptional corrective administrative changes.

### 9.4 Delete and rollback

A Draft term that has never been Active may be deleted.

Deletion authority:

- current-term coordinator;
- fallback administrator;
- if no Active term exists, a coordinator of the Draft term.

A term that has ever been Active is normally Archived, not deleted.

Advanced users may manually delete old archived term data from GitHub as intentional permanent cleanup. Graider treats that remote deletion as authoritative.

A mistaken activation may be rolled back through a special recovery action only if the newly activated term has had no student-facing activity.

Once student-facing activity exists, a more explicit recovery workflow is required.

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

Coordinating one term does not grant authority over future terms.

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

Graider does not assign individual students to individual graders.

Shared grading state records attribution and uses grading claims to avoid concurrent edits.

### 10.4 Former section faculty

If faculty are removed from a section during an Active term:

- the historical assignment is retained;
- future mutation authority ends immediately;
- they retain read-only historical access to that section.

If they remain assigned through the normal end of the term, Archived-term grading/regrading rights remain available.

### 10.5 Former coordinators

A coordinator removed during an Active term:

- immediately loses coordinator mutation authority;
- retains read-only historical access to the entire term they previously coordinated;
- retains stronger rights only where another active role independently grants them.

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

- legacy `grader_team` / `grader_permission` fields are removed;
- no grader-specific authorization survives migration;
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
3. Exactly one term may be Active.
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

Schema v2 initially retains every v1 course field, including grading, reports,
notifications, and transitional faculty/grader teams, and adds:

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

Next slice: **6.5 — Unified Authorization Resolver**. Compose independent section,
coordinator, and fallback identities without login fallback; historical access and
permission decisions remain unimplemented, and production activation stays gated.
