/** Credential-free checkout fixtures and portable protocol double; never native VM acceptance. */
import { spawn } from "node:child_process";
import { chmod, link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { exec as bundledGit } from "dugite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import startingTree from "../fixtures/orchestrator-grt1/starting-tree.json" with { type: "json" };
import { admitManifest } from "../../scripts/orchestrator/grt1/manifest.js";
import { sha256 } from "../../scripts/orchestrator/grt1/protocol.js";
import type { Transport } from "../../scripts/orchestrator/grt1/transfer.js";
const mocks = vi.hoisted(() => ({ create: vi.fn(), platform: vi.fn() }));
vi.mock("../../scripts/orchestrator/grt1/hvf.js", () => ({
  HvfTestTransport: { create: mocks.create }
}));
vi.mock("../../scripts/orchestrator/grt1/inputs.js", () => ({ assertPlatform: mocks.platform }));
import { proveCheckoutImport } from "../../scripts/orchestrator/grt1/checkout.js";
import { BASELINE_LIMITS, validateBaselineManifest } from "../../scripts/orchestrator/baseline.js";

let parent: string;
let cwd: string;
let stateParent: string;
let head: string;
let mutation: string;
let uncertain: boolean;
let afterStop: () => Promise<void>;
let onStart: () => Promise<void>;
const PROOF_ISSUE = 72;
const OTHER_ISSUE = 41;
const EXECUTABLE_MODE = 0o755;
const CANCEL_MS = 100;
const OLD_FILE_LIMIT = 65_536;
const OLD_COUNT_LIMIT = 256;
const OLD_TOTAL_LIMIT = 1_048_576;
const OLD_LEASE_MS = 120_000;
const ABOVE_2B = 65_537;
const OVER_GRT1 = 524_289;
const HEAD_LENGTH = 40;
async function git(args: string[]): Promise<string> {
  const result = await bundledGit(["-c", "core.hooksPath=/dev/null", ...args], cwd, {
    env: { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" }
  });
  if (result.exitCode) throw new Error("Fixture Git failed");
  return result.stdout;
}
async function commit(): Promise<void> {
  await git(["add", "--all"]);
  await git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture"
  ]);
  head = (await git(["rev-parse", "HEAD"])).trim();
}
function options(signal?: AbortSignal) {
  return {
    cwd,
    stateParent,
    artifactDirectory: parent,
    repository: "msoecsse/graider" as const,
    branch: "remote-course-v2" as const,
    expectedHead: head,
    issue: PROOF_ISSUE,
    ...(signal ? { signal } : {})
  };
}
async function receiver(): Promise<Transport> {
  await onStart();
  const helper = fileURLToPath(
    new URL("../../scripts/orchestrator/grt1/guest.py", import.meta.url)
  );
  const harness = fileURLToPath(
    new URL("../fixtures/orchestrator-grt1/harness.py", import.meta.url)
  );
  const child = spawn(
    process.platform === "win32" ? "python" : "python3",
    ["-I", "-B", harness, helper, parent, mutation],
    {
      stdio: "pipe",
      env: {
        PATH: process.env.PATH,
        ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {})
      }
    }
  );
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => {
      resolve();
    })
  );
  return {
    start: () =>
      Promise.resolve({ input: child.stdin, output: child.stdout, diagnostics: child.stderr }),
    stop: async () => {
      child.kill();
      await closed;
      await afterStop();
      return { reaped: !uncertain, payloadRemoved: !uncertain };
    }
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  parent = await mkdtemp(path.join(tmpdir(), "graider-checkout-test-"));
  cwd = path.join(parent, "source");
  stateParent = path.join(parent, "state");
  await mkdir(cwd);
  await mkdir(stateParent);
  await git(["init", "-b", "remote-course-v2"]);
  await git(["remote", "add", "origin", "https://github.com/msoecsse/graider.git"]);
  await mkdir(path.join(cwd, "src"));
  await writeFile(path.join(cwd, "src/bytes.bin"), Buffer.alloc(ABOVE_2B));
  await writeFile(path.join(cwd, "empty"), "");
  await writeFile(path.join(cwd, "run"), "fixture executable bytes, never executed");
  if (process.platform !== "win32") await chmod(path.join(cwd, "run"), EXECUTABLE_MODE);
  await commit();
  mutation = "";
  uncertain = false;
  afterStop = () => Promise.resolve();
  onStart = () => Promise.resolve();
  mocks.create.mockImplementation(receiver);
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});
async function failed(): Promise<void> {
  await expect(proveCheckoutImport(options())).rejects.toThrow();
  expect(await readdir(path.join(cwd, ".git"))).toContain("graider-orchestrator.lock");
  for (const entry of await readdir(stateParent)) {
    expect(await readdir(path.join(stateParent, entry))).not.toContain("receipt.json");
  }
}
describe("standalone locked GRT1 checkout proof", () => {
  it("retains the complete measured starting tree and rejects its real unsafe path", () => {
    expect(startingTree.tracked).toHaveLength(startingTree.files);
    expect(startingTree.tracked.reduce((sum, file) => sum + file.size, 0)).toBe(
      startingTree.totalBytes
    );
    const manifest = {
      version: 1,
      repository: "msoecsse/graider",
      branch: "remote-course-v2",
      head: startingTree.head,
      issue: PROOF_ISSUE,
      files: startingTree.tracked.map(({ path, mode, size, sha256 }) => ({
        path,
        mode,
        size,
        sha256
      }))
    };
    const serialized = Buffer.from(JSON.stringify(manifest));
    expect(serialized.length).toBe(startingTree.manifestBytes);
    expect(sha256(serialized)).toBe(startingTree.manifestSha256);
    expect(startingTree.tracked.every((file) => /^[a-f0-9]{40}$/.test(file.oid))).toBe(true);
    expect(startingTree.unsafePaths).toEqual([
      "docs/bugs/resolved/260605/student_report_push)_addendum.md"
    ]);
    expect(() => admitManifest(manifest)).toThrow("unsafe-path/alias");
  });
  it("admits beyond Slice 2B only through the test profile and releases the lock after final verification", async () => {
    const result = await proveCheckoutImport(options());
    expect(result.manifest.files).toHaveLength(3);
    expect(result.measurement).toMatchObject({ files: 3, directories: 1, above64KiB: 1 });
    expect(result.transfer.cleanup).toEqual({ reaped: true, payloadRemoved: true });
    expect(
      JSON.parse(await readFile(path.join(result.directory, "receipt.json"), "utf8"))
    ).toMatchObject({ head });
    expect(await readdir(path.join(cwd, ".git"))).not.toContain("graider-orchestrator.lock");
    expect(() => validateBaselineManifest(result.manifest)).toThrow();
    expect(BASELINE_LIMITS.fileBytes).toBe(OLD_FILE_LIMIT);
    expect(BASELINE_LIMITS.files).toBe(OLD_COUNT_LIMIT);
    expect(BASELINE_LIMITS.totalBytes).toBe(OLD_TOTAL_LIMIT);
    expect(BASELINE_LIMITS.manifestBytes).toBe(OLD_FILE_LIMIT);
    expect(BASELINE_LIMITS.lifetimeMs).toBe(OLD_LEASE_MS);
    const tree = JSON.parse(
      await readFile(path.join(result.directory, "tracked.json"), "utf8")
    ) as unknown[];
    expect(tree).toHaveLength(3);
  });
  it("captures all entries beyond the production count cap without changing production admission", async () => {
    await Promise.all(
      Array.from({ length: OLD_COUNT_LIMIT }, async (_unused, index) => {
        await writeFile(path.join(cwd, `src/extra-${String(index)}.bin`), "count fixture");
      })
    );
    await commit();
    const receipt = await proveCheckoutImport(options());
    expect(receipt.measurement.files).toBe(OLD_COUNT_LIMIT + 3);
    expect(() => validateBaselineManifest(receipt.manifest)).toThrow();
  });
  it("rejects unsupported hosts before source reads, lock or state", async () => {
    mocks.platform.mockImplementationOnce(() => {
      throw new Error("unsupported metadata");
    });
    await expect(proveCheckoutImport({ ...options(), cwd: "absent" })).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await readdir(stateParent)).toEqual([]);
    expect(await readdir(path.join(cwd, ".git"))).not.toContain("graider-orchestrator.lock");
  });
  it("preserves an existing lock without opening a guest", async () => {
    const lock = path.join(cwd, ".git/graider-orchestrator.lock");
    await writeFile(lock, "preserved");
    await expect(proveCheckoutImport(options())).rejects.toThrow();
    expect(await readFile(lock, "utf8")).toBe("preserved");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["bytes", "mode", "index", "head", "parent", "manifest", "metadata"])(
    "rejects final %s drift after successful protocol and reaping",
    async (kind) => {
      afterStop = async () => {
        if (kind === "bytes")
          await writeFile(path.join(cwd, "src/bytes.bin"), Buffer.alloc(ABOVE_2B, 1));
        if (kind === "mode") {
          if (process.platform === "win32") await git(["update-index", "--chmod=+x", "empty"]);
          else await chmod(path.join(cwd, "empty"), EXECUTABLE_MODE);
        }
        if (kind === "index") await git(["update-index", "--assume-unchanged", "empty"]);
        if (kind === "head") await git(["symbolic-ref", "HEAD", "refs/heads/absent"]);
        if (kind === "parent") await mkdir(path.join(cwd, "new-directory"));
        if (kind === "manifest") {
          const [entry] = await readdir(stateParent);
          await writeFile(path.join(stateParent, entry ?? "absent", "manifest.json"), "{}");
        }
        if (kind === "metadata")
          await writeFile(path.join(cwd, ".git/HEAD"), "ref: refs/heads/remote-course-v2\n");
      };
      await failed();
    }
  );
  it.each([
    "modified",
    "staged",
    "untracked",
    "assume-unchanged",
    "skip-worktree",
    "oversize",
    "symlink",
    "hardlink",
    "alias",
    "protected",
    "reviewed-character-policy"
  ])("rejects %s before VM creation", async (kind) => {
    if (kind === "assume-unchanged" || kind === "skip-worktree")
      await git(["update-index", `--${kind}`, "empty"]);
    if (["modified", "staged", "assume-unchanged", "skip-worktree"].includes(kind))
      await writeFile(path.join(cwd, "empty"), "drift");
    if (kind === "staged") await git(["add", "empty"]);
    if (kind === "untracked") await writeFile(path.join(cwd, "extra"), "extra");
    if (kind === "oversize") {
      await writeFile(path.join(cwd, "large"), Buffer.alloc(OVER_GRT1));
      await commit();
    }
    if (kind === "symlink") {
      const oid = (await git(["rev-parse", "HEAD:empty"])).trim();
      await git(["update-index", "--add", "--cacheinfo", `120000,${oid},link`]);
      await git([
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "symlink"
      ]);
      head = (await git(["rev-parse", "HEAD"])).trim();
    }
    if (kind === "hardlink") {
      await link(path.join(cwd, "empty"), path.join(cwd, "linked"));
      await commit();
    }
    if (kind === "alias") {
      const oid = (await git(["rev-parse", "HEAD:empty"])).trim();
      await git(["update-index", "--add", "--cacheinfo", `100644,${oid},NUL.txt`]);
      await git([
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "alias"
      ]);
      head = (await git(["rev-parse", "HEAD"])).trim();
    }
    if (kind === "reviewed-character-policy") {
      await writeFile(path.join(cwd, "student_report_push)_addendum.md"), "tracked fixture");
      await commit();
    }
    if (kind === "protected") {
      await mkdir(path.join(cwd, ".aws"));
      await writeFile(path.join(cwd, ".aws/data"), "fake");
      await commit();
    }
    await failed();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["truncated", "corrupt", "mode", "hardlink", "extra"])(
    "rejects %s from the actual protocol helper and retains failure evidence",
    async (kind) => {
      mutation = kind;
      await failed();
    }
  );
  it("cancels a pending transfer and retains the new lock", async () => {
    mutation = "stall";
    const controller = new AbortController();
    onStart = () => {
      setTimeout(() => {
        controller.abort();
      }, CANCEL_MS);
      return Promise.resolve();
    };
    await expect(proveCheckoutImport(options(controller.signal))).rejects.toThrow();
    expect(await readdir(path.join(cwd, ".git"))).toContain("graider-orchestrator.lock");
  });
  it("rejects a stalled transfer when the supervisor deadline expires", async () => {
    mutation = "stall";
    const deadline = new AbortController();
    onStart = () => {
      setTimeout(() => {
        deadline.abort(new DOMException("fixture timeout", "TimeoutError"));
      }, CANCEL_MS);
      return Promise.resolve();
    };
    await expect(proveCheckoutImport(options(deadline.signal))).rejects.toThrow();
    expect(await readdir(path.join(cwd, ".git"))).toContain("graider-orchestrator.lock");
  });
  it("rejects cleanup uncertainty even after exact byte readback", async () => {
    uncertain = true;
    await failed();
  });
  it("rejects an already cancelled request before capture", async () => {
    await expect(proveCheckoutImport(options(AbortSignal.abort()))).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects wrong issue and HEAD inputs", async () => {
    await expect(proveCheckoutImport({ ...options(), issue: OTHER_ISSUE })).rejects.toThrow();
    await expect(
      proveCheckoutImport({ ...options(), expectedHead: "z".repeat(HEAD_LENGTH) })
    ).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
