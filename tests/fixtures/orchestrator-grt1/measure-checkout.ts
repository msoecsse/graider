/** Read-only sizing oracle, including unsafe tracked names. This never admits or imports bytes. */
import assert from "node:assert/strict";
import type { Stats } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { exec as bundledGit } from "dugite";
import { safePaths } from "../../../scripts/orchestrator/baseline-source.js";
import { sha256 } from "../../../scripts/orchestrator/grt1/protocol.js";
const [cwd, output] = process.argv.slice(2);
if (!cwd || !output) throw new Error("Pass checkout and new external measurement path.");
const OLD_FILE_BYTES = 65_536;
const OWNER_ONLY = 0o600;
const LAST_INDEX = -1;
const SINGLE_LINK = 1;
const EXECUTABLE_BITS = 0o111;
const SPECIAL_BITS = 0o7000;
const METADATA_BYTES = 1_048_576;
const OPERATION_MS = 30_000;
const ISSUE = 72;
const started = performance.now();
const env = {
  ...Object.fromEntries(Object.keys(process.env).map((key) => [key, undefined])),
  PATH: "",
  LC_ALL: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0"
};
async function git(args: string[]): Promise<string> {
  const result = await bundledGit(
    ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
    cwd ?? "",
    { env, maxBuffer: METADATA_BYTES, signal: AbortSignal.timeout(OPERATION_MS) }
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  return result.stdout;
}
const head = (await git(["rev-parse", "HEAD"])).trim();
const tree = await git(["ls-tree", "-rlz", "--full-tree", "HEAD"]);
assert.ok(tree.endsWith("\0"));
const directories = new Set<string>();
const files = [];
const unsafePaths: string[] = [];
for (const row of tree.slice(0, LAST_INDEX).split("\0")) {
  const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/.exec(row);
  assert.ok(match);
  const [, mode, oid, sizeText, name] = match;
  assert.ok(name && mode && sizeText && oid);
  const info: Stats = await lstat(path.join(cwd, name));
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === SINGLE_LINK);
  assert.equal(info.mode & SPECIAL_BITS, 0);
  assert.equal(info.mode & EXECUTABLE_BITS, mode === "100755" ? EXECUTABLE_BITS : 0);
  const content: Buffer = await readFile(path.join(cwd, name));
  assert.equal(content.length, Number(sizeText));
  assert.equal(
    createHash("sha1")
      .update(`blob ${String(content.length)}\0`)
      .update(content)
      .digest("hex"),
    oid
  );
  files.push({ path: name, mode, oid, size: content.length, sha256: sha256(content) });
  const parts = name.split("/");
  for (let count = 1; count < parts.length; count++)
    directories.add(parts.slice(0, count).join("/"));
  try {
    safePaths([name]);
  } catch {
    unsafePaths.push(name);
  }
}
files.sort((a, b) => (a.path < b.path ? LAST_INDEX : a.path > b.path ? 1 : 0));
const manifest = {
  version: 1,
  repository: "msoecsse/graider",
  branch: "remote-course-v2",
  head,
  issue: ISSUE,
  files: files.map(({ path, mode, size, sha256 }) => ({ path, mode, size, sha256 }))
};
const index = (await git(["ls-files", "--stage", "-z"])).split("\0").filter(Boolean).sort();
assert.deepEqual(index, files.map((file) => `${file.mode} ${file.oid} 0\t${file.path}`).sort());
assert.equal((await git(["rev-parse", "HEAD"])).trim(), head);
const result = {
  scope: "sizing only; unsafe names are measured, never admitted",
  head,
  files: files.length,
  directories: directories.size,
  totalBytes: files.reduce((sum, file) => sum + file.size, 0),
  manifestBytes: Buffer.byteLength(JSON.stringify(manifest)),
  manifestSha256: sha256(Buffer.from(JSON.stringify(manifest))),
  maximumPathBytes: Math.max(...files.map((file) => Buffer.byteLength(file.path))),
  maximumFileBytes: Math.max(...files.map((file) => file.size)),
  above64KiB: files.filter((file) => file.size > OLD_FILE_BYTES).length,
  modes: {
    regular: files.filter((file) => file.mode === "100644").length,
    executable: files.filter((file) => file.mode === "100755").length
  },
  unsafePaths,
  rawTreeSha256: sha256(Buffer.from(tree)),
  trackedSha256: sha256(Buffer.from(JSON.stringify(files))),
  elapsedMs: performance.now() - started,
  tracked: files
};
await writeFile(output, JSON.stringify(result, null, 2), { flag: "wx", mode: OWNER_ONLY });
console.log(JSON.stringify({ ...result, tracked: undefined }, null, 2));
