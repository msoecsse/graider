# Electron Assignment Detail Developer Guide

Reusable Codex instructions for Electron UI changes live in the
[Codex Electron UI Contract](codex-electron-ui-contract.md).
The Apply Preview and Confirm Apply flow is documented in
[Electron Apply Flow Developer Guide](electron-apply-flow-dev.md).
The Grade Dispatch Preview and Confirm Grade Dispatch flow is documented in
[Electron Grade Dispatch Developer Guide](electron-grade-dispatch-dev.md).
The Grade Status view is documented in
[Electron Grade Status Developer Guide](electron-grade-status-dev.md).
The Faculty Report view is documented in
[Electron Faculty Report Developer Guide](electron-faculty-report-dev.md).
The current app smoke-test and release-readiness runbook is documented in
[Electron Release Readiness Guide](electron-release-readiness.md).

This guide documents the read-only Electron assignment detail flow delivered in
UI-2A through UI-2C, the preview-only UI-3A apply preview page, the guarded
UI-3B confirmed apply execution flow, and the assignment-detail navigation
entry points into grade dispatch and grade status.

UI-2 is read-only.
UI-3A is preview-only and still non-mutating.
UI-3B is confirmed mutation through the apply command only.
UI-5A Grade Status is read-only status monitoring.
UI-6A Faculty Report runs the safe report command but does not publish student
reports.

## Overview

The assignment detail UI provides a full-page read-only inspection view for one
assignment. It opens from a dashboard recent-assignment row, loads data through:

```bash
graider assignment detail <assignment.yml> --json
```

and renders:

- assignment metadata and local context
- readiness summary and needs-attention callouts
- the existing summary, template, grading, student report, roster, diagnostics,
  and action panels
- a compact Grade Status Summary below the main assignment panels and before
  diagnostics
- safe copy affordances for useful strings
- a preview-only apply entry point
- a guarded confirmed apply execution flow from the Apply Preview page
- grade dispatch and grade status entry points
- a read-only Grade Workflow viewer for `.github/workflows/grade.yml`
- a preview-only student repository email panel with read-only notification
  history and duplicate-send indicators

The detail page itself does not apply assignments, dispatch grading, generate
reports, publish reports, generate workflows, edit `assignment.yml`, inspect
artifacts, inspect workflow runs, scan student repositories, or mutate GitHub.
UI-3B applies assignments only from the Apply Preview page after explicit
confirmation.

The Grade Workflow viewer uses the configured template repository and branch
from assignment-detail data. Its narrow main-process API resolves GitHub auth,
checks repository access, then fetches the fixed workflow path through the
GitHub Contents API. A missing file opens a blank draft. Slice F adds a
preview-before-push flow that creates or updates only this fixed path on the
configured branch, using the loaded file SHA to block remote changes. It does
not clone repositories or create pull requests.

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

The confirmed apply path added in UI-3B is:

```text
Assignment detail page -> Preview apply -> Apply Preview page -> Confirm apply -> Apply result
```

The grade status path added in UI-5A is:

```text
Assignment detail page -> Grade Status
Grade Dispatch Result Summary -> Grade Status
Grade Status -> Faculty Report
```

The full Grade Status page remains the detailed/polling status surface and owns
the Faculty Report navigation action. Student report publishing remains
deferred.

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

UI-3B confirmed apply execution should use the canonical assignment-scoped real
apply command:

```bash
graider assignment apply terms/27s1/assignments/lab02/assignment.yml --json
```

That command routes to the existing real apply implementation. The legacy
top-level `graider apply <assignment.yml> --json` command remains supported, but
new UI work should call `assignment apply` for consistency with assignment
detail and apply-preview.

The Electron main process invokes confirmed apply with an argv array:

```ts
["assignment", "apply", assignmentFile, "--json", "--yes"];
```

`--yes` is supplied only after the renderer confirmation checkbox is accepted.
The command still runs with:

- `cwd = registered course folder path`
- `shell: false`
- `GRAIDER_GITHUB_TOKEN` supplied from the existing environment token or
  `gh auth token` fallback when available
- stdout parsed as JSON in the main process
- bounded, redacted structured errors returned to the renderer

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

The UI-4A grade dispatch preview preload API is:

```ts
window.graiderUI.getAssignmentGradePreview({
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
});
```

The corresponding IPC channel is:

```text
graider-ui:assignment-grade-preview:get
```

The UI-3B confirmed apply preload API is:

```ts
window.graiderUI.applyAssignment({
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
});
```

The corresponding IPC channel is:

```text
graider-ui:assignment-apply:run
```

The UI-4B confirmed grade dispatch preload API is:

```ts
window.graiderUI.gradeAssignment({
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
});
```

The corresponding IPC channel is:

```text
graider-ui:assignment-grade:run
```

The UI-5A grade status preload API is:

```ts
window.graiderUI.getAssignmentGradeStatus({
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
});
```

Filtered page-local auto-refresh passes `studentIds` to the same API.

The corresponding IPC channel is:

```text
graider-ui:assignment-grade-status:get
```

The UI-6A faculty report preload API is:

```ts
window.graiderUI.getFacultyReport({
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
});
```

The corresponding IPC channel is:

```text
graider-ui:faculty-report:get
```

Student repository email preview and history use separate narrow APIs. Both are
read-only: they inspect canonical roster data, the assignment manifest, and the
assignment-scoped notification log. A successful notification entry is shown as
`already_sent`; no email transport, authentication, send, resend, or log-write
API is exposed by this flow.

```text
graider-ui:student-repo-email-preview:get
graider-ui:student-repo-email-history:get
```

Notification history is stored, when a later confirmed send flow writes it, at:

```text
terms/<term-code>/notifications/<assignment-slug>/student-repo-emails.json
```

The log contains operational student data and must not contain credentials,
tokens, authorization headers, or full email bodies. Whether it is committed or
ignored is a campus policy decision.

Slice L adds `graider-ui:student-repo-email-transport-status:get` for safe,
read-only transport metadata. The default result is Microsoft Graph planned,
not configured, and `canSend: false`; it does not read credentials, start
authentication, contact Microsoft, or write logs.

Slice N adds internal-only mail transport contracts, a deterministic test mock,
and a Microsoft Graph skeleton that always returns unavailable. It has no send
IPC, no real Microsoft authentication or HTTP calls, and no Assignment Detail
send control. Tenant permissions and sender configuration remain subject to IT
verification.

The main process validates that the request shape contains string
`courseFolderId`, `courseFolderPath`, and `assignmentFile` fields before running
assignment detail, apply preview, grade preview, grade status, confirmed apply,
confirmed grade dispatch, or faculty report.

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

The assignment detail and UI-3A apply-preview flows remain inspection/planning
surfaces only:

- Refresh detail only reruns `graider assignment detail <assignment.yml> --json`.
- Refresh preview only reruns
  `graider assignment apply-preview <assignment.yml> --json`.
- Copy buttons only copy strings to the clipboard.
- Current UI-2C has no open folder or reveal file API.
- Future open/reveal APIs must only use local OS shell APIs for validated paths
  under registered course folders.
- UI-3A alone does not invoke `apply`.
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

UI-3B is the first phase that may call:

```bash
graider assignment apply <assignment.yml> --json
```

Only a confirmed mutation flow should call it.

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

Shows the assignment title, course/term subtitle, Back to dashboard, Preview
apply, Preview grading, View grading status, and Refresh detail.

### Readiness Summary

Shows the faculty-facing readiness label, a short explanation, a raw command
status chip as secondary context, and concise needs-attention items when
present.

### Assignment Panels

The page keeps the existing assignment detail structure: Summary, Template,
Grading, Student reports, Roster / Sections, Diagnostics, and Actions. These
panels are driven by assignment-detail JSON and remain read-only.

### Grade Status Summary

Assignment Detail also loads a read-only grade-status snapshot for the selected
assignment and renders a compact `Grade status summary` section before
Diagnostics. The summary is intentionally smaller than the full Grade Status
view. It shows student identity, section, repository short name, concise status,
readable last update, and available run links. It omits the workflow column,
raw ISO timestamps, full started/completed run details, and implementation-heavy
diagnostics.

Student identity prefers the roster/course username when the grade-status JSON
provides it. If no roster/course username is available, the UI falls back to the
stable student id, then GitHub username as the last display fallback.

Timestamp labels are faculty-readable and locale-formatted. Completed runs use
`Last completed`; rows with only `startedAt` use `Started`; rows without either
field show `No run time available`.

The compact summary does not poll. The full Grade Status view remains the
detailed status table and page-local auto-refresh surface.

### Diagnostics

Critical blockers remain visible through the readiness summary. Full diagnostic
groups render inside a collapsible `Diagnostics (N)` section. Token-like values
are redacted before display.

### Workflow Actions

Header actions open existing workflow pages. `Preview apply` opens UI-3A Apply
Preview and runs only the preview command. `Preview grading` opens UI-4A Grade
Dispatch Preview and runs only the grade-preview command. `View grading status`
opens UI-5A Grade Status and runs only the grade-status command. Mutating apply
and grading actions remain guarded by their existing confirmation pages.

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
  a guarded apply confirmation flow

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

UI-3B enables `Review apply changes` only when the latest preview has no
blockers, no unknown repository rows, no token-required rows, and no error
diagnostics. Otherwise the Apply Preview page keeps `Apply changes` disabled
and shows blocker reasons.

## Confirmed Apply Execution

UI-3B adds a confirmation panel on the Apply Preview page. The panel states:

```text
This will create or update student repositories.
This may write manifests/local apply state if the backend apply command does so.
This may push files/commits to GitHub according to the existing apply implementation.
```

The `Apply changes` button stays disabled until the user checks:

```text
I understand this will apply changes to student repositories
```

During execution:

- `applyAssignment` is called once per confirmed click.
- Refresh/apply controls that could start duplicate work are disabled.
- Existing preview context remains visible.
- Safe loading text shows that assignment changes are being applied.
- The renderer does not call grade, report, publish, or workflow generation.

If the command returns `success`, `partial_success`, or `failure` with usable
JSON, the page renders an Apply Result Summary. If the command cannot start,
returns invalid JSON, or fails before usable JSON is available, the page shows a
safe error such as missing Graider CLI, missing assignment file, invalid apply
JSON, or unable to apply assignment.

## Apply Result Summary

The Apply Result Summary renders the backend apply JSON surface:

- command status and exit code
- applied timestamp
- assignment file
- manifest file when returned
- generated files
- created repository count
- updated repository count
- skipped repository count
- failed repository count
- blocked repository count
- per-student result rows when returned
- safe diagnostics

Preview rows continue to use future-tense labels:

```text
Would create
Would update
Would skip
Blocked
Unknown
Token required
```

Apply result rows use completed labels only after execution:

```text
Created
Updated
Skipped
Failed
Blocked
```

Post-apply actions include Back to assignment detail, Refresh assignment detail,
and Back to dashboard. Refresh assignment detail returns to the detail page and
lets it reload the latest assignment state. It does not discard the visible
apply result until the user chooses that navigation.

## Grade Dispatch Preview Page

UI-4A adds a separate full-page Grade Dispatch Preview view. It opens from the
assignment detail page and auto-runs:

```bash
graider assignment grade-preview <assignment.yml> --json
```

The command runs from the registered course folder with argv arrays, reuses the
main-process token resolver, parses stdout JSON in the main process, and returns
structured result/error data to the renderer. See
`docs/grade-preview-command.md` for the backend JSON contract.

The page is preview-only. It shows visible text:

```text
Preview only — no GitHub Actions workflows will be started.
```

The page renders:

- assignment, course, term, assignment-file, and manifest context
- preview status and a renderer-derived readiness summary
- target sections, section count, student count, and active student count
- effective grading config, including `resolvedFrom`
- workflow path, dispatch ref, and `workflow_dispatch` readiness
- repository dispatch preview summary counts
- per-student repository preview rows
- grouped diagnostics and blockers
- a guarded dispatch confirmation flow when the preview has no blockers

Repository row labels must use preview wording:

```text
Would dispatch
Would skip
Blocked
Unknown
Token required
```

They must not use completed labels such as `Dispatched`.

`Refresh preview` reruns only the grade-preview command, keeps the prior preview
visible while loading, and replaces it when the latest result arrives. If a safe
command error occurs during refresh, the previous preview remains visible when
available.

Missing-token previews can still render local target/config data when the
backend returns it. The UI shows guidance to authenticate with GitHub CLI and
refresh.

## Confirmed Grade Dispatch

UI-4B adds a confirmation panel on the Grade Dispatch Preview page. Confirmed
dispatch runs:

```bash
graider assignment grade <assignment.yml> --json --all
```

The command runs from the registered course folder with argv arrays, reuses the
main-process token resolver, parses stdout JSON in the main process, and returns
structured result/error data to the renderer. The `--all` selector matches the
assignment-wide Grade Dispatch Preview plan and preserves the backend grade
command requirement that exactly one target selector be supplied.

The confirmation panel states:

```text
This will start GitHub Actions grading workflows on student repositories.
This does not collect results yet.
Reports and result collection are handled in later slices.
```

The `Dispatch grading` button stays disabled until the user checks:

```text
I understand this will start grading workflows on student repositories
```

During execution:

- `gradeAssignment` is called once per confirmed click.
- Refresh/dispatch controls that could start duplicate work are disabled.
- Existing preview context remains visible.
- Safe loading text shows that grading workflows are being dispatched.
- The renderer does not call apply, report, publish, workflow generation,
  workflow polling, artifact inspection, or result collection.

If the command returns `success`, `partial_success`, or `failure` with usable
JSON, the page renders a Grade Dispatch Result Summary. If the command cannot
start, returns invalid JSON, or fails before usable JSON is available, the page
shows a safe error such as missing Graider CLI, missing assignment file, invalid
grade JSON, or unable to dispatch grading.

The result summary renders:

- assignment, course, term, assignment file, workflow, and dispatch ref context
- command status and exit code
- dispatched timestamp
- whether workflow dispatch was attempted
- targeted repository count
- dispatched count
- skipped count
- failed/blocked count
- per-student dispatch result rows when returned
- safe diagnostics

Grade dispatch result rows use completed labels only after execution:

```text
Dispatched
Skipped
Failed
Blocked
```

Post-dispatch actions include Back to assignment detail, Refresh assignment
detail, and Back to dashboard. Result collection, report generation, student
report publishing, workflow run polling, artifact inspection, and workflow
generation remain deferred.

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

For Grade Dispatch Preview:

- opening the page shows assignment context immediately when available
- the page auto-runs `getAssignmentGradePreview`
- refresh keeps the prior preview visible
- `partial_success` still renders available target, grading, workflow, and
  repository plan data
- token-required rows render with GitHub token guidance
- missing CLI renders Graider CLI setup guidance
- missing assignment file renders `Assignment file not found.`
- invalid JSON renders `Graider returned invalid grade preview JSON.`
- fallback failures render `Unable to load grade preview.`

For confirmed Grade Dispatch:

- missing CLI renders Graider CLI setup guidance
- missing assignment file renders `Assignment file not found.`
- invalid JSON renders `Graider returned invalid grade JSON.`
- fallback failures render `Unable to dispatch grading.`
- `partial_success` and `failure` JSON still render available result summary and
  diagnostics

For confirmed Apply:

- missing CLI renders Graider CLI setup guidance
- missing assignment file renders `Assignment file not found.`
- invalid JSON renders `Graider returned invalid apply JSON.`
- fallback failures render `Unable to apply assignment.`
- `partial_success` and `failure` JSON still render available result summary and
  diagnostics

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

## Assignment Detail Workflow Actions

Visible actions:

- Refresh detail
- Preview apply
- Preview grading
- View grading status

`Refresh detail` is functional and read-only. It reruns assignment detail.

`Preview apply` is functional in UI-3A and opens the preview-only Apply Preview
page. It does not call actual apply execution.

`Preview grading` is functional and opens the Grade Dispatch Preview page.
The page remains preview-only until explicit UI-4B confirmation is accepted.

`View grading status` is functional in UI-5A and opens the read-only Grade Status
page. It does not call `graider report`, download artifacts, parse grading
result files, dispatch workflows, or mutate local/GitHub state.

`View full grade status` in the compact Grade Status Summary opens the same
UI-5A Grade Status page. `View faculty report` is available from the full Grade
Status view in UI-6A. It opens the Faculty Report view and runs
`graider report <assignment.yml> --json` through narrow IPC. It does not pass
`--publish-student-reports`.

The final apply action lives on the Apply Preview page and is implemented in
UI-3B with confirmation. The final grade dispatch action lives on the Grade
Dispatch Preview page and is implemented in UI-4B with confirmation. Student
report publishing and workflow generation remain deferred and are not launched
from Assignment Detail.

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

Manual confirmed-apply and confirmed-grade smoke tests mutate GitHub/local
state. Use only a safe sandbox course.

Checklist:

- [ ] Load dashboard.
- [ ] Click a recent assignment row.
- [ ] Assignment detail page opens.
- [ ] Detail auto-loads.
- [ ] Readiness summary appears.
- [ ] Existing Summary, Template, Grading, Student reports, Roster / Sections,
      Diagnostics, and Actions panels render.
- [ ] Grade Status Summary appears before Diagnostics.
- [ ] Grade Status Summary rows show student identity, section, repository,
      concise status, readable last update, and available run links.
- [ ] Grade Status Summary omits the workflow column and raw ISO timestamps.
- [ ] View full grade status opens the full Grade Status view.
- [ ] No-grading assignment renders cleanly if a fixture exists.
- [ ] Diagnostics render in the collapsible diagnostics section.
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
- [ ] Click Preview grading.
- [ ] Grade Dispatch Preview page opens.
- [ ] Preview auto-loads.
- [ ] Preview-only notice says no GitHub Actions workflows will be started.
- [ ] Target panel shows sections and student count.
- [ ] Effective grading panel shows resolved source and workflow config.
- [ ] Workflow panel shows path/ref and `workflow_dispatch` readiness.
- [ ] Repository summary counts render.
- [ ] Repository rows show Would dispatch, Would skip, Blocked, Unknown, or
      Token required as applicable.
- [ ] Dispatch grading is disabled when preview blockers exist.
- [ ] Ready grade preview enables Review grade dispatch.
- [ ] Confirm grade dispatch panel appears.
- [ ] Dispatch grading stays disabled until the confirmation checkbox is
      checked.
- [ ] Confirmed grade dispatch runs once on a safe sandbox course only.
- [ ] Grade Dispatch Result Summary renders success, partial success, and
      failure JSON.
- [ ] Result rows use Dispatched, Skipped, Failed, or Blocked labels.
- [ ] Refresh grade preview keeps prior preview visible.
- [ ] Back to assignment detail returns without rerunning detail.
- [ ] Click View grading status.
- [ ] Grade Status page opens.
- [ ] Full grade status auto-loads.
- [ ] Manual Refresh status keeps prior rows visible.
- [ ] Queued/in-progress rows auto-refresh while the page remains open.
- [ ] From Grade Status, click View faculty report.
- [ ] Faculty Report page opens.
- [ ] Report summary and generated report paths render.
- [ ] Publish student reports is disabled from Faculty Report.
- [ ] Apply is disabled when preview blockers exist.
- [ ] Ready apply preview enables Review apply changes.
- [ ] Confirmation panel appears.
- [ ] Apply changes stays disabled until the confirmation checkbox is checked.
- [ ] Confirmed apply runs once on a safe sandbox course only.
- [ ] Apply Result Summary renders success, partial success, and failure JSON.
- [ ] Result rows use Created, Updated, Skipped, Failed, or Blocked labels.
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
- [ ] Grade preview repository rows with blocked, unknown, or token-required
      status.
- [ ] Grade preview with grading disabled if a fixture exists.
- [ ] Grade dispatch missing token, missing CLI, invalid JSON, and
      partial-success failures with safe diagnostics.
- [ ] Refresh assignment detail returns to the detail page and reloads detail.

## Future Slice Boundary

Planned boundaries:

- UI-3A: Apply Assignment Preview, implemented as preview-only UI
- UI-3B: Apply Assignment Confirm and Execute, implemented
- UI-4A: Grade Dispatch Preview, implemented as preview-only UI
- UI-4B: Grade Dispatch Confirm and Execute, implemented
- UI-5A: Grade Status View, implemented as read-only status monitoring
- UI-6A: Faculty Report View, implemented with `graider report`
- UI-6+: Student Report Publishing View
- UI-7: Workflow Generation View

The important conceptual split is:

```text
UI-2  = read-only inspection
UI-3A = preview-only planning, still non-mutating
UI-3B = confirmed mutation
UI-4A = preview-only grade dispatch planning
UI-4B = confirmed grade dispatch mutation
UI-5A = read-only grade status monitoring
UI-6A = faculty report generation/read view, no student publishing
```

UI-3A should be allowed to ask the backend for preview/plan data without
mutating. The backend contract for that preview is:

```bash
graider assignment apply-preview <assignment.yml> --json
```

That command returns target rows, repository preview statuses, readiness
blockers, and action metadata without creating repositories, writing manifests,
generating workflows, or dispatching workflows.

UI-3B is the first slice that executes a confirmed mutation. It uses explicit
confirmation and command-specific IPC rather than reusing assignment detail
refresh.

UI-4A is non-mutating. It uses:

```bash
graider assignment grade-preview <assignment.yml> --json
```

It must not call `assignment grade`, legacy `grade`, report generation, student
report publishing, or workflow generation.

UI-4B is a confirmed mutation. It uses:

```bash
graider assignment grade <assignment.yml> --json --all
```

It starts GitHub Actions grading workflows only after explicit confirmation.
Workflow run polling, artifact/result collection, report generation, student
report publishing, and workflow generation remain deferred.
