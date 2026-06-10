import { spawn } from "node:child_process";

const TEXT_ENCODING = "utf8";

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

const getErrorCode = (error: Error): string | null => {
  const maybeNodeError = error as NodeJS.ErrnoException;

  return typeof maybeNodeError.code === "string" ? maybeNodeError.code : null;
};

export const createNodeProcessRunner = (): ProcessRunner => async (request) =>
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

    const childProcess = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: request.env,
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
  });
