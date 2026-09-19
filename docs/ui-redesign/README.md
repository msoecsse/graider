# Graider UI redesign — implementation brief

This document is the specification for the UI redesign. It is written to be
self-contained: an agent working in this repository should be able to implement
any section of it without seeing the original mockups.

Visual reference (for humans, not readable by the coding agent):
the design canvas shared by the course team.

---

## 1. Why this work exists

Graider is moving from 4 faculty to roughly 20, including people who will use it
a handful of times per term. The current UI shows every capability on every
screen: 148 buttons across the app, 27 of them on the assignment detail page
alone. Nothing is sequenced, nothing is hidden, and nothing tells a new user what
to do next.

Two usage patterns drive every decision below.

**Weekly loop (high frequency).** Create 1–3 assignments per course, apply them,
then grade and publish reports throughout the week as submissions arrive. This
must be fast for experts and obvious for novices.

**Term start (twice a year, everyone).** Create the course for a new term,
upload rosters, assign faculty to sections. Nobody builds fluency at something
they do twice a year, so this flow must hold the user's hand.

A Canvas integration is planned but not built: grade sync, roster import,
repository links. Design decisions that make that retrofit cheaper are called out
as **[Canvas-ready]**.

---

## 2. Rules that apply everywhere

These are not suggestions. If a screen violates one of these, the screen is
wrong.

### 2.1 Action hierarchy

- **Exactly one primary action per screen.** It is filled, it is the accent
  colour, and it names the next step in the workflow. "Refresh" is never the
  primary action.
- **At most two secondary actions.** Outlined, in the header.
- **Everything else goes in an overflow menu** (`⋯`). Rare, administrative,
  and destructive actions live there, grouped under headings with a one-line
  caption each.
- **Destructive actions never sit inline with routine ones.** They go at the
  bottom of the overflow menu, visually separated. Anything that affects a
  roster or student repositories requires typing a confirmation word.
- **Never render a disabled button with a generic explanation.** Strings like
  "Unavailable for this assignment" or "This action is not available in this
  view" must be deleted. Either hide the action, or show the specific reason
  where the user is already looking.
- **No duplicate actions on one screen.** The current assignment detail page
  offers "Preview apply" twice and offers the same operation as both "Grade
  submissions" and "Preview grading". Each operation appears once, under one
  name.

### 2.2 Refresh

Data refreshes automatically on navigation. Manual refresh is an icon button
paired with a quiet "Updated 2 minutes ago" timestamp. It is never a prominent
labelled button, and never appears more than once per screen.

### 2.3 Plain language

Faculty are the users; the file format is an implementation detail.

| Never show                                                       | Show instead                                |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `student_repository_missing`                                     | No repository yet                           |
| `student_repository_exists`                                      | Repository ready                            |
| `student_status_hold`                                            | Student on hold                             |
| `2027-06-15T23:59:00+09:00`                                      | Mon Jun 15, 11:59 PM                        |
| `Exit code 0`                                                    | (nothing — show the outcome)                |
| `workflow_dispatch status: Available`                            | (fold into one readiness line)              |
| Raw counts like "Would create 1 / Would update 1 / Would skip 1" | "2 repositories will be created, 1 skipped" |

Any status enum that reaches the UI needs a display-string mapping. Put these in
one module so they are reviewable in one place.

### 2.4 Hide the plumbing

File paths, slugs, LMS assignment IDs, manifest paths, workflow paths, artifact
names, branch status, and exit codes all move behind a single collapsed
disclosure labelled **Technical details**, placed last in a sidebar. Copy
buttons for paths live inside it, not in the main layout.

There is exactly one such disclosure per screen. The current dashboard shows
three "Advanced details" toggles at different nesting levels; that is the
pattern being removed.

### 2.5 Empty and error states

- An empty region gets an explicit empty state with an explanation and, where
  possible, the action that fills it. A half-width column containing only a
  collapsed toggle is not acceptable.
- Errors are stated in one plain sentence, followed by the reason, followed by
  one or two concrete ways to fix it, followed by what _is_ working. Never a
  diagnostics dump.
- A blocking error uses orange (`#bc4c00`), never the green accent, so "fix
  this" never looks like "proceed".

### 2.6 Modals

- A confirmation modal shows what will change (a diff), not raw file contents.
- A modal never displays a success message inside itself. On success it closes
  and a toast appears. (The roster save modal currently renders "Changes saved."
  next to a still-enabled Save button — this is a live double-submit bug.)

### 2.7 Accessibility

- Interactive elements are real `<button>`, `<a href>`, or `<input>` with a
  `<label>`. Never `onClick` on a `div` or `span`.
- Icon-only buttons carry `aria-label`.
- Minimum touch/click target 44×44 px for primary controls.
- Body text meets 4.5:1 contrast.

---

## 3. Visual system

### 3.1 Colour

```
--accent:            #1a7f37   /* primary actions, current step, selection */
--accent-strong:     #0a5c2b   /* links, text on light green */
--accent-soft:       #dafbe1   /* success chip background */
--accent-tint:       #eef6f0   /* selected row background */

--text:              #1f2328
--text-muted:        #57606a
--text-disabled:     #8c959f

--border:            #d0d7de
--border-subtle:     #eaeef2
--surface:           #ffffff
--surface-sunken:    #f6f8fa
--surface-raised:    #fbfcfd

--warn:              #bc4c00   /* blocking problems, point deductions */
--warn-text:         #8a4600
--warn-soft:         #fff8c5
--warn-surface:      #fffbef

--danger:            #a40e26
--danger-soft:       #ffebe9

--info:              #0969da   /* published state, informational notes */
--info-soft:         #ddf4ff
```

Keep the existing green. Do not introduce gradients.

### 3.2 Type

Body and UI: `'IBM Plex Sans', system-ui, sans-serif`
Code, paths, IDs, scores: `'IBM Plex Mono', monospace`

If the team prefers to stay on Inter, that is a one-line change in
`globals.css`; everything else in this brief is unaffected.

| Role                    | Size                    | Weight |
| ----------------------- | ----------------------- | ------ |
| Page title              | 20px                    | 600    |
| Wizard step title       | 24px                    | 600    |
| Section heading         | 15px                    | 600    |
| Eyebrow / column header | 11px, uppercase, 0.04em | 600    |
| Body                    | 13–14px                 | 400    |
| Caption                 | 11–12px                 | 400    |

### 3.3 Metrics

- Radii: 8px controls, 10px cards, 12–14px modals, 17px pills.
- Header height 68px. Footer/action bars 40–88px.
- Control heights: 44px primary, 40px secondary, 32–36px inline.
- Standard gaps: 8 / 10 / 16 / 24px. Page padding 20–24px.
- Table rows 10–12px vertical padding; header row on `--surface-sunken`.

---

## 4. Architecture changes

These make the screen work possible and should land early.

### 4.1 Add a router

`App.tsx` currently renders `DashboardPage` and nothing else. `DashboardPage`
holds ~20 `useState` hooks, seven of which are nullable "selection" values used
as navigation, resolved with early returns.

Replace with real routes:

```
/                                             dashboard
/course/:courseSlug/:termSlug                 course
/course/:courseSlug/:termSlug/roster          roster manager
/course/:courseSlug/:termSlug/setup           term setup wizard (step in query)
/course/:courseSlug/:termSlug/:assignment     assignment detail
/course/:courseSlug/:termSlug/:assignment/grade    grading workspace
/course/:courseSlug/:termSlug/:assignment/publish  publish review
```

This gives breadcrumbs, browser back/forward, and links faculty can share with
each other. It also removes every hand-placed "Back to dashboard" button and the
two separate "Back" buttons in the grading workspace.

### 4.2 Split the large components

`GradingWorkspacePage.tsx` (2,638 lines), `AssignmentDetailPage.tsx` (2,482),
and `DashboardPage.tsx` (1,048) each become a thin route component plus
presentational children. Do this as part of the screen work, not as a separate
refactor PR, so tests move with the code.

### 4.3 Shared components to build first

`PageHeader` (breadcrumb, title, meta, one primary + secondary + overflow),
`OverflowMenu`, `LifecycleStrip`, `StatusChip`, `FilterPills`, `DataTable`,
`EmptyState`, `TechnicalDetails`, `ConfirmDialog` (diff-based),
`UnsavedChangesBar`, `KbdHint`.

---

## 5. Screen specifications

### 5.1 Grading workspace — highest priority

This is the most-used screen and currently the least finished: it uses **none**
of the app's shared button classes, so every control renders as a raw browser
default. It also does not fill the window.

**Layout.** Full height, three panes between a header and a footer hint bar.

**Header (68px).** Back button; breadcrumb eyebrow `CSC1120 · Spring 2027`;
title `Lab 02` with `100 pts · due Mon Jun 15, 11:59 PM`. Right side: progress
readout `7 of 24 graded · 3 published` above a two-segment progress bar (accent
for graded, pale green for published); primary button `Publish N reports` with a
`P` key badge; overflow `⋯`.

**Left pane (300px).** Filter pills `To grade N` / `Graded N` / `Published N` /
`All N`, defaulting to **To grade**, with a `/` key badge that focuses the
active pill. (PR3 built filter pills, not a text input; PR4 mapped `/` to
focus the active pill accordingly.) Scrolling student list; each row is a button with a status dot
(grey = ungraded, green = graded, blue = published), name, `Section 001 · @user`,
and score or an em dash. Selected row gets `--accent-tint` background and a 3px
accent inset shadow on the left edge.

**Centre pane (flex).** File tab strip with a per-file comment count badge, and
on the right `Submitted Jun 14, 9:42 PM` plus a link to commit history. Below,
the source viewer with line numbers. Selected lines highlight in `--warn-soft`.
Anchored comments render inline beneath the lines they refer to, as a card with
author, a points chip, a line reference, and the comment text.

**Right pane (380px).** Fixed top block: student identity, grading status, the
score as a large accent number over `/ 100`, and one bar per rubric category
with `earned / max`. Scrolling middle: **Applied comments** (points chip, text,
location), **Comment library** (each entry a button with a number-key badge,
label, and points chip — clicking applies it and updates the score), and
**Automated checks** collapsed to a pass line plus any warning line with a View
link. Pinned bottom: primary `Mark complete and go to next` with a `⏎` badge,
and a quiet `Skip for now`.

**Footer (40px).** Persistent hint bar: `J` next student, `K` previous,
`C` comment, `1–9` library, `⏎` complete, `?` all shortcuts. On the right,
`Saved automatically`.

**Required behaviour changes**

- Score must not display a number when no rubric is configured. Show
  "No rubric — enter a score manually" instead of `100 / 100`.
- Student list status and the right-panel grading status must derive from the
  same source. They currently disagree.
- Navigation is **Next ungraded**, not Next. Shift-J moves to the next student
  including graded ones.
- Publishing moves out of the left sidebar to the header and its own review
  screen.

**Keyboard shortcuts.** Every shortcut must also have a visible control. Nothing
is keyboard-only.

| Keys            | Action                            |
| --------------- | --------------------------------- |
| `J` / `K`       | Next ungraded / previous student  |
| `⇧J`            | Next student including graded     |
| `G G`           | Jump to first ungraded            |
| `/`             | Focus the active filter pill      |
| `⇥` / `⇧⇥`      | Next / previous file              |
| `H`             | Commit history                    |
| `A`             | Automated checks                  |
| `C`             | Comment on selected lines         |
| `1`–`9`         | Apply library comment by position |
| `⌘K` / `Ctrl K` | Search comment library            |
| `M`             | Manual adjustment                 |
| `⌫`             | Remove last applied comment       |
| `⏎`             | Mark complete and go to next      |
| `S`             | Skip                              |
| `P`             | Open publish review               |
| `⎋`             | Close panel or dialog             |
| `?`             | Shortcut cheat sheet              |

Show `⌘` on macOS and `Ctrl` on Windows; detect, do not hardcode.

Shortcuts must be disabled while focus is in a text input, and the cheat sheet
is a modal listing them grouped as Move / Read / Grade / Finish.

### 5.2 Publish review

Reached from the grading workspace header or `P`. Explains in one line that
reports are committed to each student's repository and visible immediately.

Three sections: **Ready to publish** (checkbox per row, student, section, score,
comment summary — all checked by default), **Already published** (check icon,
greyed — no timestamp; the bulk publication result carries none, and PR5
correctly omitted it. Adding one would need a backend change), **Not graded
yet** (count only, with a line explaining they are excluded and can be
published later in the week).

Footer states the effect in plain terms — "4 reports will be committed to 4
repositories" — with Cancel and `Publish 4 reports`.

Partial mid-week publishing must be safe and obviously safe.

### 5.3 Assignment detail

**Header.** Breadcrumb, title, points and due date. One secondary action
(`Update student repositories`), one primary whose label depends on lifecycle
state, and `⋯`.

Primary action by state:

| State                         | Primary                            |
| ----------------------------- | ---------------------------------- |
| Created, not applied          | `Apply to N students`              |
| Applied, submissions arriving | `Continue grading · N waiting`     |
| All graded, unpublished       | `Publish N reports`                |
| Everything published          | `View faculty report`              |
| Blocked                       | The fix for the blocker, in orange |

This five-state table assumes a roster-wide grading/publication aggregate
that does not exist (backlog item 1 — blocker). PR6a shipped a collapsed
three-state version instead: `Apply to N students` (not applied), `Continue
grading` (applied — no count, and no distinction between submissions in
progress, all graded, and published), and the blocker's fix (blocked).
Restore the table above once item 1 lands.

**Lifecycle strip (92px).** Five steps separated by chevrons:
`Created` (date) → `Applied` (N repositories) → `Submissions` (N of M in) →
`Grading` (N of M done) → `Published` (N of M sent). Completed steps get a
filled accent circle with a check; the current step gets a ring and bold label;
future steps are grey outline. A blocked step gets a filled orange circle with
an exclamation and an orange detail line.

**`Submissions`, `Grading`, and `Published` are blocked on backlog item 1**,
not buildable as specified today: `GradingState` persists per-student status
on disk with nothing aggregated across a roster, and
`GradeStatusRepositoryStatus` tracks CI workflow-run status, not human
grading progress. Only `Created` and `Applied` can be built until item 1
lands.

This replaces the readiness panel that currently displays "Needs attention" and
a "Ready" chip simultaneously.

**Main column.** An informational notice when relevant ("6 students have not
submitted yet. The due date is in 2 days.") with a View list action. Then a
student table: Student, Section, Submitted, Checks, Grade, Status — with filter
pills `Needs grading` / `Not submitted` / `Done` / `All`, defaulting to
**Needs grading**. Checks read "All passed", "3 warnings", "Tests failed".
Status chips read "Published", "Graded", "Needs grading", "No submission".

**Sidebar (380px).** Assignment facts — Due, Points, Type, Sections, Grading,
Late policy, Template (as a link). Then a Roster card. Then **Technical
details**, collapsed, holding assignment file path, course folder, workflow
path, slug and LMS id.

**Delete the "Available actions" panel entirely.** Its explanatory captions
become helper text on the real controls or captions in the overflow menu.

**Overflow menu contents**, grouped with one-line captions:

- _Assignment_: Edit assignment; Group settings; Student access page
- _Repositories_: Apply to new students; Download student repositories
- _Grading setup_: Regenerate grading workflow; View workflow runs on GitHub;
  Edit comment library
- _Reports_: Faculty report; Export grades as CSV **[Canvas-ready: Canvas sync
  becomes an additional entry here]**
- separator
- _Delete assignment_ — red, requires typing the assignment name

**Blocked state.** Header primary becomes the fix, in orange. A single warning
card states the problem in one sentence ("This assignment can't be given to
students yet"), explains why in plain terms, and offers two fixes plus a
"What is a template repository?" link. The student table becomes an empty state.
The sidebar gains an "Everything else is ready" checklist so a novice can tell a
blocker from an unfinished step.

### 5.4 Apply and grade preview — merge, do not stack

Currently the preview renders 11 panels and the result **appends below** it,
producing two repository tables, two identically titled "Diagnostics / blockers"
panels, and ten counter boxes.

Make it one page whose state changes:

- One plan table. Running the operation updates that table's Status column in
  place.
- One summary sentence, not ten counter boxes.
- One diagnostics region, shown only when there is something to say.
- Plain-English reasons per 2.3.
- Target counts must agree with the number of rows shown. They currently do not.
- Fix the truncated label `workflow_dispatcl status`.

### 5.5 Term setup wizard

Five steps: Course → Term → Roster → Faculty → Review. Left rail 300px, numbered
steps with a caption under each; completed steps get a filled check. "Save and
finish later" in the header, since term setup gets interrupted.

**Roster step (the hard one).**

- Section pills plus "Add section".
- Uploaded-file chip: name, row count, upload time, "Replace file".
- **Column matching shown explicitly**: `CSV column "SIS User ID" → Student ID`,
  each with a check. **[Canvas-ready: this becomes the Canvas field mapping.]**
- Validation summary chips: `22 ready`, `2 need a GitHub username`.
- Preview table. Rows missing a GitHub username tint `#fffdf6` and show an inline
  input with an amber border rather than blocking the upload. Copy: students
  without a username can be added now and filled in later, they just will not get
  a repository until then.
- Footer: Back, the reassurance line **"Nothing is created on GitHub until the
  last step"**, and `Continue to faculty`.

The wizard must be resumable and must not perform any GitHub mutation before the
final Review step.

### 5.6 Roster manager

**Source bar** below the header: `Source: CSV upload`, `Last updated Jun 2 by
jones`, a chip reading `Canvas sync not connected`, and `Replace from CSV`.
**[Canvas-ready: this becomes `Source: Canvas · synced 2 hours ago`, manual
editing disables itself, and nothing else on the screen changes. Build the source
as a first-class field now.]**

Section tabs with counts plus "Add section". Student table: Student ID, Name,
GitHub, Status, and a per-row `⋯`. Rows missing a username show "Not set" in
amber. Dropped students get a red status chip.

Sidebar: faculty assignment for the selected section as removable chips plus
"Add faculty", and a small stats card.

**Unsaved-changes bar** replaces the permanent Save panel. Edited rows tint by
type (green added, amber changed, red dropped). When anything is dirty, a bar
appears at the bottom on `--warn-surface`: "6 unsaved changes — 3 added,
1 dropped, 2 changed", with Discard and `Review and save`.

Clear Roster Rows, Remove Roster, and Remove Section move into the header
overflow menu and require typed confirmation.

**Confirm dialog.** Counts (added / dropped / changed), then a row-level diff
with a badge and a note per change. Explains that dropping a student leaves
their repository and published reports intact. No success message inside the
dialog — close and toast.

### 5.7 Dashboard

Not yet mocked, but two defects should be fixed regardless:

- Each course currently renders a card grid **and** a separate assignments
  table, so the same assignments appear twice in two formats. Keep one.
- Columns that are always empty (Sections, Grading showing "-", Repositories
  showing "Repository status unavailable") must either carry data or be removed.

---

## 6. Suggested branch and PR sequence

Work on `ui-redesign` with one PR per step. Each PR keeps `npm test`,
`npm run lint`, `npm run typecheck`, and `npm run format:check` green.

| #   | Scope                                                                                              | Why this order                                                |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Design tokens in `globals.css` + shared components (§4.3)                                          | Everything else depends on them                               |
| 2   | Grading workspace styling only — apply the design system, no behaviour change                      | Biggest felt improvement, lowest risk, independent of routing |
| 3   | Grading workspace behaviour: progress header, filters, next-ungraded, score/status consistency fix | The weekly hot path                                           |
| 4   | Keyboard shortcuts + cheat sheet                                                                   | Builds on 3                                                   |
| 5   | Publish review screen                                                                              | Removes publishing from the sidebar                           |
| 6   | Assignment detail: lifecycle strip, overflow menu, remove "Available actions", Technical details   | Worst novice confusion                                        |
| 7   | Roster save-modal bug + destructive action gating                                                  | Data-loss risk at 20 users; can be pulled earlier if needed   |
| 8   | Status-code and date humanisation module (§2.3)                                                    | Touches several screens                                       |
| 9   | Apply/grade preview merge                                                                          | Depends on 8                                                  |
| 10  | Router + breadcrumbs, split large components                                                       | Larger refactor, safest once screens are settled              |
| 11  | Term setup wizard                                                                                  | Ship before the next term begins                              |
| 12  | Roster manager rebuild + source field                                                              | Completes term-start work                                     |

PR 7 can jump the queue; it is a real bug.

---

## 7. Definition of done for any screen PR

- No disabled button carries a generic unavailability string.
- No raw status enum, ISO timestamp, exit code, or filesystem path appears
  outside Technical details.
- Exactly one primary action.
- Every icon-only button has an `aria-label`.
- No `onClick` on a non-interactive element.
- Empty regions have real empty states.
- Existing tests updated rather than deleted; new behaviour gets new tests.
- Screenshots attached to the PR (see `tools/ui-snapshots`).
