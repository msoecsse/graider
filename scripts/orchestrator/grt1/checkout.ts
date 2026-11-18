/** Slice 2C3 supervisor proof only. Never called by the production baseline or executor. */
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import path from "node:path";
import { sourceCapture, inside } from "../baseline-source.js";
import { withLock } from "../runner.js";
import { StopError } from "../errors.js";
import type { BaselineOptions } from "../baseline.js";
import { HvfTestTransport } from "./hvf.js";
import { assertPlatform } from "./inputs.js";
import { admitManifest } from "./manifest.js";
import { LIMITS, PROFILE, TransferError, fail, sha256 } from "./protocol.js";
import { transfer, type Source } from "./transfer.js";

const PROOF_ISSUE = 72;
const SINGLE_LINK = 1n;
const OWNER_ONLY = 0o600;
const OLD_FILE_BYTES = 65_536;
const { git, identity, tracked, capture } = sourceCapture(
  Object.freeze({
    files: LIMITS.files,
    fileBytes: LIMITS.file,
    totalBytes: LIMITS.source,
    metadataBytes: LIMITS.metadata,
    operationMs: LIMITS.operationMs
  })
);
const stamp = async (filename: string): Promise<string> => {
  const info = await lstat(filename, { bigint: true });
  if (
    info.isSymbolicLink() ||
    (!info.isDirectory() && (!info.isFile() || info.nlink !== SINGLE_LINK)) ||
    (await realpath(filename)) !== filename
  )
    fail("checkout-metadata-identity");
  return [info.dev, info.ino, info.mode, info.nlink, info.size, info.mtimeNs, info.ctimeNs].join(
    ":"
  );
};
/** One complete tracked checkout; no returned VM, code execution or promotion authority. */
export async function proveCheckoutImport(options: BaselineOptions) {
  const started = performance.now();
  let directory: string | undefined;
  let phase = "preflight";
  try {
    options.signal?.throwIfAborted();
    // Unknown Windows reparse metadata and unsupported runtimes fail before any source capture.
    assertPlatform(platform(), arch(), release());
    if (options.issue !== PROOF_ISSUE) fail("checkout-proof-issue");
    admitManifest({
      version: 1,
      repository: options.repository,
      branch: options.branch,
      head: options.expectedHead,
      issue: options.issue,
      files: [{ path: "admission", mode: "100644", size: 0, sha256: sha256(Buffer.alloc(0)) }]
    });
    const signal = options.signal ?? new AbortController().signal;
    const cwd = await realpath(options.cwd);
    const common = await realpath(
      (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], signal)).trim()
    );
    const gitDirectory = await realpath(
      (await git(cwd, ["rev-parse", "--absolute-git-dir"], signal)).trim()
    );
    const parent = await realpath(options.stateParent);
    if (inside(cwd, parent) || inside(common, parent) || inside(gitDirectory, parent))
      fail("checkout-state-location");
    phase = "lock";
    return await withLock(path.join(common, "graider-orchestrator.lock"), async () => {
      phase = "capture";
      directory = await mkdtemp(path.join(parent, "graider-grt1-checkout-"));
      const evidence = directory;
      const save = (name: string, value: unknown) =>
        writeFile(path.join(evidence, name), JSON.stringify(value), {
          flag: "wx",
          mode: OWNER_ONLY
        });
      const metadataPaths = [
        common,
        gitDirectory,
        path.join(gitDirectory, "HEAD"),
        path.join(gitDirectory, "index")
      ];
      const metadata = await Promise.all(metadataPaths.map(stamp));
      await identity(options, cwd, signal);
      const files = await tracked(cwd, signal);
      const baseline = await capture(cwd, files, signal);
      const plan = admitManifest({
        version: 1,
        repository: options.repository,
        branch: options.branch,
        head: options.expectedHead,
        issue: options.issue,
        files: files.map((file) => ({
          path: file.path,
          mode: file.mode,
          size: file.size,
          sha256: sha256(baseline.bytes.get(file.path) ?? fail("missing-capture"))
        }))
      });
      const serialized = plan.bytes.toString("utf8");
      await save("manifest.json", plan.manifest);
      await save("tracked.json", files); // raw Git blob identities, sizes and modes for every tracked path.
      const hash = createHash("sha256");
      const segments: { offset: number; bytes: Buffer }[] = [];
      let offset = 0;
      for (const file of files) {
        const bytes = baseline.bytes.get(file.path) ?? fail("missing-capture");
        segments.push({ offset, bytes });
        offset += bytes.length;
        hash.update(bytes);
      }
      const source: Source = {
        size: offset,
        sha256: hash.digest("hex"),
        read: (offset, length, signal) => {
          signal.throwIfAborted();
          const output = Buffer.alloc(length);
          let copied = 0;
          for (const segment of segments) {
            const begin = Math.max(offset, segment.offset);
            const end = Math.min(offset + length, segment.offset + segment.bytes.length);
            if (end > begin) {
              segment.bytes.copy(
                output,
                begin - offset,
                begin - segment.offset,
                end - segment.offset
              );
              copied += end - begin;
            }
          }
          if (copied !== length) fail("captured-short-read");
          return Promise.resolve(output);
        }
      };
      const measurement = {
        head: options.expectedHead,
        files: files.length,
        directories: plan.directories,
        totalBytes: plan.total,
        manifestBytes: plan.bytes.length,
        inventoryBytes: plan.inventory.length,
        manifestSha256: sha256(plan.bytes),
        trackedSha256: sha256(Buffer.from(JSON.stringify(files))),
        maximumPathBytes: Math.max(...files.map((file) => Buffer.byteLength(file.path))),
        maximumFileBytes: Math.max(...files.map((file) => file.size)),
        above64KiB: files.filter((file) => file.size > OLD_FILE_BYTES).length,
        modes: {
          regular: files.filter((file) => file.mode === "100644").length,
          executable: files.filter((file) => file.mode === "100755").length
        }
      };
      await save("measurement.json", measurement);
      const captureMs = performance.now() - started;
      phase = "transfer";
      const vm = await HvfTestTransport.create(evidence, options.artifactDirectory);
      const result = await transfer(vm, plan.manifest, source, { signal });
      // transfer returns only after exact inventories, every readback byte/hash/mode and attested destruction.
      phase = "recheck";
      const recheckStarted = performance.now();
      if (
        (await readFile(path.join(evidence, "manifest.json"), "utf8")) !== serialized ||
        (await readFile(path.join(evidence, "tracked.json"), "utf8")) !== JSON.stringify(files)
      )
        fail("checkout-manifest-drift");
      await identity(options, cwd, signal);
      if (
        (await realpath(
          (
            await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], signal)
          ).trim()
        )) !== common ||
        (await realpath((await git(cwd, ["rev-parse", "--absolute-git-dir"], signal)).trim())) !==
          gitDirectory ||
        JSON.stringify(await tracked(cwd, signal)) !== JSON.stringify(files)
      )
        fail("checkout-authority-drift");
      const final = await capture(cwd, files, signal);
      if (
        JSON.stringify([...final.identities]) !== JSON.stringify([...baseline.identities]) ||
        JSON.stringify(await Promise.all(metadataPaths.map(stamp))) !== JSON.stringify(metadata)
      )
        fail("checkout-source-identity-drift");
      signal.throwIfAborted();
      const receipt = {
        profile: PROFILE,
        scope: "standalone-read-only-checkout-proof",
        head: options.expectedHead,
        directory: evidence,
        manifest: plan.manifest,
        measurement,
        transfer: result,
        captureMs,
        recheckMs: performance.now() - recheckStarted,
        elapsedMs: performance.now() - started,
        hostMaxRssKiB: process.resourceUsage().maxRSS,
        at: new Date().toISOString()
      };
      await save("receipt.json", receipt);
      return receipt;
    });
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      ["EEXIST", "ENOENT", "EACCES", "EPERM"].includes(String(error.code))
        ? String(error.code)
        : "unknown";
    const failure =
      error instanceof StopError || error instanceof TransferError
        ? error.message
        : `checkout-${phase}-filesystem/input-${code}`;
    if (directory)
      await writeFile(
        path.join(directory, "failure.json"),
        JSON.stringify({
          event: "checkout-proof-failed",
          failure,
          phase,
          profile: PROFILE,
          at: new Date().toISOString()
        }),
        { flag: "wx", mode: OWNER_ONLY }
      );
    fail(`checkout-proof-failed (${failure}); reconcile retained new lock/evidence`);
  }
}
