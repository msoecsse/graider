import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

/**
 * Creates temp roots and removes them after each test.
 *
 * Without this the git-driven suites left a temp git repository behind per test -- hundreds of
 * them accumulate across runs, which is both untidy and a plausible source of the intermittent
 * Windows failures these suites show under load. `rm` is asked to retry because cleanup can race
 * a Git child process that still holds a handle (`EBUSY`), and a temp directory that refuses to
 * go away must never fail the test that created it.
 */
const REMOVE_MAX_RETRIES = 10;
const REMOVE_RETRY_DELAY_MS = 50;

const trackedRoots: string[] = [];

export const createTrackedTempRoot = (prefix: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  trackedRoots.push(root);

  return root;
};

afterEach(() => {
  for (const root of trackedRoots.splice(0)) {
    try {
      fs.rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: REMOVE_MAX_RETRIES,
        retryDelay: REMOVE_RETRY_DELAY_MS
      });
    } catch {
      // Leaving one directory behind is not worth failing a passing test over.
    }
  }
});
