# Graider UI redesign — deferred issues backlog

Issues surfaced during PR1–PR6a that were deliberately left unfixed, either
because they were out of a PR's scope or because fixing them needed its own
decision. Each entry says what it is, why it matters, and how big it is.

Work these between PR6a and PR6b. Item 1 is a hard prerequisite for PR6b.

Status key: **Blocker** · **Should fix** · **Worth fixing** · **Optional** ·
**Resolved** · **Accepted limitation**

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

Partly fixed: `ci.yml` now installs UI dependencies and runs `typecheck`,
`format:check`, `test`, and `build` with `--prefix ui`, and the
`/private/tmp` hardcode was replaced with `os.tmpdir()`. Verified by running
every CI command locally from a clean checkout — all pass.

**Reopened 2026-09-20. The workflow content is correct; the workflow has
never run, and not for the reason recorded above.**

The original note said "push-only, no PR opened". The mechanism is
different and worse:

```yaml
on:
  push:
    branches:
      - main
  pull_request:
```

This repository's default branch is `master`. `main` exists as a separate
branch whose tip is `c9a800d "Initial commit"` (2026-05-28); it has diverged
from `master`, which is 82 commits ahead of it and 1 behind. Nothing has
been pushed to `main` since the repository was created.

So the `push` trigger names a branch that is effectively dead, and the
`pull_request` trigger has nothing to fire on because no pull requests are
opened. `ci.yml` was added on 2026-06-09 (`5a5db23`). **No CI run has
happened on any branch, including `master`, in the three months since.**
Every commit on `master` in that window is unverified by CI, not just the
redesign branch. The UI steps added during the cleanup run were not the
thing that was missing.

Fix: point the `push` trigger at `master` — and at `ui-redesign` while the
redesign is in progress, so the branch is protected before it merges rather
than after. One-line change, and it is a prerequisite for any claim that a
PR "passes CI".

Do not close this item again on the strength of a local run. Close it when a
run appears in the repository's Actions tab.

**One mechanism worth recording explicitly: fixing `ci.yml` on `master`
alone would not have fixed this.** GitHub Actions reads a workflow file as
it exists on the branch receiving the push, not from `master` or any other
branch. A trigger naming `main` was dead on every branch, `ui-redesign`
included, until the fix was itself pushed to `ui-redesign` — merging or
rebasing a `master`-only fix into `ui-redesign` later would have worked too,
but a fix landed on `master` and left there would not have.

Fixed: the trigger fix landed in `436b3b5` (`push: branches: [master,
ui-redesign]`), pushed directly to `ui-redesign`. Its own run
(`35540217254`) appears in the repository's Actions tab and completed
successfully end to end in 3m43s — typecheck, lint, format check, test,
build, and their UI equivalents, all green. Two subsequent runs on this
branch failed, but at "Check formatting" only, on an unrelated pre-existing
issue (see the CI note on the PR6b-1 sidebar work) — not a regression of
this fix. The workflow now runs on every push to `master` and
`ui-redesign`, and on every pull request.

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

- `ui/src/apply-preview/ApplyPreviewPage.tsx:325` had the identical raw
  `"workflow_dispatch status"` label — a different file. **Half-closed as of
  PR10-1: this instance is gone (fixed in an intervening PR), but its
  sibling in `ui/src/grade-preview/GradePreviewPage.tsx:253`
  (`label="workflow_dispatch readiness"`) is still raw.** PR10-1's own
  instructions named this line explicitly as out of scope for that PR (a
  router change, not a label fix), so it remains open.
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

## 13. Raw assignment file path in Advanced details — **Should fix**

`AssignmentDetailPage.tsx:2530` renders
`<p className="assignment-detail__path">Assignment file: {detail.assignment.file}</p>`
inside the `Advanced details` disclosure. A literal section 7 violation —
no raw filesystem path should appear outside Technical details — and
pre-existing, not introduced by PR6b-1.

It is now also awkward: the same path is properly disclosed, with a copy
button, in Technical details a few hundred lines away in the same file.

Fix: delete the paragraph. The path is already available where section 2.4
says it should be.

---

## 14. Advanced details overlaps Technical details — **Worth fixing**

`Advanced details` is a pre-redesign collapsed disclosure holding
`TemplatePanel`, `GradingPanel`, `GradeWorkflowPanel`, `StudentReportsPanel`,
repository-mode settings, the access-page publish panel, and diagnostics.
`Technical details` is the section 2.4 disclosure PR6b-1 added, holding the
five implementation identifiers section 5.3 names.

`Workflow path` now renders in both: once in Technical details (PR6b-1,
sourced from `detail.grading.workflow`), once in `GradingPanel` inside
Advanced details (pre-existing, untouched). Section 2.4 says there is
exactly one such disclosure per screen; assignment detail now has two.

The underlying question — what `Advanced details` is for, and what (if
anything) survives once Technical details and the eventual student table
exist — is a screen-level decision the brief never made, so PR6b-1 left the
whole panel alone rather than guessing.

Fix: decide what belongs in `Advanced details` going forward (template and
grading configuration panels plausibly stay; the raw path in item 13 and
the duplicated workflow path do not), then reconcile the two disclosures.
Bigger than a one-line fix — likely its own small PR.

---

## 15. `Sections` renders twice — **Optional**

Once in the Assignment facts card, per section 5.3's explicit field list;
once in the untouched Roster card, which already showed it before PR6b-1
and was deliberately not rewritten.

This is redundancy between two legitimately visible cards, not the
hidden-implementation duplication PR6b-1 fixed elsewhere (moving slug, LMS
id, and the two path fields out of visible text and into Technical
details). Both renderings show the same faculty-authored fact in a
reasonable place for it.

Fix, if ever: drop it from one of the two cards. Low priority — it is not
incorrect, just repeated.

---

## 16. `tools/ui-snapshots` was never set up — **Should fix**

Section 7 requires screenshots attached to the PR, pointing at
`tools/ui-snapshots`. The directory has `capture.cjs`, `snapshot-setup.ts`,
`wrap.mjs`, and a README, all from PR1 — but no
`vitest.snapshot.config.ts`, no `package.json` script, and no `.gitignore`
entry for its output.

So the capture code exists and has never been runnable. No PR in this
redesign — PR1 through PR7-1a — has satisfied the screenshot requirement,
and none could have. This is the definition of done being partially
unmeetable from the start, not a series of individual omissions. Section 7
now says so directly, with a pointer back here.

Fix: a one-time setup task — the vitest config, the package script, the
`.gitignore` entry, and whatever the Electron-driven capture step needs to
run headless. Small, but it belongs to nobody's feature PR, which is why it
has stayed undone through eight of them.

---

## 17. `AssignmentEditPage.tsx` has no test file — **Resolved**

There is no `AssignmentEditPage.test.tsx`. PR7-1 changed production code in
this file — added the required `onSuccess` prop and wired the toast — with
no coverage beyond typecheck and the absence of regressions elsewhere.

The page renders `ConfirmationWithPreviewModal`, so it is one of the eight
call sites (across five caller files, `GradingWorkspacePage.tsx` alone
accounting for four) affected by both the double-submit fix (`bbd6bee`) and
the lockup fix (`c7d8000`) — and it is the only one of the five caller
files with no test file at all. `AssignmentSetupPage`, `RosterManagerPage`,
`AssignmentDetailPage`, and `GradingWorkspacePage` each have an existing
suite that at least renders the page and exercises some of its flows.

Fix: a new `AssignmentEditPage.test.tsx` covering, at minimum, the preview
and confirm flow through to a successful save, so the modal wiring in this
file has the same floor of coverage as its siblings.

Resolved: `AssignmentEditPage.test.tsx` now covers loaded required-file and
rubric rows, stable-key focus regression behavior, add/reorder/remove, request
projection, and the preview/confirm/save flow. The tests exposed that editable
React keys remounted rows as faculty typed; Assignment Edit now uses stable
UI-only draft identities, which are projected out before IPC requests.

---

## 18. Page-level fixtures never mock `getAssignmentGradingLifecycle` — **Worth fixing**

Neither `AssignmentDetailPage.test.tsx` nor `DashboardPage.test.tsx` mocks
`getAssignmentGradingLifecycle` in its default fixture, so the endpoint is
`undefined` in every page-level test but one. Two consequences worth
stating plainly:

- The lifecycle strip has never been exercised through the page — only in
  its own isolated `AssignmentDetailLifecycleStrip.test.tsx`.
- PR6b-3's student table saw zero students in every pre-existing page test
  (the lifecycle fetch resolves to nothing, so `AssignmentDetailStudentTable`
  renders its "No active students yet" empty state), which is why none of
  those existing tests needed updating when the table was added.

PR6b-3 added one integration test
(`AssignmentDetailPage.test.tsx`, "wires the lifecycle rows and grade
status into the student table in the main column") that mocks the fetch
and drives real data through the page. That closes the gap for the student
table specifically, but the general gap — every other page-level test
still renders this screen as if the lifecycle endpoint does not exist —
remains.

Fix: a shared fixture (a default `getAssignmentGradingLifecycle` mock with
a small, realistic roster) that page-level tests can pull in, so
lifecycle-dependent UI is exercised through the page by default rather
than by one exception.

---

## 19. A concurrency path jsdom cannot reach — **Accepted limitation**

`confirmPublishReport`'s mutation-in-flight guard
(`gradingMutationStudents.current.has(studentId)`, in
`GradingWorkspacePage.tsx`) is genuinely reachable by a user, and is the
path that produced the modal lockup fixed in `c7d8000`. It has no
regression test, and the reason is structural rather than an omission.

Every button that opens a per-student confirmation modal is disabled on
`gradingMutationStudentId !== undefined` — a single value, not scoped to a
specific student — while the guard itself reads
`gradingMutationStudents.current`, a ref-backed set. Reaching a state where
the single flag has cleared (re-enabling the button) while the set still
holds a stale entry for that student requires a cleanup-ordering race
between two independently updated pieces of state. Testing Library's
synchronous `act()` model collapses exactly this kind of race: updates that
would interleave under real async and paint timing land in the same commit
in a test, so the divergent-but-momentarily-consistent state a real user
could hit is not producible through `fireEvent`.

This is the same class of problem as item 7's intermittent failures — real
behaviour the test environment cannot represent — though item 7 was a
timing/contention issue that resolved given enough wall-clock time, where
this is structural and cannot be reached in jsdom regardless of timeout.

Recorded as an accepted limitation with its reasoning, so the next person
who notices the missing test finds the analysis instead of repeating it.

Fix, if ever: make the two pieces of state one. If the guard and the
button's disabled condition both read the same source — the ref-backed set
directly, or a value derived from it, rather than a separately updated
single value — the race disappears rather than needing to be tested.

---

## 20. Remove course folder has no confirmation at all — **Worth fixing**

`DashboardPage.tsx:399` (`handleRemoveCourseFolder`) calls
`window.graiderUI.removeCourseFolder(id)` directly from a button click,
with no confirmation step of any kind — not a typed word, not even a
Cancel/Confirm prompt.

PR7-2 gated the three actions the destructive-action rule (README section 2) actually reaches: they affect a roster or student repositories. This one
doesn't. `removeCourseFolder` resolves to `removeCourseFolderFromRegistry`
(`main.ts:512`), which only unregisters the folder from Graider's own local
registry (`courseRegistry.ts:349`) — it deletes nothing on disk and touches
no student repository. The rule's typed-word requirement does not reach
it, and PR7-2 deliberately left it ungated rather than inventing a
requirement the rule doesn't impose.

It is still an unconfirmed, destructive-_looking_ action on a single
click. Re-adding the folder is easy — nothing was actually destroyed — but
a faculty member who clicks it by accident today gets no warning and no
way back except knowing to re-add it.

Fix: a lightweight confirmation — a plain Cancel/Confirm prompt is enough,
no typed word required — so a misclick doesn't silently drop a course
folder from the list.

---

## 21. Raw ISO fallback defeats the date formatter — **Should fix**

`AssignmentDetailPage.tsx:489` (Due) and `GradeStatusPage.tsx:488` (Last
refreshed) fall back to the raw ISO string (`?? detail.deadline.dueAt`,
`?? activeStatus.refreshedAt`) when `formatReadableDateTime` returns null.
The shared module guards invalid dates correctly; these two callers print
the raw value anyway. A real §2.3 violation that survived the fix that
found it.

---

## 22. `assignmentDetailClipboard.ts` duplicates `components/clipboard.ts` verbatim — **Worth fixing**

The same one-job-three-implementations pattern PR8-1 fixed for dates.

---

## 23. Raw enum text in status `<option>` labels — **Should fix**

`RosterManagerPage.tsx:538–539` renders `<option value="active">active</option>`
— the machine value is correct and also used verbatim as the visible label, so
faculty read lowercase enum words in a dropdown. `AssignmentEditPage.tsx:219`'s
select has the same shape. A §2.3 violation that PR8-2's instructions excluded
by treating the whole control as off-limits; the bound value must stay
machine-readable, the option text should not.

---

## 24. Diagnostic severity renders lowercase, and a test pins it — **Should fix**

`formatStatusLabel` has an entry for `error` but not `warning` or `info`, so
those reach the fallback and render lowercase. `DashboardPage.test.tsx`
explicitly asserts the lowercase text, so the violation is now held in place
by a passing test. Fixing it means changing that assertion.

---

## 25. Raw filesystem path in the repository-download results panel — **Should fix**

`AssignmentDetailPage.tsx:2475` renders
`{target.repositoryName} — {target.status} — {target.localPath}`. PR8-2 fixed
the status; the path remains, outside any disclosure, on a screen that has
been through the redesign. Deciding where it should live is a §2.4 question.

---

## 26. Routed URLs are not shareable outside this window — **Accepted limitation**

PR10-1 added a real router (`HashRouter`, README section 4.1), so every
routed screen now has a URL. That URL only means something inside the
Electron window that produced it — pasting `#/course/csc1120/27s1/lab02` to
a colleague, or into a new tab, does nothing, because there is no
`file://`-served web server backing it and no other window watching for it.

A genuinely shareable link needs a registered custom protocol (e.g.
`graider://`) and an `open-url` handler in `ui/electron/main.ts` that turns
an incoming link into a navigation inside a running (or newly launched)
window. That is Electron main-process and packaging work, not router work,
and PR10-1 did not add it.

Fix, if this is ever wanted: register the protocol, handle `open-url` (macOS)
and the second-instance argv (Windows/Linux) in `main.ts`, and translate the
incoming URL into the `HashRouter`'s path.

---

## 27. This document's section 4 diverged from the code it described, again — **Worth fixing (process, not code)**

PR10-1 found section 4.1's six-route table describing a router that did not
match what existed: three of its six routes named a screen with no
component (course page, term setup wizard) or that wasn't a screen at all
(publish review is workspace state), while five already-built screens had
no route at all. Section 4.1 has been corrected to match what shipped.

This is the fourth time a section of this document has been found to
describe something other than the code: section 5.3's facts card (item
9-adjacent work), section 5.7's "duplicate" tables, section 5.4's count
mismatch, and now section 4.1's route table. Individually each was a small
correction. As a pattern, it says something about this document worth
stating plainly for whoever picks up steps 11 and 12 (the term setup
wizard, and the component split in section 4.2): **this document's
descriptions of _symptoms_ — a bug, a missing behavior, a rule to follow —
have held up. Its descriptions of _code inventories_ — what exists, what a
screen contains, how many of something there are — have not, four times
running.** Before implementing against a table, list, or count in this
document, check it against the code first; do not assume the description
is current just because the rule it's illustrating still holds.

Fix: no code fix. A habit for whoever reads this document next.

**Applied for the first time, 2026-09.** Step 11's feasibility pass
(`docs/ui-redesign/step-11-feasibility.md`) is this item's own advice put
into practice before implementation, rather than corrected after the fact
like the four cases above: check the document's description of what the
code supports against the code itself before building against it. It
found three missing foundations (items 33-35) and substantial overlap with
`CourseSetupPage.tsx`, and section 5.5 was corrected as a result instead of
a five-screen wizard being built on top of them. Step 12 (§5.6, the roster
manager rebuild) is next — give it the same pass before implementation,
not after.

---

## 28. What is a course page for? — **Optional**

README section 4.1's original six-route table included
`/course/:courseSlug/:termSlug` — a course-level page, distinct from the
dashboard and from assignment detail. PR10-1 did not build it: no section
of this document says what it would show that the dashboard's per-course
card doesn't already show, and no component for it exists anywhere in
`ui/src`.

Before anyone builds this route, the open question is not "how" but
"why": what does a faculty member do on a course page that they cannot
already do from the dashboard card for that course-term? If the honest
answer is "nothing new," the fix is to remove the route from the
document, not to build a page to fill it.

---

## 29. Navigating to a just-created assignment can race its own cache refresh — **Resolved**

`DashboardPage.tsx`'s `onOpenAssignment` handler (passed to
`AssignmentSetupPage`, ~line 379) does:

```ts
setSelectedAssignmentSetupCourse(null);
void handleRefreshCourseFolder(selection.courseFolderId);
// ...then immediately navigate() to the new assignment's detail route
```

`handleRefreshCourseFolder` is fired and not awaited, but the `navigate()`
call right after it runs regardless of whether the refresh has completed.
`AssignmentDetailRoute` resolves the new assignment by looking it up in
`aggregatedDashboard.cards` (`dashboardResolvers.ts`'s
`resolveAssignmentSelection`) -- the same cache `handleRefreshCourseFolder`
is in the middle of repopulating. If the IPC round trip to reload the
course folder's dashboard JSON takes longer than the render that follows
`navigate()` (a real possibility -- it shells out to the Graider CLI), the
new assignment's slug will not yet be in the card's assignment list, and
`AssignmentDetailRoute` will render `RouteNotFound` ("This assignment could
not be found. It may have been deleted or renamed.") for an assignment that
was, in fact, just created successfully.

Confirmed as a real, reachable path by tracing the code (not by
reproducing the timing in a test -- jsdom's mocked promises resolve fast
enough that the race is very hard to force reliably); not fixed here per
PR10-1a's explicit scope.

This is a different failure mode from PR10-1a's crash: no white screen, no
uncaught exception -- a plain, on-brand "not found" message the user will
likely read as "did that not work?" and go looking for the assignment
again from the dashboard, where it will in fact be present once the
refresh completes.

Fix: await `handleRefreshCourseFolder(selection.courseFolderId)` before
calling `navigate(...)`, so the cache is guaranteed to contain the new
assignment before `AssignmentDetailRoute` tries to resolve it. This makes
the create-assignment flow's navigation slightly slower (one IPC round
trip) rather than occasionally wrong.

**Confirmed visible in a running app, then fixed in PR10-1c** -- hand
testing showed exactly this: "Page could not be found" flashed before the
new assignment's detail screen replaced it. Fixed without an await and
without a timeout: `useResolvedAssignmentSelection` (`useRouteResolution.ts`)
now checks whether the assignment's own card's folder is currently being
refreshed (`refreshingId === card.sourceFolderId`, or a refresh-all is in
flight) before concluding "not found." A missing assignment in a folder
that is mid-refresh now resolves to `loading` (rendering `RouteLoading`)
instead of `not_found` (rendering `RouteNotFound`), so the screen goes
straight from "loading" to the real assignment once the refresh lands, with
no error flash in between. `useResolvedCourseFolder` (the roster route's
resolver) was deliberately left unchanged: no current navigation path
reaches it before its folder has already loaded, so there is no live case
for it to fix. Regression test in `App.test.tsx` drives a controlled,
manually-resolved refresh promise to observe the loading state directly;
confirmed it fails (shows `RouteNotFound`) without the fix.

---

## 30. Grading navigation ignored the active student filter — **Resolved**

The student list already rendered filter-aware entries, but J searched the
full roster for the next ungraded student and K decremented the global roster
index. Under Graded or Published, either shortcut could select a student that
was not visible. Shift+J was documented as full-roster navigation but was not
implemented distinctly from J.

Resolved: J and K now navigate the same filtered entries rendered by the list,
using their original roster indexes and wrapping at both ends. If the selected
student is outside the filter, J selects the first visible row and K the last.
Shift+J now wraps through the complete roster regardless of the filter. The
visible Previous/Next controls share the filter-relative behavior, and focused
keyboard, list-pane, and control tests cover the regression.

---

## 31. Assignment and roster mutations stayed local until manually published — **Resolved**

Graider had a safe course publishing service, but assignment create, edit,
delete, group settings, and roster/section mutations only wrote to the local
course repository. The rendered dashboard could therefore report pending
managed changes until a faculty member noticed and used Publish Course Changes.
The allowlist also omitted an assignment's `groups.csv`, so group configuration
could not be included even by the existing publication path.

Resolved: successful local assignment and roster/section mutations now run the
existing safe publisher after their local and Student Repository access-page
work completes. Publication failures preserve the durable local change and
return an explicit saved-locally warning; manual Publish Course Changes remains
the retry path. The allowed managed paths now include assignment `groups.csv`,
and regression tests cover groups files, tracked deletions, safe failure
semantics, and the roster access-page partial-success path.

---

## 32. Read-only source-editor focus disabled grading shortcuts — **Resolved**

The workspace shortcut guard correctly suppresses real faculty typing controls,
but it identified Monaco solely by its internal textarea target. Since the
source viewer is read-only, that made the central evidence-review workflow
keyboard-dead whenever source code had focus: faculty could not create a
source-anchored comment or inspect checks, history, or another student without
moving focus away first.

Resolved: the central shortcut policy now recognizes descendants of Graider's
read-only `.grading-source-editor` before applying the editable-control guard,
and listens in capture phase so Monaco cannot hide the event. Workspace tests
model Monaco's focused textarea and cover source-comment targeting, checks,
history, navigation, reusable comments, modifier keys, and continued
suppression in comment title/body/deduction/category fields.

---

## 33. No column-header mapping for roster CSV import — **Should fix**

Confirmed while assessing step 11 (`docs/ui-redesign/step-11-feasibility.md`):
roster import matches CSV headers by exact string equality in three
separate places — `src/roster/roster-loader.ts:90-95` against
`src/roster/roster-validation.ts:20-23`'s literal column-name constants,
`ui/electron/courseSetupService.ts:15-24`'s two hardcoded accepted header
sets, and `ui/src/roster-manager/RosterManagerPage.tsx:178-182`'s
"Uploaded roster must use the canonical four-column Graider header." There
is no header-to-field mapping code anywhere — no detection, no UI, no
normalization from an arbitrary source header (a raw LMS export, for
example) to Graider's four canonical fields.

**Standalone work, not a wizard prerequisite.** CSV import today depends on
the file already having Graider's exact column names; anyone importing a
roster exported from a system other than Graider's own format — Canvas or
otherwise — hits the same hard rejection regardless of whether §5.5's
wizard is ever built. §5.5 names this as the foundation for future Canvas
field mapping, but the gap and its fix stand on their own.

Fix: a pure mapping function (best-effort default by name similarity,
user-editable) plus a small confirmation UI, validated through the existing
per-row rules in `roster-validation.ts`. No backend GitHub work. Roughly
one panel-plus-tests in size.

**Not urgent.** No new rosters are being created until next term.

---

## 34. No draft or resumable-state storage exists anywhere in the app — **Worth fixing**

Confirmed while assessing step 11: `ui/electron/localSettings.ts` (60
lines, read in full) stores exactly `currentFacultyMsoeUsername` and
`lastChooserDirectory`. No other draft-persistence mechanism exists in the
main process, the course registry, or any renderer screen —
`CourseSetupPage`, `AssignmentSetupPage`, and `RosterManagerPage` all hold
form state in React state only, lost on window close.

**No current caller.** §5.5's "Save and finish later" was the motivating
case, but the term setup wizard is deferred indefinitely (see §5.5's
correction), so nothing in the app needs this today. Recorded here for
whichever future multi-step flow needs to survive an interruption first —
optional until one does, not a prerequisite for anything currently planned.

Fix: a new local JSON draft module, same shape as `localSettings.ts`
(`userData`-scoped file, simple read/write helpers), keyed by course folder
and flow/step identity. The storage mechanics are small; the draft shape
itself is not trivial once it has to cover every field a multi-step flow
would collect, including uploaded CSV content and column mappings.

---

## 35. Roster, section, and faculty mutations cannot be deferred past their own save — **Worth fixing**

The flip side of item 31's fix, found while assessing step 11.
`ui/electron/courseMutationPublicationService.ts`'s
`publishSuccessfulCourseMutation` unconditionally pushes to GitHub
immediately after any wrapped mutation succeeds, and wraps `saveRoster`,
`removeRoster`, `removeSection`, `saveAssignmentSetup`, `saveAssignmentEdit`,
`deleteAssignment`, and `saveAssignmentGroupConfig` (`ui/electron/main.ts`
lines 672, 683, 755, 764, 772, 785, 880, 892, 904). Before item 31 this
was the actual bug (changes stayed silently local); now the opposite
problem exists — nothing that calls these paths can hold a change back from
GitHub, even temporarily, even when the caller has a good reason to (a
multi-step flow, a batch of related edits meant to land together).

**A real constraint on any future deferred operation, wizard or not — not
specific to §5.5.** It surfaced while assessing the term setup wizard
(`docs/ui-redesign/step-11-feasibility.md` §3 has the full analysis of that
case), but the underlying fact is general: nothing that calls
`saveRoster`, `removeRoster`, `removeSection`, or the wrapped assignment
mutations can currently hold a change back from GitHub, even briefly, even
when the caller has a good reason to — a multi-step flow, a batch of
related edits meant to land together, a future undo window, anything. Any
feature that wants that will hit this, not just a wizard.

**This is not a defect.** The auto-publish is correct behaviour for every
caller today and was a deliberate fix (item 31) for changes silently
staying local. Do not remove or weaken it to unblock some future caller —
add a separate, opt-in deferred path instead.

Fix: scoped, not a rearchitecture — new or parameterized IPC entry points
for these mutations that skip the auto-publish wrapper, with the caller
responsible for an explicit, single `publishCourseChanges` call when it's
actually ready. `saveCourseSetup` already has no auto-publish and needs no
change. No current caller needs this yet — the term setup wizard that
motivated it is deferred indefinitely — so this is background knowledge to
have on hand, not queued work.

---

## 36. Roster CSV parsing is implemented four times, not two — **Worth fixing**

**Corrected while assessing step 12
(`docs/ui-redesign/step-12-feasibility.md`) — this item undercounted.**
Found while assessing step 11, independent of whether any wizard is ever
built: roster CSV parsing exists as four separate implementations, not
two. `src/roster/roster-loader.ts` + `src/io/csv.ts` (the CLI/grading
path, the most complete and validated of the four),
`ui/electron/courseSetupService.ts` (initial roster upload during course
creation), **`ui/electron/rosterManagerService.ts`'s own `parseCsvLine`/
`parseRows` (lines 39-82)** — missed in the original count, a third,
independent parser with weaker validation than `roster-loader.ts`'s — and
`ui/src/roster-manager/RosterManagerPage.tsx`'s client-side
`parseUploadedRoster` ("Replace from CSV", lines 38-52). Same shape as
item 22 and the three-date-formatters pattern this document already
tracks, now with twice as many instances as first recorded.

Fix: extract one shared module (parsing, column matching per item 33,
validation, and the row-level diffing item 2 of the step-12 assessment
needs) and converge all four call sites on it over time. Build it as part
of step 12's roster manager rebuild (§5.6), since that screen needs it
fresh; step 11's `CourseSetupPage.tsx` redesign and the CLI path can adopt
it afterward rather than each growing its own version further.

---

## 37. Roster carries no provenance — **Worth fixing**

Found while assessing step 12. `RosterRow` (`ui/electron/ipc.ts:522-527`)
is `{studentId, githubUsername, section, status}`; `RosterLoadResult` and
`RosterSaveResult` (same file, 534-565) carry no timestamp, author, or
origin either. `ui/electron/rosterManagerService.ts` never reads file
mtime or git metadata as a proxy. There is no way today to answer "where
did this roster come from, and when was it last touched?"

Needed for §5.6's source bar (`Source: CSV upload`, `Last updated Jun 2 by
jones`) and its own note to "build the source as a first-class field
now" ahead of eventual Canvas sync.

Fix: small. Add an optional `source` field (`kind: "csv_upload" |
"manual_edit"`, `updatedAt`, `updatedBy`) to `RosterLoadResult`/
`RosterSaveRequest`, written by `saveRoster` and read by
`getRosterForSection`. `updatedBy` can reuse the existing
`currentFacultyMsoeUsername` local setting. No rearchitecture — one field
threaded through three existing functions.

---

## 38. No per-section roster count aggregation in the Electron IPC layer — **Resolved**

Found while assessing step 12. `AssignmentSetupTerm`
(`ui/electron/ipc.ts:229-232`) is `{code, sections: string[]}` — section
IDs only, no counts. The backend already computes exactly the shape
wanted — `RosterSummary` in `src/roster/roster-models.ts`
(`studentCount`, `activeStudentCount`, `droppedStudentCount`,
`holdStudentCount`), produced by `src/roster/roster-loader.ts` — but it is
wired into the CLI/grading path only, never exposed to the Electron IPC
layer `RosterManagerPage.tsx` and `ui/electron/rosterManagerService.ts`
use.

Needed for §5.6's section tabs with counts and its small stats card.

Fix: small. A bulk IPC read that loads every section's roster for a term
once and returns per-section counts, reusing whichever shared parser item
36 converges on rather than adding a fifth implementation. The stats card
itself needs nothing new once a section is loaded — it's a client-side
aggregate over data already in hand.

Resolved in PR12-3: `getRosterSectionSummaries` is a bulk Electron IPC read
that returns every configured section for one registered course + term. A
successful section exposes `studentCount`, `activeStudentCount`,
`droppedStudentCount`, and `holdStudentCount`; missing and invalid rosters
remain explicit per-section states with faculty-safe diagnostics, so one bad
CSV cannot hide usable neighboring counts. Its new
`roster-section-summary-context.ts` backend is bundled to
`ui/dist-electron/rosterSectionSummaryBackend.cjs` by the established
context/CJS bridge and uses PR12-2's `parseAndValidateRosterCsv` plus the
canonical shared summary helper. Focused context, service, request-validation,
and preload tests protect the integration, including reordered canonical CSV
columns, normalization warnings, empty valid rosters, missing rosters, and
invalid rosters. Item 36 remains open: the older roster-manager read/save
paths have not yet been migrated.

---

## 39. Comment-library mutations exist but have no faculty UI — **Resolved**

The course-level JSON model, context operations, Electron service, validated
IPC handlers, and preload APIs already support reusable-comment create, edit,
and delete. The renderer currently calls only the load operation. The grading
workspace can browse and apply reusable comments, but cannot manage them, and
there is no dedicated course-level Comment Library route.

This leaves substantial implemented infrastructure inaccessible and forces any
library maintenance outside Graider. The fix is shared create/edit/delete UI
used by both the grading workspace and a dedicated course-level management
screen, not another storage model or parallel set of APIs. See
`comment-library-feasibility.md`.

COMMENT-3 resolved the grading-workspace portion. COMMENT-5 adds the dedicated
course-level route, dashboard course-term and assignment-detail navigation,
search/tag filtering, shared editor/formatting, publication-aware CRUD, and
an explicit deletion confirmation that preserves applied student snapshots.

---

## 40. The canonical comment library is excluded from safe course publication — **Resolved**

The managed allowlist in `coursePublishService.ts` does not include
`.graider/grading/comments.json`. Current local library mutations therefore
cannot automatically publish and cannot be picked up by manual **Publish
Course Changes**. This contradicts the library's course-shared purpose.

Fix narrowly: allow exactly the canonical file, wrap create/edit/delete with
the existing local-mutation-then-publication service, and expose full success
versus saved-locally/publication-failed results. Do not allow `.graider/**` and
do not weaken protection for unrelated staged or local files. A non-fast-
forward push may safely fail initially; the local mutation must remain durable.

Resolved in COMMENT-2: the publisher now allowlists exactly
`.graider/grading/comments.json`; neighboring `.graider` paths remain
unmanaged. The authorized Electron library service centrally publishes every
successful create, edit, and delete while leaving loads read-only. Mutation
results preserve local success and the created/edited value where applicable,
add a typed publication outcome, and append **Publish Course Changes** recovery
guidance when publication fails. Tests protect exact-path classification,
create/edit/delete publishing, unrelated-file and unrelated-staged-work safety,
no-upstream durability, preload typing, and two-clone non-fast-forward behavior
without force-push, pull, merge, reset, or rollback.

---

## 41. Comment text has no shared safe code-formatting semantics — **Resolved**

Reusable and applied comments render as plain React text, while the generated
student report escapes the entire string into a whitespace-preserving
paragraph. Faculty cannot visually distinguish example code from prose, and
there is no shared interpretation layer keeping UI and report output aligned.

Fix with a deliberately small parser over the existing string: inline
backticks plus triple-backtick fenced blocks with optional language metadata.
Feed a React renderer and an explicitly escaped report renderer from the same
typed model. Do not enable general Markdown, raw HTML, or rich-text storage.

Resolved in COMMENT-1: `src/shared/comment-content.ts` is the one neutral
parser/model used by both the React `FormattedGradingComment` component and the
student HTML report renderer. It recognizes only paired inline backticks and
valid triple-backtick blocks, retains optional language metadata without
rendering/highlighting it, and fails closed for unmatched backticks and
unclosed/invalid fences. Scoped UI and standalone-report CSS make inline and
block code distinct without affecting other code surfaces. Parser, React,
report, editor, and keyboard-focus tests cover malformed input, escaped hostile
HTML, whitespace, reusable/applied bodies, and report use for general and
source-anchored feedback.

---

## 42. Free-form tag authoring lacks autocomplete and canonical duplicate normalization — **Resolved**

The schema already accepts tags, search/filtering is case-insensitive, and the
workspace derives a case-insensitively deduplicated list for filters. There is
no tag authoring control, however, and backend normalization trims/removes
blanks but still permits case-only duplicates such as `Java` and `java` in the
same reusable entry.

Fix with an accessible free-form tag/token input that suggests existing course
tags and accepts new values. Normalize whitespace and deduplicate
case-insensitively at the backend boundary while preserving established display
casing.

Resolved in COMMENT-3: the shared editor supplies accessible removable tag
tokens, native keyboard/pointer suggestions from existing course tags, and
free-form entry. Canonical storage now trims, removes blanks, and deduplicates
case-insensitively while retaining the first accepted display spelling/order.

---

## 43. One-shot comments cannot be promoted to the course library — **Resolved**

Faculty can apply an ad hoc student comment or apply a reusable snapshot, but
there is no bridge between those workflows. Useful one-shot feedback must be
manually recreated outside the current grading flow to become reusable.

After the student comment is successfully applied, offer **Save to course
library** with a prefilled reusable-comment editor. The library save remains a
separate opt-in mutation; cancellation or failure leaves the student comment
unchanged, and successful promotion does not retroactively couple the applied
snapshot to the new library entry.

Resolved in COMMENT-4: after a one-shot add is persisted, the grading workspace
offers a compact, student-scoped **Save to course library** action. It opens the
shared editor with the submitted title/text, a negative reusable default for
the nonnegative applied deduction magnitude, any configured rubric category,
and no inferred tags. The separate create mutation updates the in-memory
library even if publication fails, preserves the recovery warning, and never
rewrites the applied snapshot or adds `sourceCommentId`.

---

## Suggested order

Nothing is blocking PR6b anymore — proceed to it directly.

Items 1, 2, 3, 4, 6, 7, 9, 29, 30, 31, and 32 are resolved and no longer part of this
sequence.

Items 5, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
26, 27, 28, 33, 34, 35, 36, and 37 can wait until after the redesign. Item 38
is resolved.

Priority update after PR12-3: COMMENT-1 resolved item 41. Address items 39, 40,
42, and 43 through COMMENT-2 to COMMENT-5 in
`comment-library-feasibility.md`, then resume PR12-4
(item 37) and PR12-5. The remaining Step 12 work is deferred by an explicit
priority decision, not blocked or abandoned.
