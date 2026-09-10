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

## Task 13 — Repository health that predates this work — OPEN, informational

Measured 2026-09-10 while verifying Tasks 2-11. None of it was introduced by these changes, and
none of it was fixed by them; recorded so it is not mistaken for new breakage.

- [ ] `npm run typecheck` reports **97 errors at HEAD**, mostly `'grading' is possibly 'undefined'`
      across `src/config`, `src/cli/commands/workflow.command.ts` and
      `src/assignment-detail`. Verified identical with all local work stashed, so `npm run check`
      cannot pass today regardless of these tasks.
- [ ] `npx eslint .` reports **119 errors at HEAD** (identical before and after this work).
- [ ] The test suites are flaky on Windows. Full CLI-suite failures swung between 36 and 53 across
      identical back-to-back runs. Three families account for it: tests that assert a missing token
      while `GRAIDER_GITHUB_TOKEN` is set in the shell; template-sync tests that drive real `git`
      in temp directories; and CLI-shell tests that spawn the built CLI as a subprocess and time
      out under parallel load. A fourth family — POSIX-vs-Windows path assertions such as
      `/Users/sean/...` vs `C:\Users\...` — fails deterministically in `ui/electron`
      (`tokenResolver`, `courseRegistry`, `dashboardRunner`, the access-page services).
- [ ] `npx tsc --noEmit --project ui/tsconfig.json` reports 7 pre-existing errors
      (`prepareAssignmentTemplateSync` optionality in test mocks, `exactOptionalPropertyTypes`).

Because of the flakiness, verification for Tasks 2-11 used targeted runs, all green:
`tests/unit/execution tests/unit/github tests/recovery tests/cli/apply.test.ts
tests/cli/assignment-apply.test.ts tests/unit/manifest` (142 passed) and, in `ui`,
`src/dashboard electron/commandRunner.test.ts electron/graiderCliPreflight.test.ts
electron/windowsGraiderCliResolver.test.ts src/assignment-detail
electron/assignmentTemplateSyncService.test.ts` (162 passed). Neither project gained a failing
test, a lint error, or a typecheck error.

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
