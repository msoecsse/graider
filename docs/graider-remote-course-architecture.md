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
