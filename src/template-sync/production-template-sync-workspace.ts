import { execFile as executeFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { GitHubClient } from "../github/github-client.js";
import { LocalGitTemplateSyncGateway } from "./local-git-template-sync-gateway.js";
import {
  createGitHubTemplateSyncOperationError,
  createTemplateSyncOperationError,
  type TemplateSyncFailureStage
} from "./template-sync-failure.js";
import type {
  StudentRepositoryRef,
  TemplatePullRequest,
  TemplateSyncPullRequestGateway
} from "./template-sync.js";

const execFile = promisify(executeFile);
const GIT = "git";
const BYTES_PER_KIBIBYTE = 1024;
const KIBIBYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE;
const BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE * KIBIBYTES_PER_MEBIBYTE;
const MAX_GIT_COMMAND_OUTPUT_MEBIBYTES = 10;
const MAX_GIT_COMMAND_OUTPUT_BYTES = MAX_GIT_COMMAND_OUTPUT_MEBIBYTES * BYTES_PER_MEBIBYTE;

export interface ProductionTemplateSyncWorkspaceInput {
  templateCloneUrl: string;
  studentCloneUrl: string;
  templateCommitSha: string;
  /** Legacy caller hint; origin/HEAD is authoritative after clone. */
  studentDefaultBranch?: string;
  token: string | null;
  githubClient: GitHubClient;
}

export interface PreparedTemplateSyncWorkspace {
  gateway: LocalGitTemplateSyncGateway;
  pullRequests: TemplateSyncPullRequestGateway;
  studentDefaultBranch: string;
}

export interface ProductionTemplateSyncWorkspaceDependencies {
  runGit(
    directory: string | undefined,
    args: string[],
    token: string | null
  ): Promise<{ stdout: string }>;
}

const runWorkspaceStage = async (
  stage: TemplateSyncFailureStage,
  message: string,
  operation: () => Promise<unknown>
): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    throw createTemplateSyncOperationError(stage, message, error);
  }
};

/** Creates disposable clones for exactly one template-sync operation. */
export const withProductionTemplateSyncWorkspace = async <T>(
  input: ProductionTemplateSyncWorkspaceInput,
  operation: (workspace: PreparedTemplateSyncWorkspace) => Promise<T>,
  overrides: Partial<ProductionTemplateSyncWorkspaceDependencies> = {}
): Promise<T> => {
  const directory = await mkdtemp(join(tmpdir(), "graider-template-sync-"));
  let result: T | undefined;
  let operationError: unknown;

  try {
    const templateDirectory = join(directory, "template");
    const studentDirectory = join(directory, "student");
    const runGit = overrides.runGit ?? git;
    await runWorkspaceStage(
      "template_clone_failed",
      "Unable to clone template repository.",
      async () => {
        await clone(input.templateCloneUrl, templateDirectory, input.token, runGit);
      }
    );
    await runWorkspaceStage(
      "student_clone_failed",
      "Unable to clone student repository.",
      async () => {
        await clone(input.studentCloneUrl, studentDirectory, input.token, runGit);
      }
    );
    await runWorkspaceStage(
      "template_checkout_failed",
      "Unable to check out the requested template revision.",
      async () =>
        await runGit(
          templateDirectory,
          ["checkout", "--detach", input.templateCommitSha],
          input.token
        )
    );
    const studentDefaultBranch = await resolveRemoteDefaultBranch(
      studentDirectory,
      input.token,
      runGit
    );
    await runWorkspaceStage(
      "student_checkout_failed",
      "Unable to check out the student default branch.",
      async () =>
        await runGit(
          studentDirectory,
          ["checkout", "-B", studentDefaultBranch, `origin/${studentDefaultBranch}`],
          input.token
        )
    );
    result = await operation({
      gateway: new LocalGitTemplateSyncGateway({ templateDirectory, studentDirectory }),
      pullRequests: createGitHubPullRequestGateway(input.githubClient),
      studentDefaultBranch
    });
  } catch (error: unknown) {
    operationError = error;
  }

  try {
    await rm(directory, { force: true, recursive: true });
  } catch {
    // Temporary cleanup must never replace the template-sync operation result.
  }
  if (operationError !== undefined) {
    if (operationError instanceof Error) throw operationError;
    throw new Error("Template-sync workspace operation failed.", { cause: operationError });
  }
  return result as T;
};

const resolveRemoteDefaultBranch = async (
  studentDirectory: string,
  token: string | null,
  runGit: ProductionTemplateSyncWorkspaceDependencies["runGit"]
): Promise<string> => {
  let branch = "";
  await runWorkspaceStage(
    "student_checkout_failed",
    "Graider could not determine the repository default branch.",
    async () => {
      const result = await runGit(
        studentDirectory,
        ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
        token
      );
      const symbolicRef = result.stdout.trim();
      if (!symbolicRef.startsWith("origin/") || symbolicRef.length === "origin/".length) {
        throw new Error("The origin default-branch symbolic ref is invalid.");
      }
      branch = symbolicRef.slice("origin/".length);
      await runGit(
        studentDirectory,
        ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
        token
      );
    }
  );
  return branch;
};

const clone = async (
  url: string,
  directory: string,
  token: string | null,
  runGit: ProductionTemplateSyncWorkspaceDependencies["runGit"]
): Promise<void> => {
  await runGit(undefined, ["clone", "--no-checkout", url, directory], token);
};

const git = async (
  directory: string | undefined,
  args: string[],
  token: string | null
): Promise<{ stdout: string }> => {
  const authorization =
    token === null
      ? []
      : [
          "-c",
          `http.extraHeader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`
        ];
  const { stdout } = await execFile(
    GIT,
    [...authorization, ...(directory === undefined ? [] : ["-C", directory]), ...args],
    {
      encoding: "utf8",
      maxBuffer: MAX_GIT_COMMAND_OUTPUT_BYTES
    }
  );
  return { stdout };
};

export const createGitHubPullRequestGateway = (
  githubClient: GitHubClient
): TemplateSyncPullRequestGateway => ({
  async createPullRequest(input): Promise<TemplatePullRequest> {
    try {
      const created = await githubClient.createPullRequest({
        owner: input.repository.owner,
        repo: input.repository.name,
        head: input.sourceBranch,
        base: input.targetBranch,
        title: input.title,
        body: input.body
      });
      return { number: created.number, url: created.url };
    } catch (error: unknown) {
      throw createGitHubTemplateSyncOperationError(error);
    }
  },
  async findPullRequest(input) {
    try {
      return await githubClient.findPullRequest(
        input.repository.owner,
        input.repository.name,
        input.sourceBranch,
        input.targetBranch
      );
    } catch (error: unknown) {
      throw createGitHubTemplateSyncOperationError(error);
    }
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
