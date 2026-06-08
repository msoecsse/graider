# Custom Command Workflow

Use this example when faculty want to own the grading commands while still using
Graider reports. The workflow can run any course-owned command, such as
`npm test`, `pytest`, `make test`, or `./grade.sh`.

Graider only requires the artifact/result contract:

- the workflow supports `workflow_dispatch`
- the workflow uploads the configured `grading-results` artifact
- the artifact contains `grading-results.json`
- the result JSON uses `passed`, `failed`, or `skipped`

`validate` checks workflow presence and `workflow_dispatch`. It does not
statically prove that a custom command is semantically correct or that every
possible workflow path writes the artifact.

The included `grade.yml` writes a small self-contained result writer helper
during the workflow run, invokes it with the custom check step outcome, and
uploads `graider-output/grading-results.json`.
