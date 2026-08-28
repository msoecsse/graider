# No-Grading Assignment

Use this example when Graider should manage repositories and access, but
automated grading happens elsewhere or does not happen at all.

No-grading assignments are useful for:

- manual review assignments
- design documents
- project milestones
- presentations
- participation or setup tasks
- assignments graded directly in an LMS

For `grading.enabled: false`:

- `validate` works without workflow, artifact, or result-file settings
- `apply` can still create repositories and permissions
- `grade` is a no-op with `not_configured` status
- `report` produces no-grading report rows
- `workflow generate` does not generate a `grade.yml`
- student reports may still be published when configured

In short, grade is a no-op, and workflow generate does not generate a workflow.

This example intentionally has no `.github/workflows/grade.yml` and no expected
`grading-results.json`.

Student report publishing is configured at the course level. See
`course-reports-snippet.yml` for a Graider-generated student report publishing
example.
