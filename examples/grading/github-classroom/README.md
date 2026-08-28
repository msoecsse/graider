# GitHub Classroom Autograder Integration

Use this example when an existing GitHub Classroom autograder workflow should
also produce Graider-compatible results.

GitHub Classroom `outputs.result` values are base64-encoded Classroom JSON
payloads, not Graider statuses. Do not write `outputs.result` directly into
`grading-results.json`. Decode it, read the internal Classroom `status`, and map
that value to Graider's closed vocabulary:

```text
pass -> passed
fail -> failed
skip -> skipped
success -> passed
failure -> failed
cancelled -> failed
skipped -> skipped
```

The example workflow prefers the decoded Classroom payload and falls back to the
step outcome only when the payload is missing or cannot be parsed. It writes
only `passed`, `failed`, or `skipped` into `graider-output/grading-results.json`.
Replace the placeholder command with your real Classroom autograder step or
course-owned action.

No real Classroom IDs, URLs, tokens, or secrets are included in this example.
