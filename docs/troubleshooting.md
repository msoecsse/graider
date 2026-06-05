# Troubleshooting

## Node Version Mismatch

Graider expects Node.js 24 for the current MVP package. Check:

```bash
node --version
```

Use the Node version specified by `package.json`.

## npm Install Problems

Use npm, not pnpm or yarn:

```bash
npm ci
```

If installation fails, remove local `node_modules` and retry `npm ci`.

## ESLint or WebStorm Differences

Use repository scripts as the source of truth:

```bash
npm run lint
npm run format:check
```

Editor integrations may use different TypeScript or ESLint versions if not configured to use workspace dependencies.

## Missing `course.yml`

Graider discovers the course-admin repository root by walking upward until it finds `course.yml`. Run commands from the repository root or a subdirectory inside it.

Diagnostic: `missing_required_file`

## Malformed YAML

Check indentation, colons, quotes, and list syntax in `course.yml`, `term.yml`, or `assignment.yml`.

Diagnostic: `invalid_yaml`

## Malformed JSON Fixtures

All `.json` files under `tests/fixtures` must parse with `JSON.parse`. Intentionally malformed JSON should use a non-`.json` extension such as `.invalid-json`.

## Missing Roster Columns

Roster CSV files must include:

```text
student_id,github_username,section,status
```

Diagnostics include `missing_required_column`, `missing_required_value`, and `invalid_roster_status`.

## GitHub Token Missing or Invalid

Set one of:

```text
GRAIDER_GITHUB_TOKEN
GITHUB_TOKEN
```

Diagnostics:

- `github_auth_missing`
- `github_auth_failed`

## GitHub Permission Denied

The token may lack organization approval, repository access, team access, Contents API write access, or Actions workflow dispatch permission.

Diagnostic: `github_permission_denied`

See [GitHub token permissions](github-token-permissions.md).

## Rate Limits

Graider normalizes GitHub rate-limit failures and honors `Retry-After` where available.

Diagnostic: `github_rate_limited`

Retry later or reduce other activity using the same token.

## Template Repository Problems

Common template diagnostics:

- `invalid_template_repository`
- `template_repository_outside_org`
- `template_repository_missing`
- `template_repository_not_template`
- `template_branch_missing`
- `template_branch_not_default`
- `template_readme_missing`

Check the configured template repository, organization, branch, template flag, and `README.md`.

## Workflow Missing or Dispatch Unsupported

`grade` requires grading to be enabled and the configured workflow to support `workflow_dispatch`.

Diagnostics:

- `grading_not_configured`
- `grading_workflow_missing`
- `workflow_dispatch_unsupported`
- `workflow_dispatch_failed`

## Reusable Grading Config Problems

Enabled grading modes are `preset`, `custom-workflow`, and `contract-only`.
Disabled grading may omit `mode` or use `mode: no-grading`. The only supported
preset in this slice is `java-junit-checkstyle`.

Common diagnostics:

- `unsupported_grading_mode`
- `missing_grading_workflow`
- `missing_grading_artifact`
- `missing_grading_result_file`
- `missing_grading_preset`
- `unsupported_grading_preset`

Student report publishing modes are `graider-generated`, `faculty-provided`,
`both`, and disabled `disabled`. This slice validates faculty-provided publishing
configuration but does not publish faculty-provided report content yet.

Common diagnostics:

- `unsupported_student_publish_mode`
- `missing_student_publish_destination`
- `missing_student_publish_source_file`
- `missing_student_publish_artifact`
- `missing_graider_report_destination`
- `missing_faculty_report_source`
- `missing_faculty_report_destination`

## Workflow Generation Problems

`graider workflow generate` currently requires:

```yaml
grading:
  enabled: true
  mode: preset
  preset: java-junit-checkstyle
```

The command writes a local workflow file, normally:

```text
terms/<term>/generated-workflows/<assignment>/grade.yml
```

It does not write to GitHub or mutate template repositories. Existing files are
not overwritten unless `--force` is provided.

Common diagnostics:

- `workflow_generation_not_configured`
- `workflow_generation_requires_preset_mode`
- `missing_grading_preset`
- `unsupported_grading_preset`
- `generated_workflow_exists`
- `workflow_generation_write_failed`

## Manifest Missing

`report` and `grade` require a manifest because they target manifest-tracked repositories.

Diagnostic: `manifest_missing`

Run `graider apply ... --yes` after reviewing a clean plan to create/update the manifest.

## Unsupported MVP Commands

`archive` and `remove-access` are reserved command shells only.

Diagnostic: `not_supported_in_mvp`

They do not archive repositories or remove student access in the MVP.
