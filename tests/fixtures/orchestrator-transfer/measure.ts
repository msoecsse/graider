/** Read-only Slice 2C1 sizing; not the production source-capture validator. */
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { exec } from "dugite";

const cwd = process.cwd();
const SORT_BEFORE = -1;
const OLD_FILE_CAP = 65_536;
const LARGEST_COUNT = 10;
const env = {
  PATH: "",
  HOME: cwd,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_NO_LAZY_FETCH: "1",
  GIT_OPTIONAL_LOCKS: "0"
};
async function git(args: string[]): Promise<string> {
  const result = await exec(
    ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
    cwd,
    { env }
  );
  if (result.exitCode !== 0) throw new Error("Read-only sizing failed");
  return result.stdout;
}
const started = performance.now();
const head = (await git(["rev-parse", "HEAD"])).trim();
const tree = await git(["ls-tree", "-rlz", "--full-tree", "HEAD"]);
const directories = new Set<string>();
const files = [];
for (const record of tree.split("\0").filter(Boolean)) {
  const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/.exec(record);
  if (!match) throw new Error("Nonregular tracked entry");
  const [, mode, oid, sizeText, name] = match;
  if (!name || !sizeText) throw new Error("Malformed tracked entry");
  const stat = await lstat(name);
  if (!stat.isFile() || stat.nlink !== 1) throw new Error("Nonregular checkout entry");
  const bytes = await readFile(name);
  const rawOid = createHash("sha1")
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest("hex");
  if (rawOid !== oid || bytes.length !== Number(sizeText))
    throw new Error("Checkout differs from HEAD bytes");
  const parts = name.split("/");
  for (let depth = 1; depth < parts.length; depth++)
    directories.add(parts.slice(0, depth).join("/"));
  files.push({
    path: name,
    mode,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
}
files.sort((a, b) => (a.path < b.path ? SORT_BEFORE : a.path > b.path ? 1 : 0));
const manifest = Buffer.from(
  JSON.stringify({
    version: 1,
    repository: "msoecsse/graider",
    branch: "remote-course-v2",
    head,
    issue: 72,
    files
  })
);
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const chunkBytes = 32_768;
const inventory = Buffer.from(
  JSON.stringify(
    [
      ...files.map((file) => ({
        path: file.path,
        type: "file",
        mode: file.mode === "100755" ? "0755" : "0644",
        size: file.size,
        links: 1
      })),
      ...[...directories].map((path) => ({
        path,
        type: "directory",
        mode: "0755",
        size: 0,
        links: 0
      }))
    ].sort((a, b) => (a.path < b.path ? SORT_BEFORE : a.path > b.path ? 1 : 0))
  )
);
console.log(
  JSON.stringify(
    {
      head,
      files: files.length,
      totalBytes,
      directories: directories.size,
      manifestBytes: manifest.length,
      inventoryBytes: inventory.length,
      manifestSha256: createHash("sha256").update(manifest).digest("hex"),
      maximumPathBytes: Math.max(...files.map((file) => Buffer.byteLength(file.path))),
      above64KiB: files.filter((file) => file.size > OLD_FILE_CAP).length,
      largest: [...files].sort((a, b) => b.size - a.size).slice(0, LARGEST_COUNT),
      perFileChunks: files.reduce(
        (sum, file) => sum + Math.max(1, Math.ceil(file.size / chunkBytes)),
        0
      ),
      packedDataChunks: Math.ceil(totalBytes / chunkBytes),
      manifestChunks: Math.ceil(manifest.length / chunkBytes),
      elapsedMs: performance.now() - started
    },
    null,
    2
  )
);
