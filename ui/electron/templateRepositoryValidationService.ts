import type { ProcessRunner } from "./commandRunner.js";
import { normalizeTemplateRepository } from "./assignmentSetupService.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

const GITHUB_API_ROOT = "https://api.github.com";

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

type FetchImplementation = (
  input: string,
  init: { readonly headers: Readonly<Record<string, string>> }
) => Promise<FetchResponse>;

export interface TemplateRepositoryValidationResult {
  readonly valid: boolean;
  readonly repository: string | null;
  readonly branch: string | null;
  readonly diagnostics: readonly { readonly message: string }[];
}

export interface TemplateRepositoryValidationOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImplementation?: FetchImplementation;
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
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${tokenResult.token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const fetchImplementation =
    options.fetchImplementation ?? (globalThis.fetch as FetchImplementation);
  try {
    const repositoryResponse = await fetchImplementation(
      `${GITHUB_API_ROOT}/repos/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}`,
      { headers }
    );
    if (!repositoryResponse.ok)
      return invalid(
        repository,
        explicitBranch || null,
        `Template repository was not found or is not accessible: ${repository}`
      );
    const metadata = await repositoryResponse.json();
    const metadataRecord =
      typeof metadata === "object" && metadata !== null
        ? (metadata as Record<string, unknown>)
        : null;
    const defaultBranchValue = metadataRecord?.default_branch;
    const defaultBranch = typeof defaultBranchValue === "string" ? defaultBranchValue : null;
    const branch = explicitBranch || defaultBranch;
    if (branch === null || branch.trim().length === 0)
      return invalid(repository, null, "Template repository did not provide a default branch.");
    const branchResponse = await fetchImplementation(
      `${GITHUB_API_ROOT}/repos/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(repo ?? "")}/branches/${encodeURIComponent(branch)}`,
      { headers }
    );
    if (branchResponse.status === 404)
      return invalid(
        repository,
        branch,
        `Template repository exists, but branch ${branch} was not found.`
      );
    if (!branchResponse.ok)
      return invalid(
        repository,
        branch,
        "Unable to validate the template branch. Check GitHub access and try again."
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
  } catch {
    return invalid(
      repository,
      explicitBranch || null,
      "Unable to reach GitHub to validate the template repository. Try again when GitHub is available."
    );
  }
};
