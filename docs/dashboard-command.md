# Graider Requirements — Slice 10: JSON-Only Dashboard Command for UI

## Purpose

Add a new `dashboard` command that provides a stable JSON data contract for the future Graider UI.

The dashboard command is the first backend/UI bridge. It should summarize the current course admin repository into UI-ready course/term cards, similar to the GitHub Classroom “Your Classrooms” dashboard, while keeping the CLI as the source of truth.

The command should be read-only. It must not mutate GitHub, generate workflows, dispatch grading, apply repositories, publish reports, or create files.

---

## Command

### Required command

```bash
graider dashboard --json
```

### Optional term filter

```bash
graider dashboard --json --term 27s1
```

### JSON-only behavior

`dashboard` is primarily for UI integration and should not support human-readable output.

If run without `--json`, it should fail clearly.

Recommended response:

```json
{
  "schemaVersion": 1,
  "commandName": "dashboard",
  "status": "failure",
  "exitCode": 1,
  "diagnostics": [
    {
      "code": "dashboard_json_required",
      "severity": "error",
      "message": "The dashboard command only supports JSON output. Run with --json."
    }
  ],
  "summary": {
    "cardCount": 0,
    "courseCount": 0,
    "termCount": 0,
    "assignmentCount": 0
  },
  "cards": []
}
```

If the existing CLI framework requires a different way of enforcing JSON-only commands, use that convention while preserving the behavior.

---

## Scope

### V1 scope

The command summarizes one admin repository root at a time.

Expected current working directory:

```text
csc1120/
  course.yml
  terms/
    27s1/
      term.yml
      rosters/
      assignments/
```

The UI can later maintain a list of opened course folders and call `graider dashboard --json` for each one.

### Out of scope for V1

Do not scan a parent directory for multiple admin repositories.

Do not include report history or artifact result summaries. Save those for assignment detail pages.

Do not run `validate`, `apply`, `grade`, `report`, or `workflow generate` as subcommands.

Do not mutate GitHub or the filesystem.

Do not add UI code in this slice.

---

## Card Model

The response must include a top-level `cards` array.

Each card represents exactly one:

```text
course + term
```

A course repository with multiple terms should produce one card per term.

Example:

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
  "recentAssignments": [
    {
      "slug": "lab02",
      "title": "Lab 02",
      "status": "active",
      "gradingEnabled": true,
      "gradingMode": "custom-workflow",
      "studentPublishEnabled": true,
      "assignmentFile": "terms/27s1/assignments/lab02/assignment.yml",
      "needsAttention": false,
      "diagnostics": []
    }
  ],
  "diagnostics": []
}
```

---

## Top-Level JSON Contract

Recommended response shape:

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

### Required top-level fields

```text
schemaVersion
commandName
status
exitCode
diagnostics
summary
cards
```

### `commandName`

Must be:

```text
dashboard
```

### `schemaVersion`

Use:

```text
1
```

### Command status vocabulary

Use the existing Slice 9 CLI JSON status vocabulary where possible.

Recommended statuses:

```text
success
partial_success
failure
```

Suggested usage:

```text
success          all dashboard data was loaded and no error-level diagnostics exist
partial_success some cards/assignments loaded, but one or more local/GitHub checks failed
failure          the command could not build any meaningful dashboard response
```

---

## Recent Assignments

Each card should show recent assignments.

### Include

```text
active assignments
completed assignments
```

### Exclude

```text
inactive assignments
```

### Sorting

Recommended sort:

```text
active assignments first
completed assignments second
within each group: due_at descending if present
fallback: assignment title
fallback: assignment slug
```

### Limit

Default recent assignment limit:

```text
5
```

Optional flag if straightforward:

```bash
graider dashboard --json --assignment-limit 10
```

If not implemented in V1, use a named constant for the default limit and document follow-up support.

---

## GitHub Awareness

Unlike a purely local dashboard, V1 should call GitHub for current repository and workflow status.

This is acceptable because the UI is intended to be an interface for working with GitHub.

### Required GitHub checks

The command should check, using existing GitHub client abstractions:

```text
template repository exists
template branch exists
required grading workflow exists for grading-enabled assignments
workflow_dispatch is present when the workflow can be read
Dashboard V1 should not inspect every student repository by default.

Student repository state belongs primarily on assignment detail pages, not the main dashboard. The dashboard may include
a lightweight assignment state such as `not_applied` when no manifest/apply state exists, but it should not perform
per-student repository checks during normal dashboard loading.

Use:
not_applied

when an assignment has no local manifest or apply state indicating that student repositories have been created.

Do not mark missing student repositories as needsAttention for assignments that have not been applied yet.

Only treat missing student repositories as dashboard attention items if existing local apply/manifest state indicates
the repos should already exist and the check can be performed cheaply without scanning every student repo.

```

### Do not perform expensive scans

Dashboard V1 should not:

```text
list all workflow runs for every student
download grading artifacts
parse grading-results.json from GitHub
compute passed/failed report summaries
publish reports
dispatch workflows
create or update repositories
```

Save these for assignment detail and report screens.

### GitHub failures

If GitHub status checks fail due to authentication, permissions, rate limiting, or network errors, return diagnostics and mark affected cards/assignments as needing attention.

Do not crash the entire dashboard if local data can still be shown.

### GitHub token requirement

Because the dashboard is intended to show current GitHub-backed status, `graider dashboard --json` requires GitHub authentication.

The dashboard performs bounded GitHub checks for template repositories, template
branches, configured grading workflows, and `workflow_dispatch`.

If `GRAIDER_GITHUB_TOKEN` is missing or empty, the command must fail clearly instead of returning a local-only dashboard. Returning local-only data would make the UI appear functional while hiding the fact that GitHub status could not be checked.

Recommended response:

```json
{
  "schemaVersion": 1,
  "commandName": "dashboard",
  "status": "failure",
  "exitCode": 1,
  "diagnostics": [
    {
      "code": "github_token_missing",
      "severity": "error",
      "message": "The dashboard command requires GRAIDER_GITHUB_TOKEN so it can check current GitHub status."
    }
  ],
  "summary": {
    "cardCount": 0,
    "courseCount": 0,
    "termCount": 0,
    "assignmentCount": 0,
    "needsAttentionCount": 0
  },
  "cards": []
}
```

## Needs Attention

A card should show `needsAttention: true` when anything in the current local or GitHub-backed state would likely cause errors or break the workflow.

This should be diagnostic-driven rather than hard-coded in the UI.

### Needs attention examples

```text
course.yml missing
course.yml parse/schema problem
term.yml missing
term.yml parse/schema problem
roster missing
roster invalid
assignment.yml parse/schema problem
assignment.yml schema problem
required template repository missing
template branch missing
grading workflow missing
workflow_dispatch missing
required generated/supporting document missing
student repo missing after apply/manifest indicates it should exist
invalid report publishing config
missing required local/generated file
GitHub token missing when GitHub checks are required
GitHub permission failure
```

### Card-level fields

Each card should include:

```json
{
  "needsAttention": true,
  "attentionCount": 2,
  "diagnostics": []
}
```

### Assignment-level fields

Each recent assignment should include:

```json
{
  "needsAttention": true,
  "diagnostics": []
}
```

Diagnostics should be safe to display in the UI.

---

## Diagnostics

Use existing diagnostic patterns from Slice 9.

At minimum, diagnostics should include:

```text
code
severity
message
```

Optional context may include:

```text
path
field
courseSlug
termSlug
assignmentSlug
studentId
githubUsername
repository
templateRepository
templateBranch
workflow
checkedPaths
```

### Severity vocabulary

Use existing project values if already defined.

Recommended:

```text
error
warning
info
```

### Diagnostic safety

Diagnostics must not include:

```text
GitHub tokens
authorization headers
environment secret values
full artifact contents
student report contents
faculty summary contents
raw stack traces in normal mode
```

---

## Roster Summary

Include lightweight roster information if available.

Card-level roster shape:

```json
{
  "roster": {
    "sectionCount": 1,
    "activeStudentCount": 3,
    "totalStudentCount": 3
  }
}
```

If the roster is missing or invalid:

```text
include diagnostics
set needsAttention true
use null or zero counts according to existing project conventions
```

Do not fail the entire command if one roster file is invalid and other dashboard data can still be returned.

---

## Assignment Summary Fields

Each assignment shown in `recentAssignments` should include enough information for the dashboard card and link navigation.

Recommended shape:

```json
{
  "slug": "lab02",
  "title": "Lab 02",
  "status": "active",
  "gradingEnabled": true,
  "gradingMode": "custom-workflow",
  "studentPublishEnabled": true,
  "assignmentFile": "terms/27s1/assignments/lab02/assignment.yml",
  "dueAt": "2027-06-15T23:59:00+09:00",
  "needsAttention": false,
  "diagnostics": []
}
```

### Required assignment fields

```text
slug
title
status
gradingEnabled
assignmentFile
needsAttention
diagnostics
```

### Optional assignment fields

```text
gradingMode
studentPublishEnabled
dueAt
points
sections
templateRepository
templateBranch
workflow
github
```

Include optional fields if they are already easily available from parsed config.

### Assignment GitHub status

When GitHub checks are available, assignment summaries include:

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

Status values are:

```text
available
missing
not_required
not_checked
unknown
error
```

No-grading assignments still check template repository and branch readiness, but
`gradingWorkflow` and `workflowDispatch` are `not_required`. Dashboard checks
the configured workflow path as a repository path, for example
`.github/workflows/grade.yml`; it does not reduce that path to `grade.yml` for
file existence checks.

---

### Assignment apply state

Assignments may include a lightweight apply state for dashboard display.

Recommended values:

```text
not_applied
applied
partially_applied
unknown
```

For V1, not_applied is sufficient when no local manifest/apply state exists.

Example:

```json
{
  "slug": "hw01",
  "title": "HW 01",
  "status": "active",
  "gradingEnabled": false,
  "assignmentFile": "terms/27s1/assignments/hw01/assignment.yml",
  "applyState": "not_applied",
  "needsAttention": false,
  "diagnostics": []
}
```

not_applied is not an error and should not set needsAttention by itself.

## Term Filter

Support:

```bash
graider dashboard --json --term 27s1
```

Behavior:

```text
only include cards for the requested term
return success with empty cards if the term does not exist, plus warning or error diagnostic according to existing conventions
```

Recommended missing-term diagnostic:

```json
{
  "code": "dashboard_term_not_found",
  "severity": "error",
  "message": "The requested term 27s1 was not found.",
  "context": {
    "termSlug": "27s1"
  }
}
```

If existing diagnostic style does not use `context`, use the existing style.

---

## Broken File Behavior

If one assignment file is broken, the dashboard should still return other cards/assignments.

Recommended behavior:

```text
status: partial_success
include a diagnostic for the broken file
mark the affected card as needsAttention
exclude the broken assignment from recentAssignments or include a placeholder entry with diagnostics
```

Prefer including a placeholder entry if it helps the UI show exactly where the problem is.

Example placeholder:

```json
{
  "slug": "lab02",
  "title": "lab02",
  "status": "unknown",
  "gradingEnabled": false,
  "assignmentFile": "terms/27s1/assignments/lab02/assignment.yml",
  "needsAttention": true,
  "diagnostics": [
    {
      "code": "assignment_config_parse_failed",
      "severity": "error",
      "message": "Could not parse assignment.yml."
    }
  ]
}
```

Use existing diagnostic codes when available.

---

## Implementation Boundary

`dashboard` should be separate from other command logic, but it may reuse existing lower-level services.

It should not shell out to other Graider commands internally.

Do not implement dashboard as:

```text
run validate for every assignment
run report for every assignment
run apply dry-run for every assignment
```

Instead, reuse shared helpers for:

```text
course loading
term loading
assignment loading
schema validation
roster parsing
diagnostics
GitHub repository checks
GitHub workflow checks
workflow_dispatch parsing
```

This keeps the command fast, predictable, and side effect free.

---

## Performance Expectations

Dashboard may call GitHub, but it should avoid unnecessary repeated calls.

Recommendations:

```text
cache template repository checks within one dashboard run
cache template workflow checks within one dashboard run
avoid checking the same template repo/branch/workflow multiple times
avoid O(n^2) scans across roster and assignments
do not inspect artifacts or workflow runs
```

For a course with:

```text
1 term
5 assignments
150 active students
```

dashboard should remain responsive.

Do not add strict timing tests unless the repo already has stable performance test conventions.

### GitHub check containment

Dashboard GitHub checks should be bounded and card-oriented.

For V1, check course/term/assignment-level GitHub dependencies such as:

```text
template repository
template branch
configured grading workflow
workflow_dispatch support
```

Do not check every student repository on the main dashboard. Student-level repository checks should be handled in
assignment detail views or explicit apply/report workflows.

A failed GitHub check should become a diagnostic for the affected card or assignment. One failed check should not
prevent unrelated cards from rendering unless the failure is global, such as a missing token.

---

## Test Strategy

Use tests first.

Tests must not require live GitHub credentials.

Use `FakeGitHubClient` or existing GitHub test abstractions.

### Required tests

#### JSON-only behavior

```text
dashboard without --json fails with dashboard_json_required or equivalent
dashboard --json returns valid JSON
dashboard --json includes schemaVersion, commandName, status, exitCode, diagnostics, summary, cards
```

#### Card generation

```text
one course + one term returns one card
multiple terms return one card per term
--term returns only requested term
cards array is present
card displayName combines term and course in a UI-friendly way
```

#### Recent assignments

```text
active and completed assignments are included
inactive assignments are excluded
active assignments sort before completed assignments
assignments sort by due_at descending within status group
recent assignment list is limited to default limit
```

#### Roster counts

```text
roster section count is included
active student count is included
total student count is included
invalid roster marks card needsAttention
missing roster marks card needsAttention if roster is required by current config
```

#### GitHub checks

```text
template repository exists -> no template missing diagnostic
template repository missing -> needsAttention true
template branch missing -> needsAttention true
grading workflow missing -> needsAttention true
workflow_dispatch missing -> needsAttention true
workflow exists with workflow_dispatch -> no workflow diagnostic
GitHub auth failure -> diagnostic and needsAttention
```

#### Needs attention

```text
local parse error sets needsAttention
schema error sets needsAttention
missing required document sets needsAttention
GitHub missing workflow sets needsAttention
attentionCount matches diagnostics that require attention
```

#### Partial success

```text
one broken assignment does not prevent other cards from returning
status becomes partial_success
diagnostics include the broken file
```

#### No mutations

```text
dashboard does not create repositories
dashboard does not update repositories
dashboard does not dispatch workflows
dashboard does not publish reports
dashboard does not generate workflow files
```

Use fake GitHub client call assertions if available.

---

## Documentation

Add or update:

```text
docs/dashboard-command.md
docs/cli-json-contract.md
README.md
docs/troubleshooting.md
```

Document:

```text
dashboard is JSON-only
dashboard is intended for UI integration
dashboard produces one card per course-term
dashboard includes GitHub status checks
dashboard does not mutate anything
dashboard does not include report summaries in V1
dashboard should be run from an admin repo root
--term filters to one term
```

If adding a new diagnostics code such as `dashboard_json_required`, document it in:

```text
docs/error-warning-catalog.md
```

---

## Suggested CLI Help

Even though the command is JSON-only, help text should exist.

Example:

```text
Usage: graider dashboard --json [--term <termSlug>]

Build a UI-ready dashboard model for the current Graider course admin repository.

Options:
  --json              Required. Emit dashboard JSON.
  --term <termSlug>   Include only one term.
```

If the CLI framework includes command descriptions in `--help`, include a short description.

---

## Acceptance Criteria

This slice is complete when:

```text
- [ ] graider dashboard --json exists
- [ ] graider dashboard requires --json or otherwise emits JSON-only failure
- [ ] dashboard returns a top-level cards array
- [ ] each card represents one course-term
- [ ] --term filters cards by term
- [ ] recent assignments include active and completed assignments
- [ ] inactive assignments are excluded
- [ ] recent assignments are sorted predictably
- [ ] basic roster counts are included when available
- [ ] dashboard performs GitHub status checks through existing GitHub abstractions
- [ ] missing template repo/branch/workflow/workflow_dispatch produces diagnostics
- [ ] needsAttention and attentionCount are diagnostic-driven
- [ ] broken assignment files produce partial_success, not total failure, when other data can be shown
- [ ] dashboard fails clearly when `GRAIDER_GITHUB_TOKEN` is missing
- [ ] dashboard does not silently return local-only data when GitHub auth is unavailable
- [ ] dashboard does not inspect every student repository by default
- [ ] dashboard uses `not_applied` for assignments with no manifest/apply state
- [ ] `not_applied` does not set `needsAttention` by itself
- [ ] student repository checks are deferred to assignment detail or explicit workflows
- [ ] dashboard performs no mutations
- [ ] tests use fake GitHub, not live credentials
- [ ] docs describe the dashboard command and JSON contract
- [ ] npm run typecheck passes
- [ ] npm run lint passes
- [ ] npm run format:check passes
- [ ] npm test passes
- [ ] npm run build passes
```

---

## Out of Scope

Do not implement:

```text
actual UI screens
multi-admin-repo scan
report summary cards
artifact downloads
workflow run inspection
student report publishing
apply/grade/report execution
workflow generation
GitHub mutations
LMS integration
hidden/private grading
archive/remove-access
```

---

## Notes for Future UI

The UI should render this command’s `cards` array into a GitHub Classroom-like dashboard.

Future UI should use:

```bash
graider dashboard --json
```

for the main dashboard, then use assignment-specific commands for detail pages:

```bash
graider validate <assignment.yml> --json
graider report <assignment.yml> --json
graider workflow generate <assignment.yml> --json
graider apply <assignment.yml> --yes --json
graider grade <assignment.yml> <selector> --json
graider report <assignment.yml> --publish-student-reports --json
```

The dashboard command should remain a read-only summary command.
