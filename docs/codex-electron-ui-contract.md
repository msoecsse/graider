# Codex Electron UI Contract

## Purpose

This contract defines reusable rules for Graider Electron UI work. Use it with
[Codex Development Contract](codex-development-contract.md) and the relevant
Electron developer guide.

Current detailed guides:

- [Electron Dashboard Developer Guide](electron-dashboard-dev.md)
- [Electron Assignment Detail Developer Guide](electron-assignment-detail-dev.md)
- [Electron Apply Flow Developer Guide](electron-apply-flow-dev.md)
- [Electron Grade Dispatch Developer Guide](electron-grade-dispatch-dev.md)

## Process Architecture

- Renderer owns React UI, UI state, navigation, normalization for display, and
  renderer-local interactions.
- Main process owns native dialogs, registry storage, command execution, token
  resolution, and future `shell.openPath` / `shell.showItemInFolder` calls.
- Preload exposes narrow typed APIs through `window.graiderUI`.
- The UI calls the installed `graider` CLI. It does not import backend
  TypeScript modules.

## Renderer Rules

Renderer code must not:

- import or use `fs`
- import or use `child_process`
- read `process.env`
- access Electron shell APIs directly
- import backend modules directly
- parse `assignment.yml` directly when a CLI JSON contract exists
- execute Graider CLI commands directly

Renderer code may:

- render structured JSON returned by main-process APIs
- perform local search, filter, sorting, and display normalization
- use browser clipboard APIs for safe copy-only affordances
- show safe diagnostics and command errors returned by the main process

## Main Process Rules

- Own all filesystem-backed registry access.
- Own all Graider command execution.
- Own token resolution.
- Parse stdout JSON before returning structured results to the renderer.
- Return bounded safe errors for invalid JSON, spawn failures, missing CLI, and
  nonzero command failures.
- Redact resolved tokens from stdout and stderr snippets.
- Validate request shapes before running commands.

## Preload / IPC Rules

- Expose only narrow typed APIs through `window.graiderUI`.
- Do not add generic `runCommand`, `execute`, `spawn`, `shell`, `readFile`, or
  `writeFile` IPC.
- Do not add generic shell IPC.
- Do not add arbitrary open-path IPC.
- IPC channels should represent specific user workflows.
- Arguments must be typed.
- Paths must be validated in the main process before use.

Current IPC channels are specific to app info, course folder registry,
dashboard refresh, assignment detail, assignment apply preview, and confirmed
assignment apply, grade dispatch preview, and confirmed grade dispatch.

## Command Runner Rules

- Run Graider CLI commands with argv arrays.
- Do not shell-interpolate command strings.
- Use `shell: false` for spawned commands.
- Use the registered course folder as `cwd` for course-scoped commands.
- Reuse the token resolver rather than adding ad hoc token lookup.
- Pass resolved tokens only through the child process environment.
- Parse stdout JSON in the main process.
- Return structured errors to the renderer.
- Keep stdout and stderr snippets bounded and redacted.

## Token Handling

- Resolve `GRAIDER_GITHUB_TOKEN` from the main-process environment first.
- Fall back to `gh auth token` only through the existing token resolver pattern.
- Pass the token only to child Graider processes as `GRAIDER_GITHUB_TOKEN`.
- Do not display tokens.
- Do not log tokens.
- Do not store tokens in the course registry.
- Do not store tokens in `localStorage`.
- Do not write tokens to disk.

## Local File / Folder Open Rules

- Copying text with browser clipboard APIs is safe when it does not persist
  copied values.
- Opening or revealing local files/folders must use narrow IPC.
- The main process must validate that requested paths are under a registered
  course folder.
- The renderer must not open arbitrary paths.
- Missing paths must return safe structured errors.
- Do not expose generic shell execution or generic open-path IPC.

## Read-Only vs Preview vs Mutation Boundaries

Current UI phase boundaries:

```text
UI-2  = read-only inspection
UI-3A = preview-only planning, still non-mutating
UI-3B+ = confirmed mutation only when explicitly requested
```

Read-only UI work may inspect and render data but must not mutate files,
GitHub, workflows, reports, or student data.

Preview-only UI work may show planned operations with `would_*` language but
must not run mutation commands or imply changes occurred.

Mutation UI work must be explicitly requested, confirmation-oriented, and
implemented through narrow main-process APIs.

## UI Testing

- Mock `window.graiderUI` in renderer tests.
- Do not require live Electron for renderer tests.
- Do not require live `graider` or `gh` for automated UI tests.
- Test navigation, loading, refresh, partial-success, and error states.
- Test that disabled mutation actions do not call mutation APIs.
- Test renderer security boundaries, including forbidden Node imports and
  absence of generic IPC.
- Test token redaction in main-process command-runner errors when relevant.

## Accessibility

- Use semantic headings and landmarks where appropriate.
- Provide accessible labels for controls.
- Preserve visible focus states.
- Do not communicate status by color alone.
- Show diagnostic severity as visible text.
- Include explanations for disabled actions.
- Keep keyboard-accessible diagnostics and error panels.

## Responsive Layout

- Keep dashboard, detail, and preview layouts usable at narrow and wide widths.
- Prevent control text and status labels from overflowing their containers.
- Preserve existing page state during refreshes when the current UI pattern
  expects it.
- Prefer renderer-local search, sorting, and filtering over command reruns unless
  the feature docs specify otherwise.

## Documentation

- Update this contract when a reusable Electron safety rule changes.
- Update the relevant developer guide when a concrete UI flow changes.
- Update backend JSON docs when UI work changes or depends on a CLI JSON
  contract.
- Cross-link instead of duplicating long safety sections.

## Acceptance Checklist

- [ ] Renderer stays React/UI-only.
- [ ] Main process owns command execution, token resolution, native dialogs, and
      shell operations.
- [ ] Preload exposes narrow typed APIs only.
- [ ] No generic command, shell, file, or open-path IPC is added.
- [ ] Course-scoped commands run with registered course folder `cwd`.
- [ ] Graider commands use argv arrays and `shell: false`.
- [ ] Tokens are not displayed, logged, stored, or persisted.
- [ ] Local open/reveal paths are main-process validated.
- [ ] Read-only and preview-only UI flows do not call mutation APIs.
- [ ] Renderer tests mock `window.graiderUI`.
- [ ] Accessibility and responsive behavior are covered where the UI changes.
- [ ] Relevant Electron and command docs are updated.
