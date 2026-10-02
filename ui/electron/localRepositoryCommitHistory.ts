import {
  getSystemGitWorkspaceFactory,
  type GitCommitSummary,
  type GitWorkspaceReader,
  type GitWorkspaceReaderFactory
} from "./gitWorkspaceReader.js";

export const MAX_GRADING_COMMIT_HISTORY_COUNT = 10;
const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;

export interface GradingCommitDto {
  readonly sha: string;
  readonly committedAt: string;
  readonly message: string;
}

export type LocalRepositoryCommitHistoryResult =
  | { readonly status: "success"; readonly commits: readonly GradingCommitDto[] }
  | { readonly status: "submission_commit_unavailable" }
  | { readonly status: "commit_history_unavailable" };

const mapCommitHistory = (
  summaries: readonly GitCommitSummary[]
): readonly GradingCommitDto[] | null => {
  if (summaries.length === 0) return null;
  const commits: GradingCommitDto[] = [];
  for (const summary of summaries.slice(0, MAX_GRADING_COMMIT_HISTORY_COUNT)) {
    const { id: sha, committedAt, subject } = summary;
    if (
      !COMMIT_SHA_PATTERN.test(sha) ||
      !ISO_TIMESTAMP_PATTERN.test(committedAt) ||
      !Number.isFinite(Date.parse(committedAt))
    )
      return null;
    commits.push({
      sha,
      committedAt,
      message: subject.replace(ANSI_ESCAPE_PATTERN, "").replace(CONTROL_CHARACTER_PATTERN, "")
    });
  }
  return commits;
};

export const createLocalRepositoryCommitHistoryReader =
  (factory?: GitWorkspaceReaderFactory) =>
  async (
    repositoryRoot: string,
    submissionCommitSha: string
  ): Promise<LocalRepositoryCommitHistoryResult> => {
    if (!COMMIT_SHA_PATTERN.test(submissionCommitSha))
      return { status: "submission_commit_unavailable" };
    let workspace: GitWorkspaceReader;
    let resolvedSubmissionCommitSha: string;
    try {
      workspace = await (factory ?? getSystemGitWorkspaceFactory()).open(repositoryRoot);
      resolvedSubmissionCommitSha = await workspace.resolveRevision(submissionCommitSha);
    } catch {
      return { status: "submission_commit_unavailable" };
    }
    let summaries: readonly GitCommitSummary[];
    try {
      summaries = await workspace.listCommits({
        anchor: resolvedSubmissionCommitSha,
        maximumCount: MAX_GRADING_COMMIT_HISTORY_COUNT
      });
    } catch {
      return { status: "commit_history_unavailable" };
    }
    const commits = mapCommitHistory(summaries);
    return commits === null || commits[0]?.sha.toLowerCase() !== submissionCommitSha.toLowerCase()
      ? { status: "commit_history_unavailable" }
      : { status: "success", commits };
  };

export const readLocalRepositoryCommitHistory = createLocalRepositoryCommitHistoryReader();
