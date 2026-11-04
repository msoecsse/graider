import { rm } from "node:fs/promises";
import { describe } from "vitest";

// Multi-repository Git/filesystem integration cases spawn many sequential processes.
// Hosted Windows runners can exceed the 5s unit-test budget; 30s still bounds hangs.
export const GIT_INTEGRATION_TIMEOUT_MS = 30_000;
export const describeGitIntegration = (name: string, tests: () => void) =>
  describe(name, { timeout: GIT_INTEGRATION_TIMEOUT_MS }, tests);

const CLEANUP_MAX_RETRIES = 5;
const CLEANUP_RETRY_DELAY_MS = 100;

// Call only after awaited Git operations finish. Retry transient Windows handles
// for at most 1.5s; persistent cleanup failures still reject and fail the test.
export const removeGitFixture = async (directory: string): Promise<void> => {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: CLEANUP_MAX_RETRIES,
    retryDelay: CLEANUP_RETRY_DELAY_MS
  });
};
