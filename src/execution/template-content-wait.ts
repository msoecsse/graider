import { GitHubClientError, isRetryableGitHubError } from "../github/github-errors.js";
import type { SleepFunction } from "../github/github-retry.js";

/**
 * GitHub copies template content asynchronously, so a repository created from a template can
 * report no commits — or answer commit lookups with `409 Git Repository is empty` — for several
 * seconds. The generic request retry is tuned for transient transport failures and gives up in
 * well under a second, which is far too fast to outlast template generation.
 */
export const DEFAULT_TEMPLATE_CONTENT_ATTEMPTS = 10;
export const DEFAULT_TEMPLATE_CONTENT_INITIAL_BACKOFF_MS = 1000;
export const DEFAULT_TEMPLATE_CONTENT_BACKOFF_MULTIPLIER = 2;
export const DEFAULT_TEMPLATE_CONTENT_MAX_BACKOFF_MS = 4000;

const FIRST_ATTEMPT = 1;

export interface TemplateContentWaitOptions {
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  sleep: SleepFunction;
}

const defaultSleep: SleepFunction = async (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const normalizeOptions = (
  options: Partial<TemplateContentWaitOptions> = {}
): TemplateContentWaitOptions => ({
  maxAttempts: DEFAULT_TEMPLATE_CONTENT_ATTEMPTS,
  initialBackoffMs: DEFAULT_TEMPLATE_CONTENT_INITIAL_BACKOFF_MS,
  backoffMultiplier: DEFAULT_TEMPLATE_CONTENT_BACKOFF_MULTIPLIER,
  maxBackoffMs: DEFAULT_TEMPLATE_CONTENT_MAX_BACKOFF_MS,
  sleep: defaultSleep,
  ...options
});

/** An empty repository answers with a retryable API error until generation finishes. */
const isNotReadyYet = (error: unknown): error is GitHubClientError =>
  error instanceof GitHubClientError && isRetryableGitHubError(error);

/**
 * Polls until the newly generated repository reports a commit on its default branch.
 *
 * Returns the commit sha, or `undefined` when the repository is still reporting no commits after
 * the final attempt. A non-retryable failure (bad credentials, permissions) is rethrown at once,
 * and a retryable failure that never clears is rethrown after the final attempt so the caller
 * reports the real cause instead of a bare "no baseline".
 */
export const waitForTemplateContentSha = async (
  readCommitSha: () => Promise<string | undefined>,
  options?: Partial<TemplateContentWaitOptions>
): Promise<string | undefined> => {
  const { maxAttempts, initialBackoffMs, backoffMultiplier, maxBackoffMs, sleep } =
    normalizeOptions(options);
  let nextBackoffMs = initialBackoffMs;

  for (let attempt = FIRST_ATTEMPT; attempt <= maxAttempts; attempt += 1) {
    const isFinalAttempt = attempt >= maxAttempts;

    try {
      const commitSha = await readCommitSha();

      if (commitSha !== undefined) {
        return commitSha;
      }

      if (isFinalAttempt) {
        return undefined;
      }
    } catch (error: unknown) {
      if (!isNotReadyYet(error) || isFinalAttempt) {
        throw error;
      }
    }

    await sleep(nextBackoffMs);
    nextBackoffMs = Math.min(nextBackoffMs * backoffMultiplier, maxBackoffMs);
  }

  return undefined;
};
