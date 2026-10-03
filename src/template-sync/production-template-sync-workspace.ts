import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GitCredentialResolver } from "../git/git-credential-resolver.js";
import {
  createExactCommitRevision,
  createGitAuthenticationContext,
  createRemoteName,
  createTrustedGitRemote,
  type GitAuthenticationContext,
  type GitWorkspacePreparationFactory
} from "../git/git-workspace.js";
import { createSystemGitWorkspaceFactory } from "../git/system-git-workspace-context.js";
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

const GITHUB_HOST = "github.com";

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
  createGitWorkspaceFactory(
    credentialResolver?: GitCredentialResolver
  ): GitWorkspacePreparationFactory;
  createAuthenticationContext(): GitAuthenticationContext;
}

const runWorkspaceStage = async <T>(
  stage: TemplateSyncFailureStage,
  message: string,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error: unknown) {
    throw createTemplateSyncOperationError(stage, message, error);
  }
};

const defaultDependencies: ProductionTemplateSyncWorkspaceDependencies = {
  createGitWorkspaceFactory: createSystemGitWorkspaceFactory,
  createAuthenticationContext: () => {
    const context = createGitAuthenticationContext(randomUUID());
    if (context === null) throw new Error("Unable to create Git authentication context.");
    return context;
  }
};

const authenticationForOperation = (
  token: string | null,
  dependencies: ProductionTemplateSyncWorkspaceDependencies
): {
  readonly authentication?: GitAuthenticationContext;
  readonly credentialResolver?: GitCredentialResolver;
} => {
  if (token === null) return {};
  const authentication = dependencies.createAuthenticationContext();
  const credentialResolver: GitCredentialResolver = {
    resolve: (context) =>
      Promise.resolve(
        context.id === authentication.id ? { kind: "github_token", host: GITHUB_HOST, token } : null
      )
  };
  return { authentication, credentialResolver };
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
    const dependencies = { ...defaultDependencies, ...overrides };
    const authentication = authenticationForOperation(input.token, dependencies);
    const factory = dependencies.createGitWorkspaceFactory(authentication.credentialResolver);
    const templateWorkspace = await runWorkspaceStage(
      "template_clone_failed",
      "Unable to clone template repository.",
      async () => {
        const remote = createTrustedGitRemote(input.templateCloneUrl);
        if (remote === null) throw new Error("The template clone remote is invalid.");
        return await factory.clone({
          remote,
          destination: templateDirectory,
          checkout: "none",
          ...(authentication.authentication === undefined
            ? {}
            : { authentication: authentication.authentication })
        });
      }
    );
    const studentWorkspace = await runWorkspaceStage(
      "student_clone_failed",
      "Unable to clone student repository.",
      async () => {
        const remote = createTrustedGitRemote(input.studentCloneUrl);
        if (remote === null) throw new Error("The student clone remote is invalid.");
        return await factory.clone({
          remote,
          destination: studentDirectory,
          checkout: "none",
          ...(authentication.authentication === undefined
            ? {}
            : { authentication: authentication.authentication })
        });
      }
    );
    await runWorkspaceStage(
      "template_checkout_failed",
      "Unable to check out the requested template revision.",
      async () => {
        const revision = createExactCommitRevision(input.templateCommitSha);
        if (revision === null) throw new Error("The template commit is invalid.");
        await templateWorkspace.checkoutDetached(revision);
      }
    );
    const origin = createRemoteName("origin");
    if (origin === null) throw new Error("The origin remote name is invalid.");
    const studentDefaultBranch = await runWorkspaceStage(
      "student_checkout_failed",
      "Graider could not determine the repository default branch.",
      async () => {
        const branch = await studentWorkspace.remoteDefaultBranch(origin);
        if (branch === null) throw new Error("The remote default branch is unavailable.");
        return branch;
      }
    );
    await runWorkspaceStage(
      "student_checkout_failed",
      "Unable to check out the student default branch.",
      async () => {
        await studentWorkspace.createOrResetBranch({
          branch: studentDefaultBranch,
          startPoint: { remote: origin, branch: studentDefaultBranch }
        });
      }
    );
    result = await operation({
      gateway: new LocalGitTemplateSyncGateway({
        templateDirectory: templateWorkspace.root,
        studentDirectory: studentWorkspace.root
      }),
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
