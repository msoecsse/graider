# Graider Codex Bug-Fix Prompt Template

Copy this full prompt into Codex from the root of the Graider repository.

Before running it, paste the completed faculty bug report and developer addendum into the marked sections.

---

````text
You are working in the Graider repository.

Read these documentation files before making changes:

- README.md
- docs/graider_complete_requirements.md
- docs/graider-test-plan.md
- docs/graider-traceability-matrix.md
- docs/graider-architecture.md
- docs/graider-implementation-plan.md
- docs/runtime.md
- docs/troubleshooting.md
- docs/error-warning-catalog.md
- docs/generated-files.md

Some of these files may not exist in older branches. If a listed documentation file is missing, continue with the files that are present and mention the missing documentation in your final response.

Your task is to fix exactly one bug described by the bug report and developer addendum below.

Do not implement unrelated features.

Do not perform broad refactors.

Do not change public behavior unless required to fix the bug.

Do not make live GitHub calls unless the developer addendum explicitly allows live GitHub access.

Use a regression-test-first workflow.

# Faculty Bug Report

Paste the completed faculty-facing bug report below.

```markdown
<!-- PASTE COMPLETED GRAIDER FACULTY BUG REPORT HERE -->
```

# Developer Bug-Fix Addendum

Paste the completed developer/Codex addendum below.

```markdown
<!-- PASTE COMPLETED GRAIDER DEVELOPER BUG-FIX ADDENDUM HERE -->
```

# Project Context

Graider is a CLI-first TypeScript/Node tool for managing GitHub-based course assignments.

The MVP supports:

- validating course, term, and assignment configuration
- validating rosters
- validating GitHub readiness
- planning assignment repository setup
- applying safe additive repository and permission setup
- generating manifests
- retrying transient GitHub failures
- validating grading results
- generating local faculty and student reports
- optionally publishing student reports
- dispatching grading workflows
- using a real Octokit-backed GitHub client through the `GitHubClient` interface
- using `FakeGitHubClient` for normal tests
- keeping `archive` and `remove-access` as unsupported MVP command shells

# Locked Technical Decisions

Preserve these decisions:

- TypeScript
- current Node.js LTS only
- npm
- Commander for CLI parsing
- Vitest for tests
- ESLint
- Prettier
- tsup
- ESM modules
- strict TypeScript
- GitHub API access only through `GitHubClient`
- normal tests use `FakeGitHubClient`
- real GitHub access uses Octokit through the GitHub client abstraction
- normal tests must not require GitHub credentials
- live GitHub tests must remain optional, gated, and sandbox-only
- `archive` and `remove-access` remain unsupported unless the bug is specifically about their unsupported command-shell behavior

Do not switch package managers.

Do not add unnecessary dependencies.

# Coding Standards

Follow the project coding standards:

- no `break`
- no `continue`
- no `while (true)`
- no returns from void methods
- no magic numbers; use named constants
- use strict TypeScript
- keep code small and modular
- avoid unnecessary dependencies
- do not weaken safety checks
- do not expose student data
- do not print or store secrets
- do not make live GitHub calls unless explicitly allowed
- do not implement unrelated features

If a numeric literal is needed, define a named constant or enum member.

# Safety Rules

Before changing code, classify the bug based on the faculty report and developer addendum.

If the bug involves any of these areas, use extra caution:

- repository creation
- repository permissions
- GitHub token handling
- student report publishing
- grading workflow dispatch
- manifests
- generated reports containing student data
- retry/rate-limit behavior
- archive or remove-access command shells

For normal bug fixes:

- use `FakeGitHubClient` in tests
- do not call live GitHub
- do not mutate real repositories
- do not publish real student reports
- do not add destructive behavior
- do not remove safety gates
- do not adopt unknown repositories automatically
- do not expose private student data in fixtures or output

If the developer addendum conflicts with existing safety requirements or project documentation, stop and report the conflict instead of implementing.

# Fixture Integrity Rules

All JSON fixture files must be valid JSON.

For empty arrays, use `[]`.

Before finishing, ensure fixture-integrity tests still parse every `.json` file under `tests/fixtures` with `JSON.parse`.

If intentionally malformed JSON is needed for a negative test, do not store it with a `.json` extension. Use a non-JSON extension such as:

```text
.invalid-json
```

Do not create malformed JSON fixtures.

Do not create invalid YAML fixtures unless the test explicitly requires malformed YAML. If malformed YAML is required, name it clearly and ensure the test reads it intentionally.

# Required Bug-Fix Workflow

Follow this exact workflow:

## 1. Understand the bug

Read the faculty bug report and developer addendum.

Identify:

- affected command or feature
- expected behavior
- actual behavior
- smallest reproduction path
- suspected modules
- safety constraints
- required acceptance criteria

If the report is too incomplete to safely reproduce or fix the bug, stop and explain what information is missing.

## 2. Inspect relevant code

Inspect only the relevant parts of the codebase first.

Prioritize:

- the command implementation
- related models
- related validators
- related renderers
- related fake GitHub behavior
- existing tests in the affected area
- fixtures used by those tests
- documentation only as needed to confirm intended behavior

Do not perform broad exploratory rewrites.

## 3. Reproduce the bug with a failing test first

Before implementing the fix, add or update a regression test that fails on the current behavior.

The regression test must be focused on the reported bug.

Prefer the smallest useful test:

- unit test for pure logic bugs
- command-runner test for command behavior
- CLI test for user-visible output or exit codes
- fixture-integrity test for malformed fixture bugs
- fake GitHub integration test for GitHub behavior

Do not use live GitHub for regression tests unless the developer addendum explicitly allows it.

If the bug cannot be reproduced in a test, stop and explain why.

## 4. Implement the smallest safe fix

Make the smallest code change that fixes the failing regression test.

Preserve existing behavior unless the bug fix requires changing it.

Do not implement adjacent feature requests.

Do not clean up unrelated code.

Do not change generated file schemas unless the developer addendum explicitly allows it or the bug requires it.

If schema changes are required, update tests and documentation as appropriate.

## 5. Run focused tests

Run the affected test file or focused test command first.

Example:

```bash
npm test -- tests/path/to/affected.test.ts
```

If the project test command does not support that exact syntax, use the closest existing test workflow.

## 6. Run full validation

After the focused test passes, run:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

If formatting fails, run:

```bash
npm run format
```

Then rerun all validation commands.

If `npm run audit` is part of the current project check process and is expected to run for this bug fix, run it too.

Do not run live tests unless explicitly configured and allowed by the developer addendum.

## 7. Stop after the bug fix

Stop when the regression test passes and validation commands have been run.

Do not continue into unrelated improvements.

Do not start implementing future features.

# Expected Fix Scope

Use the developer addendum to determine the allowed scope.

If no allowed scope is provided, infer the narrowest safe scope from the bug report.

The fix should normally be limited to:

- the affected module
- the affected test file
- necessary fixtures
- minimal documentation updates only if user-facing behavior changes

# Required Final Response

In your final response, report:

- bug summary
- root cause
- files changed
- regression test added or updated
- implementation summary
- validation commands run
- whether all checks passed
- whether live tests were skipped or run
- any behavior intentionally left unchanged
- any risks or follow-up work

Use this format:

```markdown
## Bug Fix Summary

## Root Cause

## Files Changed

## Tests Added or Updated

## Validation Commands Run

## Result

## Intentional Limitations / Follow-Up
```

# Stop Conditions

Stop and report instead of implementing if:

- the bug cannot be reproduced from the supplied information
- the requested fix conflicts with documented requirements
- the fix requires live GitHub access but live access was not explicitly allowed
- the fix requires destructive repository behavior
- the fix would expose student data
- the fix would require a broad redesign
- the fix would require changing generated file schemas without explicit approval
- the bug report is actually a feature request
- the addendum says to stop under the current conditions

````
