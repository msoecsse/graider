# Item 44 feasibility: Remove roster semantics

## Problem

Item 44 found that the product exposes **Remove roster** and **Remove section**
as separate destructive actions, while both currently remove the section from
`term.yml`, delete roster files, refresh affected Student Repository Access
Pages, and publish the course mutation. The names promise different scopes;
the implementation does not.

This is a documentation-only decision. It records the contract for the next
implementation slice and does not change the current behavior.

## Current behavior

`ui/electron/rosterManagerService.ts` implements both exported methods through
`removeSectionAndRoster`. That helper:

1. requires typed confirmation and an existing configured section;
2. for `removeRoster` only, requires a roster file or a `roster` reference;
3. builds replacement YAML with `createTermContentWithoutSection`;
4. deletes the canonical roster path, a different configured roster path when
   present, and `section-<id>.source.json`; and
5. restores the original `term.yml` and existing deleted files if deletion
   fails.

`main.ts` sends both successful mutations through the Student Repository Access
Page wrapper and `publishSuccessfulCourseMutation`. `RosterManagerPage.tsx`
therefore removes the tab and resets all roster and faculty state after either
result. Its confirmation copy accurately says that **Remove roster** removes
the section, but that is still an ambiguous product contract.

## Domain model evidence

`rawTermConfigSchema` in `src/config/config-schemas.ts` makes
`sections[].roster` optional. `RawTermConfig` is inferred directly from this
schema, and `loadTermConfig` returns that raw validated model without a second
normalizer that makes roster mandatory. `validateTermConfig` validates term
identity, not a roster requirement. A configured section without `roster` is
therefore a valid first-class configuration state.

This differs from the other two states:

| State        | Term model                                             | Roster manager                       | PR12-3 section summary     |
| ------------ | ------------------------------------------------------ | ------------------------------------ | -------------------------- |
| No roster    | section has no `roster` property                       | `ready`, `exists: false`, empty rows | `missing`, `exists: false` |
| Missing file | section has a roster reference but that file is absent | `ready`, `exists: false`, empty rows | `missing`, `exists: false` |
| Empty roster | section references a valid CSV containing only headers | `ready`, `exists: true`, empty rows  | `ready`, counts all zero   |

The first two present as the same missing state in the current roster UI, but
they are not the same persisted configuration. A header-only CSV is a valid,
configured roster and remains distinguishable by `exists: true` and ready
summary counts.

Faculty is independently modeled as optional `sections[].faculty`, is read by
`getSectionFaculty`, editable by `RosterFacultyPanel`, and used by
`src/faculty/faculty-scope-resolver.ts` to identify a faculty member's
sections. It remains meaningful before student data is supplied and must not
be removed with a roster.

The existing course-setup contract already creates sections before a roster:
`docs/config-wizard-plan.md` says uploads are optional and an absent roster
emits a section without a reference. That same document already describes
roster-only deletion; it is stale relative to the current PR12-5 code and
faculty guide, not proof that the behavior landed.

## Downstream behavior without a roster

| Workflow                                 | Actual behavior for an existing section without `roster`                                                                                                                                                                               | Classification                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dashboard                                | `dashboard-builder.ts` skips that section while loading students but retains it in `sectionCount`.                                                                                                                                     | Valid empty state; no roster diagnostic solely for an absent reference.     |
| Assignment creation/edit                 | `assignmentSetupService.ts` and `assignmentEditService.ts` require only that the section ID exists in the term.                                                                                                                        | Valid target selection.                                                     |
| Plan / Apply                             | `loadAssignmentRosters` omits the source in `roster-loader.ts`; `buildAssignmentApplyPreview` then fails with its no-target-students diagnostic.                                                                                       | Workflow blocker, not invalid term configuration.                           |
| Grading, grade status, reports, validate | These consumers use `loadAssignmentRosters`; a roster-less selected section supplies no students. Calls that require targets resolve an empty/no-target result; a referenced file that is absent instead produces a roster read error. | No students; behavior varies by consumer, but no implicit section deletion. |
| Faculty scope                            | Faculty assignment is found independently, then roster loading supplies no students and no missing-file error for an absent reference.                                                                                                 | Valid empty faculty scope.                                                  |
| Student Repository Access Page           | The wrapper finds assignments whose YAML names the retained section and regenerates their pages from current repository mappings.                                                                                                      | Refresh remains required to prevent roster-derived stale links.             |

Thus a roster-less section is configuration-valid and can be used for planning
and assignment targeting, but is not ready to create repositories or grade
students. That distinction is intentional and useful: readiness is data
dependent, not an excuse to delete a configured section.

## Empty roster versus no roster

The three actions represent materially different states already supported by
the product:

| Action            | Section  | Roster CSV/reference                 | Students | Use                                                                              |
| ----------------- | -------- | ------------------------------------ | -------- | -------------------------------------------------------------------------------- |
| Clear roster rows | retained | valid header-only CSV retained       | zero     | Keep an explicitly configured, valid empty roster.                               |
| Remove roster     | retained | CSV/reference and provenance removed | none     | Detach stale/imported roster data while keeping section ownership/configuration. |
| Remove section    | removed  | CSV/reference and provenance removed | none     | Retire the section itself.                                                       |

The summary backend makes the first two visible as `0` and **No roster**,
respectively. The existing “Canvas sync not connected” source affordance and
optional-upload course setup make a retained section a good future import/sync
target. This is evidence for a clean roster lifecycle, not a claim that Canvas
sync exists now.

## Options

### Option A — true roster-only removal

Keep the section and its faculty, remove only the `roster` property, delete
only associated contained roster files and the provenance sidecar, and retain
the stronger `removeSection` operation. This matches the schema, course setup,
summary infrastructure, and distinct zero-student states.

### Option B — remove the Remove roster action

This would avoid duplicate wording but makes “configured section awaiting a
roster” reachable only from setup/new-section flows, despite it already being a
valid model state. It also leaves no direct lifecycle action for discarding an
import while retaining faculty and assignment targeting.

### Option C — rename/consolidate current behavior

One accurately named **Remove section** action would be clearer than two names
for one effect, but it treats a valid independently useful section/faculty
configuration as inseparable from roster data. Repository evidence does not
support that coupling.

## Comparison

| Concern                                | True roster-only                                                              | Remove action                                      | Rename/consolidate                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| Matches current optional-roster schema | Yes; directly.                                                                | Partly; state remains but has no removal workflow. | No product use for a supported state.                              |
| Distinct from Clear roster rows        | Yes: missing versus valid-zero summary.                                       | No direct distinction beyond setup.                | No.                                                                |
| Distinct from Remove section           | Yes: data lifecycle versus configuration retirement.                          | Yes, but loses data-only lifecycle.                | One action only; loses data-only lifecycle.                        |
| Faculty preservation                   | Yes, explicitly.                                                              | Only until section removal.                        | No when roster action is used.                                     |
| Downstream compatibility               | Existing loaders already omit absent references; Apply blocks on no students. | Compatible but less capable.                       | Compatible with current code, semantically destructive.            |
| Future Canvas roster-sync fit          | Good retained target for re-import/sync.                                      | Weaker.                                            | Weak; requires recreating section/faculty.                         |
| Backend complexity                     | Focused split of an existing helper and tests.                                | API/UI cleanup.                                    | Lowest code change, poorer contract.                               |
| UI clarity                             | Three accurately named states/actions.                                        | Clear but incomplete lifecycle.                    | Clear but conflates section and roster.                            |
| Migration/compatibility risk           | Changes `removeRoster` effect; no new IPC channel.                            | Removes existing IPC/UI action.                    | Breaks expectations only if clients relied on the duplicate label. |

## Recommendation

**Recommended: Make Remove roster truly roster-only.**

Why:

- The validated term model, loader, course setup, dashboard, and roster
  summaries already support a section without a roster reference.
- Header-only and absent rosters produce different operational states: an
  explicit valid zero-student roster versus no configured roster.
- Faculty, assignment targeting, and a future roster source belong to a
  section, not to a particular CSV.
- Apply and grading requiring students are readiness constraints, not proof
  that the section configuration is invalid.

Do not keep two differently named actions with identical effects. Do not delete
student repositories, revoke repository access, alter assignment YAML, or
change parser/Canvas behavior in this implementation slice.

## Recommended contract

`removeRoster(request)` keeps its existing request and result IPC types and its
existing confirmation requirement. It must require the configured section and,
as it does today, an existing roster file or roster reference. On success it:

1. retains the selected section in `term.yml`;
2. removes only that section's `roster` property;
3. preserves `id`, `faculty`, and every other parsed section property rather
   than rebuilding an object from selected fields;
4. deletes the canonical roster path and any distinct configured roster path
   only after resolving each under the course root;
5. deletes `terms/<term>/rosters/section-<id>.source.json`; and
6. returns the existing `RosterRemoveResult` shape.

For example:

```yaml
# Before
sections:
  - id: "001"
    roster: rosters/section-001.csv
    faculty:
      - jones

# After
sections:
  - id: "001"
    faculty:
      - jones
```

Use `parseDocument` and mutate the matching YAML mapping/property, analogous
to `createTermContentWithRosterUpdates`, rather than `toJS` plus a reconstructed
`{ id, faculty }` section. `removeSection(request)` retains its current
section-plus-roster semantics. No new channel or result field is needed: the
called method already states whether the section remains, and the renderer can
set its state by action.

## Backend, renderer, and provenance impact

Split `removeSectionAndRoster` into a shared safe deletion/rollback primitive
and two YAML mutations, or an equivalently narrow structure. Reuse
`getAssociatedRosterPaths`, its containment checks, and source-sidecar path.
The canonical path plus a distinct configured contained path are deliberately
both considered; never delete an arbitrary configured path outside the course
root. A successful later `saveRoster` already writes the canonical reference
and new provenance normally. `getRosterForSection` then returns no source.

PR12-3 needs no summary code change: `loadSectionSummary` already turns a
retained section with `roster === undefined` into `missing`/`exists: false`.

`RosterManagerPage` must branch its current shared success handling:

- after **Remove roster**, retain and select the tab, keep faculty/baseline
  faculty, clear rows and saved/pending source, set `isExisting` false and the
  roster path absent, refresh summaries, and announce **Roster removed.**;
- show the existing no-roster empty state, allowing Add Student and Replace
  from CSV to create a new roster; disable or hide Remove roster until one
  exists again; and keep Remove section available;
- after **Remove section**, retain today's tab removal and reset behavior;
- change removal confirmation/captions so each describes its actual scope;
- preserve the local-success/publication-failure warning for either action.

## Publication and Student Repository Access Pages

Continue the existing access-page wrapper for true roster removal. It locates
assignments targeting the retained section and regenerates/publishes their
pages. Without that refresh, roster-derived access links could remain stale;
the section surviving is not a reason to skip it. This does not delete student
repositories or independently revoke access.

No publication architecture or allowlist change is required. `coursePublishService.ts`
already permits `terms/<term>/term.yml`, roster CSV paths, and canonical source
sidecars, including their deletions. The current publisher stages only allowed
changed paths, rejects unrelated staged work, never uses `git add .`, and does
not pull, merge, rebase, reset, or force-push. `publishSuccessfulCourseMutation`
already preserves durable local success with a publication-failure diagnostic.

## Rollback safety

Treat YAML update plus roster/source deletion as one local mutation:

1. resolve and containment-check `term.yml`, canonical/configured roster
   paths, and source path before writing;
2. produce the roster-property-only YAML content and snapshot original
   `term.yml` plus every existing file to delete;
3. write the new `term.yml`, then delete the roster files and sidecar;
4. if any deletion fails, restore original `term.yml` and all snapshots,
   including the sidecar, before reporting failure.

This adapts the existing rollback approach. It prevents a reported failure from
leaving an unreported half-removal or a source sidecar paired with a removed
roster reference. Best-effort cleanup alone is insufficient for the logical
mutation.

## Required tests

| Area                | Required coverage                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend removal     | `removeRoster` deletes canonical CSV, a different contained configured path if present, and source sidecar; removes only `roster`; retains the section, faculty, and unrelated section fields; rejects no roster/reference according to current semantics; rejects outside-root paths; and rolls back YAML/CSV/sidecar after a deletion failure. |
| Strong operation    | `removeSection` still deletes the section, associated contained roster files, and sidecar, including a section with no roster reference.                                                                                                                                                                                                         |
| Summary/load        | A removed roster leaves the retained section `missing`/`exists: false`; a header-only file stays `ready` with zero counts; source load is absent; a later save restores reference and provenance.                                                                                                                                                |
| Renderer            | Accurate confirmation/caption; successful Remove roster retains selected tab/faculty, empties rows/source, refreshes to **No roster**, disables/hides itself, permits manual/CSV recreation, and shows **Roster removed.** Remove section still removes the tab. Test publication failure as local roster removal with recovery guidance.        |
| Wrapper/publication | Access-page refresh is invoked for roster-only removal and stale roster-derived output is updated; allowed YAML/CSV/source deletions publish; unrelated files/staged work remain protected; neither UI action deletes student repositories.                                                                                                      |
| IPC                 | Existing `RosterRemoveRequest`, `RosterRemoveResult`, channels, validation, preload bridge, and main handler continue unchanged; no speculative result field.                                                                                                                                                                                    |

## Implementation slice

**ITEM-44 implementation — make Remove roster roster-only.**

Change the service behavior and focused tests first, retain the existing IPC
surface, then update the roster-manager success branch/copy and focused
renderer tests. Keep the existing access-page and publication wrappers in the
flow. Validate service, wrapper, renderer, and publication-focused tests in
addition to the project's normal relevant checks.

## Deferred / non-goals

This decision does not implement item 36 parser convergence, Canvas sync or
import redesign, a term schema redesign, repository-access revocation, student
repository deletion, assignment behavior changes, a publication redesign, or a
new removal API.

## Implementation outcome

Implemented on `ui-redesign` on 2026-09-23. `removeRoster` now deletes only the
matching YAML mapping's `roster` property with a parsed-document node mutation,
retains the section/faculty, deletes contained associated roster files and the
canonical source sidecar with rollback, refreshes affected Student Repository
Access Pages, and reaches the existing safe course publisher. The renderer keeps
the selected section in the no-roster state and uses action-specific success
handling. `removeSection` remains the stronger section deletion, and Clear
roster rows remains a saved header-only roster. Focused service, renderer,
access-page, summary, rollback, and publication integration tests protect the
final contract. No schema or IPC change was needed.
