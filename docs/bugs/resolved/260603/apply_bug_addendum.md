# Graider Developer Bug-Fix Addendum

Fill this out after reviewing the faculty bug report. This addendum gives Codex the engineering context needed to create a focused regression test and safe fix.

---

## A. Bug Classification

**Severity:**

```text
blocker
```

**Bug type:**

```text
apply / manifest / GitHub client / live GitHub integration
```

**Affected command:**

```text
apply
```

---

## B. Suspected Area

Suspected files or modules:

```text
src/cli/commands/apply.command.ts
src/execution/apply-executor.ts
src/execution/mutation-guard.ts
src/planning/plan-builder.ts
src/manifest/manifest-updater.ts
src/manifest/manifest-renderer.ts
src/github/github-client-factory.ts
src/github/octokit-github-client.ts
src/github/github-client.ts
src/github/fake-github-client.ts
src/github/github-errors.ts
```

Relevant existing tests:

```text
tests/cli/apply.test.ts
tests/recovery/apply-recovery.test.ts
tests/unit/execution/
tests/unit/github/octokit-github-client.test.ts
tests/github/fake-github-client.test.ts
tests/live/octokit-github-client.live.test.ts
```

---

## C. Safety Constraints

Check all that apply:

```text
[ ] Must not make live GitHub calls
[x] Must use FakeGitHubClient in normal tests
[ ] Must not mutate repositories
[x] Must not publish student reports
[x] Must not expose student data
[x] Must not print or store secrets
[x] Must not change generated file schemas unless required
[x] Must preserve backward compatibility
[x] Must keep archive/remove-access unsupported
```

Additional safety notes:

```text
Normal regression tests should use FakeGitHubClient and must not require a GitHub token.

The fix must preserve safe behavior: Graider must not write a manifest repository record indicating successful creation unless the GitHubClient.createRepositoryFromTemplate call actually succeeds and returns a repository.

If repository creation fails, Graider must not continue workflow verification for that repository as though it exists.

If live verification is added, it must be optional, explicitly gated, and sandbox-only.
```

---

## D. Expected Regression Test

Describe the test that should fail before the fix and pass after the fix.

```text
Add a regression test where createRepositoryFromTemplate does not actually create or return a valid repository, or where the GitHub client fails during repository creation.

Before the fix, apply incorrectly writes a manifest record for the expected student repository and proceeds to grading workflow verification, producing grading_workflow_missing or workflow_dispatch_unsupported errors instead of a repository-creation failure.

After the fix, apply must not write a created repository identity to the manifest unless repository creation succeeds. It should return a structured repository creation error and should not run grading workflow verification for a repository that was not created or found.
```

Suggested test file or area:

```text
tests/cli/apply.test.ts
tests/recovery/apply-recovery.test.ts
tests/unit/execution/apply-executor.test.ts
tests/unit/github/octokit-github-client.test.ts
```

Required fixture changes:

```text
Use an existing small apply fixture if possible.

If a new fixture is needed, add a minimal live-like apply fixture with one active student, grading enabled, and a template repository path. Do not require live GitHub access. Use FakeGitHubClient behavior to simulate repository creation failure or a create call that does not persist repository state.
```

---

## E. Allowed Scope

The fix may change:

```text
apply command orchestration
apply executor
manifest update timing
repository creation result handling
operation failure handling
GitHub client factory wiring
OctokitGitHubClient repository creation implementation
FakeGitHubClient failure simulation if needed for tests
diagnostics related to repository creation failure
tests for apply and GitHub client behavior
```

The fix must not change:

```text
plan file schema
manifest schema unless absolutely required
report generation behavior
student report publishing behavior
grade command behavior
archive/remove-access unsupported behavior
GitHub organization/repository naming rules
grading workflow design
LMS integration
hidden grading behavior
```

---

## F. Acceptance Criteria

The bug is fixed when:

```text
- [x] A regression test reproduces the bug.
- [ ] The smallest reasonable fix is implemented.
- [ ] Existing behavior is preserved.
- [ ] JSON/YAML fixtures remain valid.
- [ ] npm run typecheck passes.
- [ ] npm run lint passes.
- [ ] npm run format:check passes.
- [ ] npm test passes.
- [ ] npm run build passes.
```

Additional criteria:

```text
- [ ] apply must call the real GitHubClient.createRepositoryFromTemplate when using the production CLI.
- [ ] apply must not record a repository as created in the manifest unless GitHub repository creation succeeds.
- [ ] apply must not run workflow verification for a repository that was not created or found.
- [ ] if repository creation fails, apply must return a clear structured diagnostic related to repository creation.
- [ ] the manifest must not contain a successful repository identity for a repository that does not exist.
- [ ] existing FakeGitHubClient apply tests must continue to pass.
- [ ] live GitHub tests, if added or updated, must remain optional and sandbox-gated.
```

---

## G. Notes for Codex

Implementation hints or context:

```text
The observed live behavior is:

apply: terms/27s1/assignments/lab01/assignment.yml: partial_success
generated: terms/27s1/manifests/lab01/manifest.yml
errors: grading_workflow_missing: Grading workflow was not found for 27s1-csc1120-lab01-octocat.; workflow_dispatch_unsupported: Workflow dispatch is not supported for 27s1-csc1120-lab01-octocat.

The GitHub organization graider-sandbox does not contain the expected student repo:

graider-sandbox/27s1-csc1120-lab01-octocat

The organization only contains:

graider-sandbox/csc1120
graider-sandbox/csc1120L1Template

This suggests apply may be recording planned repository identity in the manifest without confirming actual GitHub repository creation.

Investigate whether the production CLI is accidentally using FakeGitHubClient or a no-op/default client instead of OctokitGitHubClient.

Also investigate whether apply updates the manifest before createRepositoryFromTemplate succeeds.

The grading workflow errors are likely secondary. The primary bug is that manifest state claims a repository exists when GitHub does not contain that repository.
```
