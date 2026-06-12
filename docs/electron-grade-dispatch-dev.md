# Electron Grade Dispatch Developer Guide

Reusable Electron UI safety rules live in the
[Codex Electron UI Contract](codex-electron-ui-contract.md). The backend
preview/dispatch command contract lives in
[Assignment Grade Preview Command](grade-preview-command.md).

## Purpose

This guide documents the boundary between:

```text
UI-4A = preview-only grade dispatch planning
UI-4B = confirmed GitHub Actions dispatch mutation
UI-5  = future grade status/result/reporting
```

The implemented flow is:

```text
Assignment Detail -> Grade Dispatch Preview -> Confirm Grade Dispatch -> Grade Dispatch Result Summary
```

Grade Dispatch Preview is non-mutating. Confirmed Grade Dispatch starts GitHub
Actions workflow runs on student repositories. Confirmed Grade Dispatch does
not collect grading results and does not generate faculty reports.

## Commands

The grade dispatch flow uses two assignment-scoped CLI commands:

```bash
graider assignment grade-preview <assignment.yml> --json
graider assignment grade <assignment.yml> --json
```

Both commands are run by the Electron main process with:

- `cwd = registered course folder`
- argv arrays, not shell-interpolated strings
- the existing token resolver
- stdout JSON parsed in the main process
- structured result/error objects returned to the renderer

The grade-preview command is preview-only. It must not dispatch workflows,
inspect workflow runs, download artifacts, collect grading results, generate
reports, publish reports, or generate workflow files.

The grade command is the canonical UI-4B mutation command. The current main
process runner invokes it as:

```ts
["assignment", "grade", assignmentFile, "--json", "--all"];
```

`--all` is supplied because the backend grade command requires exactly one
target selector, and the UI-4A preview represents the assignment-wide dispatch
plan.

## IPC Boundary

The renderer uses narrow preload APIs:

```ts
window.graiderUI.getAssignmentGradePreview({
  courseFolderId,
  courseFolderPath,
  assignmentFile
});

window.graiderUI.gradeAssignment({
  courseFolderId,
  courseFolderPath,
  assignmentFile
});
```

The corresponding IPC channels are:

```text
graider-ui:assignment-grade-preview:get
graider-ui:assignment-grade:run
```

There is no generic `runCommand` IPC. There is no generic shell IPC. The
renderer does not access `child_process`, `fs`, or `process.env`, and it does
not import backend modules directly.

## Confirmation Requirement

Grade Dispatch Preview auto-loads when the page opens. The dispatch entry point
is disabled when the latest preview has blockers, unknown repository rows,
token-required rows, non-success status, error diagnostics, disabled grading,
or no repositories ready to dispatch.

When dispatch is available, the UI uses a full-page confirmation panel on the
Grade Dispatch Preview page. The user first selects `Review grade dispatch`,
then must check:

```text
I understand this will start grading workflows on student repositories
```

The final `Dispatch grading` button remains disabled until the checkbox is
checked. While dispatch is running, refresh/dispatch controls that could start
duplicate work are disabled, and the renderer guards against concurrent
dispatch calls.

The confirmation panel states:

```text
This will start GitHub Actions grading workflows on student repositories.
This does not collect results yet.
Reports and result collection are handled in later slices.
```

## Preview vs Result Wording

Preview rows use future-tense labels:

```text
Would dispatch
Would skip
Blocked
Unknown
Token required
```

Grade dispatch result rows use completed/action-result labels after execution:

```text
Dispatched
Skipped
Failed
Blocked
```

Do not mix preview wording with result wording.

## Result States

The Grade Dispatch Result Summary renders usable backend JSON for:

- `success`
- `partial_success`
- `failure`

When present, the UI shows command status, exit code, dispatched timestamp,
assignment/course/term context, workflow/ref context, target count, dispatched
count, skipped count, failed/blocked count, per-student result rows, and
diagnostics.

Safe command errors render bounded user-facing messages:

- missing token or GitHub/backend diagnostic: render the safe backend
  diagnostic message and code
- missing Graider CLI: `Graider CLI not found. Install Graider or make sure graider is available on PATH.`
- missing assignment file: `Assignment file not found.`
- invalid grade JSON: `Graider returned invalid grade JSON.`
- fallback command failure: `Unable to dispatch grading.`

Diagnostics and command snippets must not expose tokens, authorization headers,
raw `process.env`, or raw stack traces by default.

## Deferred Functionality

The grade dispatch flow does not implement:

- workflow run status monitoring
- artifact/result collection
- faculty report generation with `graider report`
- student report publishing
- workflow generation UI

Those actions must remain disabled or absent until a future slice explicitly
wires them. Do not wire `graider report <assignment>` from UI-4C.

## Stabilization Checks

When touching this flow, verify:

- Grade Dispatch Preview calls only `getAssignmentGradePreview`.
- Confirmed Grade Dispatch calls only `gradeAssignment`.
- Dispatch is unavailable when preview blockers exist.
- Dispatch cannot run twice concurrently.
- Result rendering redacts token-looking values.
- No apply, report, publish, workflow generation, workflow polling, artifact
  inspection, or result collection APIs are wired.
- IPC remains narrow and typed.

## Manual Smoke-Test Checklist

Manual confirmed-dispatch smoke tests start GitHub Actions workflow runs. Use
only a safe sandbox course.

Start Vite:

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
- [ ] Open assignment detail.
- [ ] Open Grade Dispatch Preview.
- [ ] Confirm preview auto-loads.
- [ ] Confirm preview rows use `Would ...` wording.
- [ ] Confirm Dispatch is disabled when blockers exist.
- [ ] Confirm Dispatch requires explicit confirmation when allowed.
- [ ] Execute dispatch on a safe sandbox course only.
- [ ] Confirm duplicate dispatch is disabled while dispatching.
- [ ] Confirm result summary renders.
- [ ] Confirm result rows use completed dispatch wording.
- [ ] Confirm diagnostics render safely.
- [ ] Confirm Back navigation still works.
- [ ] Confirm report/publish/workflow generation are not wired.
