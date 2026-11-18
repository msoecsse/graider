/** Supervisor-only Slice 2B. No Agent, host validation, promotion or execution entry point. */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { arch, platform, release } from "node:os";
import { z } from "zod";
import { StopError } from "./errors.js";
import { withLock } from "./runner.js";
import { createQemuVm } from "./vm/qemu.js";
import { assertPlatform } from "./vm/inputs.js";
import { inside, safePaths, sourceCapture, text } from "./baseline-source.js";
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
const { git, identity, tracked, capture } = sourceCapture(BASELINE_LIMITS);
const REGULAR_MODE = 0o100000;
const DIRECTORY_MODE = 0o040000;
const TYPE_MASK = 0o170000;
const PERMISSION_MASK = 0o7777;
const SOURCE_MODE = 0o644;
const EXECUTABLE_MODE = 0o755;
const OWNER_ONLY = 0o600;
const LAST_INDEX = -1;
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
