# Config Wizard Plan

## Purpose

Document the implemented faculty-facing configuration wizards that create
Graider course, term, roster, and assignment files. The CLI loaders and schemas
remain the source of truth.

## Current Config Files

All YAML schemas are strict, require `schema_version: 1`, and are loaded by
`src/config/load-*-config.ts` before `src/config/config-validation.ts` applies
semantic checks.

| File             | Current required shape and relevant validation                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course.yml`     | `course.code`, `course.title`, `course.repository`; GitHub organization, private visibility, repository-name pattern, faculty/grader teams and permissions; `defaults.timezone`, `defaults.assignment_type`; and `reports.formats`. `grading` is optional; when present, its validation remains strict. |
| `term.yml`       | `term.code`, `academic_year`, `semester` (`1`, `2`, or `3`), `display_name`; at least one section with `id` and an optional `roster` reference. The code must be `YYsN` and equal the term directory name. Roster paths are relative to the term directory. |
| `assignment.yml` | Assignment `slug`, `title`, `type`, `status`; optional template block with `repository` and `branch` when present; non-empty sections; optional deadline, metadata block, and grading override. Metadata fields are individually optional (`faculty_owner`, `grading_category`, nullable `lms_assignment_id`, and nullable `points`). The slug must equal its containing assignment directory. |
| roster CSV       | Current parser requires `student_id,github_username,section,status`, validates values/status/section/GitHub username, normalizes ID, GitHub username, and status to lowercase, and rejects duplicate IDs/usernames across selected sections.                                                                                                                      |

`loadGraiderConfig` derives term and assignment identity from
`terms/<term-code>/assignments/<assignment-slug>/assignment.yml`; callers must
not invent another layout. Current config validation does not verify that term
academic year, semester, and display name agree with the term code, so the
wizard must generate those values itself.

## Generated File Paths

Course setup generates these repository-relative paths:

```text
course.yml
terms/<term-code>/term.yml
terms/<term-code>/rosters/<section-id>.csv   # only for uploaded/generated roster data
```

Assignment setup generates only:

```text
terms/<term-code>/assignments/<assignment-slug>/assignment.yml
```

`rosters/` is canonical and plural. When configured, `term.yml` records each
roster as `rosters/<section-id>.csv`, relative to `terms/<term-code>/`. Removing
a roster deletes that CSV and removes the reference while keeping the section.

## Course Setup Wizard Contract

Slice B uses a left-side stepper: course, term and sections, optional rosters,
then preview. It requires course name, course code, GitHub organization, term
code, and at least one unique non-empty section ID. Roster uploads are optional
and are mapped explicitly to one selected section; the preview rejects an
upload whose parsed row section does not match that section.

The selected course root is part of the request, not renderer-derived state.
For a new root, the main process must choose/create the directory through a
narrow native dialog flow, create the files only after confirmation, then add
the root to the existing course registry. Existing folder selection cannot be
reused for creation because it rejects roots without `course.yml`.

Emit these defaults in the first implementation:

| Field                             | Generated/default value                                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course.repository`               | Course code; show it in preview.                                                                                                                                                                                       |
| GitHub visibility and permissions | `private`, `push`, `admin`, `maintain`.                                                                                                                                                                                |
| GitHub naming/teams               | `{term}-{course}-{assignment}-{github_username}`, `faculty`, `graders`.                                                                                                                                                |
| `defaults.assignment_type`        | `individual`.                                                                                                                                                                                                          |
| course grading                    | Optional. The setup checkbox writes the enabled custom-workflow block only when selected.                                                                                                                               |
| reports                           | `formats: [markdown, csv, json]`; omit `student_publish`.                                                                                                                                                              |
| roster absent                     | Include the section in `term.yml` without a roster reference and do not generate an empty roster CSV. Add/importing a roster writes both the CSV and reference. |

Slice B uses `America/Chicago` for `defaults.timezone`, matching the Course
Setup contract. Other examples may retain their configured timezone.

## Term Code Derivation

Accept only `YYs1`, `YYs2`, or `YYs3`. Let `academic_year = 20YY`:

| Term code | `academic_year` | `semester` | Derived `display_name` |
| --------- | --------------: | ---------: | ---------------------- |
| `27s1`    |            2027 |          1 | `Fall 2026`            |
| `27s2`    |            2027 |          2 | `Spring 2027`          |
| `27s3`    |            2027 |          3 | `Summer 2027`          |

The general formula is semester 1 = Fall of `academic_year - 1`; semesters 2
and 3 = Spring and Summer of `academic_year`. Existing fixtures and several
docs currently label `27s1` as `Spring 2027`; they must be corrected when this
rule is implemented.

## Roster CSV Contract

The planned canonical header order is exactly:

```csv
student_id,github_username,section,status
```

The four MVP headers are required and emitted in that order: `student_id`,
`github_username`, `section`, and `status`. Former seven-column rosters are
accepted for import compatibility, but only these four fields are retained.

Legacy import handling is limited to accepting the former seven-column header;
all saves emit the canonical four-column schema.

## Assignment Wizard Contract

The assignment page requires title, slug, one existing term, and at least one
section from that term. Template configuration is optional: leave both template
fields blank to omit the block; when configured, the repository/branch are
validated. Only `individual` is selectable.

Generated assignment defaults are `type: individual` and `status: active`.
Deadline, metadata, template, and grading blocks are omitted when their fields
are blank or disabled. Do not write any template-repository file.

## Grade Workflow Viewer/Editor Later Slice

`.github/workflows/grade.yml` is a template-repository file, not Graider
configuration. Slice E needs a narrow read API accepting template owner, repo,
branch, and this fixed path. It can reuse `GitHubClient.getRepositoryFileContent`
and existing token resolution in the main process, returning missing-file and
safe GitHub diagnostics as structured state. A missing file opens a blank
editor; reads never write.

Slice F needs a separate confirmed-write API. It may reuse
`GitHubClient.writeRepositoryFile`, but must require an explicit confirmation,
the configured repository/branch/fixed workflow path, and an expected current
content version/SHA to prevent blind overwrite. It must never expose tokens,
use generic command IPC, or write any other repository path. No workflow read
or write occurs in Slices B-C.

## Preview and Save Contract

Both wizard types use the same two-phase contract:

1. The renderer submits typed form data to a `preview` IPC. The main process
   normalizes input, derives paths/content, parses generated YAML/CSV through
   the existing loaders/validators, and returns file previews, diagnostics, and
   conflict state. No files are written.
2. The renderer displays path, complete generated content, validation results,
   and any existing-file state. Confirm is unavailable for validation errors.
3. The renderer submits the form data plus explicit confirmation and a
   per-conflict replace choice to a typed `save` IPC. The main process
   regenerates and validates, detects conflicts again, writes only approved
   paths, then returns the written paths and validation/refresh result.

Preview records need `path`, `content`, `exists`, and conflict mode. The first
UI should show existing content and generated replacement content side by side
or as separate expandable text blocks; a full diff viewer is deferred.

Default conflict mode is `create-only`. Existing files are never overwritten
silently. Save rejects missing confirmation, unapproved conflicts, paths
outside the selected course root, and duplicate generated paths.

## Validation and Refresh Behavior

After Slice B save, reload `course.yml` and `term.yml`; validate uploaded/new
rosters using the same roster loader against a temporary in-memory or staged
config; register the root only after successful local validation; then call the
existing `refreshDashboard` path. Surface structured diagnostics and retain the
new file paths.

After Slice C save, run the existing Assignment Detail command with the new
assignment path and course root. On valid detail output, navigate to Assignment
Detail or refresh its assignment list. Do not call apply, grade, report,
student publish, or workflow generation as post-save work.

## IPC and File-Writing Boundaries

Add narrow typed APIs rather than `readFile`, `writeFile`, or `runCommand`:

```ts
previewCourseSetup(request) -> ConfigWizardPreviewResult
saveCourseSetup({ previewToken, conflictResolutions }) -> ConfigWizardSaveResult
previewAssignmentSetup(request) -> ConfigWizardPreviewResult
saveAssignmentSetup({ previewToken, conflictResolutions }) -> ConfigWizardSaveResult
```

Requests carry only form data and an approved course-root context. Results
carry relative paths, generated text, diagnostics, conflicts, and safe refresh
state. Main-process handlers validate runtime request shapes, resolve and
contain every path under the selected root, use explicit UTF-8 writes and
parent-directory creation, and redact safe error output. The preload exposes
only these named methods under `window.graiderUI`; the renderer imports no
filesystem/Node modules. Existing Electron registry writes and the narrow
command IPC pattern establish this ownership boundary, but there is no existing
generic configuration writer to expose or reuse.

## Slice B: Course Setup Wizard

1. Add typed course-setup draft, preview, conflict, and save result contracts.
2. Add a main-process generator/validator/writer service that creates only
   `course.yml`, `term.yml`, and optional plural-roster CSVs.
3. Add the left-stepper page and route; keep unregistered/new-root selection
   separate from existing-folder selection.
4. On confirmed save, validate, register the root, and refresh the dashboard.
5. Test preview content, term derivation, optional upload, conflict handling,
   path containment, registry update, and refresh with mocked IPC/filesystem.

## Slice C: Assignment Wizard

1. Build on the same preview/save contracts with assignment-only paths.
2. Load existing term/sections through a narrow typed read model or validated
   local config service, not renderer file access.
3. Add the single-page section-card form and preview/confirmation state.
4. Save only `assignment.yml`, then use existing Assignment Detail navigation.
5. Test inheritance/disabled grading output, slug-path matching, term-section
   validation, conflicts, and the no-GitHub/no-template-mutation boundary.

## Slice D: Editable Roster Table

Load/write only canonical roster CSVs through a typed preview/save operation.
Use the four canonical columns, preserve header order, show row diagnostics and
duplicate identity errors, and retain create-only/explicit-replace safeguards.
Do not combine this with course creation or assignment creation.

## Slice E/F: Grade Workflow Editor and Push

Slice E reads the configured template branch's fixed workflow path through the
main-process GitHub client and renders read-only/editor draft state. Slice F
adds the separate confirmed optimistic-concurrency push described above,
followed by a safe readiness refresh. Both use mocked GitHub clients in tests;
neither changes Graider config schemas.

## Test Strategy

Unit-test YAML/CSV generation and term-code derivation without Electron. Test
preview/save services in temporary course roots for strict-schema acceptance,
path traversal rejection, conflicts, no overwrite by default, stale preview
rejection, and post-save validation. Include legacy seven-column import and
canonical four-column save coverage. UI tests mock `window.graiderUI`; Electron tests mock dialogs,
filesystem services, runners, and GitHub clients. No tests make live GitHub
calls or invoke apply/grade/report/publish/workflow mutation.

## Resolved Configuration Choices

- Assignment metadata fields are optional; blank values omit their fields and
  omit `metadata` when all four are blank.
