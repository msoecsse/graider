import type { ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentRepositoryDownloadRequest,
  AssignmentRepositoryDownloadResult
} from "./ipc.js";
import { GITHUB_TOKEN_ENV_NAME, resolveGithubToken } from "./tokenResolver.js";

export const runAssignmentRepositoryDownload = async (
  request: AssignmentRepositoryDownloadRequest,
  {
    runner,
    env = process.env
  }: { readonly runner: ProcessRunner; readonly env?: NodeJS.ProcessEnv }
): Promise<AssignmentRepositoryDownloadResult> => {
  const authentication = await resolveGithubToken({ runner, env });
  if (authentication.status === "failure") throw new Error(authentication.error.message);
  const result = await runner({
    command: "graider",
    args: [
      "assignment",
      "download-repositories",
      request.assignmentFile,
      "--destination",
      request.destination,
      "--json"
    ],
    cwd: request.courseFolderPath,
    env: { ...env, [GITHUB_TOKEN_ENV_NAME]: authentication.token }
  });
  if (result.error !== null) throw new Error("Repository download command could not be started.");
  try {
    return JSON.parse(result.stdout) as AssignmentRepositoryDownloadResult;
  } catch {
    throw new Error("Repository download returned invalid JSON.");
  }
};
