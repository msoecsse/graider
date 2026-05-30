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

`apply` is additive. It does not delete repositories, archive repositories, remove collaborators, or downgrade permissions.

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

### `report --publish-student-reports`

Needed capabilities:

- all local report read capabilities
- write repository files through the GitHub Contents API for each student repository

Graider writes only:

```text
grading/report.md
grading/results.json
```

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

| Diagnostic code            | Meaning                                   | Likely fix                                                                    |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `github_auth_missing`      | No token was available.                   | Set `GRAIDER_GITHUB_TOKEN` or `GITHUB_TOKEN`.                                 |
| `github_auth_failed`       | GitHub rejected the token.                | Check token value, expiration, and organization approval.                     |
| `github_permission_denied` | Token lacks permission for the operation. | Add the required organization/repository permission or use an approved token. |
| `github_rate_limited`      | GitHub rate limit prevented completion.   | Wait for reset or reduce concurrent/manual activity against the token.        |
| `github_api_error`         | GitHub returned an API/server error.      | Retry later; inspect GitHub status if persistent.                             |
| `github_network_error`     | Network access to GitHub failed.          | Check network, proxy, DNS, and CI egress policy.                              |
