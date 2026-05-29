import type { GitHubClientError } from "./github-errors.js";

const MILLISECONDS_PER_SECOND = 1000;

export const retryAfterSecondsToMilliseconds = (seconds: number): number =>
  seconds * MILLISECONDS_PER_SECOND;

export const getGitHubRetryDelayMs = (error: GitHubClientError, fallbackDelayMs: number): number =>
  error.retryAfterSeconds === undefined
    ? fallbackDelayMs
    : retryAfterSecondsToMilliseconds(error.retryAfterSeconds);
