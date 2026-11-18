import { createHash, randomBytes } from "node:crypto";
import { Channel, type Pipes } from "./channel.js";
import { admitManifest, type Manifest } from "./manifest.js";
import {
  EMPTY_SHA256,
  LIMITS,
  PROFILE,
  TransferError,
  ack,
  control,
  decodeData,
  encodeData,
  fail,
  integer,
  sha256,
  type Phase
} from "./protocol.js";

export interface Source {
  size: number;
  sha256: string;
  read: (offset: number, length: number, signal: AbortSignal) => Promise<Buffer>;
}
export interface Cleanup {
  reaped: boolean;
  payloadRemoved: boolean;
  runtimeFailure?: boolean;
}
export interface Transport {
  start: (signal: AbortSignal) => Promise<Pipes>;
  stop: () => Promise<Cleanup>;
  record?: (evidence: Record<string, unknown>) => Promise<void>;
}
export interface Receipt {
  profile: string;
  session: string;
  manifestSha256: string;
  dataSha256: string;
  wireBytes: number;
  sentBytes: number;
  receivedBytes: number;
  diagnosticBytes: number;
  operations: number;
  elapsedMs: number;
  guestUsage: readonly number[];
  cleanup: Cleanup;
  transcriptSha256: string;
  maxExchangeMs: number;
}
const SESSION_BYTES = 16;
const WITHOUT_LAST = -1;
async function bounded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(LIMITS.operationMs)]);
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      const reason: unknown = deadline.reason;
      reject(
        reason instanceof TransferError
          ? reason
          : new TransferError("GRT1 source/startup deadline/cancellation.")
      );
    };
  });
  deadline.addEventListener("abort", abort, { once: true });
  try {
    deadline.throwIfAborted();
    return await Promise.race([operation(), cancelled]);
  } finally {
    deadline.removeEventListener("abort", abort);
  }
}
/** Hashes each file separately, including zero-byte files, without retaining the returned tree. */
class Readback {
  private index = 0;
  private offset = 0;
  private fileHash = createHash("sha256");
  private aggregate = createHash("sha256");
  private total = 0;
  constructor(private readonly manifest: Manifest) {
    this.emptyFiles();
  }
  private emptyFiles(): void {
    while (this.manifest.files[this.index]?.size === 0) {
      if (this.manifest.files[this.index]?.sha256 !== EMPTY_SHA256) fail("empty-file-integrity");
      this.index++;
    }
  }
  accept(bytes: Buffer): void {
    this.aggregate.update(bytes);
    this.total += bytes.length;
    let consumed = 0;
    while (consumed < bytes.length) {
      const file = this.manifest.files[this.index];
      if (!file) fail("extra-file-bytes");
      const count = Math.min(file.size - this.offset, bytes.length - consumed);
      this.fileHash.update(bytes.subarray(consumed, consumed + count));
      this.offset += count;
      consumed += count;
      if (this.offset === file.size) {
        if (this.fileHash.digest("hex") !== file.sha256) fail("file-integrity");
        this.fileHash = createHash("sha256");
        this.offset = 0;
        this.index++;
        this.emptyFiles();
      }
    }
  }
  finish(size: number, digest: string): void {
    if (
      this.total !== size ||
      this.index !== this.manifest.files.length ||
      this.offset !== 0 ||
      this.aggregate.digest("hex") !== digest
    )
      fail("stream-integrity");
  }
}
/** Caller supplies already captured synthetic bytes. No filesystem capture or production integration. */
export async function transfer(
  transport: Transport,
  input: unknown,
  source: Source,
  options: { signal?: AbortSignal } = {}
): Promise<Receipt> {
  const started = performance.now();
  let channel: Channel | undefined;
  let firstFailure: Error | undefined;
  let receipt: Omit<Receipt, "cleanup" | "elapsedMs"> | undefined;
  let identity: Record<string, unknown> = { profile: PROFILE };
  const lease = AbortSignal.timeout(LIMITS.leaseMs);
  const signal = options.signal ? AbortSignal.any([lease, options.signal]) : lease;
  try {
    signal.throwIfAborted();
    const plan = admitManifest(input);
    integer(source.size, LIMITS.source);
    if (source.size !== plan.total || !/^[a-f0-9]{64}$/.test(source.sha256))
      fail("source-declaration");
    const sourceDigest = source.sha256;
    const session = randomBytes(SESSION_BYTES).toString("hex");
    const manifestSha256 = sha256(plan.bytes);
    identity = { profile: PROFILE, session, manifestSha256, dataSha256: sourceDigest };
    channel = new Channel(await bounded(() => transport.start(signal), signal), signal);
    if (!(await channel.exchange()).equals(Buffer.from(`GRT1 READY ${PROFILE}\n`)))
      fail("startup-identity");
    const wire = channel;
    const sourceSignal = AbortSignal.any([signal, wire.failureSignal]);
    let sequence = 0;
    const exact = async (
      fields: (string | number)[],
      phase: string,
      offset: number,
      digest: string
    ): Promise<void> => {
      const returned = await wire.exchange(control(session, sequence, fields));
      if (!returned.equals(ack(session, sequence, phase, offset, digest))) fail("ack-identity");
      sequence++;
    };
    await exact(
      ["START", plan.bytes.length, manifestSha256, source.size, sourceDigest],
      "START",
      0,
      sha256(Buffer.from("[]"))
    );
    const send = async (
      phase: "M" | "D",
      size: number,
      read: Source["read"],
      verify?: Readback
    ): Promise<void> => {
      for (let offset = 0; offset < size; offset += LIMITS.chunk) {
        wire.healthy();
        const length = Math.min(LIMITS.chunk, size - offset);
        const bytes = await bounded(() => read(offset, length, sourceSignal), sourceSignal);
        wire.healthy();
        if (!Buffer.isBuffer(bytes) || bytes.length !== length) fail("source-short-read");
        verify?.accept(bytes);
        const returned = await wire.exchange(encodeData(session, sequence, phase, offset, bytes));
        if (!returned.equals(ack(session, sequence, phase, offset + length, sha256(bytes))))
          fail("data-ack");
        sequence++;
      }
    };
    await send("M", plan.bytes.length, (offset, length) =>
      Promise.resolve(plan.bytes.subarray(offset, offset + length))
    );
    await exact(["SEAL_MANIFEST"], "SEAL_MANIFEST", plan.bytes.length, manifestSha256);
    const ingress = new Readback(plan.manifest);
    await send("D", source.size, source.read, ingress);
    ingress.finish(source.size, sourceDigest);
    await exact(["SEAL_DATA"], "SEAL_DATA", source.size, sourceDigest);
    let previousOffset = 0;
    let previousDigest = EMPTY_SHA256;
    const receive = async (
      phase: Phase,
      size: number,
      accept: (bytes: Buffer, offset: number) => void | Promise<void>
    ): Promise<void> => {
      previousOffset = 0;
      previousDigest = EMPTY_SHA256;
      for (let offset = 0; offset < size; offset += LIMITS.chunk) {
        const length = Math.min(LIMITS.chunk, size - offset);
        const frame = decodeData(
          await wire.exchange(
            control(session, sequence, [
              "GET",
              phase,
              offset,
              length,
              previousOffset,
              previousDigest
            ]),
            LIMITS.frame
          )
        );
        if (
          frame.session !== session ||
          frame.sequence !== sequence ||
          frame.phase !== phase ||
          frame.offset !== offset ||
          frame.bytes.length !== length
        )
          fail("readback-identity");
        await accept(frame.bytes, offset);
        wire.healthy();
        previousOffset = offset + length;
        previousDigest = sha256(frame.bytes);
        sequence++;
      }
    };
    const inventory = async (): Promise<void> =>
      receive("I", plan.inventory.length, (bytes, offset) => {
        if (!bytes.equals(plan.inventory.subarray(offset, offset + bytes.length)))
          fail("inventory-integrity");
      });
    await inventory();
    await exact(
      ["BEGIN_READBACK", previousOffset, previousDigest],
      "BEGIN_READBACK",
      0,
      EMPTY_SHA256
    );
    const readback = new Readback(plan.manifest);
    await receive("R", source.size, async (bytes, offset) => {
      const expected = await bounded(
        () => source.read(offset, bytes.length, sourceSignal),
        sourceSignal
      );
      if (!bytes.equals(expected)) fail("readback-byte-comparison");
      readback.accept(bytes);
    });
    readback.finish(source.size, sourceDigest);
    await exact(
      ["END_READBACK", previousOffset, previousDigest],
      "END_READBACK",
      source.size,
      sourceDigest
    );
    await inventory();
    const finish = await wire.exchange(
      control(session, sequence, ["FINISH", previousOffset, previousDigest])
    );
    const prefix = ack(session, sequence, "FINISH", plan.bytes.length, manifestSha256)
      .toString()
      .trimEnd();
    // Fixed telemetry only: RSS KiB, used workspace bytes/inodes, MemTotal/MemAvailable KiB.
    const text = finish.toString("ascii");
    if (finish.length > LIMITS.header || !text.startsWith(`${prefix} `)) fail("finish-identity");
    const fields = text.slice(prefix.length + 1, WITHOUT_LAST).split(" ");
    const USAGE_FIELDS = 5;
    if (
      fields.length !== USAGE_FIELDS ||
      fields.some((field) => !/^(?:0|[1-9][0-9]{0,11})$/.test(field))
    )
      fail("usage-syntax");
    const guestUsage = fields.map(Number);
    const MAX_RSS_KIB = 65_536;
    const MAX_WORKSPACE_BYTES = 67_108_864;
    const MAX_WORKSPACE_INODES = 4_096;
    const MAX_RAM_KIB = 1_572_864;
    const usageBounds = [
      MAX_RSS_KIB,
      MAX_WORKSPACE_BYTES,
      MAX_WORKSPACE_INODES,
      MAX_RAM_KIB,
      guestUsage[3] ?? 0
    ];
    guestUsage.forEach((value, index) => {
      integer(value, usageBounds[index] ?? 0);
    });
    wire.healthy();
    channel.beginTeardown();
    receipt = {
      profile: PROFILE,
      session,
      manifestSha256,
      dataSha256: sourceDigest,
      wireBytes: wire.sent + wire.received + wire.diagnostics,
      sentBytes: wire.sent,
      receivedBytes: wire.received,
      diagnosticBytes: wire.diagnostics,
      operations: wire.operations,
      guestUsage,
      transcriptSha256: wire.transcript(),
      maxExchangeMs: wire.maxExchangeMs
    };
  } catch (error) {
    firstFailure =
      error instanceof TransferError
        ? error
        : new TransferError("GRT1 startup/cancellation/source failure; raw diagnostics withheld.");
  }
  let cleanup: Cleanup;
  try {
    cleanup = await transport.stop();
  } catch {
    cleanup = { reaped: false, payloadRemoved: false };
  }
  channel?.detach();
  try {
    channel?.assertComplete();
  } catch (error) {
    firstFailure ??=
      error instanceof TransferError ? error : new TransferError("GRT1 incomplete transcript.");
  }
  if (signal.aborted) firstFailure ??= new TransferError("GRT1 cancelled/lease.");
  if (cleanup.runtimeFailure) firstFailure ??= new TransferError("GRT1 unexpected runtime exit.");
  await transport.record?.({
    ...identity,
    status: firstFailure || !cleanup.reaped || !cleanup.payloadRemoved ? "failed" : "finished",
    failure: firstFailure?.message,
    sentBytes: channel?.sent ?? 0,
    receivedBytes: channel?.received ?? 0,
    diagnosticBytes: channel?.diagnostics ?? 0,
    operations: channel?.operations ?? 0,
    maxExchangeMs: channel?.maxExchangeMs ?? 0,
    transcriptSha256: channel?.transcript(),
    cleanup,
    at: new Date().toISOString()
  });
  if (!cleanup.reaped || !cleanup.payloadRemoved)
    fail("reaping uncertain; retain evidence/payload");
  if (firstFailure) throw firstFailure;
  if (!receipt) fail("missing-receipt");
  if (signal.aborted) fail("cancelled/lease");
  // Counts include all late traffic until verified stop, including malformed bytes/diagnostics.
  if (channel) {
    receipt.sentBytes = channel.sent;
    receipt.receivedBytes = channel.received;
    receipt.diagnosticBytes = channel.diagnostics;
    receipt.wireBytes = channel.sent + channel.received + channel.diagnostics;
    receipt.transcriptSha256 = channel.transcript();
  }
  return { ...receipt, cleanup, elapsedMs: performance.now() - started };
}
