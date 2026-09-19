# Graider UI redesign — deferred issues backlog

Issues surfaced during PR1–PR6a that were deliberately left unfixed, either
because they were out of a PR's scope or because fixing them needed its own
decision. Each entry says what it is, why it matters, and how big it is.

Work these between PR6a and PR6b. Item 1 is a hard prerequisite for PR6b.

Status key: **Blocker** · **Should fix** · **Worth fixing** · **Optional** ·
**Resolved**

---

## 1. No roster-wide grading status aggregate — **Blocker**

`GradingState` persists a per-student grading status on disk, and
`projectGradingStudent` reads one student at a time. Nothing aggregates across
a roster.

Consequences:

- `AssignmentDetailPage` cannot tell "submissions arriving" from "all graded"
  from "everything published". PR6a collapsed the primary action to a plain
  "Continue grading" because of this.
- **PR6b's lifecycle strip cannot be built.** Section 5.3 specifies
  `Grading N of M done` and `Published N of M sent`; neither number exists.
- The grading workspace works around it by loading every student individually,
  which is why the publish review needed a concurrency cap of 5 to avoid
  spawning one `git` process per student.

Fix: a CLI command returning per-student grading status for an assignment in
one call, surfaced through IPC. Belongs in the CLI, matching the existing
architecture where the CLI owns logic and emits JSON.

Do this first. It unblocks PR6b, retroactively simplifies the grading
workspace, and removes the reason the concurrency cap exists.

---

## 2. CI does not run any UI checks — **Should fix**

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

---

## 3. Status-to-label logic is duplicated — **Should fix**

`AssignmentDetailPage.tsx` (~line 1100) and `GradeStatusPage.tsx` (~line 109)
contain near-identical helpers mapping `GradeStatusRepositoryStatus` to display
strings, plus near-identical summary-text helpers. A recent bugfix adding the
`not_configured` status had to be applied to both.

Section 2.3 of the redesign brief calls for one status-mapping module so the
strings are reviewable in one place.

Fix: extract to a shared module. Note there are now six statuses, not five —
`not_configured` is recent and easy to drop during a rewrite.

Do this before PR6b, which rewrites one of the two call sites.

---

## 4. `commentMutationStudentId` is misnamed — **Worth fixing**

Declared at `GradingWorkspacePage.tsx:594`, but it is set by the publish path
(~2198) and the bulk path (~2260) as well. It is a general grading-mutation
flag, not a comment-specific one, and it is now load-bearing in the unsaved
draft guard.

A variable named for one thing that tracks three will eventually cause a real
bug. Pure rename, no behaviour change.

---

## 5. `globals.css` is a single 2,982-line file — **Worth fixing**

Up from 2,105 at the start of the redesign, a 42% increase, with five more
screens still to come.

Fix: split by screen or by concern, keeping the token block as the single
source of truth. Best done at a natural boundary rather than mid-screen.

---

## 6. Two primary actions coexist on the grading workspace — **Worth fixing**

Section 2.1 says one primary action per screen. The grading workspace has the
per-student action (Mark Complete / Publish Report) in the grading pane and
"Publish N reports" in the header.

This is arguably a legitimate exception: one acts on the current student, the
other on the session. But it should be resolved deliberately, by making the two
scopes look different from each other rather than demoting one — and it should
be decided before PR6a's header pattern is copied to other screens.

---

## 7. Intermittent test failures — **Worth fixing**

Two unrelated flakes seen so far, neither reproducible on immediate rerun:

- An "Add faculty" test in `RosterManagerPage` failed once in four runs during
  the sibling-panel PR. Nobody has touched roster code during the redesign.
- `GradingWorkspaceKeyboardShortcuts.test.tsx` failed once during PR6a and
  passed on rerun. PR6a did not touch the grading workspace.

Two flakes in different files now. Watch for recurrence. Chase before the
roster work (PR12) if it happens again, not now.

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

## Suggested order

1. Item 1 — grading status aggregate (blocker for PR6b)
2. Item 2 — CI runs UI checks, plus the `/private/tmp` fix
3. Item 3 — shared status-mapping module
4. Item 4 — rename `commentMutationStudentId`
5. Item 6 — decide the two-primary-actions question
6. Then PR6b

Items 5, 7, 8, 10 can wait until after the redesign.
