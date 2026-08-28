import {
  getGraiderCliStartError,
  type ProcessRunRequest,
  type ProcessRunResult,
  type ProcessRunner
} from "./commandRunner.js";
import {
  loadCourseRegistry,
  saveCourseRegistry,
  updateCourseFolderRefreshState
} from "./courseRegistry.js";
import type {
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord,
  DashboardCommandError,
  DashboardJsonResponse
} from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

export const MAX_COMMAND_OUTPUT_SNIPPET_LENGTH = 4000;

const GRAIDER_COMMAND = "graider";
const DASHBOARD_ARGS = ["dashboard", "--json"] as const;
const SUCCESS_EXIT_CODE = 0;
const DEBUG_ENV_NAME = "GRAIDER_UI_DEBUG";
const DEBUG_ENABLED_VALUE = "1";

interface DashboardRunnerOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface DashboardCommandOptions extends DashboardRunnerOptions {
  readonly courseFolder: CourseFolderRecord;
  readonly token: string;
}

type DashboardCommandResult = Omit<CourseFolderDashboardResult, "refreshedAt">;

const DEFAULT_NOW = (): Date => new Date();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isDashboardJsonResponse = (value: unknown): value is DashboardJsonResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.commandName === "dashboard" &&
    typeof value.status === "string" &&
    typeof value.exitCode === "number" &&
    Array.isArray(value.diagnostics) &&
    isRecord(value.summary) &&
    Array.isArray(value.cards)
  );
};

const redactToken = (value: string, token: string): string => {
  if (token.length === 0) {
    return value;
  }

  return value.replaceAll(token, "[redacted]");
};

const redactTokenLikeValues = (value: string): string =>
  value
    .replace(/authorization:\s*bearer\s+[^\s]+/giu, "Authorization: Bearer [redacted]")
    .replace(/GRAIDER_GITHUB_TOKEN\s*[:=]\s*[^\s]+/gu, "GRAIDER_GITHUB_TOKEN=[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/gu, "[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/gu, "[redacted]");

const sanitizeOutput = (value: string, token: string): string =>
  redactTokenLikeValues(redactToken(value, token));

const createOutputSnippet = (value: string, token: string): string | null => {
  const redactedValue = sanitizeOutput(value, token);

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
  token: string,
  request: ProcessRunRequest,
  result: ProcessRunResult
): DashboardCommandError => ({
  code,
  message,
  exitCode,
  stdoutSnippet: createOutputSnippet(stdout, token),
  stderrSnippet: createOutputSnippet(stderr, token),
  commandName: "dashboard",
  cwd: result.diagnostic?.cwd ?? request.cwd,
  argv: [request.command, ...request.args],
  runnerMode: result.diagnostic?.runnerMode,
  executablePath: result.diagnostic?.executablePath,
  helperPath: result.diagnostic?.helperPath,
  signal: result.signal ?? null
});

const isDebugEnabled = (env: NodeJS.ProcessEnv): boolean =>
  env[DEBUG_ENV_NAME]?.trim() === DEBUG_ENABLED_VALUE;

const logDashboardDebug = (
  env: NodeJS.ProcessEnv,
  request: ProcessRunRequest,
  result: ProcessRunResult,
  token: string
): void => {
  if (!isDebugEnabled(env)) {
    return;
  }

  const debugFields = {
    commandName: "dashboard",
    cwd: result.diagnostic?.cwd ?? request.cwd ?? null,
    runnerMode: result.diagnostic?.runnerMode ?? null,
    executablePath: result.diagnostic?.executablePath ?? null,
    helperPath: result.diagnostic?.helperPath ?? null,
    argv: [request.command, ...request.args],
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    stdoutSnippet: createOutputSnippet(result.stdout, token),
    stderrSnippet: createOutputSnippet(result.stderr, token)
  };

  console.error(`[graider-ui] Dashboard command: ${JSON.stringify(debugFields)}`);
};

const createFailureResult = (
  courseFolderId: string,
  courseFolderPath: string,
  error: DashboardCommandError,
  refreshedAt: string | null,
  dashboard: DashboardJsonResponse | null = null
): CourseFolderDashboardResult => ({
  courseFolderId,
  courseFolderPath,
  status: "failure",
  dashboard,
  error,
  refreshedAt
});

const createCommandFailureResult = (
  courseFolderId: string,
  courseFolderPath: string,
  error: DashboardCommandError,
  dashboard: DashboardJsonResponse | null = null
): DashboardCommandResult => ({
  courseFolderId,
  courseFolderPath,
  status: "failure",
  dashboard,
  error
});

const getDashboardResultStatus = (
  exitCode: number | null,
  dashboard: DashboardJsonResponse
): "success" | "failure" => {
  if (exitCode !== SUCCESS_EXIT_CODE) {
    return "failure";
  }

  return dashboard.status === "failure" || dashboard.status === "failed" ? "failure" : "success";
};

const parseDashboardJson = (stdout: string): DashboardJsonResponse | null => {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    return isDashboardJsonResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const runDashboardCommand = async ({
  courseFolder,
  token,
  runner,
  env = process.env
}: DashboardCommandOptions): Promise<DashboardCommandResult> => {
  const request: ProcessRunRequest = {
    command: GRAIDER_COMMAND,
    args: DASHBOARD_ARGS,
    cwd: courseFolder.path,
    env: {
      ...env,
      [GITHUB_TOKEN_ENV_NAME]: token
    }
  };
  const result = await runner(request);

  logDashboardDebug(env, request, result, token);

  if (result.error !== null) {
    const cliStartError = getGraiderCliStartError(result.error.code);
    const code = cliStartError?.code ?? "dashboard_command_failed";
    const message = cliStartError?.message ?? "Graider dashboard could not be started.";

    return createCommandFailureResult(
      courseFolder.id,
      courseFolder.path,
      createCommandError(code, message, null, result.stdout, result.stderr, token, request, result)
    );
  }

  const dashboard = parseDashboardJson(result.stdout);

  if (dashboard !== null) {
    return {
      courseFolderId: courseFolder.id,
      courseFolderPath: courseFolder.path,
      status: getDashboardResultStatus(result.exitCode, dashboard),
      dashboard,
      error: null
    };
  }

  const errorCode =
    result.exitCode === SUCCESS_EXIT_CODE ? "invalid_dashboard_json" : "dashboard_command_failed";
  const errorMessage =
    errorCode === "invalid_dashboard_json"
      ? "Graider dashboard returned invalid JSON."
      : "Graider dashboard failed before returning usable JSON.";

  return createCommandFailureResult(
    courseFolder.id,
    courseFolder.path,
    createCommandError(
      errorCode,
      errorMessage,
      result.exitCode,
      result.stdout,
      result.stderr,
      token,
      request,
      result
    )
  );
};

const attachRefreshTime = (
  result: DashboardCommandResult,
  refreshedAt: string
): CourseFolderDashboardResult => ({
  ...result,
  refreshedAt
});

const getRegistryDashboardStatus = (result: CourseFolderDashboardResult): string =>
  result.dashboard?.status ?? result.status;

const refreshKnownCourseFolder = async (
  registryPath: string,
  courseFolder: CourseFolderRecord,
  token: string,
  options: DashboardRunnerOptions
): Promise<CourseFolderDashboardResult> => {
  const refreshedAt = (options.now ?? DEFAULT_NOW)().toISOString();
  const result = attachRefreshTime(
    await runDashboardCommand({
      courseFolder,
      token,
      runner: options.runner,
      env: options.env
    }),
    refreshedAt
  );
  const updatedRegistry = updateCourseFolderRefreshState(
    loadCourseRegistry(registryPath),
    courseFolder.id,
    {
      lastRefreshedAt: refreshedAt,
      lastDashboardStatus: getRegistryDashboardStatus(result)
    }
  );

  saveCourseRegistry(registryPath, updatedRegistry);

  return result;
};

export const refreshCourseFolder = async (
  registryPath: string,
  courseFolderId: string,
  options: DashboardRunnerOptions
): Promise<CourseFolderDashboardResult> => {
  const registry = loadCourseRegistry(registryPath);
  const courseFolder = registry.courseFolders.find((folder) => folder.id === courseFolderId);

  if (courseFolder === undefined) {
    return createFailureResult(
      courseFolderId,
      "",
      {
        code: "course_folder_not_found",
        message: "Registered course folder was not found.",
        exitCode: null,
        stdoutSnippet: null,
        stderrSnippet: null
      },
      null
    );
  }

  const tokenResult = await resolveGithubToken({
    env: options.env,
    runner: options.runner
  });

  if (tokenResult.status === "failure") {
    return createFailureResult(courseFolder.id, courseFolder.path, tokenResult.error, null);
  }

  return await refreshKnownCourseFolder(registryPath, courseFolder, tokenResult.token, options);
};

const getCombinedStatus = (
  results: readonly CourseFolderDashboardResult[]
): CombinedDashboardResult["status"] => {
  const failureCount = results.filter((result) => result.status === "failure").length;

  if (failureCount === 0) {
    return "success";
  }

  return failureCount === results.length ? "failure" : "partial_failure";
};

export const refreshDashboard = async (
  registryPath: string,
  options: DashboardRunnerOptions
): Promise<CombinedDashboardResult> => {
  const registry = loadCourseRegistry(registryPath);
  const tokenResult = await resolveGithubToken({
    env: options.env,
    runner: options.runner
  });

  if (tokenResult.status === "failure") {
    const results = registry.courseFolders.map((courseFolder) =>
      createFailureResult(courseFolder.id, courseFolder.path, tokenResult.error, null)
    );

    return {
      status: getCombinedStatus(results),
      results
    };
  }

  const results: CourseFolderDashboardResult[] = [];

  for (const courseFolder of registry.courseFolders) {
    const result = await refreshKnownCourseFolder(
      registryPath,
      courseFolder,
      tokenResult.token,
      options
    );
    results.push(result);
  }

  return {
    status: getCombinedStatus(results),
    results
  };
};
