import { execFile as executeFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { GitHubClient } from "../github/github-client.js";
import { LocalGitTemplateSyncGateway } from "./local-git-template-sync-gateway.js";
import type {
  StudentRepositoryRef,
  TemplatePullRequest,
  TemplateSyncPullRequestGateway
} from "./template-sync.js";

const execFile = promisify(executeFile);
const GIT = "git";

export interface ProductionTemplateSyncWorkspaceInput {
  templateCloneUrl: string;
  studentCloneUrl: string;
  templateCommitSha: string;
  studentDefaultBranch: string;
  token: string | null;
  githubClient: GitHubClient;
}

export interface PreparedTemplateSyncWorkspace {
  gateway: LocalGitTemplateSyncGateway;
  pullRequests: TemplateSyncPullRequestGateway;
}

/** Creates disposable clones for exactly one template-sync operation. */
export const withProductionTemplateSyncWorkspace = async <T>(
  input: ProductionTemplateSyncWorkspaceInput,
  operation: (workspace: PreparedTemplateSyncWorkspace) => Promise<T>
): Promise<T> => {
  const directory = await mkdtemp(join(tmpdir(), "graider-template-sync-"));
  let result: T | undefined;
  let operationError: unknown;

  try {
    const templateDirectory = join(directory, "template");
    const studentDirectory = join(directory, "student");
    await clone(input.templateCloneUrl, templateDirectory, input.token);
    await clone(input.studentCloneUrl, studentDirectory, input.token);
    await git(templateDirectory, ["checkout", "--detach", input.templateCommitSha], input.token);
    await git(studentDirectory, ["switch", input.studentDefaultBranch], input.token);
    result = await operation({
      gateway: new LocalGitTemplateSyncGateway({ templateDirectory, studentDirectory }),
      pullRequests: createGitHubPullRequestGateway(input.githubClient)
    });
  } catch (error: unknown) {
    operationError = error;
  }

  try {
    await rm(directory, { force: true, recursive: true });
  } catch {
    // Temporary cleanup must never replace the template-sync operation result.
  }
  if (operationError !== undefined) throw operationError;
  return result as T;
};

const clone = async (url: string, directory: string, token: string | null): Promise<void> => {
  await git(undefined, ["clone", "--no-checkout", url, directory], token);
};

const git = async (directory: string | undefined, args: string[], token: string | null) => {
  const authorization =
    token === null
      ? []
      : [
          "-c",
          `http.extraHeader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`
        ];
  await execFile(
    GIT,
    [...authorization, ...(directory === undefined ? [] : ["-C", directory]), ...args],
    {
      maxBuffer: 10 * 1024 * 1024
    }
  );
};

const createGitHubPullRequestGateway = (
  githubClient: GitHubClient
): TemplateSyncPullRequestGateway => ({
  async createPullRequest(input): Promise<TemplatePullRequest> {
    const created = await githubClient.createPullRequest({
      owner: input.repository.owner,
      repo: input.repository.name,
      head: input.sourceBranch,
      base: input.targetBranch,
      title: input.title,
      body: input.body
    });
    return { number: created.number, url: created.url };
  },
  async findPullRequest(input) {
    return await githubClient.findPullRequest(
      input.repository.owner,
      input.repository.name,
      input.sourceBranch,
      input.targetBranch
    );
  }
});

export const deleteManagedTemplateSyncBranch = async (
  githubClient: GitHubClient,
  repository: StudentRepositoryRef,
  branchName: string
): Promise<void> => {
  await githubClient.deleteRepositoryBranch(
    repository.owner,
    repository.name,
    branchName,
    repository.defaultBranch
  );
};
