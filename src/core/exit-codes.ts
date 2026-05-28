import type { Diagnostic } from "../diagnostics/diagnostic.js";
import { DiagnosticCode } from "../diagnostics/error-catalog.js";
import type { CommandStatus } from "./command-result.js";

export enum ExitCode {
  Success = 0,
  CommandError = 1,
  PartialSuccess = 2,
  AuthenticationOrAuthorizationFailure = 3,
  GitHubOrNetworkFailure = 4,
  ConfigurationOrSchemaError = 5
}

export interface ExitCodeInput {
  status: CommandStatus;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const AUTHORIZATION_ERROR_CODES = new Set<string>([
  DiagnosticCode.GithubAuthMissing,
  DiagnosticCode.GithubAuthFailed,
  DiagnosticCode.GithubPermissionDenied
]);

const CONFIGURATION_ERROR_CODES = new Set<string>([
  DiagnosticCode.MissingRequiredFile,
  DiagnosticCode.InvalidYaml,
  DiagnosticCode.InvalidSchemaVersion,
  DiagnosticCode.MissingRequiredField,
  DiagnosticCode.InvalidTermCode,
  DiagnosticCode.AssignmentSlugMismatch,
  DiagnosticCode.TermCodeMismatch,
  DiagnosticCode.InvalidAssignmentType,
  DiagnosticCode.InvalidAssignmentStatus,
  DiagnosticCode.InvalidRepositoryVisibility,
  DiagnosticCode.InvalidPermission,
  DiagnosticCode.InvalidGradingConfig
]);

const GITHUB_ERROR_CODES = new Set<string>([
  DiagnosticCode.GithubApiError,
  DiagnosticCode.GithubNetworkError,
  DiagnosticCode.GithubRateLimited,
  DiagnosticCode.GithubTimeout
]);

const hasCodeInSet = (diagnostics: readonly Diagnostic[], codes: ReadonlySet<string>): boolean =>
  diagnostics.some((diagnostic) => codes.has(diagnostic.code));

export const resolveExitCode = ({ status, errors }: ExitCodeInput): ExitCode => {
  if (hasCodeInSet(errors, AUTHORIZATION_ERROR_CODES)) {
    return ExitCode.AuthenticationOrAuthorizationFailure;
  }

  if (hasCodeInSet(errors, CONFIGURATION_ERROR_CODES)) {
    return ExitCode.ConfigurationOrSchemaError;
  }

  if (hasCodeInSet(errors, GITHUB_ERROR_CODES)) {
    return ExitCode.GitHubOrNetworkFailure;
  }

  if (status === "partial_success") {
    return ExitCode.PartialSuccess;
  }

  if (errors.length > 0 || status === "failure") {
    return ExitCode.CommandError;
  }

  return ExitCode.Success;
};
