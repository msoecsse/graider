import { getGraiderCliStartError, type ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentGradeJsonResponse,
  AssignmentGradeRequest,
  AssignmentGradeResult,
  DashboardCommandError
} from "./ipc.js";
import { MAX_COMMAND_OUTPUT_SNIPPET_LENGTH } from "./dashboardRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

const GRAIDER_COMMAND = "graider";
const ASSIGNMENT_GRADE_ARGS_PREFIX = ["assignment", "grade"] as const;
const JSON_FLAG = "--json";
const ALL_FLAG = "--all";
const SUCCESS_EXIT_CODE = 0;
const DEFAULT_NOW = (): Date => new Date();

interface AssignmentGradeRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface AssignmentGradeCommandOptions extends AssignmentGradeRunnerOptions {
  readonly request: AssignmentGradeRequest;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAssignmentGradeJsonResponse = (
  value: unknown
): value is AssignmentGradeJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "assignment grade" &&
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

const parseAssignmentGradeJson = (stdout: string): AssignmentGradeJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isAssignmentGradeJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getResultStatus = (
  exitCode: number | null,
  grade: AssignmentGradeJsonResponse
): "success" | "failure" => {
  if (grade.status === "failure" || grade.status === "failed") {
    return "failure";
  }

  return exitCode === SUCCESS_EXIT_CODE || grade.status === "partial_success"
    ? "success"
    : "failure";
};

export const runAssignmentGradeCommand = async ({
  request,
  token,
  runner,
  env = process.env
}: AssignmentGradeCommandOptions): Promise<Omit<AssignmentGradeResult, "dispatchedAt">> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...ASSIGNMENT_GRADE_ARGS_PREFIX, request.assignmentFile, JSON_FLAG, ALL_FLAG],
    cwd: request.courseFolderPath,
    env: token === null ? env : { ...env, [GITHUB_TOKEN_ENV_NAME]: token }
  });

  if (result.error !== null) {
    const cliStartError = getGraiderCliStartError(result.error.code);
    const code = cliStartError?.code ?? "assignment_grade_failed";
    const message = cliStartError?.message ?? "Graider assignment grade could not be started.";

    return {
      ...request,
      status: "failure",
      grade: null,
      error: createCommandError(code, message, null, result.stdout, result.stderr, token)
    };
  }

  const grade = parseAssignmentGradeJson(result.stdout);

  if (grade !== null) {
    return {
      ...request,
      status: getResultStatus(result.exitCode, grade),
      grade,
      error: null
    };
  }

  const errorCode =
    result.exitCode === SUCCESS_EXIT_CODE
      ? "invalid_assignment_grade_json"
      : "assignment_grade_failed";
  const errorMessage =
    errorCode === "invalid_assignment_grade_json"
      ? "Graider returned invalid grade JSON."
      : "Graider assignment grade failed before returning usable JSON.";

  return {
    ...request,
    status: "failure",
    grade: null,
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

export const gradeAssignment = async (
  request: AssignmentGradeRequest,
  options: AssignmentGradeRunnerOptions
): Promise<AssignmentGradeResult> => {
  const tokenResult = await resolveGithubToken({
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const token = tokenResult.status === "success" ? tokenResult.token : null;
  const result = await runAssignmentGradeCommand({
    request,
    token,
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });

  return {
    ...result,
    dispatchedAt: (options.now ?? DEFAULT_NOW)().toISOString()
  };
};
