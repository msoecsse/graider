# Graider Codex Feature-Request Prompt Template

Copy this full prompt into Codex from the root of the Graider repository.

Before running it, paste the completed faculty feature request and developer feature addendum into the marked sections.

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

Your task is to implement exactly one feature request described by the faculty feature request and developer addendum below.

Do not implement unrelated features.

Do not perform broad refactors.

Do not change public behavior outside the approved feature scope.

Do not make live GitHub calls unless the developer addendum explicitly allows live GitHub access.

Use a test-first workflow.

# Faculty Feature Request

Paste the completed faculty-facing feature request below.

```markdown
<!-- PASTE COMPLETED GRAIDER FACULTY FEATURE REQUEST HERE -->
```

# Developer Feature Addendum

Paste the completed developer/Codex feature addendum below.

```markdown
<!-- PASTE COMPLETED GRAIDER DEVELOPER FEATURE ADDENDUM HERE -->
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
- `archive` and `remove-access` remain unsupported unless the feature request explicitly and safely scopes those commands

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

Before changing code, classify the feature based on the faculty request and developer addendum.

If the feature involves any of these areas, use extra caution:

- repository creation
- repository permissions
- GitHub token handling
- student report publishing
- grading workflow dispatch
- manifests
- generated reports containing student data
- retry/rate-limit behavior
- archive or remove-access command shells
- generated file schemas
- public CLI behavior

For normal feature work:

- use `FakeGitHubClient` in tests
- do not call live GitHub
- do not mutate real repositories
- do not publish real student reports
- do not add destructive behavior
- do not remove safety gates
- do not adopt unknown repositories automatically
- do not expose private student data in fixtures or output

If the developer addendum conflicts with existing safety requirements or project documentation, stop and report the conflict instead of implementing.

# Feature Triage Rules

Before implementation, decide whether this request is:

```text
small feature / medium feature / large feature / bug fix / documentation-only / unclear
```

Proceed only if the feature is small enough to implement as one focused change.

Stop and report instead of implementing if:

- the feature is too large for one focused Codex task
- the request needs design discussion first
- requirements are ambiguous
- acceptance criteria are missing or contradictory
- the feature conflicts with existing requirements
- the request is actually a bug fix and should use the bug-fix prompt
- the feature requires schema changes that are not specified
- the feature requires destructive repository behavior
- the feature requires live GitHub access but live access was not explicitly allowed

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

# Required Feature Workflow

Follow this exact workflow:

## 1. Understand the requested feature

Read the faculty feature request and developer addendum.

Identify:

- problem or need
- desired behavior
- affected command or area
- expected output
- users who benefit
- priority
- allowed scope
- out-of-scope behavior
- safety constraints
- acceptance criteria

If the request is too incomplete to safely implement, stop and explain what information is missing.

## 2. Inspect relevant code and docs

Inspect only the relevant parts of the codebase first.

Prioritize:

- the affected command implementation
- related models
- related validators
- related renderers
- related fake GitHub behavior
- related tests
- related fixtures
- documentation that defines intended behavior

Do not perform broad exploratory rewrites.

## 3. Write failing or pending tests first

Before implementing the feature, add tests that describe the requested behavior.

The tests should fail before implementation unless the behavior already exists.

Prefer the smallest useful tests:

- unit tests for pure logic
- command-runner tests for command behavior
- CLI tests for user-visible output or exit codes
- fixture-integrity tests for fixture/schema behavior
- fake GitHub integration tests for GitHub behavior

Do not use live GitHub for feature tests unless the developer addendum explicitly allows it.

If the feature cannot be expressed in tests, stop and explain why.

## 4. Implement the smallest complete feature

Make the smallest code change that satisfies the acceptance criteria.

Preserve existing behavior unless the feature explicitly changes it.

Do not implement adjacent feature requests.

Do not clean up unrelated code.

Do not change generated file schemas unless the developer addendum explicitly allows it or the feature requires it.

If schema changes are required:

- update tests
- update documentation
- preserve backwards compatibility where possible
- document migration or compatibility impact in the final response

## 5. Update documentation when needed

Update documentation if the feature affects:

- CLI behavior
- config files
- generated files
- reports
- manifests
- GitHub permissions
- errors/warnings
- privacy/safety behavior
- examples

Prefer focused documentation updates.

Do not rewrite the full README or docs unless the feature specifically requires it.

## 6. Run focused tests

Run the affected test file or focused test command first.

Example:

```bash
npm test -- tests/path/to/affected.test.ts
```

If the project test command does not support that exact syntax, use the closest existing test workflow.

## 7. Run full validation

After focused tests pass, run:

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

If `npm run audit` is part of the current project check process and is expected to run for this feature, run it too.

Do not run live tests unless explicitly configured and allowed by the developer addendum.

## 8. Stop after the feature

Stop when the feature is implemented, tests pass, and validation commands have been run.

Do not continue into unrelated improvements.

Do not start implementing another feature.

# Expected Feature Scope

Use the developer addendum to determine the allowed scope.

If no allowed scope is provided, infer the narrowest safe scope from the feature request.

The feature should normally be limited to:

- affected module or command
- related tests
- necessary fixtures
- necessary documentation updates

# Required Final Response

In your final response, report:

- feature summary
- implementation approach
- files changed
- tests added or updated
- documentation updated
- validation commands run
- whether all checks passed
- whether live tests were skipped or run
- behavior intentionally left unchanged
- risks or follow-up work

Use this format:

```markdown
## Feature Summary

## Implementation Approach

## Files Changed

## Tests Added or Updated

## Documentation Updated

## Validation Commands Run

## Result

## Intentional Limitations / Follow-Up
```

# Stop Conditions

Stop and report instead of implementing if:

- the feature request is too incomplete
- the feature conflicts with documented requirements
- the feature requires live GitHub access but live access was not explicitly allowed
- the feature requires destructive repository behavior
- the feature would expose student data
- the feature would require a broad redesign
- the feature would require changing generated file schemas without explicit approval
- the feature should be split into multiple implementation slices
- the request is actually a bug fix
- the addendum says to stop under the current conditions

````
