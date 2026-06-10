# Assignment Detail Command

`graider assignment detail <assignment.yml> --json` builds the read-only backend
model for the future Electron assignment detail page.

The command runs from a Graider course admin repository root and accepts a
repository-relative assignment config path:

```bash
graider assignment detail terms/27s1/assignments/lab02/assignment.yml --json
```

The command is JSON-only. Running it without `--json` returns a JSON failure
with `assignment_detail_json_required`.

## Scope

Slice 11A is local-only and read-only. It loads course, term, assignment, roster,
and lightweight local apply-state data. It does not require
`GRAIDER_GITHUB_TOKEN` and does not call GitHub.

The command does not:

- create repositories
- update repositories
- dispatch grading workflows
- generate workflow files
- publish reports
- download artifacts
- inspect workflow runs
- parse grading artifacts

## JSON Shape

Successful responses use command name `assignment detail` and schema version `1`:

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
  "roster": {
    "sectionCount": 1,
    "activeStudentCount": 3,
    "totalStudentCount": 3
  },
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
  "studentReports": {
    "enabled": false,
    "mode": "disabled",
    "artifact": null,
    "sourceFile": null,
    "destinationFile": null,
    "graiderReportDestination": null,
    "facultyReportSource": null,
    "facultyReportDestination": null
  },
  "applyState": {
    "status": "not_applied"
  },
  "actions": {
    "validate": {
      "available": true,
      "implemented": true
    },
    "apply": {
      "available": true,
      "implemented": false
    },
    "grade": {
      "available": true,
      "implemented": false
    },
    "report": {
      "available": true,
      "implemented": false
    },
    "publishStudentReports": {
      "available": false,
      "implemented": false
    },
    "generateWorkflow": {
      "available": false,
      "implemented": false
    }
  }
}
```

## Local-Only Status Fields

GitHub-backed readiness is deferred to Slice 11B. In 11A:

- `template.status` is `not_checked`.
- `grading.workflowStatus` is `not_checked` for grading-enabled assignments.
- `grading.workflowDispatch` is `not_checked` for grading-enabled assignments.
- no-grading assignments use `not_required` for workflow fields.

No-grading assignments are represented as:

```json
{
  "enabled": false,
  "mode": "no-grading",
  "workflow": null,
  "artifact": null,
  "resultFile": null,
  "workflowStatus": "not_required",
  "workflowDispatch": "not_required"
}
```

## Diagnostics

The command reuses existing local config and roster diagnostics. Missing or
invalid assignment config returns `status: "failure"` with safe diagnostics.
Roster problems return `status: "partial_success"` when the assignment detail
model can still be built.

Diagnostics must not include tokens, authorization headers, raw environments,
artifact contents, or raw stack traces.

## UI Usage

The Electron UI should use this command as the backend source for the future
read-only assignment detail page. UI code should not parse `assignment.yml`
directly.

Slice 11B may add GitHub-backed template repository, branch, workflow, and
`workflow_dispatch` checks.
