/** Standalone transport tests; no VM, credentials, source capture or runner authority. */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safePaths } from "../../scripts/orchestrator/baseline-source.js";
import { Channel } from "../../scripts/orchestrator/grt1/channel.js";
import pins from "../../scripts/orchestrator/grt1/test-image-pins.json" with { type: "json" };
import {
  LIMITS,
  EMPTY_SHA256,
  PROFILE,
  control,
  decodeData,
  encodeData,
  sha256
} from "../../scripts/orchestrator/grt1/protocol.js";
import { admitManifest } from "../../scripts/orchestrator/grt1/manifest.js";
import { transfer, type Transport, type Source } from "../../scripts/orchestrator/grt1/transfer.js";

const CHUNK = 32_768;
const MAX_FILE = 524_288;
const SESSION_HEX = 32;
const HEAD_HEX = 40;
const DIGEST_HEX = 64;
const SMALL_BYTES = 17;
const WITHOUT_LAST = -1;
const SESSION = "a".repeat(SESSION_HEX);
const HEAD = "b".repeat(HEAD_HEX);
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}
const temporary: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];
// Test-only timing: fixed operation labels and numeric counts, never paths, argv,
// environment, wire contents or raw subprocess errors. Snapshot before Vitest's
// existing deadline so a stalled startup/exchange remains distinguishable.
const TIMING_SNAPSHOT_MS = 4_000;
const timedReceivers: { timer: ReturnType<typeof setTimeout>; report: () => void }[] = [];
let receiverOrdinal = 0;
afterEach(async () => {
  const began = performance.now();
  for (const child of children.splice(0)) child.kill();
  await Promise.all(
    temporary.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  );
  for (const timing of timedReceivers.splice(0)) {
    clearTimeout(timing.timer);
    timing.report();
  }
  if (performance.now() - began >= TIMING_SNAPSHOT_MS)
    console.info("GRT1 teardown timing", JSON.stringify({ elapsedMs: performance.now() - began }));
  vi.useRealTimers();
});
function fixture(sizes = [0, SMALL_BYTES, MAX_FILE, 1, CHUNK + 1]) {
  const files = sizes.map((size, index) => {
    const bytes = Buffer.alloc(size);
    const BYTE_VALUES = 256;
    for (let offset = 0; offset < size; offset++) bytes[offset] = (offset + index) % BYTE_VALUES;
    return {
      path: `d${String(index)}/file.bin`,
      mode: index % 2 ? "100755" : "100644",
      size,
      sha256: sha256(bytes),
      bytes
    };
  });
  const data = Buffer.concat(files.map((file) => file.bytes));
  const manifest = {
    version: 1,
    repository: "msoecsse/graider",
    branch: "remote-course-v2",
    head: HEAD,
    issue: 72,
    files: files.map((file) => ({
      path: file.path,
      mode: file.mode,
      size: file.size,
      sha256: file.sha256
    }))
  };
  const source: Source = {
    size: data.length,
    sha256: sha256(data),
    read: (offset, size) => Promise.resolve(data.subarray(offset, offset + size))
  };
  return { files, data, manifest, source };
}
async function receiver(
  mutation = "",
  uncertain = false
): Promise<Transport & { root: string; child: ChildProcessWithoutNullStreams }> {
  const began = performance.now();
  const ordinal = ++receiverOrdinal;
  const marks: Record<string, number> = {};
  const exchanges: Record<string, { count: number; elapsedMs: number; maximumMs: number }> = {};
  let pending: string | undefined;
  const report = () => {
    console.info(
      "GRT1 receiver timing",
      JSON.stringify({ ordinal, elapsedMs: performance.now() - began, marks, pending, exchanges })
    );
  };
  timedReceivers.push({ timer: setTimeout(report, TIMING_SNAPSHOT_MS), report });
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The observer reapplies the original Channel receiver with apply below.
  const exchange = Channel.prototype.exchange;
  const operations = new Set([
    "START",
    "M",
    "SEAL_MANIFEST",
    "D",
    "SEAL_DATA",
    "GET",
    "BEGIN_READBACK",
    "END_READBACK",
    "FINISH"
  ]);
  vi.spyOn(Channel.prototype, "exchange").mockImplementation(async function (
    this: Channel,
    ...args: Parameters<Channel["exchange"]>
  ) {
    const field = args[0]?.toString("ascii").trimEnd().split(" ")[3];
    const operation = field === undefined ? "READY" : operations.has(field) ? field : "unknown";
    pending = operation;
    const started = performance.now();
    marks.sentBytes = (marks.sentBytes ?? 0) + (args[0]?.length ?? 0);
    try {
      const response = await exchange.apply(this, args);
      marks.receivedBytes = (marks.receivedBytes ?? 0) + response.length;
      return response;
    } finally {
      const elapsedMs = performance.now() - started;
      const entry = exchanges[operation] ?? { count: 0, elapsedMs: 0, maximumMs: 0 };
      entry.count++;
      entry.elapsedMs += elapsedMs;
      entry.maximumMs = Math.max(entry.maximumMs, elapsedMs);
      exchanges[operation] = entry;
      pending = undefined;
      marks.lastExchangeMs = performance.now() - began;
    }
  });
  const root = await mkdtemp(path.join(tmpdir(), "graider-grt1-test-"));
  marks.workspaceMs = performance.now() - began;
  temporary.push(root);
  const helper = fileURLToPath(
    new URL("../../scripts/orchestrator/grt1/guest.py", import.meta.url)
  );
  // Only the test harness supplies a root/mutation. The image entry point has no arguments.
  const harness = fileURLToPath(
    new URL("../fixtures/orchestrator-grt1/harness.py", import.meta.url)
  );
  const spawnBegan = performance.now();
  const child = spawn(
    process.platform === "win32" ? "python" : "python3",
    ["-I", "-B", harness, helper, root, mutation],
    {
      stdio: "pipe",
      env: {
        PATH: process.env.PATH,
        ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {})
      }
    }
  );
  marks.spawnCallMs = performance.now() - spawnBegan;
  child.once("spawn", () => {
    marks.spawnEventMs = performance.now() - began;
  });
  child.once("exit", () => {
    marks.exitMs = performance.now() - began;
  });
  children.push(child);
  let closed = false;
  const exit = new Promise<void>((resolve) =>
    child.on("close", () => {
      marks.closeMs = performance.now() - began;
      closed = true;
      resolve();
    })
  );
  return {
    root,
    child,
    start: () =>
      Promise.resolve({ input: child.stdin, output: child.stdout, diagnostics: child.stderr }),
    stop: async () => {
      marks.stopMs = performance.now() - began;
      if (!closed) child.kill();
      await exit;
      marks.reapedMs = performance.now() - began;
      return { reaped: !uncertain, payloadRemoved: !uncertain };
    }
  };
}

describe("GRT1 bounded framing", () => {
  const frame = () => encodeData(SESSION, 1, "D", 0, Buffer.alloc(CHUNK));
  it("round trips binary data at the chunk cap", () => {
    const decoded = decodeData(frame());
    expect(decoded.bytes).toEqual(Buffer.alloc(CHUNK));
    expect(frame().length).toBeLessThanOrEqual(LIMITS.frame);
  });
  it.each([
    ["version", (s: string) => s.replace("GRT1", "GRT2")],
    ["session", (s: string) => s.replace(SESSION, "z".repeat(SESSION_HEX))],
    ["sequence", (s: string) => s.replace(" 1 D", " 01 D")],
    ["phase", (s: string) => s.replace(" D ", " X ")],
    ["offset", (s: string) => s.replace(" D 0 ", " D -1 ")],
    ["length", (s: string) => s.replace(` ${String(CHUNK)} `, " 1 ")],
    ["digest", (s: string) => s.replace(sha256(Buffer.alloc(CHUNK)), "0".repeat(DIGEST_HEX))],
    ["padding", (s: string) => s.replace(/=\n$/, "\n")],
    ["CR", (s: string) => s.replace("\n", "\r\n")],
    ["extra line", (s: string) => `${s}\n`],
    ["truncation", (s: string) => s.slice(0, WITHOUT_LAST)]
  ])("rejects malformed %s", (_name, mutate) => {
    expect(() => decodeData(Buffer.from(mutate(frame().toString())))).toThrow();
  });
  it("rejects oversized and non-ASCII input before decoding", () => {
    expect(() => decodeData(Buffer.alloc(LIMITS.frame + 1))).toThrow();
    const bytes = frame();
    bytes[0] = 0xc7;
    expect(() => decodeData(bytes)).toThrow();
  });
});

describe("GRT1 manifest admission", () => {
  it("adds only parentheses to the ASCII alphabet shared with source admission", () => {
    const ASCII_CHARACTERS = 128;
    const allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_./()-";
    for (let code = 0; code < ASCII_CHARACTERS; code++) {
      const character = String.fromCharCode(code);
      if (!allowed.includes(character)) {
        const name = `a${character}b`;
        const value = fixture([0]).manifest;
        required(value.files[0]).path = name;
        expect(() => safePaths([name])).toThrow();
        expect(() => admitManifest(value)).toThrow();
      }
    }
  });
  it.each([
    "../escape",
    "/escape",
    "C:/escape",
    "a:stream",
    "a/CON.txt",
    "NUL.txt",
    "a;b",
    "a$b",
    "a`b",
    "a[b]",
    "a{b}",
    "a!b",
    "a&b",
    "a b",
    "a./file",
    "a/.git/config",
    "a/.env",
    "a/~1",
    "a//file",
    "a\\b",
    "a/../b"
  ])("rejects unsafe path %s", (name) => {
    const value = fixture([0]).manifest;
    required(value.files[0]).path = name;
    expect(() => admitManifest(value)).toThrow();
  });
  it.each(["alias", "prefix", "duplicate", "mode", "size", "digest", "unknown"])(
    "rejects %s",
    (kind) => {
      const value = fixture([0, 0]).manifest;
      if (kind === "alias") {
        required(value.files[0]).path = "A/file";
        required(value.files[1]).path = "a/other";
      }
      if (kind === "prefix") {
        required(value.files[0]).path = "a";
        required(value.files[1]).path = "a/b";
      }
      if (kind === "duplicate") required(value.files[1]).path = required(value.files[0]).path;
      if (kind === "mode") required(value.files[0]).mode = "120000";
      if (kind === "size") required(value.files[0]).size = MAX_FILE + 1;
      if (kind === "digest") required(value.files[0]).sha256 = "bad";
      if (kind === "unknown") Object.assign(value, { commands: ["evil"] });
      expect(() => admitManifest(value)).toThrow();
    }
  );
  it("bounds file, directory, aggregate and canonical metadata admission", () => {
    expect(() =>
      admitManifest(fixture(Array<number>(LIMITS.files + 1).fill(0)).manifest)
    ).toThrow();
    const count = 33;
    expect(() => admitManifest(fixture(Array<number>(count).fill(MAX_FILE)).manifest)).toThrow();
    expect(() =>
      admitManifest(fixture(Array<number>(LIMITS.directories + 1).fill(0)).manifest)
    ).toThrow();
  });
});

describe("GRT1 complete duplex with the fixed guest source", () => {
  it.each(["reports/a(b).md", "reports/a(.md", "reports/a).md"])(
    "round trips literal parentheses through the fixed guest: %s",
    async (name) => {
      const input = fixture([SMALL_BYTES]);
      required(input.manifest.files[0]).path = name;
      const result = await transfer(await receiver(), input.manifest, input.source);
      expect(result.dataSha256).toBe(input.source.sha256);
    }
  );
  it("handles admitted deep paths without keeping directory descriptors open", async () => {
    const DEPTH = 80;
    const input = fixture([SMALL_BYTES]);
    required(input.manifest.files[0]).path = `${"d/".repeat(DEPTH)}file.bin`;
    const guest = await receiver();
    const result = await transfer(guest, input.manifest, input.source);
    expect(result.dataSha256).toBe(input.source.sha256);
  });
  it.each([[0], [0, 0], [SMALL_BYTES], [MAX_FILE], [0, SMALL_BYTES, MAX_FILE, 1, CHUNK + 1]])(
    "verifies every returned byte, empty file and mode: %j",
    async (...sizes: number[]) => {
      const input = fixture(sizes);
      const guest = await receiver();
      const result = await transfer(guest, input.manifest, input.source);
      expect(result.dataSha256).toBe(sha256(input.data));
      expect(result.wireBytes).toBeGreaterThan(input.data.length * 2);
      expect(result.operations).toBeLessThanOrEqual(LIMITS.operations);
      expect(result.cleanup).toEqual({ reaped: true, payloadRemoved: true });
      expect(result.manifestSha256).toBe(sha256(admitManifest(input.manifest).bytes));
    }
  );
  it.each([
    "session",
    "version",
    "sequence",
    "phase",
    "offset",
    "length",
    "digest",
    "duplicate",
    "truncated",
    "oversized",
    "forged-ack",
    "ack-phase",
    "ack-offset",
    "ack-digest",
    "noise",
    "diagnostic",
    "extra",
    "missing",
    "symlink",
    "hardlink",
    "fifo",
    "mode",
    "corrupt",
    "workspace-full",
    "allocation-failure",
    "noncanonical-manifest",
    "ingress-session",
    "ingress-version",
    "ingress-sequence",
    "ingress-phase",
    "ingress-offset",
    "ingress-length",
    "ingress-digest",
    "ingress-duplicate",
    "ingress-truncated",
    "ingress-oversized"
  ])("terminates on hostile %s", async (mutation) => {
    const guest = await receiver(mutation);
    const input = fixture();
    await expect(transfer(guest, input.manifest, input.source)).rejects.toThrow(/GRT1/);
    expect(guest.child.exitCode !== null || guest.child.signalCode !== null).toBe(true);
  });
  it("rejects a mutable source independently of guest ACKs", async () => {
    const guest = await receiver();
    const input = fixture();
    input.data[0] = required(input.data[0]) ^ 1;
    await expect(transfer(guest, input.manifest, input.source)).rejects.toThrow(/GRT1/);
  });
  it("rejects uncertain cleanup even after a valid FINISH", async () => {
    const guest = await receiver("", true);
    const input = fixture([0]);
    await expect(transfer(guest, input.manifest, input.source)).rejects.toThrow(/reaping/);
  });
  it("cancels a stalled exchange and stops granting credit", async () => {
    const guest = await receiver("stall");
    const input = fixture();
    const controller = new AbortController();
    const pending = transfer(guest, input.manifest, input.source, { signal: controller.signal });
    guest.child.stdout.once("data", () => {
      controller.abort();
    });
    await expect(pending).rejects.toThrow(/GRT1/);
  });
  it("handles a guest crash and startup failure", async () => {
    const input = fixture();
    const guest = await receiver("crash");
    await expect(transfer(guest, input.manifest, input.source)).rejects.toThrow(/GRT1/);
    const failed: Transport = {
      start: () => Promise.reject(new Error("private startup diagnostics")),
      stop: () => Promise.resolve({ reaped: true, payloadRemoved: true })
    };
    await expect(transfer(failed, input.manifest, input.source)).rejects.toThrow(/GRT1/);
  });
  it("rejects an oversized startup stream with bounded buffering", async () => {
    const output = new PassThrough();
    const input = new PassThrough();
    const diagnostics = new PassThrough();
    const transport: Transport = {
      start: () => {
        setImmediate(() => {
          output.write(Buffer.alloc(LIMITS.frame + 1));
        });
        return Promise.resolve({ output, input, diagnostics });
      },
      stop: () => Promise.resolve({ reaped: true, payloadRemoved: true })
    };
    const value = fixture([0]);
    await expect(transfer(transport, value.manifest, value.source)).rejects.toThrow(/GRT1/);
  });
  it("verifies source pins and rejects a nonempty starting workspace", async () => {
    const helper = await readFile(
      new URL("../../scripts/orchestrator/grt1/guest.py", import.meta.url)
    );
    expect(sha256(helper)).toBe(pins.sources["./guest.py"]);
    expect(
      sha256(
        await readFile(new URL("../../scripts/orchestrator/grt1/watchdog.mjs", import.meta.url))
      )
    ).toBe(pins.watchdogSha256);
    expect(helper.toString()).not.toMatch(/subprocess|os\.system|eval\(|exec\(/);
    // A command-shaped file remains bytes throughout the exchange.
    const value = fixture([SMALL_BYTES]);
    const guest = await receiver("nonempty");
    await expect(transfer(guest, value.manifest, value.source)).rejects.toThrow(/GRT1/);
  });
});

describe("GRT1 credit and independent host budgets", () => {
  function channel() {
    const input = new PassThrough();
    const output = new PassThrough();
    const diagnostics = new PassThrough();
    const controller = new AbortController();
    return {
      input,
      output,
      diagnostics,
      controller,
      channel: new Channel({ input, output, diagnostics }, controller.signal)
    };
  }
  it("accepts fragmented frames and rejects a second outstanding exchange", async () => {
    const f = channel();
    const response = f.channel.exchange();
    f.output.write("GRT1 ");
    f.output.write("READY test\n");
    expect((await response).toString()).toBe("GRT1 READY test\n");
    const first = f.channel.exchange();
    const rejected = expect(first).rejects.toThrow(/concurrent/);
    await expect(f.channel.exchange()).rejects.toThrow(/concurrent/);
    await rejected;
    await expect(f.channel.exchange()).rejects.toThrow(/concurrent/);
  });
  it("bounds each operation and retains the first terminal failure", async () => {
    vi.useFakeTimers();
    const f = channel();
    const pending = expect(f.channel.exchange()).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(LIMITS.operationMs);
    await pending;
    f.controller.abort();
    await expect(f.channel.exchange()).rejects.toThrow(/timeout/);
  });
  it("counts malformed and diagnostic traffic after terminal failure without buffering it", () => {
    const f = channel();
    f.output.emit("data", Buffer.from("noise\n"));
    const bytes = Buffer.alloc(LIMITS.chunk);
    const chunks = Math.ceil(LIMITS.wire / bytes.length);
    for (let index = 0; index < chunks; index++) f.output.emit("data", bytes);
    f.diagnostics.emit("data", Buffer.from("diagnostic"));
    expect(f.channel.received + f.channel.diagnostics).toBeGreaterThan(LIMITS.wire);
    expect(() => {
      f.channel.healthy();
    }).toThrow(/unsolicited/);
    expect(f.channel.transcript()).toMatch(/^[a-f0-9]{64}$/);
  });
  it("enforces the operation budget before another write", async () => {
    const f = channel();
    const request = Buffer.from("control\n");
    for (let index = 0; index < LIMITS.operations; index++) {
      const response = f.channel.exchange(request);
      f.output.emit("data", Buffer.from("ack\n"));
      await response;
    }
    await expect(f.channel.exchange(request)).rejects.toThrow(/operation-limit/);
    expect(f.channel.sent).toBe(LIMITS.operations * request.length);
  });
});

describe("GRT1 guest independently admits supervisor manifests", () => {
  it.each([
    "escape",
    "reserved-name",
    "punctuation",
    "alias",
    "protected",
    "mode",
    "empty-digest",
    "unknown",
    "canonical",
    "file-limit",
    "directory-limit",
    "aggregate-limit"
  ])("rejects correctly digested hostile %s metadata", async (kind) => {
    const guest = await receiver();
    const channel = new Channel(
      await guest.start(new AbortController().signal),
      new AbortController().signal
    );
    try {
      expect((await channel.exchange()).toString()).toBe(`GRT1 READY ${PROFILE}\n`);
      const manifest = fixture([0, 0]).manifest;
      const first = required(manifest.files[0]);
      if (kind === "escape") first.path = "../escape";
      if (kind === "reserved-name") first.path = "NUL.txt";
      if (kind === "punctuation") first.path = "a);b";
      if (kind === "protected") first.path = ".git/config";
      if (kind === "alias") {
        first.path = "A/file";
        required(manifest.files[1]).path = "a/other";
      }
      if (kind === "mode") first.mode = "120000";
      if (kind === "empty-digest") first.sha256 = "0".repeat(DIGEST_HEX);
      if (kind === "unknown") Object.assign(manifest, { command: "host-command" });
      if (kind === "file-limit")
        manifest.files = Array.from({ length: LIMITS.files + 1 }, (_, index) => ({
          ...first,
          path: `f${String(index).padStart(4, "0")}`
        }));
      if (kind === "directory-limit")
        manifest.files = Array.from({ length: LIMITS.directories + 1 }, (_, index) => ({
          ...first,
          path: `d${String(index).padStart(4, "0")}/file`
        }));
      if (kind === "aggregate-limit")
        manifest.files = Array.from({ length: LIMITS.source / MAX_FILE + 1 }, (_, index) => ({
          ...first,
          path: `f${String(index).padStart(4, "0")}`,
          size: MAX_FILE
        }));
      const bytes = Buffer.from(JSON.stringify(manifest) + (kind === "canonical" ? " " : ""));
      await channel.exchange(
        control(SESSION, 0, ["START", bytes.length, sha256(bytes), 0, EMPTY_SHA256])
      );
      let sequence = 1;
      for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        await channel.exchange(
          encodeData(SESSION, sequence, "M", offset, bytes.subarray(offset, offset + CHUNK))
        );
        sequence++;
      }
      await expect(channel.exchange(control(SESSION, sequence, ["SEAL_MANIFEST"]))).rejects.toThrow(
        /GRT1/
      );
    } finally {
      await guest.stop();
      channel.detach();
    }
  });
});
