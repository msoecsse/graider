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
