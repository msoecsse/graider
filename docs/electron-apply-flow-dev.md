# Electron Apply Flow Developer Guide

Reusable Electron UI safety rules live in the
[Codex Electron UI Contract](codex-electron-ui-contract.md). This guide covers
the concrete Apply Preview and Confirm Apply flow used by the assignment detail
UI.

## Purpose

This guide documents the boundary between:

```text
UI-2  = read-only assignment inspection
UI-3A = preview-only apply planning
UI-3B = confirmed apply mutation
```

The flow is:

```text
Assignment Detail -> Apply Preview -> Confirm Apply -> Apply Result Summary
```

Apply Preview is non-mutating. Confirmed Apply is mutating. Apply execution only
happens after explicit user confirmation.

## Commands

Apply Preview uses the assignment-scoped read-only CLI command. Standalone Apply
remains available through the CLI:

```bash
graider assignment apply-preview <assignment.yml> --json
graider assignment apply <assignment.yml> --json
```

Preview commands are run by the Electron main process with:

- `cwd = registered course folder`
- argv arrays, not shell-interpolated strings
- the existing token resolver (a guard-owned OAuth credential takes precedence)
- stdout JSON parsed in the main process
- structured result/error objects returned to the renderer

The apply-preview command is preview-only and must not create repositories,
write manifests, push files, dispatch workflows, publish reports, or generate
workflow files.

Confirmed GUI Apply uses `assignmentApplyBackend.cjs` in the main process and
delegates to the same assignment Apply orchestrator as the standalone CLI. The
course mutation guard supplies its OAuth credential through a separate main-only
scope, plus a live revalidation callback and the expected numeric account ID,
repository ID and course revision. No token or authorization capability is accepted
from the renderer or serialized as an environment assertion. Confirmation remains
required before entering this path.

The backend independently checks the token's account, repository identity,
authoritative Schema 1 metadata and default-branch revision. It rereads local Git
HEAD/origin and rechecks the live guard before each GitHub mutation. Managed
manifest paths use the separate runtime root; source repositories stay clean.
Retries, individual/group checkpoints, progress and partial recovery use the
existing Apply implementation.

Schema 1 GUI authorization binds to the discovered numeric repository ID. A stale
`course.repository` name does not replace that identity. The standalone CLI has no
live GUI capability and still requires configured repository locators to match
origin, independently verified authentication, schema and revision. Environment
flags cannot grant managed authorization. Schema 2 continues through its explicit
managed operation adapter.

Issue #58 reproduced a stale `course.repository` value with current source/cache
SHAs. GUI creation passed its numeric-ID guard, but GUI Apply launched the legacy
CLI and failed its configured-name/origin comparison. That CLI also independently
resolved environment/`gh` credentials, losing the verified GUI session. GUI Apply
now keeps the live guarded context through execution.

## Apply performance and safety

`summary.githubPerformance` reports aggregate phase timings and actual HTTP
attempt counts; its fields are defined in the
[CLI JSON contract](cli-json-contract.md#assignment-apply-assignmentyml---json).
The managed backend includes initial authoritative validation in readiness.
Authorization rechecks before each write are attributed to that write's phase.
CLI preAction validation, UI preview and UI session setup happen outside the
Apply command's timer. Total time also includes local configuration, manifest
and Git work. Phase time includes retry waits and, for individual operations,
manifest checkpoints. Group phase time covers its GitHub calls; local group
checkpoint time is included in the total.

Expected nullable 404s no longer produce Octokit console errors. Normalized
operation diagnostics still report authentication, authorization, rate limits,
missing required resources and other failures. Compatibility warnings use a
fixed message without request metadata. An Actions indexing 404 on a newly
created individual repository retains the existing deferred-verification
behavior; an existing tracked repository still receives missing-workflow and
dispatch diagnostics. Apply verifies dispatch support; it does not dispatch a
grading run.

Individual planning checks at most four repositories concurrently, in bounded
batches, and retains deterministic plan order. Readiness uses the same bound
for independent student-account lookups after authentication succeeds. Writes,
permission reads/writes,
Actions configuration, workflow deployment and manifest updates remain serial.
The readiness template snapshot is reused for initial manifest metadata within
one Apply; the adapter also avoids fetching identical template metadata twice.
Managed workflow deployment reuses a successful repository creation response.
Workflow existence and dispatch checks share one successful verification
observation, including a missing result. Failed reads are never cached, and a
new Apply obtains fresh observations. Account, OAuth, course authority,
collision and recovery checks are never memoized. Workflow ownership/content
checks and the prewrite file-SHA read remain intact.

### Controlled 30-student measurement (#59)

Measured with real Octokit and an entirely local fake HTTP transport, using
100 ms per request and virtual time. The baseline was measured before changing
production code at `69a842008a8e679b13e0ceba82b58beb8e150e0c` on
`remote-course-v2`. The assignment uses a template,
30 active students, no existing permissions, Actions already enabled, and the
managed Java preset when grading is enabled. Reruns use the saved manifest and
permissions. These are reproducible network-latency measurements, not live
GitHub wall times. They exclude the managed authority wrapper's additional
HTTP requests; its checks remain intact and add workload-dependent cost.

| Scenario                        | HTTP before → after | Elapsed before → after | Nullable 404s before → after |
| ------------------------------- | ------------------- | ---------------------- | ---------------------------- |
| New, grading disabled           | 312 → 306           | 31.2 s → 26.2 s        | 90 → 90                      |
| Rerun, grading disabled         | 157 → 156           | 15.7 s → 11.2 s        | 0 → 0                        |
| New, managed workflow indexed   | 492 → 426           | 49.2 s → 38.2 s        | 150 → 150                    |
| Rerun, managed workflow indexed | 277 → 246           | 27.7 s → 20.2 s        | 0 → 0                        |
| New, workflow not yet indexed   | 492 → 426           | 49.2 s → 38.2 s        | 210 → 180                    |
| Rerun, workflow still missing   | 277 → 246           | 27.7 s → 20.2 s        | 60 → 30                      |

For new managed provisioning, phase requests are 36 readiness, 30 planning,
90 creation, 120 permissions, 30 Actions, 90 deployment and 30 verification.
Both missing-workflow diagnostics per tracked repository remain present in the
last row, despite reading each workflow only once.

The measured gains are separable: bounded planning lowers its 30 unchanged
requests from 3.0 s to 0.8 s; bounded student-account lookups save another
2.2 s during readiness; template read elimination saves six requests
(0.6 s) on new Apply and one on rerun; creation-response reuse saves 30 reads
(3.0 s) for new managed provisioning; shared workflow verification saves 30
reads (3.0 s) whenever grading is enabled. Total managed provisioning improves
22.4%; rerun improves 27.1%. Reclassifying console 404s improves diagnostics,
without reducing requests. Remaining expected 404s include collision probes,
absent permissions and workflow content/SHA probes.

Further write concurrency was deliberately left out: each mutation revalidates
live authority, may fail after a remote side effect, and must checkpoint shared
manifest state. Parallel writes would require a separate correctness design.
Readiness still completes authentication before scheduling student-account
reads. No cross-Apply negative cache, polling
loop, retry-limit reduction or authorization cache was introduced.

At #59, the authority-inclusive benchmark ran the actual authoritative validator on
the fake course initially and before every write. It supplies fixed local Git
identity/revision inputs, includes the initial validation in its measurement,
and excludes UI session setup and local Git overhead. Both baseline and current
code were measured with the same transport; the baseline was replayed from the
parent source in a disposable directory.

| Managed preset with authority validation | HTTP before → after | Elapsed before → after |
| ---------------------------------------- | ------------------- | ---------------------- |
| New repositories                         | 1,460 → 1,394       | 146.0 s → 135.0 s      |
| Manifest-tracked rerun                   | 285 → 254           | 28.5 s → 21.0 s        |

That change improved new provisioning **7.5%** and rerun **26.3%** in the
controlled model. It retained 968 authority requests: eight initial requests
plus eight for each of 120 writes. The larger 22.4% gain above described the
provisioning core. The following focused optimization addresses this remaining
validator cost; neither measurement is a live end-to-end GUI speedup.

### Fresh authority validation optimization (#60)

Every mutation still obtains fresh observations. The validator now overlaps four
independent reads: authenticated account, repository identity, current
default-branch revision and `course.yml` pinned to the observed local HEAD.
File bytes count as evidence only after the fresh revision equals both local
HEAD and the operation binding, and after full remote Schema 1 validation.
All four reads settle before a failure returns, with deterministic diagnostic
precedence. This bounds this batch to four HTTP requests and prevents failed
reads from escaping into a later operation.

`getDefaultBranchCommitSha` now uses `GET /repos/{owner}/{repo}/commits?per_page=1`
without `sha`. GitHub resolves the current default branch for each request
([REST endpoint contract](https://docs.github.com/en/rest/commits/commits#list-commits)).
This removes the helper's redundant repository-metadata request, twice per
validation, and avoids a stale branch-name lookup. The validator's explicit
fresh repository identity/archived/access check remains. Template lookups still
specify their observed branch. The same helper also removes one redundant read
when recording each new student repository's initial commit.

After the initial batch and schema checks, a fresh default-branch revision is
checked again, then the account is checked again. These final checks remain
serial: parallelizing them could miss an account change during the final
revision request. Both managed live guard calls remain in their original order,
before and after remote validation. Their independent current-session,
permission, revision, schema and source observations cannot be replaced by an
unchanged commit SHA or a prior successful callback. The adapter removes an
unused preliminary local Git read; the validator reads HEAD/origin at the start
and now also at the end, including after the final live guard, blocking local
changes during network waits. No authorization or course-content cache is added,
and write ordering, manifest persistence, collision probes, recovery and retry/
rate-limit handling are unchanged.

Baseline `b40becc` was rerun before production edits with the same local Octokit
transport and 100 ms virtual HTTP latency. The extended benchmark now includes
initial validation in readiness phase diagnostics, so phase counts and elapsed
time sum to the measured total. The following is new provisioning of 30 student
repositories with indexed managed grading workflows:

| Phase                 | HTTP before → after | Simulated elapsed before → after |
| --------------------- | ------------------- | -------------------------------- |
| Readiness             | 44 → 42             | 2.2 s → 1.7 s                    |
| Planning              | 30 → 30             | 0.8 s → 0.8 s                    |
| Repository creation   | 330 → 240           | 33.0 s → 15.0 s                  |
| Permissions           | 600 → 480           | 60.0 s → 30.0 s                  |
| Actions configuration | 30 → 30             | 3.0 s → 3.0 s                    |
| Workflow deployment   | 330 → 270           | 33.0 s → 18.0 s                  |
| Verification          | 30 → 30             | 3.0 s → 3.0 s                    |
| **Total**             | **1,394 → 1,122**   | **135.0 s → 71.5 s**             |

This saves **272 requests (19.5%)** and **63.5 simulated seconds (47.0% less
time, 1.89× throughput for this serial scenario)**. Authority itself falls from
968 to 726 requests (**25% fewer**), with six requests and three network-latency
rounds per validation instead of eight serial requests. Removing authority
metadata reads saves 24.2 s; overlapping its initial reads saves 36.3 s; removing
30 creation metadata reads saves another 3.0 s. All 120 mutations remain serial;
peak read concurrency is four and peak write concurrency is one.

The manifest-tracked rerun performs no mutations: **254 → 252 HTTP** and
**21.0 s → 20.5 s** (2.4% less time). Only initial authority validation improves;
its readiness phase falls from 44 requests/2.2 s to 42 requests/1.7 s. Its other
phases are unchanged: planning 30/0.8 s, creation 0/0 s, permissions 60/6.0 s,
Actions 30/3.0 s, deployment 60/6.0 s, verification 30/3.0 s. Without the authority
wrapper, current new provisioning is 396 requests/35.2 s with grading, or
276/23.2 s without grading; reruns retain #59's counts and timings.

The benchmark executes the real authoritative validator and all prewrite
boundaries. It supplies fixed local Git identity/revision and excludes local Git
wall time, UI setup and the managed main-process guard callback's additional
remote access reads. Both callback invocations remain intact in production and
are covered by managed Apply regressions. These results measure the shared
validator improvement, not a measured 47% GUI wall-time gain. Permissions remain
the largest measured phase (30.0 s); authority still costs 36.3 s across 121
validations, and the unchanged live guard adds workload-dependent cost in the
GUI. Sharing live-guard evidence would require a separate typed authority
contract proving equivalent fresh identity/access/source checks; this change
does not infer that evidence from a successful opaque callback.

Adversarial GUI tests change account, permissions, repository identity, remote
revision, local HEAD/origin, local/remote schema or the live guard immediately
after creation, and assert that later collaborator/team mutations are blocked.
The created repository remains recoverable through the existing durable manifest
path. Validator tests also cover local changes during observations, account
changes during the final revision read, concurrent failure draining and retained
live guards. No live repository provisioning is involved.

Reproduce with `npx vitest run tests/performance/apply-latency.test.ts` and
`npx vitest run tests/unit/github/bounded-github-reads.test.ts`. Tests pin request
counts, phase counts, elapsed fake time, peak read/write concurrency, collision
blocking, and recovery from forbidden workflow writes. Existing behavioral,
OAuth, manifest-checkpoint and partial-failure suites remain required.

## IPC Boundary

The renderer uses narrow preload APIs:

```ts
window.graiderUI.getAssignmentApplyPreview({
  courseFolderId,
  courseFolderPath,
  assignmentFile
});

window.graiderUI.applyAssignment({
  courseFolderId,
  courseFolderPath,
  assignmentFile
});
```

The corresponding IPC channels are:

```text
graider-ui:assignment-apply-preview:get
graider-ui:assignment-apply:run
```

There is no generic `runCommand` IPC. There is no generic shell IPC. The
renderer does not access `child_process`, `fs`, or `process.env`, and it does
not import backend modules directly.

## Confirmation Requirement

Apply Preview auto-loads when the page opens. The apply entry point is disabled
when the latest preview has blockers, unknown repository rows, token-required
rows, non-success status, or error diagnostics.

When apply is available, the UI uses a full-page confirmation panel on the
Apply Preview page. The user first selects `Review apply changes`, then must
check the mode-specific acknowledgement:

```text
I understand this will apply changes to student repositories
I understand this will apply changes to group repositories
```

The final `Apply changes` button remains disabled until the checkbox is
checked. While apply is running, refresh/apply controls that could start
duplicate work are disabled, and the renderer guards against concurrent apply
calls.

For individual assignments, the confirmation panel states:

```text
This will create or update student repositories.
This may write manifests/local apply state if the backend apply command does so.
This may push files/commits to GitHub according to the existing apply implementation.
```

When the effective assignment grading configuration enables the
`java-junit-checkstyle` preset, confirmed Apply also ensures the canonical
Graider-managed `.github/workflows/grade.yml` after Actions is enabled and
before workflow verification. This works for template-backed and template-free
repositories. Apply updates only recognized Graider-managed workflows and
reports, without overwriting, an existing differing unmanaged workflow.

For group assignments, the preview renders one repository target per group and
the confirmation explicitly states that it creates or updates one shared
repository per group and grants every group member `admin` access. Group Apply
uses the same narrow `applyAssignment` IPC boundary; it does not add an
Electron-specific mutation API. Its result renders group target summaries,
shared student mappings, workflow warnings, and safe no-manifest diagnostics.
Individual result rows and manifest-v1 behavior remain unchanged.

## Preview vs Result Wording

Preview rows use future-tense labels:

```text
Would create
Would update
Would skip
Blocked
Unknown
Token required
```

Apply result rows use completed/action-result labels after execution:

```text
Created
Updated
Skipped
Failed
Blocked
```

Individual rows also carry a stable machine `reason` and target-scoped
`diagnostics`. A durable `created` or `updated` status is not replaced by
`failed` when a later target operation fails. The UI derives **Created with
issues** or **Updated with issues** when those successful outcomes have error
diagnostics, and renders the operation diagnostic beside the row. Older result
payloads without the optional fields remain parseable and receive a safe
status-derived reason.

Do not mix preview wording with result wording.

## Result States

The Apply Result Summary renders usable backend JSON for:

- `success`
- `partial_success`
- `failure`

When present, the UI shows command status, exit code, applied timestamp,
assignment file, manifest file, generated files, repository counts, and
diagnostics. Individual results show per-student rows. Group results show one
target per repository, its members, repository URL, and group/student-mapping
counts. Failed group Apply results identify the failing operation and make clear
that every observed repository identity was checkpointed for a safe retry.

The individual summary counts repository outcomes from the displayed rows,
not operation failure counters. Follow-up issue rows are reported separately.
Repository/student-scoped diagnostics remain in raw command JSON but are
shown primarily beside their row; only diagnostics without target identity
remain in the global panel, with a compact count pointing to row issues.

Safe command errors render bounded user-facing messages:

- missing token or GitHub/backend diagnostic: render the safe backend diagnostic
  message and code
- missing Graider CLI: `Graider CLI not found. Install Graider or make sure graider is available on PATH.`
- missing assignment file: `Assignment file not found.`
- invalid apply JSON: `Graider returned invalid apply JSON.`
- fallback command failure: `Unable to apply assignment.`

Diagnostics and command snippets must not expose tokens, authorization headers,
raw `process.env`, or raw stack traces by default.

## Deferred Actions

The apply flow does not implement:

- grade dispatch
- report generation
- student report publishing
- workflow generation UI
- artifact/result inspection
- workflow run inspection

Those actions must remain disabled or absent until a future slice explicitly
wires them.

## Stabilization Checks

When touching this flow, verify:

- Apply Preview calls only `getAssignmentApplyPreview`.
- Confirmed Apply calls only `applyAssignment`.
- Apply is unavailable when preview blockers exist.
- Apply cannot run twice concurrently.
- Result rendering redacts token-looking values.
- No grade, report, publish, workflow generation, artifact inspection, or
  workflow run APIs are wired.
- IPC remains narrow and typed.

## Manual Smoke-Test Checklist

Manual confirmed-apply smoke tests mutate GitHub/local apply state. Use only a
safe sandbox course.

Start Vite:

```bash
cd ui
npm run dev
```

Start Electron in another terminal:

```bash
cd ui
npm run dev:electron
```

Checklist:

- [ ] Load dashboard.
- [ ] Open assignment detail.
- [ ] Open Apply Preview.
- [ ] Confirm preview auto-loads.
- [ ] Confirm preview rows use `Would ...` wording.
- [ ] Confirm Apply is disabled when blockers exist.
- [ ] Confirm Apply requires explicit confirmation when allowed.
- [ ] Execute apply on a safe test fixture/course only.
- [ ] Confirm duplicate execution is disabled while applying.
- [ ] Confirm result summary renders.
- [ ] Confirm result rows use completed wording.
- [ ] Confirm diagnostics render safely.
- [ ] Confirm Back navigation still works.
- [ ] Confirm grade/report/publish/workflow buttons are not wired.
