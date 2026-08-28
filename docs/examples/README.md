# Graider Example Course Files

These files show a minimal sandbox course-admin setup:

- `course.yml`: course-level defaults and GitHub settings (grading is optional)
- `term.yml`: term identity and section roster paths
- `assignment.yml`: one configured assignment; template, grading, deadline, and
  metadata blocks are optional
- `section-001.csv`: roster CSV shape
- `grading-results.json`: normalized grading result shape
- `workflow.yml`: minimal grading workflow with `workflow_dispatch`

The roster example uses the canonical four fields: `student_id`,
`github_username`, `section`, and `status`. Former seven-column rosters are
accepted only during import and are saved as this four-field form. Copy these
into a sandbox course-admin repository and update organization, repository,
team, user, and assignment values before running live GitHub commands.

Suggested layout:

```text
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
