import { exec as executeDugite } from "dugite";

import {
  SystemGitFailure,
  type SystemGitBinaryExecutionRequest,
  type SystemGitBinaryExecutionResult,
  type SystemGitBinaryRunner,
  type SystemGitExecutionRequest,
  type SystemGitRunner
} from "./system-git-workspace.js";

const MAX_GIT_OUTPUT_BYTES = 10_485_760;

export interface DugiteGitRunnersOptions {
  /** Test observation only; command execution remains owned by Dugite. */
  readonly onSpawn?: (child: {
    readonly spawnfile: string;
    readonly spawnargs: readonly string[];
  }) => void;
  /** Test observation only. */
  readonly onRequest?: (
    request: SystemGitExecutionRequest | SystemGitBinaryExecutionRequest
  ) => void;
}

export interface DugiteGitRunners {
  readonly runGit: SystemGitRunner;
  readonly runGitBinary: SystemGitBinaryRunner;
}

const execute = async (
  request: SystemGitExecutionRequest | SystemGitBinaryExecutionRequest,
  options: DugiteGitRunnersOptions
): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> => {
  options.onRequest?.(request);
  const input = (request as SystemGitBinaryExecutionRequest).input;
  try {
    const result = await executeDugite(
      ["-c", "color.ui=false", "-c", "core.quotepath=false", ...request.args],
      request.cwd,
      {
        encoding: "buffer",
        ...(request.env === undefined ? {} : { env: request.env }),
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        ...(input === undefined ? {} : { stdin: Buffer.from(input) }),
        ...(options.onSpawn === undefined ? {} : { processCallback: options.onSpawn })
      }
    );
    if (result.exitCode !== 0)
      throw new SystemGitFailure({
        code: result.exitCode,
        message: "Dugite Git command failed.",
        stderr: result.stderr.toString("utf8"),
        stdout: result.stdout.toString("utf8")
      });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    throw error instanceof SystemGitFailure ? error : new SystemGitFailure(error);
  }
};

export const createDugiteGitRunners = (
  options: DugiteGitRunnersOptions = {}
): DugiteGitRunners => ({
  runGit: async (request): Promise<string> =>
    (await execute(request, options)).stdout.toString("utf8"),
  runGitBinary: async (request): Promise<SystemGitBinaryExecutionResult> => {
    const result = await execute(request, options);
    return {
      stdout: new Uint8Array(result.stdout),
      stderr: new Uint8Array(result.stderr)
    };
  }
});
