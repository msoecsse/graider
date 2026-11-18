/** Executable design model only. No production imports, filesystem or VM authority. */
import { createHash } from "node:crypto";

export const LIMITS = Object.freeze({
  chunk: 32_768,
  header: 256,
  frame: 44_000,
  file: 524_288,
  total: 16_777_216,
  manifest: 1_048_576,
  inventory: 1_048_576,
  files: 2_048,
  directories: 1_024,
  wire: 67_108_864,
  operations: 1_126,
  lifetimeMs: 600_000
});
export const digest = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
export type Kind = "M" | "D" | "R" | "I";
export interface FileIdentity {
  path: string;
  mode: string;
  size: number;
  sha256: string;
}
export interface InventoryEntry {
  path: string;
  type: "file" | "directory";
  mode: string;
  size: number;
  links: number;
}
/** Compares a bounded canonical inventory to the supervisor's expected inventory.
 * Directory sizes/link counts are normalized to zero, never used as file identity.
 * The production path/reparse/source validators remain separately mandatory.
 */
export function verifyInventory(wire: Buffer, expected: readonly InventoryEntry[]): void {
  if (wire.length > LIMITS.inventory || !wire.equals(Buffer.from(JSON.stringify(expected))))
    reject();
}
/** Independent readback projection; production must stream, not concatenate like this test helper. */
export function verifyReadback(bytes: Buffer, files: readonly FileIdentity[]): void {
  let offset = 0;
  for (const file of files) {
    integer(file.size, LIMITS.file);
    const next = offset + file.size;
    if (next > bytes.length || digest(bytes.subarray(offset, next)) !== file.sha256) reject();
    offset = next;
  }
  if (offset !== bytes.length) reject();
}
interface Frame {
  session: string;
  sequence: number;
  kind: Kind;
  offset: number;
  bytes: Buffer;
}
const INTEGER = "(?:0|[1-9][0-9]{0,8})";
const FRAME = new RegExp(
  `^GRT1 ([a-f0-9]{32}) (${INTEGER}) ([MDRI]) (${INTEGER}) (${INTEGER}) ([a-f0-9]{64}) ([A-Za-z0-9+/]+={0,2})\\n$`
);
const ACK = new RegExp(`^GRT1 ([a-f0-9]{32}) (${INTEGER}) ACK (${INTEGER}) ([a-f0-9]{64})\\n$`);
function reject(): never {
  throw new Error("Transfer model rejected; destroy session, no resume");
}
function integer(value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) reject();
}
export function encode(frame: Frame): Buffer {
  const bytes = Buffer.from(
    `GRT1 ${frame.session} ${String(frame.sequence)} ${frame.kind} ${String(frame.offset)} ${String(frame.bytes.length)} ${digest(frame.bytes)} ${frame.bytes.toString("base64")}\n`
  );
  decode(bytes);
  return bytes;
}
export function decode(wire: Buffer): Frame {
  if (wire.length > LIMITS.frame || !wire.equals(Buffer.from(wire.toString("ascii"), "ascii")))
    reject();
  const match = FRAME.exec(wire.toString("ascii"));
  if (!match || match[0].length !== wire.length) reject();
  const [, session, sequence, kind, offset, length, hash, data] = match;
  if (!session || !sequence || !kind || !offset || !length || !hash || !data) reject();
  const bytes = Buffer.from(data, "base64");
  if (
    bytes.length < 1 ||
    bytes.length > LIMITS.chunk ||
    bytes.toString("base64") !== data ||
    bytes.length !== Number(length) ||
    digest(bytes) !== hash
  )
    reject();
  if (wire.length - data.length > LIMITS.header) reject();
  return { session, sequence: Number(sequence), kind: kind as Kind, offset: Number(offset), bytes };
}
export function acknowledge(frame: Frame): Buffer {
  return Buffer.from(
    `GRT1 ${frame.session} ${String(frame.sequence)} ACK ${String(frame.offset + frame.bytes.length)} ${digest(frame.bytes)}\n`
  );
}
export function verifyAck(wire: Buffer, frame: Frame): void {
  if (
    wire.length > LIMITS.header ||
    !ACK.test(wire.toString("ascii")) ||
    !wire.equals(acknowledge(frame))
  )
    reject();
}

/** One logical stream. A final digest is mandatory, including for an empty stream. */
export class StreamModel {
  private offset = 0;
  private sequence = 0;
  private hash = createHash("sha256");
  private state: "active" | "failed" | "finished" = "active";
  constructor(
    private readonly session: string,
    private readonly kind: Kind,
    private readonly size: number,
    private readonly expectedDigest: string,
    initialSequence = 0
  ) {
    const maximum = kind === "M" ? LIMITS.manifest : kind === "I" ? LIMITS.inventory : LIMITS.total;
    integer(size, maximum);
    integer(initialSequence, LIMITS.operations);
    this.sequence = initialSequence;
    if (!/^[a-f0-9]{32}$/.test(session) || !/^[a-f0-9]{64}$/.test(expectedDigest)) reject();
  }
  accept(wire: Buffer): Buffer {
    try {
      if (this.state !== "active" || this.sequence >= LIMITS.operations) reject();
      const frame = decode(wire);
      if (
        frame.session !== this.session ||
        frame.kind !== this.kind ||
        frame.sequence !== this.sequence ||
        frame.offset !== this.offset ||
        frame.bytes.length !== Math.min(LIMITS.chunk, this.size - this.offset)
      )
        reject();
      this.hash.update(frame.bytes);
      this.offset += frame.bytes.length;
      this.sequence++;
      return acknowledge(frame);
    } catch {
      this.state = "failed";
      reject();
    }
  }
  finish(): void {
    if (
      this.state !== "active" ||
      this.offset !== this.size ||
      this.hash.digest("hex") !== this.expectedDigest
    ) {
      this.state = "failed";
      reject();
    }
    this.state = "finished";
  }
  cancel(): void {
    this.state = "failed";
  }
}

export function resources(
  sizes: readonly number[],
  manifest: number,
  inventory: number,
  directories: number
): { operations: number; raw: number; wire: number; dataChunks: number } {
  integer(sizes.length, LIMITS.files);
  integer(directories, LIMITS.directories);
  integer(manifest, LIMITS.manifest);
  integer(inventory, LIMITS.inventory);
  sizes.forEach((size) => {
    integer(size, LIMITS.file);
  });
  const total = sizes.reduce((sum, size) => sum + size, 0);
  integer(total, LIMITS.total);
  const chunks = (size: number): number => Math.ceil(size / LIMITS.chunk);
  const dataChunks = chunks(total);
  // Manifest ingress, data ingress/readback, inventory before/after readback,
  // plus six fixed control exchanges (includes empty initial inventory).
  const payloadFrames = chunks(manifest) + dataChunks * 2 + chunks(inventory) * 2;
  const controls = 6;
  const operations = payloadFrames + controls;
  const raw = manifest + total * 2 + inventory * 2;
  // Each payload independently padded; <=4 extra base64 bytes per frame.
  const wire = Math.ceil(raw / 3) * 4 + payloadFrames * 4 + operations * LIMITS.header * 2;
  integer(operations, LIMITS.operations);
  integer(wire, LIMITS.wire);
  return { operations, raw, wire, dataChunks };
}

/** Models terminal cancellation/deadline/wire/operation failures with a fake clock. */
export class SessionBudget {
  private operations = 0;
  private wire = 0;
  private failed = false;
  constructor(private readonly startMs: number) {
    integer(startMs, Number.MAX_SAFE_INTEGER);
  }
  consume(sent: number, received: number, nowMs: number): void {
    try {
      integer(nowMs, Number.MAX_SAFE_INTEGER);
      if (this.failed || nowMs < this.startMs || nowMs - this.startMs >= LIMITS.lifetimeMs)
        reject();
      integer(sent, LIMITS.frame);
      integer(received, LIMITS.frame);
      this.operations++;
      this.wire += sent + received;
      integer(this.operations, LIMITS.operations);
      integer(this.wire, LIMITS.wire);
    } catch {
      this.failed = true;
      reject();
    }
  }
  cancel(): void {
    this.failed = true;
  }
  cleanup(reaped: boolean): "discard-disposable" | "retain-for-reconciliation" {
    this.failed = true;
    return reaped ? "discard-disposable" : "retain-for-reconciliation";
  }
}
