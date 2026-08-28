import { getGraiderCliStartError, type ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentApplyPreviewJsonResponse,
  AssignmentApplyPreviewRequest,
  AssignmentApplyPreviewResult,
  DashboardCommandError
} from "./ipc.js";
import { MAX_COMMAND_OUTPUT_SNIPPET_LENGTH } from "./dashboardRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

const GRAIDER_COMMAND = "graider";
const ASSIGNMENT_APPLY_PREVIEW_ARGS_PREFIX = ["assignment", "apply-preview"] as const;
const JSON_FLAG = "--json";
const SUCCESS_EXIT_CODE = 0;
const DEFAULT_NOW = (): Date => new Date();

interface AssignmentApplyPreviewRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface AssignmentApplyPreviewCommandOptions extends AssignmentApplyPreviewRunnerOptions {
  readonly request: AssignmentApplyPreviewRequest;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAssignmentApplyPreviewJsonResponse = (
  value: unknown
): value is AssignmentApplyPreviewJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "assignment apply-preview" &&
    typeof value.status === "string" &&
    typeof value.exitCode === "number" &&
    Array.isArray(value.diagnostics)
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

const parseAssignmentApplyPreviewJson = (
  stdout: string
): AssignmentApplyPreviewJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isAssignmentApplyPreviewJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getResultStatus = (
  exitCode: number | null,
  preview: AssignmentApplyPreviewJsonResponse
): "success" | "failure" => {
  if (preview.status === "failure" || preview.status === "failed") {
    return "failure";
  }

  return exitCode === SUCCESS_EXIT_CODE || preview.status === "partial_success"
    ? "success"
    : "failure";
};

export const runAssignmentApplyPreviewCommand = async ({
  request,
  token,
  runner,
  env = process.env
}: AssignmentApplyPreviewCommandOptions): Promise<
  Omit<AssignmentApplyPreviewResult, "refreshedAt">
> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...ASSIGNMENT_APPLY_PREVIEW_ARGS_PREFIX, request.assignmentFile, JSON_FLAG],
    cwd: request.courseFolderPath,
    env: token === null ? env : { ...env, [GITHUB_TOKEN_ENV_NAME]: token }
  });

  if (result.error !== null) {
    const cliStartError = getGraiderCliStartError(result.error.code);
    const code = cliStartError?.code ?? "assignment_apply_preview_failed";
    const message =
      cliStartError?.message ?? "Graider assignment apply preview could not be started.";

    return {
      ...request,
      status: "failure",
      preview: null,
      error: createCommandError(code, message, null, result.stdout, result.stderr, token)
    };
  }

  const preview = parseAssignmentApplyPreviewJson(result.stdout);

  if (preview !== null) {
    return {
      ...request,
      status: getResultStatus(result.exitCode, preview),
      preview,
      error: null
    };
  }

  const errorCode =
    result.exitCode === SUCCESS_EXIT_CODE
      ? "invalid_assignment_apply_preview_json"
      : "assignment_apply_preview_failed";
  const errorMessage =
    errorCode === "invalid_assignment_apply_preview_json"
      ? "Graider returned invalid apply preview JSON."
      : "Graider assignment apply preview failed before returning usable JSON.";

  return {
    ...request,
    status: "failure",
    preview: null,
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

export const getAssignmentApplyPreview = async (
  request: AssignmentApplyPreviewRequest,
  options: AssignmentApplyPreviewRunnerOptions
): Promise<AssignmentApplyPreviewResult> => {
  const tokenResult = await resolveGithubToken({
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const token = tokenResult.status === "success" ? tokenResult.token : null;
  const result = await runAssignmentApplyPreviewCommand({
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
