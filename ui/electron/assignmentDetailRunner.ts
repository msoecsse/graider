import { getGraiderCliStartError, type ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentDetailJsonResponse,
  AssignmentDetailRequest,
  AssignmentDetailResult,
  DashboardCommandError
} from "./ipc.js";
import { MAX_COMMAND_OUTPUT_SNIPPET_LENGTH } from "./dashboardRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

const GRAIDER_COMMAND = "graider";
const ASSIGNMENT_DETAIL_ARGS_PREFIX = ["assignment", "detail"] as const;
const JSON_FLAG = "--json";
const SUCCESS_EXIT_CODE = 0;
const DEFAULT_NOW = (): Date => new Date();

interface AssignmentDetailRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface AssignmentDetailCommandOptions extends AssignmentDetailRunnerOptions {
  readonly request: AssignmentDetailRequest;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAssignmentDetailJsonResponse = (
  value: unknown
): value is AssignmentDetailJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "assignment detail" &&
    typeof value.status === "string" &&
    typeof value.exitCode === "number" &&
    Array.isArray(value.diagnostics) &&
    Array.isArray(value.sections)
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

const parseAssignmentDetailJson = (stdout: string): AssignmentDetailJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isAssignmentDetailJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getResultStatus = (
  exitCode: number | null,
  detail: AssignmentDetailJsonResponse
): "success" | "failure" => {
  if (detail.status === "failure" || detail.status === "failed") {
    return "failure";
  }

  return exitCode === SUCCESS_EXIT_CODE || detail.status === "partial_success"
    ? "success"
    : "failure";
};

export const runAssignmentDetailCommand = async ({
  request,
  token,
  runner,
  env = process.env
}: AssignmentDetailCommandOptions): Promise<Omit<AssignmentDetailResult, "refreshedAt">> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...ASSIGNMENT_DETAIL_ARGS_PREFIX, request.assignmentFile, JSON_FLAG],
    cwd: request.courseFolderPath,
    env: token === null ? env : { ...env, [GITHUB_TOKEN_ENV_NAME]: token }
  });

  if (result.error !== null) {
    const cliStartError = getGraiderCliStartError(result.error.code);
    const code = cliStartError?.code ?? "assignment_detail_failed";
    const message = cliStartError?.message ?? "Graider assignment detail could not be started.";

    return {
      ...request,
      status: "failure",
      detail: null,
      error: createCommandError(code, message, null, result.stdout, result.stderr, token)
    };
  }

  const detail = parseAssignmentDetailJson(result.stdout);

  if (detail !== null) {
    return {
      ...request,
      status: getResultStatus(result.exitCode, detail),
      detail,
      error: null
    };
  }

  const errorCode =
    result.exitCode === SUCCESS_EXIT_CODE
      ? "invalid_assignment_detail_json"
      : "assignment_detail_failed";
  const errorMessage =
    errorCode === "invalid_assignment_detail_json"
      ? "Graider returned invalid assignment detail JSON."
      : "Graider assignment detail failed before returning usable JSON.";

  return {
    ...request,
    status: "failure",
    detail: null,
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

export const getAssignmentDetail = async (
  request: AssignmentDetailRequest,
  options: AssignmentDetailRunnerOptions
): Promise<AssignmentDetailResult> => {
  const tokenResult = await resolveGithubToken({
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const token = tokenResult.status === "success" ? tokenResult.token : null;
  const result = await runAssignmentDetailCommand({
    request,
    token,
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });

  return {
    ...result,
    refreshedAt: (options.now ?? DEFAULT_NOW)().toISOString()
  };
};
