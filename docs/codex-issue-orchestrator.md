# Serial Codex issue orchestrator

This developer tool runs outside Graider Electron. It never starts on app launch.
It implements the workflow in [the agent contract](../agent-workflow-contract.md).
**Issue execution is disabled under the amended faculty decision in
[#42](https://github.com/msoecsse/graider/issues/42), tracked by
[#41](https://github.com/msoecsse/graider/issues/41).** Dry-run inspection remains
available. `--execute`, including `--resume`, fails before agent startup, checkpoint
changes or host validation. No plan option overrides this gate. The execution
workflow below describes the earlier implementation; it is not currently enabled.

Run it only in an exclusively assigned development worktree: its common-Git-directory
lock excludes other runner instances, but cannot lock unrelated editors or agents.
Do not run another coding agent in that checkout while the runner owns it.

## Installation and prerequisites

- Node 24, repository dependencies installed with `npm ci`, and UI dependencies
  installed with `npm ci --prefix ui` (required by repository validation).
- An authenticated official Codex CLI with app-server v2, experimental dynamic
  tools, and access to the exact models selected by execution labels. The protocol
  was checked against Codex CLI 0.167.0. No SDK dependency is added.
- GitHub CLI `gh` authenticated for `msoecsse/graider`. The initial implementation
  verifies a classic OAuth/PAT `repo` scope from GitHub response headers, repository
  push permission, enabled issues, and a nonarchived repository. Fine-grained or
  app credentials whose issue/contents write grants cannot be inspected are
  rejected as indeterminate. No write probe creates temporary issues or commits.
- Clean `remote-course-v2` checkout at the explicitly recorded HEAD, with origin
  pointing to `msoecsse/graider`. Runner Git uses existing bundled Dugite infrastructure.
- On Windows x64, pass the native Codex executable using `--codex` if installation
  exposes only an npm `.cmd` shim. Processes use executable/argument arrays without
  a shell; npm runs through Node and `npm_execpath`. Paths may contain spaces.

Use `codex login` and `gh auth login` separately. Never put credentials in plans,
issue text, command arguments, reports, or version control.

## Plan and launch

Create an operator-reviewed JSON plan **outside the repository**. Replace the
example HEAD with the verified current commit. This is the later intended queue,
not authorization to run it while implementing #40. Its preflight must reject #15
while the blocked label remains. A human must verify dependencies and legitimately
update that issue before launching the complete queue.

```json
{
  "repository": "msoecsse/graider",
  "branch": "remote-course-v2",
  "expectedHead": "0000000000000000000000000000000000000000",
  "issues": [
    { "number": 26, "dependencies": [], "phase": "9", "audit": false },
    { "number": 15, "dependencies": [26], "phase": "9", "audit": true }
  ],
  "requiredChecks": [
    "Normal checks",
    "Grading local boundary (Windows x64)",
    "Grading local boundary (macOS arm64)"
  ],
  "authorization": {
    "repository": "msoecsse/graider",
    "branch": "remote-course-v2",
    "cliFallback": true,
    "operations": [
      "issue-create",
      "issue-update",
      "issue-close",
      "issue-label",
      "commit",
      "push",
      "validate"
    ]
  }
}
```

Run from the repository root. State directory must be outside the checkout and
its parent must already exist. Use a new state directory for a new approved plan.

```text
npm run orchestrate -- --plan <plan.json> --state <external-report-directory>
npm run orchestrate -- --plan <plan.json> --state <external-report-directory> --execute
npm run orchestrate -- --plan <plan.json> --state <external-report-directory> --execute --resume
```

The default is dry run: display ordered issues and chosen models after validating
permissions, branch, worktree, labels, and dependencies. No agent or GitHub mutation
starts. `--execute` explicitly approves the plan's scoped routine delegation.
The plan is fingerprinted into the checkpoint; resumption requires the same plan.
The runner currently targets this repository and development branch deliberately.

Labels map `codex:luna-low` to `gpt-6-luna`/low, `codex:sol-medium` to
`gpt-6.1-sol`/medium, and `codex:sol-high` to `gpt-6.1-sol`/high. Exactly one
execution label and `context:fresh` are required. No model substitution or context
resumption is permitted. Dependencies are the union of plan entries, GitHub native
blocked-by dependencies, and explicit `depends on #N`, `blocked by #N`, or
`requires #N` text. Put every additional dependency explicitly in the plan; the
runner cannot infer arbitrary prose. Dependencies outside the queue must already
be closed. Queue dependencies must precede the issue. Blocked and human-decision
labels stop preflight even if a predecessor is in the queue.

All entries must belong to the same operator-verified phase. Any title containing
“audit” must be marked `audit: true`, and audits must be the final entry. Review
issue scope when assigning phase metadata; the runner cannot infer phase semantics
from arbitrary text. Never add next-phase work to an audit queue.

## Execution and authorization

### Amended isolation requirement and current limitation

The Codex 0.167.0 probe demonstrated a native `apply_patch` edit without a broker
call or approval. A bounded broker cannot constrain native file editing. Do not
try to suppress that surface with unsupported configuration flags, or use
post-execution events as a pre-execution enforcement boundary.

The approved replacement is isolated, disposable **per-issue execution**:

- Use an independent disposable copy, with no shared writable Git metadata,
  credentials or protected paths from the authoritative checkout. A linked Git
  worktree, copied directory, reduced environment or thread sandbox declaration
  alone does not prove that boundary.
- Verify OS enforcement around the entire agent process and every validation
  descendant on macOS arm64 and Windows x64. Routine operations within that
  workspace should run without repeated approvals. Keep sandbox/network
  restrictions; never use unrestricted host execution.
- Host credentials must remain inaccessible even to modified build scripts,
  tests, dependency hooks and native file-editing tools. Agent GitHub operations,
  commits and pushes are forbidden; the supervisor owns those capabilities.
- Only the supervisor may promote a verified result. Recheck the authoritative
  baseline and approved paths, file types/content integrity and unsafe deletions,
  then require isolated validation before promotion. Any isolation, integrity or
  validation uncertainty stops promotion and execution.
- Prove hostile native edits, path/link escapes, Git metadata and credential
  access denial, network denial, hostile validation, cancellation and recovery on
  both native targets before enabling execution. Preserve failed-run evidence.

The current repository has no verified whole-process isolation adapter or safe
promotion implementation. A local macOS sandbox launch in the managed development
environment failed with `sandbox_apply: Operation not permitted`; no installed
VM/container runtime was found. This is an environment limitation, not proof that
isolation is impossible elsewhere. Windows enforcement has not been established.
The official [OS sandbox documentation](https://learn.chatgpt.com/docs/agent-approvals-security)
describes platform mechanisms; it does not verify this supervisor's boundary.
Consequently `AppServer.assertIsolation()` fails closed, and both the CLI and
supervisor reject issue execution before launching an agent or running untrusted
validation in the authoritative checkout. Protocol fixtures test approval handling
only; they do not certify OS isolation. Keep #41 open until all isolation,
promotion, validation and native CI acceptance criteria are met.

The original interrupted #26 checkpoint and lock must never be reused or removed
by this work. Preserve the original evidence and broker-bypass probe. A new #26
dry-run plan is deferred until #41 is fully verified and closed. Do not execute
#26, #15 or Phase 10.

### Earlier execution workflow (disabled)

The runner starts a new app-server process and `thread/start` for every issue.
It checks Codex authentication and model/effort availability, keeps
`workspace-write`, restricted network access, and `untrusted` approval policy,
and supplies the repository contracts and issue text. No turn is resumed.

The `repository_development` dynamic tool permits only the declared issue actions
against the fixed repository and a fixed list of npm validation scripts. It never
accepts arbitrary executable names or shell fragments. Mutation output is withheld.
The supervisor owns committing, pushing, CI verification, and queue issue closure.
It performs required validation after agent completion, uses a normal push, checks
the remote SHA, and requires exactly one successful result per configured CI check.
Missing/pending checks wait up to one hour; failure, cancellation, duplicate checks,
or indeterminate conclusions stop progression. It never silently retries an
implementation failure. Required checks must cover the repository's full required
CI set; the example includes normal checks and both production platform targets.

Standalone app-server has no access to this conversation's GitHub connector. The
runner therefore uses the explicitly authorized authenticated CLI directly. The
transport selector also supports a permission-probed connector adapter: only an
explicit 403 and authorized fallback select CLI; other connector errors stop.
It does not replay a failed mutation through another transport. A connector 403
does not establish that the user's account lacks repository permissions.

The earlier broker delegates GitHub mutations and host validation; these are not
safe agent capabilities under the amended architecture and remain unreachable
through the disabled supervisor. They must be replaced before execution is enabled.

Routine delegated operations do not need repeated approval. Other command/file
approval requests display a redacted preview and ask for a **single-request** yes/no
decision. The protocol adapter serializes prompts and retains one terminal for the
invocation. Only `yes` accepts and `no` explicitly denies. Noninteractive input or
EOF reports unavailable authorization; cancellation, invalid answers and input
errors have separate redacted reasons. Unsolicited answers cannot grant later
requests. The first failure wins, cancels active/queued prompts and prevents late
grants. No session-wide grant or policy amendment is accepted. Permission-expansion
requests, unknown request types, and genuine
human decisions stop for operator intervention. Known destructive requests are
rejected outright, even if routine delegation exists. Blocked/human-decision issues
cannot be automatically closed. Sandbox and organization restrictions remain
authoritative; a rejected operation stops the run.

## Cancellation and recovery

Ctrl+C/SIGTERM requests turn interruption and closes the app-server. Cancellation
also aborts host child processes. The runner waits for shutdown with a bounded
grace period. Any failed run preserves the common-directory
`graider-orchestrator.lock`; do not remove it until the app-server and all its
descendants have exited and no other agent owns the checkout. Abrupt termination
also leaves the lock. Lock removal is a deliberate operator recovery action.

`--resume` advances only from completed issue boundaries. It verifies the completed
prefix, issue closure, plan fingerprint, and HEAD, and revalidates pending issues.
An in-progress checkpoint is never automatically retried, even if the worktree
looks clean. Inspect Git history, remote SHA, issue state, CI, and reports, then
finish/reconcile the interrupted issue manually. Start a new reviewed plan/state
directory for the remaining issues. Never blindly edit a checkpoint to suppress
a failure. A completed audit ends the queue.

## Reports and timing

The external state directory contains `checkpoint.json`, `timing.json`, a final
`report.txt`, and per-issue JSON/text reports, including stopped in-progress issues.
Reports retain safe structured event names/IDs, timestamps, durations and check
metadata, without raw agent text, commands, subprocess output, tokens, or headers.
Console approval previews redact known secret environment values and token formats;
operators must still avoid putting secrets in commands.

Local elapsed timing uses a monotonic clock; event timestamps use UTC wall time.
Exclusive attribution splits overlapping intervals with precedence: approval,
test, build, lint, typecheck, other tool, Codex, CI wait, other blocking, unclassified.
These categories sum to observed local wall time; raw intervals are available for
inclusive analysis and must not be summed. Codex intervals measure the harness
turn, not model inference alone. Identifiable npm commands and host validation
have their own categories; compound/unidentifiable commands remain tool time.
Shell-internal subprocess timing and inference-only time are unavailable.

Approval counts, individual waits, longest wait, and cancellation/denial waits
come only from actual app-server requests, client responses, resolution events,
or cancellation. Console silence never counts as an approval wait. Requests are
reported even if the supervisor stops without granting them.

CI execution timing is the union of required remote check start/end intervals,
reported separately from local wall time. Missing/invalid timestamps produce null
(unavailable). Actual CI **queue time is unavailable** from the check-run interface;
check creation is not assumed to be queue entry. Local CI polling is measured as
`ci-wait`. Unknown gaps remain unclassified. A hard process kill may lose timing
since the last completed report; the checkpoint still prevents automatic replay.

## Verification and integration references

Focused deterministic tests:

```text
npx vitest run tests/unit/orchestrator.test.ts
```

Run the shared development contract's full root validation before committing.
The platform CI matrix runs these fixtures on Windows x64 and macOS arm64.
No automated test uses a real GitHub token, live GitHub, or a real Codex turn.

The official [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) supports
programmatic threads and streamed execution. [App-server](https://learn.chatgpt.com/docs/app-server)
was selected for its bidirectional approval requests, `serverRequest/resolved`,
item events, and turn interruption. Dynamic tools are experimental; unsupported
versions fail closed. The installed CLI JSON schema was inspected with
`codex app-server generate-json-schema --experimental`; no generated schemas or
credential/session state are committed.
