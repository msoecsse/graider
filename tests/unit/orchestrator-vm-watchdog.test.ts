import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supervise } from "../../scripts/orchestrator/vm/watchdog.mjs";

class Parent extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  connected = true;
  messages: unknown[] = [];
  send(message: unknown): void {
    this.messages.push(message);
  }
  disconnect(): void {
    this.connected = false;
    this.emit("disconnect");
  }
}
const FAKE_PID = 12345;
function fixture() {
  vi.useFakeTimers();
  const parent = new Parent();
  const child = Object.assign(new EventEmitter(), {
    pid: FAKE_PID,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough()
  });
  let groupExists = true;
  const kill = vi.fn((_pid: number, signal: NodeJS.Signals | 0): boolean => {
    if (signal === 0 && !groupExists) throw Object.assign(new Error("gone"), { code: "ESRCH" });
    return true;
  });
  const spawn = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
  const write = vi.fn();
  supervise(parent, spawn, kill, write);
  parent.emit("message", {
    type: "launch",
    file: "/reviewed/qemu",
    args: ["-accel", "hvf"],
    cwd: "/fresh",
    env: { HOME: "/fresh" },
    evidenceFile: "/fresh/evidence"
  });
  return {
    parent,
    child,
    kill,
    spawn,
    write,
    gone: () => {
      groupExists = false;
    }
  };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("watchdog recovery state machine (simulated processes)", () => {
  it("kills the entire process group on caller loss, escalates and attests only after close and group absence", () => {
    const f = fixture();
    f.parent.emit("disconnect");
    expect(f.kill).toHaveBeenCalledWith(-FAKE_PID, "SIGTERM");
    const graceMs = 250;
    vi.advanceTimersByTime(graceMs);
    expect(f.kill).toHaveBeenCalledWith(-FAKE_PID, "SIGKILL");
    expect(f.parent.messages).not.toContainEqual(expect.objectContaining({ type: "reaped" }));
    f.gone();
    f.child.emit("close", null, "SIGKILL");
    expect(f.parent.messages).toContainEqual({ type: "reaped", code: null });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds a hung supervisor's lease and redacts runtime stderr", () => {
    const f = fixture();
    f.child.stderr.write("Authorization: Bearer fake-secret");
    const leaseMs = 120_000;
    vi.advanceTimersByTime(leaseMs);
    expect(f.kill).toHaveBeenCalledWith(-FAKE_PID, "SIGTERM");
    f.gone();
    f.child.emit("close", 0, null);
    expect(JSON.stringify(f.write.mock.calls)).not.toContain("fake-secret");
    expect(JSON.stringify(f.write.mock.calls)).toContain("lease-expired");
  });
  it("preserves an unverified outcome if the process group survives, without falsely attesting reaping", () => {
    const f = fixture();
    f.child.emit("close", null, "SIGKILL");
    vi.runAllTimers();
    expect(f.parent.messages).not.toContainEqual(expect.objectContaining({ type: "reaped" }));
    expect(JSON.stringify(f.write.mock.calls)).toContain("unverified");
  });
  it("handles broken pipes and evidence-write failure without abandoning termination", () => {
    const f = fixture();
    f.write.mockImplementation(() => {
      throw new Error("disk unavailable");
    });
    f.parent.stdout.emit("error", new Error("EPIPE fake-secret"));
    expect(f.kill).toHaveBeenCalledWith(-FAKE_PID, "SIGTERM");
    f.gone();
    f.child.emit("close", 0, null);
    expect(f.parent.messages).toContainEqual({ type: "reaped", code: 0 });
  });
});
