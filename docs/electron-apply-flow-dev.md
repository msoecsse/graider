# Electron Apply Flow Developer Guide

Reusable Electron UI safety rules live in the
[Codex Electron UI Contract](codex-electron-ui-contract.md). This guide covers
the concrete Apply Preview and Confirm Apply flow used by the assignment detail
UI.

## Purpose

This guide documents the boundary between:

```text
UI-2  = read-only assignment inspection
UI-3A = preview-only apply planning
UI-3B = confirmed apply mutation
```

The flow is:

```text
Assignment Detail -> Apply Preview -> Confirm Apply -> Apply Result Summary
```

Apply Preview is non-mutating. Confirmed Apply is mutating. Apply execution only
happens after explicit user confirmation.

## Commands

The apply flow uses two assignment-scoped CLI commands:

```bash
graider assignment apply-preview <assignment.yml> --json
graider assignment apply <assignment.yml> --json
```

Both commands are run by the Electron main process with:

- `cwd = registered course folder`
- argv arrays, not shell-interpolated strings
- the existing token resolver
- stdout JSON parsed in the main process
- structured result/error objects returned to the renderer

The apply-preview command is preview-only and must not create repositories,
write manifests, push files, dispatch workflows, publish reports, or generate
workflow files.

The apply command is the canonical UI-3B mutation command. The current main
process runner invokes it as:

```ts
["assignment", "apply", assignmentFile, "--json", "--yes"];
```

`--yes` is supplied only after the renderer confirmation checkbox is accepted.

## IPC Boundary

The renderer uses narrow preload APIs:

```ts
window.graiderUI.getAssignmentApplyPreview({
  courseFolderId,
  courseFolderPath,
  assignmentFile
});

window.graiderUI.applyAssignment({
  courseFolderId,
  courseFolderPath,
  assignmentFile
});
```

The corresponding IPC channels are:

```text
graider-ui:assignment-apply-preview:get
graider-ui:assignment-apply:run
```

There is no generic `runCommand` IPC. There is no generic shell IPC. The
renderer does not access `child_process`, `fs`, or `process.env`, and it does
not import backend modules directly.

## Confirmation Requirement

Apply Preview auto-loads when the page opens. The apply entry point is disabled
when the latest preview has blockers, unknown repository rows, token-required
rows, non-success status, or error diagnostics.

When apply is available, the UI uses a full-page confirmation panel on the
Apply Preview page. The user first selects `Review apply changes`, then must
check:

```text
I understand this will apply changes to student repositories
```

The final `Apply changes` button remains disabled until the checkbox is
checked. While apply is running, refresh/apply controls that could start
duplicate work are disabled, and the renderer guards against concurrent apply
calls.

The confirmation panel states:

```text
This will create or update student repositories.
This may write manifests/local apply state if the backend apply command does so.
This may push files/commits to GitHub according to the existing apply implementation.
```

## Preview vs Result Wording

Preview rows use future-tense labels:

```text
Would create
Would update
Would skip
Blocked
Unknown
Token required
```

Apply result rows use completed/action-result labels after execution:

```text
Created
Updated
Skipped
Failed
Blocked
```

Do not mix preview wording with result wording.

## Result States

The Apply Result Summary renders usable backend JSON for:

- `success`
- `partial_success`
- `failure`

When present, the UI shows command status, exit code, applied timestamp,
assignment file, manifest file, generated files, repository counts,
per-student result rows, and diagnostics.

Safe command errors render bounded user-facing messages:

- missing token or GitHub/backend diagnostic: render the safe backend diagnostic
  message and code
- missing Graider CLI: `Graider CLI not found. Install Graider or make sure graider is available on PATH.`
- missing assignment file: `Assignment file not found.`
- invalid apply JSON: `Graider returned invalid apply JSON.`
- fallback command failure: `Unable to apply assignment.`

Diagnostics and command snippets must not expose tokens, authorization headers,
raw `process.env`, or raw stack traces by default.

## Deferred Actions

The apply flow does not implement:

- grade dispatch
- report generation
- student report publishing
- workflow generation UI
- artifact/result inspection
- workflow run inspection

Those actions must remain disabled or absent until a future slice explicitly
wires them.

## Stabilization Checks

When touching this flow, verify:

- Apply Preview calls only `getAssignmentApplyPreview`.
- Confirmed Apply calls only `applyAssignment`.
- Apply is unavailable when preview blockers exist.
- Apply cannot run twice concurrently.
- Result rendering redacts token-looking values.
- No grade, report, publish, workflow generation, artifact inspection, or
  workflow run APIs are wired.
- IPC remains narrow and typed.

## Manual Smoke-Test Checklist

Manual confirmed-apply smoke tests mutate GitHub/local apply state. Use only a
safe sandbox course.

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
- [ ] Open Apply Preview.
- [ ] Confirm preview auto-loads.
- [ ] Confirm preview rows use `Would ...` wording.
- [ ] Confirm Apply is disabled when blockers exist.
- [ ] Confirm Apply requires explicit confirmation when allowed.
- [ ] Execute apply on a safe test fixture/course only.
- [ ] Confirm duplicate execution is disabled while applying.
- [ ] Confirm result summary renders.
- [ ] Confirm result rows use completed wording.
- [ ] Confirm diagnostics render safely.
- [ ] Confirm Back navigation still works.
- [ ] Confirm grade/report/publish/workflow buttons are not wired.
