import { GitHubClientError, isRetryableGitHubError } from "./github-errors.js";
import { getGitHubRetryDelayMs } from "./github-rate-limit.js";

export const DEFAULT_GITHUB_RETRY_ATTEMPTS = 3;
export const DEFAULT_INITIAL_BACKOFF_MS = 250;
export const DEFAULT_BACKOFF_MULTIPLIER = 2;
export const DEFAULT_RETRY_AFTER_SECONDS = 1;

export interface GitHubRetryEvent {
  attempt: number;
  maxAttempts: number;
  diagnosticCode: string;
  retryAfterSeconds?: number;
  delayMs: number;
}

export type SleepFunction = (milliseconds: number) => Promise<void>;

export interface RetryOptions {
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  sleep: SleepFunction;
  onRetry?: (event: GitHubRetryEvent) => void;
}

const defaultSleep: SleepFunction = async (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const createDefaultRetryOptions = (): RetryOptions => ({
  maxAttempts: DEFAULT_GITHUB_RETRY_ATTEMPTS,
  initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS,
  backoffMultiplier: DEFAULT_BACKOFF_MULTIPLIER,
  sleep: defaultSleep
});

const normalizeRetryOptions = (options: Partial<RetryOptions> = {}): RetryOptions => ({
  ...createDefaultRetryOptions(),
  ...options
});

export const shouldRetryGitHubError = (error: GitHubClientError): boolean =>
  isRetryableGitHubError(error);

export const withGitHubRetry = async <T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> => {
  const retryOptions = normalizeRetryOptions(options);
  let nextBackoffMs = retryOptions.initialBackoffMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;

      if (!(error instanceof GitHubClientError) || !shouldRetryGitHubError(error)) {
        throw error;
      }

      if (attempt >= retryOptions.maxAttempts) {
        throw error;
      }

      const delayMs = getGitHubRetryDelayMs(error, nextBackoffMs);
      retryOptions.onRetry?.({
        attempt,
        maxAttempts: retryOptions.maxAttempts,
        diagnosticCode: error.diagnosticCode,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds }),
        delayMs
      });
      await retryOptions.sleep(delayMs);
      nextBackoffMs *= retryOptions.backoffMultiplier;
    }
  }

  throw lastError;
};
