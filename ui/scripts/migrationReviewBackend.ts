export { analyzeSchemaV1Migration } from "../../src/migration/schema-v1-migration-analyzer.js";
export { planAssignmentMigration } from "../../src/migration/assignment-migration-planner.js";
export type * from "../../src/migration/assignment-migration-models.js";
export {
  readSchemaV1MigrationAnalysis,
  readRuntimeMigrationManifests
} from "../../src/migration/migration-snapshot-reader.js";
export {
  validateMigrationReview,
  emptyMigrationReviewSubmission,
  migrationReviewSubmissionSchema,
  migrationReviewSource,
  freezeMigrationReview
} from "../../src/migration/migration-review-validation.js";
export { facultyIdentitySchema } from "../../src/config/config-schemas.js";
export type * from "../../src/migration/migration-models.js";
export type * from "../../src/migration/migration-review-models.js";

import fs from "node:fs";
import path from "node:path";
import { createDugiteGitRunners } from "../../src/git/dugite-git-runners.js";
import { GitCommandWorkspaceFactory } from "../../src/git/git-command-workspace.js";
import {
  readMigrationGitHistory,
  readRuntimeMigrationManifests
} from "../../src/migration/migration-snapshot-reader.js";
import type { MigrationSnapshot } from "../../src/migration/migration-models.js";

/** Optional existing cache/runtime evidence only. Never bootstrap, fetch, seed or register paths. */
export const readLocalMigrationReviewEvidence = async (
  sourceRoot: string,
  runtimeRoot: string,
  sha: string
) => {
  const runners = createDugiteGitRunners();
  const env = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_TERMINAL_PROMPT: "0"
  };
  const runGit: typeof runners.runGit = (request) => runners.runGit({ ...request, env });
  let history: MigrationSnapshot["history"];
  try {
    const workspace = await new GitCommandWorkspaceFactory({
      runGit,
      runGitBinary: (request) => runners.runGitBinary({ ...request, env })
    }).open(sourceRoot);
    const graft = (
      await runGit({ cwd: workspace.root, args: ["rev-parse", "--git-path", "info/grafts"] })
    ).trim();
    if (
      fs.realpathSync(sourceRoot) === workspace.root &&
      !fs.existsSync(path.resolve(workspace.root, graft))
    )
      history = await readMigrationGitHistory(workspace, sha, runGit);
  } catch {
    /* Remote-only review does not require a local Git repository. */
  }
  let runtime: MigrationSnapshot["runtime"];
  try {
    runtime = { coverage: "machine_local", files: readRuntimeMigrationManifests(runtimeRoot) };
  } catch {
    runtime = { coverage: "unavailable", files: {} };
  }
  return { ...(history === undefined ? {} : { history }), runtime };
};
