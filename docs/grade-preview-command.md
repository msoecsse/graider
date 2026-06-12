# Assignment Grade Preview Command

`graider assignment grade-preview <assignment.yml> --json` calculates which
student repositories would receive GitHub Actions grading workflow dispatches
for one assignment without dispatching anything.

The command runs from a Graider course admin repository root and accepts a
repository-relative assignment config path:

```bash
graider assignment grade-preview terms/27s1/assignments/lab02/assignment.yml --json
```

The command is JSON-only. Running it without `--json` returns a JSON failure
with `assignment_grade_preview_json_required`.

## Assignment Command Family

The canonical assignment-scoped command family for UI work is:

```bash
graider assignment detail <assignment.yml> --json
graider assignment apply-preview <assignment.yml> --json
graider assignment apply <assignment.yml> --json
graider assignment grade-preview <assignment.yml> --json
graider assignment grade <assignment.yml> --json
```

`assignment grade-preview` is preview-only and is the backend contract for
future UI-4A Grade Dispatch Preview.
`assignment grade` is the canonical UI-facing real grade dispatch command for
UI-4B. The legacy top-level `grade <assignment.yml> --json` command
remains supported for non-UI and backward-compatible use.

## Scope

Grade preview loads:

- course config
- term config
- assignment config
- targeted assignment rosters
- existing apply manifest when grading is enabled
- effective grading config

With a token-backed GitHub client, it performs bounded read-only checks:

- manifest-tracked student repository existence/accessibility
- configured grading workflow availability
- `workflow_dispatch` support for the configured grading workflow

Without a token, local target/config data still returns when it can be resolved.
Active repository rows use `token_required`, and the command returns
`partial_success`.

The command does not list broad organization repositories, inspect workflow
runs, inspect artifacts, download artifacts, publish reports, generate workflow
files, or inspect grading results.

## Effective Grading Resolution

Grade preview uses the same effective grading selection as `graider grade`:

- if `assignment.yml` omits `grading`, use `course.yml` grading
- if `assignment.yml` includes `grading`, use the assignment grading block as
  the full override

The current config model does not merge partial assignment grading overrides
with course defaults. Assignment-level grading must satisfy the same validation
rules as course-level grading.

The JSON response exposes:

```json
{
  "grading": {
    "enabled": true,
    "resolvedFrom": "course_default",
    "mode": "custom-workflow",
    "workflow": "grade.yml",
    "artifact": "grading-results",
    "resultFile": "results.json",
    "workflowDispatch": "available",
    "workflowRef": "main"
  }
}
```

`resolvedFrom` is `course_default` or `assignment_override`.

The real dispatch command `graider assignment grade <assignment.yml> --json`
uses the same effective grading resolution. It receives an `assignment.yml`
path, resolves course defaults plus assignment overrides through the same
config loader as legacy `graider grade`, and then routes through the existing
grade implementation.

## Real Dispatch Command

`assignment grade` is a mutating command because it dispatches GitHub Actions
grading workflows:

```bash
graider assignment grade terms/27s1/assignments/lab02/assignment.yml --json --all
```

It supports the same target selector options as legacy `graider grade`:

```bash
--all
--section <section-id>
--student-id <student-id>
--github-username <github-username>
```

The command requires exactly one selector. Running without a selector returns
the same `target_selector_missing` validation failure as legacy `graider grade`.

The canonical nested route reports:

```json
{
  "schemaVersion": 1,
  "commandName": "assignment grade",
  "assignmentFile": "terms/27s1/assignments/lab02/assignment.yml",
  "status": "success",
  "exitCode": 0,
  "diagnostics": [],
  "warnings": [],
  "errors": [],
  "generatedFiles": [],
  "summary": {
    "gradingSource": "course",
    "targetsSelected": 3,
    "dispatchAttempted": 3,
    "dispatchSucceeded": 3,
    "dispatchFailed": 0
  }
}
```

Apart from `commandName: "assignment grade"` on the nested route, the JSON
summary, diagnostics, target validation, manifest requirements, token/GitHub
behavior, and workflow dispatch semantics match legacy `graider grade`.

UI-4B calls `assignment grade`, not the legacy top-level command.

## Non-Mutation Guarantees

Grade preview does not:

- dispatch GitHub workflows
- create GitHub repositories
- update GitHub repositories
- add or remove collaborators
- add or remove team permissions
- enable GitHub Actions
- create commits, branches, trees, refs, or pull requests
- generate workflow files
- publish reports
- write local files
- write apply manifests
- write local plan/cache/state files
- inspect artifacts
- inspect workflow runs

The implementation uses direct read checks and does not call the grade executor,
workflow dispatcher, apply executor, manifest writer, workflow generator, or
report publisher.

## JSON Shape

Successful responses use command name `assignment grade-preview` and schema
version `1`:

```json
{
  "schemaVersion": 1,
  "commandName": "assignment grade-preview",
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
    "activeStudentCount": 2
  },
  "grading": {
    "enabled": true,
    "resolvedFrom": "assignment_override",
    "mode": "custom-workflow",
    "workflow": ".github/workflows/grade.yml",
    "artifact": "grading-results",
    "resultFile": "grading-results.json",
    "workflowDispatch": "available",
    "workflowRef": "main"
  },
  "plan": {
    "summary": {
      "wouldDispatch": 2,
      "wouldSkip": 1,
      "blocked": 0,
      "unknown": 0
    },
    "repositories": [
      {
        "studentId": "s001",
        "githubUsername": "adalovelace",
        "section": "001",
        "repository": "owner/csc1120-lab02-adalovelace",
        "status": "would_dispatch",
        "reason": "workflow_dispatch_available",
        "workflow": ".github/workflows/grade.yml",
        "ref": "main",
        "diagnostics": []
      }
    ]
  },
  "files": {
    "assignmentFile": "terms/27s1/assignments/lab02/assignment.yml",
    "manifestFile": "terms/27s1/manifests/lab02/manifest.yml",
    "workflowFile": ".github/workflows/grade.yml"
  },
  "actions": {
    "grade": {
      "available": true,
      "implemented": false,
      "previewOnly": true
    }
  }
}
```

## Status Values

Top-level status values:

- `success`: preview fully resolved and no blockers were found
- `partial_success`: local preview data is available but token, GitHub,
  manifest, workflow, or row-level checks produced error diagnostics
- `failure`: config or target resolution failed before a useful preview could
  be built

Repository-level preview status values:

- `would_dispatch`: grade would dispatch the configured workflow for this
  repository
- `would_skip`: the row is intentionally skipped, such as dropped or hold roster
  status, or grading is disabled
- `blocked`: dispatch cannot proceed for this row
- `unknown`: repository or workflow status could not be determined
- `token_required`: token-backed checks are required before dispatchability can
  be determined

Preview rows intentionally avoid completed-action labels such as `dispatched`
or `failed`.

## Target Resolution

Targets come from the assignment `sections` list and term roster sources. Rows
outside the assignment sections are not included.

The preview includes all rows in assignment sections so the UI can explain
skips. Only active rows can become `would_dispatch`.

Per-student rows include safe roster fields currently available to the backend:

- `studentId`
- `githubUsername`
- `section`
- manifest-tracked repository full name when available
- preview `status`
- machine-readable `reason`
- configured workflow path
- dispatch ref
- row diagnostics when applicable

Student names and emails are not emitted by the current roster model.

## Repository Planning

Grade dispatch uses manifest-tracked repositories. Grade preview follows that
boundary:

- active row with manifest record and dispatchable workflow -> `would_dispatch`
- dropped or hold row -> `would_skip`
- grading disabled -> `would_skip`
- active row without manifest record -> `blocked`
- manifest-tracked repository missing -> `blocked`
- workflow file missing -> `blocked`
- workflow lacks `workflow_dispatch` -> `blocked`
- read error -> `unknown`
- missing token -> `token_required`

The workflow ref is the assignment template branch, matching current grade
dispatch behavior.

## Diagnostics and Token Behavior

Missing tokens produce `github_token_required` and `partial_success` when local
config, roster, and manifest data can still be loaded.

Useful diagnostics include:

- `assignment_grade_preview_json_required`
- `github_token_required`
- `grading_not_configured`
- `assignment_status_blocks_grade`
- `target_matches_no_students`
- `manifest_missing`
- `student_repository_missing`
- `student_repository_status_unknown`
- `grading_workflow_missing`
- `workflow_dispatch_missing`
- GitHub auth, permission, rate-limit, network, timeout, and API diagnostics

Diagnostics must not include tokens, authorization headers, raw `process.env`,
raw stack traces, raw GitHub responses, artifact contents, faculty summaries, or
student report contents.
