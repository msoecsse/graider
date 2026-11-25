import { loadGraiderConfig } from "../config/config-loader.js";
import { createDugiteGitWorkspaceFactory } from "../git/dugite-git-workspace-context.js";
import { isObjectId, type GitWorkspaceReader, type ObjectId } from "../git/git-workspace.js";
import type { GradingStatePathRequest } from "./grading-state.js";
import {
  generatedSubmissionPaths,
  readStudentSubmissionTree,
  submissionTreesDiffer
} from "./submission-content.js";

const MAX_CONTENT_COMPARISONS = 100;
const MAX_CACHED_SUBMISSIONS = 128;
const SINGLE_COMMIT = 1;
const TIMESTAMP_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

/** The first-parent commit that last changed submission content, not feedback HEAD.
 * A lone root may be a template or a shallow boundary: never guess its ownership.
 * No worktree reads, fetches, state writes, author-name heuristics or wall-clock time.
 */
export const findStudentSubmissionTime = async (
  workspace: Pick<GitWorkspaceReader, "listFirstParentCommitTrees" | "listCommits"> & {
    listTree(sha: string): ReturnType<GitWorkspaceReader["listTree"]>;
  },
  anchor: ObjectId,
  excludedPaths: Iterable<string>
): Promise<string | null> => {
  try {
    const history = await workspace.listFirstParentCommitTrees(anchor);
    if (history[0]?.commit !== anchor) return null;
    const generatedPaths = new Set(excludedPaths);
    let newerTree: ReadonlyMap<string, string> | undefined;
    const comparisonCount = Math.min(history.length - 1, MAX_CONTENT_COMPARISONS);
    for (let index = 0; index < comparisonCount; index += 1) {
      const newer = history[index];
      const older = history[index + 1];
      if (newer === undefined || older === undefined) return null;
      newerTree ??= await readStudentSubmissionTree(workspace, newer.commit, generatedPaths);
      const olderTree = await readStudentSubmissionTree(workspace, older.commit, generatedPaths);
      if (submissionTreesDiffer(newerTree, olderTree)) {
        const commit = (
          await workspace.listCommits({ anchor: newer.commit, maximumCount: SINGLE_COMMIT })
        )[0];
        return commit?.id === newer.commit &&
          TIMESTAMP_WITH_TIMEZONE.test(commit.committedAt) &&
          Number.isFinite(Date.parse(commit.committedAt))
          ? commit.committedAt
          : null;
      }
      newerTree = olderTree;
    }
    return null;
  } catch {
    return null;
  }
};

const submissionTimes = new Map<string, string>();

export const readGradingStudentSubmissionTime = async (
  request: GradingStatePathRequest & {
    readonly repositoryRoot: string;
    readonly submissionCommitSha: string;
  }
): Promise<string | null> => {
  if (!isObjectId(request.submissionCommitSha)) return null;
  const config = loadGraiderConfig({
    cwd: request.courseRoot,
    assignmentFile: `terms/${request.termCode}/assignments/${request.assignmentSlug}/assignment.yml`
  });
  // No timing computation is needed when the assignment has no due date.
  if (config.status !== "success" || config.config.assignment.deadline === undefined) return null;
  const generatedPaths = generatedSubmissionPaths(request);
  // Immutable commit identities + output-path policy make this safe across student
  // navigation and report publication. A follow-up student commit gets a new key.
  const key = JSON.stringify([
    request.repositoryRoot,
    request.submissionCommitSha,
    [...generatedPaths]
  ]);
  const cached = submissionTimes.get(key);
  if (cached !== undefined) return cached;
  try {
    const workspace = await createDugiteGitWorkspaceFactory().open(request.repositoryRoot);
    const submittedAt = await findStudentSubmissionTime(
      workspace,
      request.submissionCommitSha,
      generatedPaths
    );
    if (submittedAt !== null) {
      if (submissionTimes.size >= MAX_CACHED_SUBMISSIONS) submissionTimes.clear();
      submissionTimes.set(key, submittedAt);
    }
    return submittedAt;
  } catch {
    return null;
  }
};
