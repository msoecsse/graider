import { provideGithubClient, type GithubClientProvider } from "./githubClientProvider.js";
import type { ProcessRunner } from "./commandRunner.js";
import { normalizeTemplateRepository } from "./assignmentSetupService.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export interface TemplateRepositoryValidationResult {
  readonly valid: boolean;
  readonly repository: string | null;
  readonly branch: string | null;
  readonly diagnostics: readonly { readonly message: string }[];
}

export interface TemplateRepositoryValidationOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly provideClient?: GithubClientProvider;
  readonly resolveToken?: () => Promise<GithubTokenResolution>;
  readonly runner: ProcessRunner;
}

const diagnostic = (message: string) => ({ message });
const invalid = (
  repository: string | null,
  branch: string | null,
  message: string
): TemplateRepositoryValidationResult => ({
  valid: false,
  repository,
  branch,
  diagnostics: [diagnostic(message)]
});

export const validateTemplateRepository = async (
  repositoryInput: string,
  branchInput: string,
  options: TemplateRepositoryValidationOptions
): Promise<TemplateRepositoryValidationResult> => {
  const repository = normalizeTemplateRepository(repositoryInput);
  const explicitBranch = branchInput.trim();
  if (repository === null)
    return invalid(
      null,
      null,
      "Template repository value must be in owner/repo form or a GitHub repository URL."
    );
  const tokenResult = await (
    options.resolveToken ?? (() => resolveGithubToken({ env: options.env, runner: options.runner }))
  )();
  if (tokenResult.status === "failure")
    return invalid(
      repository,
      explicitBranch || null,
      "GitHub authentication is required. Sign in with GitHub CLI or configure the supported token before saving this assignment."
    );
  const [owner, repo] = repository.split("/");
  let selectedBranch: string | null = null;
  try {
    const githubClient = (options.provideClient ?? provideGithubClient)(tokenResult.token);
    const metadata = await githubClient.getRepository(owner ?? "", repo ?? "");
    if (metadata === null)
      return invalid(
        repository,
        explicitBranch || null,
        `Template repository was not found or is not accessible: ${repository}`
      );
    const branch = explicitBranch || metadata.defaultBranch;
    if (branch.trim().length === 0)
      return invalid(repository, null, "Template repository did not provide a default branch.");
    selectedBranch = branch;
    const branchResult = await githubClient.getRepositoryBranch(owner ?? "", repo ?? "", branch);
    if (branchResult === null)
      return invalid(
        repository,
        branch,
        `Template repository exists, but branch ${branch} was not found.`
      );
    return {
      valid: true,
      repository,
      branch,
      diagnostics: [
        diagnostic(
          explicitBranch
            ? "Template repository validated."
            : `Template repository validated. Using default branch: ${branch}.`
        )
      ]
    };
  } catch (error) {
    // Domain errors cross a generated CJS boundary, so inspect their public name/kind
    // rather than depending on the identity of a bundled Error constructor.
    if (
      error instanceof Error &&
      error.name === "GitHubClientError" &&
      "kind" in error &&
      (error.kind === "auth_missing" ||
        error.kind === "auth_failed" ||
        error.kind === "permission_denied" ||
        error.kind === "rate_limited" ||
        error.kind === "api_error")
    )
      return invalid(
        repository,
        selectedBranch ?? (explicitBranch || null),
        selectedBranch === null
          ? `Template repository was not found or is not accessible: ${repository}`
          : "Unable to validate the template branch. Check GitHub access and try again."
      );
    return invalid(
      repository,
      explicitBranch || null,
      "Unable to reach GitHub to validate the template repository. Try again when GitHub is available."
    );
  }
};
