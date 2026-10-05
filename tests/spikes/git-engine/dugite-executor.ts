import type { ChildProcess } from "node:child_process";
import { exec as executeDugite, resolveGitBinary } from "dugite";

export const MAX_SPIKE_OUTPUT_BYTES = 10_485_760;

export interface BundledGitRequest {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: Uint8Array;
  readonly maxOutputBytes?: number;
  readonly signal?: AbortSignal;
  readonly onSpawn?: (child: ChildProcess) => void;
}

export interface BundledGitResult {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

export type ThreeWayIndexedApplyResult =
  | { readonly kind: "applied" }
  | { readonly kind: "conflict" };

export interface ThreeWayIndexedApplyRequest {
  readonly cwd: string;
  readonly patch: Uint8Array;
  readonly env?: NodeJS.ProcessEnv;
}

const REDACTED = "[REDACTED]";

export class BundledGitSpikeError extends Error {
  readonly exitCode: number;

  constructor(result: BundledGitResult, secrets: readonly string[] = []) {
    super("Bundled Git could not complete the spike operation.");
    this.name = "BundledGitSpikeError";
    this.exitCode = result.exitCode;
    const sanitize = (value: Buffer): string =>
      secrets.reduce(
        (safe, secret) => (secret.length === 0 ? safe : safe.replaceAll(secret, REDACTED)),
        value.toString("utf8")
      );
    const cause = new Error(
      `Bundled Git exited ${String(result.exitCode)}. stdout=${sanitize(result.stdout)} stderr=${sanitize(result.stderr)}`
    );
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause
    });
  }
}

export interface GitHubAuthenticationEnvironment {
  readonly env: NodeJS.ProcessEnv;
  readonly secrets: readonly [token: string, encoded: string, authorization: string];
}

export const gitHubAuthenticationEnvironment = (
  token: string,
  parentEnvironment: NodeJS.ProcessEnv = process.env
): GitHubAuthenticationEnvironment => {
  const encoded = Buffer.from(`x-access-token:${token}`).toString("base64");
  const authorization = `AUTHORIZATION: basic ${encoded}`;
  return {
    env: {
      ...parentEnvironment,
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: "http.https://github.com/.extraHeader",
      GIT_CONFIG_VALUE_1: authorization,
      GIT_TERMINAL_PROMPT: "0"
    },
    secrets: [token, encoded, authorization]
  };
};

export const embeddedGitBinary = (): string => resolveGitBinary();

/** Disposable Phase 1.2A seam; production code continues to use SystemGitWorkspace. */
export const runBundledGit = async (request: BundledGitRequest): Promise<BundledGitResult> => {
  const result = await executeDugite(
    ["-c", "color.ui=false", "-c", "core.quotepath=false", ...request.args],
    request.cwd,
    {
      encoding: "buffer",
      maxBuffer: request.maxOutputBytes ?? MAX_SPIKE_OUTPUT_BYTES,
      ...(request.env === undefined ? {} : { env: request.env }),
      ...(request.input === undefined ? {} : { stdin: Buffer.from(request.input) }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.onSpawn === undefined ? {} : { processCallback: request.onSpawn })
    }
  );

  return result;
};

export const requireBundledGitSuccess = (
  result: BundledGitResult,
  secrets: readonly string[] = []
): BundledGitResult => {
  if (result.exitCode !== 0) throw new BundledGitSpikeError(result, secrets);
  return result;
};

export const applyThreeWayIndexed = async (
  request: ThreeWayIndexedApplyRequest
): Promise<ThreeWayIndexedApplyResult> => {
  const application = await runBundledGit({
    cwd: request.cwd,
    args: ["apply", "--3way", "--index", "-"],
    input: request.patch,
    ...(request.env === undefined ? {} : { env: request.env })
  });
  if (application.exitCode === 0) return { kind: "applied" };

  const unmerged = await runBundledGit({
    cwd: request.cwd,
    args: ["ls-files", "--unmerged", "-z"],
    ...(request.env === undefined ? {} : { env: request.env })
  });
  if (unmerged.exitCode === 0 && unmerged.stdout.length > 0) return { kind: "conflict" };

  throw new BundledGitSpikeError(application);
};
