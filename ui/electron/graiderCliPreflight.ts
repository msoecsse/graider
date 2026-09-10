import {
  getGraiderCliStartError,
  type ProcessRunner,
  type GraiderCliResolutionSource
} from "./commandRunner.js";

const GRAIDER_COMMAND = "graider";
const VERSION_ARGS = ["--version"] as const;
const SUCCESS_EXIT_CODE = 0;
const MAX_VERSION_LENGTH = 40;
const PREFLIGHT_FAILED_CODE = "graider_cli_preflight_failed";
const PREFLIGHT_FAILED_MESSAGE = "Graider CLI did not report a version.";

export interface GraiderCliStatus {
  readonly status: "ok" | "failure";
  /** Version the CLI reported, or null when it could not be started. */
  readonly version: string | null;
  /** Which tier of the resolution chain located the CLI. */
  readonly resolutionSource: GraiderCliResolutionSource | null;
  readonly executablePath: string | null;
  /** Script the executable was handed, when the CLI runs under Node. */
  readonly helperPath: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

/**
 * Runs the CLI once at startup so a launch problem reads as "it looked here and this happened"
 * rather than surfacing later as an unrelated-looking failure on whichever page is opened first.
 */
export const runGraiderCliPreflight = async ({
  runner
}: {
  readonly runner: ProcessRunner;
}): Promise<GraiderCliStatus> => {
  const result = await runner({
    command: GRAIDER_COMMAND,
    args: [...VERSION_ARGS]
  });
  const location = {
    resolutionSource: result.diagnostic?.resolutionSource ?? null,
    executablePath: result.diagnostic?.executablePath ?? null,
    helperPath: result.diagnostic?.helperPath ?? null
  };

  if (result.error !== null) {
    const startError = getGraiderCliStartError(result.error.code, result.diagnostic);

    return {
      status: "failure",
      version: null,
      ...location,
      errorCode: startError?.code ?? PREFLIGHT_FAILED_CODE,
      errorMessage: startError?.message ?? PREFLIGHT_FAILED_MESSAGE
    };
  }

  const version = result.stdout.trim().slice(0, MAX_VERSION_LENGTH);

  if (result.exitCode !== SUCCESS_EXIT_CODE || version.length === 0) {
    return {
      status: "failure",
      version: null,
      ...location,
      errorCode: PREFLIGHT_FAILED_CODE,
      errorMessage: PREFLIGHT_FAILED_MESSAGE
    };
  }

  return {
    status: "ok",
    version,
    ...location,
    errorCode: null,
    errorMessage: null
  };
};
