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
publish / report / GitHub Contents API / student report publishing
```

**Affected command:**

```text
report
```

---

## B. Suspected Area

Suspected files or modules:

```text
src/cli/commands/report.command.ts
src/reporting/report-collector.ts
src/reporting/student-report-publisher.ts
src/reporting/student-report-renderer.ts
src/github/octokit-github-client.ts
src/github/github-client.ts
src/github/fake-github-client.ts
src/github/github-errors.ts
src/github/github-retry.ts
src/diagnostics/error-catalog.ts
```

Relevant existing tests:

```text
tests/cli/report.test.ts
tests/reporting/
tests/unit/reporting/student-report-publisher.test.ts
tests/unit/github/octokit-github-client.test.ts
tests/github/fake-github-client.test.ts
```

---

## C. Safety Constraints

Check all that apply:

```text
[ ] Must not make live GitHub calls
[x] Must use FakeGitHubClient or mocked GitHub client in normal tests
[ ] Must not mutate repositories
[x] Must not publish student reports except in explicitly requested publish flow
[x] Must not expose student data
[x] Must not print or store secrets
[x] Must not change generated file schemas unless required
[x] Must preserve backward compatibility
[x] Must keep archive/remove-access unsupported
```

Additional safety notes:

```text
Normal regression tests must not require live GitHub credentials.

The fix should be limited to student report publishing and GitHub Contents API error handling.

Publishing should only write the intended per-student report files to that student's own repository.

Publishing must not include faculty summaries or other students' data.

The fix must not change apply, grade dispatch, grading artifact parsing, repository creation, permissions, archive, or remove-access behavior.
```

---

## D. Expected Regression Test

Describe the test that should fail before the fix and pass after the fix.

```text
Add a regression test for publishing a student report when the target file does not already exist in the student repository.

Before the fix, a 404 from GET /contents/grading/report.md is treated as repository unavailable or publishing failure.

After the fix, a 404 from the contents lookup must be treated as "file does not exist yet", and Graider must create the file with the GitHub Contents API.

Also add tests proving that 500/502/503/504 from the contents lookup are treated as retryable GitHub API failures, not as repository missing.
```

Suggested test file or area:

```text
tests/unit/reporting/student-report-publisher.test.ts
tests/cli/report.test.ts
tests/unit/github/octokit-github-client.test.ts
tests/github/fake-github-client.test.ts
```

Required fixture changes:

```text
Use a minimal report fixture with one active student and one manifest-tracked repository.

FakeGitHubClient should simulate:
- repository exists
- GET contents grading/report.md returns 404
- create/update file request succeeds

Also test:
- GET contents grading/report.md returns 200 with sha, then publish updates the file
- GET contents grading/report.md returns 500/502/503/504, then publish reports retryable GitHub API error rather than student_report_repository_missing
```

---

## E. Allowed Scope

The fix may change:

```text
student report publisher
GitHub contents lookup behavior
GitHub contents create/update behavior
GitHub error classification
FakeGitHubClient contents API simulation
report command publish summary/warnings/errors
diagnostics for student report publishing
tests for publish create/update/error cases
```

The fix must not change:

```text
apply behavior
grade workflow dispatch behavior
grading artifact parsing
faculty report schema unless required
manifest schema
repository creation behavior
permission behavior
archive/remove-access unsupported behavior
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
- [ ] report --publish-student-reports creates grading/report.md when the file does not exist.
- [ ] report --publish-student-reports updates grading/report.md when the file already exists.
- [ ] 404 from repository lookup means repository missing.
- [ ] 404 from contents lookup means file missing and should be created.
- [ ] 500/502/503/504 from contents lookup is retryable or reported as github_api_error.
- [ ] 500/502/503/504 from contents lookup must not produce student_report_repository_missing.
- [ ] student_report_repository_missing is only emitted when the repository itself is confirmed missing.
- [ ] published student report contains only that student's information.
- [ ] normal tests do not require live GitHub credentials.
- [ ] live tests, if added, remain optional and sandbox-gated.
```

---

## G. Notes for Codex

Implementation hints or context:

```text
Observed live behavior:

report --publish-student-reports attempted to publish to:

graider-sandbox/27s1-csc1120-lab01-octocat

Expected target file:

grading/report.md

A GitHub Contents API check for:

/repos/graider-sandbox/27s1-csc1120-lab01-octocat/contents/grading%2Freport.md

currently returns 404, meaning the repository exists but the file does not yet exist.

Graider should handle that by creating grading/report.md.

Previous failure also showed:

GET /repos/graider-sandbox/27s1-csc1120-lab01-octocat/contents/grading%2Freport.md - 504

but Graider emitted:

student_report_repository_missing

That classification is wrong. A transient 504 from the contents endpoint should not mean the repository is missing.

Likely issue:

The publisher conflates repository availability with contents-path availability, or maps all GitHub errors during publish preflight to student_report_repository_missing.

Expected behavior:

1. Verify repository exists, if needed.
2. Render per-student report.
3. GET contents for grading/report.md.
4. If contents GET returns 404, create the file.
5. If contents GET returns 200, update the file using the returned sha.
6. If contents GET returns 500/502/503/504, retry or emit github_api_error.
7. Only emit student_report_repository_missing when the repository lookup itself returns 404.

Do not alter the grading-results artifact workflow or grading result parsing in this fix.
```
