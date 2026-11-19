import { createHash } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as filesystem from "node:fs/promises";
import { exec as git } from "dugite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DisposableVm, GuestCommand } from "../../scripts/orchestrator/vm/contracts.js";

const mocks = vi.hoisted(() => ({ create: vi.fn(), platform: vi.fn() }));
vi.mock("../../scripts/orchestrator/vm/qemu.js", () => ({ createQemuVm: mocks.create }));
vi.mock("../../scripts/orchestrator/vm/inputs.js", () => ({ assertPlatform: mocks.platform }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});
import {
  importBaseline,
  validateBaselineManifest,
  BASELINE_LIMITS
} from "../../scripts/orchestrator/baseline.js";

let parent: string;
let cwd: string;
let stateParent: string;
let head: string;
let vm: ReturnType<typeof mockVm>;
const MAX_BYTE = 255;
const SHA1_LENGTH = 40;
const SHA256_LENGTH = 64;
const EXECUTABLE_MODE = 0o755;
const files = new Map<string, Buffer>();
const modes = new Map<string, string>();
const emptyResult = () => ({ exitCode: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
async function fixtureGit(args: string[]): Promise<string> {
  const result = await git(args, cwd, {
    env: { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" }
  });
  if (result.exitCode !== 0) throw new Error("Fixture Git failed");
  return result.stdout;
}
async function commit(): Promise<void> {
  await fixtureGit(["add", "--all"]);
  await fixtureGit(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture"]);
  head = (await fixtureGit(["rev-parse", "HEAD"])).trim();
}
function inventory(): Buffer {
  const directories = new Set<string>();
  for (const name of files.keys()) {
    const parts = name.split("/");
    parts.pop();
    for (let count = 1; count <= parts.length; count++)
      directories.add(parts.slice(0, count).join("/"));
  }
  return Buffer.from(
    [
      ...[...directories].map((name) => `41ed 2 0 ./${name}\n`),
      ...[...files].map(
        ([name, bytes]) =>
          `${modes.get(name) === "0755" ? "81ed" : "81a4"} 1 ${String(bytes.length)} ./${name}\n`
      )
    ].join("")
  );
}
function options(signal?: AbortSignal) {
  return {
    cwd,
    stateParent,
    artifactDirectory: parent,
    repository: "msoecsse/graider" as const,
    branch: "remote-course-v2" as const,
    expectedHead: head,
    issue: 41,
    ...(signal ? { signal } : {})
  };
}
function mockVm() {
  return {
    id: "fresh-test-vm",
    start: vi.fn<DisposableVm["start"]>(() => {
      files.clear();
      modes.clear();
      return Promise.resolve();
    }),
    run: vi.fn<DisposableVm["run"]>((command: GuestCommand) => {
      if (command.executable === "/bin/chmod") {
        modes.set(command.args[2] ?? "", command.args[0] ?? "");
        return Promise.resolve(emptyResult());
      }
      return Promise.resolve({ ...emptyResult(), stdout: inventory() });
    }),
    putFile: vi.fn<DisposableVm["putFile"]>((name, bytes) => {
      files.set(name, Buffer.from(bytes));
      return Promise.resolve();
    }),
    getFile: vi.fn<DisposableVm["getFile"]>((name) =>
      Promise.resolve(Buffer.from(files.get(name) ?? "missing"))
    ),
    shutdown: vi.fn<DisposableVm["shutdown"]>().mockResolvedValue(undefined),
    destroy: vi.fn<DisposableVm["destroy"]>().mockResolvedValue(undefined)
  };
}
beforeEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(filesystem.lstat).mockImplementation(actual.lstat);
  parent = await mkdtemp(path.join(tmpdir(), "graider-baseline-test-"));
  cwd = path.join(parent, "checkout");
  stateParent = path.join(parent, "state");
  await mkdir(cwd);
  await mkdir(stateParent);
  await fixtureGit(["init", "-q", "-b", "remote-course-v2"]);
  await fixtureGit(["config", "user.name", "Fixture"]);
  await fixtureGit(["config", "user.email", "fixture@example.invalid"]);
  await fixtureGit(["config", "core.autocrlf", "false"]);
  await fixtureGit(["remote", "add", "origin", "https://github.com/msoecsse/graider.git"]);
  await mkdir(path.join(cwd, "src"));
  await writeFile(path.join(cwd, "src", "bytes.bin"), Buffer.from([0, 1, 2, MAX_BYTE]));
  await writeFile(path.join(cwd, "empty"), "");
  await commit();
  files.clear();
  modes.clear();
  vm = mockVm();
  mocks.platform.mockReset();
  mocks.create.mockResolvedValue(vm);
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

describe("supervisor baseline import (mock VM, real bundled Git/filesystem)", () => {
  it("records deterministic byte-accurate HEAD identity outside a fresh guest and reaps it", async () => {
    const receipt = await importBaseline(options());
    expect(receipt.manifest.files.map((file) => file.path)).toEqual(["empty", "src/bytes.bin"]);
    expect(receipt.manifest.files[1]).toEqual({
      path: "src/bytes.bin",
      mode: "100644",
      size: 4,
      sha256: createHash("sha256")
        .update(Buffer.from([0, 1, 2, MAX_BYTE]))
        .digest("hex")
    });
    expect(receipt.manifest).toMatchObject({
      repository: "msoecsse/graider",
      branch: "remote-course-v2",
      head,
      issue: 41
    });
    expect(
      JSON.parse(await readFile(path.join(receipt.directory, "manifest.json"), "utf8"))
    ).toEqual(receipt.manifest);
    expect(mocks.create).toHaveBeenCalledWith({
      artifactDirectory: parent,
      stateParent: receipt.directory
    });
    expect(vm.start).toHaveBeenCalledOnce();
    expect(vm.shutdown).toHaveBeenCalledOnce();
    expect(vm.destroy).toHaveBeenCalledOnce();
    expect(await readdir(path.join(cwd, ".git"))).not.toContain("graider-orchestrator.lock");
    const second = await importBaseline(options());
    expect(second.manifestSha256).toBe(receipt.manifestSha256);
  });

  it.each(["modified", "staged", "untracked", "assume-unchanged"])(
    "rejects %s drift before VM creation",
    async (kind) => {
      if (kind === "assume-unchanged")
        await fixtureGit(["update-index", "--assume-unchanged", "empty"]);
      await writeFile(path.join(cwd, kind === "untracked" ? "unexpected" : "empty"), "drift");
      if (kind === "staged") await fixtureGit(["add", "empty"]);
      await expect(importBaseline(options())).rejects.toThrow("Baseline");
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );

  it.each(["repository", "branch", "head"])("rejects mismatched authorized %s", async (kind) => {
    if (kind === "repository")
      await fixtureGit(["remote", "set-url", "origin", "https://github.com/other/repo.git"]);
    if (kind === "branch") await fixtureGit(["checkout", "-qb", "other"]);
    if (kind === "head") head = "0".repeat(SHA1_LENGTH);
    await expect(importBaseline(options())).rejects.toThrow("Baseline");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("never replaces an existing checkout lock or creates VM state", async () => {
    const lock = path.join(cwd, ".git", "graider-orchestrator.lock");
    await writeFile(lock, "preserved-evidence");
    await expect(importBaseline(options())).rejects.toThrow("Baseline");
    expect(await readFile(lock, "utf8")).toBe("preserved-evidence");
    expect(await readdir(stateParent)).toEqual([]);
  });

  it("fails closed on unavailable native metadata/runtime support before source capture", async () => {
    mocks.platform.mockImplementationOnce(() => {
      throw new Error("unsupported Windows/reparse attestation");
    });
    await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await readdir(stateParent)).toEqual([]);
    expect(await readdir(path.join(cwd, ".git"))).not.toContain("graider-orchestrator.lock");
  });

  it("refuses state within the checkout or Git metadata", async () => {
    await expect(importBaseline({ ...options(), stateParent: cwd })).rejects.toThrow(
      "state must be outside"
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects nonregular source metadata before opening file bytes (mock FIFO metadata)", async () => {
    const { lstat: native } =
      await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const target = await filesystem.realpath(path.join(cwd, "empty"));
    vi.mocked(filesystem.lstat).mockImplementation(async (...args: Parameters<typeof native>) => {
      const info = await native(...args);
      return String(args[0]) === target
        ? Object.assign(info, { isFile: () => false, isFIFO: () => true })
        : info;
    });
    await expect(importBaseline(options())).rejects.toThrow("special source entry");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a file type swapped between metadata inspection and open", async () => {
    const { lstat: native } =
      await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const target = await filesystem.realpath(path.join(cwd, "empty"));
    let replaced = false;
    vi.mocked(filesystem.lstat).mockImplementation(async (...args: Parameters<typeof native>) => {
      const info = await native(...args);
      if (!replaced && String(args[0]) === target) {
        replaced = true;
        await rm(target);
        await mkdir(target);
      }
      return info;
    });
    await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
    expect(replaced).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects tracked submodules without running their commands", async () => {
    await fixtureGit(["update-index", "--add", "--cacheinfo", `160000,${head},submodule`]);
    await fixtureGit(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "gitlink"]);
    head = (await fixtureGit(["rev-parse", "HEAD"])).trim();
    await expect(importBaseline(options())).rejects.toThrow("unsafe tracked entry");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["symlink", "hardlink", "parent-link"])("rejects a tracked %s", async (kind) => {
    const target = path.join(cwd, "empty");
    await rm(target);
    if (kind === "hardlink") await link(path.join(cwd, "src", "bytes.bin"), target);
    if (kind === "symlink") {
      // Tracked symlinks are rejected even on Windows checkouts materializing them as plain files.
      await writeFile(target, "src/bytes.bin");
      await fixtureGit(["add", "empty"]);
      const oid = (await fixtureGit(["rev-parse", ":empty"])).trim();
      await fixtureGit(["update-index", "--cacheinfo", `120000,${oid},empty`]);
      await fixtureGit(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "symlink"]);
      head = (await fixtureGit(["rev-parse", "HEAD"])).trim();
    }
    if (kind === "parent-link") {
      await writeFile(target, "");
      await rm(path.join(cwd, "src"), { recursive: true });
      const outside = path.join(parent, "outside");
      await mkdir(outside);
      await writeFile(path.join(outside, "bytes.bin"), Buffer.from([0, 1, 2, MAX_BYTE]));
      await symlink(outside, path.join(cwd, "src"), "junction");
    }
    await expect(importBaseline(options())).rejects.toThrow("Baseline");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects oversized tracked bytes before any guest transfer", async () => {
    await writeFile(path.join(cwd, "large"), Buffer.alloc(BASELINE_LIMITS.fileBytes + 1));
    await commit();
    await expect(importBaseline(options())).rejects.toThrow("65536");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([[".aws/credentials"], [".env"], ["A.ts", "a.ts"], ["Src/a", "src/b"]])(
    "rejects unsafe tracked paths %j before reading them",
    async (...names) => {
      const oid = (await fixtureGit(["rev-parse", ":empty"])).trim();
      for (const name of names)
        await fixtureGit(["update-index", "--add", "--cacheinfo", `100644,${oid},${name}`]);
      await fixtureGit(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "unsafe paths"]);
      head = (await fixtureGit(["rev-parse", "HEAD"])).trim();
      await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );

  it("rejects same-size source edits even when index flags conceal them", async () => {
    await fixtureGit(["update-index", "--skip-worktree", "src/bytes.bin"]);
    await writeFile(path.join(cwd, "src", "bytes.bin"), Buffer.alloc(4));
    await expect(importBaseline(options())).rejects.toThrow("source byte drift from HEAD");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("checks executable mode from Git and does not invoke repository clean filters", async () => {
    await writeFile(path.join(cwd, ".gitattributes"), "empty filter=hostile\n");
    await commit();
    await fixtureGit(["update-index", "--chmod=+x", "empty"]);
    await fixtureGit(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "executable"]);
    head = (await fixtureGit(["rev-parse", "HEAD"])).trim();
    await chmod(path.join(cwd, "empty"), EXECUTABLE_MODE);
    await fixtureGit(["config", "filter.hostile.clean", "this-command-must-never-run"]);
    const result = await importBaseline(options());
    expect(result.manifest.files.find((file) => file.path === "empty")?.mode).toBe("100755");
    expect(vm.run).toHaveBeenCalledWith(
      { executable: "/bin/chmod", args: ["0755", "--", "empty"] },
      expect.anything()
    );
  });

  it("rejects drift during transfer and retains failed lock and manifest", async () => {
    vi.mocked(vm.putFile).mockImplementationOnce(async (name, bytes) => {
      files.set(name, Buffer.from(bytes));
      await writeFile(path.join(cwd, "empty"), "drift");
    });
    await expect(importBaseline(options())).rejects.toThrow("Baseline source size drift");
    expect(vm.destroy).toHaveBeenCalledOnce();
    expect(await readdir(path.join(cwd, ".git"))).toContain("graider-orchestrator.lock");
  });

  it.each(["head", "untracked", "manifest"])("rejects intervening %s changes", async (kind) => {
    vi.mocked(vm.getFile).mockImplementationOnce(async (name) => {
      if (kind === "head") await fixtureGit(["symbolic-ref", "HEAD", "refs/heads/other"]);
      if (kind === "untracked") await writeFile(path.join(cwd, "unexpected"), "drift");
      if (kind === "manifest") {
        const [run] = await readdir(stateParent);
        await writeFile(path.join(stateParent, run ?? "missing", "manifest.json"), "{}");
      }
      return Buffer.from(files.get(name) ?? "missing");
    });
    await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
    expect(vm.destroy).toHaveBeenCalledOnce();
  });

  it("admits exactly the per-file boundary and keeps every operation bounded", async () => {
    await writeFile(path.join(cwd, "boundary"), Buffer.alloc(BASELINE_LIMITS.fileBytes));
    await commit();
    await importBaseline(options());
    for (const call of vm.run.mock.calls)
      expect(call[1]?.timeoutMs).toBe(BASELINE_LIMITS.operationMs);
    for (const call of vm.putFile.mock.calls) {
      expect(call[1].byteLength).toBeLessThanOrEqual(BASELINE_LIMITS.fileBytes);
      expect(call[2]?.timeoutMs).toBe(BASELINE_LIMITS.operationMs);
    }
  });

  it("fails closed when the complete import lease expires during transfer", async () => {
    const lease = new AbortController();
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
      ms === BASELINE_LIMITS.lifetimeMs ? lease.signal : timeout(ms)
    );
    vm.putFile.mockImplementationOnce(() => {
      lease.abort();
      return Promise.resolve();
    });
    await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
    expect(vm.destroy).toHaveBeenCalledOnce();
  });

  it("rejects same-size corrupted guest bytes independently of guest status", async () => {
    vm.getFile.mockImplementation((name) =>
      Promise.resolve(Buffer.alloc(files.get(name)?.length ?? 0))
    );
    await expect(importBaseline(options())).rejects.toThrow("digest or size mismatch");
    expect(vm.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    "symlink",
    "hardlink",
    "mode",
    "size",
    "duplicate",
    "traversal",
    "truncated",
    "overflow",
    "exit"
  ])("rejects %s in final guest inventory", async (kind) => {
    vm.run.mockImplementation((command) => {
      if (command.executable === "/bin/chmod") {
        modes.set(command.args[2] ?? "", command.args[0] ?? "");
        return Promise.resolve(emptyResult());
      }
      let output = inventory();
      if (files.size) {
        const changes: Record<string, string> = {
          symlink: "a1ff 1 0 ./empty\n",
          hardlink: "81a4 2 0 ./empty\n",
          mode: "81ed 1 0 ./empty\n",
          size: "81a4 1 1 ./empty\n",
          duplicate: "81a4 1 0 ./empty\n81a4 1 0 ./empty\n",
          traversal: "81a4 1 0 ./../outside\n",
          truncated: "81a4 1 0 ./empty"
        };
        output =
          kind === "overflow"
            ? Buffer.alloc(BASELINE_LIMITS.fileBytes + 1)
            : Buffer.from(changes[kind] ?? "");
      }
      return Promise.resolve({
        ...emptyResult(),
        exitCode: files.size && kind === "exit" ? 1 : 0,
        stdout: output
      });
    });
    await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
    expect(vm.destroy).toHaveBeenCalledOnce();
  });

  it.each(["partial", "digest", "extra", "metadata", "hostile-output"])(
    "rejects %s guest responses and destroys only that VM",
    async (kind) => {
      if (kind === "partial")
        vi.mocked(vm.putFile).mockRejectedValueOnce(new Error("private-guest-text"));
      if (kind === "digest") vi.mocked(vm.getFile).mockResolvedValue(Buffer.from("wrong"));
      if (kind === "extra")
        vi.mocked(vm.putFile).mockImplementation((name, bytes) => {
          files.set(name, Buffer.from(bytes));
          files.set("unexpected", Buffer.alloc(0));
          return Promise.resolve();
        });
      if (kind === "metadata")
        vi.mocked(vm.run).mockResolvedValue({
          ...emptyResult(),
          stdout: Buffer.from("81a4 2 0 ./empty\n")
        });
      if (kind === "hostile-output")
        vi.mocked(vm.run).mockResolvedValue({
          ...emptyResult(),
          stdout: Buffer.from("ghp_private-guest-text")
        });
      await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
      expect(vm.destroy).toHaveBeenCalledOnce();
    }
  );

  it("honors cancellation before capture and during partial transfer", async () => {
    const abort = new AbortController();
    abort.abort("private-abort-reason");
    await expect(importBaseline(options(abort.signal))).rejects.toThrow(/^Baseline/);
    expect(mocks.create).not.toHaveBeenCalled();
    const transfer = new AbortController();
    vi.mocked(vm.putFile).mockImplementationOnce(() => {
      transfer.abort("private-abort-reason");
      return Promise.resolve();
    });
    await expect(importBaseline(options(transfer.signal))).rejects.toThrow(/^Baseline/);
    expect(vm.destroy).toHaveBeenCalledOnce();
  });

  it("does not discard VM resources after unverifiable shutdown", async () => {
    vi.mocked(vm.shutdown).mockRejectedValue(new Error("reaping unverified"));
    await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
    expect(vm.destroy).not.toHaveBeenCalled();
  });

  it("cleans up a partial VM startup and retains redacted evidence", async () => {
    vm.start.mockRejectedValue(new Error("ghp_private-startup-text"));
    await expect(importBaseline(options())).rejects.toThrow(/^Baseline/);
    expect(vm.shutdown).toHaveBeenCalledOnce();
    expect(vm.destroy).toHaveBeenCalledOnce();
    const [run] = await readdir(stateParent);
    expect(await readFile(path.join(stateParent, run ?? "", "failure.json"), "utf8")).not.toContain(
      "private-startup-text"
    );
  });
});

describe("manifest admission uses portable path semantics on every host", () => {
  function manifest(paths: string[] = ["src/a.ts"]) {
    return {
      version: 1,
      repository: "msoecsse/graider",
      branch: "remote-course-v2",
      head: "a".repeat(SHA1_LENGTH),
      issue: 41,
      files: paths.map((name) => ({
        path: name,
        mode: "100644",
        size: 0,
        sha256: createHash("sha256").update("").digest("hex")
      }))
    };
  }
  it.each(["reports/a(b).md", "reports/a(.md", "reports/a).md"])(
    "imports literal parentheses through inventory and readback: %s",
    async (name) => {
      await mkdir(path.join(cwd, "reports"));
      await writeFile(path.join(cwd, name), "literal bytes");
      await commit();
      const receipt = await importBaseline(options());
      expect(receipt.manifest.files.map((file) => file.path)).toContain(name);
      expect(vm.putFile).toHaveBeenCalledWith(
        name,
        Buffer.from("literal bytes"),
        expect.anything()
      );
    }
  );
  it.each([
    "/absolute",
    "../escape",
    "a//b",
    "a/./b",
    "C:/drive",
    "C:relative",
    "\\\\host\\share",
    "a\\b",
    "a:b",
    "name.",
    "name ",
    "NUL.txt",
    "con",
    "COM1",
    "lpt9.log",
    "short~1",
    ".GIT/config",
    ".codex/config",
    ".aws/credentials",
    ".env",
    ".gitconfig",
    ".gitmodules",
    "a/é",
    "a;b",
    "a$b",
    "a`b",
    "a[b]",
    "a{b}",
    "a!b",
    "a&b",
    "a b",
    "a\nline"
  ])("rejects unsafe path %j", (name) => {
    expect(() => validateBaselineManifest(manifest([name]))).toThrow(/^Baseline/);
  });
  it.each([
    ["a", "a"],
    ["A.ts", "a.ts"],
    ["Src/a", "src/b"],
    ["a", "a/b"],
    ["z", "a"]
  ])("rejects aliases, prefix collisions and noncanonical order %j", (...paths) => {
    expect(() => validateBaselineManifest(manifest(paths))).toThrow(/^Baseline/);
  });
  it.each([
    null,
    {},
    { ...manifest(), extra: true },
    { ...manifest(), head: "bad" },
    {
      ...manifest(),
      files: [{ path: "a", mode: "120000", size: 0, sha256: "a".repeat(SHA256_LENGTH) }]
    },
    { ...manifest(), files: [{ path: "a", mode: "100644", size: -1, sha256: "bad" }] }
  ])("rejects malformed manifests", (input) => {
    expect(() => validateBaselineManifest(input)).toThrow(/^Baseline/);
  });

  it("rejects count, aggregate and serialized-manifest limits without chunking", () => {
    const excessCount = Array.from(
      { length: BASELINE_LIMITS.files + 1 },
      (_, index) => `file-${String(index).padStart(3, "0")}`
    );
    expect(() => validateBaselineManifest(manifest(excessCount))).toThrow(/^Baseline/);
    const aggregateCount = BASELINE_LIMITS.totalBytes / BASELINE_LIMITS.fileBytes + 1;
    const aggregate = manifest(excessCount.slice(0, aggregateCount));
    for (const file of aggregate.files) file.size = BASELINE_LIMITS.fileBytes;
    expect(() => validateBaselineManifest(aggregate)).toThrow("aggregate");
    const longNames = excessCount
      .slice(0, BASELINE_LIMITS.files)
      .map((name) => `${"a".repeat(BASELINE_LIMITS.pathBytes - name.length)}${name}`);
    expect(() => validateBaselineManifest(manifest(longNames))).toThrow("manifest byte limit");
  });
});
