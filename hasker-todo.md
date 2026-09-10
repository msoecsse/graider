# hasker-todo.md — io2 apply failure: cleanup + code fixes

Created 2026-09-09. Written so it can be handed back to Claude Code as a work order.
Repo: `C:\apps\graider` (the `graider` CLI + Electron UI in `ui/`).
Course repo used for diagnosis: `C:\apps\classrooms\swe4211-rwh-classroom`.

---

## Background: what went wrong

Applying assignment **io2** (`terms/27s1/assignments/io2/assignment.yml`, term `27s1`,
org `msoecsse`, template `msoecsse/swe4211-lab2-rwh-baseline`) failed in the UI with:

```
Error
GitHub readiness
GitHub API request failed.
github_api_error
kind: api_error
retryable: true
```

("GitHub readiness" is only a keyword-derived label from
`ui/src/assignment-detail/assignmentDetailReadiness.ts:261`; the error did NOT come from the
readiness stage. `graider validate terms/27s1/assignments/io2/assignment.yml --json` passes.)

### Diagnosed root cause

`executeCreateRepository` in `src/execution/apply-executor.ts:344-433` does:

1. `createRepositoryFromTemplate(...)` — succeeds; the repo now exists on GitHub.
2. `getRepository(...)` — a 404 here would yield the distinct
   `repository_creation_not_observed` diagnostic, so this passed.
3. `getDefaultBranchCommitSha(...)` -> `getCommitSha` -> `repos.listCommits`
   (`src/github/octokit-github-client.ts:615-635`) — **this is the failing call.**

GitHub's generate-from-template is asynchronous. For a few seconds the new repo has no commits
and `listCommits` returns **409 Conflict "Git Repository is empty."** `runNullable`
(`src/github/octokit-github-client.ts:659`) only swallows 404, so the 409 propagates to
`normalizeOctokitError` (`src/github/octokit-github-client.ts:707-740`), where every status that
is not 401/403/429 collapses into `new GitHubClientError("api_error", "GitHub API request failed.")`
with the status and GitHub's message thrown away. It is retryable, but the 3 attempts at
250ms/500ms backoff (`src/github/github-retry.ts:4-7`) are far too fast to outlast template
generation.

The outer `catch` then calls `recordError` and returns **without upserting the manifest record**,
so the just-created repo is left untracked. On the next apply, `plan-builder.ts` sees an existing
repo with no manifest entry and emits `repo_name_collision` -> operation `blocked` ->
`evaluateMutationGuard` (`src/execution/mutation-guard.ts:19-45`) returns `mutation_blocked`.
That is the loop: delete repos -> apply -> race -> orphaned repos -> blocked -> delete -> repeat.

### Evidence collected 2026-09-09

- Roster `terms/27s1/rosters/section-121.csv`: 14 active students; all 14 repos exist in `msoecsse`.
- `terms/27s1/manifests/io2/manifest.yml`: only **12** repository records.
- Untracked orphans, both created during the failed 16:49Z run, both with template content but
  **no student collaborator and no pending invite**:
  - `msoecsse/gonzeman0-io2-swe4211-27s1` (created 2026-09-09T16:49:14Z, student `gonzalezem`)
  - `msoecsse/lenskyg-io2-swe4211-27s1` (created 2026-09-09T16:49:19Z, student `lenskyg`)
- Students created immediately before and after them in the same run succeeded and are tracked:
  `gillj-ross` (16:49:06Z) and `wunderlina` (16:49:34Z) — consistent with a timing race, not a
  per-student config problem.

---

## Task 1 — Unblock io2 now — ALREADY RESOLVED, no action taken (verified 2026-09-10)

Re-verified before touching anything, and the orphans described above no longer exist. **Nothing
was deleted.** An apply run overnight (repos re-created 2026-09-10T02:50Z) healed the assignment:

- Roster `terms/27s1/rosters/section-121.csv` now has **21** active students (it grew from 14).
- `terms/27s1/manifests/io2/manifest.yml` has **21** repository records, updated 2026-09-10 10:20,
  including `gonzalezem` and `lenskyg` — the two that were untracked.
- `gonzeman0-io2-swe4211-27s1` and `lenskyg-io2-swe4211-27s1` now carry template content and a
  **pending student invitation** each. Deleting them would have destroyed live provisioning.
- `graider assignment apply-preview` reports `wouldCreateRepositories: 0`,
  `wouldUpdateRepositories: 21`, `blockedRepositories: 0`, with no diagnostics — nothing is blocked.

Re-running Apply was unnecessary as well. Tasks 2 and 3 still matter: they stop the race that
created the original orphans from recurring on the next apply that creates repositories.

## Task 2 — Wait for template generation before reading the baseline — DONE 2026-09-10

**Added:** `src/execution/template-content-wait.ts`. **Changed:** `src/execution/apply-executor.ts`,
`src/cli/commands/apply.command.ts`.

- [x] `executeCreateRepository` now calls `waitForTemplateContentSha`, which polls
      `getDefaultBranchCommitSha` instead of reading it once: 10 attempts, 1s initial backoff,
      doubling to a 4s cap (about 31s total).
- [x] Both "not ready yet" shapes are tolerated — an `undefined` commit sha, and the retryable
      `api_error` an empty repository throws (the 409). A non-retryable failure (auth, permissions)
      is rethrown at once; a retryable one that never clears is rethrown after the final attempt so
      the real cause is reported instead of a bare "no baseline".
- [x] The generic `withGitHubRetry` budget is untouched; this is a separate, longer wait that only
      applies after template creation. `ApplyExecutionInput.templateContentWait` (threaded through
      `ApplyCommandRequest`) overrides it so tests run instantly.
- [x] Tests: `tests/unit/execution/template-content-wait.test.ts` (6 cases: empty-then-ready,
      retryable-then-ready, non-retryable rethrow, exhausted, persistent-retryable rethrow, backoff
      schedule) and `TC-RECOVERY-011` in `tests/recovery/apply-recovery.test.ts`, which injects more
      failures than the per-request retry budget so it can only pass if the outer wait polls again.

**Acceptance met:** `TC-RECOVERY-011` — an apply whose first commit lookups report an empty
repository exits `Success` and records `templateSyncBaselineStatus: initialized`.

---

## Task 3 — Never orphan a repository that was just created — DONE 2026-09-10

**Changed:** `src/execution/apply-executor.ts`.

- [x] New `recordCreatedRepository` helper. `executeCreateRepository` tracks the repository it
      created and, on both post-creation failure paths (the missing-baseline `recordError` and the
      outer `catch`), upserts the manifest record and persists it. Recording was chosen over
      deleting: deleting risks destroying content when the failure was only in _reading_ state.
- [x] The error is still recorded and the run still fails; only the GitHub/manifest divergence is
      fixed.
- [x] The record cannot pass for finished work. `createManifestRecord` already writes
      `templateSyncBaselineStatus: "baseline_required"` when no commit sha is known
      (`src/execution/apply-executor.ts`), permissions and actions stay empty, and
      `src/template-sync/template-sync.ts` already knows how to heal a `baseline_required` record.
- [x] Tests: `TC-RECOVERY-012` — a persistent post-creation failure leaves the record present with
      `baseline_required`, and the second apply is **not** blocked by `repo_name_collision`.
      `TC-RECOVERY-002` still passes, so a genuinely untracked repository is still a collision.

**Acceptance met:** `TC-RECOVERY-012`.

---

## Task 4 — Stop discarding the HTTP status and GitHub's message — DONE 2026-09-10

**Changed:** `src/github/octokit-github-client.ts`, `src/github/github-errors.ts`.

- [x] `normalizeOctokitError` now carries the HTTP `status` and GitHub's `message` into
      `GitHubClientError`. The two byte-identical branches were collapsed into one, and the
      now-unused `HTTP_STATUS_SERVER_ERROR_MIN` constant removed.
- [x] `createGitHubDiagnostic` puts `status` and `githubMessage` into the diagnostic `context`
      alongside `kind` / `retryable` / `retryAfterSeconds`, and `describeGitHubError` appends them
      to the message. The UI already renders every context key as a definition list
      (`ui/src/assignment-detail/AssignmentDetailPage.tsx`), so no UI change was needed.
- [x] Redaction intact: the constructor runs `githubMessage` through `redactString`, as it already
      did for the message.
- [x] Tests: three new cases in `tests/unit/github/octokit-github-client.test.ts` — a 409 carries
      `status` and `githubMessage`, a 500 produces the described message and context, and a token
      embedded in GitHub's own message is redacted to `[REDACTED]`.

**Acceptance met:** the diagnostic now reads
`GitHub API request failed. (409: Git Repository is empty.)` rather than an opaque `api_error`.

---

## Task 5 — Make `mutation_blocked` self-explanatory in the UI — DONE 2026-09-10

**Changed:** `ui/src/assignment-detail/assignmentDetailReadiness.ts`.

- [x] Took the category half of the task's "and/or". `getDiagnosticCategory` now maps
      `mutation_blocked`, `confirmation_required` and `plan_contains_blocked_operations` to
      **"Apply blocked"** instead of letting them fall into the generic "Assignment detail" bucket,
      which read as though Assignment detail itself had failed.
- [x] Left the structural change (rendering the guard row as a header over its causes) undone. It
      is a layout decision rather than a defect, and with Task 4 giving each cause a status and a
      GitHub message the remaining confusion was the mislabelling.
- [x] Tests: two cases in `ui/src/assignment-detail/assignmentDetailReadiness.test.ts` — gate codes
      map to "Apply blocked", and subsystem codes still reach their own categories.

---

# Part 2 — "Graider CLI not found" in the UI

Separate issue from Part 1. The UI reports:

```
Graider CLI not found. Install Graider or make sure graider is available on PATH.
```

That exact string is `EXTERNAL_GRAIDER_CLI_NOT_FOUND_MESSAGE`
(`ui/electron/commandRunner.ts:18-19`), produced by `getGraiderCliStartError` only when a spawn
fails with `ENOENT` in `mode: "external"`.

## Findings from the 2026-09-09 investigation

- **The resolver logic is correct.** Running the compiled
  `ui/dist-electron/windowsGraiderCliResolver.js` in the real environment returns
  `{ kind: "node_script", scriptPath: "C:\\Users\\hasker\\AppData\\Roaming\\npm\\node_modules\\graider\\dist\\index.js" }`,
  and spawning through `createNodeProcessRunner` in external mode exits 0 and prints `0.1.0`.
  `graider.cmd` is on PATH and `%APPDATA%\npm\node_modules\graider` is an npm link to
  `C:\apps\graider`.
- **The fix is not in the binary being launched.** `ui/release/win-unpacked/Graider.exe` was built
  2026-09-08 08:47; `ui/electron/windowsGraiderCliResolver.ts` was written 09:09 the same day.
  Grepping `ui/release/win-unpacked/resources/app.asar` finds `dist-graider-cli` and
  `BUNDLED_GRAIDER_CLI_MISSING` but **not** `resolveWindowsGraiderCli`.
- **The fix is uncommitted and partly untracked**, so any clean checkout, other machine, or CI
  build produces an app without it:
  `M ui/electron/commandRunner.ts`, `M ui/electron/main.ts`,
  `?? ui/electron/windowsGraiderCliResolver.ts`, `?? ui/electron/windowsGraiderCliResolver.test.ts`,
  `?? ui/scripts/start-electron-dev.cjs`.

Dr. Hasker is trying a rebuild/repackage first (`cd C:\apps\graider\ui && npm run package:win`),
so **do not implement Task 7 unless asked** — it may prove unnecessary.

---

## Task 6 — Commit the CLI-resolution work — DONE 2026-09-10 (by Dr. Hasker)

- [x] Already committed as `daf44d3` ("Resolve the graider CLI without relying on PATH; untrack
      node_modules") at 2026-09-10 10:21, before this pass started. It carries all seven files:
      `commandRunner.ts`, `commandRunner.test.ts`, `main.ts`, `dashboardRunner.test.ts`,
      `windowsGraiderCliResolver.ts`, `windowsGraiderCliResolver.test.ts`, and
      `ui/scripts/start-electron-dev.cjs`.
- [x] `windowsGraiderCliResolver.test.ts` runs under `npm --prefix ui test` (verified: 31 tests
      across the two resolver files).

---

## Task 7 — Replace PATH-first CLI resolution with a deterministic chain — DONE 2026-09-09

The rebuild did not fix it, so this was implemented.

**Files changed:** `ui/electron/commandRunner.ts`, `ui/electron/main.ts`,
`ui/electron/commandRunner.test.ts`, `ui/electron/dashboardRunner.test.ts`.

- [x] 1. `GRAIDER_CLI_PATH` environment override — wins everywhere, in development and when
     packaged. A `.js`/`.mjs`/`.cjs` target runs under Node; anything else is spawned directly.
- [x] 2. Bundled CLI — `dist-graider-cli/index.js`, unchanged for packaged apps.
- [x] 3. Development fallback to the repository build — `getDevelopmentGraiderCliPath`, i.e.
     `path.resolve(app.getAppPath(), "..", "dist", "index.js")`. With `app.getAppPath()` =
     `C:\apps\graider\ui` this is `C:\apps\graider\dist\index.js`, reached with no PATH, no
     `npm link`, and no shim parsing.
- [x] 4. `resolveWindowsGraiderCli` (PATH shim lookup) demoted to last resort.
- [x] All tiers still run under `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, so the
      `.cmd` / CVE-2024-27980 handling in `windowsGraiderCliResolver.ts` is unchanged.
- [x] `ui/electron/main.ts` now passes `appPath: app.getAppPath()` in **both** modes; previously
      the development branch omitted it, so no app-relative location could be derived.
- [x] Tests: one case per tier in `ui/electron/commandRunner.test.ts`, including resolution with
      an empty `PATH`.

**Deliberate deviation from the plan above:** a packaged app does **not** fall through to the
development build or to PATH. Its chain is override -> bundled, and nothing else. Silently running
whatever `graider` happens to be installed globally would mask a broken install and could run a CLI
version that does not match the app; a missing bundled CLI still reports
`bundled_graider_cli_not_found` ("Rebuild or reinstall the Graider app"). Development keeps the
full chain: override -> repository build -> bundled -> PATH shim.

**Verified:** with `PATH` emptied and `appPath` = `C:\apps\graider\ui`, resolution returns
`{ kind: "node_script", scriptPath: "C:\\apps\\graider\\dist\\index.js", source: "development" }`
and running `graider --version` through the runner exits 0 with `0.1.0`.

**Note for whoever runs this next:** the development tier executes `C:\apps\graider\dist\index.js`,
so `npm run build` in the CLI repo still governs which CLI the dev app runs — same file the npm
shim pointed at, so this changes how it is found, not how fresh it is.

---

## Task 8 — Surface the run diagnostic that is already being computed — DONE 2026-09-10

**Changed:** `ui/electron/commandRunner.ts` plus the nine runners that map start errors.

- [x] New `describeGraiderCliAttempt` appends the location actually tried to both start-error
      messages, e.g. `Bundled Graider CLI could not be started. Rebuild or reinstall the Graider
app. (tried bundled: C:\...\dist-graider-cli\index.js)`. `getGraiderCliStartError` takes the
      diagnostic as a second argument, and all nine call sites now pass `result.diagnostic`
      (`assignmentApplyPreviewRunner`, `assignmentApplyRunner`, `assignmentDetailRunner`,
      `assignmentGradePreviewRunner`, `assignmentGradeRunner`, `assignmentGradeStatusRunner`,
      `assignmentRepositoryMappingsRunner`, `dashboardRunner`, `facultyReportRunner`).
- [x] `logGraiderCliDiagnostic` logs `code`, `mode`, `source`, `executable`, `helper` and `cwd` to
      stderr when `GRAIDER_UI_DEBUG=1`, on both the missing-bundled-CLI path and a spawn error —
      matching the convention in `ui/electron/tokenResolver.ts`.
- [x] Tests: three cases in `ui/electron/commandRunner.test.ts` — the message names the attempted
      location, stays bare when no diagnostic is available, and the debug log fires under
      `GRAIDER_UI_DEBUG`.

**Acceptance met**, with one caveat worth knowing: the renderer maps error _codes_ to its own
hardcoded sentences, so the appended path shows up in logs, IPC results and JSON — not on screen.
Task 9's panel is what puts a path in front of the user.

---

## Task 9 — Startup preflight for the CLI — DONE 2026-09-10

**Added:** `ui/electron/graiderCliPreflight.ts`, `ui/electron/graiderCliPreflight.test.ts`.
**Changed:** `ui/electron/ipc.ts`, `ui/electron/preload.ts`, `ui/electron/main.ts`,
`ui/src/dashboard/DashboardPage.tsx`.

- [x] `runGraiderCliPreflight` runs `graider --version` through the shared runner and returns
      `{ status, version, resolutionSource, executablePath, helperPath, errorCode, errorMessage }`.
      A nonzero exit or empty output counts as a failure, and a start error is described with the
      attempted path from Task 8.
- [x] Exposed as the `graider-ui:graider-cli:status` IPC channel and `getGraiderCliStatus()` on the
      preload API (optional on `GraiderUIApi`, so older renderers keep working).
- [x] The dashboard shows a `Graider CLI: Ready (0.1.0)` / `Not available` panel next to the GitHub
      auth panel, auto-expanded on failure, naming the tier in prose ("the repository build", "the
      copy bundled with the app", "the GRAIDER_CLI_PATH override", "a PATH lookup") with the
      absolute path in a `<pre>`, plus a Re-check button.
- [x] Tests: `ui/electron/graiderCliPreflight.test.ts` (version and tier reported; attempted path
      reported on failure; nonzero exit and empty output both fail).

---

## Task 10 — Rebuild the bundled CLI; it is stale — DONE 2026-09-10

- [x] Rebuilt both CLI artifacts, since Tasks 2-4 changed the CLI and the development tier of the
      resolution chain runs `dist/index.js`:
      `npm run build` (root) and `npm --prefix ui run build:cli`.
      Both are now 2026-09-10 10:46 and both answer `--version` with `0.1.0`.
- [x] Standing rule unchanged: never ship a UI build without re-running `build:cli`
      (`npm run package:win` already includes it).

---

## Task 11 — `assignmentTemplateSyncService` builds a runner with no CLI options — DONE 2026-09-10

**Changed:** `ui/electron/assignmentTemplateSyncService.ts`, `ui/electron/main.ts`.

- [x] Added `createAssignmentTemplateSyncServiceWithRunner(runner)`, and `main.ts` now builds the
      service from the shared `processRunner` instead of importing a module-level singleton that
      constructed its own unconfigured runner.
- [x] Went one step further than the task asked: `createAssignmentTemplateSyncService` no longer
      defaults its `backend` and `resolveToken` parameters, so no caller can silently get an
      unconfigured runner. `createNodeProcessRunner()` with no options now appears nowhere outside
      its own definition — there is exactly one resolution path.
- [x] `assignmentTemplateSyncService.test.ts` and `assignmentTemplateSyncIpc.test.ts` still pass
      unchanged (they already supplied both arguments).

---

## Task 12 — A missing course folder reports itself as a missing CLI — OPEN

Found 2026-09-09 while chasing the persistent "Graider CLI not found" report, and **not yet fixed**.
It is a separate cause from Part 2's resolution problem, and it was the actual cause of the message
Dr. Hasker kept seeing: three of the five registered course folders did not exist on disk
(`C:\m4\subrepos\swe2410-classroom`, `C:\m2\subrepos\swe2410-classroom`,
`C:\apps\classrooms\swe4211-hasker-classroom`) and were the three with
`lastDashboardStatus: "failure"`. They have since been removed from the registry, so the symptom is
gone, but the misreporting remains.

On Windows `spawn` returns `ENOENT` when the **`cwd`** does not exist, even when the executable is
fine, and the error text names the executable. Reproduced with the CLI correctly resolved:

    spawn error code : ENOENT
    spawn error msg  : spawn C:\Program Files\nodejs\node.exe ENOENT
    resolutionSource : development
    helperPath       : C:\apps\graider\dist\index.js
    mapped to        : graider_cli_not_found / "Graider CLI not found. Install Graider or make
                       sure graider is available on PATH."

- [ ] Check `cwd` before spawning in `createNodeProcessRunner`: if `request.cwd` is set and does
      not exist, return a distinct `course_folder_missing` code with a message naming the path.
- [ ] Narrow the ENOENT mapping in `getGraiderCliStartError`. Since Task 7 the CLI is resolved to
      an absolute path whose existence is verified before spawn, so a post-resolution ENOENT can
      never legitimately mean "CLI missing" — when `diagnostic.resolutionSource` is non-null it
      should not map to `graider_cli_not_found`.
- [ ] Centralize the message. `"Graider CLI not found. Install Graider or make sure graider is
available on PATH."` is hardcoded in eight renderer files (`dashboardAggregation.ts`,
      `CourseFolderList.tsx`, `AssignmentDetailPage.tsx`, `ApplyPreviewPage.tsx`,
      `GradePreviewPage.tsx`, `GradeStatusPage.tsx`, `FacultyReportPage.tsx`) plus the main-process
      constant. Any new code needs a mapping in each, or unknown codes fall back to "Could not
      refresh this course folder."

---

## Task 13 — Repository health that predates this work — PARTLY RESOLVED 2026-09-10

Measured 2026-09-10 while verifying Tasks 2-11. None of it was introduced by these changes, and
none of it was fixed by them; recorded so it is not mistaken for new breakage.

- [x] (**Task 14**, done) `npm run typecheck` reports **97 errors at HEAD**, mostly `'grading' is possibly 'undefined'`
      across `src/config`, `src/cli/commands/workflow.command.ts` and
      `src/assignment-detail`. Verified identical with all local work stashed, so `npm run check`
      cannot pass today regardless of these tasks.
- [x] (**Task 15**, done for 15a—15c) `npx eslint .` reports **119 errors at HEAD**
      (identical before and after this work). Now 0.
- [ ] **Still open, and now diagnosed.** The test suites are flaky on Windows. Full CLI-suite failures swung between 36 and 53 across
      identical back-to-back runs. Three families account for it: tests that assert a missing token
      while `GRAIDER_GITHUB_TOKEN` is set in the shell; template-sync tests that drive real `git`
      in temp directories; and CLI-shell tests that spawn the built CLI as a subprocess and time
      out under parallel load. A fourth family — POSIX-vs-Windows path assertions such as
      `/Users/sean/...` vs `C:\Users\...` — fails deterministically in `ui/electron`
      (`tokenResolver`, `courseRegistry`, `dashboardRunner`, the access-page services).
      The real-git family's mechanism is now known: `EBUSY: resource busy or locked, rmdir`
      while tearing down temp clones under parallel load.
      `local-git-template-sync-gateway.test.ts` and
      `production-template-sync-workspace.test.ts` each pass alone (10/10 and 7/7) and swing
      between 3 and 10 failures across full runs of the same tree. Fixing it wants unique
      temp roots per test plus a retrying rmdir on Windows; worth its own task.
- [ ] **Still open.** `npx tsc --noEmit --project ui/tsconfig.json` reports 7 pre-existing
      errors (`prepareAssignmentTemplateSync` optionality in test mocks,
      `exactOptionalPropertyTypes`). Not touched by Tasks 14 or 15, which were both scoped to
      the CLI project.
- [ ] **Newly recorded.** `prettier . --check` flags 6 files, all pre-existing and none from
      this work: `docs/config-wizard-plan.md`, `src/config/config-loader.ts`,
      `src/config/config-validation.ts`, `src/dashboard/dashboard-builder.ts`,
      `src/groups/group-target-executor.ts`, `tests/unit/manifest/manifest-renderer.test.ts`.
      Every disagreement is nested-ternary indentation. Three are files Tasks 14/15 edited;
      they were left alone rather than mixing unrelated reformatting into those diffs. With
      Tasks 14 and 15 landed, these 6 files and the flakiness above are all that keep
      `npm run check` from passing.

Because of the flakiness, verification for Tasks 2-11 used targeted runs, all green:
`tests/unit/execution tests/unit/github tests/recovery tests/cli/apply.test.ts
tests/cli/assignment-apply.test.ts tests/unit/manifest` (142 passed) and, in `ui`,
`src/dashboard electron/commandRunner.test.ts electron/graiderCliPreflight.test.ts
electron/windowsGraiderCliResolver.test.ts src/assignment-detail
electron/assignmentTemplateSyncService.test.ts` (162 passed). Neither project gained a failing
test, a lint error, or a typecheck error.

---

## Task 14 — Fix the 97 typecheck errors so `npm run typecheck` passes — DONE 2026-09-10

Analyzed 2026-09-10. All 97 predate this work (verified with every local change stashed). They are
not 97 independent problems: **79 of them come from one pattern**, and the remaining 18 sit in two
clusters. Fix them in the order below — the first step is a handful of lines and clears 79 errors.

    npx tsc --noEmit 2>&1 | grep -c "error TS"     # 97 today

### 14a — Stop discarding the resolved-config guarantee (79 errors, do first)

`ResolvedCourseConfig` and `ResolvedAssignmentConfig` (`src/config/config-models.ts:13-19`) exist
precisely to promise that `grading` and `template` are present after loading:

    export type ResolvedCourseConfig = RawCourseConfig & {
      readonly grading: NonNullable<RawCourseConfig["grading"]>;
    };

The schema marks both `optional()` (`src/config/config-schemas.ts:97,162`), so `RawCourseConfig`
carries `| undefined` — and helpers annotated with the **Raw** type throw the guarantee away again.
`getEffectiveGrading` is duplicated in **10 places**, each annotated
`: RawCourseConfig["grading"]`, e.g. `src/assignment-detail/assignment-detail-builder.ts:79`:

    const getEffectiveGrading = (config: LoadedGraiderConfig): RawCourseConfig["grading"] =>
      config.assignment.grading ?? config.course.grading;

`config.course` is a `ResolvedCourseConfig`, so the expression is already non-optional; only the
annotation re-widens it. Every caller then reads `grading.enabled` / `grading.workflow` and trips
TS18048.

- [x] Consolidated into `src/config/effective-grading.ts`, which exports
      `EffectiveGradingConfig = NonNullable<RawCourseConfig["grading"]>` plus two entry points:
      `getEffectiveGrading(config)` for the seven `LoadedGraiderConfig` callers and
      `resolveEffectiveGrading(courseConfig, assignmentConfig)` for the two that hold the two
      configs separately. All 10 local copies deleted. `workflow.command.ts` had a third shape
      (it passed the two `grading` blocks) and now passes the loaded config like everyone else.
- [x] `GitHubReadinessValidationInput` now takes `ResolvedCourseConfig`/`ResolvedAssignmentConfig`.
      All three production callers (`apply`, `plan`, `validate`) already passed
      `configResult.config.course`/`.assignment`, so this is a narrowing with no call-site change.
      `validateTeams` keeps `RawCourseConfig` — it only reads `github`.
- [x] No `?.` or non-null assertions were added anywhere. Two places needed more than an
      annotation change: - `config-validation.ts` already had the guard: `validateGradingConfig` returns early on
      `grading === undefined`, then handed the value to six helpers each annotated
      `RawCourseConfig["grading"]`, re-widening it. Those six now take `EffectiveGradingConfig`;
      the dispatcher keeps the optional parameter and the guard. - `dashboard-builder.ts` reads `loadCourseConfig`/`loadAssignmentConfig` directly rather
      than through `loadGraiderConfig`, so its configs genuinely were raw. Rather than guard in
      a dozen places, `resolveCourseConfig`/`resolveAssignmentConfig` are now exported from
      `config-loader.ts` and applied at both load sites, so the dashboard gets the same
      defaults (`{ enabled: false, mode: "no-grading" }`, `{ repository: "", branch: "" }`) the
      CLI path gets. This is also a runtime fix: `createAssignmentSummary` read
      `assignmentConfig.template.repository` unguarded, which threw on a config missing the
      block. The missing block is still reported through `validateAssignmentConfig`.

**Verified:** dropping the return annotation in `assignment-detail-builder.ts` took that file from
6 errors to 0, with no other change.

**Affected files** (error counts): `config-validation.ts` 14, `grade-preview-builder.ts` 13,
`grade-status-builder.ts` 11, `dashboard-builder.ts` 11, `github-readiness-validation.ts` 8,
`workflow-compatibility-validation.ts` 7, `cli/commands/workflow.command.ts` 7,
`assignment-detail-builder.ts` 6, `java-junit-checkstyle-workflow.ts` 2.

### 14b — Template-sync test types under `exactOptionalPropertyTypes` (14 errors)

- [x] An anchor can legitimately be absent — that is exactly what
      `templateSyncBaselineStatus: "baseline_required"` and the `hasRequiredAnchors` type guard
      describe — and `TemplateSyncAnchors` already declares both shas `?: string`. The errors
      were the two construction sites explicitly assigning `undefined`, which
      `exactOptionalPropertyTypes` rejects. Both now build the object with the conditional
      spread the rest of the repo uses, so the declared type is unchanged and
      `Required<TemplateSyncAnchors>` keeps meaning "both shas known".
- [x] `assignment-template-sync.test.ts`: `batchInput` is now annotated
      `AssignmentTemplateSyncInput`, which forced the two real mismatches into the open — the
      local `anchors` variable was typed `TemplateSyncAnchors` where `updateAnchors` supplies
      `Required<TemplateSyncAnchors>`, and the `persistManifest` fake took an implicit `any`.
- [x] `production-assignment-template-sync-service.test.ts` rewritten against the real
      interfaces: typed `Manifest` and `AssignmentTemplateSyncResult` fixtures, `Bridge` derived
      from `ProductionAssignmentTemplateSyncServiceInput["bridge"]`, and a real
      `FakeGitHubClient` for the workspace. This removed all 12 of its `any`/unsafe-value lint
      errors as well (15b).
- [x] `assignment-template-sync-context.test.ts:244`: the `resolveToken` fake was
      `vi.fn(() => "resolved-token")`, inferred as `() => string`, so
      `mockReturnValueOnce(undefined)` was rejected even though the dependency returns
      `string | undefined`. Typed the fake with
      `vi.fn<AssignmentTemplateSyncContextDependencies["resolveToken"]>`.

### 14c — Three one-off signature mismatches (3 errors)

- [x] `apply-executor.ts` — the inline `[...] as const` tuple is now a module-level
      `REPOSITORY_UPDATE_PLAN_TYPES: readonly PlanOperationType[]`, so `.includes(operation.type)`
      typechecks without a cast and the list is named.
- [x] `octokit-github-client.ts:547` — spread into a fresh literal at the call
      (`pulls.create({ ...input })`), leaving `CreatePullRequestInput` and `OctokitParameters`
      alone.
- [x] `tests/cli/report.test.ts` — added `pulls` (`create`, `list`) and `git` (`deleteRef`) to
      `createUnusedOctokit`, wired to the same `unusedMethod` as its siblings. Did not extract a
      shared factory: the two mocks differ in purpose (this one asserts nothing is called, the
      other returns fixtures), so sharing would need parameterization that buys little here.

**Acceptance met:** `npx tsc --noEmit` reports 0 errors (was 97) and `npm run typecheck` passes.
Verified green afterwards: `tests/unit/config`, `tests/unit/github`,
`tests/unit/github-readiness-validation.test.ts`, `tests/unit/execution`, `tests/unit/planning`,
`tests/unit/manifest`, `tests/recovery`, `tests/unit/template-sync`, `tests/cli/report.test.ts`
and the three `assignment-*` preview suites. `tests/unit/workflows/result-writer.test.ts` still
fails 20 cases, unchanged — confirmed identical against a stashed baseline (Task 13 flakiness).

---

## Task 15 — Fix the 119 lint errors so `npm run lint` passes — 15a–15c DONE 2026-09-10;

one 15d bullet deferred

`npx eslint .` now reports **0 errors** and `npm run lint` passes. Task 14 landed first and
took the count from 119 to 94 on its own — the sequencing note was right, and the whole of
`production-assignment-template-sync-service.test.ts`'s `any`/unsafe-value cluster went with it.
The one piece **not** done is 15d's second bullet, linting `ui/` TypeScript, which the task
itself says to land as its own commit because it raises the count before it lowers it.

Analyzed 2026-09-10; identical count with all local work stashed. `--fix` resolves only **7** of
them, so plan on hand edits. The distribution matters more than the total: **85 are in `tests/`,
27 in `src/`, 7 in `ui/scripts/`**, and the top seven files are all template-sync — the newest
feature area, which appears never to have been linted.

    npx eslint .                  # 119 today
    npx eslint . --fix-dry-run    # 112 remain, so only 7 are mechanical

### 15a — `require-await` in template-sync tests — DONE

- [x] Done, but it was 43 sites rather than 49 and three of them were in `src/`, not tests:
      `assignment-template-sync-context.ts` (`prepare`, `persistManifest`) and
      `production-repository-sync-executor.ts` (`updateAnchors`). Applied the stated recipe —
      `() => Promise.resolve(v)`, `() => Promise.reject(e)`, and braces plus an explicit
      `return Promise.resolve()` where the body does real work. Return types stayed explicit and
      every fake still satisfies its interface (typecheck confirms). Two mid-body `throw`s in
      `FakeGateway` became `Promise.reject`, which keeps the rejection but drops the implicit
      `async` wrapper.

### 15b — `any` and unsafe values in template-sync tests — DONE

- [x] Confirmed: typing the fakes against the real interfaces cleared the unsafe-assignment and
      unsafe-return reports with them, exactly as predicted. The service test went with Task 14;
      the bridge test was rewritten the same way — a typed `Manifest` fixture, `Executor`
      derived from `ProductionAssignmentTemplateSyncBridgeInput["executor"]`, and a real
      `FakeGitHubClient` — which took it from 9 errors to 0 in one pass. Two more `any`s were
      elsewhere: `apply.test.ts` was reading `expect.objectContaining`/`expect.any(String)`
      (both `any`) into a nested literal, now a direct `toContainEqual` on mapped values, which
      also states the assertion more plainly; and `octokit-github-client.ts` inferred `unknown`
      from `this.run`, then `Array.isArray(data) ? data[0]` widened it to `any` — the file
      already had an `asArray` helper for this.
- [x] All five removed with real guards, not suppressions. The four in the context test were
      indexed access; they now go through one local `first<T>(items): T` that throws on empty.
      A fifth `any` surfaced there once the assertions were untangled: vitest types
      `MockResult.value` as `any` for its throw variant, so reading the client back through
      `createClient.mock.results[0]` widened it — `setup` now returns the `FakeGitHubClient` it
      handed the fake. The gateway one was `exactTreeMatches[0]!` guarded by a
      `length === 1` check, now a destructure plus an `undefined` check after the ambiguity
      check.

### 15c — `src/` errors — DONE

- [x] All 8 fixed. `only-throw-error` was worth the look: `operationError` was declared
      `unknown` and rethrown bare. Every escape from that block comes from `withFailureStage`,
      which always throws a `TemplateSyncOperationError`, so the variable is now typed as one
      and the catch normalizes through `createTemplateSyncOperationError` — which returns an
      existing `TemplateSyncOperationError` unchanged, so the staged message survives and
      anything unexpected gains a real stack instead of being rethrown as a raw value.
      `no-confusing-void-expression` was a shorthand arrow returning `applyThreeWayPatch`'s
      void; `restrict-template-expressions` was `${code ?? "an unknown"}` over `number | null`.
      The 3 magic numbers were `10 * 1024 * 1024` — note the rule exempts a plain literal
      initializer but not an arithmetic one, so the constant holds `10485760` with the MiB
      figure in its doc comment.
- [x] Read each; all three were genuinely dead. `!template?.repository?.trim()` optional-chains
      twice over a `ResolvedAssignmentConfig`, where `template` and `template.repository` are
      both guaranteed — the same widening Task 14 was about. `request.confirmed === true`
      compares a plain `boolean`. The remaining two of the five were the `require-await` pair
      counted under 15a.
- [x] 8 of the 9 were a config gap rather than code defects, so this became a third 15d item.
      The codebase already marks a deliberately unused parameter with a `_` prefix (all four in
      `fake-github-client.ts`, `_base` included) and already uses destructure-to-omit
      (`const { env: _env, ...bridgeInput } = input`), but `no-unused-vars` was configured with
      no `argsIgnorePattern` and no `ignoreRestSiblings`, so it contradicted both conventions.
      Configured it to honor them; note this is also why only _some_ `_` params were reported —
      the base rule's `after-used` default hides any that precede a used parameter. The one real
      defect was dead code: `hasAnchorUpdate` in `assignment-template-sync.ts`, a type guard
      with no callers (`hasInitializedAnchors` in `template-sync.ts` is the one in use). Deleted.
- [x] Same `10 * 1024 * 1024` as the gateway, named the same way. Two more magic numbers turned
      up outside the listed files once the others were gone: the `.slice(0, 12)` short-sha in
      `template-sync.ts` and `.at(-1)` in `production-repository-sync-executor.ts`, both now
      named constants.

### 15d — Config gaps, not code defects — first bullet DONE, second DEFERRED

- [x] Done as described: the pattern is now `**/*.{js,mjs,cjs}` with `languageOptions.globals`
      for the Node globals these scripts actually use (`__dirname`, `__filename`, `console`,
      `exports`, `module`, `process`, `require`, `URL`). Hand-listed rather than adding a
      `globals` dependency, which is not currently installed. Two scripts had been working
      around the gap with `/* global ... */` header comments
      (`assemble-rc1-release.cjs`, `write-electron-package-type.cjs`); those are now redundant
      and were removed so they do not misinform.
- [ ] **DEFERRED — `ui/` TypeScript is still not linted at all.** Unchanged from the analysis:
      `eslint .` reports "File ignored because no matching configuration was supplied" for
      `ui/electron/*.ts`, the typed block still matches only `src/**/*.ts` and `tests/**/*.ts`,
      and `ui/package.json` still has no `lint` script. Left for its own commit as the task
      instructs, now that 15a–15c are landed and the existing backlog is at zero — which is
      exactly the clean baseline that makes the new findings readable. Add
      `ui/electron/**/*.ts` and `ui/src/**/*.{ts,tsx}` to `eslint.config.mjs`, or a `lint`
      script under `ui/`, and expect the count to jump before it comes down.

**Acceptance met for 15a–15c:** `npx eslint .` reports 0 errors (was 119) and `npm run lint`
passes, alongside `npm run typecheck`. `prettier . --check` is back to the same 6 pre-existing
files it flagged before any of this work — `docs/config-wizard-plan.md`, `config-loader.ts`,
`config-validation.ts`, `dashboard-builder.ts`, `group-target-executor.ts`,
`manifest-renderer.test.ts`. Three of those are files Tasks 14/15 edited; their disagreements
are all pre-existing nested-ternary indentation, so they were left alone rather than mixed in.
They are the only thing still standing between the repo and a green `npm run check` (besides
the Task 13 flakiness).

**Test verification.** `npx vitest run` fails in exactly the same 9 files before and after,
with no file gaining or losing a failure:

    result-writer 20 | local-git-template-sync-gateway 9-10 | cli-shell 9
    production-template-sync-workspace 3-7 | output 3 | repository-download 1
    assignment-grade-status 1 | assignment-grade-preview 1 | assignment-apply-preview 1

The two ranges are the Task 13 Windows flakiness and move in both directions between runs on
the same tree. The cause is now identified: `EBUSY: resource busy or locked, rmdir` when the
real-git tests tear down temp clones under parallel load. Both files pass alone
(`local-git-template-sync-gateway` 10/10, `production-template-sync-workspace` 7/7), and
`tests/unit/template-sync tests/unit/repository-download` gives an identical
"1 failed | 61 passed" on three consecutive runs of each tree. Worth fixing as its own task —
the tests need unique temp roots and a retrying cleanup on Windows.

**Sequencing note for Tasks 14 and 15:** do Task 14 first. Several `no-unnecessary-condition` and
unsafe-value reports are downstream of the widened optional types in 14a, so some of Task 15
resolves itself once the types are honest.

---

## Validation before calling any of this done

    cd C:\apps\graider
    npm run check      # typecheck + lint + format:check + vitest

For Part 2 also:

    npm --prefix ui run typecheck
    npm --prefix ui test

Note that `npm run check` cannot pass today for reasons that predate this work — see Task 13. Until
that is addressed, compare failure sets against a stashed baseline rather than expecting zero, and
lean on the targeted runs listed in Task 13.

io2 itself needs no further action: 21/21 students tracked as of 2026-09-10 (Task 1).
