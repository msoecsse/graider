/** Supervisor-only Slice 2B. No Agent, host validation, promotion or execution entry point. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { arch, platform, release } from "node:os";
import { exec as bundledGit } from "dugite";
import { z } from "zod";
import { StopError } from "./errors.js";
import { withLock } from "./runner.js";
import { createQemuVm } from "./vm/qemu.js";
import { assertPlatform } from "./vm/inputs.js";
import type { DisposableVm, GuestResult } from "./vm/contracts.js";

// Admission bounds are deliberately below the unchanged Slice 2A transport/lease limits.
export const BASELINE_LIMITS = Object.freeze({
  fileBytes: 65_536,
  totalBytes: 1_048_576,
  files: 256,
  pathBytes: 240,
  manifestBytes: 65_536,
  metadataBytes: 262_144,
  operationMs: 30_000,
  lifetimeMs: 120_000
});
const REGULAR_MODE = 0o100000;
const DIRECTORY_MODE = 0o040000;
const TYPE_MASK = 0o170000;
const PERMISSION_MASK = 0o7777;
const SOURCE_MODE = 0o644;
const EXECUTABLE_MODE = 0o755;
const EXECUTABLE_BITS = 0o111;
const SPECIAL_BITS = 0o7000;
const OWNER_ONLY = 0o600;
const LAST_INDEX = -1;
const SINGLE_LINK = 1n;
const NULL_DEVICE = "/dev/null"; // Also Git for Windows' null spelling.
const INVENTORY = {
  executable: "/bin/busybox",
  args: [
    "find",
    ".",
    "-mindepth",
    "1",
    "-exec",
    "/bin/busybox",
    "stat",
    "-c",
    "%f %h %s %n",
    "{}",
    ";"
  ]
} as const;

function fail(reason: string): never {
  throw new StopError(`Baseline ${reason}; execution remains disabled.`);
}
const fileSchema = z
  .object({
    path: z.string().min(1).max(BASELINE_LIMITS.pathBytes),
    mode: z.enum(["100644", "100755"]),
    size: z.number().int().min(0).max(BASELINE_LIMITS.fileBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
const manifestSchema = z
  .object({
    version: z.literal(1),
    repository: z.literal("msoecsse/graider"),
    branch: z.literal("remote-course-v2"),
    head: z.string().regex(/^[a-f0-9]{40}$/),
    issue: z.number().int().positive(),
    files: z.array(fileSchema).min(1).max(BASELINE_LIMITS.files)
  })
  .strict();
export type BaselineManifest = z.infer<typeof manifestSchema>;
export interface BaselineOptions {
  cwd: string;
  stateParent: string;
  artifactDirectory: string;
  repository: "msoecsse/graider";
  branch: "remote-course-v2";
  expectedHead: string;
  issue: number;
  signal?: AbortSignal;
}
interface TrackedFile {
  path: string;
  mode: "100644" | "100755";
  oid: string;
  size: number;
}
function safePaths(paths: readonly string[]): Map<string, "file" | "directory"> {
  const seen = new Map<string, { path: string; type: "file" | "directory" }>();
  let previous: string | undefined;
  for (const name of paths) {
    const parts = name.split("/");
    if (
      name.length > BASELINE_LIMITS.pathBytes ||
      !/^[A-Za-z0-9_./-]+$/.test(name) ||
      (previous !== undefined && previous >= name) ||
      parts.some(
        (part) =>
          /^(?:|\.|\.\.)$/.test(part) ||
          part.endsWith(".") ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
          /^(?:\.git|\.codex|\.agents|\.claude|\.ssh|\.aws|\.azure|\.gnupg|\.config|\.gitconfig|\.gitmodules|\.git-credentials|\.netrc|\.npmrc|\.pypirc)$/i.test(
            part
          ) ||
          /^\.env(?:\.|$)/i.test(part)
      )
    )
      fail("unsafe or aliased source path");
    for (let count = 1; count <= parts.length; count++) {
      const prefix = parts.slice(0, count).join("/");
      const type = count === parts.length ? "file" : "directory";
      const prior = seen.get(prefix.toLowerCase());
      if (prior && (prior.path !== prefix || prior.type !== type)) fail("path alias or collision");
      seen.set(prefix.toLowerCase(), { path: prefix, type });
    }
    previous = name;
  }
  return new Map([...seen.values()].map((entry) => [entry.path, entry.type]));
}
export function validateBaselineManifest(input: unknown): BaselineManifest {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) fail("malformed manifest or file/count limit (65536 bytes/file, 256 files)");
  const manifest = parsed.data;
  safePaths(manifest.files.map((file) => file.path));
  if (
    manifest.files.reduce((total, file) => total + file.size, 0) > BASELINE_LIMITS.totalBytes ||
    Buffer.byteLength(JSON.stringify(manifest)) > BASELINE_LIMITS.manifestBytes
  )
    fail("aggregate or manifest byte limit");
  return manifest;
}
function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}
function text(bytes: Buffer): string {
  const value = bytes.toString("utf8");
  if (!Buffer.from(value).equals(bytes)) fail("invalid metadata encoding");
  return value;
}
function records(value: string): string[] {
  if (value === "") return [];
  if (!value.endsWith("\0")) fail("malformed tracked metadata");
  return value.slice(0, LAST_INDEX).split("\0");
}

/** Only read-only plumbing: never status/diff, filters, hooks, submodule commands or lazy fetch. */
async function git(cwd: string, args: string[], signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const cleared = Object.fromEntries(Object.keys(process.env).map((key) => [key, undefined]));
  const result = await bundledGit(
    [
      "-c",
      "core.fsmonitor=false",
      "-c",
      `core.hooksPath=${NULL_DEVICE}`,
      "-c",
      "core.untrackedCache=false",
      ...args
    ],
    cwd,
    {
      encoding: "buffer",
      maxBuffer: BASELINE_LIMITS.metadataBytes,
      signal: AbortSignal.any([signal, AbortSignal.timeout(BASELINE_LIMITS.operationMs)]),
      env: {
        ...cleared,
        // Dugite resolves its own bundled executable/exec path; ambient overrides are removed.
        LOCAL_GIT_DIRECTORY: "",
        GIT_EXEC_PATH: "",
        PATH: "",
        LC_ALL: "C",
        ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_SYSTEM: NULL_DEVICE,
        GIT_CONFIG_GLOBAL: NULL_DEVICE,
        GIT_ATTR_NOSYSTEM: "1",
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_NO_LAZY_FETCH: "1",
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0"
      }
    }
  );
  if (result.exitCode !== 0 || result.stderr.length) fail("read-only bundled Git failed");
  return text(result.stdout);
}
async function identity(options: BaselineOptions, cwd: string, signal: AbortSignal): Promise<void> {
  const root = await realpath((await git(cwd, ["rev-parse", "--show-toplevel"], signal)).trim());
  const branch = (await git(cwd, ["symbolic-ref", "--short", "HEAD"], signal)).trim();
  const head = (await git(cwd, ["rev-parse", "--verify", "HEAD"], signal)).trim();
  const remote = (
    await git(cwd, ["config", "--local", "--get", "remote.origin.url"], signal)
  ).trim();
  if (
    root !== cwd ||
    branch !== options.branch ||
    head !== options.expectedHead ||
    ![
      `https://github.com/${options.repository}`,
      `https://github.com/${options.repository}.git`,
      `git@github.com:${options.repository}.git`
    ].includes(remote)
  )
    fail("repository, branch or HEAD changed");
}
async function tracked(cwd: string, signal: AbortSignal): Promise<TrackedFile[]> {
  const tree = records(await git(cwd, ["ls-tree", "-rlz", "--full-tree", "HEAD"], signal));
  if (!tree.length || tree.length > BASELINE_LIMITS.files) fail("tracked count limit (256 files)");
  const files = tree
    .map((record): TrackedFile => {
      const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/.exec(record);
      if (!match) fail("unsafe tracked entry type or mode");
      const mode = match[1] as TrackedFile["mode"];
      const size = Number(match[3]);
      if (!Number.isSafeInteger(size) || size > BASELINE_LIMITS.fileBytes)
        fail("file-size limit (65536 bytes)");
      return { mode, oid: match[2] ?? "", size, path: match[4] ?? "" };
    })
    .sort((a, b) => (a.path < b.path ? LAST_INDEX : a.path > b.path ? 1 : 0));
  safePaths(files.map((file) => file.path));
  if (files.reduce((total, file) => total + file.size, 0) > BASELINE_LIMITS.totalBytes)
    fail("aggregate limit (1048576 bytes)");
  const index = records(await git(cwd, ["ls-files", "--stage", "-z"], signal)).sort();
  const expected = files.map((file) => `${file.mode} ${file.oid} 0\t${file.path}`).sort();
  if (
    JSON.stringify(index) !== JSON.stringify(expected) ||
    (await git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"], signal)) !== ""
  )
    fail("index or untracked-file drift");
  return files;
}
type FileInfo = Awaited<ReturnType<typeof sourceInfo>>;
async function sourceInfo(filename: string) {
  return lstat(filename, { bigint: true });
}
function fingerprint(info: FileInfo): string {
  return [info.dev, info.ino, info.mode, info.nlink, info.size, info.mtimeNs, info.ctimeNs].join(
    ":"
  );
}
async function capture(cwd: string, files: TrackedFile[], signal: AbortSignal) {
  const identities = new Map<string, string>();
  const bytes = new Map<string, Buffer>();
  const inspect = async (relative: string, directory: boolean): Promise<FileInfo> => {
    const filename = path.join(cwd, relative);
    const info = await sourceInfo(filename);
    if (
      info.isSymbolicLink() ||
      (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== SINGLE_LINK) ||
      (await realpath(filename)) !== filename
    )
      fail("link, alias or special source entry");
    const stamp = fingerprint(info);
    if (identities.has(relative) && identities.get(relative) !== stamp)
      fail("source identity drift");
    identities.set(relative, stamp);
    return info;
  };
  await inspect("", true);
  for (const file of files) {
    signal.throwIfAborted();
    const parts = file.path.split("/");
    for (let count = 1; count < parts.length; count++) {
      const relative = parts.slice(0, count).join("/");
      // Exact names also reject case/short-name aliases on case-insensitive hosts.
      if (!(await readdir(path.dirname(path.join(cwd, relative)))).includes(parts[count - 1] ?? ""))
        fail("source path alias");
      await inspect(relative, true);
    }
    if (
      !(await readdir(path.dirname(path.join(cwd, file.path)))).includes(parts.at(LAST_INDEX) ?? "")
    )
      fail("source path alias");
    const before = await inspect(file.path, false);
    if (before.size !== BigInt(file.size)) fail("source size drift");
    if ((Number(before.mode) & SPECIAL_BITS) !== 0) fail("special source permissions");
    if (
      process.platform !== "win32" &&
      (Number(before.mode) & EXECUTABLE_BITS) !== (file.mode === "100755" ? EXECUTABLE_BITS : 0)
    )
      fail("source mode drift");
    // A file replaced by a FIFO between lstat/open must not block the supervisor.
    const handle = await open(
      path.join(cwd, file.path),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      if (fingerprint(await handle.stat({ bigint: true })) !== fingerprint(before))
        fail("source open drift");
      const buffer = Buffer.alloc(file.size + 1);
      let offset = 0;
      let finished = false;
      for (; !finished; ) {
        signal.throwIfAborted();
        const result = await handle.read(buffer, offset, buffer.length - offset, offset);
        offset += result.bytesRead;
        finished = result.bytesRead === 0 || offset === buffer.length;
      }
      const content = buffer.subarray(0, offset);
      const oid = createHash("sha1")
        .update(`blob ${String(file.size)}\0`)
        .update(content)
        .digest("hex");
      if (
        offset !== file.size ||
        oid !== file.oid ||
        fingerprint(await handle.stat({ bigint: true })) !== fingerprint(before)
      )
        fail("source byte drift from HEAD");
      await inspect(file.path, false);
      bytes.set(file.path, Buffer.from(content));
    } finally {
      await handle.close();
    }
  }
  for (const [relative] of identities)
    await inspect(relative, relative === "" || !bytes.has(relative));
  return { bytes, identities };
}
function resultBytes(result: GuestResult): Buffer {
  if (
    result.exitCode !== 0 ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    result.stderr.length ||
    result.stdout.length > BASELINE_LIMITS.fileBytes
  )
    fail("untrusted guest operation failed");
  return result.stdout;
}
function verifyInventory(output: Buffer, manifest: BaselineManifest, empty: boolean): void {
  const expected = empty
    ? new Map<string, "file" | "directory">()
    : safePaths(manifest.files.map((file) => file.path));
  const files = new Map(manifest.files.map((file) => [file.path, file]));
  const seen = new Set<string>();
  const value = text(output);
  if (value.length && !value.endsWith("\n")) fail("truncated guest inventory");
  for (const row of value.length ? value.slice(0, LAST_INDEX).split("\n") : []) {
    const match = /^([a-f0-9]{4,6}) ([0-9]+) ([0-9]+) \.\/([A-Za-z0-9_./-]+)$/.exec(row);
    if (!match) fail("malformed guest inventory");
    const name = match[4] ?? "";
    const kind = expected.get(name);
    const mode = Number.parseInt(match[1] ?? "", 16);
    const file = files.get(name);
    if (
      !kind ||
      seen.has(name) ||
      (kind === "directory"
        ? (mode & TYPE_MASK) !== DIRECTORY_MODE
        : (mode & TYPE_MASK) !== REGULAR_MODE ||
          match[2] !== "1" ||
          match[3] !== String(file?.size) ||
          (mode & PERMISSION_MASK) !== (file?.mode === "100755" ? EXECUTABLE_MODE : SOURCE_MODE))
    )
      fail("guest materialization metadata mismatch");
    seen.add(name);
  }
  if (seen.size !== expected.size) fail("partial guest inventory");
}

/** Imports, verifies and destroys one fresh guest, returning only a supervisor receipt. */
export async function importBaseline(options: BaselineOptions): Promise<{
  directory: string;
  vmId: string;
  manifest: BaselineManifest;
  manifestSha256: string;
}> {
  let vm: DisposableVm | undefined;
  let directory: string | undefined;
  try {
    const signal = AbortSignal.any([
      AbortSignal.timeout(BASELINE_LIMITS.lifetimeMs),
      ...(options.signal ? [options.signal] : [])
    ]);
    signal.throwIfAborted();
    // No native Windows reparse-point attestation/VM exists in Slice 2A.
    // Reject unsupported hosts before reading source, rather than approximating their metadata.
    assertPlatform(platform(), arch(), release());
    // Validate supervisor input even when called from plain JavaScript.
    validateBaselineManifest({
      version: 1,
      repository: options.repository,
      branch: options.branch,
      head: options.expectedHead,
      issue: options.issue,
      files: [{ path: "admission", mode: "100644", size: 0, sha256: sha256(Buffer.alloc(0)) }]
    });
    const cwd = await realpath(options.cwd);
    const common = await realpath(
      (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], signal)).trim()
    );
    const parent = await realpath(options.stateParent);
    if (inside(cwd, parent) || inside(common, parent))
      fail("state must be outside source and Git metadata");
    return await withLock(path.join(common, "graider-orchestrator.lock"), async () => {
      await identity(options, cwd, signal);
      const files = await tracked(cwd, signal);
      const baseline = await capture(cwd, files, signal);
      const manifest = validateBaselineManifest({
        version: 1,
        repository: options.repository,
        branch: options.branch,
        head: options.expectedHead,
        issue: options.issue,
        files: files.map((file) => ({
          path: file.path,
          mode: file.mode,
          size: file.size,
          sha256: sha256(baseline.bytes.get(file.path) ?? fail("missing captured bytes"))
        }))
      });
      directory = await mkdtemp(path.join(parent, "graider-baseline-"));
      const serialized = JSON.stringify(manifest);
      const manifestSha256 = sha256(Buffer.from(serialized));
      await writeFile(path.join(directory, "manifest.json"), serialized, {
        flag: "wx",
        mode: OWNER_ONLY
      });
      vm = await createQemuVm({
        artifactDirectory: options.artifactDirectory,
        stateParent: directory
      });
      const operation = { signal, timeoutMs: BASELINE_LIMITS.operationMs };
      try {
        signal.throwIfAborted();
        await vm.start(operation);
        verifyInventory(resultBytes(await vm.run(INVENTORY, operation)), manifest, true);
        for (const file of manifest.files) {
          signal.throwIfAborted();
          await vm.putFile(
            file.path,
            baseline.bytes.get(file.path) ?? fail("missing captured bytes"),
            operation
          );
          const output = resultBytes(
            await vm.run(
              {
                executable: "/bin/chmod",
                args: [file.mode === "100755" ? "0755" : "0644", "--", file.path]
              },
              operation
            )
          );
          if (output.length) fail("unexpected guest mode response");
        }
        verifyInventory(resultBytes(await vm.run(INVENTORY, operation)), manifest, false);
        for (const file of manifest.files) {
          signal.throwIfAborted();
          const bytes = await vm.getFile(file.path, operation);
          if (
            !Buffer.isBuffer(bytes) ||
            bytes.length !== file.size ||
            sha256(bytes) !== file.sha256
          )
            fail("guest digest or size mismatch");
        }
        verifyInventory(resultBytes(await vm.run(INVENTORY, operation)), manifest, false);
      } finally {
        // Never discard payloads without the adapter's reaping attestation.
        await vm.shutdown();
        await vm.destroy();
      }
      // Recheck under the lock after verified guest shutdown, before recording success.
      // The manifest is supervisor authority, never a guest-supplied acceptance claim.
      if ((await readFile(path.join(directory, "manifest.json"), "utf8")) !== serialized)
        fail("manifest drift");
      await identity(options, cwd, signal);
      if (JSON.stringify(await tracked(cwd, signal)) !== JSON.stringify(files))
        fail("tracked baseline drift");
      const final = await capture(cwd, files, signal);
      if (JSON.stringify([...final.identities]) !== JSON.stringify([...baseline.identities]))
        fail("source identity drift");
      signal.throwIfAborted();
      await writeFile(
        path.join(directory, "result.json"),
        JSON.stringify({ event: "import-verified-and-destroyed", vmId: vm.id, manifestSha256 }),
        { flag: "wx", mode: OWNER_ONLY }
      );
      return { directory, vmId: vm.id, manifest, manifestSha256 };
    });
  } catch (error) {
    if (directory) {
      try {
        await writeFile(
          path.join(directory, "failure.json"),
          JSON.stringify({ event: "baseline-import-failed", vmId: vm?.id ?? null }),
          { flag: "wx", mode: OWNER_ONLY }
        );
      } catch {
        fail("failure evidence unavailable; preserve this run and reconcile its lock");
      }
    }
    if (error instanceof StopError) throw error;
    fail(
      "capture/import failed (65536 bytes/file, 256 files, 1048576 bytes total, 120000 ms lifetime); reconcile retained lock/evidence before a new run"
    );
  }
}
