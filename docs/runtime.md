# Graider Runtime and CI

Graider is a Node.js CLI built with TypeScript and npm.

## Runtime

- Node.js: current project runtime is Node.js 24, matching `package.json`.
- Package manager: npm. Use `npm ci` in CI and `npm install` only for local dependency updates.
- Git: required for normal repository checkout workflows, but Graider does not shell out to Git for MVP command behavior.
- GitHub CLI: not required. Graider reads GitHub credentials from environment variables only.

After `npm run build`, the CLI entrypoint is:

```bash
node dist/index.js <command>
```

The package bin is `graider`.

## Local Checks

Run the normal local validation set with:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run audit
```

Or run the non-build check shortcut:

```bash
npm run check
```

Normal tests use `FakeGitHubClient` and do not require GitHub credentials. Production GitHub
operations require `GRAIDER_GITHUB_TOKEN` (or `GITHUB_TOKEN` as a fallback); the fake client is
test infrastructure only.

## CI

The normal CI workflow runs:

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run audit
```

Normal CI does not run live GitHub tests and does not require a GitHub token.

## GitHub Tokens

Commands that use the real Octokit client read tokens from environment variables in this order:

```text
GRAIDER_GITHUB_TOKEN
GITHUB_TOKEN
```

Tokens are not read from command-line arguments, config files, GitHub CLI state, or global machine state.

## Live GitHub Tests

Live tests are optional and sandbox-only. They run through:

```bash
npm run test:live
```

Live tests skip unless all required gates are present:

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

Destructive live tests require the additional gate:

```text
GRAIDER_RUN_LIVE_DESTRUCTIVE_TESTS=true
```

Do not point live tests at production course organizations.

## Dependency Audit

Use:

```bash
npm run audit
```

The audit threshold is `high` for MVP CI.

## Unsupported MVP Commands

`archive` and `remove-access` are command shells only in the MVP. They parse consistently, return `not_supported_in_mvp`, and do not perform GitHub mutations.
