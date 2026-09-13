import { runLocalGit, type LocalGitReader } from "./localRepositoryHead.js";

export const MAX_GRADING_COMMIT_HISTORY_COUNT = 10;
const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const LOG_FORMAT = "%H%x00%cI%x00%s%x00";

export interface GradingCommitDto {
  readonly sha: string;
  readonly committedAt: string;
  readonly message: string;
}

export type LocalRepositoryCommitHistoryResult =
  | { readonly status: "success"; readonly commits: readonly GradingCommitDto[] }
  | { readonly status: "submission_commit_unavailable" }
  | { readonly status: "commit_history_unavailable" };

const parseCommitHistory = (stdout: string): readonly GradingCommitDto[] | null => {
  if (stdout === "") return null;
  const fields = stdout.split("\u0000");
  const trailing = fields.pop();
  if (trailing === undefined || trailing.trim() !== "" || fields.length % 3 !== 0) return null;
  const commits: GradingCommitDto[] = [];
  for (let index = 0; index < fields.length; index += 3) {
    const sha = fields[index]?.replace(/^\r?\n/u, "") ?? "";
    const committedAt = fields[index + 1] ?? "";
    const message = fields[index + 2] ?? "";
    if (
      !COMMIT_SHA_PATTERN.test(sha) ||
      !ISO_TIMESTAMP_PATTERN.test(committedAt) ||
      !Number.isFinite(Date.parse(committedAt))
    )
      return null;
    commits.push({
      sha,
      committedAt,
      message: message.replace(ANSI_ESCAPE_PATTERN, "").replace(CONTROL_CHARACTER_PATTERN, "")
    });
  }
  return commits.length === 0 ? null : commits.slice(0, MAX_GRADING_COMMIT_HISTORY_COUNT);
};

export const createLocalRepositoryCommitHistoryReader =
  (runGit: LocalGitReader = runLocalGit) =>
  async (
    repositoryRoot: string,
    submissionCommitSha: string
  ): Promise<LocalRepositoryCommitHistoryResult> => {
    if (!COMMIT_SHA_PATTERN.test(submissionCommitSha))
      return { status: "submission_commit_unavailable" };
    try {
      await runGit(repositoryRoot, ["cat-file", "-e", `${submissionCommitSha}^{commit}`]);
    } catch {
      return { status: "submission_commit_unavailable" };
    }
    let stdout: string;
    try {
      stdout = await runGit(repositoryRoot, [
        "log",
        `--max-count=${MAX_GRADING_COMMIT_HISTORY_COUNT}`,
        `--format=${LOG_FORMAT}`,
        submissionCommitSha,
        "--"
      ]);
    } catch {
      return { status: "commit_history_unavailable" };
    }
    const commits = parseCommitHistory(stdout);
    return commits === null || commits[0]?.sha.toLowerCase() !== submissionCommitSha.toLowerCase()
      ? { status: "commit_history_unavailable" }
      : { status: "success", commits };
  };

export const readLocalRepositoryCommitHistory = createLocalRepositoryCommitHistoryReader();
