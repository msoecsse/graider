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
promotion implementation. The November 10 assessment found a denied nested macOS
sandbox launch and no VM runtime on PATH. The November 17 development-host proof
below supersedes that runtime inventory: QEMU/HVF can now boot a disposable Linux
guest. It does not establish native macOS or Windows validation or safe promotion.
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

### Development-host isolation assessment (2026-11-17)

Host: macOS 14.7.6, Apple Silicon arm64. Installed CLI: `codex-cli 0.167.0`.
The existing gates in `index.ts`, `runner.ts` and `AppServer.assertIsolation()`
remain authoritative and unchanged. The earlier raw protocol adapter still
inherits the host environment and exposes host validation/GitHub broker actions;
it must never become the isolated executor merely by removing the gate.

**Approval compatibility:** installed `codex --help` lists `on-request` and
`never`; `codex --ask-for-approval untrusted --help` exits 2. A newly generated
experimental app-server schema still includes `untrusted`, illustrating why
schema acceptance is insufficient. Current official
[approval guidance](https://learn.chatgpt.com/docs/agent-approvals-security) and
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
retire explicit `untrusted`. Do not restart the historical configuration below.
An eventual unattended guest must use a verified supported policy (`never`, with
`workspace-write` and network restrictions retained), deny permission expansion,
and rely on the outer VM for whole-process containment. This is a future adapter
requirement, not an approval-policy change to the disabled runner.

**Native process sandbox:** a minimal deny-default `sandbox-exec` invocation
inside this managed session still exits 71, `sandbox_apply: Operation not
permitted`. An explicitly approved host-level invocation of the same profile
aborted with exit 134. The latter does not establish that Seatbelt is unavailable
on the host, nor that its policy successfully isolates a working toolchain.
Neither result is successful containment evidence. No unrestricted issue agent
was launched to work around either result.

**VM foundation:** QEMU 10.0.2 successfully booted Alpine Linux aarch64 with
`-machine virt -accel hvf -cpu host`. The probe uses explicit HVF, without an
accelerator fallback. QEMU's [security model](https://www.qemu.org/docs/master/system/security.html)
requires supported hardware virtualization for security guarantees and explicitly
excludes TCG emulation. Advertising HVF in help or keeping a paused VM alive was
not counted as boot/containment evidence.

The probe supplies a checksum-verified kernel and a generated RAM-only initramfs.
It has `-nodefaults -display none -serial stdio -monitor none -nic none`, no host
directory shares, no block devices, no guest agent, no clipboard or credential
forwarding. Only the kernel/initramfs and bounded process I/O cross the boundary.
Guest work runs as `nobody`, with a fresh writable `/work`. Fake host credentials,
Git metadata, protected files and a sibling workspace exist only under the new
disposable evidence directory; no real credential files are read or copied.

| Probe                                                                  | Observed result                                                     | Scope of evidence                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Guest native file creation and `sed` editing                           | PASS, two fresh boots                                               | Ordinary native guest file I/O, not by itself Codex `apply_patch`                               |
| Fake protected host, `.git/config`, credentials and sibling read/write | PASS; host SHA-256 values unchanged                                 | Direct absolute paths are absent from the guest namespace                                       |
| Symlink, hardlink and `/proc/1/root` path escapes                      | PASS, access failed                                                 | Disposable host canaries only                                                                   |
| Network attempts                                                       | PASS; external HTTP and loopback connection fail; only `lo` exists  | No NIC; no model gateway or dependency download access                                          |
| Hostile validation shell and its child                                 | PASS; host file access/network failed, guest output created         | Actual descendants in the guest, not a mocked command runner                                    |
| Cancellation and fresh restart                                         | PASS; SIGTERM reaped QEMU; next boot had no previous workspace edit | All guest processes die with the VM; production crash recovery remains unimplemented            |
| Linux Codex 0.167.0 with scripted loopback Responses                   | PASS, fixture-only response completed                               | No model credentials, inference or real issue execution                                         |
| Native Codex `apply_patch` in the same guest                           | FAIL: `Failed to write file /work/native-codex.txt`                 | Both initramfs and tmpfs workspace attempts failed; later hostile native edits were not reached |

Local evidence is under `/private/tmp/graider-41-host-proof-yas7jxtj`: `proof.py`,
`result.json`, `guest-1.log`, `guest-2.log`, fixture files, generated schema and
package/checksum metadata. Alpine 3.24.4 rootfs SHA-256:
`4b14c18f7e90a063b61462ea1462a5732c154bf6adad594974fe6487cd98a8de`;
source virtual ISO SHA-256:
`cf88d8ba67389d20d9ed307366b52e487c15d7d3ee3233b62b95f709daa1d430`.
Both matched the publisher's HTTPS release manifest before boot. These identify
the disposable fixture, not an approved production image/runtime version.
The official Linux Codex package matched its npm SHA-512 integrity metadata;
`codex-guest-http-1.log` records the completed fixture response, while
`codex-guest-native-valid-1.log` and `codex-guest-native-tmpfs-1.log` record the
native-tool failures. `codex-native-proof.py` and `codex-native-tmpfs-proof.py`
retain their sources. Guest-only loopback served scripted Responses with the
supported `never`/`workspace-write` configuration and network restrictions kept.
No native-write success or working inner command sandbox is inferred from these
failures; the underlying write failure has not been diagnosed. The minimal guest
is not yet a demonstrated Codex executor. Stop adapter implementation here rather
than removing sandbox controls to make this fixture work.

This is a viable development-host VM foundation, **not security acceptance for
unattended execution**. Native Codex editing, its inner sandbox, credential-free
model transport, native macOS/Windows validation, trusted export/promotion and
crash recovery must all pass before the execution gate can change. No production
isolation adapter, promotion code, plan flag or unattended issue execution is
introduced by this assessment. Failed exploratory fixtures remain evidence, not
passing checks. The original interrupted checkpoints/locks are never opened for
execution or reused.

### Native-edit follow-up (2026-11-18)

**The development fixture's native write failure is resolved; execution remains
disabled and #41 remains open/blocked.** This is Linux arm64 guest evidence only.
The native macOS/Windows adapters, credential-free model relay, supervisor
promotion/integrity and crash recovery acceptance above remain outstanding.
The unrelated dependency audit blocker [#65](https://github.com/msoecsse/graider/issues/65)
is separate from this diagnosis.

**Observed failure:** a fresh credential-free HVF boot reproduced
`Failed to write file /work/native-codex.txt`. Ordinary writes by `nobody` to its
owned mode-0700 `/work` succeeded. Guest syscall tracing then showed Codex's native
filesystem helper launching `codex-linux-sandbox` and bundled Bubblewrap. Both
Bubblewrap's capability probe and the actual helper failed at
`pivot_root("/tmp", "oldroot") = -1 EINVAL`, before a target-file write. This was
an inner-sandbox setup failure, not evidence of an unwritable workspace or a
successful native-edit boundary. A broad initial trace did not complete the
fixture and is retained as failed diagnostic evidence.

**Cause and bounded correction:** the guest was still running on Linux's initial
rootfs. The [Linux `pivot_root` contract](https://man7.org/linux/man-pages/man2/pivot_root.2.html)
explicitly rejects that rootfs and recommends switching root during boot. Changing
only the bootstrap to copy the disposable guest files into a new RAM-only tmpfs
root and `exec switch_root /newroot /guest-init` allowed the same native creation
to succeed. A confirmation trace recorded successful `pivot_root` and seccomp filter
installation in the filesystem helper. No host files or mounts were added. This controlled comparison and
the failing syscall establish the boot-layout cause; no Codex binary patch or
sandbox bypass was needed. The committed
[guest PID-1 bootstrap](../tests/fixtures/orchestrator-native-edit/bootstrap.sh)
is development fixture input, never a host command or production adapter.

**Independent enforcement observations:** the final fixture ran twice from fresh
RAM-backed boots, without a tracer. It used the same pinned Alpine/Codex inputs,
explicit HVF, no NIC, shares, disks, guest agent or credential forwarding, and
`nobody` with `never` + `workspace-write` + `network_access = false`. It additionally
set `exclude_slash_tmp = true` and `exclude_tmpdir_env_var = true` to restrict
native writes to `/work` (retaining Codex's protected workspace subpaths).
A guest-only loopback endpoint supplied scripted Responses; no inference or
model/GitHub credentials were used.

- Native create, update and delete succeeded; guest assertions checked final
  bytes and deletion, independently of the model response.
- Each of 14 hostile patch attempts ran independently and was rejected: update
  and add at four fake host protected/Git/credential/sibling paths, a protected
  guest file, file/directory symlinks out of `/work`, workspace `.git/config`,
  `/tmp` and parent traversal. Absent host-path reads returned `ENOENT`; direct
  outside writes were policy-rejected; symlink writes reached the helper and
  failed. Host canary hashes and protected guest/Git bytes stayed unchanged.
- An actual Codex `exec_command` descendant wrote `/work/native-command.txt`,
  failed protected-file and `/tmp` writes, and could not reach the guest fixture
  server from its network namespace. It reported `Seccomp: 2`, `NoNewPrivs: 1`
  and exit zero after those assertions. Ordinary hostile validation descendants,
  host path/link/proc escapes and external network denial also passed.
- Both QEMU processes were terminated/reaped; the next boot began without the
  preceding workspace edit. This verifies these disposable probes, not production
  crash recovery or a future model relay.

The [scripted native cases](../tests/fixtures/orchestrator-native-edit/native-cases.ts)
catch each rejection separately. Deterministic offline regressions verify that a
failure cannot suppress later attempts and reject missing/duplicate/unexpected
outcomes, successful hostile writes and the original failed benign write. The
[concise observed outcomes](../tests/fixtures/orchestrator-native-edit/observed.json)
retain both manual boots and input digests. These CI tests check fixture coverage
and evidence interpretation; they do **not** run HVF or certify OS isolation.

New local evidence: `/private/tmp/graider-41-native-edit-2jax2fgj`, including
`reproduce.py`, `trace-mount.py`/`trace-mount-guest-1.log`, `switch-root.py`,
`reviewed-proof.py`, `reviewed-guest-{1,2}.log`, `reviewed-result.json`,
`reviewed-trace.py`/`reviewed-trace-guest-1.log`, checksum
metadata and validation logs. `reviewed-proof.py` consumes the reviewed bootstrap
and native case bytes captured in `reviewed-fixture.json`; its only endpoint is
inside the no-NIC guest. Raw requests are local diagnostic artifacts, not public
attachments. The previous November 17 evidence manifest was rechecked: all 523
entries are unchanged. Historical failed-run checkpoints/locks were not reused
or modified. No executor, unattended mode, #26/#15 execution or Phase 10 work is
introduced by this follow-up.

### Slice 2A: disposable development VM lifecycle (2026-11-18)

The supervisor-only [typed lifecycle](../scripts/orchestrator/vm/contracts.ts)
now has a [QEMU/HVF implementation](../scripts/orchestrator/vm/qemu.ts), separate
from `Agent`, the serial queue and the closed execution gate. It supports
create/start, bounded guest executable/argv execution, byte-only put/get,
shutdown and destruction. **This is a Linux arm64 development adapter, not native
macOS/Windows validation acceptance or permission to execute issues.** Unsupported
platforms, runtime drift and unavailable HVF fail closed; no TCG or host-command
fallback exists.

[Reviewed inputs](../scripts/orchestrator/vm/reviewed-inputs.json) pin QEMU 10.0.2,
Node 24.21.0, the watchdog, the complete non-system linked library closure,
macOS kernel/build, kernel and complete guest image hashes. Before creation and
again before launch, the adapter checks `kern.hv_support = 1`, the reviewed OS
build, file digests, canonical library identities and transitive loader paths.
Unresolved loader searches are rejected. Apple system libraries and OS tools are
part of the pinned host OS trust base. The host and reviewed source remain trusted;
this does not protect against a hostile host administrator changing binaries
during launch. Input changes require review and renewed native enforcement probes.

The [offline image builder](../tests/fixtures/orchestrator-vm/build-image.py)
consumes the prior checksum-verified Alpine rootfs/kernel and official Linux Codex
package. It never extracts or runs guest files on the host. It incorporates the
proven PID-1 tmpfs-root bootstrap and the bounded guest serial transport. Rebuild
using `python3 tests/fixtures/orchestrator-vm/build-image.py <reviewed-input-directory>
<new-output-directory>`; its complete output digest must match the reviewed pin.
Do not fetch new inputs, regenerate pins automatically, or treat an arbitrary
operator-supplied digest as reviewed.

Every instance gets a new private directory and RAM-only `/work`, with commands
running as `nobody`. Start is single-use: another execution requires another
instance. Host and guest launches use explicit clean environments. Fixed QEMU
arguments select only `-accel hvf -cpu host`, with no default devices, NIC,
monitor, disks, host mounts, shared Git metadata, host sockets or credentials.
Successful boot with that reviewed executable and sole accelerator is required;
an advertised accelerator or a configuration echo is insufficient. Guest loopback
is available only inside the VM; there is no external networking or model relay.

The anonymous serial pipes transport bounded base64 bytes and NUL-delimited argv.
No returned guest path is opened on the host. Commands have at most 128 arguments
and 16 KiB of argv; transfers and each output stream are capped at 64 KiB, frames
at 256 KiB, cumulative received bytes at 8 MiB. Startup/verification and commands
are bounded by 30 seconds; the independent watchdog limits the complete VM lease
to 120 seconds. Output capture uses bounded guest pipes, without imposing a small
file-size limit on Codex's own executable/helper files. Transfers accept only a
narrow relative path syntax and reject protected path components; guest helpers
reject links/nonregular files. Returned bytes are still untrusted. This API is
**not** the later frozen candidate manifest, baseline export or promotion validator.

The pinned watchdog starts QEMU in its own process group. Caller pipe/IPC loss,
signals, transport failure and lease expiry terminate that group, escalate after
250 ms, wait for child/stream closure and verify group absence. Shutdown allows
five seconds for verified reaping. QEMU crashes, malformed replies, output overflow,
startup failure, operation timeout and cancellation stop the lifetime. If reaping
cannot be verified, destruction refuses to discard resources. A watchdog killed
abruptly cannot provide a reaping attestation: retain the run for operator
reconciliation; never infer reaping from a stale PID or automatically resume it.

`destroy()` removes only that instance's disposable payload after verified exit;
its private state directory retains structured `evidence.json` and independent
`watchdog.json` (including after caller death). They contain event codes, times,
runtime digest, process identity, exit status and byte counts; no commands, raw
output, environment, tokens or exception text. Creation failures retain a redacted
input-failure event. After a supervisor crash, retain the in-progress evidence and
create a new instance; no old checkpoint, lock or workspace is reused.

Deterministic lifecycle/input/watchdog tests run on ordinary CI without a VM or
credentials. They cover cancellation, bounded timeouts/output, drift, protocol
failure, concurrent operations, startup interruption, caller loss, forced kill,
lease expiry and refusal to attest/discard an unverified process group. They do
not certify hardware isolation. Actual adapter probes reran the successful hostile
native-edit cases in two fresh HVF boots with guest byte assertions, independent
fake host canaries and the actual sandboxed command descendant. Separate real
probes cover byte/argv transfer, failed startup, cancellation, QEMU crash, frozen
QEMU forced kill, abrupt supervisor death and fresh recovery. Concise results and
local evidence locations are retained in the
[observations](../tests/fixtures/orchestrator-vm/observed.json).

Native macOS and Windows validation adapters, model relay, full-checkout baseline
export, candidate integrity/promotion and broader architecture acceptance remain
outstanding. No production integration, authoritative checkout promotion, real
issue execution, gate change, #26/#15 execution or Phase 10 work is introduced.

### Slice 2B: bounded supervisor baseline import (2026-11-18)

The supervisor-only [baseline component](../scripts/orchestrator/baseline.ts)
captures and verifies one small tracked baseline in a fresh Slice 2A guest, then
destroys that guest. Its only result is a supervisor receipt; it exposes no live
executor, CLI/Agent integration, model relay, candidate promotion or GitHub/Git
mutation capability. **Execution remains disabled and #41 remains open/blocked.**

Under the existing common-Git-directory `graider-orchestrator.lock`, it checks the
authorized repository, branch and exact HEAD. Read-only bundled Git plumbing
compares the complete tracked tree/index and detects untracked, nonignored files.
It never invokes `status`, content filters, hooks, dependency installation,
repository scripts, tests or validation while processing the baseline. Git has a
clean environment, disabled fsmonitor/hooks/lazy fetching, no ambient global/system
configuration or credential variables. Ignored untracked files are never exported.

The canonical manifest records issue/repository/branch/HEAD and sorted paths, Git
modes, byte sizes and SHA-256 digests. Capture bounds each read, verifies raw Git
blob identity without filters/line-ending conversion, rejects links, hardlinks,
nonregular files, special permissions and path aliases, and checks file/parent
identities before and after reading. This also detects dirty bytes hidden by
assume-unchanged/skip-worktree index flags. Source paths must fit the current ASCII
transport syntax; absolute, traversal, drive/UNC/device/ADS, reserved Windows names,
trailing dots, short-name syntax, case-fold/prefix collisions and protected
Git/credential/configuration components fail closed. No tracked file is silently
omitted. Source mode/identity/byte checks and authoritative Git identity are repeated
after verified VM shutdown, before success and lock release. The lock still
requires an exclusively assigned checkout; it does not exclude unrelated editors
or a hostile host administrator.

A new private external directory retains the manifest, its receipt digest and VM
identity/evidence. Only captured regular-file bytes cross anonymous serial pipes;
there are no host mounts, shared `.git`, homes/configuration, credentials, GitHub
authority or sockets. Fixed guest commands inventory the initially empty workspace
and set/check canonical file modes. Before and after bounded readback, inventory
must contain exactly the expected directories and regular files, with no extra
entries, links or mode/size discrepancies. The supervisor hashes returned bytes
itself; guest exit status, inventory and bytes are untrusted inputs, never a guest
claim of acceptance. No repository executable is run. Every exit destroys only
this guest after attested shutdown; uncertain reaping retains its payload. Failure
retains the new lock and redacted evidence for deliberate operator reconciliation.
Historical interrupted checkpoints, locks and evidence are never used or changed.

Admission bounds are **65,536 bytes/file, 256 files, 1,048,576 total source bytes,
65,536 serialized manifest bytes and 240 ASCII bytes/path**. Host Git metadata is
bounded at 262,144 bytes. These conservative Slice 2B bounds do not enlarge Slice
2A's unchanged 64 KiB transfer/output, 256 KiB frame, 8 MiB cumulative receive,
30-second operation/startup and independent 120-second VM lease limits. The import
also has a 120-second overall cancellation deadline. A limit, truncation, partial
transfer, malformed response, timeout or digest mismatch fails closed; there is no
chunking/streaming fallback. Unsupported host/runtime platforms are rejected before
source capture, including Windows until reviewed native reparse-point metadata and
a native VM adapter exist. Cross-platform deterministic tests mock that platform
gate and VM; their portable path/Git/filesystem checks are not native isolation
acceptance.

**Full Graider import is blocked by [#72](https://github.com/msoecsse/graider/issues/72).**
The starting tree `2d573f9c0c8e54662d9f0f9d9c4860897a603d31` has 1,527 tracked
files / 12,629,114 bytes; 20 files exceed the existing per-file transport cap.
For example, `docs/graider-remote-course-architecture.md` is 251,877 bytes and
`ui/package-lock.json` is 220,738. Importing this complete baseline requires a
separately reviewed bounded transport/resource plan, not larger constants, file
omission or weaker verification. Slice 2B stops at the independently verifiable
small-baseline component.

[Manual observations](../tests/fixtures/orchestrator-baseline/observed.json)
record two fresh pinned HVF imports with empty/binary/executable/exactly-64-KiB
files, deterministic manifest digests, byte/mode verification, independent reaping
and disposable-payload removal. A third fresh boot proves cancellation after
confirmed HVF startup, failure/lock retention and reaping; a fake host canary stays
unchanged. These are actual Linux arm64 guest observations. Deterministic failure
tests separately cover source/HEAD/index drift, unsafe tracked entries, path
aliases, limits, malformed manifests/inventories, partial transfer, cancellation,
cleanup uncertainty and digest mismatches. They do not certify hardware isolation,
native macOS/Windows validation, full Graider import, a hostile guest kernel or any
later relay/promotion boundary. All existing execution, authorization, audit and
CI gates remain unchanged.

### Slice 2C1: bounded full-checkout transport proposal (2026-11-18)

**Design for review, not approved production integration.** This slice of
[#72](https://github.com/msoecsse/graider/issues/72) records a resource/framing
review and a separate synthetic-file feasibility experiment. It does not meet
#72's complete-checkout/native acceptance. #72 stays open; #41 stays open/blocked,
and unattended execution stays disabled. The Slice 2A transport, reviewed image,
watchdog and Slice 2B admission/component are unchanged. No established isolation
assumption needs to change for this proposal. Human review of the proposed bounds
and guest implementation is required before a later implementation slice.

#### Fresh tracked-checkout measurement

The read-only [sizing fixture](../tests/fixtures/orchestrator-transfer/measure.ts)
used bundled Git `ls-tree -rlz --full-tree HEAD`, regular-file reads and SHA-1 Git
blob identity comparison against every tracked file. It ran at
`6a402bf21798c5ba8073d1492c1ae072a9d949a2`, independently of the older Slice 2B
numbers. This is sizing, not a substitute for the locked, race-aware production
capture validator. No repository hooks, filters, scripts or tests were executed
to process source bytes. Untracked/ignored files and `.git` are excluded; no
tracked entry was omitted. The measurement precedes the additions in this slice;
future admission must always measure its own exact HEAD. The complete concise
[measurement record](../tests/fixtures/orchestrator-transfer/measurement.json)
retains the largest-file digests and chunk counts.

| Measured quantity                          | Value          |
| ------------------------------------------ | -------------- |
| Tracked regular files                      | 1,530          |
| Aggregate raw bytes                        | 12,679,270     |
| Distinct parent directories (excludes `.`) | 444            |
| Longest path                               | 94 ASCII bytes |
| Files above 65,536 bytes                   | 20             |
| Canonical baseline v1 manifest             | 246,631 bytes  |
| Proposed canonical inventory projection    | 210,533 bytes  |
| Sizing run wall time                       | 327.575 ms     |

Manifest means compact UTF-8 `JSON.stringify` with the existing ordered keys
`version,repository,branch,head,issue,files`, issue 72, and file keys
`path,mode,size,sha256`, files sorted by ASCII path. Its SHA-256 is
`d03e3647bbf766beff9ebea4108608be15773384fc360a4e1717c2fe8edebdee`.
The proposed inventory is one sorted array with ordered keys
`path,type,mode,size,links`: regular files have modes `0644`/`0755`, exact size and
link count one; directories have mode `0755`, normalized size/link fields zero.
Directory filesystem sizes/link counts are not portable identities. Actual type,
mode and absence of links/reparse points must still be checked before projection.
These byte counts are measurements of serialized expected metadata, not observed
inventories from a full imported guest.

| Largest tracked paths                                    | Bytes   |
| -------------------------------------------------------- | ------- |
| `docs/graider-remote-course-architecture.md`             | 251,877 |
| `ui/package-lock.json`                                   | 220,738 |
| `ui/src/grading-workspace/GradingWorkspacePage.test.tsx` | 184,439 |
| `ui/src/grading-workspace/GradingWorkspacePage.tsx`      | 162,306 |
| `package-lock.json`                                      | 161,708 |
| `docs/graider-traceability-matrix.md`                    | 128,250 |
| `docs/graider_complete_requirements.md`                  | 121,520 |
| `docs/electron-packaging.md`                             | 115,545 |
| `docs/graider-schema-v2-migration.md`                    | 109,594 |
| `docs/graider-architecture-evolution-roadmap.md`         | 101,199 |

The existing 64-KiB file/output limit rejects 20 files, and a single inventory or
manifest also exceeds that output limit. The 256-file and 1-MiB source admission
caps reject the file count and total; the 64-KiB manifest admission cap rejects
the manifest. Readback alone needs 12,679,270 decoded bytes, already above the
8-MiB cumulative receive budget before its base64 expansion (at least 16,905,696
wire bytes), replies and inventories. Existing Slice 2B also requires at least
one put, one mode operation and one get per file: at least 4,590 exchanges
before inventory operations (parent creation occurs within puts). The
120-second lease leaves under 26.15 ms/exchange even with zero startup/cleanup
time. The synthetic guest below measured roughly 125–316 ms/exchange across runs; this is
illustrative extrapolation, not a full-tree timing measurement. There is no
supported full-tree schedule within the existing lease. Byte/count rejection is
conclusive; it would be inaccurate to infer a universal timing impossibility
from a small experiment alone.

#### Alternatives and recommendation

| Alternative                               | Exchanges for current data in each direction | Memory/complexity and attack surface                                                                                                                   |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-file 32-KiB chunks                    | 1,630 including empty-file records           | Simple file-local offsets; many round trips and file-open transitions; bounded one-chunk memory                                                        |
| General tar/zip/compressed archive        | About 387 chunks before archive overhead     | Adds extractor, link/type/path/metadata semantics and decompression limits; archive inventory still cannot replace supervisor readback                 |
| Manifest-defined concatenated byte stream | 387                                          | One open destination file and one frame at a time; stream offsets derived from bounded manifest; small files share a frame and large files span frames |
| Pipelined/windowed stream                 | Same frame count, fewer waits                | Multiple unacknowledged frames, reorder buffers, credit accounting and cancellation races; no demonstrated need yet                                    |

Recommend the third option, uncompressed, with stop-and-wait credit of **one**.
Do not introduce archive extraction, arbitrary guest shell commands, a general
RPC endpoint or a sliding window. Files are opened in sorted manifest order;
zero-byte files consume no data frames and must still be created/verified. A
frame may finish several small files or part of one large file. The receiver
derives all offsets/boundaries from supervisor-owned metadata, never guest paths
or embedded archive names. Prefix sums need checked integer arithmetic.

#### Proposed GRT1 protocol and independent acceptance

A later reviewed helper must be incorporated into a newly pinned guest image,
outside the imported workspace, with reviewed source/build/digest provenance.
Do not run a helper supplied by the baseline. The current experiment instead
loads a fixed synthetic-only shell fixture through the unchanged API and does
not implement the complete protocol or baseline integration.

Proposed framing is ASCII headers, canonical padded base64 and exactly one LF:

```text
GRT1 <session32hex> <sequence> <M|D|R|I> <offset> <decoded-length> <sha256> <base64>\n
GRT1 <session32hex> <sequence> ACK <next-offset> <accepted-chunk-sha256>\n
```

`M` is manifest ingress, `D` is concatenated source ingress, `R` is independently
read file bytes, and `I` is inventory. Integers are canonical unsigned decimal,
without signs or leading zeroes. Header/control messages are at most 256 bytes;
a data frame carries at most 32,768 decoded bytes and is at most 44,000 wire
bytes. Each nonfinal frame must have exactly 32,768 bytes; a final frame has the
exact declared remainder. Empty streams use their sealed zero size/empty digest,
not an empty DATA frame. Enforce the line bound before allocation/base64 decoding,
re-encode to reject noncanonical padding and verify declared length and SHA-256.
No output/noise, ignored fields, CR aliases, extra lines or unknown versions.
Partial pipe writes/reads are normal: keep only one bounded partial frame,
wait for LF within the operation deadline, and reject incomplete data at EOF.

A fresh unpredictable 128-bit session ID, immutable manifest digest, concatenated
data digest and protocol/profile/runtime/image identities are recorded outside
the guest. START fits the 256-byte control bound by sending session, manifest
length/digest and data length/digest; repository/branch/HEAD/issue stay in the
digested manifest. SHA-256 detects byte corruption and identity drift; it is not
authentication of a hostile guest. Neither guest hashes nor ACKs grant acceptance.

Use globally monotonic operation sequence numbers across control/data and both
directions, with exact expected phase/offset and no reuse. Sequence is bounded
by the admitted operation budget; byte offsets reset only at the specified
stream transition. For ingress, the guest ACKs only after bounded write/hash
accounting. For egress the supervisor requests one exact next frame; the next
request carries acknowledgment of the preceding verified frame. A final control
acknowledges the last response. An ACK repeats session, sequence, next offset
and accepted digest. No next operation is authorized until all fields match.
One read-only stream model in the tests exercises a phase in isolation; it is
not a production duplex parser or complete session state machine.

The six fixed control exchanges are START, SEAL_MANIFEST, SEAL_DATA,
BEGIN_READBACK, END_READBACK and FINISH. START returns an exact empty workspace
inventory before import. SEAL_MANIFEST checks canonical metadata, digest and
admission; SEAL_DATA closes all writes and fixes modes. Then stream inventory
before readback, perform BEGIN_READBACK and stream all sorted file bytes,
perform END_READBACK, and stream inventory again. FINISH seals the transcript.
Each transfer/request header includes the expected phase; only these transitions
are legal. No separate per-file create/chmod/hash RPC is needed. Shutdown/reaping
is separately bounded by the lifecycle, not an extra guest command.

The supervisor compares both bounded canonical inventories to its own exact
expected entries (including directories), rejecting missing/extra/duplicate or
aliased paths, mode/type/size changes and nonregular/multiply-linked files. It
independently hashes every returned byte into per-file and concatenated SHA-256,
checks exact lengths, empty-file digests and final stream EOF, and compares the
manifest digest again. Inventory cannot establish content identity on its own;
readback cannot replace inventory/type checks. No imported program runs between
these checks. Final success still requires attested guest shutdown/destruction
and the existing locked authoritative HEAD/index/source identity/byte/mode
recheck. Return only a receipt, never a live executor.

#### Calculated resource envelope (proposal, not new constants in production)

All limits are independent admission conditions; larger files/trees require a
new reviewed profile. Do not silently omit files or choose bounds from guest
input. Proposed caps leave finite growth room around this measurement:

| Resource           | Proposed bound and justification                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Per file           | 512 KiB; just over twice the current 251,877-byte maximum; always chunked                                    |
| Source bytes `T`   | 16 MiB; 32.3% above current bytes, not an unbounded stream                                                   |
| File count         | 2,048; 33.9% above measured 1,530; caps metadata/inodes/work                                                 |
| Directories        | 1,024; derived parents count independently, accommodating 444 with bounded metadata                          |
| Path               | Existing 240 ASCII bytes; preserve the exact safe path/alias restrictions                                    |
| Manifest `M`       | 1 MiB hard serialized cap; 2,048 entries of at most about 360 bytes plus identity fit below it               |
| Each inventory `I` | 1 MiB; at most 3,072 entries, paths 240 bytes and fixed bounded metadata; still enforce serialized admission |
| Guest workspace    | Retain 64-MiB tmpfs; no disk or host mount needed for this byte-only profile                                 |
| Guest RAM          | Retain 1,536 MiB; no agent, builds, dependencies or model in this resource profile                           |
| Bidirectional wire | 64 MiB hard total, counting malformed bytes and both directions before parsing                               |
| Exchanges          | At most 1,126, including six controls; no per-file guest process launch                                      |

The [executable calculation model](../tests/fixtures/orchestrator-transfer/model.ts)
uses `C(x) = ceil(x / 32768)` and
`N = C(M) + 2*C(T) + 2*C(I) + 6`. With measured metadata, ingress is 8 manifest
frames + 387 data frames; readback is 387 frames and the inventories are 7 frames
each: **802 exchanges** total. Raw transferred payload is
`M + 2*T + 2*I = 26,026,237` bytes. The conservative base64/framing calculation
is `4*ceil(raw/3) + 4*(N-6) + 512*N`: **35,115,460 bytes** for the current
measurement. This includes per-frame base64 padding slack, both request/response
headers, ACKs and controls; it excludes the old GVM1 wrapper because GRT1 is a
proposed replacement internal transport, not nested inside GVM1 in production.

At maximum admission, `C(M)=32`, `C(T)=512`, `C(I)=32`, so `N=1126`;
raw payload is **36,700,160 bytes**, base64 plus padding/headers/ACKs is at most
**49,514,540 bytes**, leaving 17,594,324 bytes below the 64-MiB combined wire cap.
The cap counts _all_ bytes, including errors and stderr; reserve no unlimited
diagnostic channel. Each direction is also bounded by its admitted expected
stream sizes and transcript, so a malicious guest cannot consume the margin as
additional accepted data. Decoded file-byte ingress/readback are each at most
16 MiB; inventory output is at most 2 MiB plus fixed controls. Mismatched
declarations fail admission before transfer.

Workspace calculation assumes the reviewed Linux image's 4-KiB page allocation:
16 MiB source + less than 8 MiB file-tail rounding (2,048 files) + at most 4 MiB
initial directory pages + less than 1 MiB directory-entry allowance + 2 MiB
manifest/inventory staging + under 1 MiB
frame/control staging = **under 32 MiB**. Reserve the other 32 MiB of the
existing 64-MiB tmpfs for filesystem metadata/accounting uncertainty. Helpers
must stream directly into files, not keep a second full source/archive copy,
and enforce workspace/inode exhaustion as failure. No dependency installation
or build workload is included. Future native Windows workspace allocation must
be measured independently, not inferred from Linux page sizes.

Host/guest transport buffers should retain at most one decoded chunk, its
44-KiB encoded frame, bounded header/ACK, and fixed write/read buffers: reserve
256 KiB. Reserve 16 MiB separately for parsed manifest/path tables/digests;
serialized size alone is not a bound on managed-language heap expansion. Use a
reviewed helper with explicit allocation/work limits; validate this memory
reserve in later full-tree tests. Guest baseline memory is measured below;
these estimates do not certify worst-case runtime heap or guest-kernel behavior.
The supervisor can use its immutable external captured-byte spool and stream
readback hashes; it need not hold two full trees in memory.

Propose an independent **600-second hard VM lease**, without renewal, and
30-second startup/operation ceilings plus the existing five-second verified
shutdown and 250-ms forced-kill grace. This is a finite import-only profile, not
an agent execution lease. A planning allowance of 400 ms per exchange (above the slowest synthetic
ingress average of 316 ms, measured during concurrent typechecking) gives
450.4 seconds at maximum admission; allow 30 seconds startup, 30 seconds sealing/
verification and five seconds cleanup: **515.4 seconds**, leaving 84.6 seconds
for stalls/scheduling. Current-tree calculation is 320.8 seconds of exchanges
under that assumption. Maximum operation timeout multiplied by operation count
does **not** fit this lease: the independent watchdog must terminate stalled
sessions even when each individual operation has not expired. The 400-ms allowance,
metadata sealing time and worst-case memory estimates are assumptions requiring
full-tree measurements before approval. Do not increase the current watchdog
lease or repin it automatically in this slice.

The exchange count also bounds data handling: at maximum admission, splitting
512 data frames across 2,048 file boundaries needs at most 2,559 nonempty
file/frame fragments in each direction. Two inventories visit at most 6,144
entries, and mode setting visits at most 2,048 files. There must be no shell or
subprocess per entry. A 240-byte path has at most 120 nonempty components, so
even repeated per-file parent walks are bounded by 245,760 component checks per
validation pass; cache only identities that remain valid under the existing
race checks. Guest sealing and path/stat work still need measured 30-second
deadline acceptance at maximum admission. These are calculated work bounds,
not observed full-tree syscall counts.

#### Failure, cancellation and retained evidence

| Trigger                                                                      | Required outcome                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Partial frame, truncated base64, premature EOF                               | Bounded partial buffer/deadline; no ACK; terminal failure and teardown                                         |
| Reordered/duplicate chunk or ACK, wrong session/phase/offset/length          | Reject even if bytes/digest match; no retries or duplicate-write acknowledgment                                |
| Corrupt chunk, per-file/final digest mismatch, missing/extra inventory entry | Reject before receipt; preserve failure code/identity/counts and destroy only after reaping                    |
| Cancellation, startup/operation/lease expiry                                 | First failure wins; stop writes/credit, cancel pending work, terminate VM process group and attest exit        |
| Guest crash, pipe loss, malformed response                                   | Terminal session failure; ACK/guest success cannot override independent lifecycle evidence                     |
| Supervisor death or uncertain reaping                                        | Independent watchdog still owns lease/kill; retain payload/state/lock unless reaping is independently attested |

Neither an accepted chunk nor a final guest response releases the authoritative
lock. Preserve bounded redacted counts, manifest/protocol/runtime identities and
timestamps outside the guest, without raw repository bytes/commands/credentials.
Never infer cleanup from stale PID absence or delete an uncertain payload. No
automatic resume, replay, lease extension or checkpoint repair: reconciliation
is deliberate, and a later attempt needs a fresh ID, capture, workspace and VM.
Historical interrupted state/locks/evidence remain untouched.

All Slice 2B protections remain mandatory: supervisor-owned path validation,
protected paths, bounded source reads/raw Git blob comparison, source/parent
identity and mode checks, lock ownership, immutable repository/branch/HEAD/index
and manifest identity, exact final inventory and independent byte verification.
Unsupported host rejection still precedes source capture. Windows short-name,
case/prefix, drive/UNC/device/ADS/reserved-name aliases and native reparse-point
requirements remain fail-closed; unknown reparse metadata is not approximated.
This proposal does not enable Windows capture or claim native macOS/Windows VM
acceptance. Renderer/preload/backend authority is unchanged. No host mounts,
shared `.git`, credentials, sockets, NIC/general networking, unrestricted host
execution, Agent/relay, candidate export/promotion, guest commits, issue execution,
#26/#15 or Phase 10 work is included.

#### Experimental evidence and review questions

The [manual probe](../tests/fixtures/orchestrator-transfer/probe.ts) runs the
reviewed [synthetic receiver](../tests/fixtures/orchestrator-transfer/receive.sh)
as `nobody` in the unchanged pinned no-NIC HVF guest. It sends inner GRT1 frames
as bounded GVM1 files, validates sequence/offset/length/canonical base64/digest
in guest code, appends to one fixed guest file, validates ACKs on the host, then
reads the file independently with five bounded `dd` requests. Every returned
byte, SHA-256, exact size, mode `0644` and link count one is supervisor-checked.
A duplicate final chunk must fail, followed immediately by teardown. This fixture
uses no repository baseline, host mounts, source capture lock or credentials.
It has a fixed synthetic size/path/session and is not reusable production code.

The [observations](../tests/fixtures/orchestrator-transfer/observed.json) bind
the final probe/model/guest source digests, pinned image and independently
reaped VM identity. The first successful boot measured 131,089 bytes, five data
chunks, 18 operations, 4.903-second startup, 1.469-second ingress, 0.627-second
readback and 7.057 seconds total. Inner frames were 175,386 bytes; these are
not outer GVM1 wire counts (which base64-encode them again). The final source-bound run used **19 operations**, with 5.756-second startup,
1.804-second ingress and 0.645-second readback, 8.336 seconds total; its duplicate final chunk was rejected before attested teardown and verified
payload removal. Operation counts exclude create/start/shutdown/destroy lifecycle
calls. An earlier 19-operation run overlapped root typechecking and took 3.160 seconds
for ingress, demonstrating timing variation; all four timings are retained.
An initial managed-sandbox input-verification failure is retained at
`/var/folders/4q/0ln9xxf56fs72yv0g3pw8ch80000gn/T/graider-72-synthetic-KF9Vrq`;
the existing verifier failed closed and no runtime/pin/limit was changed.

The guest reported an empty 65,536-KiB tmpfs and 1,503,052-KiB total memory,
935,848-KiB available in the first run. This is a point measurement, not maximum
memory certification. The synthetic data digest is
`b4935a6cd264749cf4ad8533daaafb8c8d7e4fdd23d9f43a3ec1b91d462bc554`.
No complete checkout was transferred. Linux/HVF proof cannot certify native
Windows/macOS validation, hostile-kernel safety, full protocol/state transitions,
full-tree latency, filesystem race defenses or allocation bounds.

[Deterministic tests](../tests/unit/orchestrator-transfer-design.test.ts) exercise
malformed/partial/oversized frames, padding, corruption, session/sequence/offset/
phase mismatch, duplicate/truncated streams, forged/stale ACKs, per-file readback,
exact inventory, admission/wire/operation exhaustion, cancellation, lease expiry
and cleanup uncertainty. These tests execute a design model, not a production
adapter or real VM. The existing VM/baseline failure suites remain unchanged.

Review before Slice 2C2: approve or revise these explicit admission/lifetime
budgets; review the future complete duplex state machine and pinned helper;
measure complete-HEAD transfer with all paths/modes/independent readback and
actual wire/operation/memory/time accounting; prove maximum-profile failure
behavior and cancellation under load; separately provision native Windows
reparse metadata/VM and macOS validation. Keep #72 open until its full acceptance
is proven. Preserve required root checks, native CI, dependency audit and all
authorization/execution gates. Stop here for review; no production transport
implementation is authorized by this design slice.

Reproduction uses only existing reviewed VM artifacts; a changed pin or unknown
runtime must fail rather than trigger a download/rebuild:

```text
node --import tsx tests/fixtures/orchestrator-transfer/measure.ts
npx vitest run tests/unit/orchestrator-transfer-design.test.ts
node --import tsx tests/fixtures/orchestrator-transfer/probe.ts <existing-reviewed-artifact-directory>
```

Local validation passed: full `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test` including hygiene (**3,404 tests / 205 files,
zero skips, 79.64 seconds**), and `npm run build`. Final fixture edits also passed
`npm run typecheck:prepared`, scoped ESLint and all **38** design tests.
Initial fixture-authoring lint errors and a transient typecheck against the
pre-update observation schema were corrected; no gate or assertion was weakened.
No production/migration/UI behavior changed. Comprehensive native CI and audit
remain required at the pushed exact SHA; local results do not establish CI
acceptance or issue closure.

Measured phase walls through primary local-check completion, 19:24:23–19:37:56
UTC: investigation **51 seconds**, implementation/proof **520 seconds**, local
validation/final evidence preparation **242 seconds**, total **813 seconds**.
The validation phase overlaps the final fixture/evidence refinement. Earlier
setup and exclusive tool/approval waits were not separately instrumented; they
are not estimated. No CI waiting occurred in this interval. Commit/push/CI
inspection and issue handoff follow these measured intervals.

### Slice 2C2: standalone GRT1 test transport (2026-11-18)

The reviewed architecture is now implemented under
[`scripts/orchestrator/grt1/`](../scripts/orchestrator/grt1/transfer.ts), **only for
credential-free standalone tests**. The provisional profile is not production
acceptance. Slice 2A/2B code, limits and pins remain unchanged. There is no baseline
capture/import integration, Agent, runner, relay, promotion, GitHub authority or
execution entry point. #72 remains open; #41 remains open/blocked. Do not import a
complete Graider baseline until the next review. No #26, #15 or Phase 10 execution.

The [supervisor](../scripts/orchestrator/grt1/transfer.ts) consumes supervisor-owned
canonical v1 metadata and a bounded captured-byte reader. It never opens a path
returned by a guest. It admits all paths, modes, file/directory counts, individual
and aggregate sizes and metadata sizes before transfer, separately from guest
checks. It creates a random 128-bit session, seals the manifest/data identities,
and implements the six controls and globally monotonic sequence from Slice 2C1.
Each direction has one outstanding exchange. No retries, replay, resume or lease
extension exist. A protocol, source, timeout, cancellation or lifecycle failure is
terminal and stops credit; failure also interrupts a pending source read.

Wire details resolving the design's control grammar:

```text
GRT1 READY GRT1-test-2c2
GRT1 session sequence START manifest-size manifest-sha256 data-size data-sha256
GRT1 session sequence ACK phase next-offset accepted-sha256
GRT1 session sequence GET I|R offset length previous-offset previous-sha256
GRT1 session sequence SEAL_MANIFEST
GRT1 session sequence SEAL_DATA
GRT1 session sequence BEGIN_READBACK previous-offset previous-sha256
GRT1 session sequence END_READBACK previous-offset previous-sha256
GRT1 session sequence FINISH previous-offset previous-sha256
```

Every line has exactly one LF and canonical ASCII fields. Data frames retain
the proposed `M/D/R/I` grammar. ACKs additionally repeat the phase. The first GET
of each egress stream carries zero/empty SHA-256; each following GET acknowledges
the preceding verified response. The transition control acknowledges the final
response. START ACK seals the exact empty inventory `[]`. Controls/ACKs are at
most 256 bytes; data frames are at most 44,000 bytes with at most 32,768 decoded
bytes. The host bounds the pending reply and partial buffer before decoding, and
rejects unsolicited bytes, duplicate lines, CR, noncanonical integers/base64,
unknown versions, field/count/offset/phase/sequence/length/digest mismatches and
premature EOF. Nonfinal chunks have the exact full size; empty streams have no
data frame. File boundaries come only from the manifest, including empty files.

The [fixed helper](../scripts/orchestrator/grt1/guest.py) is Python standard-library
source installed outside `/work` in a separate pinned Alpine/Python image. It has
no command endpoint and never executes imported files. It parses bounded canonical
metadata, creates directories, streams into one exclusive/no-follow regular file
at a time, hashes each file and aggregate, and applies exactly `0644`/`0755`.
Descriptor-relative parent walks reject links. Its explicit states are start,
manifest, data, inventory-before, readback, inventory-after, finished and failed.
Unsafe names, aliases, protected components, unknown metadata, special files,
multiply linked files and inventory/mode/size/identity drift fail closed.
Inventory closes each directory iterator before descending, so admitted deep
paths do not exhaust the unchanged 32-descriptor ceiling. An 80-level regression
first failed deterministically and in the initial HVF image; the corrected helper
was explicitly repinned and rebuilt twice before renewed native probes.

The host compares both streamed inventories byte for byte to its own canonical
projection, and independently compares **every readback byte** to its captured
reader while hashing every file and the aggregate. The helper additionally checks
the filesystem again at FINISH: at most 9,216 entry visits across its three final
inventory walks, plus the empty startup walk. No imported program runs between
these checks. Only a receipt after verified reaping/removal is returned.

The [standalone HVF launcher](../scripts/orchestrator/grt1/hvf.ts) has no general
VM/command interface. It independently checks the reviewed host OS, HVF support,
Node/QEMU and transitive library pins, helper/build sources and complete image
digest. QEMU uses only HVF, 1,536 MiB RAM, anonymous serial pipes, no NIC, monitor,
host mounts/shares, disks, sockets or credentials. The guest has a 64-MiB
`nosuid,nodev,noexec` workspace with 4,096 inodes; Python runs as nobody with
isolated imports, no site initialization/bytecode, a 64-MiB address-space ceiling,
600 CPU seconds and 32 open descriptors. The image contains no issue agent.

The provisional profile independently caps 512 KiB/file, 16 MiB source, 2,048
files, 1,024 directories, 240 ASCII bytes/path, 1 MiB manifest/each inventory,
1,126 exchanges and 64 MiB combined wire. Startup/exchanges/source reads have
30-second ceilings. A separately pinned
[watchdog](../scripts/orchestrator/grt1/watchdog.mjs) enforces a nonrenewable
600-second VM lease, counts both directions and runtime diagnostics before
parsing, and kills the entire process group on caller/pipe loss or exhaustion.
It escalates after 250 ms and attests only after child/stream closure and group
absence. Host cleanup has a five-second ceiling; uncertain reaping retains the
payload. Caller death preserves this run's payload for reconciliation even when
the independent watchdog subsequently attests reaping. Historical evidence and
locks are never opened, reused or cleared.

Host and watchdog independently account for all traffic, including malformed
bytes and diagnostics. Protocol noise and diagnostics during exchanges fail.
After an independently verified FINISH, QEMU termination diagnostics are counted
during bounded teardown; serial noise remains a failure. Receipts/failure evidence
retain counts, direction-separated transcript hashes, identities and timestamps,
without raw bytes, commands, environment or exception text. FINISH appends exactly
five bounded telemetry integers: helper peak RSS KiB, workspace used bytes/inodes,
guest MemTotal/MemAvailable KiB. These are fixed-helper observations, never
acceptance authority or proof of worst-case guest memory.

#### Pinned construction, tests and measured scope

[Test-image pins](../scripts/orchestrator/grt1/test-image-pins.json) explicitly
record each Alpine package URL/SHA-256/source-package commit, the downloaded index
digest, helper/init/bootstrap/builder source hashes, image and watchdog digests.
The original reviewed rootfs/kernel remain inputs. The
[offline builder](../tests/fixtures/orchestrator-grt1/build-image.py) never extracts
or executes guest files on the host, installs no repository hooks and downloads
nothing. Sorted CPIO records have fixed ownership/timestamps and canonical gzip
metadata. Two independent output directories reproduced image
`c1ee8d45a7da724136a3d39c7f95a63c11bed781c5714ed5a0b01fd8aade2f96`
(16,218,748 bytes, 1,295 entries). A candidate-only build uses a deliberately
different filename; it cannot be launched by the verifier. Rebuilds never update
pins. A different expected digest, source/input/runtime or image is rejected.
Future input changes require source review, explicit digest verification and
renewed native probes; these pins authorize no production execution.

```text
python3 tests/fixtures/orchestrator-grt1/build-image.py <reviewed-rootfs-inputs> <pinned-package-directory> <new-output-directory> c1ee8d45a7da724136a3d39c7f95a63c11bed781c5714ed5a0b01fd8aade2f96
npx vitest run tests/unit/orchestrator-grt1.test.ts tests/unit/orchestrator-grt1-watchdog.test.ts
node --import tsx tests/fixtures/orchestrator-grt1/probe.ts <pinned-test-image-directory> maximum
node --import tsx tests/fixtures/orchestrator-grt1/recovery.ts parent <pinned-test-image-directory> death
```

Root deterministic tests require Python 3.9+ (`python3`, or `python` on Windows),
with no pip packages. They run the actual fixed Python protocol/data/state source
against an explicitly labeled portable kernel double, avoiding assumptions that
Windows implements Linux `openat`, no-follow flags or POSIX modes. They test
normal/binary/empty/max-size/mixed streams and both duplex directions, hostile
frames/ACKs/metadata/inventories, aliases/types/modes, corruption, allocation and
workspace failure, flow control, budgets, cancellation and cleanup uncertainty.
The separate watchdog tests cover caller loss, forced kill, lease/wire exhaustion,
broken pipes and refusal to attest surviving groups. These tests do not certify
native filesystem or VM isolation. The actual Linux helper filesystem operations
and every file mode are exercised in pinned HVF experiments.
The native safety CI job also runs the new deterministic protocol/watchdog tests
on both macOS arm64 and Windows x64; simulated processes/filesystems never count
as native VM acceptance.

[Observations](../tests/fixtures/orchestrator-grt1/observed.json) retain source-bound
synthetic results, actual host/watchdog wire counts, operation counts, elapsed
time, fixed-helper memory/workspace observations and cleanup evidence. Initial
verification rejection, teardown-diagnostic rejection and an incorrect recovery
fixture evidence-field lookup remain failed evidence. No failure is relabeled
as a pass. Real probes cover caller death, guest crash, frozen-QEMU escalation
and cancellation under load. Caller-death payload/evidence is intentionally
retained; other passing probes attest removal only after reaping.

The final source-bound maximum run verified **16,777,216 bytes, 2,048 files and
1,024 directories**, including an 80-level path. It took **279.738 seconds**,
**1,055 exchanges** and **45,990,689 combined wire bytes**. Host and watchdog counts
matched exactly, including 81 runtime-diagnostic bytes. Helper peak RSS was
20,692 KiB; workspace use was 17,281,024 bytes / 3,073 inodes. Maximum measured
exchange time was 3.528 seconds. Every byte/mode and both inventories matched,
followed by attested reaping and payload removal. Earlier synthetic results and
failed attempts remain explicitly identified by image/source digest in the
observations. These runs overlapped local checks; timings are observations, not
guarantees or full-tree estimates.

Required root validation passed: `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test -- --maxWorkers=2` including hygiene
(**3,504 tests / 207 files, zero skips, 122.50 seconds**), `npm run build` and
`npm run audit` (high threshold passed; nine existing moderate findings).
New transport/watchdog coverage is **100 tests**. A default-worker full run hit
the existing #71 CI-selector five-second timeout (3,503 passed / one failed);
the unchanged focused file subsequently passed all eight tests. Confirmation
used the complete suite with two workers after the large VM experiment ended.
No test, timeout, audit or CI gate was weakened. A fixture-only optional-IPC typing
error was corrected and full typechecking passed afterward. An initial audit
request failed registry DNS in the sandbox; the authorized network rerun passed.
Exact-SHA native CI remains a separate required gate after push.

Measured phase walls through final local verification, **20:03:17–20:53:14 UTC**:
investigation **97 seconds**; implementation/proof **1,976 seconds** across
20:04:54–20:34:47 and 20:41:23–20:44:26; validation/evidence preparation
**924 seconds** across the remaining intervals; total **2,997 seconds**.
Validation includes the final fixture refinement. Earlier setup and exclusive
approval/network/tool waits were not separately instrumented and are not
estimated; phase walls include those waits. CI waiting in this interval was
**zero seconds**. Final review, commit/push and CI inspection/handoff follow.

**No complete Graider tree was imported.** Synthetic inventories use shorter paths
and different file distributions from Graider. The 600-second lease, full-tree
metadata/allocation estimates and complete-HEAD source capture still require the
next review and measured full-tree validation. Native Windows reparse metadata/VM
and native macOS validation remain unimplemented. Preserve all root/native CI,
dependency-audit, authorization and execution gates, including the independent
Windows migration timeout tracked by #68. Stop after this standalone slice.

### Slice 2C3: real-checkout proof blocked at admission (2026-11-18)

**The complete real checkout was not imported. Stop before production integration.**
The exact requested starting HEAD
`029ec235625507afe7669349248f90351a793384` contains tracked path
`docs/bugs/resolved/260605/student_report_push)_addendum.md`. Its closing parenthesis
is outside the reviewed `/^[A-Za-z0-9_./-]+$/` source/GRT1 path policy. Locked
admission correctly rejected it **before capture or VM creation**. No tracked file
was omitted, renamed or remapped; no path rule, transport/resource cap, pin or
600-second lease changed. The file needs explicit review before another full-tree
proof. Numeric capacity alone does not establish admission or feasibility.
#72 remains open and blocked on this review/proof; #41 remains open/blocked,
and unattended execution stays disabled.

The original authoritative checkout also retains its November 10
`graider-orchestrator.lock`. Two attempts stopped at that lock; it was never
removed or reused. The first also used the ambient Node 23.9.0, never reaching
runtime verification; subsequent attempts selected reviewed Node 24.21.0 explicitly.
A fresh **independent** bundled-Git clone (no hardlinked objects, inherited config,
credentials or old lock) at exactly the starting commit was therefore used for
locked admission. Every file in both checkouts was independently compared with its
raw Git blob, size and mode; their complete tracked records match. The clone's
new failed-run lock and evidence remain for deliberate reconciliation. This is
not admission of the original locked checkout or authorization to clear its lock.

The [read-only measurement](../tests/fixtures/orchestrator-grt1/measure-checkout.ts)
is deliberately separate from admission: it measures unsafe names but never
imports or accepts them. [All 1,556 starting-tree records](../tests/fixtures/orchestrator-grt1/starting-tree.json)
retain each path, Git mode, raw SHA-1 blob identity, exact size and SHA-256.
The canonical v1 manifest (issue 72) is **250,743 bytes**, SHA-256
`708318d4ba43820a053f4d8981b13c30cc4cc9f3dce12f387a10e7a4975732c8`.
All 1,556 files have Git mode `100644`; 21 exceed 65,536 bytes. Source bytes
were compared without filters or line-ending conversion. The two sizing passes
took **345.253 ms** (original) and **914.910 ms** (independent clone), respectively;
these are sizing measurements, not race-aware capture/transfer acceptance.

| Quantity                    | Exact starting tree | GRT1 test cap | Numeric margin |
| --------------------------- | ------------------: | ------------: | -------------: |
| Tracked files               |               1,556 |         2,048 |            492 |
| Distinct parent directories |                 447 |         1,024 |            577 |
| Source bytes                |          12,889,699 |    16,777,216 |      3,887,517 |
| Largest file bytes          |             251,877 |       524,288 |        272,411 |
| Manifest bytes              |             250,743 |     1,048,576 |        797,833 |
| Inventory projection bytes  |             213,526 |     1,048,576 |        835,050 |
| Longest path ASCII bytes    |                  94 |           240 |            146 |

Compared with Slice 2C1, the starting tree adds 26 files, three directories and
210,429 bytes. Applying the same **calculation only** gives 8 manifest frames,
394 data frames each way, seven frames per inventory and six controls:
**816 exchanges / 35,697,292 conservative wire bytes**, versus 802 /
35,115,460 in 2C1. This leaves calculated margins of 310 exchanges and
31,411,572 wire bytes. These projections include the rejected path; they are
not an admitted transfer plan or observed traffic. The earlier 2C2 synthetic
maximum remains **1,055 exchanges / 45,990,689 bytes / 279.738 seconds**, helper
RSS 20,692 KiB, workspace 17,281,024 bytes / 3,073 inodes. Its different path
population cannot establish that the actual repository imports within the lease.

The new supervisor-only [checkout proof](../scripts/orchestrator/grt1/checkout.ts)
uses the reviewed GRT1 **test** profile. Shared
[read-only source invariants](../scripts/orchestrator/baseline-source.ts) were
extracted from 2B: the production `importBaseline` interface and immutable
`BASELINE_LIMITS` retain their original behavior and all 84 regression tests.
The fixed production entry point supplies only its original limits; it accepts
no caller-selected profile. Both capture callers retain safe paths/aliases,
protected components, bounded raw-blob checks, clean bundled-Git plumbing,
HEAD/index/untracked checks and source/parent identity/mode/drift detection.
Unsupported host/reparse metadata is rejected before source capture.

For an admitted tree, the separate adapter holds the common-directory lock,
creates a canonical manifest and bounded in-memory captured-byte source, and calls
only the existing standalone GRT1 verifier. That verifier checks every byte/hash,
mode, link count and exact inventories before attested destruction. Under the
same lock, the adapter then rechecks manifest/tracked evidence, authoritative
repository/branch/HEAD/index, source bytes/modes and filesystem identities,
including common Git directory, worktree Git directory, HEAD and index. Only then
can it write a receipt and release the new lock. Failure retains redacted phase
and reason plus this run's lock/evidence. No Agent, relay, validation execution,
candidate export/promotion, commit/push authority, CI progression or production
baseline call site is connected.

The [manual HVF probe](../tests/fixtures/orchestrator-grt1/checkout-probe.ts)
requires an explicit clean source, exact HEAD and existing pinned image. It can
compare host/watchdog wire counts, verify payload removal and sample host RSS and
workspace use after a successful admission. **None of these full-import
measurements is available in this slice:** the actual attempt created no VM,
exchanged zero transport bytes/operations and produced no success receipt.
Guest helper/VM memory, workspace allocation, latency, readback, shutdown and
destruction were not exercised. No positive HVF result or resource margin is
inferred from the deterministic fixtures. Captured buffers are bounded to 16 MiB
per capture, but host peak memory including final recapture and input verification
also remains unmeasured; the 2C1 staging estimates are not an enforced host heap cap.

[Failed-attempt observations](../tests/fixtures/orchestrator-grt1/checkout-observed.json)
retain the three new attempt directories, source/image identities, original lock
digest and exact blocker. The independent source is
`/private/tmp/graider-72-2c3-source-kG9YEb`; its failed lock remains untouched.
Historical checkpoints, locks and preserved evidence were not changed. Failure
coverage includes the exact closing-parenthesis case, production count/byte limits,
raw-source/index/HEAD/parent/manifest drift, protected names, links, partial/corrupt
transfer, cancellation/deadline and cleanup uncertainty using credential-free
fixtures. Portable protocol tests use the existing explicitly labeled filesystem
double; they do not certify native VM enforcement. Both native safety CI jobs
now include the new adapter and unchanged 2B regression tests. Existing root,
dependency-audit, native CI, authorization and execution gates remain required.

Local validation passed: full root `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test -- --maxWorkers=2` including hygiene
(**3,537/3,537 tests, 208 files, zero skips, 122.65 seconds**), `npm run build`
and `npm run audit` at the unchanged high threshold (nine existing moderate
findings). The new checkout suite has **33 tests**; all **84** unchanged baseline
regressions and **100** existing GRT1/watchdog tests remain covered. Tests were
written first; initial missing-module, extracted text-helper and measurement
fixture typing/lint failures were corrected without weakening assertions or gates.
An initial registry DNS failure required the authorized audit network rerun.
Full exact-SHA native CI is required after push; local success does not establish
CI acceptance or completion of #72.

Measured phase walls through local-check completion, **22:08:08–22:24:48 UTC**:
investigation **121 seconds**; implementation/failed proof/evidence preparation
**709 seconds**; final local validation **170 seconds**; total **1,000 seconds**.
CI waiting was **zero seconds**. Exclusive tool/network/approval waits were not
separately measured and are included in phase walls, not estimated. Final
review/documentation, commit/push and CI inspection/handoff follow this interval.

Next review must resolve the tracked path under the security policy, then repeat
fresh exact-HEAD admission and genuine pinned-HVF full import/readback/resource
measurement. Do not reuse the failed locks, omit files, enlarge bounds or call the
production importer. Native Windows reparse metadata/VM and native macOS validation
remain separate outstanding acceptance. No #26/#15 or Phase 10 was executed.

### Smallest implementation sequence under the accepted decision

Keep the serial issue queue, dependency/phase checks, approval lifecycle, reports,
checkpoint fingerprint and exact-SHA CI/closure logic. Add a narrow isolated
executor and supervisor-owned promotion; do not build a replacement orchestrator.

1. **Verify and pin the VM adapter before connecting it to `Agent`.** Define
   create/start/run/export/stop/destroy operations using executable/argv arrays
   and an explicit clean environment. Pin reviewed runtime/image/toolchain
   digests, require hardware virtualization and reject missing/unknown controls.
   Run hostile fixtures at startup and after runtime/image/policy changes. A
   configuration echo, schema, model response or mocked test cannot certify it.
   Put the native-platform differences behind this adapter. No TCG, unrestricted
   process or ordinary directory-copy fallback is permitted.
2. **Export one supervisor-verified baseline into a fresh guest.** Hold the
   existing authoritative-checkout lock and record repository/branch/HEAD plus
   the tracked-file manifest. Transfer selected file bytes, with no `.git`, Git
   alternates, host home/config, tokens, SSH/credential agents or host sockets.
   Give the guest no host filesystem mount. Provision dependencies/toolchains
   from a separately trusted image/cache; never run repository dependency hooks
   on the credentialed host. Record the baseline and issue identity outside the
   guest; use a new state directory, never the historical interrupted state.
3. **Run app-server and every validation descendant inside the VM.** Use fresh
   guest Codex configuration/home, supported approval policy, restricted inner
   sandbox and no arbitrary network. Replace the agent's `repository_development`
   host-validation/GitHub mutation capabilities: the guest may return proposals,
   not execute host actions. The supervisor retains issue writes, bundled Git,
   commits, pushes and CI. First prove native Codex tool calls using scripted
   loopback Responses fixtures and no model credentials. For future inference,
   a separately reviewed, bounded supervisor relay must hold model credentials
   outside the guest and allow only the fixed provider/model API. No general
   proxy, URL forwarding, credential endpoint or host-service route. Verify relay
   framing/size limits, destination enforcement and cancellation with fake
   credentials before any authenticated execution; a no-NIC boot does not prove
   that future relay safe. Fail closed if the inner sandbox cannot initialize.
4. **Freeze and validate an exact candidate outside host authority.** Stop agent
   writes; transfer a bounded manifest of regular-file bytes and explicit
   deletions through the adapter into supervisor-owned staging. Never mount an
   untrusted guest filesystem on the host or execute its export helper there.
   Independently reject absolute/traversal paths, duplicate/case-fold aliases,
   `.git`/protected paths, symlinks, hardlinks, devices, FIFOs, Windows reparse
   points/ADS/reserved names, unapproved mode changes and unsafe deletions. Hash
   and size-check every byte. Require explicit review for changes to orchestrator,
   security policy, CI or validation commands; the candidate cannot redefine its
   acceptance checks. Reconstruct this exact candidate in fresh credential-free
   native validation guests. Run the issue-required checks from the trusted
   validation plan and bind their results to candidate/runtime/image digests.
5. **Promote only the validated bytes.** Under the supervisor lock, recheck
   authoritative branch/HEAD, cleanliness, file identities and baseline hashes.
   Reject any intervening edit. Apply only the reviewed manifest, without hooks,
   repository scripts or agent-supplied Git commands; recheck resulting bytes and
   unexpected changes. Preserve a recoverable transaction journal so partial
   promotion or a crash stops the queue for reconciliation. Only then use bundled
   Git to commit/push normally and require the exact commit's current required CI
   gate. `CI required` must be taken from the reviewed current workflow; the old
   example check names above are historical. Pending/red/missing checks never
   permit closure or the next issue. Preserve all existing test/audit gates.
6. **Prove cancellation/recovery, then separately accept execution.** Bind each
   VM ID to a fresh issue/run ID. Bound startup, tool, export and shutdown time;
   cancel the turn, stop/kill the entire VM and verify its stopped state before
   releasing resources. Preserve failed-run diagnostics and checkpoints outside
   the guest, discard only that run's disposable disks after exit, and never
   auto-resume an in-progress issue. Test startup failure, hung descendants,
   broken export, interrupted promotion, baseline drift and supervisor crash.
   Enable nothing until both native targets, hostile Codex/native-edit fixtures,
   hostile validation, relay and promotion/recovery acceptance plus required root
   validation/native CI are green. #41 stays open until then.

### Windows x64 enforcement without Windows signing

Use the same supervisor/executor/promotion contract with a disposable **Hyper-V
Generation 2 Windows x64 guest** on a Windows x64 host supporting hardware
virtualization. Microsoft's [Hyper-V overview](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/overview?pivots=windows)
documents VM isolation and management. Use an independently provisioned trusted
Windows image with Node, bundled Git and the native Codex executable. No Graider
installer signing, custom kernel driver, Windows signing certificate or release
secret is needed to run these developer tools in a normal VM. Provisioning the
Hyper-V feature/image is an operator prerequisite, not permission to bypass OS
policy or elevate the issue agent.

Attach only disposable guest disks. Disconnect network adapters; disable enhanced
session clipboard/drive sharing and host/guest service integrations not needed
for the bounded transport. No SMB/host directory mapping, WSL host automount,
Docker socket, credential forwarding or host home. Control the guest from the
trusted supervisor with the Hyper-V APIs/PowerShell module; any guest account
credential is disposable and distinct from host/GitHub/model credentials. Treat
PowerShell Direct and all returned bytes as a restricted untrusted transport,
not a generic agent-to-host command API. If Hyper-V, the configured transport or
native sandbox is unavailable, execution stays disabled; neither a job object
nor process-tree killing alone establishes filesystem/network isolation.

Run the same credential-free hostile fixtures on the actual Windows host/guest,
including native `apply_patch`, PowerShell/cmd/npm grandchildren, junctions and
reparse points, UNC/device/drive-relative paths, case aliases, locked files,
network/host-service denial, forced termination and fresh boot. Verify fake host
canary hashes and that no VM/descendant survives cancellation. Use provisioned
native acceptance workers if hosted CI lacks virtualization; a skipped probe or
Linux guest cannot pass native Windows acceptance. Keep normal macOS arm64 and
Windows x64 CI plus dependency audit gates unchanged.

The local Linux guest likewise cannot replace native macOS validation: provision
a disposable macOS arm64 validation VM (or another independently proven native
whole-process boundary) before enabling that path. That native image/adapter and
the Windows adapter have not been provisioned or verified by this assessment.

### Earlier execution workflow (disabled)

The runner starts a new app-server process and `thread/start` for every issue.
It checks Codex authentication and model/effort availability, keeps
`workspace-write`, restricted network access, and the now-retired `untrusted` approval policy,
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

### Slice 2C3 repair: literal parentheses and portable fixture (2026-11-18)

The explicit follow-up authorizes only literal `(` and `)` in repository paths;
parentheses need not balance. Source admission, both manifest validators, the
production inventory parser, VM transfer validator and fixed guest receivers now
accept exactly the previous ASCII alphabet plus those two characters. Traversal,
protected components, case/prefix aliases, Windows reserved names/ADS/short names,
unknown reparse metadata, links, types, modes, identity checks and resource limits
retain their previous rejection behavior. Unsupported hosts still fail before
source capture. No production Slice 2B limit or GRT1 budget/lease changed.

Every affected consumer passes paths as data: bundled Git receives argv arrays;
source capture uses filesystem APIs; GRT1 carries JSON/base64 and Python uses
`os.open` with directory descriptors. Slice 2A base64-encodes transfer paths; its
fixed guest script uses variable expansion with globbing disabled and quotes
filesystem operands. Shell expansion does not reparse parentheses as syntax.
The inventory command is fixed argv, and chmod takes `--` followed by the path.
No filename becomes interpolated shell source, evaluated code or an imported
executable. Tests cover balanced/unmatched names across capture, inventory,
readback and the actual Python receiver, plus the complete prohibited ASCII
alphabet and independent guest rejection of reserved names and punctuation.

[Prior exact-SHA CI run 44411546982](https://github.com/msoecsse/graider/actions/runs/44411546982)
finished red in Windows IPC/security. The log identifies fixture line 279:
`git update-index --add --cacheinfo 100644,<oid>,NUL.txt`. Windows Git rejects that
reserved path before `proveCheckoutImport` runs; neither commit nor admission
was reached. The checkout fixture now commits Windows-valid `short~1.txt`, which
admission rejects before VM creation. Portable manifest tests still explicitly
reject `NUL.txt`; independently digested hostile guest metadata does too. The
checkout assertion and Windows coverage remain enabled.

The guest path changes require new image identities, never reuse of old image
attestations. Both images were rebuilt twice from unchanged verified rootfs,
kernel and packages. GRT1 image SHA-256 is
`938a11e962f0c0ee3db05372e8480d5cf0b552051c3fac8fdd9d09842698a5bd`;
Slice 2A image SHA-256 is
`92dad01b3ef19b3dd0d0b0c216f84dac463cd5f380d9c4496b294e310ee9894e`.
Only the relevant guest character class changed; runtime, watchdogs, toolchains,
lease and limits did not. Original images and all previous observation files
remain preserved. Renewed [Slice 2A observations](../tests/fixtures/orchestrator-vm/path-policy-observed.json)
record two native Codex boots (ordinary edits and all 14 hostile denials each),
inner command sandboxing, unchanged fake host canaries, two literal-parentheses
transfer/fresh-boot probes, startup/operation cancellation, crash, forced kill,
caller-death watchdog attestation and fresh recovery. Renewed
[GRT1 observations](../tests/fixtures/orchestrator-grt1/path-policy-observed.json)
record deep-tree byte/mode/inventory verification and caller-death/crash/forced-kill/
cancellation recovery with the new pinned helper. Caller-death payloads stay
retained for reconciliation. An initial managed runtime-verification rejection
is preserved as a failed attempt; the authorized HVF run passed.

The manual checkout sampler now canonicalizes its temporary root so `/var` versus
`/private/var` aliases cannot hide QEMU RSS. This affects measurement only.
Full root validation passed: `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test -- --maxWorkers=2` including hygiene
(**3,564 tests / 208 files, zero skips, 126.36 seconds**), `npm run build`
and `npm run audit` at the unchanged high threshold (nine moderate findings).
`npm run test:migration` passed **880 root + 332 UI tests**, zero skips
(17.63 seconds and 106.85 seconds respectively). Final prepared typecheck,
scoped lint and focused checkout/input-policy (38 tests) and design (38 tests)
checks passed. The first complete root pass had one historical image-pin
assertion failure (3,563 passed); that historical 2C1 probe now binds to its
original native image evidence, while the current pin is independently bound
to the renewed native observations. No old observation was rewritten or reused
as a current-image attestation. The sandbox audit DNS failure and authorized
passing rerun are retained in local logs.

The real-checkout proof and exact-SHA CI results will be recorded below after
a fresh independently verified source capture.
The original November 10 lock and prior failed-source lock remain byte-identical.
#72 and #41 stay open/blocked; execution remains disabled. Stop after the proof;
no production integration, Agent/relay/promotion or #26/#15/Phase 10 work.

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
