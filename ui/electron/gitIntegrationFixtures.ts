import { rm } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { describe, it } from "vitest";

// Multi-repository Git transactions can exceed the unit-test budget on hosted
// Windows runners. Keep their timeout bounded and opt in only Git integration cases.
export const GIT_INTEGRATION_TIMEOUT_MS = 30_000;
const CLEANUP_MAX_RETRIES = 5;
const CLEANUP_RETRY_DELAY_MS = 100;

export const describeGitIntegration = (name: string, tests: () => void): void => {
  describe(name, { timeout: GIT_INTEGRATION_TIMEOUT_MS }, tests);
};

export const itGitIntegration = (name: string, test: () => Promise<void>): void => {
  it(name, { timeout: GIT_INTEGRATION_TIMEOUT_MS }, test);
};

/** Test-only elapsed diagnostics. Never report argv, paths, output, errors or environment. */
export const gitIntegrationTiming = () => {
  const phases = new AsyncLocalStorage<string>();
  const started = performance.now();
  const commands = new Set([
    "init",
    "clone",
    "config",
    "remote",
    "add",
    "commit",
    "push",
    "fetch",
    "show",
    "rev-parse",
    "status",
    "symbolic-ref",
    "for-each-ref",
    "rev-list",
    "merge-base",
    "diff",
    "ls-files",
    "ls-tree",
    "cat-file",
    "merge",
    "checkout",
    "reset"
  ]);
  const totals = new Map<string, { count: number; durationMs: number }>();
  const pending = new Set<string>();
  const report = (event: string, fields: object = {}) => {
    console.info(
      "Graider Git integration timing",
      JSON.stringify({
        event,
        elapsedMs: Math.round(performance.now() - started),
        ...fields
      })
    );
  };
  return {
    git(argv: readonly string[]): () => void {
      const command = argv.find((arg) => commands.has(arg)) ?? "other";
      const key = `${phases.getStore() ?? "unscoped"}/${command}`;
      const began = performance.now();
      pending.add(key);
      return () => {
        pending.delete(key);
        const entry = totals.get(key) ?? { count: 0, durationMs: 0 };
        entry.count++;
        entry.durationMs += performance.now() - began;
        totals.set(key, entry);
      };
    },
    cleanup<T>(operation: () => T): T {
      const began = performance.now();
      try {
        return operation();
      } finally {
        const entry = totals.get("transaction-cleanup") ?? { count: 0, durationMs: 0 };
        entry.count++;
        entry.durationMs += performance.now() - began;
        totals.set("transaction-cleanup", entry);
      }
    },
    async phase<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const began = performance.now();
      const announce = !name.startsWith("remote-");
      if (announce) report("start", { phase: name });
      try {
        return await phases.run(name, operation);
      } finally {
        if (announce)
          report("finish", { phase: name, durationMs: Math.round(performance.now() - began) });
      }
    },
    finish(): void {
      report("summary", {
        git: Object.fromEntries(
          [...totals].map(([key, value]) => [
            key,
            {
              count: value.count,
              durationMs: Math.round(value.durationMs)
            }
          ])
        ),
        pending: [...pending]
      });
    }
  };
};

// Git processes have completed before cleanup; Windows may briefly retain handles.
// Node retries transient removal failures and still rejects persistent failures.
export const removeGitFixture = async (directory: string): Promise<void> => {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: CLEANUP_MAX_RETRIES,
    retryDelay: CLEANUP_RETRY_DELAY_MS
  });
};
