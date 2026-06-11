# Electron Assignment Detail Developer Guide

This guide documents the read-only Electron assignment detail flow delivered in
UI-2A through UI-2C and the preview-only UI-3A apply preview page. It is the
reference for preserving the current inspection and planning boundary before
UI-3B adds confirmed mutation workflows.

UI-2 is read-only.
UI-3A is preview-only and still non-mutating.

## Overview

The assignment detail UI provides a full-page read-only inspection view for one
assignment. It opens from a dashboard recent-assignment row, loads data through:

```bash
graider assignment detail <assignment.yml> --json
```

and renders:

- assignment metadata and local context
- readiness summary and needs-attention callouts
- template, grading, student report, roster, and section details
- grouped diagnostics
- safe copy affordances for useful strings
- a preview-only apply entry point
- disabled placeholders for future mutation workflow actions

The detail page does not apply assignments, dispatch grading, generate reports,
publish reports, generate workflows, edit `assignment.yml`, inspect artifacts,
inspect workflow runs, scan student repositories, or mutate GitHub.

## Navigation Flow

The navigation path is:

```text
Dashboard course card -> Recent assignment row -> Assignment detail page
```

Rows only open the detail page when the dashboard assignment summary includes a
stable `assignmentFile`. The renderer must not derive assignment paths from
display text such as assignment title, slug, or button label.

The renderer passes this context into the detail page:

- `courseFolderId`
- `courseFolderPath`
- `assignmentFile`
- dashboard assignment summary fields when available, such as title, slug,
  status, course label, and term label

The detail page uses dashboard summary fields only as display fallbacks while
the detail command is loading or when optional response fields are missing.

`Back to dashboard` returns to the existing dashboard state. It does not clear
loaded dashboard cards, search, filters, sort, or folder results.

`Refresh detail` reruns the assignment detail command for the same
`courseFolderPath` and `assignmentFile`. During refresh, the prior detail result
remains visible and the refresh button is disabled.

The apply preview path added in UI-3A is:

```text
Assignment detail page -> Preview apply -> Apply Preview page
```

The renderer passes the original `courseFolderId`, `courseFolderPath`, and
`assignmentFile` into the preview page. It may also pass the loaded assignment
detail JSON as display context. The preview page must not derive the assignment
file from visible text.

`Back to assignment` returns from Apply Preview to the existing assignment
detail page state. The loaded detail result is preserved when available.

## Backend Command Boundary

The backend source of truth is:

```bash
graider assignment detail terms/27s1/assignments/lab02/assignment.yml --json
```

The Electron main process runs it with:

- `cwd = registered course folder path`
- an argv array, not a shell-interpolated command string
- `shell: false` through the shared process runner
- `GRAIDER_GITHUB_TOKEN` supplied from the existing environment token or
  `gh auth token` fallback when available

The main process parses stdout as assignment-detail JSON. If stdout contains
valid assignment-detail JSON, the renderer receives that structured response,
including `partial_success` responses. If the command cannot start, returns
invalid JSON, or fails before returning usable JSON, the main process returns a
structured error with bounded snippets. Resolved token values are redacted from
command snippets before returning errors.

The renderer:

- does not import Graider backend modules
- does not parse `assignment.yml`
- does not access `fs`
- does not access `child_process`
- does not access `process.env`
- does not read raw local files directly

UI-3A adds a second read-only command boundary:

```bash
graider assignment apply-preview terms/27s1/assignments/lab02/assignment.yml --json
```

The Electron main process runs it with the same command-runner and token
resolution boundary:

- `cwd = registered course folder path`
- an argv array, not a shell-interpolated command string
- `shell: false`
- `GRAIDER_GITHUB_TOKEN` supplied from the existing environment token or
  `gh auth token` fallback when available

The main process parses stdout as apply-preview JSON and returns structured
success, partial-success, or safe error results to the renderer. It does not
call apply execution code.

## IPC Boundary

The assignment detail preload API is:

```ts
window.graiderUI.getAssignmentDetail({
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
});
```

The corresponding IPC channel is:

```text
graider-ui:assignment-detail:get
```

The UI-3A apply preview preload API is:

```ts
window.graiderUI.getAssignmentApplyPreview({
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
});
```

The corresponding IPC channel is:

```text
graider-ui:assignment-apply-preview:get
```

The main process validates that the request shape contains string
`courseFolderId`, `courseFolderPath`, and `assignmentFile` fields before running
either command.

Current assignment-detail UI copy affordances use the browser clipboard API in
the renderer. There are no preload APIs for copy.

Local open/reveal APIs are not implemented in UI-2C. There is no:

```ts
window.graiderUI.openCourseFolder(...)
window.graiderUI.revealAssignmentFile(...)
```

No generic `runCommand` IPC exists. No generic shell IPC exists. No generic
open-arbitrary-path IPC exists.

If local open/reveal is added later, it must be narrow, owned by the main
process, validate paths under a registered course folder, use
`shell.openPath`/`shell.showItemInFolder`, and return structured success/error
results. It must not expose generic shell command execution.

## Assignment Detail Non-Mutation Guarantees

The assignment detail and UI-3A apply-preview flows are inspection/planning
surfaces only:

- Refresh detail only reruns `graider assignment detail <assignment.yml> --json`.
- Refresh preview only reruns
  `graider assignment apply-preview <assignment.yml> --json`.
- Copy buttons only copy strings to the clipboard.
- Current UI-2C has no open folder or reveal file API.
- Future open/reveal APIs must only use local OS shell APIs for validated paths
  under registered course folders.
- The UI-3A `Apply changes — coming in UI-3B` button is disabled.
- No `apply` command is invoked.
- No `grade` command is invoked.
- No `report` command is invoked.
- No `report --publish-student-reports` command is invoked.
- No `workflow generate` command is invoked.
- No local files are written by the assignment detail page.
- No `assignment.yml` edits are performed.
- No GitHub repositories are created, updated, deleted, or permission-modified.
- No GitHub workflows are dispatched.
- No reports are published.
- No artifacts or workflow runs are inspected.
- No student repository scans are performed.

This boundary matters for UI-3:

```text
UI-2  = read-only inspection
UI-3A = preview-only planning, still non-mutating
UI-3B = confirmed mutation
```

## Readiness Summary

Readiness is renderer-derived display state. It does not change the backend
assignment detail JSON contract.

Inputs include:

- top-level assignment detail `status`
- diagnostics and diagnostic severities
- template `status`, `repositoryStatus`, and `branchStatus`
- grading `workflowStatus` and `workflowDispatch`
- student report config
- roster summary presence
- assignment status

Current faculty-facing labels are:

```text
Ready
Needs attention
Partially checked
Not required
Not checked
Unavailable
```

Needs-attention callouts are concise summaries derived from obvious fields, such
as missing template repository, missing template branch, missing grading
workflow, missing `workflow_dispatch`, token-required readiness checks, or
missing roster summary.

No-grading assignments are not treated as workflow errors when workflow fields
are `not_required`.

## Detail Page Sections

### Header

Shows the assignment title, course/term subtitle, Back to dashboard, and Refresh
detail.

### Readiness Summary

Shows the faculty-facing readiness label, a short explanation, a raw command
status chip as secondary context, and concise needs-attention items when
present.

### Summary

Shows title, slug, type, status, points, due date, late policy, sections,
faculty owner, LMS assignment ID, grading category, assignment file path, and
course folder path. Missing optional values render neutral placeholders such as
`Not configured`.

### Template

Shows repository, branch, overall status, repository status, and branch status.
When the repository is present, the page offers `Copy template repository`.

### Grading

Shows enabled, mode, workflow path, artifact name, result file, workflow file
status, and `workflow_dispatch` status. No-grading assignments render `No
grading configured.` and are not styled as errors.

### Student Reports

Shows enabled and mode. Disabled student reports render as a normal configured
state, not an error.

### Roster / Sections

Shows sections, section count, active student count, and total student count.
When roster data is missing, the panel renders `Roster summary unavailable.`

### Diagnostics

Shows grouped diagnostics or `No diagnostics.`

### Available Actions

Shows the action area. `Validate / Refresh detail` reruns assignment detail.
`Preview apply` opens the UI-3A Apply Preview page and runs only the preview
command. Grade, report, publish, and workflow generation actions remain disabled
placeholders.

## Apply Preview Page

UI-3A adds a separate full-page Apply Preview view. It opens from the assignment
detail page and auto-runs:

```bash
graider assignment apply-preview <assignment.yml> --json
```

The page is preview-only. It shows visible text:

```text
Preview only — no repositories or files will be changed.
```

The page renders:

- assignment, course, term, and assignment-file context
- preview status and a renderer-derived readiness summary
- target sections, section count, and student count
- template repository, branch, and readiness status
- grading enabled/mode, workflow path, workflow file status, and
  `workflow_dispatch` status
- repository plan summary counts
- per-student repository preview rows
- grouped diagnostics and blockers
- a disabled final action button:
  `Apply changes — coming in UI-3B`

Repository row labels must use preview wording:

```text
Would create
Would update
Would skip
Blocked
Unknown
Token required
```

They must not use past-tense labels such as `Created` or `Updated` for preview
rows.

`Refresh preview` reruns only the apply-preview command, keeps the prior preview
visible while loading, and replaces it when the latest result arrives. If a safe
command error occurs during refresh, the previous preview remains visible when
available.

Missing-token previews can still render local target rows when the backend
returns them. The UI shows guidance to authenticate with GitHub CLI and refresh.
No actual apply command is wired in UI-3A.

## Diagnostics Behavior

Diagnostics are rendered in grouped sections:

```text
Needs attention
Warnings
Info
```

Grouping is based on severity:

- `error` -> Needs attention
- `warning` -> Warnings
- any other or missing severity -> Info

Each diagnostic shows:

- severity as visible text
- a lightweight category when obvious
- message
- code
- safe context fields when present

Category inference is intentionally light. It looks for obvious diagnostic code
or message hints, such as template, workflow/grading, report, roster, GitHub,
token, or assignment.

The UI must not show:

- GitHub tokens
- authorization headers
- raw `process.env`
- raw stack traces by default
- large raw command output

The renderer normalization also redacts token-looking diagnostic messages and
context values before display. Empty diagnostics render `No diagnostics.`

## Loading, Partial Success, and Errors

When the detail page opens:

- dashboard summary context is shown immediately when available
- a loading indicator is shown
- the page auto-runs `getAssignmentDetail`
- panels fill when the response arrives

When refreshing:

- prior detail remains visible
- refresh controls are disabled while loading
- loading text indicates the detail is refreshing
- the latest result replaces the prior result when available

For `partial_success`:

- available detail panels still render
- readiness may show `Partially checked`
- diagnostics remain prominent
- the whole page is not treated as failed

For `token_required`:

- local detail still renders
- GitHub token guidance is shown
- readiness communicates that GitHub-backed checks were not fully completed

Safe command error messages:

- missing CLI: safe Graider CLI not found guidance
- assignment missing: `Assignment file not found.`
- invalid JSON: `Graider returned invalid assignment detail JSON.`
- fallback: `Unable to load assignment detail.`

Raw command snippets and token-looking values are not shown in the renderer.

For Apply Preview:

- opening the page shows assignment context immediately when available
- the page auto-runs `getAssignmentApplyPreview`
- refresh keeps the prior preview visible
- `partial_success` still renders available target, readiness, and repository
  plan data
- token-required rows render with GitHub token guidance
- missing CLI renders Graider CLI setup guidance
- missing assignment file renders `Assignment file not found.`
- invalid JSON renders `Graider returned invalid apply preview JSON.`
- fallback failures render `Unable to load apply preview.`

## Safe Copy/Open Affordances

Current UI-2C copy buttons:

- Copy assignment path
- Copy course folder path
- Copy template repository
- Copy workflow path

Copy uses `navigator.clipboard.writeText` in the renderer. It does not write
files and does not store copied values. Success feedback shows `Copied`.
Failure feedback shows `Unable to copy.`

The UI-3A Apply Preview page reuses the renderer clipboard pattern for
`Copy template repository` when a template repository is present.

Local open/reveal is deferred. There is currently no Open course folder or
Reveal assignment file button on the assignment detail page.

When local open/reveal is implemented later, required safety rules are:

- path must be under a registered course folder
- main process owns `shell.openPath` and `shell.showItemInFolder`
- renderer cannot execute shell commands
- missing paths return safe structured errors
- no generic shell/open arbitrary path IPC is exposed

## Disabled Future Actions

Visible actions:

- Validate / Refresh detail
- Preview apply
- Grade submissions
- Generate report
- Publish student reports
- Generate/update workflow

`Validate / Refresh detail` is functional and read-only. It reruns assignment
detail.

`Preview apply` is functional in UI-3A and opens the preview-only Apply Preview
page. It does not call actual apply execution.

The final apply action lives on the Apply Preview page and is disabled with:

```text
Apply changes — coming in UI-3B
```

Grade, report, publish, workflow generation, and confirmed apply remain
disabled placeholders. Disabled actions show either `Coming in a future slice`
or `Unavailable for this assignment`, based on the action availability returned
by the assignment detail JSON. They do not call mutation commands.

## Manual Smoke-Test Checklist

Start the renderer:

```bash
cd ui
npm run dev
```

Start Electron in another terminal:

```bash
cd ui
npm run dev:electron
```

Checklist:

- [ ] Load dashboard.
- [ ] Click a recent assignment row.
- [ ] Assignment detail page opens.
- [ ] Detail auto-loads.
- [ ] Readiness summary appears.
- [ ] Summary panel renders points, due date, and sections.
- [ ] Template panel renders repository, branch, and status fields.
- [ ] Grading panel renders workflow, artifact, result file, and
      `workflow_dispatch`.
- [ ] No-grading assignment renders cleanly if a fixture exists.
- [ ] Diagnostics render and are grouped.
- [ ] Copy assignment path works.
- [ ] Copy course folder path works.
- [ ] Copy template repository works when present.
- [ ] Copy workflow path works when present.
- [ ] Click Preview apply.
- [ ] Apply Preview page opens.
- [ ] Preview auto-loads.
- [ ] Preview-only notice appears.
- [ ] Target panel shows sections and student count.
- [ ] Template and grading readiness render.
- [ ] Repository summary counts render.
- [ ] Repository rows show Would create, Would update, Would skip, Blocked,
      Unknown, or Token required as applicable.
- [ ] Diagnostics and blockers render.
- [ ] Copy template repository works when present on the preview page.
- [ ] Refresh preview keeps prior preview visible.
- [ ] Back returns to the assignment detail page.
- [ ] `Apply changes — coming in UI-3B` is visible and disabled.
- [ ] Open/reveal local affordance works if implemented. For UI-2C this is
      deferred, so verify no unsafe partial open/reveal API exists.
- [ ] Refresh detail keeps prior detail visible.
- [ ] Back returns to dashboard without clearing dashboard state.
- [ ] Disabled actions do not run commands.
- [ ] No mutation occurs.

Edge cases to smoke when fixtures are available:

- [ ] Missing token with `partial_success`.
- [ ] Missing template repository.
- [ ] Missing workflow_dispatch.
- [ ] Missing roster summary.
- [ ] Null points, deadline, and LMS assignment ID.
- [ ] Apply preview repository rows with unknown or token-required status.
- [ ] Apply preview with no target students if a fixture exists.

## Future Slice Boundary

Planned boundaries:

- UI-3A: Apply Assignment Preview, implemented as preview-only UI
- UI-3B: Apply Assignment Confirm and Execute
- UI-4: Grade Dispatch View
- UI-5: Report Summary View
- UI-6: Student Report Publishing View
- UI-7: Workflow Generation View

The important conceptual split is:

```text
UI-2  = read-only inspection
UI-3A = preview-only planning, still non-mutating
UI-3B = confirmed mutation
```

UI-3A should be allowed to ask the backend for preview/plan data without
mutating. The backend contract for that preview is:

```bash
graider assignment apply-preview <assignment.yml> --json
```

That command returns target rows, repository preview statuses, readiness
blockers, and action metadata without creating repositories, writing manifests,
generating workflows, or dispatching workflows.

UI-3B is the first slice that should execute a confirmed mutation, and it should
add explicit confirmation and command-specific IPC rather than reusing
assignment detail refresh.
