# Grading Result Contract

## 1. Purpose

Graider standardizes the grading output contract, not the grading implementation.
The contract gives Graider one reliable way to dispatch workflows, find grading
artifacts, parse results, generate faculty summaries, and publish student-facing
reports while allowing faculty to choose the grading system that fits an
assignment.

Faculty may grade with:

- Java / JUnit / CheckStyle
- JavaFX
- Python / pytest
- JavaScript / npm
- C / C++
- Maven
- Gradle
- GitHub Classroom autograders
- custom shell scripts
- custom GitHub Actions workflows
- no automated grading workflow

This document defines the stable contract future implementation slices should
use. Graider currently accepts and validates the configuration modes documented
below. Graider can generate a local `java-junit-checkstyle` preset workflow.
Faculty-provided report publishing and expanded no-grading command behavior are
implemented in later slices.

## 2. Standard Artifact Contract

The default automated grading artifact contract is:

```yaml
grading:
  artifact: grading-results
  result_file: grading-results.json
```

Automated grading workflows must upload a GitHub Actions artifact named:

```text
grading-results
```

The artifact must contain:

```text
grading-results.json
```

Assignment configuration may explicitly override the artifact name and result
file path. When overrides are used, Graider should use the configured values for
workflow validation, artifact lookup, result parsing, and report generation.

## 3. Grading Result JSON Schema

The MVP grading result file uses this JSON shape:

```json
{
  "schema_version": 1,
  "status": "passed",
  "checks": [
    {
      "name": "CheckStyle",
      "status": "passed"
    },
    {
      "name": "Unit Tests",
      "status": "passed"
    }
  ]
}
```

Allowed overall `status` values:

- `passed`
- `failed`
- `skipped`

Allowed `checks[].status` values:

- `passed`
- `failed`
- `skipped`

Graider rejects invalid JSON, unsupported schema versions, malformed check
entries, and status values outside the contract vocabulary. `grading-results.json`
is the source of truth for faculty summaries.

## 4. Supported Grading Modes

These grading modes are the stable configuration model for reusable grading.
Graider validates these modes. `workflow generate` currently supports the
`java-junit-checkstyle` preset only; it does not change workflow dispatch
behavior.

### `preset`

Graider generates or supplies a known-compatible workflow for a supported
assignment pattern. Presets are intended for common course workflows where
faculty want convention over hand-written Actions logic.

```yaml
grading:
  enabled: true
  mode: preset
  preset: java-junit-checkstyle
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
```

Generate the current preset workflow locally:

```bash
graider workflow generate terms/27s1/assignments/lab04/assignment.yml
```

Default output path:

```text
terms/27s1/generated-workflows/lab04/grade.yml
```

The command writes only to the local filesystem and refuses to overwrite an
existing file unless `--force` is provided.

### `custom-workflow`

Faculty provide the workflow, and Graider provides or documents compatible
result-writing steps. Faculty control setup, dependencies, commands, and grading
logic while Graider validates the workflow against the result contract.

```yaml
grading:
  enabled: true
  mode: custom-workflow
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
```

### `contract-only`

Faculty own the entire workflow and result-writing implementation. Graider only
requires the configured workflow to produce the expected artifact and valid
result file.

```yaml
grading:
  enabled: true
  mode: contract-only
  workflow: .github/workflows/grade.yml
  artifact: grading-results
  result_file: grading-results.json
```

### `no-grading`

Automated grading is disabled for the assignment. Repository management and
student report publishing can still be useful for manual review, milestones,
presentations, participation tasks, or assignments graded outside Graider.

```yaml
grading:
  enabled: false
```

## 5. No-Grading Assignment Behavior

Automated grading must be optional. Planned no-grading behavior:

```text
validate -> succeeds without requiring workflow/artifact/result_file
apply -> creates repos and permissions normally
grade -> returns not_configured or no-op
report -> generates reports with grading status not_configured
publish -> may still publish Graider-generated or faculty-provided reports if configured
```

No-grading assignments should not require workflow, artifact, or result-file
configuration unless another configured feature, such as faculty-provided report
publishing from an artifact, needs an artifact source.

## 6. Student Report Publishing Modes

These student publishing modes are the stable configuration model for student
report publishing. Graider validates these modes, but faculty-provided report
publishing behavior is implemented in a later slice. Published reports must
contain only the target student's information and must be written only to that
student's repository.

### `graider-generated`

Graider renders the student report from its collected repository and grading
state, then publishes it to the configured destination.

```yaml
reports:
  student_publish:
    enabled: true
    mode: graider-generated
    destination_file: grading/report.md
```

### `faculty-provided`

Graider finds a faculty-provided student report file and publishes it without
parsing or modifying the content.

```yaml
reports:
  student_publish:
    enabled: true
    mode: faculty-provided
    artifact: grading-results
    source_file: student-report.md
    destination_file: grading/report.md
```

### `both`

Graider publishes its generated report and a faculty-provided report to separate
configured destinations.

```yaml
reports:
  student_publish:
    enabled: true
    mode: both
    graider_report_destination: grading/graider-report.md
    faculty_report_source: graider-output/student-report.md
    faculty_report_destination: grading/report.md
```

### `disabled`

Student report publishing is disabled.

```yaml
reports:
  student_publish:
    enabled: false
    mode: disabled
```

## 7. Faculty-Provided Student Reports

Graider does not generate, parse, or modify faculty-provided student report
content. For faculty-provided student reports, Graider only:

- finds the configured report file
- verifies that it exists
- publishes it to the configured destination
- ensures the report goes only to the correct student repository
- reports clear diagnostics if the source file is missing

Faculty-provided reports are student-facing feedback documents. They are not the
source of truth for faculty summaries; `grading-results.json` remains the source
of truth for faculty reporting.

## 8. Required Workflow Triggers

Automated grading workflows compatible with Graider should support:

```yaml
on:
  - push
  - repository_dispatch
  - workflow_dispatch
```

`workflow_dispatch` is required for `graider grade` because Graider dispatches the
configured workflow through the GitHub Actions API. `push` and
`repository_dispatch` are recommended compatibility triggers for common faculty
and external-tool workflows.

## 9. Diagnostics

Graider diagnostics should distinguish these categories:

- missing workflow
- workflow dispatch failed
- workflow completed but artifact missing
- artifact found but result file missing
- result file found but invalid
- invalid status vocabulary
- grading not configured
- faculty-provided report missing
- student report publish failed
- student report published

Exact diagnostic codes should continue to live in the error and warning catalog.
Future slices should add or refine codes there when implementation needs stable
machine-readable diagnostics.

## 10. Implementation Notes for Future Slices

Future implementation slices will:

- add additional preset workflows
- validate workflow compatibility
- add reusable result writer
- support faculty-provided report publishing
- support no-grading assignment flows
- add examples

Implementation should preserve Graider's existing safety constraints: normal
tests must not require live GitHub credentials, published student reports must
not include other students' data, and runtime behavior should change only in the
slice that explicitly implements that behavior.
