import { DiagnosticCode } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { redactString } from "../diagnostics/redaction.js";

export type GitHubErrorKind =
  | "auth_missing"
  | "auth_failed"
  | "permission_denied"
  | "rate_limited"
  | "network_error"
  | "api_error";

interface GitHubClientErrorOptions {
  retryAfterSeconds?: number;
}

const DIAGNOSTIC_CODE_BY_KIND = {
  auth_missing: DiagnosticCode.GithubAuthMissing,
  auth_failed: DiagnosticCode.GithubAuthFailed,
  permission_denied: DiagnosticCode.GithubPermissionDenied,
  rate_limited: DiagnosticCode.GithubRateLimited,
  network_error: DiagnosticCode.GithubNetworkError,
  api_error: DiagnosticCode.GithubApiError
} as const satisfies Record<GitHubErrorKind, string>;

const RETRYABLE_ERROR_KINDS = new Set<GitHubErrorKind>([
  "rate_limited",
  "network_error",
  "api_error"
]);

export class GitHubClientError extends Error {
  readonly kind: GitHubErrorKind;
  readonly diagnosticCode: string;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;

  constructor(kind: GitHubErrorKind, message: string, options?: GitHubClientErrorOptions) {
    super(redactString(message));
    this.name = "GitHubClientError";
    this.kind = kind;
    this.diagnosticCode = DIAGNOSTIC_CODE_BY_KIND[kind];
    this.retryable = RETRYABLE_ERROR_KINDS.has(kind);

    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const isRetryableGitHubError = (error: GitHubClientError): boolean => error.retryable;

export const createGitHubDiagnostic = (error: GitHubClientError): Diagnostic => ({
  code: error.diagnosticCode,
  severity: "error",
  message: error.message,
  context: {
    kind: error.kind,
    retryable: error.retryable,
    ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds })
  }
});
