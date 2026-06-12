# Assignment Grade Status Command

`graider assignment grade-status <assignment.yml> --json` reports a one-shot
status snapshot for GitHub Actions grading workflow runs across the active
student repositories for one assignment.

The command runs from a Graider course admin repository root:

```bash
graider assignment grade-status terms/27s1/assignments/lab02/assignment.yml --json
graider assignment grade-status terms/27s1/assignments/lab02/assignment.yml --student s001 --json
graider assignment grade-status terms/27s1/assignments/lab02/assignment.yml --students s001,s002 --json
```

The command is JSON-only. Running it without `--json` returns a JSON failure
with `assignment_grade_status_json_required`.

## Scope

Grade status loads:

- course config
- term config
- assignment config
- targeted assignment rosters
- existing apply manifest
- effective grading config

With a token-backed GitHub client, it performs bounded read-only checks:

- configured grading workflow runs for each active manifest-tracked student
  repository
- latest run status, conclusion, run id, run URL, and timestamps when available

Without a token, local target/config data still returns when it can be resolved.
Active repository rows use `token_required`, and the command returns
`partial_success`.

The command does not dispatch workflows, generate reports, download artifacts,
parse grading result files, publish student reports, generate workflow files, or
write local state. It does not call `graider report <assignment>`.

## Student Filters

The unfiltered command returns all active target student repository rows and is
the expected initial-load command:

```bash
graider assignment grade-status <assignment.yml> --json
```

For incremental UI polling, callers can narrow the snapshot to unfinished rows:

```bash
graider assignment grade-status <assignment.yml> --student <student-id> --json
graider assignment grade-status <assignment.yml> --students <student-id,student-id> --json
```

Filters match stable roster `student_id` values only. They do not match display
names or GitHub usernames. `--students` is comma-separated; whitespace around
IDs is trimmed, empty IDs are rejected, duplicate IDs are deduplicated, and row
order follows the assignment roster target order.

When filters are provided, the response shape is unchanged. Only these values
are narrowed to the returned rows:

- `target.sections`
- `target.sectionCount`
- `target.studentCount`
- `target.activeStudentCount`
- `summary`
- `repositories`

If both `--student` and `--students` are provided, the command returns a JSON
failure with `student_filter_conflict`.

Unknown filtered IDs produce `student_filter_unknown_student`. If at least one
requested ID matches an active target student, the command returns
`partial_success` with rows for the matched students. If no requested IDs match,
the command returns `failure` with `student_filter_no_matches` and performs no
GitHub workflow-run checks.

UI-5A should use the full command for the initial table load, identify
non-terminal rows, then use filtered commands for unfinished students and merge
returned rows into the existing table.

## Effective Grading Resolution

Grade status uses the same effective grading selection as `graider grade` and
`graider assignment grade-preview`:

- if `assignment.yml` omits `grading`, use `course.yml` grading
- if `assignment.yml` includes `grading`, use the assignment grading block as
  the full override

The JSON response exposes the resolved source:

```json
{
  "grading": {
    "enabled": true,
    "resolvedFrom": "course_default",
    "mode": "custom-workflow",
    "workflow": "grade.yml",
    "artifact": "grading-results",
    "resultFile": "results.json",
    "workflowRef": "main"
  }
}
```

`resolvedFrom` is `course_default` or `assignment_override`.

## Run Selection

For each active target repository, the command asks GitHub for runs of the
configured grading workflow. The current selection strategy is:

```text
latest_configured_workflow_run
```

That means the command selects the newest run returned for the effective
grading workflow. It does not scan unrelated workflows, inspect artifacts, or
parse result files. If no run exists for a repository, the row uses `missing`
with `selectionStrategy: "no_configured_workflow_run"`.

## JSON Shape

Successful responses use command name `assignment grade-status` and schema
version `1`:

```json
{
  "schemaVersion": 1,
  "commandName": "assignment grade-status",
  "status": "success",
  "exitCode": 0,
  "diagnostics": [],
  "assignment": {
    "slug": "lab02",
    "title": "Lab 02",
    "file": "terms/27s1/assignments/lab02/assignment.yml",
    "status": "active"
  },
  "course": {
    "slug": "csc1120",
    "title": "CSC1120"
  },
  "term": {
    "slug": "27s1",
    "title": "Spring 2027"
  },
  "target": {
    "sections": ["001"],
    "sectionCount": 1,
    "studentCount": 3,
    "activeStudentCount": 3
  },
  "grading": {
    "enabled": true,
    "resolvedFrom": "assignment_override",
    "mode": "custom-workflow",
    "workflow": ".github/workflows/grade.yml",
    "artifact": "grading-results",
    "resultFile": "grading-results.json",
    "workflowRef": "main"
  },
  "summary": {
    "totalRepositories": 3,
    "queued": 0,
    "inProgress": 1,
    "completed": 2,
    "successful": 1,
    "failed": 1,
    "cancelled": 0,
    "timedOut": 0,
    "missing": 0,
    "unknown": 0,
    "blocked": 0,
    "needsAttention": 1,
    "readyForReport": false
  },
  "repositories": [
    {
      "studentId": "s001",
      "githubUsername": "adalovelace",
      "section": "001",
      "repository": "owner/csc1120-lab02-adalovelace",
      "workflow": ".github/workflows/grade.yml",
      "ref": "main",
      "runId": 123456789,
      "runUrl": "https://github.com/owner/repo/actions/runs/123456789",
      "status": "completed",
      "conclusion": "success",
      "startedAt": "2026-06-12T10:00:00.000Z",
      "completedAt": "2026-06-12T10:03:00.000Z",
      "selectionStrategy": "latest_configured_workflow_run",
      "reason": "success",
      "needsAttention": false,
      "diagnostics": []
    }
  ],
  "actions": {
    "refreshStatus": {
      "available": true,
      "implemented": true
    },
    "generateReport": {
      "available": false,
      "implemented": false,
      "reason": "not_all_runs_complete"
    }
  }
}
```

## Status Values

Top-level status values:

- `success`: local data and GitHub run status resolved without error diagnostics
- `partial_success`: local data is available but token, GitHub, manifest, or
  row-level checks produced error diagnostics
- `failure`: config or target resolution failed before useful status data could
  be built

Repository status values:

- `queued`
- `in_progress`
- `completed`
- `missing`
- `unknown`
- `blocked`
- `token_required`

Repository conclusion values:

- `success`
- `failure`
- `cancelled`
- `timed_out`
- `skipped`
- `neutral`
- `action_required`
- `unknown`

## Ready For Report

`summary.readyForReport` is conservative. It is `true` only when every active
target repository has a completed workflow run with a known conclusion. It is
`false` when any active repository is queued, in progress, missing, unknown,
blocked, or token-required.

This command does not generate reports. Existing report generation remains
owned by:

```bash
graider report <assignment.yml>
```

Future UI-5A should consume `assignment grade-status` for status monitoring,
use student filters for efficient polling, and only offer report generation in a
later, explicit report slice.

## Diagnostics

Diagnostics are safe for JSON/UI display. They must not include tokens,
authorization headers, raw `process.env`, or raw stack traces.

Common diagnostics include:

- `assignment_grade_status_json_required`
- `student_filter_conflict`
- `student_filter_empty`
- `student_filter_no_matches`
- `student_filter_unknown_student`
- `github_token_required`
- `missing_required_file`
- `grading_not_configured`
- `manifest_missing`
- `student_repository_missing`
- `grading_workflow_run_missing`
- `grading_workflow_run_in_progress`
- `grading_workflow_run_failed`
- `grading_workflow_status_unknown`
- `github_permission_denied`
- `github_rate_limited`
- `github_api_error`

## Non-Mutation Guarantees

Grade status does not:

- dispatch GitHub workflows
- create or update GitHub repositories
- push files or commits
- write manifests or local state
- generate reports
- download artifacts
- parse grading result files
- publish student reports
- generate workflow files
- poll continuously or start background monitoring

The implementation uses `listWorkflowRuns` only for GitHub run inspection and
does not call the grade executor, report collector, artifact downloader,
workflow dispatcher, apply executor, manifest writer, workflow generator, or
report publisher.
