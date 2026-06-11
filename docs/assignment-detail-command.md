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

The command is read-only. It loads course, term, assignment, roster, lightweight
local apply-state data, and bounded GitHub readiness when a token is available.

If `GRAIDER_GITHUB_TOKEN` or another project-supported token source is present,
the command checks the configured template repository, template branch, grading
workflow file, and `workflow_dispatch` trigger. If no token is available, the
command still returns local detail with `partial_success` and
`token_required` readiness statuses.

The command does not:

- create repositories
- update repositories
- dispatch grading workflows
- generate workflow files
- publish reports
- download artifacts
- inspect workflow runs
- parse grading artifacts
- scan student repositories

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
    "status": "available",
    "repositoryStatus": "available",
    "branchStatus": "available"
  },
  "grading": {
    "enabled": true,
    "mode": "custom-workflow",
    "workflow": ".github/workflows/grade.yml",
    "artifact": "grading-results",
    "resultFile": "grading-results.json",
    "workflowStatus": "available",
    "workflowDispatch": "available"
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

## GitHub Readiness Fields

GitHub-backed readiness uses a bounded set of checks:

- template repository existence/accessibility
- configured template branch existence
- configured grading workflow file content in the template repository branch
- `workflow_dispatch` support in that workflow file

The command does not list repositories, inspect workflow runs, download
artifacts, or inspect student repositories.

Readiness status values include:

```text
available
missing
inaccessible
branch_missing
token_required
not_checked
not_required
error
```

When the token is missing, local detail still returns and GitHub-dependent fields
use `token_required`. No-grading assignments use `not_required` for workflow
fields and do not fetch workflow content.

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
model can still be built. GitHub readiness problems also return
`partial_success` when local assignment detail can still be rendered.

GitHub readiness diagnostics include:

```text
github_token_required
assignment_detail_template_repository_missing
assignment_detail_template_branch_missing
assignment_detail_grading_workflow_missing
assignment_detail_workflow_dispatch_missing
assignment_detail_github_auth_failed
assignment_detail_github_permission_denied
assignment_detail_github_rate_limited
assignment_detail_github_request_failed
```

Diagnostics must not include tokens, authorization headers, raw environments,
artifact contents, or raw stack traces.

## UI Usage

The Electron UI should use this command as the backend source for the future
read-only assignment detail page. UI code should not parse `assignment.yml`
directly.

The UI can show local detail even when readiness is `token_required`, `missing`,
`inaccessible`, or `error`, and should present diagnostics instead of blocking
the entire page.

Electron assignment detail behavior, IPC boundaries, non-mutation guarantees,
and manual smoke-test guidance are documented in the
[Electron Assignment Detail Developer Guide](electron-assignment-detail-dev.md).

The future UI-3A apply preview flow uses
[`graider assignment apply-preview <assignment.yml> --json`](apply-preview-command.md).
That command is also non-mutating, but it answers planning questions about
target students and repository preview statuses rather than rendering the
assignment detail inspection page.
