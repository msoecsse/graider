# GitHub REST API version pin

## Summary

Live workflow dispatch emitted an Octokit warning about the GitHub REST API
version. The warning concerns the REST API version, not `workflow_dispatch`
itself.

Graider now explicitly targets GitHub REST API version `2026-03-10` through
centralized request defaults on the production Octokit client in
`src/github/octokit-github-client.ts`. Injected Octokit-like test clients are
unchanged, and artifact redirect downloading remains covered by the existing
tests.

No dependency upgrade or package-file change was made.

## Validation

- Focused GitHub-client tests: 41 passed.
- Root typecheck, lint, format check, full tests (1,115 passed, 1 skipped),
  and build: passed.
- UI typecheck, format check, full tests (1,097 passed, 25 skipped), and
  build: passed.
- `npm audit --audit-level=high`: unable to query the npm registry because
  `registry.npmjs.org` was unavailable; dependencies were not modified.

Later live workflow dispatches were completed during workflow acceptance, but
the validation record does not include a specific observation that the
post-fix warning was absent. This summary therefore does not claim the warning
is gone; future dispatch logs can verify that opportunistically.

ITEM-36 remains the next planned engineering slice.
