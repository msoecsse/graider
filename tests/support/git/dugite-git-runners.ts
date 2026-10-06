import type { ChildProcess } from "node:child_process";
import { exec as executeDugite } from "dugite";
import type {
  SystemGitBinaryExecutionRequest,
  SystemGitBinaryExecutionResult,
  SystemGitBinaryRunner,
  SystemGitExecutionRequest,
  SystemGitRunner
} from "../../../src/git/system-git-workspace.js";

const MAX_GIT_OUTPUT_BYTES = 10_485_760;

export class DugiteGitRunnerFailure extends Error {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;

  constructor(exitCode: number, stdout: Buffer, stderr: Buffer) {
    super("Dugite Git command failed.");
    this.name = "DugiteGitRunnerFailure";
    this.code = exitCode;
    this.stdout = stdout.toString("utf8");
    this.stderr = stderr.toString("utf8");
  }
}

export interface DugiteGitRunnersOptions {
  readonly onSpawn?: (child: ChildProcess) => void;
  readonly onRequest?: (
    request: SystemGitExecutionRequest | SystemGitBinaryExecutionRequest
  ) => void;
}

export interface DugiteGitRunners {
  readonly runGit: SystemGitRunner;
  readonly runGitBinary: SystemGitBinaryRunner;
}

const bundledOnlyEnvironment = (environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const result: NodeJS.ProcessEnv = { ...process.env, ...environment, PATH: "" };
  delete result.LOCAL_GIT_DIRECTORY;
  delete result.GIT_EXEC_PATH;
  return result;
};

const execute = async (
  request: SystemGitExecutionRequest | SystemGitBinaryExecutionRequest,
  options: DugiteGitRunnersOptions
): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> => {
  options.onRequest?.(request);
  const input = (request as SystemGitBinaryExecutionRequest).input;
  const result = await executeDugite(
    ["-c", "color.ui=false", "-c", "core.quotepath=false", ...request.args],
    request.cwd,
    {
      encoding: "buffer",
      env: bundledOnlyEnvironment(request.env),
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      ...(input === undefined ? {} : { stdin: Buffer.from(input) }),
      ...(options.onSpawn === undefined ? {} : { processCallback: options.onSpawn })
    }
  );
  if (result.exitCode !== 0)
    throw new DugiteGitRunnerFailure(result.exitCode, result.stdout, result.stderr);
  return { stdout: result.stdout, stderr: result.stderr };
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
