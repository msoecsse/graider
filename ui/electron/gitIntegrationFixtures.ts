import { rm } from "node:fs/promises";
import { it } from "vitest";

// Multi-repository Git transactions can exceed the unit-test budget on hosted
// Windows runners. Keep their timeout bounded and opt in only measured cases.
const GIT_INTEGRATION_TIMEOUT_MS = 30_000;
const CLEANUP_MAX_RETRIES = 5;
const CLEANUP_RETRY_DELAY_MS = 100;

export const itGitIntegration = (name: string, test: () => Promise<void>): void => {
  it(name, { timeout: GIT_INTEGRATION_TIMEOUT_MS }, test);
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
