/** Standalone hardware-only test transport. No production DisposableVm interface. */
import { fork, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyInputs } from "./inputs.js";
import { fail, LIMITS, PROFILE } from "./protocol.js";
import type { Cleanup, Transport } from "./transfer.js";
import type { Pipes } from "./channel.js";

const MEMORY_MIB = 1536;
const REAP_MS = 5_000;
const WATCHDOG = new URL("./watchdog.mjs", import.meta.url);
export class HvfTestTransport implements Transport {
  private child: ChildProcess | undefined;
  private reaped = false;
  private closed: Promise<void> | undefined;
  private stopping: Promise<Cleanup> | undefined;
  private started = false;
  private inputDigest: string | undefined;
  private failure: string | undefined;
  private processId: number | undefined;
  private constructor(
    readonly directory: string,
    private readonly artifacts: string
  ) {}
  static async create(stateParent: string, artifacts: string): Promise<HvfTestTransport> {
    const directory = await mkdtemp(path.join(stateParent, "graider-grt1-"));
    return new HvfTestTransport(directory, artifacts);
  }
  private async evidence(status: string): Promise<void> {
    await writeFile(
      path.join(this.directory, "evidence.json"),
      JSON.stringify({
        profile: PROFILE,
        status,
        inputDigest: this.inputDigest,
        processId: this.processId,
        failure: this.failure,
        at: new Date().toISOString()
      }),
      { mode: 0o600 }
    );
  }
  async record(evidence: Record<string, unknown>): Promise<void> {
    await writeFile(path.join(this.directory, "transcript.json"), JSON.stringify(evidence), {
      mode: 0o600
    });
  }
  private interrupted(): boolean {
    return this.stopping !== undefined;
  }
  async start(signal: AbortSignal): Promise<Pipes> {
    if (this.started || this.stopping) fail("single-use-transport");
    this.started = true;
    const work = path.join(this.directory, "disposable");
    try {
      await mkdir(work, { mode: 0o700 });
      const startupSignal = AbortSignal.any([signal, AbortSignal.timeout(LIMITS.operationMs)]);
      const inputs = await verifyInputs(this.artifacts, work, startupSignal);
      startupSignal.throwIfAborted();
      if (this.interrupted()) fail("startup-interrupted");
      this.inputDigest = inputs.digest;
      const env = { PATH: "/usr/bin:/bin", HOME: work, TMPDIR: work, LC_ALL: "C" };
      const child = fork(WATCHDOG, [], {
        cwd: work,
        env,
        execArgv: [],
        detached: true,
        stdio: ["pipe", "pipe", "pipe", "ipc"]
      });
      this.child = child;
      this.closed = new Promise((resolve) => {
        child.once("close", () => {
          if (!this.stopping) this.failure ??= "unexpected-runtime-exit";
          resolve();
        });
      });
      child.on("message", (message: unknown) => {
        if (typeof message === "object" && message !== null && "type" in message) {
          if (message.type === "reaped") this.reaped = true;
          if (message.type === "spawned" && "pid" in message && typeof message.pid === "number")
            this.processId = message.pid;
        }
      });
      child.on("error", () => {
        this.failure ??= "watchdog-failed";
      });
      const abort = (): void => {
        if (child.connected) child.send({ type: "stop" });
      };
      signal.addEventListener("abort", abort, { once: true });
      child.once("close", () => {
        signal.removeEventListener("abort", abort);
      });
      if (!child.stdin || !child.stdout || !child.stderr) fail("pipes-unavailable");
      // Launch on the next turn so Channel installs READY/diagnostic handlers first.
      setImmediate(() => {
        if (child.connected && !this.stopping && !signal.aborted)
          child.send({
            type: "launch",
            file: inputs.qemu,
            args: [
              "-no-user-config",
              "-L",
              work,
              "-machine",
              "virt",
              "-accel",
              "hvf",
              "-cpu",
              "host",
              "-m",
              String(MEMORY_MIB),
              "-nodefaults",
              "-display",
              "none",
              "-serial",
              "stdio",
              "-monitor",
              "none",
              "-nic",
              "none",
              "-no-reboot",
              "-kernel",
              inputs.kernel,
              "-initrd",
              inputs.image,
              "-append",
              "console=ttyAMA0 rdinit=/init panic=-1 quiet"
            ],
            cwd: work,
            evidenceFile: path.join(this.directory, "watchdog.json"),
            env
          });
      });
      await this.evidence("launching-hvf");
      return { input: child.stdin, output: child.stdout, diagnostics: child.stderr };
    } catch {
      this.failure ??= "inputs/startup-failed";
      await this.evidence("startup-failed");
      fail("inputs/startup-unverified");
    }
  }
  stop(): Promise<Cleanup> {
    this.stopping ??= this.cleanup();
    return this.stopping;
  }
  private async cleanup(): Promise<Cleanup> {
    const child = this.child;
    let closed = !child;
    if (child) {
      if (child.connected) child.send({ type: "stop" });
      const completed = this.closed?.then(() => true);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          resolve(false);
        }, REAP_MS);
      });
      closed = await Promise.race([completed ?? Promise.resolve(false), deadline]);
      clearTimeout(timer);
    }
    const reaped = !child || (this.reaped && closed);
    if (reaped) await rm(path.join(this.directory, "disposable"), { recursive: true, force: true });
    await this.evidence(reaped ? "reaped-payload-removed" : "reaping-unverified-payload-retained");
    return { reaped, payloadRemoved: reaped, ...(this.failure ? { runtimeFailure: true } : {}) };
  }
}
