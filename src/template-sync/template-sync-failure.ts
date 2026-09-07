import { GitHubClientError } from "../github/github-errors.js";

export type TemplateSyncFailureStage =
  | "template_clone_failed"
  | "student_clone_failed"
  | "template_checkout_failed"
  | "student_checkout_failed"
  | "patch_failed"
  | "commit_failed"
  | "push_failed"
  | "github_api_failed"
  | "permission_denied"
  | "invalid_repository";

export interface TemplateSyncFailure {
  readonly stage: TemplateSyncFailureStage;
  readonly message: string;
}

/** Keeps the raw cause internal while exposing only a fixed safe diagnostic. */
export class TemplateSyncOperationError extends Error {
  readonly templateSyncFailure: TemplateSyncFailure;

  constructor(failure: TemplateSyncFailure, cause: unknown) {
    super(failure.message, { cause });
    this.name = "TemplateSyncOperationError";
    this.templateSyncFailure = failure;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const createTemplateSyncOperationError = (
  stage: TemplateSyncFailureStage,
  message: string,
  cause: unknown
): TemplateSyncOperationError =>
  cause instanceof TemplateSyncOperationError
    ? cause
    : new TemplateSyncOperationError({ stage, message }, cause);

export const getTemplateSyncFailure = (error: unknown): TemplateSyncFailure | undefined => {
  if (error instanceof TemplateSyncOperationError) return error.templateSyncFailure;

  if (error instanceof GitHubClientError) {
    return error.kind === "permission_denied"
      ? {
          stage: "permission_denied",
          message: "GitHub denied access to the repository."
        }
      : {
          stage: "github_api_failed",
          message: "GitHub could not complete the repository operation."
        };
  }

  return undefined;
};

export const createGitHubTemplateSyncOperationError = (
  error: unknown
): TemplateSyncOperationError => {
  const failure = getTemplateSyncFailure(error) ?? {
    stage: "github_api_failed" as const,
    message: "GitHub could not complete the repository operation."
  };
  return new TemplateSyncOperationError(failure, error);
};
