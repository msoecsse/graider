# Codex Development Contract

## Purpose

This contract defines the shared baseline for Codex work in Graider. Slice
prompts may add stricter or more specific rules, but they should not repeat
these global standards.

Use this contract for all backend, UI, test, and documentation changes.

## Required Workflow

- Read the slice prompt, this contract, and any referenced domain contract
  before editing.
- Inspect the existing implementation and docs enough to preserve current
  behavior and terminology.
- Keep changes scoped to the requested slice.
- Prefer existing helpers, patterns, validators, and test style.
- Do not change product behavior unless the prompt explicitly requests it.
- Do not weaken existing validation, diagnostics, safety guards, or tests.
- Update docs when changing a documented contract, command, UI flow, or safety
  boundary.

## Coding Standards

- Use strict TypeScript and preserve current compiler settings.
- Prefer small modular functions with explicit, typed data boundaries.
- Do not add unnecessary dependencies.
- Avoid magic numbers; use named constants.
- Do not use `break`.
- Do not use `continue`.
- Do not use `while true`.
- Do not return values from `void` methods.
- Keep command and UI contracts machine-readable where consumers depend on
  them.
- Preserve existing lint, formatting, and test conventions.

## Scope Discipline

- Do not perform unrelated refactors.
- Do not mix cleanup with feature work unless the cleanup is required for the
  slice.
- Do not introduce new commands, UI flows, scripts, storage, or dependencies
  unless the prompt explicitly asks for them.
- Do not mutate files, GitHub repositories, workflows, reports, or student data
  from read-only or preview-only work.
- Treat product behavior that affects data mutation as requiring explicit
  instructions.

## Security and Secret Handling

- Do not expose secrets in JSON output, UI output, logs, diagnostics, tests, or
  snapshots.
- Do not log, render, store, or persist GitHub tokens.
- Do not include authorization headers in diagnostics.
- Do not include raw `process.env` in diagnostics or UI output.
- Do not include raw stack traces in normal user-facing JSON or UI output.
- Never require real GitHub tokens in automated tests.
- Mock GitHub clients in automated tests.
- Do not make live GitHub calls in automated tests.

## Testing Standards

- Add or update focused tests when behavior changes.
- Keep tests deterministic and local by default.
- Mock GitHub clients and command runners instead of calling live services.
- Use fake tokens or redaction assertions when testing token behavior.
- Do not run live GitHub tests unless the user explicitly requests that
  optional workflow and the required sandbox setup is present.
- For docs-only changes, do not add tests unless a documentation safeguard is
  already part of the project pattern and is relevant.

### Efficient validation and output

- Identify changed production files and affected dependencies. During
  implementation, run new or modified tests and relevant existing regression
  tests.
- Run affected integration tests when behavior crosses service, IPC, Git,
  authorization, or persistence boundaries.
- Run typechecking, test hygiene, and appropriate lint/format checks. Build
  affected components when needed.
- Do not routinely run complete root and UI suites locally, and do not repeat
  successful unrelated tests. Make one final relevant local validation pass
  before committing.
- Existing CI remains responsible for comprehensive root/UI regression testing.
  Required CI success at the exact commit is acceptable completion evidence for
  comprehensive regression validation. Preserve Windows x64 and macOS arm64
  compatibility verification and all security, migration, and performance
  coverage.
- Investigate individual CI failures using targeted tests. Do not automatically
  repeat entire suites following unrelated changes.
- Broader local validation remains necessary for migrations, authorization,
  security-sensitive Git operations, and changes without equivalent CI
  coverage. Honor explicit task requirements for additional local validation.
- Avoid unnecessary builds, packaging, and dependency installation.
- Capture verbose test output in temporary log files where practical. Show
  concise summaries and relevant failure excerpts instead of thousands of
  passing lines.
- Preserve complete failure information for diagnosis. Never hide failures,
  warnings, or skipped tests.
- Diagnose environmental failures with focused checks before retrying expensive
  suites.
- Keep final reports concise while recording every required validation command
  and its result.

These are efficiency rules, not permission to weaken testing requirements.

### Test hygiene

Run `npm run test:hygiene` from the repository root to check root and UI test
files (`*.test.*` and `*.spec.*`, including TypeScript and TSX). The guard also
runs before root/UI `npm test` and `npm run test:watch`, as part of `npm run check`
and release validation, and in normal GitHub Actions CI.

The TypeScript syntax and binding check rejects Vitest `.skip`, `.only`, `.todo`,
disabled/focused aliases (`xit`, `xtest`, `xdescribe`, `fit`, `ftest`, `fdescribe`),
literal `skipIf(true)` / `runIf(false)`, and inline options with `skip`, `only`,
or `todo` set to `true`. It covers global declarations,
named/renamed imports, namespace imports, local aliases, computed string
properties, and chained/parameterized declarations. Comments, string contents,
and methods on unrelated bindings are not declarations. Existing dynamic
platform conditions remain supported; this static check does not evaluate
runtime conditions or replace reviewing suite summaries for zero skips.

If a test cannot pass, fix the implementation or fixture before committing.
If that cannot be completed within scope, record/reuse a blocker issue and stop
the affected work under the workflow contract. Do not skip, focus, mark todo,
delete, or weaken the test to obtain a green run. There is no guard allowlist.

## Validation Commands

For backend or shared code changes, select checks based on changed files and
their affected dependencies. Do not treat this full sequence as a routine local
requirement:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

For UI code changes, also run:

```bash
cd ui
npm run typecheck
npm test
npm run build
```

For documentation-only changes, run the lightest relevant check available,
usually:

```bash
npm run format:check
```

If a required command cannot be run, report the command, the reason, and any
remaining risk.

## Documentation Updates

- Keep reusable rules in contract docs instead of repeating boilerplate in every
  slice doc.
- Keep feature-specific behavior in feature docs such as command contracts or
  Electron developer guides.
- Cross-link docs instead of duplicating large sections.
- When changing JSON contracts, update the backend JSON command docs and any
  feature-specific command docs.
- When changing Electron boundaries, update the Electron UI contract and the
  relevant developer guide.

## Final Response Format

Slice prompts may define their own final response format. If no format is
specified, use:

```markdown
## Summary

## Files Changed

## Tests Added or Updated

## Documentation

## Validation Commands Run

## Result

## Deferred
```

In validation reporting, include each command run and whether it passed, failed,
or was skipped with a reason.

## Stop Conditions

Stop and report instead of editing when:

- The requested implementation would require a broad redesign.
- The requested change would violate an established safety boundary.
- Product behavior is ambiguous in a way that affects data mutation.
- Existing docs contradict the implementation in a way that needs product
  clarification.
- The repository already has equivalent contract docs that should be extended
  instead of creating parallel guidance.

## Permanent migration regression validation

Changes affecting schemas, migration, course management, Git transactions,
authorization or reconciliation must run `npm run test:migration` from the root,
in addition to scope-required root/UI validation. Both native CI jobs (macOS arm64
and Windows x64) must pass before merging or releasing affected changes. This
suite remains required after Phase 9. See
[coverage and failure diagnosis](migration-regression.md).
