# Codex Backend JSON Command Contract

## Purpose

This contract defines reusable rules for Graider backend CLI commands that
produce JSON for UI integration or automation. Use it with
[Codex Development Contract](codex-development-contract.md) and the
feature-specific command docs.

The detailed project JSON surface remains documented in
[CLI JSON Contract](cli-json-contract.md).

## JSON-First CLI Commands

- UI integrations consume `--json` output, not human-readable command text.
- Commands intended only for UI integration should be JSON-only unless existing
  conventions require otherwise.
- If a JSON-only command is run without `--json`, return a safe JSON failure
  diagnostic rather than plain text.
- Preserve `schemaVersion: 1` until a deliberate contract version change is
  requested.
- Keep command-specific top-level fields stable for UI consumers.

Current JSON-only commands include:

- `graider dashboard --json`
- `graider assignment detail <assignment.yml> --json`
- `graider assignment apply-preview <assignment.yml> --json`

`graider assignment apply <assignment.yml> --json` is not JSON-only; it is the
canonical assignment-scoped real apply mutation command for future UI work and
shares the legacy apply implementation.

## Response Shape

Recommended baseline shape:

```json
{
  "schemaVersion": 1,
  "commandName": "command name",
  "status": "success",
  "exitCode": 0,
  "diagnostics": []
}
```

General-purpose CLI JSON commands may also include `warnings`, `errors`,
`generatedFiles`, and `summary`. UI-focused commands may add stable
command-specific top-level fields such as `cards`, `course`, `assignment`,
`target`, `plan`, or `actions`.

## Status Vocabulary

Current top-level command status values are:

- `success`
- `partial_success`
- `failure`

Use `success` when the command completed its intended checks. Use
`partial_success` when useful structured data is available but some local,
GitHub, readiness, manifest, or row-level checks produced diagnostics. Use
`failure` when the command cannot build a meaningful response.

Keep operational status fields separate from top-level command status.
Preview-only row statuses should use future-tense wording such as
`would_create`, `would_update`, `would_skip`, `blocked`, and `unknown`.

## Diagnostics

Diagnostics are safe machine-readable objects with:

- `code`
- `severity`
- `message`
- optional safe `context`

Allowed severities are:

- `error`
- `warning`
- `info`

Diagnostics may include safe context such as relative paths, fields, student
IDs, GitHub usernames, repository names, assignment slugs, term codes, source
files, destination files, and artifacts.

Diagnostics must not include:

- tokens
- authorization headers
- raw `process.env`
- raw stack traces by default
- raw GitHub API responses
- artifact contents
- faculty summary bodies
- student report contents

UIs should branch on diagnostic `code`; message wording is display text and may
evolve.

## Token Behavior

- Commands that need GitHub should read tokens through project-supported token
  sources.
- Backend CLI operations currently use `GRAIDER_GITHUB_TOKEN` and `GITHUB_TOKEN`
  where supported.
- Electron main-process runners resolve `GRAIDER_GITHUB_TOKEN` first and may
  fall back to `gh auth token`.
- Never require real tokens in automated tests.
- Never log, render, snapshot, or persist token values.
- Redact resolved tokens from command snippets and errors.
- Do not include authorization headers in diagnostics.

## GitHub API Boundaries

- Use bounded API calls that directly support the command's purpose.
- Avoid listing broad organization or repository data unless explicitly needed.
- Mock GitHub behavior in tests.
- Do not make live GitHub calls in automated tests.
- Map authentication, authorization, not-found, rate-limit, network, timeout,
  and generic request failures to safe diagnostics.
- Do not expose raw GitHub response bodies in normal JSON output.

## Mutation Boundaries

- Read-only commands must not mutate local files or GitHub.
- Preview-only commands must describe what would happen and must not imply that
  changes occurred.
- Actual mutation commands must be explicit and confirmation-oriented in the UI.
- Mutation commands must preserve existing validation and safety guards.

## No-Mutation / Preview-Only Commands

For read-only and preview-only commands, verify that the implementation does
not call mutation paths such as:

- repository creation endpoints
- repository file update endpoints
- git commit, tree, branch, or ref endpoints
- workflow dispatch endpoints
- manifest writers
- plan writers, unless the command is explicitly a plan-writing command
- report publishers
- workflow generators
- apply executors

`assignment detail` is read-only inspection. `assignment apply-preview` is
preview-only planning and must use `would_*` statuses for repository rows.

## Tests

Common backend JSON command tests cover:

- top-level command shape
- missing `--json` behavior for JSON-only commands
- missing or invalid input
- `success`
- `partial_success`
- `failure`
- diagnostic safety
- token behavior and redaction
- no-mutation assertions
- mocked GitHub behavior
- bounded GitHub call behavior

Automated tests must not require live GitHub credentials or make live GitHub
calls.

## Documentation

- Update [CLI JSON Contract](cli-json-contract.md) for shared JSON conventions.
- Update feature docs such as
  [Dashboard Command](dashboard-command.md),
  [Assignment Detail Command](assignment-detail-command.md), or
  [Assignment Apply Preview Command](apply-preview-command.md) when their
  command-specific contract changes.
- Update [Error and Warning Catalog](error-warning-catalog.md) when adding or
  changing diagnostic codes.

## Acceptance Checklist

- [ ] Command emits `schemaVersion`, `commandName`, `status`, `exitCode`, and
      `diagnostics`.
- [ ] Status values use the current command vocabulary.
- [ ] Diagnostics include safe `code`, `severity`, and `message` fields.
- [ ] Tokens, authorization headers, raw environments, and raw stack traces are
      not exposed.
- [ ] GitHub calls are bounded and mocked in tests.
- [ ] JSON-only missing-flag behavior is safe.
- [ ] Read-only and preview-only commands do not mutate files or GitHub.
- [ ] Preview-only statuses use `would_*` wording where applicable.
- [ ] Tests cover success, partial success, failure, safety, and no-mutation
      behavior.
- [ ] Relevant command docs and diagnostic catalogs are updated.
