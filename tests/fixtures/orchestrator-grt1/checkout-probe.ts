/** Manual exact-HEAD HVF proof. Imported checkout programs are never executed. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { proveCheckoutImport } from "../../../scripts/orchestrator/grt1/checkout.js";
import { sha256 } from "../../../scripts/orchestrator/grt1/protocol.js";
import pins from "../../../scripts/orchestrator/grt1/test-image-pins.json" with { type: "json" };
const [cwd, expectedHead, artifactDirectory] = process.argv.slice(2);
if (!cwd || !expectedHead || !artifactDirectory)
  throw new Error("Pass clean authoritative checkout, exact HEAD and existing pinned artifacts.");
// Match the canonical VM executable path when macOS tmpdir uses the /var alias.
const stateParent = await realpath(await mkdtemp(path.join(tmpdir(), "graider-72-2c3-proof-")));
console.log(stateParent);
const execute = promisify(execFile);
const SAMPLE_MS = 250;
const PS_TIMEOUT_MS = 2_000;
const MAX_PS_BYTES = 1_048_576;
const OWNER_ONLY = 0o600;
const ISSUE = 72;
let sampling = false;
let sampleFailure = false;
let samples = 0;
let qemuPeakRssKiB = 0;
let workspacePeakBytes = 0;
let workspacePeakEntries = 0;
async function disk(directory: string): Promise<{ bytes: number; entries: number }> {
  let bytes = 0;
  let entries = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    try {
      const info = await lstat(name);
      assert.ok(!info.isSymbolicLink());
      bytes += info.size;
      entries++;
      if (info.isDirectory()) {
        const nested = await disk(name);
        bytes += nested.bytes;
        entries += nested.entries;
      }
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      // Disposal can remove files during a sample; peak observations remain lower bounds.
    }
  }
  return { bytes, entries };
}
async function sample(): Promise<void> {
  if (!sampling) {
    sampling = true;
    try {
      const result = await execute("/bin/ps", ["-axo", "pid=,rss=,comm="], {
        env: { PATH: "/usr/bin:/bin", LC_ALL: "C" },
        timeout: PS_TIMEOUT_MS,
        maxBuffer: MAX_PS_BYTES
      });
      for (const row of result.stdout.split("\n")) {
        const match = /^\s*([0-9]+)\s+([0-9]+)\s+(.+)$/.exec(row);
        if (match?.[3]?.startsWith(`${stateParent}/`) && match[3].endsWith("/qemu-system-aarch64"))
          qemuPeakRssKiB = Math.max(qemuPeakRssKiB, Number(match[2]));
      }
      const use = await disk(stateParent);
      workspacePeakBytes = Math.max(workspacePeakBytes, use.bytes);
      workspacePeakEntries = Math.max(workspacePeakEntries, use.entries);
      samples++;
    } catch {
      sampleFailure = true;
    } finally {
      sampling = false;
    }
  }
}
const timer = setInterval(() => {
  void sample();
}, SAMPLE_MS);
const sources = [
  "../baseline-source.ts",
  "../baseline.ts",
  "./checkout.ts",
  "./transfer.ts",
  "./manifest.ts",
  "./protocol.ts",
  "./channel.ts",
  "./hvf.ts",
  "./inputs.ts",
  "./watchdog.mjs",
  "./test-image-pins.json",
  "./guest.py",
  "./guest-init.sh"
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sources.map(
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
try {
  const receipt = await proveCheckoutImport({
    cwd,
    expectedHead,
    artifactDirectory,
    stateParent,
    repository: "msoecsse/graider",
    branch: "remote-course-v2",
    issue: ISSUE
  });
  const names = (await readdir(receipt.directory)).filter((name) =>
    name.startsWith("graider-grt1-")
  );
  assert.equal(names.length, 1);
  const vmDirectory = path.join(receipt.directory, names[0] ?? "absent");
  const watchdog: unknown = JSON.parse(
    await readFile(path.join(vmDirectory, "watchdog.json"), "utf8")
  );
  assert.ok(
    typeof watchdog === "object" &&
      watchdog !== null &&
      "sentBytes" in watchdog &&
      "receivedBytes" in watchdog &&
      "stderrBytes" in watchdog &&
      "status" in watchdog
  );
  assert.equal(watchdog.status, "reaped");
  assert.equal(watchdog.sentBytes, receipt.transfer.sentBytes);
  assert.equal(watchdog.receivedBytes, receipt.transfer.receivedBytes);
  assert.equal(watchdog.stderrBytes, receipt.transfer.diagnosticBytes);
  await assert.rejects(stat(path.join(vmDirectory, "disposable")), { code: "ENOENT" });
  await assert.rejects(stat(path.join(cwd, ".git/graider-orchestrator.lock")), { code: "ENOENT" });
  clearInterval(timer);
  // Finish outstanding sampling before persisting its measured results.
  await sample();
  const result = {
    scope: "complete real starting-HEAD checkout; standalone GRT1 only",
    head: expectedHead,
    measurement: receipt.measurement,
    captureMs: receipt.captureMs,
    recheckMs: receipt.recheckMs,
    elapsedMs: receipt.elapsedMs,
    hostMaxRssKiB: receipt.hostMaxRssKiB,
    transfer: receipt.transfer,
    sampling: {
      periodMs: SAMPLE_MS,
      samples,
      sampleFailure,
      qemuPeakRssKiB,
      workspacePeakBytes,
      workspacePeakEntries
    },
    sourceHashes,
    probeSha256: sha256(await readFile(new URL("./checkout-probe.ts", import.meta.url))),
    imageSha256: pins.imageSha256,
    vmDirectory,
    directory: receipt.directory,
    watchdog
  };
  await writeFile(path.join(stateParent, "result.json"), JSON.stringify(result, null, 2), {
    flag: "wx",
    mode: OWNER_ONLY
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await writeFile(
    path.join(stateParent, "attempt-failed.json"),
    JSON.stringify({
      event: "proof-attempt-failed",
      head: expectedHead,
      sourceHashes,
      at: new Date().toISOString()
    }),
    { flag: "wx", mode: OWNER_ONLY }
  );
  throw error;
} finally {
  clearInterval(timer);
}
