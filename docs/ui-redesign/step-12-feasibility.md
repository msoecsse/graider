# Step 12 feasibility: roster manager rebuild

Investigation only, per item 27's practice, applied before implementation.
No implementation code below. All citations are to code read directly.

## 1. Source as a first-class field — genuine gap, small

Confirmed: no roster carries provenance today. `RosterRow`
(`ui/electron/ipc.ts:522-527`) is `{studentId, githubUsername, section,
status}` — no timestamp, no author, no origin. `RosterLoadResult` and
`RosterSaveResult` (same file, 534-565) carry none either.
`ui/electron/rosterManagerService.ts` never calls `fs.statSync` or any git
metadata for the roster file; nothing derives "last updated" from the
filesystem or git history as a proxy.

This is a data-model change, but a small one: add an optional `source`
field (`kind: "csv_upload" | "manual_edit"`, `updatedAt`, `updatedBy`) to
`RosterLoadResult`/`RosterSaveRequest`, written by `saveRoster`
(`rosterManagerService.ts:434-482`) and read by `getRosterForSection`
(278-336). `updatedBy` can reuse the existing
`currentFacultyMsoeUsername` local setting; `updatedAt` is just the save
timestamp. No rearchitecture — one new field threaded through three
existing functions, comparable in size to backlog item 34's storage
module. Store it in the roster CSV's sidecar or as a comment/companion
field; either is fine, not investigated further since it's an
implementation detail once the field itself is agreed on.

## 2. The unsaved-changes model — the shared component needs nothing; the diffing is new, and client-side-only

`UnsavedChangesBar` (`ui/src/components/UnsavedChangesBar.tsx`) takes
`message: ReactNode` — fully generic. It already renders whatever string
the caller builds, including "6 unsaved changes — 3 added, 1 dropped, 2
changed." **No extension needed.**

What doesn't exist is the diff itself. `previewRosterSave`
(`rosterManagerService.ts:394-425`) returns `content: createCsv(request.rows)`
— the _entire new file_, not a diff, and never reads the on-disk roster to
compare against. `RosterManagerPage.tsx`'s `ConfirmationWithPreviewModal`
call (721-736) renders that raw CSV text in a `<pre>`. There is no
per-row change-type tracking anywhere, backend or frontend — `changeDescription`
(a single free-text string set ad hoc by whichever handler last ran, e.g.
line 509's `"This change adds a student row..."`) is the closest thing,
and it's a label, not a count.

**This is buildable entirely client-side, no backend change required.**
`loadSection` (137-164) already receives the as-loaded rows in `result.rows`
before any edits; capturing that as a `baselineRows` snapshot alongside the
existing `rows` state, then diffing current `rows` against it by
`studentId` on every render, is enough to produce the added/dropped/changed
counts and per-row tint. `previewRosterSave`'s full-CSV `content` can stay
as the backend contract; the row-level diff for the confirm dialog is a
pure function over two arrays the frontend already has both halves of.

## 3. Deferred save versus item 35 — no collision, confirmed by the code

**This is not the wizard's problem, and the code already does what §5.6
wants.** Tracing the actual flow: every edit in `RosterManagerPage.tsx` —
`updateRow` (166-172), `replaceFromCsv` (174-190), add/remove student
(507-514, 558-573), add/remove faculty (454-473, 481-493) — is a pure
`setRows`/`setFaculty` call. None of them touch `window.graiderUI`. The
`request` object (105-117) is a `useMemo` that accumulates the _entire_
current `rows` and `faculty` state. `handleSave` (212-246) calls
`window.graiderUI.saveRoster` **exactly once**, with that fully-accumulated
`request` — there is no per-edit or per-field save call anywhere in this
file.

Item 35's constraint (`courseMutationPublicationService.ts` auto-publishing
after `saveRoster`) fires once, at that single Save, no matter how many
rows or faculty changes were batched into it first. The wizard's problem
was different in kind: its steps map to _separate_ backend entities
(course, then roster, then faculty), each wanting its own deferred
mutation sequenced across screens. Here, everything editable in one
section already collapses into one entity and one save call. §5.6's
edit-many-then-review-and-save model is what `saveRoster` already
supports — no backend change needed for the core save path.

One caveat, not a collision: `removeRoster`/`removeSection` are separate,
independent, single-purpose destructive actions (their own typed
confirmation, `RosterManagerPage.tsx:628-699`), not part of the batched-edit
flow, and each still auto-publishes immediately on its own — correctly, per
item 35, since removal is a deliberate one-shot action, not an
accumulated edit.

## 4. The shared parse/validate module — build it here, and it's four implementations, not two

Rechecking item 36's count against the code: there are **four** separate
CSV-parsing implementations, not two — `src/roster/roster-loader.ts` +
`src/io/csv.ts` (the CLI/grading path), `ui/electron/courseSetupService.ts`
(initial roster upload during course creation), **`ui/electron/rosterManagerService.ts`'s
own `parseCsvLine`/`parseRows`** (394-425, a third, independent parser with
weaker validation than `roster-loader.ts`'s), and
`ui/src/roster-manager/RosterManagerPage.tsx`'s client-side
`parseUploadedRoster` (38-52). Backlog item 36 is corrected below.

**Recommendation: build the shared module in step 12, since step 12 is
building fresh against it anyway; step 11 (the `CourseSetupPage.tsx`
redesign) adopts it afterward.** Module surface: parse (header detection +
row extraction), column-match (item 33's mapping, not urgent but the same
seam), validate (the rules already in `roster-validation.ts`, reused
rather than reimplemented a fourth time), and a structured
diff (item 2 above) producing per-row change type against a baseline. One
module, four current call sites converge on it over time; step 12 and
(later) step 11's redesign are the first two to actually move.

## 5. Spec claims, verified

- **"Dropped students get a red status chip"** — no chip exists today
  (status is a plain `<select>` in a table cell); expected, this is a
  rebuild target. **"Dropping a student leaves their repository and
  published reports intact"** — checked what reads roster status
  downstream: `src/execution/apply-executor.ts:283` and
  `src/reporting/report-collector.ts:406,424` both only _pass through_
  `student.status` into manifests/reports; neither filters or deletes
  based on it. `loadTermRosters` (`roster-loader.ts`) includes dropped
  students in its returned list — dropping doesn't even remove them from
  data, only relabels them. No code path revokes repository access or
  touches a published report when status changes. **The claim is true as
  the code stands** — with the caveat that this means dropping alone does
  nothing to actually restrict access if that's ever wanted; it is purely
  a label today.
- **Faculty assignment per section** — exists in the data model, confirmed
  live in two places: `term.yml`'s `sections[].faculty` array (written by
  `createTermContentWithSection`/`...Updates`,
  `rosterManagerService.ts:150-227`) and already editable per-section in
  `CourseSetupPage.tsx:127-137`. Nothing new needed here.
- **Section tabs with counts, and the stats card** — **new aggregation
  needed.** `AssignmentSetupTerm` (`ipc.ts:229-232`) is `{code, sections:
string[]}` — section IDs only, no counts. `RosterSummary`
  (`src/roster/roster-models.ts`, computed by `roster-loader.ts`) already
  has exactly the shape wanted (`studentCount`, `activeStudentCount`,
  `droppedStudentCount`, `holdStudentCount`) but is wired into the
  CLI/grading path only, not the Electron IPC layer. Small new work: a
  bulk IPC read that loads every section's roster for a term once and
  returns per-section counts, reusing the shared parser from item 4. The
  stats card itself needs nothing new — it's a client-side aggregate over
  data already loaded once a section is selected.

## 6. Existing violations

- **Item 23** (raw `<option value="active">active</option>`,
  `RosterManagerPage.tsx:545-547`) — confirmed still present, all three
  status options. The rebuild's status chip replaces this select-as-label
  pattern entirely, so it's resolved as a side effect, not something to
  fix separately — but only if the rebuild actually replaces this control
  rather than restyling it in place.
- **Raw filesystem path** — confirmed, and it's in the Remove Roster
  confirmation's promise sentence itself, not just a details panel:
  `RosterManagerPage.tsx:631-634`, "This deletes `{targetPath}` and
  removes its section from term.yml." `targetPath` is the literal
  `terms/{termCode}/rosters/section-{sectionId}.csv` string. Needs
  explicit handling in the rebuild — §2.4's Technical details pattern, not
  a load-bearing sentence.
- **`PageHeader` migration** — confirmed blocked exactly as item 11
  describes. `PageHeaderProps.title` (`PageHeader.tsx:11-18`) is a plain
  string rendered into `<h1 className="page-header__title">` with no
  settable `id`. `RosterManagerPage.tsx` currently does
  `<h1 id="roster-manager-title">` paired with
  `<main aria-labelledby="roster-manager-title">` (344, 349) — adopting
  `PageHeader` as-is means dropping that explicit landmark-to-heading
  wiring. `OverflowMenu` (`ui/src/components/OverflowMenu.tsx`) already
  exists and needs no changes — `PageHeaderProps.overflow` is a raw
  `ReactNode` slot, so it composes directly, same pattern
  `AssignmentDetailPage.tsx` already uses. Recommend landing item 11's
  settable-id slice (small, shared, benefits every future `PageHeader`
  adopter) before or alongside this rebuild, rather than dropping the
  `aria-labelledby` pairing to work around it.

## 7. Recommendation

**Buildable as specified.** Unlike §5.5, nothing here collides with item
35, and the component this screen most depends on (`UnsavedChangesBar`)
already supports what's asked of it. The real gaps are contained: one new
metadata field (source), one new aggregation read (section counts), one
new client-side diff (unsaved-changes detail), and one consolidation
(shared parse/validate module. item 33's column-mapping seam is real but
explicitly not urgent, per its own backlog entry.

PR breakdown, roughly in order:

1. `PageHeader`'s settable heading id (item 11's smallest slice) — small,
   shared, unblocks a clean migration.
2. Shared roster parse/validate/diff module (item 4 above) — backend +
   pure-TS, no UI yet. Feeds everything after it.
3. Bulk section-counts IPC read, reusing (2).
4. Roster source field (item 1 above) — backend, `saveRoster`/
   `getRosterForSection` plus the two IPC types.
5. The screen rebuild itself: `PageHeader` + `OverflowMenu` for the
   destructive actions, section tabs with counts, source bar, unsaved-changes
   bar wired to (2)'s diff, confirm dialog showing the row-level diff, status
   chips replacing the raw `<option>` labels (resolves item 23), Technical
   details holding the roster path (resolves the reported violation).

Nothing here needs to land before step 11's `CourseSetupPage.tsx`
redesign or block it — (2)'s module is the one piece step 11 should adopt
once it exists, not wait on.

## Backlog items added or corrected

- **Item 36 corrected**: four CSV-parsing implementations, not two —
  `rosterManagerService.ts`'s own parser was missed in the original
  count.
- **New item 37**: no roster provenance (source/last-updated/by) exists in
  the data model — needed for §5.6's source bar, small backend change.
- **New item 38**: no per-section roster count aggregation exists in the
  Electron IPC layer, though the backend `RosterSummary` shape already has
  it — needed for §5.6's section tabs and stats card.
