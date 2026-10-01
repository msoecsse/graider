# Graider Repository and Local-Storage Layout v2

**Status:** logical layout contract; exact serialization remains an implementation decision

**Authority:** [remote course architecture](graider-remote-course-architecture.md)

**Related:** [schema-v2 design](graider-schema-v2-design.md),
[migration decisions](graider-schema-v2-migration.md)

## 1. Storage classes

Graider v2 has three deliberately different storage models:

| Storage class           | Owner and synchronization                                                                                    | Purpose                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Course/admin repository | Private GitHub repository; automatically discovered, cloned, and synchronized in Graider-managed app storage | Authoritative course configuration, authorization history, assignment/section operations, grading state, and audit history |
| Student repositories    | GitHub repositories plus explicit faculty-managed local downloads                                            | Student work, repository history, and latest published report                                                              |
| Template repositories   | Normally GitHub-hosted and separately prepared by faculty                                                    | Pinned assignment source and reviewed later corrections                                                                    |

Filesystem paths are local locators only. They are never canonical identities.

## 2. Course/admin repository

### 2.1 Illustrative logical tree

```text
course.yml

.graider/
  faculty.yml
  comments.json
  managed-github.yml
  reconciliation.yml
  history/
    course-events.jsonl
    comment-events.jsonl

terms/
  <term-code>/
    term.yml
    sections/
      <section-id>/
        section.yml
        roster.csv
        roster-history.yml
    assignments/
      <assignment-slug>/
        assignment.yml
        history.jsonl
        sections/
          <section-id>.yml
        apply/
          <section-id>/
            manifest.json
            operations.jsonl
    grading/
      <assignment-slug>/
        sections/
          <section-id>/
            <student-id>.json
            groups/
              <group-id>.json
        history/
          <section-id>/
            <student-or-group-id>.jsonl
        publications/
          <section-id>/
            <student-or-group-id>.jsonl
    history/
      term-events.jsonl
```

This tree is illustrative. It does not require each conceptual record to be a
separate file and does not settle YAML versus JSON versus JSON Lines. The
implementation may colocate small records when authorization boundaries,
history preservation, deterministic updates, and merge behavior remain clear.

### 2.2 Required logical placement and separation

| State                             | Required logical scope                                         | Separation requirement                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `course.yml`                      | Course root                                                    | Must expose schema version, immutable course/admin repository ID, course metadata, archive state, organization binding, and fallback-administrator reference |
| Faculty identity directory        | Course                                                         | Must persist immutable GitHub user IDs, current usernames, identity history, and every faculty identity ever associated with the course                      |
| Term configuration                | Term                                                           | Must separate Draft/Active/Archived lifecycle, coordinator history, and term metadata from other terms                                                       |
| Section and roster data           | Term + section                                                 | Must permit section-scoped authorization and preserve enrollment/faculty history                                                                             |
| Shared assignment definition      | Term + assignment                                              | Must be separately addressable from every section's operational state                                                                                        |
| Section assignment state          | Term + assignment + section                                    | Must independently carry usage, schedule, Apply/provisioning, applied revision, review, and distribution results                                             |
| Apply manifest/revision state     | Term + assignment + section, with per repository/target detail | Must preserve immutable repository IDs, template/baseline provenance, partial outcomes, and recovery state                                                   |
| Canonical grading state           | Term + assignment + section + student/group                    | Must use the canonical paths below and remain private to the admin repository                                                                                |
| Grading audit/publication history | Same grading identity                                          | Must survive replacement of the latest student-facing report and be faculty-facing rather than raw Git-only history                                          |
| Shared reusable comments          | Course                                                         | One shared library, with owner and mutation history; applied comments remain grading-record snapshots                                                        |
| Managed GitHub metadata           | Course, term, or section according to resource purpose         | Persist stable team/repository IDs and managed purpose, not merely names                                                                                     |
| Migration/reconciliation metadata | Course                                                         | Persist only plans, verified checkpoints, unresolved discrepancies, and history needed to resume safely                                                      |

The canonical individual grading path is:

```text
terms/<term>/grading/<assignment>/sections/<section>/<student>.json
```

The canonical group grading path is:

```text
terms/<term>/grading/<assignment>/sections/<section>/groups/<group>.json
```

Both records are self-describing and repeat their path identities. Group
membership remains within one section. Per-student adjustments to a group
result may live in the group record or a clearly linked child representation;
the exact choice is not fixed here.

### 2.3 Assignment and Apply layout

The important boundary is equivalent to:

```text
terms/<term>/assignments/<assignment>/assignment.yml
terms/<term>/assignments/<assignment>/sections/<section>.yml
```

`assignment.yml` contains the shared academic definition, owners, lifecycle,
current assignment revision, template repository and pinned commit, and ordered
template file-management rules. It does not contain a single shared deadline
or a list that substitutes for section operational state.

The section state contains its due date/late policy, Available/Not using choice,
provisioning history, applied assignment revision, update-review decision, and
actual selective-distribution results. A manifest may remain a separate file
when it is large; logically it belongs to that section's Apply history.

A shared assignment edit or template-pin update changes only the course/admin
repository. It may make sections show **Update available**, but it never
silently writes student repositories.

### 2.4 Durable versus ephemeral repository state

Durable course/admin state includes grading decisions and history, but excludes:

- OAuth tokens;
- current GitHub API responses and sync progress;
- machine-local paths or hidden-course preferences;
- dirty/divergent local-working-copy observations;
- combined grading source documents and unsaved editor text;
- derived reports other than publication metadata; and
- active grading claim leases.

Claims use a GitHub-backed advisory mechanism plus optimistic concurrency, but
lease renewal must not create ordinary course-history commits. The exact
GitHub coordination mechanism is intentionally deferred to its roadmap spike.

## 3. App-managed local course storage

### 3.1 Identity namespacing and lookup

Local application state is namespaced first by the authenticated immutable
GitHub user ID. Within that namespace, a managed course is looked up by the
immutable GitHub course/admin repository ID.

An illustrative, platform-neutral layout is:

```text
<graider-app-data>/
  identities/
    <github-user-id>/
      courses/
        <course-admin-repository-id>/
          working-copy/
          local-state.json
      preferences.json
      student-repository-locations.json
```

The actual OS application-data root and encoding of numeric/string IDs are
implementation decisions. No architecture or deep link may depend on this
illustrative path.

`local-state.json` may hold machine-local synchronization and display
preferences, but it is not authoritative course data. OAuth credentials live
only in the operating-system secure credential store, not this tree.

### 3.2 Synchronization behavior

After sign-in Graider discovers and automatically clones every authorized
course/admin repository, including current, archived, historical, shared, and
locally hidden courses. The managed working copy is a synchronized cache of the
remote authority.

Synchronization occurs at startup/authentication, periodically while open,
before and after mutations, and when discovery/deep-link resolution needs it.
Clean fast-forwards are automatic. Unexpected manual local edits are never
overwritten: Graider validates them and offers review/publish or surfaces
Needs attention. Uninterpretable conflicts preserve both sides and block the
affected mutation.

Neither of these controls clone existence or background synchronization:

- shared remote course archive state; or
- machine-local hide/show state.

Signing out normally retains the identity-scoped cache. An explicit **Remove
Graider data from this computer** action removes local app data under its own
safety/confirmation workflow; it does not delete remote repositories.

### 3.3 Renames and migration

A repository or organization rename that preserves the immutable
course/admin repository ID updates remote locator metadata and the managed
clone remote. It does not create a new local course identity.

A transfer to a different organization invokes migration/reconciliation and
may block normal mutations. The managed course key remains the immutable
repository ID; organization name is not substituted for it.

## 4. Faculty-managed student repository storage

Student repositories are never cloned merely because a course/admin repository
was discovered.

Each authenticated identity chooses a default root per course and machine. A
conceptual organization beneath it is:

```text
<faculty-selected-root>/
  <term>/
    <assignment>/
      <student-or-group-repositories>/
```

Term and assignment directory names are organizational conveniences, not
canonical identity. Graider stores the actual local path mapped to each
immutable student repository ID. Faculty may register an existing clone at any
location after Graider verifies its remote repository identity. Changing the
default root affects future downloads immediately and may optionally move
existing clean clones; dirty clones remain in place.

### 4.1 Explicit download and safe update rules

- Graider shows how many repositories are available locally.
- Faculty explicitly downloads all missing or selected repositories.
- Graider does not automatically clone all student repositories.
- Before repository-dependent work, a clean clone may fetch and fast-forward
  automatically.
- A dirty clone is not modified and shows **Local changes detected**.
- A divergent or conflicting clone shows **Needs attention**.
- Graider never automatically resets, discards, or overwrites faculty changes.

**Remove local copy** affects only the selected local student clone. Dirty
repositories block normal removal. A separate explicit confirmed discard
action is required to remove a dirty clone. Neither action deletes GitHub state.

### 4.2 Repository continuity

Repository mappings use immutable GitHub repository IDs. Student username,
repository, or organization renames refresh metadata without changing identity.
Section transfers retain repository IDs and history; grading state moves to the
destination section path with origin provenance. Existing group repositories
remain in their original section and never become cross-section groups.

## 5. Template repositories

Faculty prepare templates separately. Graider does not create a template as
part of assignment creation and does not automatically clone templates into
the app-managed course cache.

Templates normally remain GitHub-hosted. An assignment persists the template's
immutable repository ID where resolvable, mutable owner/name locator, monitored
branch, and pinned commit SHA. External templates are allowed explicitly and
remain externally permission-managed.

A specific preview, comparison, initial Apply, or selective-update operation
may use a temporary or explicitly managed local Git working area. Such a
working area is an implementation detail, must be cleaned/reconciled safely,
and does not turn templates into automatically persistent course clones.

## 6. Stable deep links

Course deep links identify the course by immutable course/admin GitHub
repository ID:

```text
graider://course/<repository-id>/term/<term-code>/assignment/<slug>
```

Opening a deep link authenticates the current GitHub identity, discovers or
synchronizes the course if needed, validates authorization, and then resolves
the term/assignment. Unauthorized users receive an access error.

Deep links never encode:

- a course/admin clone path;
- a faculty-selected student repository root;
- a student clone path;
- a repository or organization name as the ultimate course key; or
- a machine-specific account namespace.

Term code and assignment slug are stable route segments only within the
identified course and their immutability rules.

## 7. Legacy layout coexistence

Migration to v2 creates/uses a new app-managed clone. A legacy manually
registered course clone is not deleted, reset, repointed, or otherwise mutated
merely because Graider adopts managed storage. Faculty may inspect or remove it
independently after verifying the new managed course. The v2 application must
not use legacy folder registration as canonical course discovery.
