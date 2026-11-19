/** Shared read-only capture invariants. Capacity is fixed by each supervisor entry point. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { exec as bundledGit } from "dugite";
import { StopError } from "./errors.js";
const SOURCE_PATH_BYTES = 240;
const LAST_INDEX = -1;
const SINGLE_LINK = 1n;
const SPECIAL_BITS = 0o7000;
const EXECUTABLE_BITS = 0o111;
const NULL_DEVICE = "/dev/null";
function fail(reason: string): never {
  throw new StopError(`Baseline ${reason}; execution remains disabled.`);
}
export interface SourceIdentity {
  repository: "msoecsse/graider";
  branch: "remote-course-v2";
  expectedHead: string;
}
export interface CaptureLimits {
  files: number;
  fileBytes: number;
  totalBytes: number;
  metadataBytes: number;
  operationMs: number;
}
export interface TrackedFile {
  path: string;
  mode: "100644" | "100755";
  oid: string;
  size: number;
}
export function safePaths(paths: readonly string[]): Map<string, "file" | "directory"> {
  const seen = new Map<string, { path: string; type: "file" | "directory" }>();
  let previous: string | undefined;
  for (const name of paths) {
    const parts = name.split("/");
    if (
      name.length > SOURCE_PATH_BYTES ||
      !/^[A-Za-z0-9_./()-]+$/.test(name) ||
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
export function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}
export function text(bytes: Buffer): string {
  const value = bytes.toString("utf8");
  if (!Buffer.from(value).equals(bytes)) fail("invalid metadata encoding");
  return value;
}
function records(value: string): string[] {
  if (value === "") return [];
  if (!value.endsWith("\0")) fail("malformed tracked metadata");
  return value.slice(0, LAST_INDEX).split("\0");
}

export function sourceCapture(limits: Readonly<CaptureLimits>) {
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
        maxBuffer: limits.metadataBytes,
        signal: AbortSignal.any([signal, AbortSignal.timeout(limits.operationMs)]),
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
  async function identity(
    options: SourceIdentity,
    cwd: string,
    signal: AbortSignal
  ): Promise<void> {
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
    if (!tree.length || tree.length > limits.files)
      fail(`tracked count limit (${String(limits.files)} files)`);
    const files = tree
      .map((record): TrackedFile => {
        const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/.exec(record);
        if (!match) fail("unsafe tracked entry type or mode");
        const mode = match[1] as TrackedFile["mode"];
        const size = Number(match[3]);
        if (!Number.isSafeInteger(size) || size > limits.fileBytes)
          fail(`file-size limit (${String(limits.fileBytes)} bytes)`);
        return { mode, oid: match[2] ?? "", size, path: match[4] ?? "" };
      })
      .sort((a, b) => (a.path < b.path ? LAST_INDEX : a.path > b.path ? 1 : 0));
    safePaths(files.map((file) => file.path));
    if (files.reduce((total, file) => total + file.size, 0) > limits.totalBytes)
      fail(`aggregate limit (${String(limits.totalBytes)} bytes)`);
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
        if (
          !(await readdir(path.dirname(path.join(cwd, relative)))).includes(parts[count - 1] ?? "")
        )
          fail("source path alias");
        await inspect(relative, true);
      }
      if (
        !(await readdir(path.dirname(path.join(cwd, file.path)))).includes(
          parts.at(LAST_INDEX) ?? ""
        )
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

  return { git, identity, tracked, capture };
}
