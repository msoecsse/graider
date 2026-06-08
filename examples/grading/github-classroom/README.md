# GitHub Classroom Autograder Integration

Use this example when an existing GitHub Classroom autograder workflow should
also produce Graider-compatible results.

GitHub Classroom step outputs are not Graider statuses. Do not use
`outputs.result` directly as a `passed` / `failed` / `skipped` value. Instead,
map each grading step outcome to Graider's closed vocabulary:

```text
success -> passed
failure -> failed
cancelled -> failed
skipped -> skipped
```

The example workflow uses the step outcome from a placeholder Classroom grading
step and writes `graider-output/grading-results.json`. Replace the placeholder
command with your real Classroom autograder step or course-owned action.

No real Classroom IDs, URLs, tokens, or secrets are included in this example.
