# PR6b — assignment detail main column and sidebar

Implementation plan. Written 2026-09-20, after PR6a and the backlog cleanup
run (items 1, 2, 3, 4, 6, 7, 9) landed on `ui-redesign` at `16dc033`.

Section 5.3 of the redesign brief is the specification. This plan records
what of it PR6b builds, what it drops and why, and how the work splits. Four
decisions were taken before any code was written; they are recorded in
section 3 so they are not rediscovered later.

---

## 1. What PR6b covers

Section 5.3 minus the header, which PR6a already built. That leaves:

- **Main column** — a student table with filter pills.
- **Sidebar** — assignment facts, roster card, and a collapsed
  **Technical details** disclosure.

The lifecycle strip is already in (`AssignmentDetailPage.tsx`, rendering
`LifecycleStrip`). The "Available actions" panel is already deleted. The
header's primary action, secondary action and overflow menu are PR6a's and
are not touched here.

---

## 2. Data inventory

What the page can actually feed a student table today, before any change:

| Column  | Source                                                   | State                |
| ------- | -------------------------------------------------------- | -------------------- |
| Student | lifecycle rows — `studentId`, `githubUsername`           | available            |
| Section | lifecycle rows — `section`                               | available            |
| Grade   | —                                                        | added by PR6b-2      |
| Checks  | `getAssignmentGradeStatus` — `status`, `conclusion`      | available, no counts |
| Status  | lifecycle rows — `gradingStatus`                         | available            |

`AssignmentGradingLifecycleStudentRow` (`16dc033`) carries four fields:
`studentId`, `githubUsername`, `section`, `gradingStatus`. The grade-status
result, already fetched on every page load, carries per-repository
`status` and `conclusion` but no score and no warning counts.

`Submitted` is absent from the table above deliberately — see decision 3.1.

---

## 3. Decisions

### 3.1 `Submitted` is dropped from the main column, permanently

Section 5.3 specified a `Submitted` column, a `Not submitted` filter pill, a
`No submission` status chip, and an informational notice ("6 students have
not submitted yet"). All four require a per-student submission signal.

The same section already establishes that no such signal exists, and that
approximating one from workflow-run presence would repeat the
CI-status-as-human-status conflation the redesign avoids everywhere else: a
run can mean the initial template push or a faculty-triggered grading run
just as easily as a student submission. That reasoning was written for the
lifecycle strip's dropped `Submissions` step; the main-column paragraph was
not revisited at the time, which is why four elements assuming the signal
survived in the spec.

**Decision: drop all four.** Not deferred, not blocked — dropped on the same
grounds and with the same permanence as the `Submissions` lifecycle step.

Consequences:

- Filter pills are `Needs grading` / `Done` / `All`, still defaulting to
  **Needs grading**.
- Status chips are `Published` / `Graded` / `Needs grading`.
- No not-submitted notice in the main column.

Do not re-add any of these without a real, direct, per-student submission
signal. None exists today, and the workflow-run approximation is not one.

### 3.2 `Grade` is added, sourced from a new field on the lifecycle row

Grading happens in the grading workspace, and scores reach students through
the published report. Surfacing a score on assignment detail was not part of
the original intent for this screen, but it is useful there and cheap to
obtain, so it is in scope.

It costs almost nothing: `resolveStudentGradingStatusOutcome` already reads
each student's grading-state file to determine `gradingStatus` and discards
everything else. `grading-state-operations.ts` already computes `totalScore`
from that same state. The addition is one field on
`AssignmentGradingLifecycleStudentRow`, populated from data already in hand —
the same scoped-extension pattern `16dc033` used to add the rows themselves.
No new file reads, no network, no new command.

A student with no grading state yet has no score. The field is nullable and
the cell renders empty, **not** `0` — a zero is a real grade and must not be
manufactured for an ungraded student.

### 3.3 `Checks` shows run outcome only, with no warning count

Section 5.3 gives "All passed", "3 warnings", "Tests failed" as example
readings. `GradeStatusRepositoryRow` carries `status`, `conclusion`,
`needsAttention` and `diagnostics` — no warning count, and nothing in
`src/grade-status/` models one. Counts would have to come from parsing the
grading artifact, which is not modelled anywhere in this pipeline.

**Decision: `Checks` renders the run outcome in plain language, reusing
`gradeStatusLabels.ts`** (the shared module from backlog item 3). No new
status strings are introduced, and the assignment detail table, the
grade-status page and the lifecycle strip stay consistent by construction.

### 3.4 The table lands in its own file

`AssignmentDetailPage.tsx` is 2,661 lines. The table, its filter state and
its row mapping are roughly 300–400 more.

**Decision: new code goes in `AssignmentDetailStudentTable.tsx`.** Existing
code in `AssignmentDetailPage.tsx` is not refactored, moved or renamed —
this is a decision about where new code lands, not a component split. The
real split of the large components stays where the brief puts it, in PR10
(§4.2).

---

## 4. Scope split

Four PRs, in order. Each keeps the root and UI suites green and is
independently revertible.

### PR6b-1 — sidebar

`TechnicalDetails` (already built in PR1, unused on this screen) holding the
assignment file path, course folder, workflow path, slug and LMS id. Plus
the assignment-facts card — Due, Points, Type, Sections, Grading, Late
policy, Template as a link — and the roster card.

No new data, no backend change, no blocked questions. Closes §2.4 for this
screen: these are exactly the paths and identifiers that must not appear in
faculty-facing text outside a disclosure.

### PR6b-2 — score on the lifecycle row

Add the nullable score field to `AssignmentGradingLifecycleStudentRow` in
`src/grading/assignment-grading-lifecycle-context.ts`, mirror it in
`ui/electron/assignmentGradingLifecycleService.ts` (which declares its own
types rather than importing across the `require()`-loaded `.cjs` boundary —
keep that pattern), and extend the service tests.

Backend-only. Isolated from the renderer work, and testable on its own.
Keep the property that counts and rows are derived in one pass from the same
array, so they cannot disagree.

### PR6b-3 — student table

`AssignmentDetailStudentTable.tsx` using `DataTable`, `StatusChip` and
`FilterPills` from PR1, consuming the lifecycle rows plus the grade-status
rows the page already fetches.

Columns: Student, Section, Grade, Checks, Status. Pills: `Needs grading` /
`Done` / `All`, defaulting to `Needs grading`. An `EmptyState` for a filter
that matches nothing, and for an assignment with no active students.

### PR6b-4 — documentation

Correct §5.3's main-column paragraph to match decision 3.1, and add a
backlog entry recording the dropped column, pill, chip and notice — the same
treatment the `Submissions` step got, so a future reader finds the reasoning
rather than an apparent omission.

---

## 5. Definition of done

Section 7 of the brief applies to each of the four PRs. The items most
likely to bite here:

- No raw status enum, ISO timestamp, exit code or filesystem path outside
  Technical details. The `Checks` column and the sidebar paths are the two
  places this PR could violate it.
- Exactly one primary action. PR6b adds no primary action; the header's is
  PR6a's and stays.
- Every icon-only button has an `aria-label`. Sort controls and the
  disclosure toggle qualify.
- Empty regions get real empty states.
- Existing tests updated, not deleted. New behaviour gets new tests.
- Screenshots via `tools/ui-snapshots`.

---

## 6. Not addressed here

- Backlog item 5 — `globals.css` is 2,982 lines and the table will add to
  it. A table is a reasonable split boundary if that work is taken up, but
  it is not part of PR6b.
- Backlog item 11 — `PageHeader` cannot express the orange blocked-state
  variant. PR6b does not touch the header, so this blocks nothing here. It
  still blocks every remaining screen that needs a blocked-state primary
  action.
- Backlog item 12 — the lifecycle strip's `Created` step has no date.
- Section 5.3's blocked state (warning card, checklist, empty student
  table). The table's empty state is built in PR6b-3; the blocked-state
  treatment around it needs item 11 first.
- The five-state primary action table in §5.3. PR6a's three-state collapse
  still ships; restoring the finer states is a deliberate future decision,
  not a blocked one.
