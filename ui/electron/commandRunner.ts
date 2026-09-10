import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveWindowsGraiderCli } from "./windowsGraiderCliResolver.js";

const TEXT_ENCODING = "utf8";
const GRAIDER_COMMAND = "graider";
const BUNDLED_GRAIDER_CLI_RELATIVE_PATH = ["dist-graider-cli", "index.js"] as const;
/** `app.getAppPath()` is `<repo>/ui` in development, so the CLI build sits one level up. */
const DEVELOPMENT_GRAIDER_CLI_RELATIVE_PATH = ["..", "dist", "index.js"] as const;
const GRAIDER_CLI_PATH_ENV = "GRAIDER_CLI_PATH";
const NODE_SCRIPT_EXTENSIONS = [".js", ".mjs", ".cjs"] as const;
const ASAR_FILE_EXTENSION = ".asar";
const ASAR_UNPACKED_FILE_EXTENSION = ".asar.unpacked";
const ELECTRON_RUN_AS_NODE_ENV = "ELECTRON_RUN_AS_NODE";
const ELECTRON_RUN_AS_NODE_VALUE = "1";
const WINDOWS_PLATFORM = "win32";

export const BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE = "BUNDLED_GRAIDER_CLI_MISSING";
export const EXTERNAL_GRAIDER_CLI_NOT_FOUND_CODE = "graider_cli_not_found";
export const BUNDLED_GRAIDER_CLI_NOT_FOUND_CODE = "bundled_graider_cli_not_found";
export const EXTERNAL_GRAIDER_CLI_NOT_FOUND_MESSAGE =
  "Graider CLI not found. Install Graider or make sure graider is available on PATH.";
export const BUNDLED_GRAIDER_CLI_NOT_FOUND_MESSAGE =
  "Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app.";

export interface ProcessRunRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface ProcessSpawnError {
  readonly code: string | null;
  readonly message: string;
}

export interface ProcessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly error: ProcessSpawnError | null;
  readonly diagnostic?: ProcessRunDiagnostic;
}

export type ProcessRunner = (request: ProcessRunRequest) => Promise<ProcessRunResult>;

export interface GraiderCliResolverOptions {
  readonly mode: "external" | "bundled";
  readonly appPath?: string;
  readonly execPath?: string;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly fileExists?: (candidatePath: string) => boolean;
  readonly readFile?: (filePath: string) => string;
}

export interface NodeProcessRunnerOptions {
  readonly graiderCli?: GraiderCliResolverOptions;
}

export interface ProcessRunDiagnostic {
  readonly runnerMode: "external" | "bundled" | "direct";
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | null;
  readonly executablePath: string;
  readonly helperPath: string | null;
  readonly resolutionSource: GraiderCliResolutionSource | null;
}

/** Which tier of the resolution chain produced the CLI location, most specific first. */
export type GraiderCliResolutionSource = "env_override" | "bundled" | "development" | "path_shim";

export type GraiderCliResolution =
  | {
      readonly kind: "node_script";
      readonly scriptPath: string;
      readonly source: GraiderCliResolutionSource;
    }
  | {
      readonly kind: "executable";
      readonly executablePath: string;
      readonly source: GraiderCliResolutionSource;
    };

export interface GraiderCliStartError {
  readonly code:
    | typeof EXTERNAL_GRAIDER_CLI_NOT_FOUND_CODE
    | typeof BUNDLED_GRAIDER_CLI_NOT_FOUND_CODE;
  readonly message: string;
}

export const getBundledGraiderCliBasePath = (appPath: string): string =>
  appPath.endsWith(ASAR_FILE_EXTENSION)
    ? `${appPath.slice(0, -ASAR_FILE_EXTENSION.length)}${ASAR_UNPACKED_FILE_EXTENSION}`
    : appPath;

export const getBundledGraiderCliPath = (appPath: string): string =>
  path.join(getBundledGraiderCliBasePath(appPath), ...BUNDLED_GRAIDER_CLI_RELATIVE_PATH);

export const getDevelopmentGraiderCliPath = (appPath: string): string =>
  path.resolve(appPath, ...DEVELOPMENT_GRAIDER_CLI_RELATIVE_PATH);

export const getGraiderCliStartError = (
  processErrorCode: string | null
): GraiderCliStartError | null => {
  if (processErrorCode === BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE) {
    return {
      code: BUNDLED_GRAIDER_CLI_NOT_FOUND_CODE,
      message: BUNDLED_GRAIDER_CLI_NOT_FOUND_MESSAGE
    };
  }

  if (processErrorCode === "ENOENT") {
    return {
      code: EXTERNAL_GRAIDER_CLI_NOT_FOUND_CODE,
      message: EXTERNAL_GRAIDER_CLI_NOT_FOUND_MESSAGE
    };
  }

  return null;
};

const runUnderNode = (
  request: ProcessRunRequest,
  execPath: string,
  scriptPath: string
): ProcessRunRequest => ({
  ...request,
  command: execPath,
  args: [scriptPath, ...request.args],
  env: {
    ...(request.env ?? process.env),
    [ELECTRON_RUN_AS_NODE_ENV]: ELECTRON_RUN_AS_NODE_VALUE
  }
});

const isNodeScript = (candidatePath: string): boolean =>
  NODE_SCRIPT_EXTENSIONS.includes(
    path.extname(candidatePath).toLowerCase() as (typeof NODE_SCRIPT_EXTENSIONS)[number]
  );

const createResolution = (
  candidatePath: string,
  source: GraiderCliResolutionSource
): GraiderCliResolution =>
  isNodeScript(candidatePath)
    ? { kind: "node_script", scriptPath: candidatePath, source }
    : { kind: "executable", executablePath: candidatePath, source };

interface GraiderCliCandidate {
  readonly candidatePath: string;
  readonly source: GraiderCliResolutionSource;
}

/**
 * A packaged app runs only the CLI it shipped with, so that a broken install is reported rather
 * than silently satisfied by whatever version happens to be installed globally. Development
 * prefers the repository build it was launched from, then the bundled copy, then PATH.
 * Without an `appPath` neither location can be derived, so the chain falls through.
 */
const getScriptCandidates = (
  graiderCli: GraiderCliResolverOptions
): readonly GraiderCliCandidate[] => {
  const appPath = graiderCli.appPath;

  if (appPath === undefined) {
    return [];
  }

  const bundled: GraiderCliCandidate = {
    candidatePath: getBundledGraiderCliPath(appPath),
    source: "bundled"
  };

  if (graiderCli.mode === "bundled") {
    return [bundled];
  }

  return [{ candidatePath: getDevelopmentGraiderCliPath(appPath), source: "development" }, bundled];
};

const resolvePathShim = (graiderCli: GraiderCliResolverOptions): GraiderCliResolution | null => {
  if (
    graiderCli.mode === "bundled" ||
    (graiderCli.platform ?? process.platform) !== WINDOWS_PLATFORM
  ) {
    return null;
  }

  const location = resolveWindowsGraiderCli({
    ...(graiderCli.env === undefined ? {} : { env: graiderCli.env }),
    ...(graiderCli.fileExists === undefined ? {} : { fileExists: graiderCli.fileExists }),
    ...(graiderCli.readFile === undefined ? {} : { readFile: graiderCli.readFile })
  });

  if (location === null) {
    return null;
  }

  return location.kind === "executable"
    ? { kind: "executable", executablePath: location.executablePath, source: "path_shim" }
    : { kind: "node_script", scriptPath: location.scriptPath, source: "path_shim" };
};

/**
 * Locates the Graider CLI without depending on PATH, which requires a global install, npm's shim
 * layout, and a GUI process that inherited the right environment. An explicit override wins, then
 * the CLI builds shipped with the app, and only then a PATH lookup.
 */
export const resolveGraiderCli = (
  graiderCli: GraiderCliResolverOptions
): GraiderCliResolution | null => {
  const env = graiderCli.env ?? process.env;
  const fileExists = graiderCli.fileExists ?? fs.existsSync;
  const override = env[GRAIDER_CLI_PATH_ENV]?.trim();

  if (override !== undefined && override.length > 0 && fileExists(override)) {
    return createResolution(override, "env_override");
  }

  for (const candidate of getScriptCandidates(graiderCli)) {
    if (fileExists(candidate.candidatePath)) {
      return createResolution(candidate.candidatePath, candidate.source);
    }
  }

  return resolvePathShim(graiderCli);
};

export interface ResolvedGraiderRequest {
  readonly request: ProcessRunRequest;
  readonly resolution: GraiderCliResolution | null;
}

/**
 * Nothing resolved. A packaged app still reports the bundled location it expected so the failure
 * names a path; elsewhere the bare command is left for the platform's own PATH lookup.
 */
const createUnresolvedRequest = (
  request: ProcessRunRequest,
  graiderCli: GraiderCliResolverOptions,
  execPath: string
): ProcessRunRequest => {
  const appPath = graiderCli.appPath;

  return graiderCli.mode === "bundled" && appPath !== undefined
    ? runUnderNode(request, execPath, getBundledGraiderCliPath(appPath))
    : request;
};

export const resolveGraiderCliRequest = (
  request: ProcessRunRequest,
  options: NodeProcessRunnerOptions = {}
): ResolvedGraiderRequest => {
  const graiderCli = options.graiderCli;

  if (request.command !== GRAIDER_COMMAND || graiderCli === undefined) {
    return { request, resolution: null };
  }

  const resolution = resolveGraiderCli(graiderCli);
  const execPath = graiderCli.execPath ?? process.execPath;

  if (resolution === null) {
    return { request: createUnresolvedRequest(request, graiderCli, execPath), resolution };
  }

  return {
    request:
      resolution.kind === "executable"
        ? { ...request, command: resolution.executablePath }
        : runUnderNode(request, execPath, resolution.scriptPath),
    resolution
  };
};

export const resolveProcessRunRequest = (
  request: ProcessRunRequest,
  options: NodeProcessRunnerOptions = {}
): ProcessRunRequest => resolveGraiderCliRequest(request, options).request;

const createProcessRunDiagnostic = (
  request: ProcessRunRequest,
  resolvedRequest: ProcessRunRequest,
  resolution: GraiderCliResolution | null,
  options: NodeProcessRunnerOptions
): ProcessRunDiagnostic => {
  const isBundledGraider =
    request.command === GRAIDER_COMMAND && options.graiderCli?.mode === "bundled";
  const isExternalGraider =
    request.command === GRAIDER_COMMAND && options.graiderCli?.mode === "external";
  const isRunUnderNode =
    request.command === GRAIDER_COMMAND && resolvedRequest.args.length > request.args.length;

  return {
    runnerMode: isBundledGraider ? "bundled" : isExternalGraider ? "external" : "direct",
    command: request.command,
    args: request.args,
    cwd: request.cwd ?? null,
    executablePath: resolvedRequest.command,
    helperPath: isRunUnderNode ? (resolvedRequest.args[0] ?? null) : null,
    resolutionSource: resolution?.source ?? null
  };
};

const isMissingBundledGraiderCli = (
  request: ProcessRunRequest,
  resolution: GraiderCliResolution | null,
  options: NodeProcessRunnerOptions
): boolean =>
  request.command === GRAIDER_COMMAND &&
  options.graiderCli?.mode === "bundled" &&
  resolution === null;

const getErrorCode = (error: Error): string | null => {
  const maybeNodeError = error as NodeJS.ErrnoException;

  return typeof maybeNodeError.code === "string" ? maybeNodeError.code : null;
};

export const createNodeProcessRunner =
  (options: NodeProcessRunnerOptions = {}): ProcessRunner =>
  async (request) =>
    await new Promise<ProcessRunResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let didResolve = false;

      const finish = (result: ProcessRunResult): void => {
        if (!didResolve) {
          didResolve = true;
          resolve(result);
        }
      };
      const { request: resolvedRequest, resolution } = resolveGraiderCliRequest(request, options);
      const diagnostic = createProcessRunDiagnostic(request, resolvedRequest, resolution, options);

      if (isMissingBundledGraiderCli(request, resolution, options)) {
        finish({
          stdout,
          stderr,
          exitCode: null,
          signal: null,
          error: {
            code: BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
            message: BUNDLED_GRAIDER_CLI_NOT_FOUND_MESSAGE
          },
          diagnostic
        });
      } else {
        const childProcess = spawn(resolvedRequest.command, [...resolvedRequest.args], {
          cwd: resolvedRequest.cwd,
          env: resolvedRequest.env,
          shell: false,
          windowsHide: true
        });

        childProcess.stdout.setEncoding(TEXT_ENCODING);
        childProcess.stderr.setEncoding(TEXT_ENCODING);

        childProcess.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });

        childProcess.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });

        childProcess.on("error", (error: Error) => {
          finish({
            stdout,
            stderr,
            exitCode: null,
            signal: null,
            error: {
              code: getErrorCode(error),
              message: error.message
            },
            diagnostic
          });
        });

        childProcess.on("close", (exitCode, signal) => {
          finish({
            stdout,
            stderr,
            exitCode,
            signal,
            error: null,
            diagnostic
          });
        });
      }
    });
