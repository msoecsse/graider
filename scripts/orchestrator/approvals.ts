import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export type ApprovalDecision = "accepted" | "denied" | "unavailable" | "cancelled" | "invalid";
export type Approval = (
  method: string,
  id: string,
  signal: AbortSignal,
  preview: string
) => Promise<ApprovalDecision>;

/** One terminal for the invocation; EOF and cancellation never become denial. */
export class TerminalApprovals {
  private terminal: Interface | undefined;
  private closed = false;
  private tail = Promise.resolve();
  private pending: ((decision: ApprovalDecision) => void) | undefined;
  constructor(
    private readonly input: Readable & { isTTY?: boolean } = process.stdin,
    private readonly output: Writable = process.stdout
  ) {}
  readonly request: Approval = (method, id, signal, preview) => {
    const result = this.tail.then(() => this.ask(method, id, signal, preview));
    this.tail = result.then(
      () => {},
      () => {}
    );
    return result;
  };
  private ask(
    method: string,
    id: string,
    signal: AbortSignal,
    preview: string
  ): Promise<ApprovalDecision> {
    if (signal.aborted) return Promise.resolve("cancelled");
    if (this.closed || !this.input.isTTY || this.input.destroyed || this.input.readableEnded)
      return Promise.resolve("unavailable");
    if (!this.terminal) {
      this.terminal = createInterface({ input: this.input, output: this.output });
      this.terminal.on("line", (answer) => {
        // Unsolicited/pasted answers are discarded; each grant belongs to one displayed prompt.
        this.pending?.(answer === "yes" ? "accepted" : answer === "no" ? "denied" : "invalid");
      });
      this.terminal.once("close", () => {
        this.closed = true;
        this.pending?.("unavailable");
      });
      this.terminal.on("error", () => {
        this.close();
      });
      this.input.once("error", () => {
        this.close();
      });
      this.terminal.on("SIGINT", () => {
        this.pending?.("cancelled");
        this.close();
      });
    }
    return new Promise((resolve) => {
      const abort = (): void => {
        this.pending?.("cancelled");
      };
      this.pending = (decision): void => {
        this.pending = undefined;
        signal.removeEventListener("abort", abort);
        resolve(decision);
      };
      signal.addEventListener("abort", abort, { once: true });
      this.output.write(
        `${method} request ${id}: ${preview}\nApprove this single request? [yes/no] `
      );
    });
  }
  close(): void {
    this.closed = true;
    this.pending?.("unavailable");
    this.terminal?.close();
  }
}
