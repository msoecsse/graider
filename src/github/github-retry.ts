import type { GitHubClientError } from "./github-errors.js";
import { isRetryableGitHubError } from "./github-errors.js";

export const shouldRetryGitHubError = (error: GitHubClientError): boolean =>
  isRetryableGitHubError(error);
