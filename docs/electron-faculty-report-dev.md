# Electron Faculty Report Developer Guide

Reusable Electron UI safety rules live in the
[Codex Electron UI Contract](codex-electron-ui-contract.md). The report command
uses the shared [CLI JSON Contract](cli-json-contract.md).
The current app smoke-test and release-readiness runbook is documented in
[Electron Release Readiness Guide](electron-release-readiness.md).

## Purpose

UI-6A adds a read-only Faculty Report view, and UI-6B documents and stabilizes
that behavior:

```text
Assignment Detail -> Grade Dispatch Preview -> Confirm Grade Dispatch -> Grade Status View -> Faculty Report View
```

The implemented entry point is:

```text
Grade Status -> Faculty Report View
```

A direct `Assignment Detail -> Faculty Report View` entry point is not
implemented in UI-6A/UI-6B.

Faculty Report View is faculty-facing. It asks Graider to run the existing safe
report command for the selected assignment and renders the command JSON result.
Missing grading results, missing artifacts, missing report files, and partial
report data are normal report states when they are represented in valid JSON.

UI-6A does not publish student reports.

## Command and IPC

The Electron main process runs:

```bash
graider report <assignment.yml> --json
```

Main process rules:

- `cwd = registered course folder`
- argv array, not shell-interpolated string
- existing token resolver reused
- resolved token passed only to the child process environment
- stdout JSON parsed in main
- structured result/error returned to renderer

The renderer uses the narrow preload API:

```ts
window.graiderUI.getFacultyReport({
  courseFolderId,
  courseFolderPath,
  assignmentFile
});
```

The IPC channel is:

```text
graider-ui:faculty-report:get
```

There is no generic `runCommand` IPC. The renderer does not access
`child_process`, `fs`, or `process.env`, and it does not call backend modules
directly.

## Navigation

Grade Status provides:

```text
View faculty report
```

When Grade Status reports `readyForReport=false`, the Faculty Report entry point
may still be available because `graider report` safely reports missing data in
JSON. The UI should warn:

```text
Some grading runs are not complete. The report command can still run, but it may show missing results.
```

Faculty Report provides:

- Back to grading status
- Back to assignment detail
- Refresh report

## Loading and Refresh

Opening the page auto-runs the report command and shows assignment/course/term
context from navigation state while loading.

Manual `Refresh report` reruns the full report command. Prior report data stays
visible while the refresh is running, and duplicate refreshes are disabled while
the command is in flight.

## Rendering

The current backend `report --json` output is the standard command JSON result:

- `schemaVersion`
- `commandName: "report"`
- `status`
- `exitCode`
- `diagnostics`
- `warnings`
- `errors`
- `generatedFiles`
- `summary`

The page renders:

- assignment/course/term context
- command status and exit code
- summary totals such as student counts, pass/fail counts, missing artifact
  count, invalid result file count, warning count, error count, and report file
  count
- generated report file paths
- diagnostics
- per-student rows if the command JSON includes `students` or a nested
  `report.students` array

Do not hard-code a requirement that per-student rows must be present in stdout.
The current command writes the detailed faculty summary JSON as a generated file
and reports its path through `generatedFiles`.

## Missing Data

Missing report data from valid JSON is a normal UI state, not invalid JSON.
Render available rows and summary counts when present.

Examples of normal missing-data states:

- no grading results found
- student result artifact missing
- student result file missing
- student report missing
- repository missing or inaccessible
- workflow not complete
- report files not generated because the command failed

Use this faculty-facing guidance when appropriate:

```text
Report data is not available for all students yet.
Return to Grade Status to check whether grading runs have completed.
```

If partial data exists, show available rows, missing rows, and diagnostics
instead of hiding the whole report.

## Relationship to Grade Status

Grade Status `readyForReport` is guidance. Faculty Report can still be opened
and run when `readyForReport=false` because `graider report` returns JSON that
describes missing data.

Do not treat `readyForReport=false` as a hard app error. When run early, Faculty
Report should show the warning from Grade Status and render the valid report JSON
state that comes back from the command.

## Diagnostics and Errors

Render safe diagnostics for:

- missing token
- missing Graider CLI
- missing assignment file
- invalid JSON
- command failure
- GitHub/network diagnostics
- `partial_success`
- `failure`
- missing results represented in valid JSON

Diagnostics and command snippets must not expose tokens, authorization headers,
raw `process.env`, or raw stack traces by default.

## No-Publish Boundary

UI-6A does not:

- pass `--publish-student-reports`
- publish student reports
- push commits
- create pull requests or issues
- modify student repositories
- show student-facing report previews
- dispatch grading workflows
- poll workflow runs
- browse artifacts directly
- generate workflow files
- expose a working publish action

The page may show disabled placeholders:

```text
Publish student reports — deferred
Export report — deferred
```

## Manual Smoke Test

Use only a safe sandbox course for live report smoke tests.

- [ ] Start Vite with `npm run dev`.
- [ ] Start Electron with `npm run dev:electron`.
- [ ] Load dashboard.
- [ ] Open assignment detail.
- [ ] Open Grade Status.
- [ ] Click View faculty report.
- [ ] Confirm Faculty Report auto-loads.
- [ ] Confirm assignment/course/term context renders while loading.
- [ ] Confirm summary counts render.
- [ ] Confirm generated report file paths render.
- [ ] Confirm per-student rows render if present in JSON.
- [ ] Confirm missing result/report states render as normal UI states.
- [ ] Confirm `partial_success` renders available rows.
- [ ] Confirm Refresh report reruns the report command.
- [ ] Confirm prior report data remains visible while refreshing.
- [ ] Confirm duplicate refresh is disabled while running.
- [ ] Confirm diagnostics render safely.
- [ ] Confirm Back to grading status works.
- [ ] Confirm Back to assignment detail works.
- [ ] Confirm Publish student reports is disabled or absent.

## Deferred

- student report publishing
- student report publish preview
- student report publish confirmation
- student-facing report preview
- report export
- workflow generation UI
