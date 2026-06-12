import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEXT_ENCODING = "utf8";
const GRAIDER_COMMAND = "graider";
const BUNDLED_GRAIDER_CLI_RELATIVE_PATH = ["dist-graider-cli", "index.js"] as const;
const ELECTRON_RUN_AS_NODE_ENV = "ELECTRON_RUN_AS_NODE";
const ELECTRON_RUN_AS_NODE_VALUE = "1";

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
  readonly error: ProcessSpawnError | null;
}

export type ProcessRunner = (request: ProcessRunRequest) => Promise<ProcessRunResult>;

export interface GraiderCliResolverOptions {
  readonly mode: "external" | "bundled";
  readonly appPath?: string;
  readonly execPath?: string;
}

export interface NodeProcessRunnerOptions {
  readonly graiderCli?: GraiderCliResolverOptions;
}

export interface GraiderCliStartError {
  readonly code:
    | typeof EXTERNAL_GRAIDER_CLI_NOT_FOUND_CODE
    | typeof BUNDLED_GRAIDER_CLI_NOT_FOUND_CODE;
  readonly message: string;
}

export const getBundledGraiderCliPath = (appPath: string): string =>
  path.join(appPath, ...BUNDLED_GRAIDER_CLI_RELATIVE_PATH);

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

export const resolveProcessRunRequest = (
  request: ProcessRunRequest,
  options: NodeProcessRunnerOptions = {}
): ProcessRunRequest => {
  const graiderCli = options.graiderCli;

  if (request.command !== GRAIDER_COMMAND || graiderCli?.mode !== "bundled") {
    return request;
  }

  const appPath = graiderCli.appPath ?? process.cwd();
  const execPath = graiderCli.execPath ?? process.execPath;
  const cliPath = getBundledGraiderCliPath(appPath);

  return {
    ...request,
    command: execPath,
    args: [cliPath, ...request.args],
    env: {
      ...(request.env ?? process.env),
      [ELECTRON_RUN_AS_NODE_ENV]: ELECTRON_RUN_AS_NODE_VALUE
    }
  };
};

const isMissingBundledGraiderCli = (
  request: ProcessRunRequest,
  resolvedRequest: ProcessRunRequest,
  options: NodeProcessRunnerOptions
): boolean =>
  request.command === GRAIDER_COMMAND &&
  options.graiderCli?.mode === "bundled" &&
  !fs.existsSync(resolvedRequest.args[0] ?? "");

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
      const resolvedRequest = resolveProcessRunRequest(request, options);

      if (isMissingBundledGraiderCli(request, resolvedRequest, options)) {
        finish({
          stdout,
          stderr,
          exitCode: null,
          error: {
            code: BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
            message: BUNDLED_GRAIDER_CLI_NOT_FOUND_MESSAGE
          }
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
            error: {
              code: getErrorCode(error),
              message: error.message
            }
          });
        });

        childProcess.on("close", (exitCode) => {
          finish({
            stdout,
            stderr,
            exitCode,
            error: null
          });
        });
      }
    });
