# GitHub Token Permissions

Graider uses GitHub tokens only through the `GitHubClient` abstraction. Real GitHub access is implemented by the Octokit-backed client.

## Token Lookup

Graider reads tokens from environment variables in this order:

```text
GRAIDER_GITHUB_TOKEN
GITHUB_TOKEN
```

Do not commit tokens. Do not put tokens in course config, roster files, manifests, plans, reports, or command-line arguments.

## Token Type

Use an organization-approved token with the least privilege that supports the selected command. A fine-grained personal access token or GitHub App token may be appropriate depending on the organization's policy.

Exact permission names vary by token type and organization policy. The checklist below is conservative for MVP use.

## Permission Checklist

### `validate` and `plan`

Needed capabilities:

- read authenticated user
- read template repository metadata
- read repository branches and root files
- read organization teams by slug
- read user existence
- read existing student repository names for collision checks

### `apply`

Needed capabilities:

- all `validate`/`plan` read capabilities
- create repositories from a template
- create private repositories in the configured organization
- add collaborators
- add or update team repository permissions
- enable GitHub Actions for repositories
- read workflow metadata
- create or update Graider's managed `.github/workflows/grade.yml` for eligible
  preset grading

`apply` is additive. It does not delete repositories, archive repositories, remove collaborators, or downgrade permissions.

### Managed grading-workflow deployment

Assignment Apply writes or updates `.github/workflows/grade.yml` for effective
`enabled: true`, `mode: preset`, `preset: java-junit-checkstyle` grading. This
requires repository
Contents write authority **and** workflow-file write authority. For fine-grained
personal access tokens and GitHub App tokens, grant `Contents: write` and
`Workflows: write` for the target repositories. For classic personal access
tokens, use `repo` together with the `workflow` scope.

If that authority is missing, Apply reports
`workflow_deployment_forbidden` for the affected repository. Other GitHub
failures retain their normal diagnostics.

### `grade`

Needed capabilities:

- read manifest-tracked repositories
- read workflow metadata
- dispatch the configured workflow

### `report`

Needed capabilities:

- read manifest-tracked repositories
- read workflows and workflow runs
- read/download workflow artifacts when grading is enabled

The same read-only capability is required when Graider retrieves managed-preset
JUnit and Checkstyle evidence for an exact submission commit. For fine-grained
personal access tokens and GitHub App tokens, grant `Actions: read` for the
student repositories. Classic personal access tokens need repository access
that permits reading Actions runs and artifacts.

### `report --publish-student-reports`

Needed capabilities:

- all local report read capabilities
- write repository files through the GitHub Contents API for each student repository

Graider writes only:

```text
grading/report.html
grading/results.json
```

For a Graider-generated standalone grading report with no configured
destination, the report path is `grading/report.html`. Explicit destinations
remain unchanged.

## Live Test Tokens

Live tests are optional and must use sandbox repositories or a sandbox organization. Do not run live tests against production course repositories.

Required gate:

```text
GRAIDER_RUN_LIVE_GITHUB_TESTS=true
```

Destructive live tests require:

```text
GRAIDER_RUN_LIVE_DESTRUCTIVE_TESTS=true
```

## Common Failures

| Diagnostic code                 | Meaning                                   | Likely fix                                                                    |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `github_auth_missing`           | No token was available.                   | Set `GRAIDER_GITHUB_TOKEN` or `GITHUB_TOKEN`.                                 |
| `github_auth_failed`            | GitHub rejected the token.                | Check token value, expiration, and organization approval.                     |
| `github_permission_denied`      | Token lacks permission for the operation. | Add the required organization/repository permission or use an approved token. |
| `github_rate_limited`           | GitHub rate limit prevented completion.   | Wait for reset or reduce concurrent/manual activity against the token.        |
| `github_api_error`              | GitHub returned an API/server error.      | Retry later; inspect GitHub status if persistent.                             |
| `github_network_error`          | Network access to GitHub failed.          | Check network, proxy, DNS, and CI egress policy.                              |
| `workflow_deployment_forbidden` | Token cannot write the managed workflow.  | Grant Contents and workflow-file write authority for the target repository.   |
