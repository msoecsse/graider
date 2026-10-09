import { exec as executeDugite } from "dugite";

import {
  GitCommandFailure,
  type GitCommandBinaryExecutionRequest,
  type GitCommandBinaryExecutionResult,
  type GitCommandBinaryRunner,
  type GitCommandExecutionRequest,
  type GitCommandRunner
} from "./git-command-workspace.js";

const MAX_GIT_OUTPUT_BYTES = 10_485_760;

export interface DugiteGitRunnersOptions {
  /** Test observation only; command execution remains owned by Dugite. */
  readonly onSpawn?: (child: {
    readonly spawnfile: string;
    readonly spawnargs: readonly string[];
  }) => void;
  /** Test observation only. */
  readonly onRequest?: (
    request: GitCommandExecutionRequest | GitCommandBinaryExecutionRequest
  ) => void;
}

export interface DugiteGitRunners {
  readonly runGit: GitCommandRunner;
  readonly runGitBinary: GitCommandBinaryRunner;
}

const execute = async (
  request: GitCommandExecutionRequest | GitCommandBinaryExecutionRequest,
  options: DugiteGitRunnersOptions
): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> => {
  options.onRequest?.(request);
  const input = (request as GitCommandBinaryExecutionRequest).input;
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
      throw new GitCommandFailure({
        code: result.exitCode,
        message: "Dugite Git command failed.",
        stderr: result.stderr.toString("utf8"),
        stdout: result.stdout.toString("utf8")
      });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    throw error instanceof GitCommandFailure ? error : new GitCommandFailure(error);
  }
};

export const createDugiteGitRunners = (
  options: DugiteGitRunnersOptions = {}
): DugiteGitRunners => ({
  runGit: async (request): Promise<string> =>
    (await execute(request, options)).stdout.toString("utf8"),
  runGitBinary: async (request): Promise<GitCommandBinaryExecutionResult> => {
    const result = await execute(request, options);
    return {
      stdout: new Uint8Array(result.stdout),
      stderr: new Uint8Array(result.stderr)
    };
  }
});
