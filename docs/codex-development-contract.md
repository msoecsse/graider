# Codex Development Contract

## Purpose

This contract defines the shared baseline for Codex work in Graider. Slice
prompts may add stricter or more specific rules, but they should not repeat
these global standards.

Use this contract for all backend, UI, test, and documentation changes.

## Required Workflow

- Read the slice prompt, this contract, and any referenced domain contract
  before editing.
- Inspect the existing implementation and docs enough to preserve current
  behavior and terminology.
- Keep changes scoped to the requested slice.
- Prefer existing helpers, patterns, validators, and test style.
- Do not change product behavior unless the prompt explicitly requests it.
- Do not weaken existing validation, diagnostics, safety guards, or tests.
- Update docs when changing a documented contract, command, UI flow, or safety
  boundary.

## Coding Standards

- Use strict TypeScript and preserve current compiler settings.
- Prefer small modular functions with explicit, typed data boundaries.
- Do not add unnecessary dependencies.
- Avoid magic numbers; use named constants.
- Do not use `break`.
- Do not use `continue`.
- Do not use `while true`.
- Do not return values from `void` methods.
- Keep command and UI contracts machine-readable where consumers depend on
  them.
- Preserve existing lint, formatting, and test conventions.

## Scope Discipline

- Do not perform unrelated refactors.
- Do not mix cleanup with feature work unless the cleanup is required for the
  slice.
- Do not introduce new commands, UI flows, scripts, storage, or dependencies
  unless the prompt explicitly asks for them.
- Do not mutate files, GitHub repositories, workflows, reports, or student data
  from read-only or preview-only work.
- Treat product behavior that affects data mutation as requiring explicit
  instructions.

## Security and Secret Handling

- Do not expose secrets in JSON output, UI output, logs, diagnostics, tests, or
  snapshots.
- Do not log, render, store, or persist GitHub tokens.
- Do not include authorization headers in diagnostics.
- Do not include raw `process.env` in diagnostics or UI output.
- Do not include raw stack traces in normal user-facing JSON or UI output.
- Never require real GitHub tokens in automated tests.
- Mock GitHub clients in automated tests.
- Do not make live GitHub calls in automated tests.

## Testing Standards

- Add or update focused tests when behavior changes.
- Keep tests deterministic and local by default.
- Mock GitHub clients and command runners instead of calling live services.
- Use fake tokens or redaction assertions when testing token behavior.
- Do not run live GitHub tests unless the user explicitly requests that
  optional workflow and the required sandbox setup is present.
- For docs-only changes, do not add tests unless a documentation safeguard is
  already part of the project pattern and is relevant.

### Efficient validation and output

- Identify changed production files and affected dependencies. During
  implementation, run new or modified tests and relevant existing regression
  tests.
- Run affected integration tests when behavior crosses service, IPC, Git,
  authorization, or persistence boundaries.
- Run typechecking, test hygiene, and appropriate lint/format checks. Build
  affected components when needed.
- Do not routinely run complete root and UI suites locally, and do not repeat
  successful unrelated tests. Make one final relevant local validation pass
  before committing.
- Existing CI remains responsible for comprehensive root/UI regression testing.
  Required CI success at the exact commit is acceptable completion evidence for
  comprehensive regression validation. Preserve Windows x64 and macOS arm64
  compatibility verification and all security, migration, and performance
  coverage.
- Investigate individual CI failures using targeted tests. Do not automatically
  repeat entire suites following unrelated changes.
- Broader local validation remains necessary for migrations, authorization,
  security-sensitive Git operations, and changes without equivalent CI
  coverage. Honor explicit task requirements for additional local validation.
- Avoid unnecessary builds, packaging, and dependency installation.
- Capture verbose test output in temporary log files where practical. Show
  concise summaries and relevant failure excerpts instead of thousands of
  passing lines.
- Preserve complete failure information for diagnosis. Never hide failures,
  warnings, or skipped tests.
- Diagnose environmental failures with focused checks before retrying expensive
  suites.
- Keep final reports concise while recording every required validation command
  and its result.

These are efficiency rules, not permission to weaken testing requirements.

### Test hygiene

Run `npm run test:hygiene` from the repository root to check root and UI test
files (`*.test.*` and `*.spec.*`, including TypeScript and TSX). The guard also
runs before root/UI `npm test` and `npm run test:watch`, as part of `npm run check`
and release validation, and in normal GitHub Actions CI.

The TypeScript syntax and binding check rejects Vitest `.skip`, `.only`, `.todo`,
disabled/focused aliases (`xit`, `xtest`, `xdescribe`, `fit`, `ftest`, `fdescribe`),
literal `skipIf(true)` / `runIf(false)`, and inline options with `skip`, `only`,
or `todo` set to `true`. It covers global declarations,
named/renamed imports, namespace imports, local aliases, computed string
properties, and chained/parameterized declarations. Comments, string contents,
and methods on unrelated bindings are not declarations. Existing dynamic
platform conditions remain supported; this static check does not evaluate
runtime conditions or replace reviewing suite summaries for zero skips.

If a test cannot pass, fix the implementation or fixture before committing.
If that cannot be completed within scope, record/reuse a blocker issue and stop
the affected work under the workflow contract. Do not skip, focus, mark todo,
delete, or weaken the test to obtain a green run. There is no guard allowlist.

## Validation Commands

For backend or shared code changes, select checks based on changed files and
their affected dependencies. Do not treat this full sequence as a routine local
requirement:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

For UI code changes, also run:

```bash
cd ui
npm run typecheck
npm test
npm run build
```

For documentation-only changes, run the lightest relevant check available,
usually:

```bash
npm run format:check
```

If a required command cannot be run, report the command, the reason, and any
remaining risk.

## Documentation Updates

- Keep reusable rules in contract docs instead of repeating boilerplate in every
  slice doc.
- Keep feature-specific behavior in feature docs such as command contracts or
  Electron developer guides.
- Cross-link docs instead of duplicating large sections.
- When changing JSON contracts, update the backend JSON command docs and any
  feature-specific command docs.
- When changing Electron boundaries, update the Electron UI contract and the
  relevant developer guide.

## Final Response Format

Slice prompts may define their own final response format. If no format is
specified, use:

```markdown
## Summary

## Files Changed

## Tests Added or Updated

## Documentation

## Validation Commands Run

## Result

## Deferred
```

In validation reporting, include each command run and whether it passed, failed,
or was skipped with a reason.

## Stop Conditions

Stop and report instead of editing when:

- The requested implementation would require a broad redesign.
- The requested change would violate an established safety boundary.
- Product behavior is ambiguous in a way that affects data mutation.
- Existing docs contradict the implementation in a way that needs product
  clarification.
- The repository already has equivalent contract docs that should be extended
  instead of creating parallel guidance.

## Permanent migration regression validation

Changes affecting schemas, migration, course management, Git transactions,
authorization or reconciliation must run `npm run test:migration` from the root,
in addition to scope-required root/UI validation. Both native CI jobs (macOS arm64
and Windows x64) must pass before merging or releasing affected changes. This
suite remains required after Phase 9. See
[coverage and failure diagnosis](migration-regression.md).

## Change-aware GitHub Actions CI

`.github/workflows/ci.yml` owns automated CI. Every triggered run performs fast
feedback: test hygiene, root/UI typechecks, lint, both format checks, both builds,
CI selection/gate and architecture/security tests, and focused changed-file tests. Vitest `related` follows
static transitive imports for renderer source changes; changed test files run
directly. A nonempty focused request finding no tests fails rather than silently
accepting missing coverage. The fast lane does not install Java or run GUI fixtures.

Development push selection compares the current SHA with the last **successful
push CI** on the same branch, not merely `github.event.before`. This retains all
unvalidated changes when earlier runs are cancelled. Both SHAs must exist and the
baseline must be an ancestor. A failed lookup, missing baseline, invalid/empty diff,
unsupported record or unknown path selects full regression. Git's NUL-delimited
`--no-renames --name-status` retains both rename endpoints, spaces and deletions;
code deletions select full regression. There are no workflow-level path filters.

| Change                                                                                                                        | Additional coverage                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Root/docs Markdown only                                                                                                       | Fast feedback                                                                                 |
| Explicit renderer feature leaf or root test                                                                                   | Focused tests; native domain jobs as below                                                    |
| Renderer imports crossing features                                                                                            | Transitive importer domains, including their native jobs                                      |
| Apply, assignment, planning or execution tests/UI                                                                             | Apply and IPC/security/recovery on both native targets                                        |
| Grading, reports, comments, dashboard or Review Import tests/UI                                                               | Grading, Apply, IPC/security/recovery and credential-free signing tests on both targets       |
| Migration, schemas, course/faculty management, authorization, Git, tokens, IPC or reconciliation                              | Complete native migration target plus Apply, grading, IPC/security/recovery and signing tests |
| Workflow-generation/GUI tests                                                                                                 | Real JavaFX fixtures, plus applicable native jobs                                             |
| Backend source, shared renderer, fixtures/helpers, dependencies, configuration, CI tooling/workflows, unknown or deleted code | Full regression                                                                               |

The initial allowlist is deliberately small. Backend production changes still
select full regression because generated Electron bridges, CLI composition and
shared services cross package/domain boundaries. Do not add a narrow backend rule
without testing those consumers. Renderer import traversal includes static/dynamic
literal TypeScript imports/re-exports and CSS imports; shared importers and untraceable computed renderer imports select full
regression. The App/AppRoutes/main composition roots are tested through Vitest's
related graph without treating composition alone as a native domain change.

Full regression runs for **every PR**, pushes to `master` or `release/**`, and
`workflow_dispatch` with `full_regression: true` (the default). It retains complete
root/UI suites (UI split into three independent shards), dependency audit, real
JavaFX fixtures, and native macOS arm64/Windows x64 Apply, grading, security,
credential-free signing and `npm run test:migration`. Native jobs verify OS and
architecture. Typechecks run once in fast feedback; platform-independent compiler
checks need not be repeated in every native job. Migration generates its bridges
inside the permanent target. Identical Apply CLI tests formerly repeated inside
grading are covered by the native Apply jobs whenever grading is selected. No
production signing credentials or release environment are used by routine CI.

Only obsolete **pushes** on `remote-course-v2` and `ui-redesign` share cancellable
concurrency groups. Manual acceptance, PR, master and release runs have unique run
IDs; separate packaging/signing workflows are unchanged.

### Required checks and branch limitations

Require the stable **`CI required`** status in branch protection/rulesets. It runs
with `always()` and explicitly requires selector/fast success and success from
every selected job/matrix. Failed, cancelled, missing and unexpectedly skipped
jobs fail the gate. Only explicitly unselected jobs may be skipped. Requiring an
optional job alone is insufficient because GitHub treats skipped jobs as success.
There are deterministic gate tests covering these cases.

On 2026-11-17, the protection API reported `remote-course-v2` **not protected** and
the repository rulesets API returned `[]`. This implementation does not change
repository administration. Until an administrator requires `CI required` (and
removes obsolete required job names), the workflow cannot prevent direct pushes
or merges that disregard CI. Workflow edits themselves still need trusted review.

The repository default branch is **`master`**. GitHub schedules execute the default
branch workflow/commit; this branch adds no schedule and makes no claim of
scheduled validation of `remote-course-v2`. Use explicit dispatch with
`--ref remote-course-v2` for branch acceptance. Dispatch availability depends on
GitHub registering the workflow from the default branch; report API rejection
rather than changing `master` or pretending a push is manual acceptance. See
[GitHub event rules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

### CI performance evidence

Selection reasons appear in the selector's Actions summary and its JSON artifact.
Each test job summarizes elapsed setup/check time even on failure; `CI required`
also reports job durations from the Actions API. Timings include setup and may be
affected by runner queues/cache state. Compare workflow wall time separately from
the fast job's time and native acceptance time.

Baseline: [run 44006485645](https://github.com/msoecsse/graider/actions/runs/44006485645)
at `5069146cf8a62fd17588fa6f6f6bfc791abaf19a`: overall **12m14s**; Normal checks
**12m11s**, macOS grading **11m46s**, Windows migration **10m23s**, macOS migration
**5m05s**. Logs show sequential root/UI tests took 1m41s/6m06s, root installation
about one minute per job, repeated native typechecks 20–40s, and signing/IPC work
serially extended the grading job. The new layout splits those independent tests,
caches both lockfiles, and removes duplicate native compiler/bridge work. Ordinary
narrow feedback targets **under five minutes**; required native regression may take
longer. Record measured post-change run links and timings after exact-SHA validation;
do not substitute estimates for measured results.

First hosted candidate:
[run 44141449129](https://github.com/msoecsse/graider/actions/runs/44141449129),
commit `85554083db2efb7ad027c450de2896f3f7d4c5fa`:

| Measurement           | Baseline                                | Candidate                                                       |
| --------------------- | --------------------------------------- | --------------------------------------------------------------- |
| Workflow overall      | 12m14s, success                         | 17m41s, failed audit; all test jobs passed                      |
| Fast feedback job     | No separate job                         | 2m53s                                                           |
| UI regression         | 6m06s tests inside serial Normal checks | Three complete-suite shards, 2m27s–3m28s each including setup   |
| macOS grading job     | 11m46s                                  | 5m35s; independent signing/security work moved to parallel jobs |
| macOS migration job   | 5m05s                                   | 5m08s (runner variability; no demonstrated improvement)         |
| Windows migration job | 10m23s                                  | 15m23s (slower; full-regression speedup is not demonstrated)    |

**Acceptance remains blocked by [#65](https://github.com/msoecsse/graider/issues/65).**
The unchanged root lockfile now fails the preserved high-severity audit gate for
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), reviewed
2026-11-17. The advisory lists no patched version; the registry's latest picomatch
is 4.0.7, also affected. Root regression tests passed (3,226 tests; one existing
macOS-only interoperability test skipped on Linux). All three UI shards passed.
All native test jobs passed; Windows grading took 13m36s and Windows IPC/security took 10m24s.
The original branch-push baseline omitted Windows grading, while the candidate
full selection restores it. Overall full-regression timing is therefore not an
apples-to-apples successful-run comparison, and the Windows migration increase
also needs further measurement after the blocker is resolved.
No dependency or audit threshold was changed. This candidate cannot be called a
successful comprehensive run or release acceptance. The gate subsequently uses
Node 24's native TypeScript erasure for its dependency-free policy, avoiding an
unnecessary installation; a native-run regression checks success and rejection
of selected skips.

A successful comprehensive baseline is required before later narrow pushes can
omit the unvalidated workflow changes. Therefore the external audit blocker also
prevents a trustworthy end-to-end narrow-push timing demonstration. The 2m53s
figure measures the fast job, not total workflow/queue time; the under-five-minute
narrow-workflow target remains unverified until that blocker is resolved.
