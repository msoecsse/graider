# ITEM-44 implementation: true roster-only removal

## Summary

Fixed the product-contract defect where `removeRoster` and `removeSection`
both removed the selected section. Remove roster is now a roster-only lifecycle
operation; Remove section remains the stronger configuration-removal operation.

## Final Product Contract

- **Remove roster** keeps the selected section and faculty, removes its roster
  reference, deletes associated contained roster files and canonical source
  sidecar, refreshes affected Student Repository Access Pages, and publishes
  the course mutation.
- **Remove section** removes the section object plus its associated contained
  roster files and source sidecar, then follows the same refresh/publication
  path.
- **Clear roster rows** remains a staged edit. Saving it persists a valid
  header-only roster with ready zero-student summary semantics.

Neither removal deletes student repositories, independently revokes access, or
changes assignment YAML.

## Backend Changes

`removeRoster` and `removeSection` now build different `term.yml` content before
calling a narrow shared file-deletion/rollback primitive. The public request,
result, validation, preload, IPC channel, main-process wrapper, and publication
contracts are unchanged.

## YAML Mutation Safety

Roster-only removal parses `term.yml`, obtains the YAML `sections` sequence and
matching mapping node, and deletes only that node's `roster` key. It does not
reconstruct the section from selected fields. The section ID, faculty, other
mapping content, and unrelated comments/structure remain under the YAML
library's node-preservation behavior. The strict term schema was not broadened.

## File / Provenance Deletion

The existing associated-path compatibility behavior remains: removal considers
the canonical `section-<id>.csv` and any distinct configured roster path,
resolves them against the trusted course root, rejects an escaping path,
deduplicates resolved paths, and deletes only contained candidates. It also
deletes the canonical `section-<id>.source.json` sidecar. A repeated Remove
roster fails when neither a roster file nor reference exists.

## Rollback

Before mutation, the service resolves and containment-checks all paths, builds
the new YAML, and snapshots the original term plus every existing roster/source
file. It writes `term.yml`, deletes roster files, then deletes source metadata.
Any write/deletion failure restores the original term and every captured file
before returning failure. Focused tests inject a source-deletion failure after
roster deletion for both public operations.

## Renderer Behavior

After successful Remove roster, the selected section tab remains, faculty and
its baseline remain, rows/baselines/source/pending source are cleared,
`isExisting` becomes false, review state closes, and the normal no-roster UI is
shown. Remove roster becomes disabled while Remove section, Add Student,
Replace from CSV, faculty editing, and the existing review/save flow remain
available. The toast is **Roster removed.**

After successful Remove section, the tab is removed and the selected section,
rows, faculty, and source state are cleared as before. The toast is **Section
removed.**

The Remove roster caption now says it keeps the section. Its typed-confirmation
copy states that the roster/student list is removed, section/faculty remain,
and student repositories are not deleted. Remove section remains explicitly
stronger. Filesystem paths remain confined to Technical details.

A local-success/publication-failure result adopts the same local state, clears
dirty state, and shows existing **Saved locally** recovery guidance instead of
rolling the UI back.

## Access Page Refresh

The established wrapper ordering is unchanged. After local roster-only
removal, assignments that still target the retained section are discovered and
their Student Repository Access Pages are regenerated from the now-empty
roster state and published. Unrelated assignment pages and student repository
files remain untouched. Secondary refresh/publication diagnostics preserve
local success.

## Publication

No publication architecture changed. A focused integration test performs real
roster-only removal and sends its successful result through
`publishSuccessfulCourseMutation`; the safe publisher commits the modified
`term.yml`, deleted roster CSV, and deleted canonical sidecar together. Existing
explicit allowlisting, unrelated-file/staged-work protection, normal push, and
local durability on publication failure remain intact.

## Tests

Backend coverage now distinguishes the two public methods and covers retained
section/faculty, no-roster load state, missing summary state, unrelated YAML
content, canonical plus distinct configured paths, resolved-path deduplication,
missing roster/reference rejection, outside-root rejection, provenance
deletion, later roster recreation, and rollback for roster and section removal.

Renderer coverage protects typed confirmation, caption/copy, retained selected
tab and faculty, cleared rows/source/review/dirty state, missing summary refresh,
disabled Remove roster, available reconstruction actions, stronger Remove
section reset, local-success/publication-failure behavior, no raw paths, and the
header-only Clear roster rows distinction.

Access-page coverage proves the retained section still drives affected-page
refresh, unrelated pages stay untouched, student repository files are not
deleted, and secondary publication failure preserves local success. Publication
coverage proves the complete managed change set reaches the safe publisher.

## Documentation

- Backlog item 44 is resolved with its discovery and decision history retained.
- The feasibility document has an implementation-outcome note.
- The faculty guide now distinguishes all three destructive/clearing actions.
- `docs/config-wizard-plan.md` was verified as already accurate and was not
  changed.
- This implementation summary records the completed slice.

## Validation

| Command                            | Result                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused root summary suite         | Passed — 3 tests in 1 file                                                                                                                       |
| Focused UI/Electron ITEM-44 suites | Passed — 68 tests in 4 files                                                                                                                     |
| `npm run typecheck`                | Passed                                                                                                                                           |
| `npm run lint`                     | Passed; this also covers UI source because there is no separate UI lint script                                                                   |
| `npm run format:check`             | Passed                                                                                                                                           |
| `npm test`                         | Passed — 1,081 passed, 1 skipped (121 files)                                                                                                     |
| `npm run build`                    | Passed                                                                                                                                           |
| `npm run audit`                    | Passed the configured high-severity gate; npm reported 1 low and 2 moderate development-tool advisories in Vitest/`@vitest/mocker` and `esbuild` |
| `npm --prefix ui run typecheck`    | Passed                                                                                                                                           |
| `npm --prefix ui run format:check` | Passed                                                                                                                                           |
| `npm --prefix ui test`             | Passed — 1,082 passed (146 files)                                                                                                                |
| `npm --prefix ui run build`        | Passed with Vite's existing large-chunk advisory                                                                                                 |

## Backlog Result

ITEM-44 is **Resolved**. Remove roster, Remove section, and Clear roster rows
now produce three intentionally distinct persisted states.

## Deferred / Non-goals

No parser convergence, Canvas sync, setup redesign, schema redesign, new IPC
surface/result type, assignment mutation, student repository deletion/access
revocation, or publication rearchitecture was included.

## Next Step

ITEM-36 — converge the three remaining roster CSV parser paths. Do not begin it
as part of ITEM-44.
