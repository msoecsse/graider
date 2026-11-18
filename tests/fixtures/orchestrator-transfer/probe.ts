/** Manual credential-free HVF experiment; never imported by automated tests. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createQemuVm } from "../../../scripts/orchestrator/vm/qemu.js";
import { decode, digest, encode, LIMITS, verifyAck } from "./model.js";

const artifactDirectory = process.argv[2];
if (!artifactDirectory)
  throw new Error("Pass existing reviewed VM artifacts; no download or pin changes");
const directory = await mkdtemp(path.join(tmpdir(), "graider-72-synthetic-"));
console.log(directory);
const started = performance.now();
const vm = await createQemuVm({ artifactDirectory, stateParent: directory });
const SYNTHETIC_BYTES = 131_089;
const SESSION_HEX_CHARACTERS = 32;
const source = Buffer.alloc(SYNTHETIC_BYTES);
const BYTE_VALUES = 256;
for (let index = 0; index < source.length; index++) source[index] = index % BYTE_VALUES;
const receiver = await readFile(new URL("./receive.sh", import.meta.url));
let operations = 0;
let ingressWire = 0;
let egressBytes = 0;
const command = async (executable: string, args: string[]): Promise<Buffer> => {
  operations++;
  const result = await vm.run({ executable, args });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr.length, 0);
  egressBytes += result.stdout.length;
  return result.stdout;
};
try {
  await vm.start();
  const bootMs = performance.now() - started;
  const capacity = (
    await command("/bin/sh", [
      "-c",
      "test ! -e /work/large.bin; df -k /work; cat /proc/meminfo | head -n 3"
    ])
  ).toString();
  await vm.putFile("receive.sh", receiver);
  operations++;
  const transferStarted = performance.now();
  for (let offset = 0, sequence = 0; offset < source.length; offset += LIMITS.chunk, sequence++) {
    const frame = encode({
      session: "a".repeat(SESSION_HEX_CHARACTERS),
      sequence,
      kind: "D",
      offset,
      bytes: source.subarray(offset, offset + LIMITS.chunk)
    });
    ingressWire += frame.length;
    await vm.putFile("frame", frame);
    operations++;
    verifyAck(await command("/bin/sh", ["/work/receive.sh"]), decode(frame));
  }
  const ingressMs = performance.now() - transferStarted;
  const returned: Buffer[] = [];
  const readbackStarted = performance.now();
  const chunks = Math.ceil(source.length / LIMITS.chunk);
  for (let index = 0; index < chunks; index++) {
    returned.push(
      await command("/bin/busybox", [
        "dd",
        "if=/work/large.bin",
        `bs=${String(LIMITS.chunk)}`,
        `skip=${String(index)}`,
        "count=1",
        "status=none"
      ])
    );
  }
  const readbackMs = performance.now() - readbackStarted;
  const readback = Buffer.concat(returned);
  assert.deepEqual(readback, source);
  assert.equal(digest(readback), digest(source));
  const metadata = (
    await command("/bin/busybox", ["stat", "-c", "%a %h %s", "/work/large.bin"])
  ).toString();
  assert.equal(metadata, `644 1 ${String(source.length)}\n`);
  // Last frame remains present. A duplicate must fail; terminate immediately after it.
  const duplicate = await vm.run({ executable: "/bin/sh", args: ["/work/receive.sh"] });
  operations++;
  assert.notEqual(duplicate.exitCode, 0);
  await vm.shutdown();
  await vm.destroy();
  await assert.rejects(stat(path.join(directory, vm.id, "disposable")), { code: "ENOENT" });
  const watchdog = JSON.parse(
    await readFile(path.join(directory, vm.id, "watchdog.json"), "utf8")
  ) as unknown;
  const result = {
    scope: "Synthetic file only; not full repository or proposed production protocol acceptance",
    vmId: vm.id,
    bytes: source.length,
    sha256: digest(source),
    chunks,
    operations,
    bootMs,
    ingressMs,
    readbackMs,
    totalMs: performance.now() - started,
    ingressInnerFrameBytes: ingressWire,
    decodedCommandOutputBytes: egressBytes,
    receiverSha256: digest(receiver),
    probeSha256: digest(await readFile(new URL("./probe.ts", import.meta.url))),
    modelSha256: digest(await readFile(new URL("./model.ts", import.meta.url))),
    imageSha256: "0bc6c58baff447f3a4d722f46213e981ee9e4de126432a182310e24c0312e033",
    capacity,
    byteAndModeVerification: true,
    payloadRemoved: true,
    rejectedDuplicate: true,
    watchdog
  };
  await writeFile(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await vm.destroy();
}
