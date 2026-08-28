import { getGraiderCliStartError, type ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentApplyJsonResponse,
  AssignmentApplyRequest,
  AssignmentApplyResult,
  DashboardCommandError
} from "./ipc.js";
import { MAX_COMMAND_OUTPUT_SNIPPET_LENGTH } from "./dashboardRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

const GRAIDER_COMMAND = "graider";
const ASSIGNMENT_APPLY_ARGS_PREFIX = ["assignment", "apply"] as const;
const JSON_FLAG = "--json";
const YES_FLAG = "--yes";
const SUCCESS_EXIT_CODE = 0;
const DEFAULT_NOW = (): Date => new Date();

interface AssignmentApplyRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface AssignmentApplyCommandOptions extends AssignmentApplyRunnerOptions {
  readonly request: AssignmentApplyRequest;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAssignmentApplyJsonResponse = (
  value: unknown
): value is AssignmentApplyJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "assignment apply" &&
    typeof value.assignmentFile === "string" &&
    typeof value.status === "string" &&
    typeof value.exitCode === "number" &&
    Array.isArray(value.diagnostics) &&
    Array.isArray(value.warnings) &&
    Array.isArray(value.errors) &&
    Array.isArray(value.generatedFiles) &&
    isRecord(value.summary)
  );
};

const redactToken = (value: string, token: string | null): string => {
  if (token === null || token.length === 0) {
    return value;
  }

  return value.replaceAll(token, "[redacted]");
};

const createOutputSnippet = (value: string, token: string | null): string | null => {
  const redactedValue = redactToken(value, token);

  if (redactedValue.length === 0) {
    return null;
  }

  return redactedValue.slice(0, MAX_COMMAND_OUTPUT_SNIPPET_LENGTH);
};

const createCommandError = (
  code: string,
  message: string,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  token: string | null
): DashboardCommandError => ({
  code,
  message,
  exitCode,
  stdoutSnippet: createOutputSnippet(stdout, token),
  stderrSnippet: createOutputSnippet(stderr, token)
});

const parseAssignmentApplyJson = (stdout: string): AssignmentApplyJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isAssignmentApplyJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getResultStatus = (
  exitCode: number | null,
  apply: AssignmentApplyJsonResponse
): "success" | "failure" => {
  if (apply.status === "failure" || apply.status === "failed") {
    return "failure";
  }

  return exitCode === SUCCESS_EXIT_CODE || apply.status === "partial_success"
    ? "success"
    : "failure";
};

export const runAssignmentApplyCommand = async ({
  request,
  token,
  runner,
  env = process.env
}: AssignmentApplyCommandOptions): Promise<Omit<AssignmentApplyResult, "appliedAt">> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...ASSIGNMENT_APPLY_ARGS_PREFIX, request.assignmentFile, JSON_FLAG, YES_FLAG],
    cwd: request.courseFolderPath,
    env: token === null ? env : { ...env, [GITHUB_TOKEN_ENV_NAME]: token }
  });

  if (result.error !== null) {
    const cliStartError = getGraiderCliStartError(result.error.code);
    const code = cliStartError?.code ?? "assignment_apply_failed";
    const message = cliStartError?.message ?? "Graider assignment apply could not be started.";

    return {
      ...request,
      status: "failure",
      apply: null,
      error: createCommandError(code, message, null, result.stdout, result.stderr, token)
    };
  }

  const apply = parseAssignmentApplyJson(result.stdout);

  if (apply !== null) {
    return {
      ...request,
      status: getResultStatus(result.exitCode, apply),
      apply,
      error: null
    };
  }

  const errorCode =
    result.exitCode === SUCCESS_EXIT_CODE
      ? "invalid_assignment_apply_json"
      : "assignment_apply_failed";
  const errorMessage =
    errorCode === "invalid_assignment_apply_json"
      ? "Graider returned invalid apply JSON."
      : "Graider assignment apply failed before returning usable JSON.";

  return {
    ...request,
    status: "failure",
    apply: null,
    error: createCommandError(
      errorCode,
      errorMessage,
      result.exitCode,
      result.stdout,
      result.stderr,
      token
    )
  };
};

export const applyAssignment = async (
  request: AssignmentApplyRequest,
  options: AssignmentApplyRunnerOptions
): Promise<AssignmentApplyResult> => {
  const tokenResult = await resolveGithubToken({
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const token = tokenResult.status === "success" ? tokenResult.token : null;
  const result = await runAssignmentApplyCommand({
    request,
    token,
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });

  return {
    ...result,
    appliedAt: (options.now ?? DEFAULT_NOW)().toISOString()
  };
};
