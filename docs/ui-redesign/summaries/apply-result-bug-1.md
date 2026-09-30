# APPLY-RESULT-BUG-1

## User-visible reproduction

A real individual Apply created roughly forty student repositories, installed
the managed grading workflow, and generated correct Student Repository Access
Pages, but most result rows displayed `Failed` / `Unavailable`. The global
diagnostics panel repeated the same generic `github_api_error` for many rows.

## Root causes

The executor stored `created`, `updated`, and `failed` booleans per target and
gave `failed` final precedence. Any post-create error therefore erased the
truthful durable outcome. Individual result rows omitted `reason` and
`diagnostics`, even though the renderer normalizer already accepted them. The
renderer formatted a missing reason as `Unavailable` and rendered the combined
command diagnostics globally without distinguishing repository-scoped errors.

Octokit normalization also discarded HTTP status and safe response message
context. Apply converted GitHub errors without adding the plan operation or
repository/student identity.

## Durable repository outcome model

Per-target bookkeeping now records successful repository creation, successful
durable update work, accumulated target diagnostics, and the plan reason. Final
status precedence is:

```text
created -> created
else updated -> updated
else target error -> failed
else skipped
```

Error state no longer overwrites `created` or `updated`. The top-level command
still becomes `partial_success` or `failure` under the established command
semantics, and historical operation counters remain unchanged.

Stable individual-row reasons are:

```text
repository_created
repository_created_with_issues
repository_updated
repository_updated_with_issues
repository_apply_failed
repository_apply_skipped
repository_apply_blocked
```

Lifecycle reasons such as `student_status_dropped` and `student_status_hold`
remain intact when supplied by the plan.

## Per-target diagnostics

Every diagnostic emitted while an individual target operation runs is attached
to that target result row. Apply's shared context helper adds safe fields:

```text
operationType
repositoryName
student_id
github_username
section
teamSlug (team operations)
workflowPath (workflow operations)
```

The original warning/error arrays and combined JSON diagnostics remain present;
the row association is additive rather than destructive.

## GitHub API error context

`GitHubClientError` now has optional `statusCode`. Octokit populates it for HTTP
responses and preserves existing auth, permission, rate-limit, API, network,
and timeout classifications. A short response `message` is accepted only from
the structured GitHub response field, normalized to one line, capped at 120
characters, and passed through existing token redaction. Headers, response
bodies, request payloads, credentials, cookies, and signed URLs are not copied.

Representative display text is:

```text
GitHub API request failed (HTTP 404: Not Found).
```

## Retry / fresh-repository propagation investigation

The code confirms that `getActionsState` uses Octokit's non-nullable Actions
permissions endpoint immediately after repository creation. A fresh-repository
404 therefore becomes a retryable `api_error`; nullable repository,
collaborator, team, and workflow reads handle 404 differently. This makes
Actions settings propagation a strong code-supported hypothesis, but it remains
unproven without a live failing response from GitHub.

Fresh-repository Actions reads now use the existing retry helper with a bounded
maximum of four attempts. Production backoff remains the existing 250 ms
initial delay with multiplier 2: 250 ms, 500 ms, then 1000 ms, or 1750 ms total
sleep before exhaustion. Existing repositories and all other operations keep
their established three-attempt behavior. No 404 or 422 is globally ignored,
and exhaustion remains a reported row issue.

Tests simulate three initial Actions 404 errors followed by success, and four
404 errors followed by exhaustion. The recovered case creates once and returns
a clean `created` row. The exhausted case remains `created`, retains the
manifest record, reports `enable_actions` plus HTTP 404 on the row, and
converges on rerun without recreation.

## UI result presentation

The UI derives **Created with issues** or **Updated with issues** when a durable
success row has error diagnostics. Clean rows display **Created** / **Repository
created** or **Updated** / **Repository updated**. Actual pre-success failures
remain **Failed** with `repository_apply_failed` and their operation diagnostic.
Older rows without `reason` or `diagnostics` remain parseable and receive a safe
status-derived reason instead of naturally displaying `Unavailable`.

Repository summaries are derived from the same displayed rows, so post-create
issues no longer reduce the created count. A second clause reports the number
of created/updated rows with follow-up issues.

## Global diagnostic de-duplication

Repository-, student-, or group-scoped diagnostics are displayed primarily on
their row and omitted from the global panel. A compact note reports how many
repository rows have scoped issues. Diagnostics without target identity,
including global auth/configuration blockers, remain global. Raw command JSON
is unchanged and retains all diagnostics.

## Recovery and manifest safety

Repository creation is checkpointed before collaborator, team, Actions, or
workflow work as before. Post-create failures do not remove identity, baseline,
or unrelated manifest records. Tests cover collaborator, Actions, workflow,
and manifest-write failures, and prove reruns do not recreate tracked
repositories. Grade-preview recovery still does not claim a successfully
created repository is missing.

## Tests

Coverage was added or strengthened for durable create/update precedence,
collaborator failure and rerun, Actions propagation recovery/exhaustion,
workflow verification recovery, true creation failure, existing-repository
update/no-update failures, per-row JSON fields, old payload compatibility,
unknown status fallback, summary counts, row presentation, operation labels,
global diagnostic filtering, GitHub 401/403/429/404/422/500/network
normalization, redaction, retry behavior, and group Apply regressions.

## Validation

Focused backend validation passed 154 tests across 10 files. Focused renderer
validation passed 100 tests across 4 files.

| Command                            | Result                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                | Passed                                                                                                                                           |
| `npm run lint`                     | Passed                                                                                                                                           |
| `npm run format:check`             | Passed                                                                                                                                           |
| `npm test`                         | Passed — 1,106 passed and 1 skipped across 122 files                                                                                             |
| `npm run build`                    | Passed                                                                                                                                           |
| `npm run audit`                    | Passed the configured high-severity gate; npm reported 1 low and 2 moderate development-tool advisories in Vitest/`@vitest/mocker` and `esbuild` |
| `npm --prefix ui run typecheck`    | Passed                                                                                                                                           |
| `npm --prefix ui run format:check` | Passed                                                                                                                                           |
| `npm --prefix ui test`             | Passed — 1,112 passed across 146 files                                                                                                           |
| `npm --prefix ui run build`        | Passed with Vite's existing large-chunk advisory                                                                                                 |

The first full backend run was launched concurrently with the full UI suite,
both builds, and formatting. Four existing Git/subprocess-heavy files hit their
5-second/60-second timeouts under that contention. All four passed on their
first isolated diagnostic runs (58 tests), and the required unmodified full
backend command then passed by itself with the counts above. No Apply assertion
failed.

## Manual live retest

Live acceptance is now partially documented by a successful plain-Java
assignment run using the newly generated managed workflow, without requiring
workflow replacement. This confirms that a fresh managed-workflow deployment
can complete successfully through the real course workflow. It does not claim
that a deliberately induced post-creation GitHub failure was observed live;
the durable row status/reason, operation type, HTTP status, retry count, and
diagnostic handling remain covered by local tests.

## Backlog

ITEM-48 is resolved. ITEM-36 was not started.

## Deferred / non-goals

No bulk executor or concurrency redesign, group Apply redesign, global 404/422
suppression, grading preset/workflow change, roster-parser convergence,
assignment-setup change, comment-library work, roster-manager work, or grading
evidence schema change is included.

## Next step

The successful plain-Java run closes the managed-workflow Apply smoke gap.
Consider ITEM-36 only after the remaining documentation and validation work;
the live failure-injection path is not a prerequisite for the already-resolved
code item.
