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
grade / GitHub client / workflow dispatch / live GitHub integration
```

**Affected command:**

```text
grade
```

---

## B. Suspected Area

Suspected files or modules:

```text
src/cli/commands/grade.command.ts
src/execution/grade-executor.ts
src/github/octokit-github-client.ts
src/github/github-client.ts
src/github/fake-github-client.ts
src/github/github-errors.ts
src/github/github-retry.ts
src/diagnostics/error-catalog.ts
```

Relevant existing tests:

```text
tests/cli/grade.test.ts
tests/unit/execution/grade-executor.test.ts
tests/unit/github/octokit-github-client.test.ts
tests/live/octokit-github-client.live.test.ts
```

---

## C. Safety Constraints

Check all that apply:

```text
[ ] Must not make live GitHub calls
[x] Must use FakeGitHubClient in normal tests
[x] Must not mutate repositories except workflow dispatch in explicitly gated live tests
[x] Must not publish student reports
[x] Must not expose student data
[x] Must not print or store secrets
[x] Must not change generated file schemas unless required
[x] Must preserve backward compatibility
[x] Must keep archive/remove-access unsupported
```

Additional safety notes:

```text
Normal regression tests should use mocks or FakeGitHubClient and must not require a GitHub token.

Live verification may be useful, but it must remain optional, explicitly gated, and sandbox-only.

The fix must not change apply/report behavior.
```

---

## D. Expected Regression Test

Describe the test that should fail before the fix and pass after the fix.

```text
Add a regression test for OctokitGitHubClient.dispatchWorkflow proving that it sends the required ref field when dispatching a workflow.

Before the fix, dispatchWorkflow likely calls the GitHub workflow dispatch endpoint without a valid ref, causing GitHub to return HTTP 422.

After the fix, dispatchWorkflow should send a valid ref, defaulting to the configured assignment/template branch or repository default branch, commonly main.
```

Suggested test file or area:

```text
tests/unit/github/octokit-github-client.test.ts
tests/unit/execution/grade-executor.test.ts
tests/cli/grade.test.ts
```

Required fixture changes:

```text
No live fixture should be required for the normal regression test.

Use a mocked Octokit request/client and assert that the workflow dispatch request includes:

{
  ref: "main"
}

or the appropriate configured branch/ref.
```

---

## E. Allowed Scope

The fix may change:

```text
GitHubClient dispatch workflow input model
OctokitGitHubClient.dispatchWorkflow implementation
Grade executor dispatch input construction
FakeGitHubClient dispatchWorkflow behavior/tests
Diagnostics for workflow dispatch failure if needed
Unit tests for workflow dispatch
Optional sandbox-gated live test coverage
```

The fix must not change:

```text
apply behavior
repository creation behavior
manifest schema
report generation behavior
student report publishing behavior
archive/remove-access unsupported behavior
grading workflow artifact schema
LMS integration
hidden grading behavior
```

---

## F. Acceptance Criteria

The bug is fixed when:

```text
- [ ] A regression test reproduces the bug.
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
- [ ] GitHubClient.dispatchWorkflow sends a valid ref to GitHub.
- [ ] The ref defaults to the configured assignment/template branch or repository default branch.
- [ ] The grade command dispatches the workflow successfully in the sandbox repository.
- [ ] Manual curl dispatch and Graider grade dispatch both work for the same workflow.
- [ ] The fix does not require live GitHub credentials for normal tests.
- [ ] Live tests, if added, remain optional and sandbox-gated.
- [ ] The GitHub API version deprecation warning is addressed if practical by setting X-GitHub-Api-Version: 2022-11-28.
```

---

## G. Notes for Codex

Implementation hints or context:

```text
Observed live behavior:

Graider grade command fails:

POST /repos/graider-sandbox/27s1-csc1120-lab01-octocat/actions/workflows/grade.yml/dispatches - 422

grade: terms/27s1/assignments/lab01/assignment.yml: failure
errors: workflow_dispatch_failed: Workflow dispatch failed for a selected student repository.; github_api_error: Workflow dispatch failed for a selected student repository.

Manual dispatch succeeds with HTTP 204 using:

curl -i -X POST \
  -H "Authorization: Bearer $GRAIDER_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/graider-sandbox/27s1-csc1120-lab01-octocat/actions/workflows/grade.yml/dispatches \
  -d '{"ref":"main"}'

The workflow file exists in both the template and student repositories and includes workflow_dispatch.

This strongly suggests Graider's dispatchWorkflow implementation is not sending the required ref field, or is sending an incorrect ref.

Investigate:
- DispatchWorkflowInput model
- grade executor construction of dispatch input
- OctokitGitHubClient.dispatchWorkflow request body
- branch/ref value available from assignment/template config
- whether the workflow path should be grade.yml or .github/workflows/grade.yml when calling the GitHub API

Expected implementation:
- dispatchWorkflow must include ref
- default ref should usually be assignment template branch or repository default branch
- preserve current behavior for fake client tests
```
