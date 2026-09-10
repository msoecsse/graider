import { describe, expect, it, vi } from "vitest";
import { waitForTemplateContentSha } from "../../../src/execution/template-content-wait.js";
import { GitHubClientError } from "../../../src/github/github-errors.js";

enum TestCount {
  SlowReads = 2,
  Attempts = 4,
  InitialBackoffMs = 1000,
  MaxBackoffMs = 2000
}

const BACKOFF_MULTIPLIER = 2;

const COMMIT_SHA = "abc123";
const noSleep = (): Promise<void> => Promise.resolve();
const waitOptions = { sleep: noSleep, maxAttempts: TestCount.Attempts };

const createEmptyThenReadyReader = (): (() => Promise<string | undefined>) => {
  let remaining: number = TestCount.SlowReads;

  return vi.fn(() => {
    if (remaining > 0) {
      remaining -= 1;

      return Promise.resolve(undefined);
    }

    return Promise.resolve(COMMIT_SHA);
  });
};

const createFailingThenReadyReader = (): (() => Promise<string | undefined>) => {
  let remaining: number = TestCount.SlowReads;

  return vi.fn(() => {
    if (remaining > 0) {
      remaining -= 1;

      return Promise.reject(new GitHubClientError("api_error", "GitHub API request failed."));
    }

    return Promise.resolve(COMMIT_SHA);
  });
};

describe("waitForTemplateContentSha", () => {
  it("returns the commit sha once template generation reports one", async () => {
    const readCommitSha = createEmptyThenReadyReader();

    await expect(waitForTemplateContentSha(readCommitSha, waitOptions)).resolves.toBe(COMMIT_SHA);
    expect(readCommitSha).toHaveBeenCalledTimes(TestCount.SlowReads + 1);
  });

  it("keeps waiting through the retryable failure an empty repository returns", async () => {
    await expect(
      waitForTemplateContentSha(createFailingThenReadyReader(), waitOptions)
    ).resolves.toBe(COMMIT_SHA);
  });

  it("rethrows a non-retryable failure without waiting", async () => {
    const readCommitSha = vi.fn(() =>
      Promise.reject(new GitHubClientError("permission_denied", "GitHub permission was denied."))
    );

    await expect(waitForTemplateContentSha(readCommitSha, waitOptions)).rejects.toThrow(
      GitHubClientError
    );
    expect(readCommitSha).toHaveBeenCalledTimes(1);
  });

  it("gives up and reports no baseline when the repository never reports a commit", async () => {
    const readCommitSha = vi.fn(() => Promise.resolve(undefined));

    await expect(waitForTemplateContentSha(readCommitSha, waitOptions)).resolves.toBeUndefined();
    expect(readCommitSha).toHaveBeenCalledTimes(TestCount.Attempts);
  });

  it("surfaces the underlying failure when a retryable error never clears", async () => {
    const readCommitSha = vi.fn(() =>
      Promise.reject(new GitHubClientError("rate_limited", "GitHub rate limit was reached."))
    );

    await expect(waitForTemplateContentSha(readCommitSha, waitOptions)).rejects.toThrow(
      "GitHub rate limit was reached."
    );
    expect(readCommitSha).toHaveBeenCalledTimes(TestCount.Attempts);
  });

  it("backs off between attempts instead of hammering GitHub", async () => {
    const delays: number[] = [];
    const sleep = (milliseconds: number): Promise<void> => {
      delays.push(milliseconds);

      return Promise.resolve();
    };

    await waitForTemplateContentSha(() => Promise.resolve(undefined), {
      sleep,
      maxAttempts: TestCount.Attempts,
      initialBackoffMs: TestCount.InitialBackoffMs,
      backoffMultiplier: BACKOFF_MULTIPLIER,
      maxBackoffMs: TestCount.MaxBackoffMs
    });

    expect(delays).toEqual([
      TestCount.InitialBackoffMs,
      TestCount.MaxBackoffMs,
      TestCount.MaxBackoffMs
    ]);
  });
});
