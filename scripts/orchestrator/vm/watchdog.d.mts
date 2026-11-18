import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import type { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
export interface WatchdogParent extends EventEmitter {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  connected: boolean;
  send(message: unknown): void;
  disconnect(): void;
  exitCode?: number;
}
export function supervise(
  parent: WatchdogParent,
  spawnVm: (
    file: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio
  ) => ChildProcessWithoutNullStreams,
  kill: (pid: number, signal: NodeJS.Signals | 0) => boolean,
  writeEvidence: (file: string, contents: string, options: { mode: number }) => void
): void;
