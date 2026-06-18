# Electron Release Readiness Guide

Reusable Electron safety rules live in the
[Codex Electron UI Contract](codex-electron-ui-contract.md). Page-specific
workflow details live in:

- [Electron Assignment Detail Developer Guide](electron-assignment-detail-dev.md)
- [Electron Apply Flow Developer Guide](electron-apply-flow-dev.md)
- [Electron Grade Dispatch Developer Guide](electron-grade-dispatch-dev.md)
- [Electron Grade Status Developer Guide](electron-grade-status-dev.md)
- [Electron Faculty Report Developer Guide](electron-faculty-report-dev.md)
- [Electron Packaging Guide](electron-packaging.md)

This guide is the UI-7A runbook for validating the current faculty workflow
without adding student report publishing or other deferred features.

## Supported Faculty Workflow

The current desktop app supports this faculty workflow:

```text
Dashboard
-> Assignment Detail
-> Apply Preview / Confirm Apply
-> Grade Dispatch Preview / Confirm Grade Dispatch
-> Grade Status
-> Faculty Report
```

Confirmed apply and confirmed grade dispatch are mutating flows. Run live smoke
tests only against a safe sandbox course.

## Developer Startup

Development mode uses the local workspace or PATH `graider` command. Install
and build the root CLI first when the local package binary is not already
available on `PATH`:

```bash
npm install
npm run build
npm link
```

Start the UI in two terminals:

```bash
cd ui
npm install
npm run dev
```

```bash
cd ui
npm run dev:electron
```

`npm run dev` starts Vite at `127.0.0.1`. `npm run dev:electron` compiles the
Electron main/preload code, writes the Electron package type marker, and starts
Electron with `VITE_DEV_SERVER_URL=http://127.0.0.1:5173`.

## Packaged App Build

For a standalone local app build:

```bash
cd ui
npm install
npm run package
```

The macOS unpacked app is written under `ui/release/`, usually:

```text
ui/release/mac-arm64/Graider.app
```

The packaged app bundles the Graider CLI and should not require external
`graider` on `PATH`. See [Electron Packaging Guide](electron-packaging.md) for
unsigned app notes, bundled CLI details, and packaged smoke-test steps.

## Required Local Tools

- Node.js and npm. Root Graider currently targets Node `>=24 <25`.
- The `graider` CLI on `PATH` only for development-mode UI testing, normally
  through `npm run build` and `npm link`.
- The packaged app uses its bundled CLI instead of PATH `graider`.
- GitHub CLI (`gh`) for the recommended `gh auth login` setup.
- `GRAIDER_GITHUB_TOKEN` only when launching the app with an explicit token.
- Git, because Graider operates from course-admin repositories.

Graider checks GitHub authentication on startup. The Electron token resolver
checks `GRAIDER_GITHUB_TOKEN` first. If it is not set, the main process runs
`gh auth token`. If `gh` is not available through the inherited PATH, the
packaged app checks common GitHub CLI install locations such as
`/opt/homebrew/bin/gh`, `/usr/local/bin/gh`, and `/usr/bin/gh`. Resolved tokens
are passed only to child Graider processes as `GRAIDER_GITHUB_TOKEN`; the
renderer never receives or stores token values.

For packaged macOS app testing, prefer `gh auth login`. Apps opened by
double-click may not see tokens exported from shell startup files such as
`.zshrc` or `.zprofile`.
If a private GitHub link opens as 404 in the browser, sign into GitHub in the
browser with the same account.

## End-to-End Smoke Test Checklist

Use only a safe sandbox course. Confirmed apply may create or update GitHub
repositories and local apply state. Confirmed grade dispatch starts GitHub
Actions workflow runs.

- [ ] Start Vite with `cd ui` and `npm run dev`.
- [ ] Start Electron with `cd ui` and `npm run dev:electron`.
- [ ] Register or open a sandbox course folder.
- [ ] Confirm the dashboard loads course and assignment cards.
- [ ] Restart Electron and confirm the registered course folder auto-loads
      without pressing Refresh.
- [ ] Open Assignment Detail from a dashboard assignment row.
- [ ] Confirm Assignment Detail loads with existing header actions and Summary,
      Template, Grading, Student reports, Roster / Sections, Grade Status
      Summary, Diagnostics, and Actions panels.
- [ ] Confirm Grade Status Summary appears before Diagnostics.
- [ ] Confirm Grade Status Summary rows show student identity, section,
      repository, concise status, readable last update, and available run links.
- [ ] Confirm Grade Status Summary omits the workflow column and raw ISO
      timestamps.
- [ ] Open Apply Preview.
- [ ] Confirm Apply Preview auto-loads and uses `Would ...` row wording.
- [ ] Confirm apply remains disabled when blockers exist.
- [ ] Confirm allowed apply requires explicit confirmation.
- [ ] Execute confirmed apply only on the sandbox course.
- [ ] Confirm Apply Result Summary renders and duplicate apply is disabled
      while running.
- [ ] Open Grade Dispatch Preview.
- [ ] Confirm Grade Dispatch Preview auto-loads and uses `Would dispatch`
      wording.
- [ ] Confirm dispatch remains disabled when blockers exist.
- [ ] Confirm allowed dispatch requires explicit confirmation.
- [ ] Execute confirmed grade dispatch only on the sandbox course.
- [ ] Confirm Grade Dispatch Result Summary renders and duplicate dispatch is
      disabled while running.
- [ ] Open Grade Status.
- [ ] Confirm the full status snapshot loads.
- [ ] Confirm manual `Refresh status` keeps prior rows visible while refreshing.
- [ ] Confirm queued or in-progress rows auto-refresh while the page remains
      open.
- [ ] Confirm external GitHub run links open as normal browser links and do not
      expose tokens.
- [ ] Open Faculty Report from Grade Status.
- [ ] Confirm Faculty Report auto-loads.
- [ ] Confirm missing-results JSON renders as a normal report state.
- [ ] Confirm manual `Refresh report` keeps prior report data visible while
      refreshing.
- [ ] Confirm Back navigation works from each workflow page.
- [ ] Confirm diagnostics never show tokens, authorization headers,
      `process.env`, or raw stack traces.
- [ ] Confirm student publishing and workflow generation actions are absent or
      disabled/deferred.

## Packaged App Smoke Test Checklist

Use only a safe sandbox course. Confirmed apply and confirmed grade dispatch can
mutate GitHub/course state or start GitHub Actions workflows.

- [ ] Build/package the app with `cd ui && npm run package`.
- [ ] Launch the packaged app from `ui/release/`.
- [ ] Register or open a course folder.
- [ ] Register or open a course folder whose path contains a space, such as
      `/Users/sean/Box Sync/.../csc1120`.
- [ ] Confirm Dashboard loads.
- [ ] Quit and relaunch the packaged app, then confirm registered folders
      auto-load dashboard cards without pressing Refresh.
- [ ] Confirm Assignment Detail loads.
- [ ] Confirm Assignment Detail keeps its existing structure, shows Grade
      Status Summary before Diagnostics, omits the workflow column from that
      summary, formats timestamps readably, and preserves workflow actions.
- [ ] Confirm Apply Preview loads.
- [ ] Confirm Grade Dispatch Preview loads.
- [ ] Confirm Grade Status loads.
- [ ] Confirm Faculty Report loads.
- [ ] Temporarily hide external `graider` from `PATH` and confirm the packaged
      app still loads dashboard data through the bundled CLI.
- [ ] Confirm a missing/broken bundled CLI resource shows a clear bundled-CLI
      error instead of a blank page or raw stack trace.
- [ ] Confirm startup shows GitHub authentication status and missing auth gives
      `gh auth login` guidance.
- [ ] Confirm external links open in the browser.
- [ ] Restart the packaged app and confirm the course folder registry persists.

## Error-State Checklist

Verify these states with mocked tests or a sandbox setup:

- [ ] Missing development CLI returns a safe `graider_cli_not_found` style
      message.
- [ ] Missing packaged bundled CLI returns a safe `bundled_graider_cli_not_found`
      style message.
- [ ] Missing GitHub authentication shows `gh auth login` guidance and does not
      render token-like values.
- [ ] Missing GitHub CLI shows install-and-login guidance.
- [ ] `gh auth token` unavailable returns safe auth guidance.
- [ ] Invalid course folder fails safely at dashboard load.
- [ ] Valid course folder paths with spaces run dashboard with the selected
      folder as `cwd`.
- [ ] Invalid assignment file fails safely on assignment-scoped pages.
- [ ] Backend command exits nonzero with valid JSON and the UI renders the JSON
      diagnostics.
- [ ] Backend command returns invalid JSON and the UI renders a safe invalid JSON
      error.
- [ ] Backend command returns `partial_success` and available data remains
      visible.
- [ ] Backend command returns `failure` with diagnostics and the UI shows those
      diagnostics safely.
- [ ] Registered course folders auto-refresh on app launch and manual Refresh
      remains available.
- [ ] Startup auto-refresh failures show folder diagnostics and do not block
      other registered folders.
- [ ] Empty dashboard shows an empty state instead of a blank screen.
- [ ] Empty target student list shows a no-targets/diagnostic state.
- [ ] Missing student repository rows render as blocked, missing, unknown, or
      needs-attention states according to the command JSON.
- [ ] GitHub network, authorization, or rate-limit diagnostics render with safe
      messages and safe context only.

## Page-by-Page Expectations

### Dashboard

- Command: `graider dashboard --json`
- Boundary: read-only
- Success display: course cards, assignment summaries, dashboard counts, and
  needs-attention indicators
- Failure display: safe command error or JSON diagnostics
- Navigation/refresh: register/open folders, refresh one folder, refresh all,
  and open Assignment Detail when `assignmentFile` is available

### Assignment Detail

- Command: `graider assignment detail <assignment.yml> --json`
- Boundary: read-only
- Success display: assignment/course/term context, readiness, roster, template,
  grading, compact Grade Status Summary before diagnostics, and on-demand
  diagnostics
- Failure display: safe command error or diagnostics while preserving navigation
- Navigation/refresh: `Refresh detail`, Back to dashboard, Apply Preview, Grade
  Dispatch Preview, and Grade Status

### Apply Preview

- Command: `graider assignment apply-preview <assignment.yml> --json`
- Boundary: preview-only and non-mutating
- Success display: target context, plan summary, `Would create`, `Would update`,
  `Would skip`, `Blocked`, and `Unknown` repository rows
- Failure display: safe command error or diagnostics
- Navigation/refresh: Back to assignment detail and refresh preview. Confirmed
  apply is disabled when blockers or unsafe preview states exist.

### Confirm Apply Result

- Command: `graider assignment apply <assignment.yml> --json --yes`
- Boundary: mutating after explicit confirmation
- Success display: completed apply summary and rows using `Created`, `Updated`,
  `Skipped`, and `Failed`
- Failure display: partial/failure JSON and diagnostics
- Navigation/refresh: Back to assignment detail, Refresh assignment detail when
  available, and Back to dashboard when available

### Grade Dispatch Preview

- Command: `graider assignment grade-preview <assignment.yml> --json`
- Boundary: preview-only and non-mutating
- Success display: grading configuration, target counts, workflow readiness,
  and rows using `Would dispatch`, `Would skip`, `Blocked`, `Unknown`, or
  `Token required`
- Failure display: safe command error or diagnostics
- Navigation/refresh: Back to assignment detail and refresh preview. Confirmed
  dispatch is disabled when blockers or unsafe preview states exist.

### Confirm Grade Dispatch Result

- Command: `graider assignment grade <assignment.yml> --json --all`
- Boundary: mutating after explicit confirmation because it starts GitHub
  Actions workflow runs
- Success display: dispatch summary and rows using `Dispatched`, `Skipped`,
  `Failed`, or `Blocked`
- Failure display: partial/failure JSON and diagnostics
- Navigation/refresh: Back to assignment detail, Back to dashboard when
  available, and View grading status

### Grade Status

- Initial/manual command:
  `graider assignment grade-status <assignment.yml> --json`
- Incremental commands:
  `graider assignment grade-status <assignment.yml> --student <student-id> --json`
  or `graider assignment grade-status <assignment.yml> --students <student-id,student-id> --json`
- Boundary: read-only status monitoring
- Success display: summary counts, ready-for-report guidance, per-student run
  rows, run links, diagnostics, and View faculty report
- Failure display: safe command error or diagnostics while keeping prior rows
  visible during refresh
- Navigation/refresh: Back to assignment detail, manual full refresh, page-local
  auto-refresh for non-terminal rows, and Faculty Report

### Faculty Report

- Command: `graider report <assignment.yml> --json`
- Boundary: read-only from the UI perspective; no student publishing flag is
  passed
- Success display: report status, summary totals, generated file paths,
  diagnostics, and per-student rows when present in JSON
- Missing-data display: missing results, missing reports, incomplete workflow
  data, or `partial_success` are normal valid JSON states
- Navigation/refresh: Back to Grade Status, Back to Assignment Detail, and
  Refresh report while preserving prior data

## Safety Boundaries

- Renderer code never runs shell commands directly.
- Renderer code does not import `fs`, `child_process`, backend modules, or read
  `process.env`.
- Preload exposes narrow typed methods on `window.graiderUI`.
- There is no generic `runCommand`, generic shell, generic file, or arbitrary
  open-path IPC.
- Main process owns native dialogs, course registry access, CLI execution,
  token resolution, and stdout JSON parsing.
- Course-scoped commands run from the registered course folder `cwd`.
- Commands are invoked with argv arrays and `shell: false`.
- Resolved tokens are passed only to child processes.
- Renderer output and diagnostics must not include tokens, authorization
  headers, raw `process.env`, or raw stack traces by default.
- Confirmed apply and confirmed grade dispatch require explicit user
  confirmation and guard against duplicate concurrent execution.

## Deferred Features

These are intentionally outside the current release-readiness pass:

- student report publishing
- student report publish preview
- student report publish confirmation
- student-facing report preview
- workflow generation UI
- packaged installer/distribution
- auto-update
- background/app-wide grade monitoring
- advanced report export, unless already implemented

## Validation Commands

For UI release-readiness changes, run:

```bash
cd ui
npm run typecheck
npm test
npm run build
```

When practical after code changes, also run root checks:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Do not run live GitHub tests as part of automated validation.
