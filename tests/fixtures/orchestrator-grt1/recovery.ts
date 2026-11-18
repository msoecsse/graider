/** Manual no-credential HVF lifecycle experiments for this standalone test image. */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HvfTestTransport } from "../../../scripts/orchestrator/grt1/hvf.js";
import { transfer } from "../../../scripts/orchestrator/grt1/transfer.js";
import { sha256 } from "../../../scripts/orchestrator/grt1/protocol.js";

const [role, artifacts, scenario, parentDirectory] = process.argv.slice(2);
const SCENARIOS = ["death", "crash", "forced", "cancel"];
if (!artifacts || !scenario || !SCENARIOS.includes(scenario))
  throw new Error("Pass parent|worker pinned-artifacts death|crash|forced|cancel");
const directory =
  parentDirectory ?? (await mkdtemp(path.join(tmpdir(), "graider-72-grt1-recovery-")));
const script = fileURLToPath(import.meta.url);
const DEADLINE_MS = 40_000;
if (role === "worker") {
  const vm = await HvfTestTransport.create(directory, artifacts);
  const controller = new AbortController();
  process.on("message", () => {
    controller.abort();
  });
  const SIZE = 524_288;
  const HEAD_HEX = 40;
  const data = Buffer.alloc(SIZE);
  const manifest = {
    version: 1,
    repository: "msoecsse/graider",
    branch: "remote-course-v2",
    head: "a".repeat(HEAD_HEX),
    issue: 72,
    files: [{ path: "synthetic.bin", mode: "100644", size: SIZE, sha256: sha256(data) }]
  };
  let announced = false;
  let failed = false;
  try {
    await transfer(
      vm,
      manifest,
      {
        size: SIZE,
        sha256: sha256(data),
        read: async (_offset, length) => {
          if (!announced) {
            announced = true;
            const evidence: unknown = JSON.parse(
              await readFile(path.join(vm.directory, "watchdog.json"), "utf8")
            );
            if (
              typeof evidence !== "object" ||
              evidence === null ||
              !("pid" in evidence) ||
              typeof evidence.pid !== "number"
            )
              throw new Error("No pinned HVF process evidence");
            process.send?.({ type: "ready", directory: vm.directory, pid: evidence.pid });
            if (scenario !== "cancel") return await new Promise<Buffer>(() => {});
          }
          return data.subarray(0, length);
        }
      },
      { signal: controller.signal }
    );
  } catch {
    failed = true;
  }
  const cleanup = await vm.stop();
  process.send?.({ type: "outcome", failed, cleanup });
  process.disconnect?.();
} else {
  assert.equal(role, "parent");
  console.log(directory);
  const started = performance.now();
  const worker = fork(script, ["worker", artifacts, scenario, directory], {
    execArgv: ["--import", "tsx"],
    env: { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory },
    stdio: ["ignore", "ignore", "ignore", "ipc"]
  });
  let vmDirectory = "";
  let outcome: unknown;
  const exit = new Promise<void>((resolve) => {
    worker.once("close", () => {
      resolve();
    });
  });
  const ready = new Promise<void>((resolve, reject) => {
    worker.on("error", reject);
    worker.on("message", (message: unknown) => {
      if (typeof message !== "object" || message === null || !("type" in message))
        reject(new Error("Invalid worker evidence"));
      else if (
        message.type === "ready" &&
        "directory" in message &&
        typeof message.directory === "string" &&
        "pid" in message &&
        typeof message.pid === "number"
      ) {
        vmDirectory = message.directory;
        if (scenario === "death") worker.kill("SIGKILL");
        if (scenario === "crash") process.kill(message.pid, "SIGKILL");
        if (scenario === "forced") {
          process.kill(message.pid, "SIGSTOP");
          worker.send({ cancel: true });
        }
        if (scenario === "cancel") worker.send({ cancel: true });
        resolve();
      } else if (message.type === "outcome") outcome = message;
    });
    worker.once("close", () => {
      if (!vmDirectory) reject(new Error("Worker failed before confirmed HVF boot"));
    });
  });
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  const expired = new Promise<never>((_resolve, reject) => {
    deadline.addEventListener(
      "abort",
      () => {
        worker.kill("SIGKILL");
        reject(new Error("Recovery deadline"));
      },
      { once: true }
    );
  });
  await Promise.race([ready, expired]);
  await Promise.race([exit, expired]);
  let watchdog: unknown;
  const POLL_MS = 50;
  const CLEANUP_MS = 5_000;
  const end = performance.now() + CLEANUP_MS;
  let reaped = false;
  while (!reaped && performance.now() < end) {
    try {
      watchdog = JSON.parse(
        await readFile(path.join(vmDirectory, "watchdog.json"), "utf8")
      ) as unknown;
      reaped =
        typeof watchdog === "object" &&
        watchdog !== null &&
        "status" in watchdog &&
        watchdog.status === "reaped";
    } catch {
      /* Atomicity is not inferred from an intermediate evidence write. */
    }
    if (!reaped)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, POLL_MS);
      });
  }
  assert.equal(reaped, true);
  const retained = scenario === "death";
  if (retained)
    assert.equal((await stat(path.join(vmDirectory, "disposable"))).isDirectory(), true);
  else {
    await assert.rejects(stat(path.join(vmDirectory, "disposable")), { code: "ENOENT" });
    assert.ok(
      typeof outcome === "object" && outcome !== null && "failed" in outcome && outcome.failed
    );
  }
  const result = {
    scenario,
    confirmedHvfBoot: true,
    elapsedMs: performance.now() - started,
    watchdog,
    outcome,
    payloadRetainedForReconciliation: retained,
    vmDirectory,
    scriptSha256: sha256(await readFile(script))
  };
  await writeFile(path.join(directory, "result.json"), JSON.stringify(result, null, 2), {
    mode: 0o600
  });
  console.log(JSON.stringify(result, null, 2));
}
