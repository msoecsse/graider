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
- **Deliberate exception:** a screen may carry two filled primary actions
  only when they operate at genuinely different scopes (one item vs. the
  whole session) **and** use different verbs. Where two actions share a
  verb, the narrower-scoped one demotes to secondary. Otherwise one primary
  per screen still holds. The grading workspace is the reference case:
  "Mark Complete" (one student, the grading loop) and "Publish N reports"
  (the whole session) are both primary — different scopes, different
  verbs. "Publish this student's report" shares the "Publish" verb with
  the header's session-wide action, so it is secondary, not primary, even
  though it also acts on one student.
- **Navigation and disclosure controls are never primary, regardless of
  frequency of use.** A primary action names a mutation — the next step
  that changes state. "Next ungraded" changes what you're looking at, not
  any state, no matter how often it gets clicked in a grading session; it
  is secondary, matching "Previous". Opening a panel, a cheat sheet, or any
  other disclosure is the same: never primary, even for a help affordance
  used constantly.
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

Graider-managed assignment and roster changes publish automatically after they
are saved locally. Publishing stages only Graider-managed course files; it does
not include unrelated local work. If publication fails, the local mutation
remains saved and the UI explains that **Publish Course Changes** can retry it.

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

**Clarification (PR8-1):** the date/time example above omits the year
because it's illustrative, not because the year is always dropped. The
shared formatter (`ui/src/components/dateTime.ts`) includes the year only
when the timestamp falls outside the current year — a due date from the
current term doesn't need one; one from a past term does.

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

### 4.1 Add a router (shipped in PR10-1)

`App.tsx` used to render `DashboardPage` and nothing else. `DashboardPage` held
nine nullable "selection" values used as navigation, resolved with early
returns.

**This is what actually shipped, not the table originally drafted here.** That
first draft named six routes; it turned out three of the six named a screen
that either didn't exist as a component (course page, term setup wizard) or
wasn't a screen at all (publish review is a state of the grading workspace,
`GradingPublishReviewPanel`), while five real, already-built screens
(`ApplyPreviewPage`, `GradePreviewPage`, `GradeStatusPage`,
`FacultyReportPage`, `AssignmentEditPage`) had no route at all — each was
still reached only through one of `DashboardPage`'s nullable selection
states, which is exactly the mechanism this section exists to remove. Routing
only the original six would have left that mechanism standing for five
screens. See the note at the end of this section: this is the fourth time
this document's description of the code has diverged from the code itself.

The routes, as shipped:

```
/                                                    dashboard
/course/:courseSlug/:termSlug/roster                roster manager
/course/:courseSlug/:termSlug/:assignment           assignment detail
/course/:courseSlug/:termSlug/:assignment/apply     apply preview       (extension)
/course/:courseSlug/:termSlug/:assignment/grade     grading workspace
/course/:courseSlug/:termSlug/:assignment/grade-preview  grade dispatch preview (extension)
/course/:courseSlug/:termSlug/:assignment/status    grade status         (extension)
/course/:courseSlug/:termSlug/:assignment/report    faculty report       (extension)
/course/:courseSlug/:termSlug/:assignment/edit      assignment edit      (extension)
```

The four unmarked routes are the ones this section originally called for
(dashboard, roster, assignment detail, grading workspace). The five marked
"extension" were added in PR10-1 so that every screen `DashboardPage` used to
reach through nullable selection state has a real route.

Three things this section used to ask for are deliberately **not** routes:

- **Publish review** (`.../publish`) isn't a missing screen. It's
  `GradingPublishReviewPanel`, a state inside the grading workspace (section
  5.2), not its own component. It may become its own route when section 4.2
  splits `GradingWorkspacePage.tsx`, but that split, not this router, is what
  would create it.
- **The term setup wizard** (`.../setup`) is left unclaimed for section 6,
  step 11. `CourseSetupPage` and `AssignmentSetupPage` stay reachable exactly
  as they work today — folder-picker driven, not slug-gated — because they
  don't have course/term identity to route on until the wizard exists.
- **A standalone course page** (`/course/:courseSlug/:termSlug`) was never
  built. No section of this document says what it's for, and no component
  exists for it. **Open question for whoever builds it: what does a course
  page do that the dashboard doesn't already do?** See the backlog.

Routing uses `HashRouter`, not `BrowserRouter`: production loads through
`window.loadFile` (`file://`), which has no server to resolve an arbitrary
path back to `index.html`, so `BrowserRouter` doesn't work. `HashRouter` keeps
the route in the URL fragment (`#/course/...`), which `file://` serves
unchanged, and unlike `MemoryRouter` it gives a URL that identifies where you
are. None of this gives a link that opens in _another_ window or another
faculty member's copy of the app — that needs a registered custom protocol
and an `open-url` handler in `main.ts`, which PR10-1 did not add. See the
backlog.

Routing gives breadcrumbs, browser back/forward, and (within one running
copy of the app) real URLs in place of opaque in-memory state. It also
removed every hand-placed "Back to dashboard" button and the two separate
"Back" buttons in the grading workspace — with one exception:
`FacultyReportPage`'s "Back to grading status" button stays, because no
breadcrumb crumb represents grade status (the breadcrumb trail treats
assignment detail as faculty report's parent, since that is the more direct
path); it is the only way back to grade status. Screens that aren't routed
(`CourseSetupPage`, `AssignmentSetupPage`) keep their own "Back to dashboard"
buttons too, since they have no breadcrumb trail to replace them with.

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

**Footer (40px).** Persistent hint bar: `J` next student in the active filter,
`K` previous student in the active filter,
`C` comment, `1–9` library, `⏎` complete, `?` all shortcuts. On the right,
`Saved automatically`.

**Required behaviour changes**

- Score must not display a number when no rubric is configured. Show
  "No rubric — enter a score manually" instead of `100 / 100`.
- Student list status and the right-panel grading status must derive from the
  same source. They currently disagree.
- Navigation follows the active student filter, with wraparound. Shift-J moves
  to the next student in the full roster regardless of the filter.
- Publishing moves out of the left sidebar to the header and its own review
  screen.

**Keyboard shortcuts.** Every shortcut must also have a visible control. Nothing
is keyboard-only.

| Keys            | Action                                               |
| --------------- | ---------------------------------------------------- |
| `J` / `K`       | Next / previous student in the active filter (wraps) |
| `⇧J`            | Next student in the full roster (wraps)              |
| `G G`           | Jump to first ungraded                               |
| `/`             | Focus the active filter pill                         |
| `⇥` / `⇧⇥`      | Next / previous file                                 |
| `H`             | Commit history                                       |
| `A`             | Automated checks                                     |
| `C`             | Comment on selected lines                            |
| `1`–`9`         | Apply library comment by position                    |
| `⌘K` / `Ctrl K` | Search comment library                               |
| `M`             | Manual adjustment                                    |
| `⌫`             | Remove last applied comment                          |
| `⏎`             | Mark complete and go to next                         |
| `S`             | Skip                                                 |
| `P`             | Open publish review                                  |
| `⎋`             | Close panel or dialog                                |
| `?`             | Shortcut cheat sheet                                 |

Show `⌘` on macOS and `Ctrl` on Windows; detect, do not hardcode.

Shortcuts must be disabled while faculty are typing in genuine editable controls
(comments, adjustments, searches, and other form data). They remain active in
the read-only source editor, even though Monaco uses an internal textarea for
keyboard focus. The cheat sheet is a modal listing them grouped as Move / Read /
Grade / Finish.

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

This five-state table assumed a roster-wide grading/publication aggregate
that did not exist when PR6a shipped (backlog item 1). That aggregate now
exists and backs the `Grading` and `Published` counts in the lifecycle strip
below. PR6a's collapsed three-state primary action — `Apply to N students`
(not applied), `Continue grading` (applied, no count), and the blocker's fix
(blocked) — is still what ships; restoring the finer states above is a
deliberate future decision, not a blocked one. The `Submissions` row and its
"submissions arriving" wording will not return in any form — see the
lifecycle strip note below for why.

**Lifecycle strip (92px).** Four steps separated by chevrons: `Created` →
`Applied` (N repositories) → `Grading` (N of M done) → `Published` (N of M
sent). Completed steps get a filled accent circle with a check; the current
step gets a ring and bold label; future steps are grey outline. A blocked
step gets a filled orange circle.

**`Submissions` was dropped from the original five-step mockup, permanently
— not deferred, not blocked on anything.** Generated grading workflows
trigger on `push` and `workflow_dispatch`. A workflow run existing does not
mean a student submitted: it can equally mean the initial template push when
the repository was created, or a faculty-triggered grading run. Approximating
"submitted" from that signal would repeat exactly the CI-status-as-human-
status conflation this redesign avoids everywhere else (see backlog item 1's
history). Do not re-add a `Submissions` step from the original mockup
without a real, direct, per-student submission signal — none exists today.

`Created` has no reliable date anywhere in the current data model. The step
still renders, always complete, but without a date detail until one exists.

This replaces the readiness panel that currently displays "Needs attention" and
a "Ready" chip simultaneously.

**Main column.** A student table: Student, Section, Checks, Grade, Status —
with filter pills `Needs grading` / `Done` / `All`, defaulting to **Needs
grading**. Checks read "All passed", "3 warnings", "Tests failed". Status
chips read "Published", "Graded", "Needs grading".

**The `Submitted` column, the `Not submitted` filter pill, the `No
submission` status chip, and the not-submitted informational notice ("6
students have not submitted yet. The due date is in 2 days.") were dropped
from the original mockup, permanently — not deferred, not blocked on
anything.** No per-student submission signal exists, and approximating one
from workflow-run presence would repeat exactly the CI-status-as-human-
status conflation this section already rejects for the `Submissions`
lifecycle step above, for the same reason: a workflow run existing does not
mean a student submitted. Do not re-add any of the four without a real,
direct, per-student submission signal — none exists today.

**Sidebar (380px).** Assignment facts — Due, Points, Type, Sections, Grading,
Late policy, Template (as a link), Faculty owner, Grading category. Then a
Roster card. Then **Technical details**, collapsed, holding assignment file
path, course folder, workflow path, slug and LMS id.

**The facts card carries nine rows, not the seven originally listed here.**
`Faculty owner` and `Grading category` are user-authored — editable in
`AssignmentSetupPage.tsx` and `AssignmentEditPage.tsx`, with
`gradingCategory` defaulting to `"labs"` at creation — so dropping them from
the facts card would let a faculty member enter a value they can never read
back on this screen. The original seven-item list here was a sketch of the
screen, not an inventory audited against the previous `SummaryPanel`'s
thirteen fields, and missed them.

`Grading` renders `grading.enabled` and `grading.mode` in plain language
(for example "Grading enabled (Preset)", or "No grading"), not
`grading_category`. Beside Due, Points and Type, faculty read `Grading` as
whether automated grading is configured for this assignment;
`grading_category` is the LMS gradebook bucket a score is filed under — a
different fact, and it stays its own row.

The sidebar's final two-column layout — this 380px sidebar beside the main
column — arrives with PR6b-3. PR6b-1 grouped the three cards (Assignment
facts, Roster, Technical details) into one structural sidebar block without
committing to a two-column layout whose other half, the student table, did
not exist yet.

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

**Corrected 2026-09 — not being built as five new screens.** A feasibility
pass (`docs/ui-redesign/step-11-feasibility.md`) found this section
describes a screen the codebase cannot support as written, and that most of
what it asks for already exists elsewhere. The spec below is kept for the
record, not as a build target. What's actually happening:

- **Three capabilities this section depends on do not exist**, and are
  tracked as their own backlog items rather than as wizard prerequisites:
  no CSV column-header mapping (item 33), no draft or resumable-state
  storage anywhere in the app (item 34), and no way to defer a
  roster/section/faculty mutation past its own save (item 35).
  `CourseSetupPage.tsx` also already performs most of steps 1 (Course), 2
  (Term), and 4 (Faculty) — and part of 3 (an optional initial roster CSV)
  — in one screen, one local-only save. A five-step wizard built next to it
  would mostly duplicate it.
- **Chosen direction: redesign `CourseSetupPage.tsx`, not build a parallel
  wizard.** Bring that screen up to §2's rules (action hierarchy, plain
  language, hiding implementation detail), and ship items 33-35 as
  independently shippable improvements to it. None of the three blocks the
  others, and none requires the wizard shell to exist first.
- **The constraint that actually killed the literal spec, stated plainly so
  it is not mistaken for a bug report later:** this section promised
  "Nothing is created on GitHub until the last step." Today,
  `courseMutationPublicationService.ts` auto-publishes to GitHub
  immediately after every mutation it wraps, including `saveRoster`,
  `removeRoster`, and `removeSection`. That auto-publish is correct
  behaviour for every caller that exists today, and was a deliberate fix
  (backlog item 31) for a real problem — changes silently staying local
  until someone remembered to click Publish. **This is a collision between
  two correct decisions, not a defect in either one.** Do not "fix" the
  auto-publish to unblock a wizard; if a wizard is ever built, it needs its
  own deferred-publish path (item 35), and the existing callers keep
  auto-publishing exactly as they do now.
- **If a wizard shell is ever wanted anyway**, build the backend deferral
  (item 35) and the shared roster CSV module (item 36, shared with §5.6)
  first. Do not start with the wizard UI — every step under it depends on
  something that doesn't exist yet.
- **Timing: not urgent.** No new rosters are being created until next term.

See §6 for where this leaves the PR sequence.

---

**Original spec, superseded by the correction above.**

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

Not yet mocked, but defects should be fixed regardless:

- **Corrected (PR8-2, `74e0fe3`) — the original framing below was wrong.**
  The card grid's "Recent assignments" list and the assignments table below
  it do not render the same data. `dashboard-builder.ts:1066` builds
  `recentAssignments` (what the cards render) as
  `assignments.filter(shouldIncludeAssignment).sort(...).slice(0, 5)` --
  capped at five and filtered to `active`, `completed`, and `unknown`
  statuses -- while `assignments` (what the table renders) is the full,
  unfiltered, uncapped list. They overlap; they are not duplicates.
  Deleting the table, as the original bullet below instructed, would have
  hidden every assignment past the fifth, or with any other status, with no
  route back to it. The real defect is that two views of the same
  underlying data coexist on screen with no indication that one of them
  (the cards) is a partial view of the other -- a faculty member has no way
  to tell from the screen that "Recent assignments" is anything less than
  the whole list. Fix, if ever: label the cards' list as partial (for
  example "5 most recent of N"), or link it to the fuller table/view,
  rather than presenting it as complete.
- ~~Each course currently renders a card grid **and** a separate assignments
  table, so the same assignments appear twice in two formats. Keep one.~~
  Superseded by the correction above -- kept here so the history of what
  was tried and why it didn't hold up isn't lost.
- Columns that are always empty (Sections, Grading showing "-", Repositories
  showing "Repository status unavailable") must either carry data or be removed.

---

## 6. Suggested branch and PR sequence

Work on `ui-redesign` with one PR per step. Each PR keeps `npm test`,
`npm run lint`, `npm run typecheck`, and `npm run format:check` green.

| #   | Scope                                                                                              | Why this order                                                                                     |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Design tokens in `globals.css` + shared components (§4.3)                                          | Everything else depends on them                                                                    |
| 2   | Grading workspace styling only — apply the design system, no behaviour change                      | Biggest felt improvement, lowest risk, independent of routing                                      |
| 3   | Grading workspace behaviour: progress header, filters, next-ungraded, score/status consistency fix | The weekly hot path                                                                                |
| 4   | Keyboard shortcuts + cheat sheet                                                                   | Builds on 3                                                                                        |
| 5   | Publish review screen                                                                              | Removes publishing from the sidebar                                                                |
| 6   | Assignment detail: lifecycle strip, overflow menu, remove "Available actions", Technical details   | Worst novice confusion                                                                             |
| 7   | Roster save-modal bug + destructive action gating                                                  | Data-loss risk at 20 users; can be pulled earlier if needed                                        |
| 8   | Status-code and date humanisation module (§2.3)                                                    | Touches several screens                                                                            |
| 9   | Apply/grade preview merge                                                                          | Depends on 8                                                                                       |
| 10  | Router + breadcrumbs, split large components                                                       | Larger refactor, safest once screens are settled                                                   |
| 11  | `CourseSetupPage.tsx` redesign against §2, plus items 33-35 as independent improvements            | Replaces the term setup wizard — see §5.5's correction; not urgent, no new rosters until next term |
| 12  | Roster manager rebuild + source field                                                              | Completes term-start work; give it a feasibility pass first, per item 27                           |

PR 7 can jump the queue; it is a real bug.

### Priority update after PR12-3

PR12-3 (bulk roster section summaries) is complete. An explicit product
priority decision inserts the shared comment-library and comment-formatting
track before the remaining Step 12 work:

```text
PR12-3 (complete)
  -> COMMENT-1 (complete)
  -> COMMENT-2 through COMMENT-5
  -> PR12-4 roster source/provenance
  -> PR12-5 roster-manager visual rebuild
```

PR12-4 and PR12-5 are deferred by priority, not blocked or abandoned. The
original Step 12 sequence remains part of the project history. See
`comment-library-feasibility.md` and
`summaries/comment-library-priority-decision.md` for the verified existing
infrastructure, gaps, and recommended comment-track slices.

The term setup wizard shell (five steps, left rail, resumability) is
**deferred indefinitely, not scheduled** — see §5.5.

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
- Screenshots attached to the PR (see `tools/ui-snapshots`) — currently
  unmeetable: the capture code exists but has never had a vitest config or
  a package script wired up, so no PR has been able to run it. See backlog
  item 16 before going looking for the script.
