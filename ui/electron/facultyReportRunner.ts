import type { ProcessRunner } from "./commandRunner.js";
import type {
  DashboardCommandError,
  FacultyReportJsonResponse,
  FacultyReportRequest,
  FacultyReportResult
} from "./ipc.js";
import { MAX_COMMAND_OUTPUT_SNIPPET_LENGTH } from "./dashboardRunner.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

const GRAIDER_COMMAND = "graider";
const REPORT_ARGS_PREFIX = ["report"] as const;
const JSON_FLAG = "--json";
const SUCCESS_EXIT_CODE = 0;
const DEFAULT_NOW = (): Date => new Date();

interface FacultyReportRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface FacultyReportCommandOptions extends FacultyReportRunnerOptions {
  readonly request: FacultyReportRequest;
  readonly token: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isFacultyReportJsonResponse = (value: unknown): value is FacultyReportJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "report" &&
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

const parseFacultyReportJson = (stdout: string): FacultyReportJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isFacultyReportJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getResultStatus = (
  exitCode: number | null,
  report: FacultyReportJsonResponse
): "success" | "failure" => {
  if (report.status === "failure" || report.status === "failed") {
    return "failure";
  }

  return exitCode === SUCCESS_EXIT_CODE || report.status === "partial_success"
    ? "success"
    : "failure";
};

export const runFacultyReportCommand = async ({
  request,
  token,
  runner,
  env = process.env
}: FacultyReportCommandOptions): Promise<Omit<FacultyReportResult, "refreshedAt">> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...REPORT_ARGS_PREFIX, request.assignmentFile, JSON_FLAG],
    cwd: request.courseFolderPath,
    env: token === null ? env : { ...env, [GITHUB_TOKEN_ENV_NAME]: token }
  });

  if (result.error !== null) {
    const code = result.error.code === "ENOENT" ? "graider_cli_not_found" : "faculty_report_failed";
    const message =
      code === "graider_cli_not_found"
        ? "Graider CLI not found. Install Graider or make sure graider is available on PATH."
        : "Graider report could not be started.";

    return {
      ...request,
      status: "failure",
      report: null,
      error: createCommandError(code, message, null, result.stdout, result.stderr, token)
    };
  }

  const report = parseFacultyReportJson(result.stdout);

  if (report !== null) {
    return {
      ...request,
      status: getResultStatus(result.exitCode, report),
      report,
      error: null
    };
  }

  const errorCode =
    result.exitCode === SUCCESS_EXIT_CODE ? "invalid_faculty_report_json" : "faculty_report_failed";
  const errorMessage =
    errorCode === "invalid_faculty_report_json"
      ? "Graider returned invalid faculty report JSON."
      : "Graider report failed before returning usable JSON.";

  return {
    ...request,
    status: "failure",
    report: null,
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

export const getFacultyReport = async (
  request: FacultyReportRequest,
  options: FacultyReportRunnerOptions
): Promise<FacultyReportResult> => {
  const tokenResult = await resolveGithubToken({
    runner: options.runner,
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const token = tokenResult.status === "success" ? tokenResult.token : null;
  const result = await runFacultyReportCommand({
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
