# Graider Grading Module Specification

**Status:** Draft specification for implementation  
**Scope:** Grading workflow, grading-state persistence, report publication, faculty section access, shared comment library, and optional IntelliJ student-package generation  
**Out of scope for this specification:** Full Canvas implementation, global UI redesign, automatic/background grading

---

## 1. Purpose

The Graider grading module supports the complete faculty grading workflow after student repositories have already been pulled locally by Graider.

The module should remain deliberately simple. It is not an IDE, a document-management system, or a separate grading application. Graider provides:

- a fast, read-only source viewer;
- grading comments and annotations;
- a live rubric and score;
- grading evidence from GitHub Actions;
- recent commit history;
- persistent grading state;
- final report generation and publication.

The final HTML grading report is **derived output**. Persisted grading state is the source of truth.

---

## 2. Core Principles

1. Student source code is never modified while grading.
2. Monaco Editor provides the source-viewing experience.
3. All configured required source files are visible in one continuous grading view.
4. Grading comments and annotations belong to Graider, not the student's files.
5. Scores are calculated dynamically from rubric categories, applied comment deductions, and manual rubric adjustments.
6. JUnit and Checkstyle results are informational evidence only and never deduct points automatically.
7. Grading state autosaves continuously.
8. HTML reports are generated only when publishing.
9. Faculty see only students belonging to sections assigned to them.
10. MSOE usernames are canonical human-facing identities for both students and faculty.
11. The architecture must remain minimal. Do not introduce additional runtimes, databases, deep abstraction layers, or duplicated representations without a demonstrated requirement.
12. Existing Graider Git/GitHub functionality should be reused rather than reimplemented.

---

## 3. Scope

### 3.1 Included

The grading module provides:

- preparation of locally available student submissions for grading;
- retrieval of grading workflow results from GitHub Actions;
- retrieval of recent commit history;
- a Monaco-based grading viewer;
- a shared course comment library;
- creation, editing, deletion, searching, and filtering of reusable comments;
- source-anchored and general grading comments;
- editing and deletion of already-applied student comments;
- live rubric calculations;
- manual rubric adjustments;
- persistent grading state and editor view state;
- keyboard-first grading;
- completion tracking;
- HTML report generation;
- selective or bulk publication of reports to student repositories;
- a future integration point for Canvas grade submission;
- optional generation of IntelliJ-ready student package collections.

### 3.2 Not Included Initially

The grading module does **not**:

- edit student source code;
- locally rerun JUnit or Checkstyle;
- automatically assign deductions from JUnit or Checkstyle;
- maintain a grading database;
- require a Java sidecar application;
- generate HTML or Markdown report drafts while grading;
- submit Canvas grades yet;
- provide a full IDE experience;
- perform automatic/background grading.

---

## 4. Identity and Faculty Access

### 4.1 Faculty Identity

Each faculty member is identified by their **MSOE username**.

Graider stores/configures the current faculty user's MSOE username once in local application settings.

GitHub identity must not be used as the faculty identity.

### 4.2 Student Identity

`student_id` remains the canonical MSOE student username.

`github_username` is used only for GitHub-specific operations such as repository mapping, URLs, permissions, and API calls.

### 4.3 Faculty-to-Section Mapping

Faculty access is configured at the **term/section level**, not the assignment level.

Conceptually:

```yaml
sections:
  - id: "001"
    roster: rosters/001.csv
    faculty:
      - jones

  - id: "002"
    roster: rosters/002.csv
    faculty:
      - smith

  - id: "003"
    roster: rosters/003.csv
    faculty:
      - jones
      - smith
```

Rules:

- one faculty member may teach multiple sections;
- one section may have multiple faculty members;
- one assignment may be shared by many sections and faculty;
- a faculty member sees only students in sections assigned to their MSOE username;
- co-faculty assigned to the same section see the same students and grading state;
- assignment metadata such as `faculty_owner` does **not** determine grading visibility.

---

## 5. Data Scope

| Information | Canonical Scope |
|---|---|
| Current faculty MSOE identity | Local Graider settings |
| Faculty-to-section mapping | Term |
| Student roster membership | Section |
| Required files | Assignment |
| Rubric | Assignment |
| Comment library | Course |
| Applied comments | Assignment + student |
| Manual rubric adjustments | Assignment + student |
| Grading state | Assignment + student |
| GitHub Actions evidence | Assignment + student submission |
| Final HTML report | Student repository |
| Future Canvas grade | Canvas assignment + student |
| IntelliJ package workspace | Derived assignment/faculty utility output |

---

## 6. Assignment Grading Configuration

Each assignment may define grading configuration containing at minimum the following.

### 6.1 Required Files

The assignment identifies which student files faculty should grade.

Required files determine:

- which source files appear in the grading viewer;
- their display order;
- missing-file detection;
- which source files appear in the final report.

Graider should not display every repository file by default.

### 6.2 Rubric

The rubric is a **flat list of categories**.

Example:

```text
Correctness       40
Design            25
Documentation     15
Code Quality      20
--------------------
Total            100
```

Each category contains:

- stable identifier;
- display name;
- maximum points.

No nested rubric structure is required.

---

## 7. Grading Preparation

When faculty starts grading an assignment, Graider prepares grading data for eligible student submissions.

This workflow begins after Graider has already pulled the repositories locally.

For each eligible student, Graider gathers:

- configured required source files;
- missing required files;
- submission commit SHA;
- relevant GitHub Actions grading result;
- JUnit summary/details from that workflow;
- Checkstyle summary/details from that workflow;
- recent Git commit history;
- existing persisted grading state, if any.

Preparation does **not** generate the final HTML report.

---

## 8. GitHub Actions Grading Evidence

Graider does not rerun JUnit or Checkstyle during interactive grading.

Instead, it reads results from the grading workflow already executed by GitHub Actions.

The selected workflow run should correspond to the student's relevant submission/default-branch commit rather than simply being the chronologically latest unrelated workflow.

The grading state should record enough information to identify the evidence used, including conceptually:

```text
submissionCommitSha
workflowRunId
workflowCommitSha
```

### 8.1 Faculty Presentation

By default, faculty sees a compact summary such as:

```text
JUnit
17 / 19 tests passed

Checkstyle
6 violations
```

Faculty can expand either section to inspect:

- individual failed tests;
- failure messages;
- individual Checkstyle violations;
- file/line information when available.

Neither result changes the rubric automatically.

Faculty decides whether and how many points to deduct.

### 8.2 Student Report

The final report includes detailed JUnit and Checkstyle results in substantially the same useful form as the previous grading application.

---

## 9. Grading Viewer

### 9.1 Primary Layout

The grading workspace should approximately contain:

```text
+--------------+--------------------------------+------------------+
| Students     | Source                         | Grading          |
|              |                                |                  |
| ✓ adams      | Monaco                         | Score 87 / 100   |
| ● brown      |                                |                  |
|   chen       | All required files             | Rubric           |
|   davis      | in one scrolling view          | Comments         |
|              |                                | Test summary     |
+--------------+--------------------------------+------------------+
```

Exact styling may evolve later, but the functional arrangement should favor rapid grading.

### 9.2 Student List

The student list:

- includes only students in sections assigned to the current faculty user;
- uses MSOE `student_id` for display;
- shows a concise grading status;
- supports rapid keyboard navigation.

---

## 10. Monaco Source Viewer

### 10.1 Read-Only Behavior

Monaco is read-only while grading.

Faculty retains normal editor conveniences such as:

- smooth scrolling;
- line numbers;
- selection;
- copying;
- Find;
- normal cursor movement;
- syntax highlighting;
- bracket highlighting;
- standard Monaco navigation behavior.

Unneeded IDE features should remain disabled where practical:

- source modification;
- completion popups;
- code actions;
- project-management features;
- other distracting editor behavior.

### 10.2 Combined Source Document

Faculty must be able to see **all configured required files for a student in one continuous scrolling source view**.

Graider should use one read-only Monaco model rather than requiring faculty to open files individually.

Conceptually:

```text
LinkedList.java
────────────────────────

1  public class LinkedList {
2      ...
3  }


LinkedListNode.java
────────────────────────

1  public class LinkedListNode {
2      ...
3  }


ListException.java
────────────────────────

1  public class ListException extends Exception {
2      ...
3  }
```

File headers should preferably be rendered using Monaco decorations/view zones rather than inserted into the student's actual text.

The combined representation exists in memory. Graider does not create a concatenated source file on disk.

### 10.3 Canonical Source Locations

Comments must never be stored against synthetic Monaco line numbers.

They are stored against the original source:

```text
file
startLine
endLine
```

Example:

```text
src/jones/LinkedListNode.java
lines 10-12
```

Graider maintains the Monaco-to-source mapping internally.

### 10.4 Missing Required Files

Missing files remain visible as sections in the combined document:

```text
LinkedListNode.java
Required file not found
```

---

## 11. Student Navigation and View State

Graider remembers the grading viewer position independently for every student, including at least:

- scroll location;
- cursor position;
- selection if practical.

Therefore:

```text
Adams -> Brown -> Adams
```

returns faculty to the location where they left Adams.

This view state is persisted with grading state so it can survive closing and reopening Graider.

---

## 12. Course Comment Library

There is **one shared comment library per course**.

The canonical library should live with shared course configuration so faculty grading the same course use the same comments.

A reusable comment contains:

```text
id
title
text
defaultDeduction
defaultRubricCategory?   // optional
tags[]
```

Example:

```text
Title: Magic number

Text:
Use a named constant instead.

Default deduction:
-0.5

Default category:
Code Quality

Tags:
CSC1120
L3
Style
Common
```

The default rubric category is optional.

### 12.1 Comment Library CRUD

Faculty must be able to:

- create a reusable comment;
- edit a reusable comment;
- delete a reusable comment;
- search the library;
- filter the library using tags.

Editing may change:

- title;
- text;
- default deduction;
- optional default rubric category;
- tags.

Deleting or editing a reusable library comment must **never alter already-applied comments** in student grading records.

Applied comments are snapshots.

### 12.2 Search and Filtering

Search matches:

- title;
- comment text;
- tags.

Faculty may filter by arbitrary tags such as:

```text
CSC1110
CSC1120
L2
L3
Style
Documentation
Testing
Common
```

Search and tag filters work together.

There are no physically separate course/assignment/faculty comment libraries. Tags provide those views.

---

## 13. Applying Comments

Comments may be either source-anchored or general.

### 13.1 Source-Anchored Comments

A source comment may attach to:

- the current line; or
- a selected range of lines.

### 13.2 General Comments

A general comment applies to the student's assignment without a source location.

### 13.3 Comment Application Workflow

When faculty invokes Add Comment:

1. Graider opens a compact searchable comment chooser.
2. Faculty searches and/or filters.
3. Faculty selects a reusable comment.
4. Faculty may alter:
   - comment text;
   - deduction;
   - rubric category, including removing the category.
5. The comment is applied.
6. Monaco receives an annotation/decorative marker when source-anchored.
7. The live rubric recalculates immediately.
8. Grading state autosaves.

The applied instance stores its own values.

Later editing of the reusable library entry must not change previously applied student comments.

---

## 14. Editing and Deleting Applied Comments

Faculty must be able to edit and delete comments already applied to a student's grading record.

For an applied comment, faculty may change:

- comment text;
- deduction;
- rubric category or remove the category;
- source line/range when source-anchored.

Faculty may also delete the applied comment entirely.

Any applied-comment edit or deletion must:

- immediately update Monaco annotations as needed;
- immediately recalculate the live rubric;
- autosave the grading state;
- if the student was previously `Published`, move the grading state back to `Complete`.

Editing/deleting applied comments must be accessible through keyboard shortcuts as well as the normal UI.

---

## 15. Live Rubric

The rubric is continuously calculated from current grading state.

Example:

```text
Correctness        37 / 40
Design             24 / 25
Documentation      13 / 15
Code Quality       17 / 20
--------------------------
Total              91 / 100
```

Applying a `-1` Code Quality comment immediately produces:

```text
Code Quality       16 / 20
Total              90 / 100
```

Removing that comment restores the point.

Graider must not separately maintain an independently synchronized total score. The displayed total is derived from rubric state.

Comments without a rubric category may still deduct from the overall grade according to the chosen grading-state representation; implementation must ensure the total remains deterministic and explainable.

---

## 16. Manual Rubric Adjustments

Faculty may directly alter a rubric category without creating a grading comment.

This supports deductions or adjustments that do not warrant explanatory comments.

A manual adjustment should preserve:

- rubric category;
- adjustment amount;
- optional faculty note if desired.

Manual adjustments participate in the same live score calculation as comment deductions.

---

## 17. Commit History

Recent student commit history is available directly in the grading viewer.

Faculty should not need to generate the final report to inspect it.

The final report also includes the appropriate recent commit history.

---

## 18. Keyboard-First Workflow

All routine grading operations must be possible without requiring a mouse.

Exact shortcuts should be assigned later with care to avoid conflicts with standard Monaco commands.

Required keyboard-accessible actions include:

- next student;
- previous student;
- add comment;
- search comment library;
- navigate comment search results;
- apply selected comment;
- edit selected/applied comment;
- delete selected/applied comment;
- next grading annotation;
- previous grading annotation;
- mark student Complete;
- normal source Find/navigation;
- focus relevant grading panels.

The intended workflow should allow faculty to grade an entire assignment primarily from the keyboard.

---

## 19. Grading Status

Each student has one of four primary states:

```text
Not Started
In Progress
Complete
Published
```

Expected behavior:

- untouched record -> `Not Started`;
- grading begins -> `In Progress`;
- faculty explicitly marks grading finished -> `Complete`;
- report successfully published -> `Published`;
- any grading-state change after publication -> return to `Complete`.

This provides a clear indication that a previously published grade has changed and should be republished.

---

## 20. Persistent Grading State

Graider continuously autosaves grading state.

One canonical persisted record exists per:

```text
assignment + student
```

It should contain conceptually:

```text
studentId
submissionCommitSha

status

rubricState
manualAdjustments

appliedComments

analysis
  workflow identity
  junit results
  checkstyle results

commitHistory

viewState

publicationState
```

The exact serialized schema can be determined during implementation.

Plain JSON is preferred unless an existing Graider convention provides a simpler equivalent.

No database is required.

### 20.1 Applied Comment Snapshot Rule

Every applied comment stores the values actually used for that student's grade.

At minimum:

```text
sourceCommentId?       // reference back to library when applicable
text
deduction
rubricCategory?
sourceLocation?
```

The reusable comment library is not consulted to recalculate old applied comments.

---

## 21. Temporary and Derived Files

Very little temporary data should be generated.

### 21.1 No Temporary Source Copies

The following stay in memory:

- combined Monaco source model;
- Monaco/source line mapping;
- Monaco decorations;
- current filtering/search state;
- calculated rubric totals.

Student repositories are read-only during interactive grading.

### 21.2 No Report Drafts

Graider should not maintain HTML or Markdown report drafts.

The persisted grading record is the only authoritative grading representation.

### 21.3 Report Publication Temporary Files

When publishing, report generation may use an OS temporary directory.

After successful publication, temporary report-generation files are deleted.

---

## 22. Report Generation

The final HTML report is generated **only when faculty publishes grading**.

Report content is derived from:

- rubric;
- manual adjustments;
- applied comments;
- annotated source code;
- JUnit results;
- Checkstyle results;
- commit history;
- final score.

The local grading JSON remains the authoritative source.

---

## 23. Report Presentation

The final student report should retain the useful portions of the old GitHubClassroomUtilities output while using the new grading-state model.

At minimum:

1. assignment/student heading;
2. final score;
3. rubric/category breakdown;
4. general grading comments;
5. source code with anchored grading comments;
6. Checkstyle results;
7. failed JUnit tests or success summary;
8. recent commit history.

Exact visual styling can be addressed later.

---

## 24. Publishing

Faculty may publish:

- all completed students; or
- a selected subset.

The publication workflow should show/select students before mutation.

For each selected student:

1. render the current grading state into HTML;
2. place/update the canonical grading-report file in the student's repository;
3. commit and push using existing Graider Git/GitHub infrastructure;
4. update grading status to `Published` only after successful publication.

Republishing replaces/regenerates the report from current grading state.

One student publication failure should not unnecessarily prevent other selected students from publishing.

---

## 25. Canvas Integration Boundary

Canvas integration is deliberately separate from the grading engine.

The grading publication operation should eventually expose something conceptually equivalent to:

```text
studentId
score
pointsPossible
reportPublished
```

The future Canvas adapter may then perform:

```text
Publish grading
     |
     +-- GitHub -> HTML grading report
     |
     +-- Canvas -> numeric score
```

The grading module must not need Canvas-specific logic to calculate a grade.

---

## 26. Optional IntelliJ Student Package Generation

Student package generation is an assignment utility and is **separate from interactive grading**.

It should be available as an optional Assignment Detail action such as:

**Generate IntelliJ Student Packages**

### 26.1 Purpose

The operation generates a workspace containing student Java packages that faculty can use directly with IntelliJ for inspection or other manual work.

It does not modify student repositories and does not depend on grading state.

### 26.2 Faculty Scope

Only students belonging to sections accessible to the current faculty user are included.

Student identity and Java package selection use the MSOE `student_id`, not the GitHub username.

### 26.3 Source Package Extraction

For each included student repository:

- locate the student's Java source package;
- support the repository/source-root conventions Graider already recognizes;
- copy the student's package into the generated package workspace;
- preserve the Java package declaration and internal package structure;
- do not copy unrelated test/configuration/generated files merely because they exist in the repository.

One malformed or missing student package must not prevent other students from generating successfully.

### 26.4 Generated Workspace

Conceptually:

```text
<generated-workspace>/
  packages/
    adams/
    brown/
    chen/

  imports.txt
  mapping.json
```

`packages/` contains the extracted student packages.

`imports.txt` provides paste-ready imports for the generated packages. The exact formatting should follow the established useful behavior from the original utility and may use commented imports if that remains the preferred workflow.

`mapping.json` maps each generated package/student back to its source repository/path so the origin remains traceable.

### 26.5 Regeneration

The package workspace is derived output.

Regeneration should:

- safely replace the previously generated workspace;
- never modify student repositories;
- report students that were skipped or failed;
- remain independent of grading comments, rubric state, completion status, and report publication.

No permanent per-student grading state is required for this utility.

---

## 27. Simplicity Constraints

The grading implementation should prefer:

- TypeScript;
- React;
- Monaco;
- plain data structures;
- small focused services;
- existing Graider Git/GitHub functionality;
- existing Electron security boundaries;
- filesystem persistence where needed.

It should avoid unless proven necessary:

- Java grading application integration;
- JVM sidecars;
- SQLite/databases;
- separate domain models mirroring every serialized object;
- custom source editor development;
- duplicated report/grading state;
- complex event buses;
- framework-heavy state management;
- deep repository/service/controller hierarchies.

A missing abstraction should not automatically result in adding multiple layers. The simplest solution satisfying the workflow should be preferred.

---

## 28. Core Acceptance Workflow

The grading feature is functionally successful when faculty can:

1. Open an assignment that already has downloaded student repositories.
2. See only students from sections assigned to their MSOE username.
3. Start grading a student.
4. Scroll through all required source files in one continuous Monaco view.
5. See summarized JUnit/Checkstyle evidence and expand it when desired.
6. See recent commits.
7. Select source lines and rapidly search/filter/apply a reusable grading comment.
8. Apply a comment with or without a rubric category.
9. Edit an applied comment.
10. Delete an applied comment.
11. See the rubric and total update immediately after adding, editing, or deleting grading feedback.
12. Manually adjust a rubric category.
13. Switch between students and return to the previous source location.
14. Close/reopen Graider without losing grading progress.
15. Create, edit, delete, search, and tag/filter shared course comments.
16. Mark students Complete.
17. Select completed students and bulk publish.
18. Have Graider generate and push each student's final HTML report.
19. Modify a published grade, see it return to Complete, and republish the updated report.
20. Later, have the same publication workflow submit the resulting score to Canvas without changing the grading model.

The optional IntelliJ package utility is successful when faculty can:

21. Invoke Generate IntelliJ Student Packages independently of grading.
22. Generate packages only for students in their assigned sections.
23. Open/use the generated package workspace in IntelliJ without modifying the original student repositories.
24. Regenerate the workspace safely and see which students, if any, could not be extracted.

---

## 29. Implementation Guidance for Codex

This specification is the source of truth for the grading module.

When implementing:

1. Read this specification before planning a grading slice.
2. Implement the smallest useful vertical slice.
3. Reuse existing Graider Git/GitHub, assignment, roster, and faculty-section infrastructure.
4. Keep Monaco read-only and keep grading annotations in Graider state.
5. Keep persisted grading state canonical; reports and IntelliJ package workspaces are derived outputs.
6. Prefer plain TypeScript data and small functions/services over elaborate architecture.
7. Surface architectural concerns, but do not stop a bounded slice merely because the surrounding architecture is imperfect.
8. Stop only for a genuine blocker that would make the slice unsafe, impossible, or require violating/duplicating an existing abstraction.
9. Use TDD and preserve existing Graider safety boundaries.
