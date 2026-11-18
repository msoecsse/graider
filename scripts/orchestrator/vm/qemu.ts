import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyInputs } from "./inputs.js";
import type { DisposableVm, GuestCommand, GuestResult, VmOperation } from "./contracts.js";

const START_TIMEOUT_MS = 30_000;
const OPERATION_TIMEOUT_MS = 30_000;
const REAP_TIMEOUT_MS = 5_000;
const MAX_FILE_BYTES = 65_536;
const MAX_FRAME_BYTES = 262_144;
const MAX_SESSION_BYTES = 8_388_608;
const MAX_ARGUMENT_BYTES = 16_384;
const MAX_ARGUMENTS = 128;
const MEMORY_MIB = 1536;
const WATCHDOG = new URL("./watchdog.mjs", import.meta.url);

interface Pending {
  id: number;
  accept: (value: string) => void;
  reject: (error: Error) => void;
}
interface CreateOptions {
  artifactDirectory: string;
  stateParent: string;
}
function failure(reason: string): Error {
  return new Error(`VM ${reason}; raw guest/runtime diagnostics withheld.`);
}
function bound(options: VmOperation, maximum: number): number {
  const value = options.timeoutMs ?? maximum;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw failure("invalid timeout");
  return value;
}
function guestPath(value: string): string {
  const segments = value.split("/");
  if (
    !value ||
    value.length > MAX_ARGUMENT_BYTES ||
    !/^[a-zA-Z0-9_./-]+$/.test(value) ||
    segments.some((segment) => /^(?:|\.|\.\.|\.git|\.codex|\.ssh|\.aws)$/i.test(segment))
  )
    throw failure("invalid transfer path");
  return Buffer.from(value).toString("base64");
}
function encoded(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_FILE_BYTES) throw failure("transfer limit");
  return Buffer.from(bytes).toString("base64") || "-";
}
function decoded(value: string): Buffer {
  if (value === "-") return Buffer.alloc(0);
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.length > MAX_FILE_BYTES)
    throw failure("protocol");
  return bytes;
}

/** One create/start lifetime is one execution. Stopped instances cannot restart. */
export async function createQemuVm(options: CreateOptions): Promise<DisposableVm> {
  const directory = await mkdtemp(path.join(options.stateParent, "graider-vm-"));
  const work = path.join(directory, "disposable");
  try {
    await mkdir(work, { mode: 0o700 });
    const inputs = await verifyInputs(options.artifactDirectory, work);
    return new QemuVm(directory, work, options.artifactDirectory, inputs.digest);
  } catch {
    await rm(work, { recursive: true, force: true });
    await writeFile(
      path.join(directory, "evidence.json"),
      JSON.stringify({
        id: path.basename(directory),
        events: [{ event: "inputs-unverified", at: new Date().toISOString() }]
      }),
      { mode: 0o600 }
    );
    throw failure("inputs unavailable or unverified");
  }
}

class QemuVm implements DisposableVm {
  readonly id: string;
  private child: ChildProcess | undefined;
  private state = "created";
  private pending: Pending | undefined;
  private sequence = 0;
  private buffer = "";
  private received = 0;
  private reaped = false;
  private closed: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private failing: Promise<void> | undefined;
  private evidenceWrites: Promise<void> = Promise.resolve();
  private readonly events: { event: string; at: string }[] = [];
  private processId: number | undefined;
  constructor(
    private readonly directory: string,
    private readonly work: string,
    private readonly artifacts: string,
    private readonly digest: string
  ) {
    this.id = path.basename(directory);
  }
  private async evidence(event: string): Promise<void> {
    this.events.push({ event, at: new Date().toISOString() });
    // No raw output, commands, paths, environment values or exception text.
    const evidence = JSON.stringify({
      id: this.id,
      digest: this.digest,
      processId: this.processId,
      events: this.events
    });
    this.evidenceWrites = this.evidenceWrites.then(async () =>
      writeFile(path.join(this.directory, "evidence.json"), evidence, { mode: 0o600 })
    );
    await this.evidenceWrites;
  }
  async start(options: VmOperation = {}): Promise<void> {
    const timeout = bound(options, START_TIMEOUT_MS);
    const deadline = performance.now() + timeout;
    const startupSignal = AbortSignal.any([
      AbortSignal.timeout(timeout),
      ...(options.signal ? [options.signal] : [])
    ]);
    if (this.state !== "created") throw failure("instance is single-use");
    this.state = "starting";
    try {
      options.signal?.throwIfAborted();
      // Reverify immediately before launch, including HVF and runtime closure.
      const inputs = await verifyInputs(this.artifacts, this.work, startupSignal);
      startupSignal.throwIfAborted();
      options.signal?.throwIfAborted();
      if (this.state !== "starting") throw failure("startup interrupted");
      const env = { PATH: "/usr/bin:/bin", HOME: this.work, TMPDIR: this.work, LC_ALL: "C" };
      const child = fork(WATCHDOG, [], {
        cwd: this.work,
        env,
        execArgv: [],
        detached: true,
        stdio: ["pipe", "pipe", "pipe", "ipc"]
      });
      this.child = child;
      this.closed = new Promise((resolve) => {
        child.on("close", () => {
          if (this.state !== "stopping") void this.evidence("runtime-exit");
          this.state = "stopped";
          this.pending?.reject(failure("runtime exited"));
          resolve();
        });
      });
      child.on("message", (message: unknown) => {
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "reaped"
        )
          this.reaped = true;
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "spawned" &&
          "pid" in message &&
          typeof message.pid === "number"
        )
          this.processId = message.pid;
      });
      child.on("error", () => {
        void this.fail("watchdog");
      });
      child.stdout?.on("data", (data: Buffer) => {
        this.receive(data);
      });
      child.stderr?.on("data", () => {
        /* Never retain watchdog exception text. */
      });
      const ready = this.wait(0, Math.max(1, deadline - performance.now()), startupSignal);
      child.send({
        type: "launch",
        file: inputs.qemu,
        args: [
          "-no-user-config",
          "-L",
          this.work,
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
        cwd: this.work,
        evidenceFile: path.join(this.directory, "watchdog.json"),
        env
      });
      if ((await ready) !== "READY") throw failure("protocol");
      this.state = "running";
      await this.evidence("started-hvf");
    } catch {
      await this.fail(options.signal?.aborted ? "cancelled" : "startup");
      throw failure(options.signal?.aborted ? "cancelled" : "startup timeout or failure");
    }
  }
  private receive(data: Buffer): void {
    this.received += data.length;
    this.buffer += data.toString("ascii");
    if (this.buffer.length > MAX_FRAME_BYTES || this.received > MAX_SESSION_BYTES) {
      void this.fail("output-limit");
    } else {
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (line.startsWith("GVM1 ")) {
          const match = /^GVM1 (READY|([0-9]+) (.*))$/.exec(line);
          const id = match?.[1] === "READY" ? 0 : Number(match?.[2]);
          if (!match || !this.pending || this.pending.id !== id) void this.fail("protocol");
          else this.pending.accept(id === 0 ? "READY" : (match[3] ?? ""));
        }
      }
    }
  }
  private wait(id: number, timeout: number, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const settle = (action: () => void): void => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        this.pending = undefined;
        action();
      };
      const cancel = (): void => {
        void this.fail("cancelled");
      };
      const timer = setTimeout(() => {
        void this.fail("timeout");
      }, timeout);
      this.pending = {
        id,
        accept: (value) => {
          settle(() => {
            resolve(value);
          });
        },
        reject: (error) => {
          settle(() => {
            reject(error);
          });
        }
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }
  private async fail(reason: string): Promise<void> {
    this.failing ??= this.recordFailure(reason);
    await this.failing;
  }
  private async recordFailure(reason: string): Promise<void> {
    const pending = this.pending;
    this.pending = undefined;
    try {
      await this.shutdown();
      await this.evidence(reason);
      pending?.reject(failure(reason));
    } catch {
      pending?.reject(failure("reaping unverified"));
    }
  }
  private async request(operation: string, payload: string, options: VmOperation): Promise<string> {
    const timeout = bound(options, OPERATION_TIMEOUT_MS);
    if (this.state !== "running" || this.pending) throw failure("not ready or busy");
    if (options.signal?.aborted) throw failure("cancelled");
    const id = ++this.sequence;
    const result = this.wait(id, timeout, options.signal);
    this.child?.stdin?.write(`${operation} ${String(id)} ${payload}\n`);
    return result;
  }
  async run(command: GuestCommand, options: VmOperation = {}): Promise<GuestResult> {
    const argv = [command.executable, ...command.args];
    if (
      !command.executable.startsWith("/") ||
      argv.length > MAX_ARGUMENTS ||
      argv.some((value) => value.includes("\0")) ||
      Buffer.byteLength(argv.join("\0")) > MAX_ARGUMENT_BYTES
    )
      throw failure("invalid argv");
    const response = await this.request(
      "RUN",
      Buffer.from(`${argv.join("\0")}\0`).toString("base64"),
      options
    );
    try {
      const match = /^EXIT ([0-9]{1,3}) ([A-Za-z0-9+/=-]+) ([A-Za-z0-9+/=-]+)$/.exec(response);
      const exitCode = Number(match?.[1]);
      const MAX_EXIT_CODE = 255;
      if (!match || exitCode > MAX_EXIT_CODE) throw failure("protocol");
      return { exitCode, stdout: decoded(match[2] ?? ""), stderr: decoded(match[3] ?? "") };
    } catch {
      await this.fail("protocol");
      throw failure("protocol");
    }
  }
  async putFile(relativePath: string, bytes: Uint8Array, options: VmOperation = {}): Promise<void> {
    const response = await this.request(
      "PUT",
      `${guestPath(relativePath)} ${encoded(bytes)}`,
      options
    );
    if (response !== "OK") {
      await this.fail("transfer");
      throw failure("transfer");
    }
  }
  async getFile(relativePath: string, options: VmOperation = {}): Promise<Buffer> {
    const response = await this.request("GET", guestPath(relativePath), options);
    try {
      if (!response.startsWith("DATA ")) throw failure("transfer");
      return decoded(response.slice("DATA ".length));
    } catch {
      await this.fail("transfer");
      throw failure("transfer");
    }
  }
  async shutdown(): Promise<void> {
    this.stopping ??= this.stop();
    await this.stopping;
  }
  private async stop(): Promise<void> {
    if (!this.child) {
      this.state = "stopped";
    } else {
      if (this.state !== "stopped") {
        this.state = "stopping";
        if (this.child.connected) this.child.send({ type: "stop" });
      }
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this.closed,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(failure("reaping timeout"));
            }, REAP_TIMEOUT_MS);
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
      if (!this.reaped) throw failure("reaping unverified");
    }
  }
  async destroy(): Promise<void> {
    await this.shutdown();
    await this.evidence("destroyed");
    await rm(this.work, { recursive: true, force: true });
    this.state = "destroyed";
  }
}
