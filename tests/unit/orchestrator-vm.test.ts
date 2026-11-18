import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), fork: vi.fn() }));
vi.mock("../../scripts/orchestrator/vm/inputs.js", () => ({
  verifyInputs: mocks.verify
}));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
import { createQemuVm } from "../../scripts/orchestrator/vm/qemu.js";

class Watchdog extends EventEmitter {
  connected = true;
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  messages: unknown[] = [];
  send(message: unknown): boolean {
    this.messages.push(message);
    if ((message as { type: string }).type === "stop") this.reap();
    return true;
  }
  reap(): void {
    this.emit("message", { type: "reaped", code: 0 });
    this.emit("close", 0);
  }
  ready(): void {
    this.stdout.write("GVM1 READY\n");
  }
}

let parent: string;
let child: Watchdog;
const cleanup: (() => Promise<void>)[] = [];
beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), "graider-vm-test-"));
  child = new Watchdog();
  mocks.fork.mockImplementation(() => {
    child = new Watchdog();
    return child;
  });
  mocks.verify.mockImplementation((_: string, directory: string) =>
    Promise.resolve({
      qemu: path.join(directory, "qemu"),
      kernel: path.join(directory, "kernel"),
      image: path.join(directory, "image"),
      digest: "reviewed digest"
    })
  );
});
afterEach(async () => {
  for (const action of cleanup.splice(0)) await action();
  await rm(parent, { recursive: true, force: true });
});
async function create() {
  const vm = await createQemuVm({ artifactDirectory: parent, stateParent: parent });
  cleanup.push(async () => vm.destroy());
  return vm;
}
async function running() {
  const vm = await create();
  await boot(vm);
  return vm;
}
async function boot(vm: Awaited<ReturnType<typeof create>>) {
  const calls = mocks.fork.mock.calls.length;
  const start = vm.start();
  await vi.waitFor(() => {
    expect(mocks.fork.mock.calls.length).toBe(calls + 1);
  });
  child.ready();
  await start;
}
function reply(id: number, value: string): void {
  child.stdout.write(`GVM1 ${String(id)} ${value}\n`);
}

describe("disposable VM lifecycle (deterministic, not OS enforcement)", () => {
  it("creates unique single-use executions and verifies inputs before launching", async () => {
    const first = await create();
    const second = await create();
    expect(first.id).not.toBe(second.id);
    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.fork).not.toHaveBeenCalled();
    mocks.verify.mockRejectedValueOnce(new Error("unreviewed runtime"));
    await expect(create()).rejects.toThrow("inputs");
    expect(await readdir(parent)).toHaveLength(3);
  });

  it("uses only HVF, no NIC/shares/disks and a clean explicit environment", async () => {
    const vm = await running();
    const launch = child.messages[0] as { args: string[]; env: Record<string, string> };
    expect(launch.args).toContain("hvf");
    expect(launch.args).not.toContain("tcg");
    expect(launch.args).toContain("-nodefaults");
    expect(launch.args).toContain("-no-user-config");
    expect(launch.args).toContain("-nic");
    expect(launch.args).not.toEqual(expect.arrayContaining(["-drive"]));
    expect(Object.keys(launch.env).sort()).toEqual(["HOME", "LC_ALL", "PATH", "TMPDIR"]);
    const invocation = mocks.fork.mock.calls[0]?.[2] as { env: Record<string, string> };
    expect(invocation.env).toEqual(launch.env);
    await vm.shutdown();
    await expect(vm.start()).rejects.toThrow();
  });

  it("transfers bounded bytes, executes argv without shell interpolation and never writes guest paths on host", async () => {
    const vm = await running();
    const put = vm.putFile("src/file.txt", Buffer.from("input"));
    reply(1, "OK");
    await put;
    const result = vm.run({ executable: "/bin/printf", args: ["%s", "$(touch host); secret"] });
    reply(2, "EXIT 7 b3V0 ZXJy");
    expect(await result).toEqual({
      exitCode: 7,
      stdout: Buffer.from("out"),
      stderr: Buffer.from("err")
    });
    const get = vm.getFile("src/file.txt");
    reply(3, "DATA aW5wdXQ=");
    expect(await get).toEqual(Buffer.from("input"));
    await expect(vm.putFile("../escape", Buffer.alloc(0))).rejects.toThrow();
    await expect(vm.getFile(".git/config")).rejects.toThrow();
    expect(await readdir(parent)).toHaveLength(1);
  });

  it("cancellation, a bounded timeout, and startup failure reap before destruction", async () => {
    const vm = await running();
    const abort = new AbortController();
    const run = vm.run({ executable: "/bin/sleep", args: ["30"] }, { signal: abort.signal });
    abort.abort();
    await expect(run).rejects.toThrow("cancelled");
    expect(child.messages).toContainEqual({ type: "stop" });
    await vm.destroy();
    expect(await readdir(path.join(parent, vm.id))).toEqual(["evidence.json"]);
    const next = await create();
    await expect(next.start({ timeoutMs: 1 })).rejects.toThrow("timeout");
    expect(child.messages).toContainEqual({ type: "stop" });
  });

  it("kills a crashed or malformed guest and retains only structured redacted evidence", async () => {
    const vm = await running();
    const run = vm.run({ executable: "/bin/echo", args: ["fake-secret"] });
    child.stdout.write("GVM1 1 EXIT ghp_fake-secret\n");
    await expect(run).rejects.toThrow();
    const entries = await readdir(parent);
    const evidence = await readFile(path.join(parent, entries[0] ?? "", "evidence.json"), "utf8");
    expect(evidence).not.toMatch(/fake-secret|ghp_|echo/);
    expect(evidence).toContain("protocol");
  });

  it("refuses to discard resources when watchdog exit does not attest reaping", async () => {
    const vm = await running();
    const run = vm.run({ executable: "/bin/true", args: [] });
    child.emit("close", 1);
    await expect(run).rejects.toThrow();
    await expect(vm.destroy()).rejects.toThrow("reap");
    expect(await readdir(parent)).toHaveLength(1);
    cleanup.pop();
  });

  it("bounds run duration, rejects concurrent operations and stops on a forged reply", async () => {
    const vm = await running();
    await expect(
      vm.run({ executable: "/bin/true", args: [] }, { timeoutMs: Infinity })
    ).rejects.toThrow();
    const run = vm.run({ executable: "/bin/sleep", args: ["30"] });
    await expect(vm.getFile("file")).rejects.toThrow("busy");
    const forgedRequestId = 99;
    reply(forgedRequestId, "OK");
    await expect(run).rejects.toThrow("protocol");
    expect(child.messages).toContainEqual({ type: "stop" });
  });

  it("terminates on output flooding and on command timeout", async () => {
    const vm = await running();
    const run = vm.run({ executable: "/bin/true", args: [] });
    const overFrameLimit = 262_145;
    child.stdout.write("x".repeat(overFrameLimit));
    await expect(run).rejects.toThrow("output-limit");
    const next = await create();
    await boot(next);
    await expect(
      next.run({ executable: "/bin/sleep", args: ["30"] }, { timeoutMs: 1 })
    ).rejects.toThrow("timeout");
  });

  it("rejects excessive transfer/argv and pre-cancelled operations without leaking the abort reason", async () => {
    const vm = await running();
    const overFileLimit = 65_537;
    await expect(vm.putFile("large", Buffer.alloc(overFileLimit))).rejects.toThrow("limit");
    await expect(vm.run({ executable: "/bin/echo", args: ["a\0b"] })).rejects.toThrow("argv");
    const abort = new AbortController();
    abort.abort("fake-private-reason");
    await expect(vm.getFile("file", { signal: abort.signal })).rejects.toThrow("cancelled");
    expect(child.messages).toHaveLength(1);
  });

  it("cannot start after shutdown interrupts input verification", async () => {
    const vm = await create();
    const release = Promise.withResolvers<never>();
    mocks.verify.mockReturnValueOnce(release.promise);
    const start = vm.start();
    await vm.shutdown();
    release.reject(new Error("interrupted"));
    await expect(start).rejects.toThrow();
    expect(mocks.fork).not.toHaveBeenCalled();
  });
});
