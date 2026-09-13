import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;

export type LocalRepositoryHeadResult =
  | { readonly status: "success"; readonly submissionCommitSha: string }
  | { readonly status: "submission_commit_unavailable" };

export type LocalGitReader = (
  repositoryRoot: string,
  arguments_: readonly string[]
) => Promise<string>;

export const runLocalGit: LocalGitReader = async (repositoryRoot, arguments_) => {
  const result = await execFileAsync("git", arguments_, {
    cwd: repositoryRoot,
    shell: false,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    encoding: "utf8"
  });
  return result.stdout;
};

export const createLocalRepositoryHeadReader =
  (runGit: LocalGitReader = runLocalGit) =>
  async (repositoryRoot: string): Promise<LocalRepositoryHeadResult> => {
    try {
      const submissionCommitSha = (
        await runGit(repositoryRoot, ["rev-parse", "--verify", "HEAD"])
      ).trim();
      return COMMIT_SHA_PATTERN.test(submissionCommitSha)
        ? { status: "success", submissionCommitSha }
        : { status: "submission_commit_unavailable" };
    } catch {
      return { status: "submission_commit_unavailable" };
    }
  };

export const readLocalRepositoryHead = createLocalRepositoryHeadReader();
