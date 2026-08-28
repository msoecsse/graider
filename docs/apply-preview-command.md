# Assignment Apply Preview Command

`graider assignment apply-preview <assignment.yml> --json` calculates what a
future apply step would do for one assignment without making changes.

Electron UI Apply Preview and Confirm Apply behavior is documented in the
[Electron Apply Flow Developer Guide](electron-apply-flow-dev.md).

The command runs from a Graider course admin repository root and accepts a
repository-relative assignment config path:

```bash
graider assignment apply-preview terms/27s1/assignments/lab02/assignment.yml --json
```

The command is JSON-only. Running it without `--json` returns a JSON failure
with `assignment_apply_preview_json_required`.

## Assignment Command Family

The canonical assignment-scoped command family for UI work is:

```bash
graider assignment detail <assignment.yml> --json
graider assignment apply-preview <assignment.yml> --json
graider assignment apply <assignment.yml> --json
graider assignment grade-preview <assignment.yml> --json
```

`assignment apply-preview` is preview-only and must not mutate anything.
`assignment apply` is the canonical real mutation command for UI-3B and routes
to the existing apply implementation. The legacy top-level
`apply <assignment.yml> --json` command remains supported as an alias for
non-UI and backward-compatible use.
`assignment grade-preview` is preview-only and is documented in
[Assignment Grade Preview Command](grade-preview-command.md).

## Scope

Apply preview is the backend contract for the future UI-3A Apply Assignment
Preview page. It is preview-only and read-only.

The command loads:

- course config
- term config
- assignment config
- targeted roster rows
- optional existing apply manifest, if present
- repository naming config
- template and grading config

With a token, it performs bounded read-only GitHub checks:

- template repository accessibility
- template branch availability
- grading workflow file availability when grading is enabled
- `workflow_dispatch` support when grading is enabled
- target student repository existence by direct repository lookup

Without a token, local target rows still return when config and roster data can
be loaded. GitHub-dependent readiness and repository preview status are reported
as token-required or unknown.

The command does not list all organization repositories, scan unrelated course
repositories, inspect workflow runs, download artifacts, inspect grading
results, or inspect student repository contents.

## Non-Mutation Guarantees

Apply preview does not:

- create GitHub repositories
- update GitHub repositories
- add or remove collaborators
- add or remove team permissions
- enable GitHub Actions
- create commits, branches, trees, refs, or pull requests
- dispatch workflows
- generate workflow files
- publish reports
- write local files
- write apply manifests
- write plan files
- update local cache or state

The implementation uses direct read checks and does not call the apply executor,
manifest writer, plan writer, workflow generator, grade dispatcher, or report
publisher.

## JSON Shape

Successful responses use command name `assignment apply-preview` and schema
version `1`:

```json
{
  "schemaVersion": 1,
  "commandName": "assignment apply-preview",
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
    "studentCount": 3
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
    "resultFile": "results.json",
    "workflowStatus": "available",
    "workflowDispatch": "available"
  },
  "plan": {
    "summary": {
      "wouldCreateRepositories": 2,
      "wouldUpdateRepositories": 1,
      "wouldSkipRepositories": 0,
      "blockedRepositories": 0,
      "unknownRepositories": 0
    },
    "repositories": [
      {
        "studentId": "s001",
        "githubUsername": "adalovelace",
        "section": "001",
        "repository": "graider-sandbox/csc1120-lab02-adalovelace",
        "status": "would_create",
        "reason": "student_repository_missing",
        "diagnostics": []
      }
    ]
  },
  "files": {
    "assignmentFile": "terms/27s1/assignments/lab02/assignment.yml",
    "workflowFile": ".github/workflows/grade.yml",
    "templateSource": "graider-sandbox/csc1120L2Template@main"
  },
  "actions": {
    "apply": {
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
  readiness, manifest, or row-level checks produced error diagnostics
- `failure`: config or target resolution failed before a useful preview could
  be built

Repository-level preview status values:

- `would_create`: the target student repository was not found and apply would
  create it
- `would_update`: the target student repository exists or is manifest-tracked
  and apply would update/verify it
- `would_skip`: the row is intentionally skipped, such as dropped or hold
  roster status
- `blocked`: apply cannot proceed for this row
- `unknown`: repository status could not be determined, commonly because a
  token is missing or a read check failed

Preview rows intentionally avoid past-tense mutation statuses such as
`created`, `updated`, or `failed`.

## Target Resolution

Targets come from the assignment `sections` list and term roster sources. Rows
outside the assignment sections are not included.

Per-student rows include safe roster fields currently available to the backend:

- `studentId`
- `githubUsername`
- `section`
- generated or manifest-tracked repository full name
- preview `status`
- machine-readable `reason`
- row diagnostics when applicable

Student names and emails are not emitted by the current roster model.

Dropped and hold students are included as `would_skip` rows so the preview
summary accounts for the whole targeted roster set.

## Repository Planning

Repository names are generated with the existing repository naming helper. If an
existing manifest record is present, the preview uses the manifest-tracked
repository name for that student.

When a token-backed GitHub client is available, each active target repository is
checked by direct repository lookup:

- missing target repo -> `would_create`
- existing target repo -> `would_update`
- manifest-tracked repo missing -> `blocked`
- read error -> `unknown` with safe diagnostic context

When no token-backed GitHub client is available, active target rows use
`unknown` with reason `token_required`.

## Template and Grading Readiness

Apply preview reuses assignment-detail GitHub readiness checks for configured
template and grading blocks. When template configuration is absent, template
and workflow checks are `not_required`.

No-grading assignments return:

```json
{
  "enabled": false,
  "workflow": null,
  "workflowStatus": "not_required",
  "workflowDispatch": "not_required"
}
```

No-grading assignments do not fetch workflow content and do not produce grading
workflow blockers.

## Diagnostics and Token Behavior

Missing tokens produce `github_token_required` and `partial_success` when local
config and roster data can still be loaded.

Useful diagnostics include:

- `assignment_apply_preview_json_required`
- `github_token_required`
- config and roster diagnostics from existing loaders
- manifest diagnostics when an existing manifest is unreadable or invalid
- assignment detail readiness diagnostics for template and grading checks
- GitHub client diagnostics for repository status read failures
- lifecycle diagnostics such as `assignment_not_active`,
  `assignment_closed_blocks_creation`, and `assignment_archived`

Diagnostics must not include tokens, authorization headers, raw environment
variables, raw stack traces, large GitHub response bodies, artifact contents, or
student report contents.

## Relationship to UI-3

The intended boundary is:

```text
UI-2  = read-only assignment inspection
UI-3A = apply preview, still non-mutating
UI-3B = confirmed apply execution
```

UI-3A should call only this command for apply planning. UI-3B must add an
explicit confirmation step before wiring mutating apply execution through:

```bash
graider assignment apply <assignment.yml> --json
```
