# Codex Bugfix Contract

## Purpose

Use this contract for small, focused Graider bug fixes. It supplements
[Codex Development Contract](codex-development-contract.md) and any relevant
domain contract. Future bugfix prompts should reference this file instead of
repeating standard safety, testing, and validation guidance.

## Default Bugfix Workflow

- Read the bug prompt, this contract, and any domain docs named in the prompt.
- Start with the files named in the prompt.
- Reproduce the bug with a focused regression test when practical.
- Implement the smallest safe fix.
- Run focused tests first, then the relevant validation commands.
- Stop when the reported bug is fixed and validation has been run.

## Scope Control

- Fix only the reported bug.
- Avoid broad refactors.
- Do not add new product features.
- Preserve existing public command/UI behavior unless the bug requires changing
  it.
- Do not update docs unless public behavior changes or the prompt asks for docs.

## Search Discipline

- Start with the files named in the prompt.
- Search outward only if needed.
- Do not load broad areas of the repository unless the initial files are
  insufficient.
- Prefer targeted grep/search over reading large unrelated files.

## Code Constraints

- Use strict TypeScript and preserve current compiler settings.
- Do not add unnecessary dependencies.
- Avoid unrelated formatting churn.
- Do not use `break`.
- Do not use `continue`.
- Do not use `while true`.
- Do not return values from `void` methods.
- Avoid magic numbers; use named constants.
- If these rules conflict with another current Graider contract, follow the more
  specific documented rule.

## Electron/UI Safety Rules

- No generic `runCommand` IPC.
- Renderer code must not spawn commands.
- Renderer code must not access `fs`, `process`, or environment variables
  directly.
- Main process owns CLI execution.
- Use argv arrays, not shell-interpolated command strings.
- Preserve `cwd` handling, especially paths with spaces.
- Do not weaken `contextIsolation` or `nodeIntegration` security.
- Use safe external-link handling.

## Backend/CLI Safety Rules

- Do not change JSON contracts unless required for the bug.
- Keep command output machine-readable where expected.
- Do not introduce live GitHub calls in tests.
- Do not mutate GitHub or local state in read-only commands.
- Preserve bundled CLI behavior in the packaged app.

## Security and Diagnostics

- Never expose tokens.
- Never log authorization headers.
- Never render raw `process.env`.
- Sanitize stderr/stdout shown in UI.
- Diagnostics should be actionable but safe.
- Debug logs may include paths, commands, argv, and exit codes, but not secrets.

## Testing Expectations

- Add focused tests for the bug.
- Prefer mocked dependencies.
- No live GitHub calls.
- No tests requiring real faculty course data.
- Test the regression and one or two nearby edge cases.
- Update stale tests only where behavior intentionally changed.

## Documentation Expectations

- Skip docs for internal-only fixes.
- Update docs only when public behavior, setup, packaging, or user-visible
  troubleshooting changes.
- Keep docs concise.

## Validation Expectations

Use actual script names if they differ on the current branch.

For UI fixes, default to:

```bash
cd ui && npm run typecheck && npm test && npm run build
```

For backend fixes, default to:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

For packaged app fixes, include packaging validation when relevant:

```bash
cd ui && npm run package
```

For docs-only fixes, use the lightest relevant docs/format check available.
Do not run expensive packaging unless the bug or prompt requires it.

## Final Response Format

Keep the final response concise:

```markdown
## Bugfix Summary

## Root Cause

## Files Changed

## Fix

## Tests

## Validation

## Result
```

For packaging or Electron runtime issues, optionally add:

```markdown
## Manual Packaged App Test
```

## Stop Conditions

Stop and report if:

- The bug cannot be fixed without a broad refactor.
- The fix would weaken security boundaries.
- The prompt's expected behavior conflicts with existing contracts.
- Required files or commands are missing or ambiguous.

## Compact Bugfix Prompt Template

```text
Read docs/codex-bugfix-contract.md.

Bug:
...

Expected:
...

Start files:
...

Constraints:
...

Tests:
...

Validation:
...
```
