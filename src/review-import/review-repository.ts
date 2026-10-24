import {
  createExactCommitRevision,
  createRelativeGitPath,
  createRemoteName,
  isObjectId,
  type GitWorkspacePreparer
} from "../git/git-workspace.js";
import type { ReviewRepositoryReader } from "./review-plan-models.js";

// Matches the workspace history API's bound. Older/unavailable history requires
// explicit resolution; never fetch or infer membership from an arbitrary object.
export const MAX_REVIEW_HISTORY_COMMITS = 100;
export const createReviewRepositoryReader = (
  workspace: Pick<
    GitWorkspacePreparer,
    "remoteUrl" | "resolveRevision" | "listCommits" | "readRevisionFile" | "listTree"
  >
): ReviewRepositoryReader => ({
  async matchesRepository(owner, name) {
    const origin = createRemoteName("origin");
    if (origin === null) return false;
    const remote = await workspace.remoteUrl(origin);
    const expected = `${owner}/${name}`.toLowerCase();
    return (
      remote !== null &&
      [
        `https://github.com/${expected}.git`,
        `https://github.com/${expected}`,
        `git@github.com:${expected}.git`,
        `git@github.com:${expected}`,
        `ssh://git@github.com/${expected}.git`,
        `ssh://git@github.com/${expected}`
      ].includes(remote.toLowerCase())
    );
  },
  async isInHistory(reviewedSha, currentSha) {
    const reviewed = createExactCommitRevision(reviewedSha);
    const current = createExactCommitRevision(currentSha);
    if (reviewed === null || current === null) return false;
    try {
      const resolvedCurrent = await workspace.resolveRevision(current);
      const resolvedReviewed = await workspace.resolveRevision(reviewed);
      if (
        resolvedCurrent.toLowerCase() !== currentSha ||
        resolvedReviewed.toLowerCase() !== reviewedSha
      )
        return false;
      if (reviewedSha === currentSha) return true;
      const commits = await workspace.listCommits({
        anchor: resolvedCurrent,
        maximumCount: MAX_REVIEW_HISTORY_COMMITS
      });
      return commits.some((commit) => commit.id.toLowerCase() === reviewedSha)
        ? true
        : commits.length === MAX_REVIEW_HISTORY_COMMITS
          ? null
          : false;
    } catch {
      return null;
    }
  },
  async readRevisionFile(sha, file) {
    if (!isObjectId(sha) || createRelativeGitPath(file) !== file) return null;
    // Read Git blobs, never working-tree paths or symlink targets.
    const entries = await workspace.listTree(sha);
    const entry = entries.find((candidate) => candidate.path === file);
    return entry?.objectType === "blob" && (entry.mode === "100644" || entry.mode === "100755")
      ? workspace.readRevisionFile(sha, file)
      : null;
  }
});
