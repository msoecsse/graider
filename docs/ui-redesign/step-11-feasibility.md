# Step 11 feasibility: term setup wizard

Investigation only, per the task's instruction — no implementation code
below. All citations are to code read directly, not inferred.

## 1. Column matching — does not exist

Confirmed: there is no header-to-field mapping code anywhere in `src/` or
`ui/`. Roster import today is exact, hardcoded header matching in three
places, not one:

- `src/roster/roster-loader.ts:90-95` (`getColumnIndexes`) does
  `headers.indexOf(STUDENT_ID_COLUMN)` etc., where the constants
  (`src/roster/roster-validation.ts:20-23`) are literal lowercase strings:
  `student_id`, `github_username`, `section`, `status`.
- `ui/electron/courseSetupService.ts:15-24` hardcodes two accepted header
  sets: `ROSTER_HEADERS` (the canonical four) and a `LEGACY_ROSTER_HEADERS`
  seven-column variant (adds `email`, `first_name`, `last_name`) — still
  exact string matching, not mapping; a CSV with any other header is
  rejected outright.
- `ui/src/roster-manager/RosterManagerPage.tsx:178-182`
  (`parseUploadedRoster`) rejects a "Replace from CSV" upload with
  **"Uploaded roster must use the canonical four-column Graider header."**
  if the header doesn't match exactly — no partial matching, no
  suggestions.

§5.5's `CSV column "SIS User ID" → Student ID` describes a genuinely
different capability: accept an arbitrary externally-sourced header (a raw
Canvas gradebook export is the explicit intent — see §5.5's own
"[Canvas-ready]" annotation) and let the user map its columns to Graider's
four canonical fields, with per-mapping confirmation. **This would have to
be built from nothing** — no existing normalization or fuzzy-matching logic
to extend. Scope: one new pure function (best-effort default mapping by
name similarity, e.g. `"SIS User ID"` → `student_id`), a small mapping UI
(one row per detected source column, editable target), and validation that
reuses the existing per-row rules in `roster-validation.ts`. Backend-free —
this is UI plus a pure-TS helper, comparable in size to one of PR10-3's
extracted panels plus tests. Genuinely independent of the other findings
below.

## 2. Resumability — no draft storage exists anywhere in the app

`ui/electron/localSettings.ts` (60 lines, read in full) stores exactly two
fields: `currentFacultyMsoeUsername` and `lastChooserDirectory`. No
partial-form, draft, or "in-progress wizard" concept. A broader search
found no other draft-persistence mechanism in the main process, the course
registry, or the renderer — every existing setup/edit screen
(`CourseSetupPage`, `AssignmentSetupPage`, `RosterManagerPage`) holds its
form state in React state only; closing the window loses it.

This is a storage-design question, confirmed. "Save and finish later" needs
a new local JSON draft — keyed by course-folder path plus wizard step, most
naturally alongside `localSettings.ts`'s existing pattern (read/write
helpers, `userData`-scoped file) — written on step transitions or an
explicit save, loaded on wizard entry, cleared on a completed Review. Scope
is moderate: the storage module itself is small (similar size to
`localSettings.ts`), but it must model every step's partial state (course
fields, term fields, section/roster rows including any uploaded CSV
content or column mapping, faculty assignments), so the _shape_ of the
draft is nontrivial even though the read/write mechanics are simple.

## 3. Deferred mutation — the hard constraint, and it is currently false

**Course/Term is already safe.** `saveCourseSetup`
(`ui/electron/main.ts:597-607`, backed by `courseSetupService.ts`) writes
local files and registers the folder — no GitHub call anywhere in that
file; confirmed by absence of any `publish`/`github`/`push` call in
`courseSetupService.ts`. This part of the wizard needs no new deferral
work.

**Roster, section, and faculty mutations are not safe — and backlog item 31
made this more true, not less.** `ui/electron/courseMutationPublicationService.ts`
(`publishSuccessfulCourseMutation`) unconditionally calls the real
`publishCourseChanges` GitHub push immediately after any wrapped mutation
succeeds. It wraps nine call sites in `main.ts`
(lines 672, 683, 755, 764, 772, 785, 880, 892, 904), covering
`saveAssignmentSetup`, `saveAssignmentEdit`, `deleteAssignment`,
`saveAssignmentGroupConfig`, **`saveRoster`, `removeRoster`, and
`removeSection`** — exactly the operations a Roster or Faculty wizard step
would need to call. `RosterManagerPage.tsx:220-226` confirms this at the UI
level: `saveRoster({ ...request, confirmed: true })` already returns a
`result.publication` field the page renders.

Before item 31 this was framed as a bug (changes silently stayed local);
its fix means every roster/section/faculty save now auto-publishes to
GitHub as part of the same call. **If the wizard's Roster and Faculty
steps call these same paths as their "Continue" actions — the cheapest,
most obvious implementation — each step push to GitHub the moment the user
clicks Continue, directly breaking "nothing is created on GitHub until the
last step."** This is not a hypothetical; it is what the current code does
today, for any caller.

**The fix is smaller than full "accumulate intent, commit once"
architecture, but it is real backend work.** The existing functions already
separate local write from publish (the wrapper is a thin decorator around
each). A scoped fix — new or parameterized IPC entry points for
roster/section/faculty save that skip `publishSuccessfulCourseMutation`,
plus exactly one explicit `publishCourseChanges` call added to the
Review step — is enough; it does not require restructuring `saveRoster` or
inventing a transaction log. This must land **before or alongside** the
Roster/Faculty steps, not as a UI-only concern layered on top.

## 4. Overlap with existing screens — substantial

`CourseSetupPage.tsx` already does, in one screen, one local-only save:
course fields, term fields, multiple sections, **per-section faculty
assignment** (`addFaculty`, `CourseSetupPage.tsx:127-137`, backed by
`normalizeFacultyUsernames` in `courseSetupService.ts:12,63`), and an
**optional initial roster CSV** per section (`ROSTER_HEADERS`/
`LEGACY_ROSTER_HEADERS` handling cited above). That is wizard steps 1, 2,
4, and half of 3 — already built, just not wizard-shaped: no left rail, no
per-step review, no resumability, no column mapping, and everything saves
in one action rather than five.

`AssignmentSetupPage.tsx` is unrelated (per-assignment, not per-term).
`RosterManagerPage.tsx` is the post-creation edit tool, a different job
from initial creation.

PR10-1's decision to leave `/…/setup` unclaimed is still correct — nothing
since has changed `CourseSetupPage`/`AssignmentSetupPage` off their
folder-picker-driven, non-slug-gated pattern (`README.md:257-260` still
matches the code). But the overlap above is a real design question the
spec doesn't address: building the wizard as five new screens would largely
duplicate a screen that already works, rather than replace it outright.

## 5. Overlap with step 12 — already duplicated once, don't make it twice

Roster-CSV parsing already exists in **two separate implementations** that
predate any wizard work: `courseSetupService.ts`'s server-side header/row
validation (initial roster upload during course creation) and
`RosterManagerPage.tsx`'s client-side `parseUploadedRoster` ("Replace from
CSV"). Building a third, wizard-specific version would repeat exactly the
pattern backlog item 22 and the three-date-formatters incident describe.

Recommendation: whichever of step 12 (roster manager rebuild, §5.6) or the
wizard's roster step is built first should produce one shared module for
CSV parsing, column matching (§1), and the validation-summary-chip
UI both specs want (§5.5's `22 ready, 2 need a GitHub username`; §5.6's
per-row status). Today's validation output is a flat
`CourseSetupDiagnostic[]` of message strings
(`ui/electron/rosterManagerService.ts:339-380`) — neither spec's structured
counts exist yet either, so this module is new work regardless of which
step claims it. Build it in step 12, since §5.6 is scheduled first and its
target UI is already fully specified; the wizard's roster step, if and when
built, should consume it rather than grow its own copy.

## 6. Recommendation

**Not buildable as specified, without backend work first, and substantially
redundant with an existing screen.** Three independent gaps (no column
mapping, no resumability, no deferred-publish path for roster/faculty) plus
one overlap (CourseSetupPage already does most of steps 1/2/4) make a
literal five-screen wizard the wrong shape to build next.

**Recommended: correct the spec, don't build the wizard as five new
screens.** Redesign `CourseSetupPage.tsx` for the plain-language and
action-hierarchy rules in §2 (it predates the redesign and violates several
of them today, unaudited here since that's a separate task), and add the
three real gaps to it as targeted, independently shippable improvements —
column matching, resumability, and deferred roster/faculty publish — each
its own small PR, none blocking the others. This delivers everything §5.5
actually wants (a safe, resumable, Canvas-ready setup flow) without
building a parallel five-step wizard around a screen that already does the
job.

**If a wizard shell is still wanted regardless** (e.g., for the
step-by-step UX itself, not just the missing capabilities), sequence:

1. Backend: scoped local-write-without-auto-publish IPC paths for
   roster/section/faculty, plus one Review-time `publishCourseChanges`
   call. Blocks the Roster and Faculty steps specifically; Course/Term
   needs nothing.
2. Shared roster CSV parse/column-match/validate module + tests, built as
   part of (or just before) step 12, consumed by both step 12 and the
   wizard's roster step.
3. Small local draft-storage module for "Save and finish later."
4. Wizard shell (left rail, five steps) — Course/Term screens reuse
   `CourseSetupPage`'s existing local-only logic rather than reimplementing
   it; Roster/Faculty steps consume (1) and (2); Review wires (3).

Either path, do not start with the wizard UI itself — every step above it
depends on is currently missing or unsafe.

## Backlog items added

Four new items recorded in `docs/ui-redesign/backlog.md` (33–36): no
column-header mapping for roster CSV; no draft/resumable-state storage;
roster/section/faculty mutations cannot be deferred past their own save
(the flip side of item 31's fix); and roster-CSV parsing duplicated between
`CourseSetupPage` and `RosterManagerPage` today, independent of the wizard.
