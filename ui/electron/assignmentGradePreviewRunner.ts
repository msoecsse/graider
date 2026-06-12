import type { ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentGradePreviewJsonResponse,
  AssignmentGradePreviewRequest,
  AssignmentGradePreviewResult,
  DashboardCommandError
} from "./ipc.js";
import { MAX_COMMAND_OUTPUT_SNIPPET_LENGTH } from "./dashboardRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

const GRAIDER_COMMAND = "graider";
const ASSIGNMENT_GRADE_PREVIEW_ARGS_PREFIX = ["assignment", "grade-preview"] as const;
const JSON_FLAG = "--json";
const SUCCESS_EXIT_CODE = 0;
const DEFAULT_NOW = (): Date => new Date();

interface AssignmentGradePreviewRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface AssignmentGradePreviewCommandOptions extends AssignmentGradePreviewRunnerOptions {
  readonly request: AssignmentGradePreviewRequest;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAssignmentGradePreviewJsonResponse = (
  value: unknown
): value is AssignmentGradePreviewJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "assignment grade-preview" &&
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

const parseAssignmentGradePreviewJson = (
  stdout: string
): AssignmentGradePreviewJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isAssignmentGradePreviewJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getResultStatus = (
  exitCode: number | null,
  preview: AssignmentGradePreviewJsonResponse
): "success" | "failure" => {
  if (preview.status === "failure" || preview.status === "failed") {
    return "failure";
  }

  return exitCode === SUCCESS_EXIT_CODE || preview.status === "partial_success"
    ? "success"
    : "failure";
};

export const runAssignmentGradePreviewCommand = async ({
  request,
  token,
  runner,
  env = process.env
}: AssignmentGradePreviewCommandOptions): Promise<
  Omit<AssignmentGradePreviewResult, "refreshedAt">
> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...ASSIGNMENT_GRADE_PREVIEW_ARGS_PREFIX, request.assignmentFile, JSON_FLAG],
    cwd: request.courseFolderPath,
    env: token === null ? env : { ...env, [GITHUB_TOKEN_ENV_NAME]: token }
  });

  if (result.error !== null) {
    const code =
      result.error.code === "ENOENT" ? "graider_cli_not_found" : "assignment_grade_preview_failed";
    const message =
      code === "graider_cli_not_found"
        ? "Graider CLI not found. Install Graider or make sure graider is available on PATH."
        : "Graider assignment grade preview could not be started.";

    return {
      ...request,
      status: "failure",
      preview: null,
      error: createCommandError(code, message, null, result.stdout, result.stderr, token)
    };
  }

  const preview = parseAssignmentGradePreviewJson(result.stdout);

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
      ? "invalid_assignment_grade_preview_json"
      : "assignment_grade_preview_failed";
  const errorMessage =
    errorCode === "invalid_assignment_grade_preview_json"
      ? "Graider returned invalid grade preview JSON."
      : "Graider assignment grade preview failed before returning usable JSON.";

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

export const getAssignmentGradePreview = async (
  request: AssignmentGradePreviewRequest,
  options: AssignmentGradePreviewRunnerOptions
): Promise<AssignmentGradePreviewResult> => {
  const tokenResult = await resolveGithubToken({
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const token = tokenResult.status === "success" ? tokenResult.token : null;
  const result = await runAssignmentGradePreviewCommand({
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
