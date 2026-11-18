import type { Readable, Writable } from "node:stream";
import { createHash } from "node:crypto";
import { LIMITS, TransferError, ascii, fail } from "./protocol.js";

const LF_BYTE = 10;

export interface Pipes {
  input: Writable;
  output: Readable;
  diagnostics: Readable;
}
/** Exactly one outstanding exchange, at most one partial line; all bytes counted before parsing. */
export class Channel {
  sent = 0;
  received = 0;
  diagnostics = 0;
  operations = 0;
  maxExchangeMs = 0;
  private sentHash = createHash("sha256");
  private receivedHash = createHash("sha256");
  private diagnosticHash = createHash("sha256");
  private teardown = false;
  private partial = Buffer.alloc(0);
  private failure: Error | undefined;
  private readonly failed = new AbortController();
  get failureSignal(): AbortSignal {
    return this.failed.signal;
  }
  private pending:
    | { resolve: (line: Buffer) => void; reject: (error: Error) => void; maximum: number }
    | undefined;
  private readonly onAbort = (): void => {
    this.reject("cancelled/lease");
  };
  constructor(
    private readonly pipes: Pipes,
    private readonly signal: AbortSignal
  ) {
    pipes.output.on("data", (bytes: Buffer) => {
      this.receive(bytes);
    });
    pipes.diagnostics.on("data", (bytes: Buffer) => {
      this.diagnostics += bytes.length;
      this.diagnosticHash.update(bytes);
      this.account();
      if (!this.teardown) this.reject("diagnostics");
    });
    pipes.output.on("end", () => {
      this.reject(this.partial.length ? "truncated" : "guest-eof");
    });
    for (const stream of [pipes.input, pipes.output, pipes.diagnostics])
      stream.on("error", () => {
        this.reject("pipe-failure");
      });
    signal.addEventListener("abort", this.onAbort, { once: true });
    if (signal.aborted) this.onAbort();
  }
  private account(): void {
    if (this.sent + this.received + this.diagnostics > LIMITS.wire) this.reject("wire-limit");
  }
  private reject(code: string): void {
    this.failure ??= new TransferError(`GRT1 ${code}; terminal failure, no resume.`);
    if (!this.failed.signal.aborted) this.failed.abort(this.failure);
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(this.failure);
  }
  private receive(bytes: Buffer): void {
    this.received += bytes.length;
    this.receivedHash.update(bytes);
    this.account();
    if (!this.failure) {
      if (!this.pending) this.reject("unsolicited/duplicate");
      else if (bytes.length + this.partial.length > this.pending.maximum)
        this.reject("frame-limit");
      else {
        const combined = Buffer.concat([this.partial, bytes]);
        const newline = combined.indexOf(LF_BYTE);
        if (newline < 0) this.partial = combined;
        else if (newline !== combined.length - 1) this.reject("unsolicited/duplicate");
        else {
          let valid = true;
          try {
            ascii(combined, LIMITS.frame);
          } catch {
            valid = false;
            this.reject("frame-encoding");
          }
          if (valid) {
            this.partial = Buffer.alloc(0);
            const pending = this.pending;
            this.pending = undefined;
            pending.resolve(combined);
          }
        }
      }
    }
  }
  healthy(): void {
    if (this.failure) throw this.failure;
    this.signal.throwIfAborted();
  }
  async exchange(request?: Buffer, responseMaximum: number = LIMITS.header): Promise<Buffer> {
    const started = performance.now();
    this.healthy();
    if (this.pending) {
      this.reject("concurrent-exchange");
      this.healthy();
    }
    if (request) {
      ascii(request, LIMITS.frame);
      this.operations++;
      if (this.operations > LIMITS.operations) {
        this.reject("operation-limit");
        this.healthy();
      }
    }
    const response = new Promise<Buffer>((resolve, reject) => {
      this.pending = { resolve, reject, maximum: responseMaximum };
    });
    const timer = setTimeout(() => {
      this.reject("operation-timeout");
    }, LIMITS.operationMs);
    try {
      if (request) {
        this.sent += request.length;
        this.sentHash.update(request);
        this.account();
        this.healthy();
        this.pipes.input.write(request, (error) => {
          if (error) this.reject("write-failure");
        });
      }
      return await response;
    } finally {
      clearTimeout(timer);
      this.maxExchangeMs = Math.max(this.maxExchangeMs, performance.now() - started);
    }
  }
  /** Called only when the owner starts verified teardown after the terminal response. */
  detach(): void {
    this.signal.removeEventListener("abort", this.onAbort);
  }
  beginTeardown(): void {
    this.healthy();
    this.teardown = true;
    this.detach();
  }
  transcript(): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          sent: this.sentHash.copy().digest("hex"),
          received: this.receivedHash.copy().digest("hex"),
          diagnostics: this.diagnosticHash.copy().digest("hex"),
          sentBytes: this.sent,
          receivedBytes: this.received,
          diagnosticBytes: this.diagnostics,
          operations: this.operations
        })
      )
      .digest("hex");
  }
  assertComplete(): void {
    // EOF after FINISH is legal. Other late output/failures remain fatal.
    if (this.failure && !this.failure.message.includes("guest-eof")) throw this.failure;
    if (this.partial.length || this.pending) fail("incomplete-transcript");
  }
}
