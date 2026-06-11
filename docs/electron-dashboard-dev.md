# Electron Dashboard Developer Guide

This guide documents the Electron dashboard implementation completed in UI-1A through UI-1E and the read-only assignment detail page added and polished in UI-2A/UI-2C. It is operational documentation for developers changing the desktop UI before mutation workflows are added.

Assignment-detail-specific behavior, smoke tests, and UI-2/UI-3 boundaries live
in the [Electron Assignment Detail Developer Guide](electron-assignment-detail-dev.md).

## Overview

The UI is an Electron desktop dashboard with a React/TypeScript/Vite renderer. UI-1 provides a read-only multi-course dashboard for faculty:

- Stores local Graider course admin folders in an Electron user-data registry.
- Runs `graider dashboard --json` once per registered course folder.
- Combines returned course-term cards from all refreshed folders.
- Renders a GitHub Classroom-inspired dashboard with recent assignments, needs-attention badges, diagnostics, and folder-level errors.
- Provides local-only search, view filtering, and sorting over already-loaded dashboard cards.
- Opens a read-only assignment detail page from recent assignment rows.
- Runs `graider assignment detail <assignment.yml> --json` for assignment detail data.
- Derives assignment-detail readiness summaries, needs-attention callouts, and grouped diagnostics in the renderer from the assignment detail JSON.
- Provides renderer-only copy buttons for assignment path, course folder path, template repository, and grading workflow path.

The current UI is read-only. It does not mutate course repositories, GitHub repositories, workflows, reports, or student data.

## Run Locally

Start the Vite renderer dev server first:

```bash
cd ui
npm run dev
```

In a second terminal, start Electron:

```bash
cd ui
npm run dev:electron
```

During development, `npm run dev:electron` sets:

```text
VITE_DEV_SERVER_URL=http://127.0.0.1:5173
```

The Electron main process loads that URL when it is present. Vite must be running before Electron tries to load the dev server.

Useful UI checks:

```bash
cd ui
npm run typecheck
npm test
npm run build
```

Root checks remain useful before handoff:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

## Electron Build And Module Format

The UI package is `@graider/ui` under `ui/`. Its package is `"type": "module"` for the Vite/React side, and `package.json` points Electron at:

```text
dist-electron/main.js
```

The Electron main/preload TypeScript is compiled by:

```bash
tsc --project tsconfig.node.json
```

Current Electron-side setup:

- `ui/tsconfig.node.json` compiles `ui/electron/**/*.ts` to `dist-electron`.
- Electron main/preload output is CommonJS.
- `ui/scripts/write-electron-package-type.cjs` writes `dist-electron/package.json` with `{ "type": "commonjs" }`.
- The preload script is currently unbundled and imports local compiled modules.
- `BrowserWindow` uses `contextIsolation: true`.
- `BrowserWindow` uses `nodeIntegration: false`.
- `BrowserWindow` currently uses `sandbox: false` so the unbundled preload can load its compiled local modules.

Do not re-enable `sandbox` without bundling the preload or otherwise validating preload loading. Do not remove `dist-electron/package.json` while CommonJS output depends on it. Do not switch Electron module formats without retesting `npm run dev:electron` and `npm run build`.

## Security Boundary

The desktop app keeps a narrow process boundary:

- The renderer owns React components, UI state, card rendering, search/filter/sort, and visual display.
- The renderer does not import `fs`, `child_process`, `process`, `electron`, or arbitrary shell APIs.
- The main process owns native dialogs, registry storage, command execution, and GitHub token resolution.
- The preload script exposes only `window.graiderUI`.
- IPC channels represent specific operations, not generic command execution.

Current IPC operations:

```text
graider-ui:get-app-info
graider-ui:course-registry:list
graider-ui:course-registry:select-folder
graider-ui:course-registry:remove
graider-ui:dashboard:refresh-course-folder
graider-ui:dashboard:refresh-all
graider-ui:assignment-detail:get
```

There is no generic `runCommand`, `execute`, `shell`, `readFile`, or `writeFile` IPC. Preserve that boundary.

UI-2B does not add local open/reveal IPC. Local folder opening and assignment-file reveal are deferred until a narrow main-process API can validate that requested paths remain under a registered course folder and return structured success/error results. Do not add generic `openPath(anyPath)`, `shell(command)`, or command execution IPC for that purpose.

## Course Folder Registry

The course folder registry is stored under Electron `app.getPath("userData")` as:

```text
course-registry.json
```

The registry stores UI-local metadata only. It is not the source of truth for assignments, rosters, diagnostics, GitHub state, reports, workflows, or student repositories. It does not store tokens or secrets.

Representative registry shape:

```json
{
  "schemaVersion": 1,
  "courseFolders": [
    {
      "id": "course-folder-abc123",
      "path": "/Users/sean/dev/graider-sandbox/csc1120",
      "displayAlias": null,
      "lastOpenedAt": "2026-06-09T19:30:00.000Z",
      "lastRefreshedAt": "2026-06-09T19:31:00.000Z",
      "lastDashboardStatus": "success"
    }
  ]
}
```

Folder paths are normalized and deduplicated by normalized path key. On macOS and Windows, the dedupe key is case-insensitive. IDs are deterministic local hashes of the normalized path key.

Missing or corrupt registry files load as an empty registry. Removing a folder removes it from the dashboard registry only. It does not delete anything from disk.

## CLI Runner

The UI calls the installed `graider` CLI directly. It does not import Graider backend TypeScript modules.

Dashboard refresh runs:

```bash
graider dashboard --json
```

with:

```text
cwd = registered course folder path
```

The command runner uses `spawn(command, args, ...)` with argument arrays and `shell: false`. It captures stdout, stderr, exit code, and spawn errors.

Dashboard stdout is parsed in the main process. If stdout is valid dashboard JSON, the UI receives the parsed response even when the command exits nonzero. If stdout is not valid dashboard JSON, the main process returns a structured error with bounded sanitized snippets.

The dashboard and detail views do not run these mutation or report commands:

```text
apply
grade
report
publish
workflow generate
```

Assignment detail uses the read-only backend command:

```bash
graider assignment detail <assignment.yml> --json
```

That command returns local assignment, course, term, roster, grading, student
report, apply-state, action availability, and diagnostics data for one
assignment. With a token, it also performs bounded read-only checks for the
template repository, template branch, configured grading workflow file, and
`workflow_dispatch`. If no token is available, it still returns local detail
with `partial_success` and `token_required` readiness fields.

UI code should not parse `assignment.yml` directly and should not import Graider
backend modules. Assignment detail refresh must not run apply, grade, report,
publish, workflow generation, workflow run scans, artifact downloads, or student
repository scans.

## Assignment Detail Page

Detailed assignment detail guidance lives in
[Electron Assignment Detail Developer Guide](electron-assignment-detail-dev.md).

Assignment rows with a stable `assignmentFile` open the read-only assignment detail page. The renderer passes the source folder id/path and dashboard-provided assignment file path through:

```text
window.graiderUI.getAssignmentDetail(...)
```

The main process runs:

```bash
graider assignment detail <assignment.yml> --json
```

with:

```text
cwd = registered course folder path
```

Token resolution follows the same precedence used by dashboard refresh. The assignment detail page renders returned JSON only; it does not parse `assignment.yml` directly.

The page renders:

```text
assignment header
top readiness summary
needs-attention callouts
summary metadata
template readiness
grading readiness
student report publishing mode
roster and sections
grouped diagnostics
future action placeholders
```

`partial_success` responses still render available local detail and diagnostics. Token-required readiness statuses show setup guidance without hiding local assignment data.

Readiness is renderer-derived only. It maps existing assignment-detail JSON fields such as top-level `status`, diagnostics, template readiness, grading workflow readiness, student-report config, and roster summary into faculty-facing labels:

```text
Ready
Needs attention
Partially checked
Not required
Not checked
Unavailable
```

The renderer must not introduce backend contract changes for readiness. Raw statuses may appear as secondary status chips, but faculty-facing labels should be visible.

Useful copy affordances are renderer-only and use `navigator.clipboard.writeText`:

```text
Copy assignment path
Copy course folder path
Copy template repository
Copy workflow path
```

Copy feedback is temporary and not persisted. Clipboard failures should show a safe `Unable to copy.` message. Copy buttons must not write files or store copied values.

Mutation actions remain placeholders:

```text
Apply assignment
Grade submissions
Generate report
Publish student reports
Generate/update workflow
```

Those buttons must stay disabled until their dedicated slices add safe preview/confirmation flows. Disabled buttons should explain that the action is coming in a future slice or unavailable for the assignment. The detail page's refresh/validate affordance only reruns the assignment detail command.

UI-2B must not wire any of these commands:

```text
apply
grade
report
publish
workflow generate
```

## GitHub Token Resolution

`graider dashboard --json` requires GitHub access. The Electron app may be launched outside a shell, so the main process resolves a token before running Graider.

Resolution precedence:

1. `process.env.GRAIDER_GITHUB_TOKEN` if it trims to a non-empty value.
2. `gh auth token`.
3. Return `github_token_unavailable`.

User setup guidance:

```bash
gh auth login
```

Token safety rules:

- The token is passed only to child `graider` processes as `GRAIDER_GITHUB_TOKEN`.
- The token is not displayed in the UI.
- The token is not logged.
- The token is not written to `course-registry.json`.
- The token is not stored in `localStorage`.
- The token is not written to disk.
- Command output snippets redact the resolved token before returning errors to the renderer.

## Dashboard Refresh And Aggregation

Refresh behavior:

- `refreshDashboard()` lists all registered folders and refreshes each one.
- `refreshCourseFolder(id)` refreshes only that folder.
- One `graider dashboard --json` run occurs per refreshed course folder.
- Each backend dashboard response summarizes exactly one course admin repository.
- Each returned card represents one course-term.
- The renderer combines cards from all successful or partial dashboard responses.
- Folder-level command failures render as error panels.
- One folder failure does not hide cards from other folders.
- Refreshing one folder replaces only that source folder's cards in renderer state.
- Existing cards remain visible while a refresh is in progress.

The renderer normalizes dashboard cards into UI-side `CombinedDashboardCard` records that retain source folder id/path and the original normalized card data.

## Search, View Filters, And Sorting

Search, filters, and sort are renderer-local. They do not rerun Graider commands.

Search is case-insensitive, trims whitespace, and matches:

```text
card displayName
course slug/title
term slug/title
recent assignment slug/title
source folder path
```

View filters:

```text
Active
Needs attention
All
```

Active hides course-term cards whose status is `inactive` or `archived`. Missing status is included by default. Needs attention shows cards where the card or any recent assignment needs attention. Folder error panels remain visible because they are dashboard-level attention items.

Sort options:

```text
Newest first
Course
Term
Needs attention
Recently refreshed
```

Newest first uses the most recent assignment `dueAt`, then source folder refresh time, then display title. Other sorts use simple deterministic lexicographic or count-based rules.

Assignment rows with an assignment file path open the read-only detail page. Search/filter/sort remain local-only and do not run detail commands. Detail loading happens only after a user opens an assignment row or refreshes the detail page.

## Diagnostics And Errors

User-visible error states include:

```text
GitHub token required
Graider CLI not found
invalid dashboard JSON
invalid assignment detail JSON
folder not found
folder refresh failed
partial folder failure
assignment detail load failure
```

Diagnostics display safe code/severity/message fields and safe path context when supplied by the CLI. Diagnostics and command errors must not include tokens, authorization headers, raw environments, or raw stack traces by default.

Folder-level command errors are shown as panels. Card and assignment diagnostics are shown in keyboard-accessible `<details>` sections.

## Manual Smoke Test Checklist

Before handing off dashboard UI changes:

- Start Vite with `npm run dev`.
- Start Electron with `npm run dev:electron`.
- Confirm the Electron window opens to `Your Courses`.
- Add a Graider course admin folder with `Open course folder`.
- Confirm the folder appears in registered folders.
- Close and reopen the app and confirm the folder persists.
- Refresh the dashboard.
- Confirm course-term cards render.
- Confirm recent assignments render on cards.
- Confirm search filters by course, term, assignment, and folder path.
- Confirm the Needs attention filter shows attention cards or folder errors.
- Confirm All shows inactive/archived cards if loaded.
- Confirm sort options reorder cards.
- Click a recent assignment row and confirm the assignment detail page opens.
- Confirm summary, template, grading, roster, diagnostics, and action panels render.
- Confirm Refresh detail reruns detail loading without mutating anything.
- Confirm Back to dashboard preserves loaded dashboard cards.
- Confirm action buttons for Apply, Grade, Report, Publish, and Generate workflow are disabled/placeholders.
- Confirm folder-level failures do not hide successful cards.
- Remove a folder from the dashboard.
- Confirm the folder is not deleted from disk.
- Launch without `GRAIDER_GITHUB_TOKEN` and confirm `gh auth token` fallback works when GitHub CLI is authenticated.
- Confirm no token is rendered or logged.

## Current Non-Goals

The current read-only UI intentionally does not implement:

```text
apply workflow
grade dispatch
report generation
student report publishing
workflow generation
student repo status scans
artifact parsing
workflow run inspection
GitHub mutations
packaging/installers
persistent token storage
```

## Future Slices

Likely future work:

```text
UI-2B: Assignment Detail Follow-Up / Validation Diagnostics
UI-3: Validation Diagnostics View
UI-4: Apply Preview and Confirm
UI-5: Grade Dispatch View
UI-6: Report Summary View
UI-7: Student Report Publishing View
UI-8: Workflow Generation View
UI-9: Packaging and Faculty Install Flow
```
