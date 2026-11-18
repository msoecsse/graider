/** GRT1/v1 standalone test profile. Never imported by the production VM/baseline/runner. */
import { createHash } from "node:crypto";

export const PROFILE = "GRT1-test-2c2";
export const LIMITS = Object.freeze({
  chunk: 32_768,
  header: 256,
  frame: 44_000,
  file: 524_288,
  source: 16_777_216,
  files: 2_048,
  directories: 1_024,
  path: 240,
  metadata: 1_048_576,
  wire: 67_108_864,
  operations: 1_126,
  operationMs: 30_000,
  leaseMs: 600_000
});
export type Phase = "M" | "D" | "I" | "R";
const ASCII_MAX = 127;
const WITHOUT_LAST = -1;
export const EMPTY_SHA256 = sha256(Buffer.alloc(0));
export class TransferError extends Error {}
export function fail(code: string): never {
  throw new TransferError(`GRT1 ${code}; terminal failure, no resume.`);
}
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function integer(value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail("resource/integer");
}
export function ascii(wire: Buffer, maximum: number): string {
  if (wire.length > maximum || wire.some((byte) => byte > ASCII_MAX)) fail("frame-bound/encoding");
  const value = wire.toString("ascii");
  if (!value.endsWith("\n") || value.slice(0, WITHOUT_LAST).includes("\n") || value.includes("\r"))
    fail("frame-termination");
  return value;
}
export interface DataFrame {
  session: string;
  sequence: number;
  phase: Phase;
  offset: number;
  bytes: Buffer;
}
const UNSIGNED = "(?:0|[1-9][0-9]{0,8})";
const DATA = new RegExp(
  `^GRT1 ([a-f0-9]{32}) (${UNSIGNED}) ([MDRI]) (${UNSIGNED}) (${UNSIGNED}) ([a-f0-9]{64}) ([A-Za-z0-9+/]+={0,2})\\n$`
);
export function decodeData(wire: Buffer): DataFrame {
  const value = ascii(wire, LIMITS.frame);
  const match = DATA.exec(value);
  if (!match || match[0].length !== wire.length) fail("data-syntax");
  const [, session, sequence, phase, offset, length, digest, encoded] = match;
  if (!session || !sequence || !phase || !offset || !length || !digest || !encoded)
    fail("data-fields");
  if (wire.length - encoded.length > LIMITS.header) fail("header-bound");
  const bytes = Buffer.from(encoded, "base64");
  if (
    !bytes.length ||
    bytes.length > LIMITS.chunk ||
    bytes.length !== Number(length) ||
    bytes.toString("base64") !== encoded ||
    sha256(bytes) !== digest
  )
    fail("data-integrity");
  integer(Number(sequence), LIMITS.operations);
  integer(Number(offset), LIMITS.source);
  return {
    session,
    sequence: Number(sequence),
    phase: phase as Phase,
    offset: Number(offset),
    bytes
  };
}
export function encodeData(
  session: string,
  sequence: number,
  phase: Phase,
  offset: number,
  bytes: Buffer
): Buffer {
  const wire = Buffer.from(
    `GRT1 ${session} ${String(sequence)} ${phase} ${String(offset)} ${String(bytes.length)} ${sha256(bytes)} ${bytes.toString("base64")}\n`
  );
  decodeData(wire);
  return wire;
}
export function control(
  session: string,
  sequence: number,
  fields: readonly (string | number)[]
): Buffer {
  integer(sequence, LIMITS.operations);
  if (
    !/^[a-f0-9]{32}$/.test(session) ||
    fields.some((field) => !/^[A-Za-z0-9_-]+$/.test(String(field)))
  )
    fail("control-fields");
  const wire = Buffer.from(`GRT1 ${session} ${String(sequence)} ${fields.map(String).join(" ")}\n`);
  ascii(wire, LIMITS.header);
  return wire;
}
export function ack(
  session: string,
  sequence: number,
  phase: string,
  offset: number,
  digest: string
): Buffer {
  return control(session, sequence, ["ACK", phase, offset, digest]);
}
