/** Standalone GRT1 test image verification; production pins are unchanged. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import runtime from "../vm/reviewed-inputs.json" with { type: "json" };
import profile from "./test-image-pins.json" with { type: "json" };
const pins = {
  ...runtime,
  imageSha256: profile.imageSha256,
  watchdogSha256: profile.watchdogSha256
};

const execute = promisify(execFile);
const MAX_INPUT_BYTES = 268_435_456;
const TOOL_TIMEOUT_MS = 3_000;
const MAX_TOOL_OUTPUT_BYTES = 262_144;
const VERIFICATION_TIMEOUT_MS = 30_000;
const READ_EXECUTE_OWNER = 0o500;
const READ_OWNER = 0o400;
const ENVIRONMENT = { PATH: "/usr/bin:/bin", LC_ALL: "C" };
const TOOL_OPTIONS = {
  env: ENVIRONMENT,
  shell: false,
  timeout: TOOL_TIMEOUT_MS,
  maxBuffer: MAX_TOOL_OUTPUT_BYTES
} as const;

export function assertPlatform(hostPlatform: string, hostArch: string, hostRelease: string): void {
  if (
    hostPlatform !== pins.host.platform ||
    hostArch !== pins.host.arch ||
    hostRelease !== pins.host.release
  )
    throw new Error("Reviewed hardware/OS runtime unavailable; no fallback.");
}
export async function verifiedBytes(filename: string, digest: string): Promise<Buffer> {
  const info = await stat(filename);
  if (!info.isFile() || info.size > MAX_INPUT_BYTES) throw new Error("Unreviewed input type/size.");
  const bytes = await readFile(filename);
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error("Unreviewed input digest.");
  return bytes;
}
export function dependencies(output: string): string[] {
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" (")[0] ?? "")
    .filter(Boolean)
    .map((name) => {
      if (!name.startsWith("/")) throw new Error("Unknown dynamic loader path.");
      return name;
    });
}

/** Fixed reviewed host tools only. No shell, ambient env, downloaded code or TCG. */
export async function verifyInputs(
  artifacts: string,
  work: string,
  signal: AbortSignal = AbortSignal.timeout(VERIFICATION_TIMEOUT_MS)
): Promise<{
  qemu: string;
  kernel: string;
  image: string;
  digest: string;
}> {
  assertPlatform(platform(), arch(), release());
  signal.throwIfAborted();
  const toolOptions = { ...TOOL_OPTIONS, signal };
  const hardware = await execute("/usr/sbin/sysctl", ["-n", "kern.hv_support"], toolOptions);
  const build = await execute("/usr/sbin/sysctl", ["-n", "kern.osversion"], toolOptions);
  if (hardware.stdout.trim() !== "1" || build.stdout.trim() !== pins.host.build)
    throw new Error("Hardware virtualization or reviewed OS build unavailable.");
  await verifiedBytes(process.execPath, pins.nodeSha256);
  await verifiedBytes(
    fileURLToPath(new URL("./watchdog.mjs", import.meta.url)),
    pins.watchdogSha256
  );
  for (const [name, expected] of Object.entries(profile.sources)) {
    await verifiedBytes(fileURLToPath(new URL(name, import.meta.url)), expected);
  }
  const qemuBytes = await verifiedBytes(pins.qemu.path, pins.qemu.sha256);
  const runtime = new Map(pins.libraries.map((library) => [library.path, library]));
  const inspected = new Set<string>();
  const inspect = async (filename: string): Promise<void> => {
    signal.throwIfAborted();
    if (!inspected.has(filename)) {
      inspected.add(filename);
      const loaded = dependencies(
        (await execute("/usr/bin/otool", ["-L", filename], toolOptions)).stdout
      );
      for (const dependency of loaded) {
        if (!dependency.startsWith("/usr/lib/") && !dependency.startsWith("/System/Library/")) {
          const pin = runtime.get(dependency);
          if (!pin || (await realpath(dependency)) !== pin.realpath)
            throw new Error("Unreviewed runtime dependency.");
          await verifiedBytes(dependency, pin.sha256);
          await inspect(dependency);
        }
      }
    }
  };
  await inspect(pins.qemu.path);
  await inspect(process.execPath);
  signal.throwIfAborted();
  const kernel = await verifiedBytes(path.join(artifacts, "vmlinuz-virt"), pins.kernelSha256);
  const image = await verifiedBytes(path.join(artifacts, "guest-initramfs.gz"), pins.imageSha256);
  const qemuPath = path.join(work, "qemu-system-aarch64");
  const kernelPath = path.join(work, "vmlinuz-virt");
  const imagePath = path.join(work, "guest-initramfs.gz");
  const stage = async (filename: string, bytes: Buffer, mode: number): Promise<void> => {
    try {
      await writeFile(filename, bytes, { mode, flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      await verifiedBytes(filename, createHash("sha256").update(bytes).digest("hex"));
    }
  };
  await stage(qemuPath, qemuBytes, READ_EXECUTE_OWNER);
  await stage(kernelPath, kernel, READ_OWNER);
  await stage(imagePath, image, READ_OWNER);
  signal.throwIfAborted();
  return {
    qemu: qemuPath,
    kernel: kernelPath,
    image: imagePath,
    digest: createHash("sha256").update(JSON.stringify(pins)).digest("hex")
  };
}
