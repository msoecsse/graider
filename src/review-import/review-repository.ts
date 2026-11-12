import {
  createExactCommitRevision,
  createRelativeGitPath,
  createRemoteName,
  isObjectId,
  type GitWorkspacePreparer
} from "../git/git-workspace.js";
import {
  GRAIDER_MANAGED_WORKFLOW_PATH,
  classifyManagedWorkflow
} from "../workflows/managed-workflow-policy.js";
import { MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE } from "../workflows/managed-workflow-deployment.js";
import type { ReviewRepositoryReader } from "./review-plan-models.js";

// Matches the workspace history API's bound. Older/unavailable history requires
// explicit resolution; never fetch or infer membership from an arbitrary object.
export const MAX_REVIEW_HISTORY_COMMITS = 100;
export const createReviewRepositoryReader = (
  workspace: Pick<
    GitWorkspacePreparer,
    "remoteUrl" | "resolveRevision" | "listCommits" | "readRevisionFile" | "listTree"
  >,
  canonicalWorkflow?: string
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
  async isReviewableSubmissionUnchanged(reviewedSha, currentSha) {
    if (canonicalWorkflow === undefined || !isObjectId(reviewedSha) || !isObjectId(currentSha))
      return false;
    try {
      const commits = await workspace.listCommits({
        anchor: currentSha,
        maximumCount: MAX_REVIEW_HISTORY_COMMITS
      });
      const reviewedIndex = commits.findIndex((commit) => commit.id === reviewedSha);
      if (commits[0]?.id !== currentSha || reviewedIndex <= 0) return false;
      const before = await workspace.listTree(reviewedSha);
      const reviewableTree = (entries: typeof before): string =>
        JSON.stringify(
          entries
            .filter((entry) => entry.path !== GRAIDER_MANAGED_WORKFLOW_PATH)
            .map((entry) => [entry.path, entry.objectId, entry.mode, entry.objectType])
            .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
        );
      const baseline = reviewableTree(before);
      const originalWorkflow = before.find((entry) => entry.path === GRAIDER_MANAGED_WORKFLOW_PATH);
      if (originalWorkflow !== undefined) {
        if (originalWorkflow.objectType !== "blob" || originalWorkflow.mode !== "100644")
          return false;
        const content = await workspace.readRevisionFile(
          reviewedSha,
          GRAIDER_MANAGED_WORKFLOW_PATH
        );
        const classification = classifyManagedWorkflow(content, canonicalWorkflow).classification;
        if (classification !== "identical" && classification !== "managed_outdated") return false;
      }
      for (const commit of commits.slice(0, reviewedIndex)) {
        if (commit.subject !== MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE) return false;
        const entries = await workspace.listTree(commit.id);
        if (reviewableTree(entries) !== baseline) return false;
        const workflow = entries.find((entry) => entry.path === GRAIDER_MANAGED_WORKFLOW_PATH);
        if (workflow?.objectType !== "blob" || workflow.mode !== "100644") return false;
        const content = await workspace.readRevisionFile(commit.id, GRAIDER_MANAGED_WORKFLOW_PATH);
        // Exact generated content from trusted assignment config, never a marker alone.
        if (content !== canonicalWorkflow) return false;
      }
      return true;
    } catch {
      return false;
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
