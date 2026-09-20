# Graider UI redesign — deferred issues backlog

Issues surfaced during PR1–PR6a that were deliberately left unfixed, either
because they were out of a PR's scope or because fixing them needed its own
decision. Each entry says what it is, why it matters, and how big it is.

Work these between PR6a and PR6b. Item 1 is a hard prerequisite for PR6b.

Status key: **Blocker** · **Should fix** · **Worth fixing** · **Optional** ·
**Resolved**

---

## 1. Assignment detail has no roster-wide grading status source — **Resolved**

**Corrected 2026-09 — the original framing of this item was wrong.** A
roster-wide aggregate already exists: `resolveGradingWorkspaceContext`
(`src/grading/grading-workspace-context.ts`) takes a roster and returns
every student's `gradingStatus` (`not_started` / `in_progress` / `complete`
/ `published`) in one call. It is cheap — `loadGradingState` per student is
a synchronous local JSON file read, no network, no subprocess; 24 reads for
a 24-student roster is negligible. The grading workspace already uses it
this way: `prepareGradingWorkspace` returns it once at workspace-open, and
the workspace's status counts and filter pills read that field directly
(`effectiveGradingStatus`), not from per-student snapshot loads. The
previous claim that the workspace "works around" a missing aggregate by
loading every student individually was wrong — the publish review's
concurrency cap of 5 exists for a different, still-real reason (below), not
because this aggregate was missing.

What's actually true, and what still blocks PR6b:

- **No CLI command exposes this — there isn't a CLI command involved at
  all.** The path is `window.graiderUI.prepareGradingWorkspace` → IPC
  channel `graider-ui:grading-workspace:prepare` → `ipcMain.handle` in
  `main.ts` → `gradingWorkspaceService.ts` → a bundled backend module
  (`gradingWorkspaceBackend.cjs`, built straight from
  `grading-workspace-context.ts` by `ui/scripts/build-template-sync.mjs`)
  loaded in-process via `require()`. This is the same established pattern
  used for ~13 other grading-workspace backends (comments, manual
  adjustments, workflow repair, …) — not a novel or hacky path, just not
  the CLI-subprocess-JSON pattern the rest of the architecture doc
  describes.
- **The roster it resolves is scoped to the current faculty member's
  assigned sections, not the whole assignment.** `prepareGradingWorkspace`
  gets its roster from `resolveFacultyScope`, filtered by
  `currentFacultyMsoeUsername`'s sections. `AssignmentDetailPage`'s existing
  `roster.activeStudentCount` (used by "Apply to N students" and the
  "Applied" lifecycle step) is assignment-wide, all sections, no faculty
  filter. Wiring the lifecycle strip through the existing endpoint as-is
  would put two different "N of M" populations on the same strip — wrong,
  not merely incomplete. `resolveGradingWorkspaceContext` itself is
  roster-agnostic (it takes whatever `students` array it is given, the same
  three fields — `studentId`, `githubUsername`, `section` — that
  `assignment-detail-builder.ts` already loads for `activeStudentCount`), so
  this is a matter of feeding it the assignment-wide roster instead of the
  faculty-scoped one, not rewriting it.
- **One bad grading-state file fails the whole call.**
  `resolveGradingWorkspaceContext` returns `grading_state_error` and
  discards every other student's status the moment one `loadGradingState`
  call fails (corrupt JSON, unsupported schema version). Tolerable for the
  grading workspace (one faculty member, their own section, their own file
  to fix); not tolerable for a page that must render a lifecycle strip on
  every load regardless. Needs per-student fault tolerance, not
  all-or-nothing.
- **`Grading N of M done` and `Published N of M sent` are directly
  derivable** from `gradingStatus` counts once the two problems above are
  addressed. **`Submissions N of M in` is not derivable from this aggregate
  at all** — it carries no submission-presence field, only grading status.
  Assignment detail's already-fetched `getAssignmentGradeStatus` CI-run data
  (`GradeStatusRepositoryStatus`, fetched on every page load already, so no
  new network cost) could approximate it — a workflow run existing at all
  (anything other than `"missing"`) plausibly means the student pushed
  something — but that is an approximation of submission presence, not a
  measurement of it, and needs an explicit decision before building rather
  than a silent default.

Fix: not a new command — a small, scoped addition. Feed
`resolveGradingWorkspaceContext` the assignment-wide roster (via a new or
adjusted IPC path; the resolver itself needs no changes for this part),
harden its per-student failure handling so one bad file cannot blank the
whole strip, and decide how — or whether — to source `Submissions`.

Do this first. It still unblocks PR6b, but as a scoped addition to
already-existing, already-cheap logic, not as new aggregation
infrastructure.

Fixed: built as scoped here — a new IPC path
(`getAssignmentGradingLifecycle`) feeds `resolveGradingWorkspaceContext`
the assignment-wide roster via a new bundled backend
(`assignment-grading-lifecycle-context.ts`), the resolver gained an opt-in
`tolerateStudentStatusErrors` flag (via a function overload, so the grading
workspace's own behaviour and types are unchanged) so one bad grading-state
file no longer blanks the whole strip, and `Submissions` was dropped
permanently rather than approximated — see README section 5.3. The
lifecycle strip now renders four steps: `Created` → `Applied` → `Grading` →
`Published`. See item 12 for the one known gap this left behind.

---

## 2. CI does not run any UI checks — **Resolved**

`.github/workflows/ci.yml` runs root `typecheck`, `lint`, `format:check`,
`test`, `build`, and `audit`. It never runs anything with `--prefix ui`.

All ~709 UI tests, the UI typecheck, and the UI build are unprotected. This is
how 14 broken `DashboardPage` tests and 4 `dashboardRunner` typecheck errors
reached master unnoticed.

Fix: add UI steps to the workflow. Small change, large payoff.

Related: `ui/electron/commandRunner.test.ts:159` hardcodes `/private/tmp`, so
that test passes only on macOS and will fail the moment CI runs the UI suite on
Linux. Use `os.tmpdir()` instead. Fix this in the same PR or CI goes red
immediately.

Fixed: `ci.yml` now installs UI dependencies and runs `typecheck`,
`format:check`, `test`, and `build` with `--prefix ui`, and the
`/private/tmp` hardcode was replaced with `os.tmpdir()`. The workflow has
never actually triggered on this branch (push-only, no PR opened), so this
was verified by running every CI command locally from a clean checkout
instead — all pass. See the PR that resolved this for the full command list
and results.

---

## 3. Status-to-label logic is duplicated — **Resolved**

`AssignmentDetailPage.tsx` (~line 1100) and `GradeStatusPage.tsx` (~line 109)
contain near-identical helpers mapping `GradeStatusRepositoryStatus` to display
strings, plus near-identical summary-text helpers. A recent bugfix adding the
`not_configured` status had to be applied to both.

Section 2.3 of the redesign brief calls for one status-mapping module so the
strings are reviewable in one place.

Fix: extract to a shared module. Note there are now six statuses, not five —
`not_configured` is recent and easy to drop during a rewrite.

Do this before PR6b, which rewrites one of the two call sites.

Fixed: extracted to `ui/src/grade-status/gradeStatusLabels.ts`, enumerated
from `GradeStatusRepositoryStatus` (actually eight values, not six or
five — the backlog note undercounted; the new mapping is a `switch` with a
compiler-enforced `never` check, so a future addition fails to typecheck
instead of silently falling through). Two real differences between the old
versions were found and reconciled, not silently picked:

- `GradeStatusPage.tsx`'s completed-run label used
  `` `Completed — ${row.conclusion ?? "unknown"}` ``, which leaked the raw
  GitHub Actions conclusion string for `skipped`/`neutral`/`action_required`
  — a section 2.3 violation. Adopted `AssignmentDetailPage.tsx`'s safer
  version (explicit `success`/`failure`/`cancelled`/`timed_out` cases, a
  `"Completed — unknown"` catch-all for everything else) for both files.
- `AssignmentDetailPage.tsx`'s summary text included an
  `"N grading runs need attention."` bucket that `GradeStatusPage.tsx`'s
  version lacked, so the latter could fall through to a generic message on
  `token_required` or failed/cancelled/timed-out repositories even though a
  more specific one was available. Added it to the shared logic both
  functions use, so `GradeStatusPage.tsx`'s rendered text changes (gets more
  specific) for that case.
- The two functions' _fallback_ message when nothing needs attention was
  kept deliberately different, not unified: `GradeStatusPage.tsx`'s
  `getNotReadyReason` is only ever called when `readyForReport` is already
  false, so an empty reason list there means "not ready for a reason these
  counts don't capture" — falling back to a positive message would be
  wrong. `AssignmentDetailPage.tsx`'s `getGradeStatusSummaryText` is called
  unconditionally, so its empty-list fallback is positive. Both still share
  the same reason-enumeration logic.

While auditing both files for other raw values per section 2.3, also fixed
(all within these two files): a raw ISO timestamp in
`GradeStatusPage.tsx`'s per-row "Started"/"Completed" times and its "Last
refreshed" line; a raw ISO timestamp in `AssignmentDetailPage.tsx`'s "Due
date" field; and a raw `label="workflow_dispatch status"` in
`AssignmentDetailPage.tsx` (the value was already translated via
`formatStatusLabel` — only the label text itself was raw) — this is the
exact example in README section 2.3's own table.

Found but left unfixed, reported instead (outside these two files, or
disproportionate to this refactor):

- `ui/src/apply-preview/ApplyPreviewPage.tsx:325` has the identical raw
  `"workflow_dispatch status"` label — a different file.
- `GradeStatusPage.tsx` shows a workflow file path and an assignment file
  path directly in the table/page with no "Technical details" disclosure
  on this page to hide them behind (section 2.4); adding one is a bigger
  change than this refactor.
- `resolvedFrom` (`"course_default"` / `"assignment_override"` / `"none"`)
  and grading `mode` (`"custom-workflow"`, `"no-grading"`, …) render as raw
  config identifiers in both files — legible but not plain English; would
  need a new translation table unrelated to `GradeStatusRepositoryStatus`.
- `getStudentLabel`/`getGradeStatusStudentLabel` remain duplicated
  (identical one-liners, studentId → label) — not a status enum, so left
  out of this module's scope.

---

## 4. `commentMutationStudentId` is misnamed — **Resolved**

Declared at `GradingWorkspacePage.tsx:594`, but it is set by the publish path
(~2198) and the bulk path (~2260) as well. It is a general grading-mutation
flag, not a comment-specific one, and it is now load-bearing in the unsaved
draft guard.

A variable named for one thing that tracks three will eventually cause a real
bug. Pure rename, no behaviour change.

Fixed: renamed to `gradingMutationStudentId`/`setGradingMutationStudentId`.
Three sibling identifiers had the identical problem and were renamed too:
`commentMutationError` → `gradingMutationError`, `commentMutationBlockedStudents`
→ `gradingMutationBlockedStudents`, and the `flushPendingViewState` parameter
`forceDuringCommentMutation` → `forceDuringGradingMutation` — all four are set
or read from the comment, manual-adjustment, single-publish, and bulk-publish
paths alike. Audited the rest of the file for the same pattern (every
comment-, manual-adjustment-, publish-, workflow-repair-, and
mark-complete-prefixed name); found nothing else mis-scoped. Pure rename —
both suites unchanged (1024 root / 718 UI), no test needed changing.

---

## 5. `globals.css` is a single 2,982-line file — **Worth fixing**

Up from 2,105 at the start of the redesign, a 42% increase, with five more
screens still to come.

Fix: split by screen or by concern, keeping the token block as the single
source of truth. Best done at a natural boundary rather than mid-screen.

---

## 6. Two primary actions coexist on the grading workspace — **Resolved**

Section 2.1 says one primary action per screen. The grading workspace has the
per-student action (Mark Complete / Publish Report) in the grading pane and
"Publish N reports" in the header.

This is arguably a legitimate exception: one acts on the current student, the
other on the session. But it should be resolved deliberately, by making the two
scopes look different from each other rather than demoting one — and it should
be decided before PR6a's header pattern is copied to other screens.

Decision: the real problem was never "two scopes" — it was two primary
actions sharing the same verb. "Mark Complete" (per-student) and "Publish N
reports" (session) are both primary and both stay filled: different
scopes, different verbs, no risk of mistaking one for the other. But
"Publish Report" (per-student) and "Publish N reports" (session) share the
verb "Publish" while differing only in scope — two filled green buttons,
same word, ~800px apart. Someone finishing a session could publish one
student, believe they were done, and leave the rest unsent. Demoting the
per-student action removes the ambiguity without losing the scope
distinction, because the label now states the scope in words instead of
relying on position to imply it.

Fixed: "Publish Report"/"Republish Report" are now `secondary-action`,
renamed "Publish this student's report"/"Republish this student's report"
(button, confirmation dialog title, and confirm button all updated to
match). They stay in the same place and keep working. The header's
"Publish N reports" and the per-student "Mark Complete" are both
unchanged — still primary, per the decision above. The general rule is
recorded in README section 2.1 so it isn't rediscovered per screen.

---

## 7. Intermittent test failures — **Resolved**

Three flakes seen so far, all in different files, all passing in isolation
and on immediate rerun:

- An "Add faculty" test in `RosterManagerPage` failed once in four runs during
  the sibling-panel PR. Nobody has touched roster code during the redesign.
- `GradingWorkspaceKeyboardShortcuts.test.tsx` failed once during PR6a and
  passed on rerun. PR6a did not touch the grading workspace.
- `GradingWorkspaceSiblingPanels.test.tsx` failed once with "Unable to find
  role=button and name 'Select ada line'" — the first `findByRole` in the
  first test of the file.

Diagnosis: all three await a `findByRole`/`findByText` shortly after
`render(<GradingWorkspacePage .../>)`, which must resolve
`prepareGradingWorkspace` and a student snapshot before the awaited element
exists. Testing Library's `findBy*`/`waitFor` default timeout is 1000ms;
`ui/vitest.config.ts` set no `asyncUtilTimeout`. Measured the clearest case
(`GradingWorkspaceSiblingPanels`'s first test) at 500ms in isolation but
620–760ms across 8 full-suite runs on an 8-core machine — a real, consistent
contention tax from 90 parallel test files (several backend git-based test
files alone routinely take 900–1800ms), landing close enough to 1000ms that
worse contention (a slower CI runner, a GC pause) plausibly tips it over.
Confirmed this is genuinely a timing issue, not a component race: every
awaited element reliably appears given enough time, in 8 pre-fix and 11
post-fix full-suite runs with zero reproductions in this session.

Fixed: `configure({ asyncUtilTimeout: 5000 })` in `src/test/setup.ts`
(≈6x the worst full-suite render observed), and `testTimeout: 10000` in
`vitest.config.ts` so a genuine hang still fails with Testing Library's
specific "unable to find" message rather than a generic timeout. Ran the
full UI suite 10 times after the change: 10/10 clean at 718/718. Could not
directly reproduce a failure before or after the change in 18 total runs
this session, so this confirms increased headroom, not a captured
before/after flip.

---

## 8. Duplicate accessible names, remaining cases — **Optional**

Mostly resolved, two known remainders:

- `ConfirmationWithPreviewModal` (a PR1 component) renders a hardcoded
  "Cancel". Two simultaneous instances are now structurally impossible in the
  grading workspace, but the component is shared and the guarantee does not
  travel with it.
- Two comments or two adjustments with byte-identical visible text produce
  identical `aria-label`s. Needs an ID-based labelling scheme.

---

## 9. Spec gaps found during implementation — **Resolved**

Errors in `docs/ui-redesign/README.md`, not in the code:

- Section 5.2 shows publish timestamps on "Already published" rows. The bulk
  publication result carries no timestamp. PR5 correctly omitted it.
- Section 5.1 describes a student filter text input. None exists; the `/`
  shortcut focuses the filter pills instead.
- Section 5.3's lifecycle strip assumes data that does not exist (item 1).

Fixed in the doc-correction PR after PR6a: all three corrected, the
five-state primary action table annotated as assuming data that doesn't
exist, and the lifecycle strip's `Submissions`/`Grading`/`Published` steps
marked blocked on item 1.

---

## 10. Small deferred behaviours — **Optional**

- Publish review: if a per-student snapshot fetch fails, the row shows "Score
  unavailable" with no retry affordance. Student is still publishable.
- Re-anchoring a _new_ comment (before typing) is not dirty-tracked, so it can
  be lost silently. Editing an existing comment's anchor is tracked.
- `PageHeader`'s `.page-header__meta` uses a hardcoded font size rather than the
  PR1 type tokens. One line.

---

## 11. `PageHeader` is not expressive enough — **Worth fixing**

It cannot express the orange blocked-state variant, and has no settable
heading `id`. PR6a worked around this by rendering its primary button
manually instead of using `primaryAction`. Every remaining screen that needs
a blocked-state primary action will hit the same limitation.

Fix: extend `PageHeader` deliberately (a style/variant prop for the primary
action, a settable heading id) rather than accumulating bespoke headers
screen by screen.

---

## 12. Lifecycle strip's `Created` step has no date — **Optional**

The assignment detail lifecycle strip's `Created` step (item 1) always
renders complete, but with no date detail: no field anywhere in the data
model records when an assignment was created. Adding one needs a backend
model change (a new field on `AssignmentDetailResult`/`assignment-detail-
builder.ts`, sourced from something like the assignment file's creation
time or a recorded creation timestamp), which was out of scope for the
lifecycle-strip PR.

Low priority — the step still renders and is unambiguous (first, always
complete) — but it is a visible blank next to three steps that do show a
detail line.

---

## Suggested order

Nothing is blocking PR6b anymore — proceed to it directly.

Items 1, 2, 3, 4, 6, 7, and 9 are resolved and no longer part of this sequence.

Items 5, 8, 10, 12 can wait until after the redesign.
