# Generated Files

Graider generated files are intended to be reviewable, deterministic, and safe to commit when they contain expected course-admin data. They must not contain GitHub tokens or raw workflow logs.

## Plans

Path:

```text
terms/<term-code>/plans/<assignment-slug>/plan-<timestamp>.json
```

Plans are timestamped JSON review artifacts produced by `graider plan` and may also be produced before `apply` execution. They include assignment identity, source file hashes, an input fingerprint, planned operations, warnings, and errors.

Plans are safe to commit if the course-admin repository is allowed to contain roster identifiers and GitHub usernames.

## Manifests

Path:

```text
terms/<term-code>/manifests/<assignment-slug>/manifest.yml
```

Manifests are durable generated-state records. They include source hashes, template identity, repository records, permission state, Actions state, lifecycle state, operation history, warnings, and errors.

Apply writes a new assignment manifest before its first repository mutation.
After GitHub returns and Graider observes a newly created repository, Apply
checkpoints that repository identity before resolving template-sync baselines,
changing permissions, enabling Actions, deploying a managed workflow, or
verifying workflows. Later failures therefore leave a resumable tracked record
instead of an untracked remote repository.

Manifests are safe to commit under the same privacy policy as rosters and faculty reports.

## Faculty Reports

Paths:

```text
terms/<term-code>/reports/<assignment-slug>/faculty-summary.json
terms/<term-code>/reports/<assignment-slug>/faculty-summary.csv
terms/<term-code>/reports/<assignment-slug>/faculty-summary.md
```

Faculty reports include one row per included roster student, repository state, grading status, scores/checks when available, and warning/error codes. They do not include raw workflow logs.

Faculty reports contain student data and should be stored only where course staff access is appropriate.

## Local Student Reports

Path:

```text
terms/<term-code>/reports/<assignment-slug>/students/<section>/<student_id>.md
```

Each local student report contains only that student's data. It includes assignment identity, repository status, grading status, check results when available, and warning/error codes.

## Generated Workflows

Path:

```text
terms/<term-code>/generated-workflows/<assignment-slug>/grade.yml
```

`graider workflow generate` writes a local review/export copy of the canonical
GitHub Actions workflow. The first supported preset is
`java-junit-checkstyle`. The command itself remains local-only and does not
write to GitHub or mutate template repositories.

For an assignment whose effective grading configuration enables that preset,
Assignment Apply creates or updates Graider's managed workflow at
`.github/workflows/grade.yml` in each applicable student repository. A template
repository is not required. Subsequent Apply runs update a recognized
Graider-managed workflow, perform no write when it is already canonical, and
preserve a differing workflow that does not carry Graider's ownership marker.
The local generation command remains useful for review and export and refuses
to overwrite an existing local file unless `--force` is used.

The canonical workflow ignores pushes whose only changed path is its own
`.github/workflows/grade.yml`, so an Apply create/update commit does not start a
meaningless grading run. Pushes that also contain source changes continue to
run grading; repository and manual dispatch triggers remain available.

Copyable workflow and assignment examples are maintained under
[`examples/grading/`](../examples/grading/README.md). Those files are
documentation examples, not generated command output.

Generated preset workflows are self-contained. During a workflow run, the
workflow writes a helper script at:

```text
.graider/write-grading-result.py
```

The helper uses only the Python standard library, maps GitHub Actions step
outcomes to Graider result statuses, decodes GitHub Classroom base64
`outputs.result` payloads when present, and writes:

```text
graider-output/grading-results.json
```

The workflow uploads that file as the configured grading artifact. Student
repositories do not need Graider or Graider npm dependencies installed.

## Published Student Repository Files

Paths in each student repository:

```text
grading/report.html
grading/results.json
```

The implicit destination for a Graider-generated standalone grading report is
`grading/report.html`. Existing explicitly configured report destinations are
not migrated or rewritten.

Publishing is always explicit. The CLI uses
`graider report --publish-student-reports`; the grading workspace uses the
trusted Publish Report or selective Publish Completed Reports actions after
grading is Complete. Published files contain only the target student's
report/result data. Faculty summaries and other students' data must not be
published to student repositories.

For no-grading assignments, Graider-generated student reports still include
assignment and repository metadata and state that automated grading is not
configured. They do not include fake scores or checks.

## UI Fixture Outputs

Path:

```text
examples/ui/*.json
```

UI fixture outputs are fake, safe, representative CLI JSON responses for future
frontend work. They follow the [CLI JSON contract](cli-json-contract.md) and are
not generated by normal Graider commands.

## Logs

Graider MVP does not create committed log files. If local logs are added later, they should remain local-only and must redact token-like values.

## Retention Notes

- Plan files are timestamped and retained as review artifacts.
- Report paths are overwritten on rerun; history is provided by Git if committed.
- Manifest history is represented by Git history and manifest operation history.
- Generated files should not contain secrets.
