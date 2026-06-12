import { getGraiderCliStartError, type ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentGradeStatusJsonResponse,
  AssignmentGradeStatusRequest,
  AssignmentGradeStatusResult,
  DashboardCommandError
} from "./ipc.js";
import { MAX_COMMAND_OUTPUT_SNIPPET_LENGTH } from "./dashboardRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

const GRAIDER_COMMAND = "graider";
const ASSIGNMENT_GRADE_STATUS_ARGS_PREFIX = ["assignment", "grade-status"] as const;
const JSON_FLAG = "--json";
const STUDENT_FLAG = "--student";
const STUDENTS_FLAG = "--students";
const SUCCESS_EXIT_CODE = 0;
const SINGLE_STUDENT_COUNT = 1;
const DEFAULT_NOW = (): Date => new Date();

interface AssignmentGradeStatusRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface AssignmentGradeStatusCommandOptions extends AssignmentGradeStatusRunnerOptions {
  readonly request: AssignmentGradeStatusRequest;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAssignmentGradeStatusJsonResponse = (
  value: unknown
): value is AssignmentGradeStatusJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "assignment grade-status" &&
    typeof value.status === "string" &&
    typeof value.exitCode === "number" &&
    Array.isArray(value.diagnostics) &&
    Array.isArray(value.repositories)
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

const parseAssignmentGradeStatusJson = (
  stdout: string
): AssignmentGradeStatusJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isAssignmentGradeStatusJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getResultStatus = (
  exitCode: number | null,
  gradeStatus: AssignmentGradeStatusJsonResponse
): "success" | "failure" => {
  if (gradeStatus.status === "failure" || gradeStatus.status === "failed") {
    return "failure";
  }

  return exitCode === SUCCESS_EXIT_CODE || gradeStatus.status === "partial_success"
    ? "success"
    : "failure";
};

const buildGradeStatusArgs = (request: AssignmentGradeStatusRequest): string[] => {
  const studentIds = request.studentIds?.filter((studentId) => studentId.trim().length > 0) ?? [];

  if (studentIds.length === SINGLE_STUDENT_COUNT) {
    return [
      ...ASSIGNMENT_GRADE_STATUS_ARGS_PREFIX,
      request.assignmentFile,
      STUDENT_FLAG,
      studentIds[0] ?? "",
      JSON_FLAG
    ];
  }

  if (studentIds.length > SINGLE_STUDENT_COUNT) {
    return [
      ...ASSIGNMENT_GRADE_STATUS_ARGS_PREFIX,
      request.assignmentFile,
      STUDENTS_FLAG,
      studentIds.join(","),
      JSON_FLAG
    ];
  }

  return [...ASSIGNMENT_GRADE_STATUS_ARGS_PREFIX, request.assignmentFile, JSON_FLAG];
};

export const runAssignmentGradeStatusCommand = async ({
  request,
  token,
  runner,
  env = process.env
}: AssignmentGradeStatusCommandOptions): Promise<
  Omit<AssignmentGradeStatusResult, "refreshedAt">
> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: buildGradeStatusArgs(request),
    cwd: request.courseFolderPath,
    env: token === null ? env : { ...env, [GITHUB_TOKEN_ENV_NAME]: token }
  });

  if (result.error !== null) {
    const cliStartError = getGraiderCliStartError(result.error.code);
    const code = cliStartError?.code ?? "assignment_grade_status_failed";
    const message =
      cliStartError?.message ?? "Graider assignment grade status could not be started.";

    return {
      ...request,
      status: "failure",
      gradeStatus: null,
      error: createCommandError(code, message, null, result.stdout, result.stderr, token)
    };
  }

  const gradeStatus = parseAssignmentGradeStatusJson(result.stdout);

  if (gradeStatus !== null) {
    return {
      ...request,
      status: getResultStatus(result.exitCode, gradeStatus),
      gradeStatus,
      error: null
    };
  }

  const errorCode =
    result.exitCode === SUCCESS_EXIT_CODE
      ? "invalid_assignment_grade_status_json"
      : "assignment_grade_status_failed";
  const errorMessage =
    errorCode === "invalid_assignment_grade_status_json"
      ? "Graider returned invalid grade status JSON."
      : "Graider assignment grade status failed before returning usable JSON.";

  return {
    ...request,
    status: "failure",
    gradeStatus: null,
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

export const getAssignmentGradeStatus = async (
  request: AssignmentGradeStatusRequest,
  options: AssignmentGradeStatusRunnerOptions
): Promise<AssignmentGradeStatusResult> => {
  const tokenResult = await resolveGithubToken({
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const token = tokenResult.status === "success" ? tokenResult.token : null;
  const result = await runAssignmentGradeStatusCommand({
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
