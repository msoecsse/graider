# Graider

Graider is a CLI-first TypeScript/Node tool for managing GitHub-based course assignments from a course-admin repository.

The MVP focuses on deterministic, auditable assignment administration:

- validate course, term, assignment, roster, and GitHub readiness inputs
- plan assignment repository setup before mutation
- apply safe additive repository, permission, and Actions setup
- maintain YAML manifests and timestamped JSON plans
- dispatch configured grading workflows manually
- generate local faculty and student reports
- optionally publish each student's own report back to that student's repository

## MVP Scope

Implemented MVP commands:

| Command             | Status                                                              |
| ------------------- | ------------------------------------------------------------------- |
| `validate`          | Validate local config, rosters, and GitHub readiness.               |
| `plan`              | Generate a timestamped JSON plan file.                              |
| `apply`             | Execute safe additive provisioning and update the manifest.         |
| `grade`             | Dispatch configured grading workflows for selected active students. |
| `report`            | Generate local reports and optionally publish student reports.      |
| `workflow generate` | Generate a local preset grading workflow file.                      |
| `archive`           | Reserved command shell; not supported in MVP.                       |
| `remove-access`     | Reserved command shell; not supported in MVP.                       |

Known MVP exclusions:

- actual archive behavior
- actual remove-access behavior
- group assignments
- LMS integration
- hidden grading behavior
- feedback pull requests
- automatic repository adoption

## Setup

Graider uses Node.js 24 and npm.

```bash
npm ci
npm run check
npm run build
```

During development:

```bash
npm run dev -- validate terms/27s1/assignments/lab04/assignment.yml
```

After build:

```bash
node dist/index.js validate terms/27s1/assignments/lab04/assignment.yml
```

For local package-bin testing:

```bash
npm link
graider validate terms/27s1/assignments/lab04/assignment.yml
```

## Course-Admin Layout

Course grading is optional. Assignment template, deadline, metadata, and
grading blocks are also optional; when present, their existing validation rules
still apply. The canonical roster CSV has exactly `student_id`,
`github_username`, `section`, and `status`; former seven-column rosters are
accepted only for import and are saved in canonical form.

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
    plans/
      lab04/
        plan-<timestamp>.json
    manifests/
      lab04/
        manifest.yml
    reports/
      lab04/
        faculty-summary.json
        faculty-summary.csv
        faculty-summary.md
        students/
          001/
            s1234567.md
```

User-authored files are `course.yml`, `term.yml`, assignment YAML files, and roster CSV files. Graider-generated files live under `plans/`, `manifests/`, and `reports/`.

## Commands

For UI integrations and automation, use `--json` output instead of scraping
human-readable command text. See the
[CLI JSON contract](docs/cli-json-contract.md).

Validate:

```bash
graider validate terms/27s1/assignments/lab04/assignment.yml
graider validate terms/27s1/assignments/lab04/assignment.yml --json
```

Plan:

```bash
graider plan terms/27s1/assignments/lab04/assignment.yml
graider plan terms/27s1/assignments/lab04/assignment.yml --json
```

Apply safe additive setup:

```bash
graider apply terms/27s1/assignments/lab04/assignment.yml --yes
```

`apply` refuses blocked plans, requires confirmation unless `--yes` is provided, does not delete repositories, does not remove access, and does not downgrade permissions.

Grade:

```bash
graider grade terms/27s1/assignments/lab04/assignment.yml --all
graider grade terms/27s1/assignments/lab04/assignment.yml --section 001
graider grade terms/27s1/assignments/lab04/assignment.yml --student-id s1234567
graider grade terms/27s1/assignments/lab04/assignment.yml --github-username octocat
```

Report:

```bash
graider report terms/27s1/assignments/lab04/assignment.yml
graider report terms/27s1/assignments/lab04/assignment.yml --publish-student-reports
```

`--publish-student-reports` supports Graider-generated reports and
artifact-based faculty-provided reports configured under
`reports.student_publish`.

Generate a local preset grading workflow:

```bash
graider workflow generate terms/27s1/assignments/lab04/assignment.yml
graider workflow generate terms/27s1/assignments/lab04/assignment.yml --output /path/to/grade.yml
```

`workflow generate` currently supports `grading.mode: preset` with
`grading.preset: java-junit-checkstyle`. It writes only to the local filesystem
and does not overwrite existing files unless `--force` is provided.

Assignments with `grading.enabled: false` are supported for repository
management and reporting. `grade` is a no-op success for those assignments, and
`workflow generate` fails clearly instead of producing a workflow.

Unsupported MVP command shells:

```bash
graider archive terms/27s1/assignments/lab04/assignment.yml
graider remove-access terms/27s1/assignments/lab04/assignment.yml
```

Both return `not_supported_in_mvp`.

## GitHub Token Setup

Real GitHub operations use the Octokit-backed `GitHubClient`. Tokens are read from environment variables in this order:

1. `GRAIDER_GITHUB_TOKEN`
2. `GITHUB_TOKEN`

Never commit tokens. See [GitHub token permissions](docs/github-token-permissions.md) for operation-specific guidance.

## Development Commands

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run audit
```

Normal tests use `FakeGitHubClient` and do not require GitHub credentials. Production GitHub
operations require `GRAIDER_GITHUB_TOKEN` (or `GITHUB_TOKEN` as a fallback); the fake client is
test infrastructure only.

Live GitHub tests are optional and sandbox-only:

```bash
GRAIDER_RUN_LIVE_GITHUB_TESTS=true npm run test:live
```

See [live testing](docs/live-testing.md) before running live tests.

## More Documentation

- [Runtime and CI](docs/runtime.md)
- [Codex development contract](docs/codex-development-contract.md)
- [Codex backend JSON command contract](docs/codex-backend-json-command-contract.md)
- [Codex Electron UI contract](docs/codex-electron-ui-contract.md)
- [Codex prompt template](docs/codex-prompt-template.md)
- [GitHub token permissions](docs/github-token-permissions.md)
- [CLI JSON contract](docs/cli-json-contract.md)
- [Faculty CLI user guide](docs/faculty-cli-user-guide.md)
- [Faculty UI user guide](docs/faculty-ui-user-guide.md)
- [Electron assignment detail developer guide](docs/electron-assignment-detail-dev.md)
- [Electron packaging guide](docs/electron-packaging.md)
- [Electron release readiness guide](docs/electron-release-readiness.md)
- [Assignment apply preview command](docs/apply-preview-command.md)
- [Grading result contract](docs/grading-result-contract.md)
- [Generated files](docs/generated-files.md)
- [Error and warning catalog](docs/error-warning-catalog.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Examples](docs/examples/README.md)
- [Reusable grading examples](examples/grading/README.md)
