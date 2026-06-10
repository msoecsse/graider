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

`dashboard --json` and `assignment detail --json` are UI-focused commands that
add command-specific top-level fields to this JSON surface. `dashboard --json`
adds a top-level `cards` array:

```json
{
  "schemaVersion": 1,
  "commandName": "dashboard",
  "status": "success",
  "exitCode": 0,
  "diagnostics": [],
  "summary": {
    "cardCount": 1,
    "courseCount": 1,
    "termCount": 1,
    "assignmentCount": 4,
    "needsAttentionCount": 0
  },
  "cards": []
}
```

The dashboard command is JSON-only. Running it without `--json` returns a JSON
failure with `dashboard_json_required`.

`assignment detail <assignment.yml> --json` is also JSON-only. Running it
without `--json` returns a JSON failure with
`assignment_detail_json_required`.

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

### `dashboard --json`

`dashboard --json` summarizes the current course-admin repository into UI-ready
course/term cards. It is read-only and does not create repositories, dispatch
workflows, publish reports, generate workflow files, inspect workflow runs, or
download artifacts.

Each card represents one course plus one term:

```json
{
  "kind": "course-term",
  "displayName": "27s1-csc1120",
  "courseSlug": "csc1120",
  "courseTitle": "CSC1120",
  "coursePath": ".",
  "termSlug": "27s1",
  "termTitle": "Spring 2027",
  "status": "active",
  "needsAttention": false,
  "attentionCount": 0,
  "roster": {
    "sectionCount": 1,
    "activeStudentCount": 3,
    "totalStudentCount": 3
  },
  "assignmentCount": 4,
  "recentAssignments": [],
  "diagnostics": []
}
```

`--term <termSlug>` filters to one term. Recent assignments include active and
completed assignments, exclude inactive assignments, and use `not_applied` when
no local manifest exists. The dashboard requires `GRAIDER_GITHUB_TOKEN` and does
not silently degrade to local-only data when the token is missing.

Assignment summaries may include bounded GitHub readiness fields:

```json
{
  "github": {
    "templateRepository": "available",
    "templateBranch": "available",
    "gradingWorkflow": "available",
    "workflowDispatch": "available"
  }
}
```

The dashboard checks template repository existence, template branch existence,
the configured grading workflow path, and `workflow_dispatch` for
grading-enabled assignments. It does not inspect student repositories, workflow
runs, artifacts, report contents, or per-student grading results.

### `assignment detail <assignment.yml> --json`

`assignment detail --json` builds the read-only local backend model for the
future Electron assignment detail page. It does not require
`GRAIDER_GITHUB_TOKEN` in Slice 11A and does not call GitHub.

Useful top-level fields include:

```json
{
  "schemaVersion": 1,
  "commandName": "assignment detail",
  "status": "success",
  "exitCode": 0,
  "diagnostics": [],
  "course": {
    "slug": "csc1120",
    "title": "CSC1120",
    "file": "course.yml"
  },
  "term": {
    "slug": "27s1",
    "title": "Spring 2027",
    "file": "terms/27s1/term.yml"
  },
  "assignment": {
    "slug": "lab02",
    "title": "Lab 02",
    "type": "individual",
    "status": "active",
    "file": "terms/27s1/assignments/lab02/assignment.yml"
  },
  "metadata": {
    "facultyOwner": "professor",
    "lmsAssignmentId": null,
    "gradingCategory": "labs",
    "points": 100
  },
  "deadline": {
    "dueAt": "2027-06-15T23:59:00+09:00",
    "latePolicy": "standard"
  },
  "sections": ["001"],
  "template": {
    "repository": "graider-sandbox/csc1120L2Template",
    "branch": "main",
    "status": "not_checked"
  },
  "grading": {
    "enabled": true,
    "mode": "custom-workflow",
    "workflow": ".github/workflows/grade.yml",
    "artifact": "grading-results",
    "resultFile": "grading-results.json",
    "workflowStatus": "not_checked",
    "workflowDispatch": "not_checked"
  },
  "applyState": {
    "status": "not_applied"
  },
  "actions": {}
}
```

The command loads course, term, assignment, roster summary, student report
publishing config, and lightweight local apply state. In Slice 11A, GitHub
readiness fields use `not_checked` or `not_required`; template repository,
branch, workflow, and `workflow_dispatch` checks are deferred to Slice 11B.

The command is read-only. It does not create repositories, dispatch grading,
generate workflows, publish reports, inspect workflow runs, download artifacts,
or parse grading result artifacts.

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
