import { DiagnosticCode } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { redactString } from "../diagnostics/redaction.js";

export type GitHubErrorKind =
  | "auth_missing"
  | "auth_failed"
  | "permission_denied"
  | "rate_limited"
  | "network_error"
  | "api_error"
  | "timeout";

interface GitHubClientErrorOptions {
  retryAfterSeconds?: number;
  /** HTTP status GitHub returned, kept so an opaque failure names its own cause. */
  status?: number;
  /** GitHub's own error text, redacted before it reaches a diagnostic. */
  githubMessage?: string;
}

const DIAGNOSTIC_CODE_BY_KIND = {
  auth_missing: DiagnosticCode.GithubAuthMissing,
  auth_failed: DiagnosticCode.GithubAuthFailed,
  permission_denied: DiagnosticCode.GithubPermissionDenied,
  rate_limited: DiagnosticCode.GithubRateLimited,
  network_error: DiagnosticCode.GithubNetworkError,
  api_error: DiagnosticCode.GithubApiError,
  timeout: DiagnosticCode.GithubNetworkError
} as const satisfies Record<GitHubErrorKind, string>;

const RETRYABLE_ERROR_KINDS = new Set<GitHubErrorKind>([
  "rate_limited",
  "network_error",
  "api_error",
  "timeout"
]);

export class GitHubClientError extends Error {
  readonly kind: GitHubErrorKind;
  readonly diagnosticCode: string;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;
  readonly status?: number;
  readonly githubMessage?: string;

  constructor(kind: GitHubErrorKind, message: string, options?: GitHubClientErrorOptions) {
    super(redactString(message));
    this.name = "GitHubClientError";
    this.kind = kind;
    this.diagnosticCode = DIAGNOSTIC_CODE_BY_KIND[kind];
    this.retryable = RETRYABLE_ERROR_KINDS.has(kind);

    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }

    if (options?.status !== undefined) {
      this.status = options.status;
    }

    if (options?.githubMessage !== undefined) {
      this.githubMessage = redactString(options.githubMessage);
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const isRetryableGitHubError = (error: GitHubClientError): boolean => error.retryable;

/** "GitHub API request failed." on its own is unactionable; the status and GitHub's text are not. */
const describeGitHubError = (error: GitHubClientError): string => {
  const details = [
    ...(error.status === undefined ? [] : [String(error.status)]),
    ...(error.githubMessage === undefined || error.githubMessage === error.message
      ? []
      : [error.githubMessage])
  ];

  return details.length === 0 ? error.message : `${error.message} (${details.join(": ")})`;
};

export const createGitHubDiagnostic = (error: GitHubClientError): Diagnostic => ({
  code: error.diagnosticCode,
  severity: "error",
  message: describeGitHubError(error),
  context: {
    kind: error.kind,
    retryable: error.retryable,
    ...(error.status === undefined ? {} : { status: error.status }),
    ...(error.githubMessage === undefined ? {} : { githubMessage: error.githubMessage }),
    ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds })
  }
});
