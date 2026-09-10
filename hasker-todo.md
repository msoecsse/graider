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

## Task 1 — Unblock io2 now (operational, do first)

Delete the two orphaned repos, then re-run Apply. They hold only template content and no student
has access yet, so nothing is lost. **Confirm with Dr. Hasker before deleting.**

- [ ] Re-verify each repo is still orphaned before deleting (no student collaborator, no invite,
      absent from `terms/27s1/manifests/io2/manifest.yml`):

      gh api repos/msoecsse/gonzeman0-io2-swe4211-27s1/collaborators --jq ".[].login"
      gh api repos/msoecsse/gonzeman0-io2-swe4211-27s1/invitations  --jq ".[].invitee.login"
      gh api repos/msoecsse/lenskyg-io2-swe4211-27s1/collaborators  --jq ".[].login"
      gh api repos/msoecsse/lenskyg-io2-swe4211-27s1/invitations    --jq ".[].invitee.login"

- [ ] Delete them:

      gh repo delete msoecsse/gonzeman0-io2-swe4211-27s1 --yes
      gh repo delete msoecsse/lenskyg-io2-swe4211-27s1 --yes

- [ ] Re-run Apply from the UI, or from `C:\apps\classrooms\swe4211-rwh-classroom`:

      node C:/apps/graider/dist/index.js assignment apply terms/27s1/assignments/io2/assignment.yml --json --yes

      (The UI runs exactly this — see `ui/electron/assignmentApplyRunner.ts:108-118`.)

- [ ] Confirm the manifest ends with 14 records and every student has a collaborator or pending
      invite. If a _different_ student now races and orphans, repeat this cleanup for that name —
      or land Task 2 first, which removes the race.

Read-only commands useful while verifying (neither mutates GitHub):

    node C:/apps/graider/dist/index.js validate terms/27s1/assignments/io2/assignment.yml --json
    node C:/apps/graider/dist/index.js assignment apply-preview terms/27s1/assignments/io2/assignment.yml --json

---

## Task 2 — Wait for template generation before reading the baseline (highest value)

**File:** `src/execution/apply-executor.ts` (`executeCreateRepository`, ~lines 344-433), with
support in `src/github/octokit-github-client.ts`.

- [ ] After `createRepositoryFromTemplate` succeeds, poll for the generated content instead of
      reading it immediately: retry `getDefaultBranchCommitSha` until a commit sha is returned,
      with a real budget (suggest ~10 attempts / ~30s total, exponential backoff seeded around 1s).
- [ ] Treat the empty-repository condition as "not ready yet", not as a hard failure. There is
      currently **no** handling of 409 / empty repositories anywhere in
      `octokit-github-client.ts` or `apply-executor.ts` — grep confirms it.
- [ ] Keep the existing generic retry (`withGitHubRetry`, 3 attempts / 250ms) for ordinary calls;
      this is a distinct, longer wait specific to post-template-generation readiness. Do not
      globally lengthen `DEFAULT_GITHUB_RETRY_ATTEMPTS` / `DEFAULT_INITIAL_BACKOFF_MS` in
      `src/github/github-retry.ts` — that would slow every failure path.
- [ ] Tests: `tests/unit/github/octokit-github-client.test.ts` plus the apply executor tests under
      `tests/cli/apply.test.ts` / `tests/recovery/apply-recovery.test.ts`. Use the fake client
      (`src/github/fake-github-client.ts`, which supports injected failures) to simulate a repo
      that returns empty/409 for the first N `listCommits` calls and then succeeds; assert apply
      completes and writes the manifest record.

**Acceptance:** an apply where the first few `listCommits` calls report an empty repository still
finishes successfully and records the student in the manifest.

---

## Task 3 — Never orphan a repository that was just created

**File:** `src/execution/apply-executor.ts` (`executeCreateRepository`, the failure paths at
~lines 380-433, including the `recordError` for a missing template-sync baseline and the outer
`catch (error) { return recordError(state, normalizeGitHubError(error)); }`).

- [ ] If the repo was created but a later step in the same operation fails, do not return without
      recording it. Either upsert the manifest record with the baseline marked incomplete/unknown
      (so a later apply can heal it), or delete the repo that was just created so the retry starts
      clean. Prefer recording it — deleting risks destroying content if the failure was only in
      reading state.
- [ ] Whichever path is chosen, the error must still be reported; this is about not leaving GitHub
      and the manifest out of sync, not about hiding the failure.
- [ ] Make sure the recorded state cannot be mistaken for a fully provisioned repo — a subsequent
      apply must still finish the remaining steps (collaborator, team permissions, actions,
      template-sync baseline).
- [ ] Tests: extend `tests/recovery/apply-recovery.test.ts` — inject a failure after creation and
      assert (a) the run reports the error, and (b) a second apply against the same state is NOT
      blocked by `repo_name_collision`.

**Acceptance:** a mid-operation failure after repo creation never produces a
`repo_name_collision` / `mutation_blocked` on the next apply.

---

## Task 4 — Stop discarding the HTTP status and GitHub's message

**Files:** `src/github/octokit-github-client.ts:707-740`, `src/github/github-errors.ts`.

- [ ] In `normalizeOctokitError`, carry the HTTP `status` and GitHub's response `message` through
      to `GitHubClientError`. Note the two branches at lines 733 and 737 are byte-identical
      (`>= 500` and "any other defined status") and exist only to throw the status away — collapse
      them and keep the status.
- [ ] In `createGitHubDiagnostic` (`src/github/github-errors.ts`), include `status` (and the
      GitHub message, when present) in the diagnostic `context` alongside the existing
      `kind` / `retryable` / `retryAfterSeconds`. The UI already renders every context key as a
      definition list (`ui/src/assignment-detail/AssignmentDetailPage.tsx:1006-1014`), so this
      surfaces with no UI change.
- [ ] Keep redaction intact — `GitHubClientError` runs messages through `redactString`
      (`src/diagnostics/redaction.ts`); any GitHub-supplied message must go through it too, and
      tokens must never reach a diagnostic.
- [ ] Tests: `tests/unit/github/octokit-github-client.test.ts` — assert a 409 and a 500 each
      produce a diagnostic whose context carries the status; assert a token embedded in a GitHub
      error message is redacted.

**Acceptance:** a failure like this one reads "GitHub API request failed (409: Git Repository is
empty)" instead of an opaque `api_error`.

---

## Task 5 (optional) — Make `mutation_blocked` self-explanatory in the UI

Lower priority; only if Tasks 2-4 leave the diagnostic still confusing.

- [ ] `mutation_blocked` (`src/execution/mutation-guard.ts:19-23`) is a gate, not a cause. The
      guard already returns the real diagnostics right after it, but the UI gives them equal
      weight in the Diagnostics panel and labels the guard row "Assignment detail" (the fallback
      bucket in `ui/src/assignment-detail/assignmentDetailReadiness.ts:261-289`).
- [ ] Consider rendering the guard row as a header for the causes beneath it, and/or add
      `mutation_blocked` to the category map so it is not labelled "Assignment detail".

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

## Task 6 — Commit the CLI-resolution work (do first, independent of the rebuild)

- [ ] Commit the five files listed above. Until then the fix exists only in this working tree and
      in `ui/dist-electron`, which is why "we fixed it earlier" did not survive.
- [ ] Confirm `ui/electron/windowsGraiderCliResolver.test.ts` runs in `npm --prefix ui test`.

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

## Task 8 — Surface the run diagnostic that is already being computed

**File:** `ui/electron/commandRunner.ts:161-184` (`createProcessRunDiagnostic`).

- [ ] `ProcessRunDiagnostic` records `runnerMode`, `command`, `args`, `cwd`, `executablePath`,
      `helperPath` and — since Task 7 — `resolutionSource` (`env_override` | `bundled` |
      `development` | `path_shim`, or `null` when nothing resolved) on **every**
      `ProcessRunResult`, and no runner ever reads it — it is still dead data. Fold it into the
      start-error message so the failure reads like
      "tried bundled -> `...\dist-graider-cli\index.js` (missing)" instead of a generic
      "not found on PATH". Task 7 added the field; surfacing it is what remains.
- [ ] Log it to stderr when `GRAIDER_UI_DEBUG=1`, matching the existing convention in
      `ui/electron/tokenResolver.ts:55-62`.

**Acceptance:** one failed run tells you which mode was used and which absolute path was tried.

---

## Task 9 — Startup preflight for the CLI

- [ ] On app start, run `graider --version` once through the resolved path and record the outcome.
- [ ] Show the resolved mode and absolute path in the UI (settings or a diagnostics panel), so a
      failure reads as "it is looking here" rather than "it is broken".

---

## Task 10 — Rebuild the bundled CLI; it is stale

- [ ] `ui/dist-graider-cli/index.js` is dated 2026-09-08 08:47 while `src/` has changed since, so
      the packaged app runs an out-of-date CLI even once it finds one. `npm run build:cli` is part
      of `npm run package:win`, so a full repackage covers it — just do not ship a UI build without
      re-running `build:cli`.

---

## Task 11 — `assignmentTemplateSyncService` builds a runner with no CLI options

**File:** `ui/electron/assignmentTemplateSyncService.ts:84`.

- [ ] `createNodeProcessRunner()` is called there with **no** `graiderCli` options, so
      `resolveProcessRunRequest` passes requests through untouched. Today it only spawns `gh`
      (via `resolveGithubToken`), so it is not the current bug — but any `graider` invocation added
      there would spawn the bare command and fail with this exact ENOENT message.
- [ ] Pass the shared `processRunner` from `ui/electron/main.ts` in, or give this service the same
      `graiderCli` options, so there is one resolution path rather than two.

---

## Validation before calling any of this done

    cd C:\apps\graider
    npm run check      # typecheck + lint + format:check + vitest

For Part 2 also:

    npm --prefix ui run typecheck
    npm --prefix ui test

Then re-run the Task 1 apply against io2 and confirm 14/14 tracked.
