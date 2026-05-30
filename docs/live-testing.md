# Live GitHub Testing

Normal tests do not call GitHub and do not require GitHub credentials. They use `FakeGitHubClient`.

Live tests are optional, explicitly gated, and sandbox-only.

## Run Command

```bash
npm run test:live
```

Without the required environment variables, live tests skip cleanly.

## Required Gates

```text
GRAIDER_RUN_LIVE_GITHUB_TESTS=true
GRAIDER_GITHUB_TOKEN or GITHUB_TOKEN
GRAIDER_LIVE_ORG
GRAIDER_LIVE_TEMPLATE_REPO
GRAIDER_LIVE_TEMPLATE_BRANCH
GRAIDER_LIVE_SANDBOX_REPO_PREFIX
GRAIDER_LIVE_TEST_USER
GRAIDER_LIVE_FACULTY_TEAM
GRAIDER_LIVE_GRADER_TEAM
```

Destructive live tests are skipped unless this additional gate is set:

```text
GRAIDER_RUN_LIVE_DESTRUCTIVE_TESTS=true
```

## Safety Rules

- Use a sandbox organization or sandbox repository set only.
- Do not point live tests at production course repositories.
- Use a sandbox repo prefix that clearly identifies generated test repositories.
- Review created repositories manually after test runs if destructive tests are enabled.
- Do not print or commit token values.
- Keep normal CI free of live-test commands.

## Cleanup

Live tests may create or update sandbox repositories when destructive gates are enabled. Cleanup is intentionally manual for MVP so test operators can inspect what happened before removing sandbox resources.
