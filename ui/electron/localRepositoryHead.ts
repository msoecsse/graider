import {
  getProductionGitWorkspaceFactory,
  type GitWorkspaceReaderFactory
} from "./gitWorkspaceReader.js";

const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;

export type LocalRepositoryHeadResult =
  | { readonly status: "success"; readonly submissionCommitSha: string }
  | { readonly status: "submission_commit_unavailable" };

export const createLocalRepositoryHeadReader =
  (factory?: GitWorkspaceReaderFactory) =>
  async (repositoryRoot: string): Promise<LocalRepositoryHeadResult> => {
    try {
      const workspace = await (factory ?? getProductionGitWorkspaceFactory()).open(repositoryRoot);
      const submissionCommitSha = await workspace.resolveHead();
      return COMMIT_SHA_PATTERN.test(submissionCommitSha)
        ? { status: "success", submissionCommitSha }
        : { status: "submission_commit_unavailable" };
    } catch {
      return { status: "submission_commit_unavailable" };
    }
  };

export const readLocalRepositoryHead = createLocalRepositoryHeadReader();
