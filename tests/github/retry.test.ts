import { describe, expect, it } from "vitest";
import { DiagnosticCode } from "../../src/diagnostics/error-catalog.js";
import { GitHubClientError } from "../../src/github/github-errors.js";
import {
  DEFAULT_GITHUB_RETRY_ATTEMPTS,
  DEFAULT_INITIAL_BACKOFF_MS,
  DEFAULT_RETRY_AFTER_SECONDS,
  withGitHubRetry
} from "../../src/github/github-retry.js";

const SINGLE_ATTEMPT = 1;
const SINGLE_RETRY_SUCCESS_ATTEMPTS = 2;
const EXHAUSTED_ATTEMPTS = 3;
const RETRY_AFTER_DELAY_MS = 1000;
const SECOND_BACKOFF_DELAY_MS = 500;

const settle = async (): Promise<void> => {
  await Promise.resolve();
};

const createSleepRecorder = () => {
  const delays: number[] = [];

  return {
    delays,
    sleep: (milliseconds: number): Promise<void> => {
      delays.push(milliseconds);

      return Promise.resolve();
    }
  };
};

describe("GitHub retry helper", () => {
  it("retries github_api_error and succeeds", async () => {
    const sleepRecorder = createSleepRecorder();
    let attempts = 0;

    const result = await withGitHubRetry(
      async () => {
        await settle();
        attempts += 1;

        if (attempts < SINGLE_RETRY_SUCCESS_ATTEMPTS) {
          throw new GitHubClientError("api_error", "temporary API failure");
        }

        return "ok";
      },
      { sleep: sleepRecorder.sleep }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(SINGLE_RETRY_SUCCESS_ATTEMPTS);
    expect(sleepRecorder.delays).toEqual([DEFAULT_INITIAL_BACKOFF_MS]);
  });

  it("retries github_network_error", async () => {
    const sleepRecorder = createSleepRecorder();
    let attempts = 0;

    await withGitHubRetry(
      async () => {
        await settle();
        attempts += 1;

        if (attempts < SINGLE_RETRY_SUCCESS_ATTEMPTS) {
          throw new GitHubClientError("network_error", "temporary network failure");
        }
      },
      { sleep: sleepRecorder.sleep }
    );

    expect(attempts).toBe(SINGLE_RETRY_SUCCESS_ATTEMPTS);
  });

  it("retries github_rate_limited", async () => {
    const sleepRecorder = createSleepRecorder();
    let attempts = 0;

    await withGitHubRetry(
      async () => {
        await settle();
        attempts += 1;

        if (attempts < SINGLE_RETRY_SUCCESS_ATTEMPTS) {
          throw new GitHubClientError("rate_limited", "rate limited");
        }
      },
      { sleep: sleepRecorder.sleep }
    );

    expect(attempts).toBe(SINGLE_RETRY_SUCCESS_ATTEMPTS);
  });

  it("does not retry github_permission_denied", async () => {
    const sleepRecorder = createSleepRecorder();
    let attempts = 0;

    await expect(
      withGitHubRetry(
        async () => {
          await settle();
          attempts += 1;
          throw new GitHubClientError("permission_denied", "permission denied");
        },
        { sleep: sleepRecorder.sleep }
      )
    ).rejects.toMatchObject({ diagnosticCode: DiagnosticCode.GithubPermissionDenied });

    expect(attempts).toBe(SINGLE_ATTEMPT);
    expect(sleepRecorder.delays).toEqual([]);
  });

  it("does not retry github_auth_failed", async () => {
    const sleepRecorder = createSleepRecorder();
    let attempts = 0;

    await expect(
      withGitHubRetry(
        async () => {
          await settle();
          attempts += 1;
          throw new GitHubClientError("auth_failed", "auth failed");
        },
        { sleep: sleepRecorder.sleep }
      )
    ).rejects.toMatchObject({ diagnosticCode: DiagnosticCode.GithubAuthFailed });

    expect(attempts).toBe(SINGLE_ATTEMPT);
  });

  it("stops after max attempts and preserves the canonical diagnostic code", async () => {
    const sleepRecorder = createSleepRecorder();
    let attempts = 0;

    await expect(
      withGitHubRetry(
        async () => {
          await settle();
          attempts += 1;
          throw new GitHubClientError("api_error", "persistent API failure");
        },
        { sleep: sleepRecorder.sleep }
      )
    ).rejects.toMatchObject({ diagnosticCode: DiagnosticCode.GithubApiError });

    expect(attempts).toBe(DEFAULT_GITHUB_RETRY_ATTEMPTS);
  });

  it("honors retry-after delay when present", async () => {
    const sleepRecorder = createSleepRecorder();
    let attempts = 0;

    await withGitHubRetry(
      async () => {
        await settle();
        attempts += 1;

        if (attempts < SINGLE_RETRY_SUCCESS_ATTEMPTS) {
          throw new GitHubClientError("rate_limited", "rate limited", {
            retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS
          });
        }
      },
      { sleep: sleepRecorder.sleep }
    );

    expect(sleepRecorder.delays).toEqual([RETRY_AFTER_DELAY_MS]);
  });

  it("uses exponential backoff when retry-after is absent", async () => {
    const sleepRecorder = createSleepRecorder();

    await expect(
      withGitHubRetry(
        async () => {
          await settle();
          throw new GitHubClientError("network_error", "network failure");
        },
        { sleep: sleepRecorder.sleep }
      )
    ).rejects.toBeInstanceOf(GitHubClientError);

    expect(sleepRecorder.delays).toEqual([DEFAULT_INITIAL_BACKOFF_MS, SECOND_BACKOFF_DELAY_MS]);
  });

  it("emits retry events through callback", async () => {
    const sleepRecorder = createSleepRecorder();
    const diagnosticCodes: string[] = [];
    let attempts = 0;

    await withGitHubRetry(
      async () => {
        await settle();
        attempts += 1;

        if (attempts < SINGLE_RETRY_SUCCESS_ATTEMPTS) {
          throw new GitHubClientError("api_error", "temporary API failure");
        }
      },
      {
        sleep: sleepRecorder.sleep,
        onRetry: (event) => {
          diagnosticCodes.push(event.diagnosticCode);
        }
      }
    );

    expect(diagnosticCodes).toEqual([DiagnosticCode.GithubApiError]);
  });

  it("calls the injected sleep function for every retry", async () => {
    const sleepRecorder = createSleepRecorder();

    await expect(
      withGitHubRetry(
        async () => {
          await settle();
          throw new GitHubClientError("api_error", "persistent API failure");
        },
        { sleep: sleepRecorder.sleep }
      )
    ).rejects.toBeInstanceOf(GitHubClientError);

    expect(sleepRecorder.delays).toHaveLength(EXHAUSTED_ATTEMPTS - SINGLE_ATTEMPT);
  });
});
