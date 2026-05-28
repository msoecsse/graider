import { describe, expect, it } from "vitest";
import {
  GitHubClientError,
  createGitHubDiagnostic,
  isRetryableGitHubError
} from "../../../src/github/github-errors.js";
import { shouldRetryGitHubError } from "../../../src/github/github-retry.js";

const RETRY_AFTER_SECONDS = 30;

describe("GitHub errors", () => {
  it("maps auth missing errors to diagnostics", () => {
    const error = new GitHubClientError("auth_missing", "Missing token.");

    expect(error).toMatchObject({
      kind: "auth_missing",
      diagnosticCode: "github_auth_missing",
      retryable: false
    });
    expect(createGitHubDiagnostic(error)).toMatchObject({
      code: "github_auth_missing",
      severity: "error",
      message: "Missing token."
    });
  });

  it("marks transient GitHub errors as retryable", () => {
    const rateLimitError = new GitHubClientError("rate_limited", "Rate limited.", {
      retryAfterSeconds: RETRY_AFTER_SECONDS
    });
    const networkError = new GitHubClientError("network_error", "Network error.");

    expect(rateLimitError).toMatchObject({
      diagnosticCode: "github_rate_limited",
      retryAfterSeconds: RETRY_AFTER_SECONDS,
      retryable: true
    });
    expect(isRetryableGitHubError(rateLimitError)).toBe(true);
    expect(shouldRetryGitHubError(networkError)).toBe(true);
  });

  it("does not mark auth and permission errors as retryable", () => {
    const permissionError = new GitHubClientError("permission_denied", "Denied.");

    expect(permissionError).toMatchObject({
      diagnosticCode: "github_permission_denied",
      retryable: false
    });
    expect(isRetryableGitHubError(permissionError)).toBe(false);
    expect(shouldRetryGitHubError(permissionError)).toBe(false);
  });
});
