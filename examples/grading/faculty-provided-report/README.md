# Faculty-Provided Student Report

Use this example when a grading workflow creates custom student-facing feedback
and Graider should publish that exact file to the student's repository.

The workflow writes:

```text
graider-output/grading-results.json
graider-output/student-report.md
```

and uploads both files in the `grading-results` artifact. The course-level
`student_publish` config in `course-reports-snippet.yml` tells Graider to copy
`graider-output/student-report.md` to:

```text
grading/report.md
```

Graider copies the student report without parsing it, rewriting it, or using it
for faculty summaries. `grading-results.json` remains the faculty summary source
of truth. The faculty workflow controls the student-facing content and is
responsible for ensuring it contains only the target student's feedback.

The configured `source_file` must exist inside the configured artifact, and
`destination_file` controls the path published in the student repository.
