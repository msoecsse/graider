/** Manual pinned-HVF synthetic experiments only. Never imports/captures the checkout. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HvfTestTransport } from "../../../scripts/orchestrator/grt1/hvf.js";
import { transfer, type Source } from "../../../scripts/orchestrator/grt1/transfer.js";
import { LIMITS, sha256 } from "../../../scripts/orchestrator/grt1/protocol.js";
import { admitManifest } from "../../../scripts/orchestrator/grt1/manifest.js";
import pins from "../../../scripts/orchestrator/grt1/test-image-pins.json" with { type: "json" };

const artifacts = process.argv[2];
const scenario = process.argv[3] ?? "small";
if (!artifacts || !["small", "large", "maximum", "cancel", "deep"].includes(scenario))
  throw new Error(
    "Pass pinned test artifacts and small|large|maximum|cancel|deep; never regenerate pins."
  );
const directory = await mkdtemp(path.join(tmpdir(), "graider-72-grt1-proof-"));
console.log(directory);
const started = performance.now();
const sourceFiles = [
  "protocol.ts",
  "manifest.ts",
  "channel.ts",
  "transfer.ts",
  "hvf.ts",
  "inputs.ts",
  "watchdog.mjs",
  "test-image-pins.json",
  "guest.py",
  "guest-init.sh"
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(
      async (name) =>
        [
          name,
          sha256(
            await readFile(new URL(`../../../scripts/orchestrator/grt1/${name}`, import.meta.url))
          )
        ] as const
    )
  )
);
const probeSha256 = sha256(await readFile(new URL("./probe.ts", import.meta.url)));
const SMALL_BYTES = 17;
const SORT_BEFORE = -1;
const HEAD_HEX = 40;
const LARGE_COUNT = 1_536;
const LARGE_DIRECTORIES = 512;
const LARGE_BYTES = 12_679_270;
const DEEP_COMPONENTS = 80;
const count = scenario === "maximum" ? LIMITS.files : scenario === "large" ? LARGE_COUNT : 5;
const directories =
  scenario === "maximum"
    ? LIMITS.directories - DEEP_COMPONENTS
    : scenario === "large"
      ? LARGE_DIRECTORIES
      : 3;
const target =
  scenario === "maximum"
    ? LIMITS.source
    : scenario === "large"
      ? LARGE_BYTES
      : LIMITS.file + SMALL_BYTES + LIMITS.chunk;
let remaining = target;
const sizes: number[] = [];
for (let index = 0; index < count; index++) {
  // Include empty, exactly max-sized, executable, binary and many small files.
  const size =
    index === 0
      ? 0
      : index === 1
        ? LIMITS.file
        : index === 2
          ? SMALL_BYTES
          : Math.min(LIMITS.file, Math.ceil(remaining / (count - index)));
  sizes.push(size);
  remaining -= size;
}
assert.equal(remaining, 0);
const BYTE_VALUES = 256;
const content = (index: number, offset: number, size: number): Buffer => {
  const data = Buffer.alloc(size);
  for (let at = 0; at < size; at++) data[at] = (index + offset + at) % BYTE_VALUES;
  return data;
};
const streamHash = createHash("sha256");
let prefix = 0;
const files = sizes
  .map((size, index) => {
    const bytes = content(index, 0, size);
    const file = {
      path:
        (scenario === "deep" || scenario === "maximum") && index === 0
          ? `${"d/".repeat(DEEP_COMPONENTS)}empty.bin`
          : `d${String(index % directories).padStart(4, "0")}/f${String(index).padStart(4, "0")}.bin`,
      mode: index % 2 ? "100755" : "100644",
      size,
      sha256: sha256(bytes),
      index,
      offset: 0
    };
    return file;
  })
  .sort((a, b) => (a.path < b.path ? SORT_BEFORE : 1));
for (const file of files) {
  file.offset = prefix;
  prefix += file.size;
  streamHash.update(content(file.index, 0, file.size));
}
const manifest = {
  version: 1,
  repository: "msoecsse/graider",
  branch: "remote-course-v2",
  head: "a".repeat(HEAD_HEX),
  issue: 72,
  files: files.map((file) => ({
    path: file.path,
    mode: file.mode,
    size: file.size,
    sha256: file.sha256
  }))
};
const plan = admitManifest(manifest);
assert.equal(plan.total, target);
const controller = new AbortController();
let reads = 0;
const CANCEL_AFTER_READS = 3;
const source: Source = {
  size: prefix,
  sha256: streamHash.digest("hex"),
  read: (offset, length) => {
    reads++;
    if (scenario === "cancel" && reads === CANCEL_AFTER_READS) controller.abort();
    const data = Buffer.alloc(length);
    let copied = 0;
    for (const file of files) {
      const begin = Math.max(offset, file.offset);
      const end = Math.min(offset + length, file.offset + file.size);
      if (end > begin) {
        const fragment = content(file.index, begin - file.offset, end - begin);
        fragment.copy(data, begin - offset);
        copied += fragment.length;
      }
    }
    assert.equal(copied, length);
    return Promise.resolve(data);
  }
};
const vm = await HvfTestTransport.create(directory, artifacts);
let receipt: unknown;
let rejected = false;
try {
  receipt = await transfer(vm, manifest, source, { signal: controller.signal });
} catch (error) {
  rejected = true;
  if (scenario !== "cancel") throw error;
} finally {
  await vm.stop();
}
assert.equal(rejected, scenario === "cancel");
const cleanup = await vm.stop();
assert.deepEqual(cleanup, { reaped: true, payloadRemoved: true });
await assert.rejects(stat(path.join(vm.directory, "disposable")), { code: "ENOENT" });
const watchdog: unknown = JSON.parse(
  await readFile(path.join(vm.directory, "watchdog.json"), "utf8")
);
assert.ok(
  typeof watchdog === "object" &&
    watchdog !== null &&
    "sentBytes" in watchdog &&
    "receivedBytes" in watchdog &&
    "stderrBytes" in watchdog
);
if (
  typeof receipt === "object" &&
  receipt !== null &&
  "sentBytes" in receipt &&
  "receivedBytes" in receipt &&
  "diagnosticBytes" in receipt
) {
  assert.equal(watchdog.sentBytes, receipt.sentBytes);
  assert.equal(watchdog.receivedBytes, receipt.receivedBytes);
  assert.equal(watchdog.stderrBytes, receipt.diagnosticBytes);
}
const result = {
  scope: "Synthetic GRT1 only; no full-Graider/native acceptance or production integration",
  scenario,
  files: files.length,
  directories: plan.directories,
  sourceBytes: target,
  manifestBytes: plan.bytes.length,
  inventoryBytes: plan.inventory.length,
  sourceReads: reads,
  receipt,
  rejected,
  elapsedMs: performance.now() - started,
  cleanup,
  watchdog,
  imageSha256: pins.imageSha256,
  helperSha256: pins.sources["./guest.py"],
  probeSha256,
  sourceHashes,
  vmDirectory: vm.directory
};
await writeFile(path.join(directory, "result.json"), JSON.stringify(result, null, 2), {
  mode: 0o600
});
console.log(JSON.stringify(result, null, 2));
