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
report / GitHub artifact download / artifact extraction / grading result parsing
```

**Affected command:**

```text
report
```

---

## B. Suspected Area

Suspected files or modules:

```text
src/reporting/report-collector.ts
src/grading/grading-status-mapper.ts
src/grading/grading-result-validator.ts
src/github/octokit-github-client.ts
src/github/github-client.ts
src/github/fake-github-client.ts
src/github/github-errors.ts
src/github/github-retry.ts
tests/reporting/
tests/unit/github/octokit-github-client.test.ts
tests/cli/report.test.ts
```

Relevant existing tests:

```text
tests/cli/report.test.ts
tests/reporting/
tests/unit/github/octokit-github-client.test.ts
tests/unit/grading/
tests/fixtures/report/
```

---

## C. Safety Constraints

Check all that apply:

```text
[ ] Must not make live GitHub calls
[x] Must use FakeGitHubClient or mocked artifact data in normal tests
[x] Must not mutate repositories
[x] Must not publish student reports
[x] Must not expose student data
[x] Must not print or store secrets
[x] Must not change generated file schemas unless required
[x] Must preserve backward compatibility
[x] Must keep archive/remove-access unsupported
```

Additional safety notes:

```text
Normal regression tests should not require live GitHub credentials.

The fix should focus on artifact download/extraction/result file lookup. It must not change apply, grade dispatch, publishing, repository permissions, or manifest behavior.

Do not log artifact contents unless explicitly needed in tests.
```

---

## D. Expected Regression Test

Describe the test that should fail before the fix and pass after the fix.

```text
Add a regression test where the GitHub client downloads an artifact zip containing grading-results.json at the configured path.

Before the fix, report receives artifact_status found but result_file_status missing.

After the fix, report must find grading-results.json, parse it, and produce:

artifact_status: found
result_file_status: valid
result_status: passed or failed

depending on the file contents.
```

Suggested test file or area:

```text
tests/unit/github/octokit-github-client.test.ts
tests/reporting/report-collector.test.ts
tests/cli/report.test.ts
```

Required fixture changes:

```text
Add a small artifact zip fixture or mocked downloaded artifact object containing grading-results.json.

The JSON file should be valid:

{
  "schema_version": 1,
  "status": "passed",
  "checks": []
}

If adding a zip fixture is inconvenient, mock the Octokit artifact download/extraction path so it returns a file map equivalent to:

{
  "grading-results.json": "{ ...valid grading result JSON... }"
}

Also test the nested-path case if supported:

{
  "graider-output/grading-results.json": "{ ...valid grading result JSON... }"
}
```

---

## E. Allowed Scope

The fix may change:

```text
Octokit artifact download implementation
artifact zip extraction
DownloadedArtifact file map shape
report collector result-file lookup
path normalization for artifact entries
FakeGitHubClient artifact behavior
tests for artifact extraction and report result lookup
diagnostics for missing result file if needed
```

The fix must not change:

```text
apply behavior
grade workflow dispatch behavior
repository creation behavior
manifest schema
student report publishing behavior
archive/remove-access unsupported behavior
grading result JSON schema unless absolutely required
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
- [ ] report finds grading-results.json when it exists at the artifact root.
- [ ] report finds graider-output/grading-results.json when configured result_file matches that nested path.
- [ ] artifact entry path matching is normalized for forward slashes.
- [ ] report does not report missing_result_file when the configured result file exists in the downloaded artifact.
- [ ] invalid result files still report invalid_result_file.
- [ ] missing result files still report missing_result_file.
- [ ] normal tests do not require live GitHub credentials.
- [ ] live tests, if added, remain optional and sandbox-gated.
```

---

## G. Notes for Codex

Implementation hints or context:

```text
Observed live behavior:

Graider report output for active student:

artifact_status: found
result_file_status: missing
result_status: missing_result_file
workflow_status: completed

Manual GitHub artifact inspection confirms that the artifact zip contains the configured result file.

This strongly suggests the bug is in one of these areas:

1. Octokit artifact download is not extracting zip contents correctly.
2. Extracted artifact file map uses paths that do not match report collector lookup.
3. Report collector is checking the wrong result_file path.
4. Path normalization differs between artifact entries and config.
5. Artifact download returns binary/zip data but code treats it as already-extracted content.

Expected behavior:

- downloadArtifact should return a map of artifact entry path -> text content.
- report collector should look up the configured result_file path exactly after normalizing separators.
- if configured result_file is grading-results.json and artifact contains grading-results.json, result_file_status must be valid.
- if configured result_file is graider-output/grading-results.json and artifact contains that path, result_file_status must be valid.

Do not change the grading result schema as part of this fix.
```
