/** Supervisor-only developer boundary. Never exposed through renderer IPC or Agent. */
export interface VmOperation {
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface GuestCommand {
  executable: string;
  args: readonly string[];
}
export interface GuestResult {
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
}
export interface DisposableVm {
  readonly id: string;
  start(options?: VmOperation): Promise<void>;
  run(command: GuestCommand, options?: VmOperation): Promise<GuestResult>;
  putFile(relativePath: string, bytes: Uint8Array, options?: VmOperation): Promise<void>;
  getFile(relativePath: string, options?: VmOperation): Promise<Buffer>;
  shutdown(): Promise<void>;
  destroy(): Promise<void>;
}
