# CLI JSON Contract

Graider UI integrations should consume `--json` command output, not
human-readable text. Human output is optimized for terminal use and may change
for readability. JSON output is the stable machine-readable surface for command
status, diagnostics, generated files, and command summaries.

The CLI JSON contract is separate from the grading result artifact contract.
`grading-results.json` uses only the grading statuses `passed`, `failed`, and
`skipped`. CLI/report JSON may also use operational statuses such as
`not_configured`, `missing`, and `not_checked`.

## Top-Level Shape

All UI-ready JSON command output uses this top-level shape:

```json
{
  "schemaVersion": 1,
  "commandName": "validate",
  "assignmentFile": "terms/27s1/assignments/lab01/assignment.yml",
  "status": "success",
  "exitCode": 0,
  "diagnostics": [],
  "warnings": [],
  "errors": [],
  "generatedFiles": [],
  "summary": {}
}
```

Stable top-level fields:

| Field            | Meaning                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `schemaVersion`  | CLI JSON contract version. Current value: `1`.                      |
| `commandName`    | Command name, such as `validate`, `report`, or `workflow generate`. |
| `assignmentFile` | Assignment path associated with the command when available.         |
| `status`         | Command status.                                                     |
| `exitCode`       | Process exit code Graider sets for the command.                     |
| `diagnostics`    | Combined `warnings` followed by `errors`.                           |
| `warnings`       | Warning diagnostics only.                                           |
| `errors`         | Error diagnostics only.                                             |
| `generatedFiles` | Repository-relative generated file paths when files were written.   |
| `summary`        | Command-specific machine-readable summary data.                     |

`diagnostics` is additive. Existing consumers that read `warnings` and `errors`
can continue to do so.

## Command Status Values

Current command status values:

- `success`
- `partial_success`
- `failure`

No-grading commands generally use `status: "success"` with summary fields such
as `gradingEnabled: false`, `workflowDispatchAttempted: false`, and
`resultStatus: "not_configured"` rather than a separate top-level
`not_configured` command status.

## Exit Codes

Exit codes follow the central error catalog:

| Exit Code | Meaning                                              |
| --------- | ---------------------------------------------------- |
| `0`       | Success, including warning-only results.             |
| `1`       | Validation or command error.                         |
| `2`       | Partial success.                                     |
| `3`       | Authentication or authorization failure.             |
| `4`       | GitHub API, network, timeout, or rate-limit failure. |
| `5`       | Configuration, schema, or structural file error.     |

## Diagnostic Shape

Diagnostics are safe, machine-readable objects:

```json
{
  "code": "workflow_dispatch_unsupported",
  "severity": "error",
  "message": "The configured grading workflow does not support workflow_dispatch.",
  "context": {
    "path": ".github/workflows/grade.yml",
    "assignmentSlug": "lab01"
  }
}
```

Required diagnostic fields:

- `code`
- `severity`
- `message`

Allowed severities:

- `error`
- `warning`
- `info`

Optional `context` fields may include safe values such as:

- `path`
- `field`
- `studentId`
- `githubUsername`
- `repository`
- `assignmentSlug`
- `termCode`
- `sourceFile`
- `destinationFile`
- `artifact`

Diagnostic codes are stable API-like values. Human-readable diagnostic messages
may evolve, so UIs should branch on `code` and use `message` for display.

Diagnostics must not include GitHub tokens, authorization headers, environment
secrets, raw artifact contents, faculty summary bodies, student report contents,
or stack traces in normal output.

## Command Summaries

`summary` is command-specific. The fields below are the intended UI-facing
surface for the MVP commands.

### `validate --json`

Useful fields include:

```json
{
  "assignmentSlug": "lab01",
  "termCode": "27s1",
  "courseCode": "csc1120",
  "gradingEnabled": true,
  "gradingMode": "preset",
  "workflowCompatibilityChecked": true,
  "githubReadinessChecked": true,
  "studentCount": 2,
  "activeStudentCount": 2
}
```

Validation failures still use the same top-level shape with `status: "failure"`
and diagnostic entries in `diagnostics` and `errors`.

### `apply --json`

Useful fields include:

```json
{
  "assignmentSlug": "lab01",
  "manifestFile": "terms/27s1/manifests/lab01/manifest.yml",
  "studentCount": 2,
  "created": 2,
  "existing": 0,
  "verified": 0,
  "noop": 0,
  "skipped": 0,
  "retryCount": 0
}
```

`generatedFiles` includes the manifest path when a manifest was written.

### `grade --json`

Dispatch summaries include:

```json
{
  "assignmentSlug": "lab01",
  "gradingEnabled": true,
  "targetsSelected": 2,
  "dispatchAttempted": 2,
  "dispatchSucceeded": 2,
  "dispatchFailed": 0,
  "skipped": 0
}
```

No-grading summaries include:

```json
{
  "assignmentSlug": "manual-lab",
  "gradingEnabled": false,
  "workflowDispatchAttempted": false,
  "resultStatus": "not_configured",
  "dispatchAttempted": 0,
  "dispatchSucceeded": 0,
  "dispatchFailed": 0
}
```

### `report --json`

Report summaries include generated report paths, aggregate counts, and report
collection status fields. UI fixtures in `examples/ui/` show a stable
per-student table shape that UI work can use:

```json
{
  "studentId": "student01",
  "githubUsername": "student01",
  "repository": "27s1-csc1120-lab01-student01",
  "repositoryStatus": "available",
  "workflowStatus": "completed",
  "artifactStatus": "found",
  "resultFileStatus": "valid",
  "resultStatus": "passed",
  "checks": [
    {
      "name": "Unit Tests",
      "status": "passed"
    }
  ],
  "diagnostics": []
}
```

No-grading report rows should use:

```json
{
  "workflowStatus": "not_configured",
  "artifactStatus": "not_checked",
  "resultFileStatus": "not_checked",
  "resultStatus": "not_configured",
  "checks": []
}
```

### `report --publish-student-reports --json`

Publishing summaries include:

```json
{
  "publishStudentReports": true,
  "studentsReported": 2,
  "studentsPublished": 2,
  "publishFailed": 0,
  "publishSkipped": 0,
  "publishedFiles": []
}
```

Publisher diagnostics distinguish missing repositories from missing
faculty-provided source files and missing artifacts.

### `workflow generate --json`

Successful generation includes:

```json
{
  "generatedFiles": ["terms/27s1/generated-workflows/lab01/grade.yml"],
  "summary": {
    "assignmentSlug": "lab01",
    "gradingMode": "preset",
    "preset": "java-junit-checkstyle",
    "workflowFile": "terms/27s1/generated-workflows/lab01/grade.yml"
  }
}
```

No-grading or non-preset assignments fail clearly with diagnostics such as
`workflow_generation_not_configured` or
`workflow_generation_requires_preset_mode`.

## Status Vocabularies

### Grading Result Artifact

`grading-results.json` status vocabulary:

- `passed`
- `failed`
- `skipped`

### Report and UI Operational Status

Report/UI status fields may include:

- `passed`
- `failed`
- `skipped`
- `not_configured`
- `missing`
- `missing_artifact`
- `missing_result_file`
- `invalid_result_file`
- `not_checked`
- `available`
- `missing`
- `not_tracked`
- `published`
- `skipped`
- `failed`

UIs should keep these operational statuses separate from the grading result
artifact contract.

## Safe-To-Display Fields

The following fields are intended to be safe for course-staff UI display:

- assignment, term, and course slugs/codes
- relative file paths
- student IDs and GitHub usernames from the course roster
- repository names and repository statuses
- diagnostic codes, severities, messages, and safe context
- aggregate counts
- generated file paths

These values are still course data. UI integrations should protect them with the
same access controls used for course-admin repositories and faculty reports.

## Intentionally Unstable or Internal Details

Do not build UI behavior around:

- human-readable command output
- diagnostic message wording
- raw `summary.options`
- raw GitHub API responses
- raw artifact file contents
- rendered faculty or student report bodies
- stack traces or debug-only details

## UI Fixtures

Representative UI fixtures live in:

```text
examples/ui/
```

They use fake data and are intended for frontend prototyping, visual states, and
contract tests. They are not live GitHub captures.
