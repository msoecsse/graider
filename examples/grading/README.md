# Graider Grading Examples

These examples are copyable starting points for course administrators who want
to use Graider's reusable grading contract. The examples use fake course data,
fake template repositories, and no secrets.

The examples keep `assignment.yml` files compatible with the current assignment
schema. Student report publishing is configured in `course.yml`, so examples
that publish reports include a separate `course-reports-snippet.yml` snippet
instead of placing `reports` in `assignment.yml`.

## Decision Guide

| Example                                                              | Use When                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Java / JUnit / CheckStyle preset](java-junit-checkstyle/README.md)  | Graider's built-in Java preset matches the assignment.             |
| [Custom command workflow](custom-command/README.md)                  | Faculty own the workflow commands but want Graider reports.        |
| [GitHub Classroom integration](github-classroom/README.md)           | A Classroom autograder workflow should also emit Graider results.  |
| [Contract-only workflow](contract-only/README.md)                    | External course infrastructure writes Graider's result contract.   |
| [Faculty-provided student report](faculty-provided-report/README.md) | A workflow creates custom student feedback that Graider publishes. |
| [No-grading assignment](no-grading/README.md)                        | Graider manages repositories while grading happens elsewhere.      |

## Required Contract

Automated grading workflows should upload a GitHub Actions artifact named:

```text
grading-results
```

The artifact should contain:

```text
grading-results.json
```

The result file must use Graider's result contract:

```json
{
  "schema_version": 1,
  "status": "passed",
  "checks": [
    {
      "name": "CheckStyle",
      "status": "passed"
    }
  ]
}
```

Allowed statuses are `passed`, `failed`, and `skipped`.

## Student Report Publishing

Graider supports these configured student report publishing modes:

- `graider-generated`: Graider renders the student report and publishes it.
- `faculty-provided`: Graider copies a configured file from the grading artifact.
- `both`: Graider publishes both report types to separate destinations.
- `disabled`: no student report publishing.

Faculty-provided reports are copied as-is. Graider does not parse, redact, or
modify the report content, and `grading-results.json` remains the source of truth
for faculty summaries.

## What `validate` Can Prove

For grading-enabled assignments, `validate` checks that required grading config
fields exist, the configured workflow file can be found locally, and the workflow
declares `workflow_dispatch`.

For custom and contract-only workflows, `validate` does not fully prove that a
workflow will upload the configured artifact, write valid JSON, or run meaningful
tests. Runtime `report` diagnostics still cover missing artifacts, missing result
files, and invalid grading result JSON.
