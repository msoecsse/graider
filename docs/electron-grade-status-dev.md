# Electron Grade Status Developer Guide

Reusable Electron UI safety rules live in the
[Codex Electron UI Contract](codex-electron-ui-contract.md). The backend command
contract lives in [Assignment Grade Status Command](grade-status-command.md).
The Faculty Report view is documented in
[Electron Faculty Report Developer Guide](electron-faculty-report-dev.md).
The current app smoke-test and release-readiness runbook is documented in
[Electron Release Readiness Guide](electron-release-readiness.md).

## Purpose

UI-5A adds a read-only Grade Status view. UI-5B keeps that boundary documented
and stable.

```text
Assignment Detail -> Grade Status
Grade Dispatch Result Summary -> Grade Status
```

The view shows a one-shot snapshot of GitHub Actions grading workflow run status
and can refresh unfinished rows while the page remains open. Grade Status is
read-only: it performs one-shot command executions from the UI and may run
page-local auto-refresh while open, but it does not run in the background after
the user leaves the page.

Grade Status answers:

- whether grading workflow runs are queued, in progress, completed, missing,
  blocked, token-required, or unknown
- which repositories need attention
- whether report generation appears ready

It does not generate or display the faculty report directly. UI-6A owns the
separate Faculty Report view that calls `graider report <assignment> --json`.

## Commands and IPC

The Electron main process runs:

```bash
graider assignment grade-status <assignment.yml> --json
graider assignment grade-status <assignment.yml> --student <student-id> --json
graider assignment grade-status <assignment.yml> --students <student-id,student-id> --json
```

Initial page load and manual `Refresh status` use the full command without a
student filter. Incremental auto-refresh uses `--student` for one unfinished row
and `--students` for multiple unfinished rows.

The renderer uses the narrow preload API:

```ts
window.graiderUI.getAssignmentGradeStatus({
  courseFolderId,
  courseFolderPath,
  assignmentFile,
  studentIds
});
```

Main process rules:

- no generic `runCommand` IPC
- no generic shell IPC
- no renderer `child_process`, `fs`, or `process.env` access
- renderer does not call backend modules directly
- argv arrays only, not shell-interpolated strings
- `cwd = registered course folder`
- token resolver reused
- stdout JSON parsed in main
- structured result/error returned to renderer

## Refresh Behavior

Initial page load always runs the full command without `studentIds` so the UI
has the complete table.

Manual `Refresh status` also runs the full command. The previous status remains
visible while the refresh is running, and the refresh button is disabled while a
load or refresh is already in progress.

Incremental auto-refresh is page-local:

- rows with `queued`, `in_progress`, `unknown`, or `token_required` are treated
  as non-terminal
- rows with `completed`, `missing`, or `blocked` are terminal
- only non-terminal student IDs are refreshed with `--student` or `--students`
- returned rows are merged into the existing table
- completed/terminal rows are preserved and not rechecked
- refresh stops when all rows are terminal, when the user leaves the page, or
  after the named max duration
- duplicate concurrent auto-refresh requests are blocked by an in-flight guard

The renderer constants are:

```ts
AUTO_REFRESH_INTERVAL_MS = 15_000;
AUTO_REFRESH_MAX_DURATION_MS = 600_000;
```

The UI displays:

```text
Auto-refreshing every 15 seconds while grading is running.
Auto-refresh stopped. Use Refresh status to check again.
```

## Status Labels

The renderer treats these repository statuses as non-terminal:

```text
queued
in_progress
unknown
token_required
```

The renderer treats these repository statuses as terminal:

```text
completed
missing
blocked
```

`cancelled` and `timed_out` are displayed as completed-run conclusions when the
repository status is `completed`; they are not separate repository status values
in the current UI model.

Faculty-facing row labels are:

```text
Queued
In progress
Completed — success
Completed — failure
Cancelled
Timed out
Missing
Unknown
Token required
Blocked
```

## Ready For Report

The page displays `readyForReport` from the merged status rows as status
guidance only:

```text
Ready for report: Yes/No
```

When ready, the UI may say:

```text
Ready for report generation.
```

When not ready, the UI keeps available rows visible and explains obvious causes
when possible, such as runs still in progress, missing completed grading runs,
unknown rows, or blocked repositories.

Do not treat `readyForReport=false` as a UI crash or load failure. Grade Status
itself must not run `graider report <assignment>`. UI-6A may navigate to the
separate Faculty Report view, which runs the report command and safely renders
missing-data JSON.

## Diagnostics and Errors

The page handles these states with safe user-facing messages and available
rows when backend JSON is present:

- missing token
- missing Graider CLI
- missing assignment file
- invalid JSON
- command failure
- GitHub/network diagnostics returned by the backend
- `partial_success`
- `failure`

Missing token guidance is:

```text
GitHub token required to check grading status.
Sign in with GitHub CLI using gh auth login, then refresh.
```

Diagnostics and command snippets must not expose tokens, authorization headers,
raw `process.env`, or raw stack traces by default.

## No-Report Boundary

Grade Status does not:

- call `graider report`
- download artifacts
- parse grading result files
- generate faculty reports
- publish student reports
- dispatch workflows
- mutate local files or GitHub state

In UI-6A, Grade Status exposes a navigation action:

```text
View faculty report
```

That action opens the separate Faculty Report view. It does not run the report
command inside Grade Status.

## Deferred

Grade Status does not implement:

- artifact/result collection UI
- student report publishing
- workflow generation UI

## Manual Smoke Test

Use only a safe sandbox course for live dispatch/status smoke tests.

- [ ] Start Vite with `npm run dev`.
- [ ] Start Electron with `npm run dev:electron`.
- [ ] Load dashboard.
- [ ] Open assignment detail.
- [ ] Open Grade Status.
- [ ] Confirm full status auto-loads.
- [ ] Confirm summary counts render.
- [ ] Confirm rows render for each target student.
- [ ] Confirm manual Refresh status runs a full refresh.
- [ ] Confirm prior rows remain visible while refreshing.
- [ ] Dispatch grading in a safe sandbox course.
- [ ] Return to Grade Status.
- [ ] Confirm queued/in-progress rows auto-refresh.
- [ ] Confirm completed rows are not rechecked during incremental refresh.
- [ ] Confirm auto-refresh stops when all rows are terminal.
- [ ] Confirm auto-refresh stops when leaving the page.
- [ ] Confirm readyForReport display updates.
- [ ] Confirm diagnostics render safely.
- [ ] Confirm View faculty report opens the Faculty Report view.
