# Graider Faculty UI User Guide

Graider helps faculty manage GitHub-based course assignments from a course-admin
folder. The UI can inspect course and assignment setup, preview and apply
assignment repository setup, preview and dispatch grading workflows, watch
grading workflow status, and view faculty reports.

This guide is for course staff who edit YAML/CSV configuration and use the
Electron UI. It avoids developer internals and focuses on the current supported
workflow.

## What The UI Supports

Current workflow:

1. Open or register a course folder.
2. View the dashboard.
3. Open assignment detail.
4. Preview assignment apply.
5. Confirm assignment apply.
6. Preview grading dispatch.
7. Confirm grading dispatch.
8. Check grading status.
9. View the faculty report.

Deferred in the UI:

- student report publishing
- student report publish preview/confirmation
- student-facing report preview
- workflow generation UI
- packaged app installation, if your team is running from source

## Required Local Setup

- The Graider CLI must be installed or available on `PATH`.
- The Electron UI must be opened or run locally.
- GitHub-backed checks and actions need a GitHub token.
- The UI checks `GRAIDER_GITHUB_TOKEN` first, then falls back to `gh auth token`
  when GitHub CLI authentication is available.
- Do not put tokens in YAML, roster files, reports, manifests, or screenshots.

For local development from this repository, see the startup commands in
[Electron Release Readiness Guide](electron-release-readiness.md).

## Course Folder Structure

Graider expects a course-admin folder with `course.yml` at the root. Assignment
paths follow `terms/<term-code>/assignments/<assignment-slug>/assignment.yml`.

Minimal structure:

```text
my-course/
  course.yml
  terms/
    27s1/
      term.yml
      rosters/
        section-001.csv
      assignments/
        lab04/
          assignment.yml
```

Graider currently uses roster CSV files referenced by `term.yml`. It does not
use a `roster.yml` file.

Graider may generate reviewable files later under:

```text
terms/<term-code>/plans/<assignment-slug>/
terms/<term-code>/manifests/<assignment-slug>/
terms/<term-code>/reports/<assignment-slug>/
```

## `course.yml`

`course.yml` defines course identity, GitHub defaults, repository naming,
default assignment type, default grading behavior, and report settings.

Small example:

```yaml
schema_version: 1
course:
  code: se2030
  title: Software Engineering
  repository: se2030-course-admin
github:
  organization: example-org
  repository_visibility: private
  repo_name_pattern: "{term}-{course}-{assignment}-{github_username}"
  student_permission: push
  faculty_team: faculty
  faculty_permission: admin
  grader_team: graders
  grader_permission: maintain
defaults:
  timezone: Asia/Tokyo
  assignment_type: individual
grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
reports:
  formats:
    - markdown
    - csv
    - json
```

Notes:

- Current repository visibility support is `private`.
- Current assignment type support is `individual`.
- Repository name patterns should include `{term}`, `{course}`, `{assignment}`,
  and `{github_username}`. The older `{student}` placeholder is treated as the
  GitHub username.
- Student report publishing can be configured under `reports.student_publish`,
  but the Electron UI does not publish student reports yet.

## `term.yml`

`term.yml` defines one term and points each section to its roster CSV.

```yaml
schema_version: 1
term:
  code: 27s1
  academic_year: 2027
  semester: 1
  display_name: Spring 2027
sections:
  - id: "001"
    roster: rosters/section-001.csv
```

Notes:

- `term.code` must match the folder name under `terms/`.
- Current term codes use the `YYsN` shape, such as `27s1`.
- `semester` is `1`, `2`, or `3`.

## Roster CSV

Roster files are CSV files. Required columns are:

```text
student_id,github_username,section,status
```

Example:

```csv
student_id,github_username,section,status
s1234567,octocat,001,active
s2345678,hubot,001,hold
s3456789,monalisa,001,dropped
```

Notes:

- `student_id` is the stable ID Graider uses in rows, manifests, reports, and
  filtered status checks.
- `github_username` is the student's GitHub username.
- `section` must match the section that referenced the roster.
- `status` is `active`, `hold`, or `dropped`.
- Display name and email columns are not part of the current schema.

## `assignment.yml`

`assignment.yml` defines one assignment, its template repository, target
sections, deadline metadata, and optional grading override.

```yaml
schema_version: 1
assignment:
  slug: lab04
  title: Lab 04
  type: individual
  status: active
template:
  repository: example-org/lab04-template
  branch: main
sections:
  - "001"
deadline:
  due_at: "2027-04-15T23:59:00+09:00"
  late_policy: standard
metadata:
  faculty_owner: professor
  lms_assignment_id: null
  grading_category: labs
  points: 100
grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
```

Notes:

- `assignment.slug` must match the assignment folder name.
- `assignment.status` is `draft`, `active`, `closed`, or `archived`.
- `sections` selects section IDs from `term.yml`.
- If grading is enabled, `workflow`, `artifact`, and `result_file` are required.
- Supported enabled grading modes are `preset`, `custom-workflow`, and
  `contract-only`.
- The supported preset is `java-junit-checkstyle`.
- To disable grading for one assignment, use `grading: { enabled: false }`.

## Grading Defaults And Overrides

`course.yml` can define default grading behavior. An assignment can omit
`grading` to use that default.

Course default:

```yaml
grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
```

Assignment that uses the course default:

```yaml
schema_version: 1
assignment:
  slug: lab04
  title: Lab 04
  type: individual
  status: active
template:
  repository: example-org/lab04-template
  branch: main
sections:
  - "001"
deadline:
  due_at: "2027-04-15T23:59:00+09:00"
  late_policy: standard
metadata:
  faculty_owner: professor
  lms_assignment_id: null
  grading_category: labs
  points: 100
```

Assignment override:

```yaml
grading:
  enabled: true
  mode: preset
  preset: java-junit-checkstyle
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
```

Important: an assignment-level `grading` block is a full override. It is not a
partial merge with `course.yml`. If you add `grading` to `assignment.yml`, include
all fields needed for that assignment.

The UI shows the effective resolved grading configuration on assignment detail,
grade preview, grade status, and report-related pages.

## UI Workflow

### Open A Course Folder

Register the course-admin folder that contains `course.yml`. This is read-only.
If the folder is invalid, the UI shows diagnostics instead of changing files.

Check before continuing:

- `course.yml` exists at the folder root.
- The folder contains the expected `terms/` structure.
- GitHub authentication is available if dashboard GitHub checks are needed.

### Review The Dashboard

The dashboard summarizes terms and assignments. It is read-only.

Look for:

- assignment status
- needs-attention indicators
- missing token or GitHub readiness diagnostics
- assignments that do not appear because config files are missing or invalid

### Open An Assignment

Assignment Detail is read-only. It shows the selected assignment, target
sections, roster counts, template, grading settings, reports, and diagnostics.

Check before continuing:

- the assignment targets the intended sections
- the template repository and branch are correct
- grading is enabled or disabled as intended
- diagnostics are resolved or understood

### Preview Assignment Apply

Apply Preview is read-only. It shows what Graider would create, update, skip, or
block for student repositories.

Check before continuing:

- rows say `Would create`, `Would update`, `Would skip`, `Blocked`, or `Unknown`
- there are no blockers before applying
- repository names and GitHub usernames look correct

### Confirm Assignment Apply

Confirmed apply is mutating. It can create or update student repositories,
permissions, GitHub Actions setup, manifests, and local apply state according to
the apply implementation.

Only confirm when:

- the preview has no blockers
- the target students and repositories are correct
- you are using the intended course or sandbox

### Preview Grading Dispatch

Grade Dispatch Preview is read-only. It shows which repositories would receive a
GitHub Actions grading workflow dispatch.

Check before continuing:

- grading is enabled and uses the expected workflow
- rows say `Would dispatch`, `Would skip`, `Blocked`, `Unknown`, or
  `Token required`
- workflow dispatch readiness is available

### Confirm Grading Dispatch

Confirmed grade dispatch is mutating because it starts GitHub Actions workflows
on student repositories. It does not collect results or generate reports.

Only confirm when:

- the preview has no blockers
- the workflow path and target repositories are correct
- you are ready for grading workflows to run

### Check Grading Status

Grade Status is read-only. It shows whether workflow runs are queued, in
progress, completed, missing, blocked, token-required, or unknown.

Use it to answer:

- Are grading runs still active?
- Which repositories need attention?
- Does the UI think the assignment is ready for report generation?

`readyForReport` is guidance, not a guarantee. If it is `No`, available rows are
still useful and should remain visible.

### View Faculty Report

Faculty Report runs Graider's report command and displays the faculty report
result. It may generate or refresh local report files under
`terms/<term-code>/reports/<assignment-slug>/`. In the current UI it does not
publish student reports.

Missing results, missing artifacts, missing report files, or incomplete workflow
runs are normal report states. If partial data is available, the UI should show
available rows and diagnostics.

## Safety Notes

- Preview pages are read-only.
- Confirm Apply can change repository setup and local generated state.
- Confirm Grade Dispatch starts GitHub Actions workflows.
- Grade Status is read-only and does not generate reports.
- Faculty Report may generate local report files, but it does not publish
  student reports from the UI.
- Student report publishing is deferred in the UI.
- Workflow generation UI is deferred.
- Use a sandbox course for live testing of apply or grade dispatch.

## Troubleshooting

| Issue                               | Practical checks                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Dashboard is empty                  | Confirm the selected folder contains `course.yml` and term/assignment files.                          |
| Course folder is invalid            | Check YAML syntax and required fields in `course.yml`, `term.yml`, and assignments.                   |
| Assignment does not appear          | Confirm `assignment.slug` matches its folder and the assignment is under `terms/<term>/assignments/`. |
| GitHub token missing                | Set `GRAIDER_GITHUB_TOKEN` or sign in with `gh auth login`, then refresh.                             |
| Student repository missing          | Run Apply Preview and Confirm Apply if setup has not been applied.                                    |
| Grading workflow missing            | Check `grading.workflow` and ensure the template/student repository has that workflow.                |
| Workflow dispatch unavailable       | Confirm the workflow includes `workflow_dispatch`.                                                    |
| Grade status stays queued/running   | Refresh later, then inspect the linked GitHub Actions run if it remains stuck.                        |
| Faculty report says results missing | Return to Grade Status and confirm runs are completed; check artifact/result file names.              |
| Roster errors                       | Ensure roster CSV has `student_id`, `github_username`, `section`, and `status`.                       |
| Repository names look wrong         | Check `github.repo_name_pattern` and roster `github_username` values.                                 |

## Glossary

| Term             | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Course folder    | The course-admin folder containing `course.yml` and `terms/`.                            |
| Term             | A course offering folder under `terms/`, such as `terms/27s1/`.                          |
| Roster           | A section CSV file listing student IDs, GitHub usernames, section IDs, and status.       |
| Assignment       | One assignment folder containing `assignment.yml`.                                       |
| Apply            | The action that creates or updates student repository setup and local state.             |
| Grade dispatch   | Starting the configured GitHub Actions grading workflow on student repositories.         |
| Grade status     | A read-only snapshot of grading workflow run status across target repositories.          |
| Faculty report   | The report view for course staff, including summaries, generated paths, and diagnostics. |
| Student report   | Per-student feedback intended for one student's repository; UI publishing is deferred.   |
| `readyForReport` | A conservative status hint that grading appears complete enough to try reports.          |
