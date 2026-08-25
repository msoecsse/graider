import type { LoadedGraiderConfig } from "../config/config-models.js";
import { createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import type { RosterStudent } from "../roster/roster-models.js";
import {
  buildGroupApplyPreviewPlan,
  type GroupApplyPreviewTarget
} from "./group-preview-planner.js";

export interface GroupApplyPreflightResult {
  targets: readonly GroupApplyPreviewTarget[];
  warnings: readonly Diagnostic[];
  errors: readonly Diagnostic[];
  mutationSupported: true;
}

export const runGroupApplyPreflight = async (input: {
  config: LoadedGraiderConfig;
  students: readonly RosterStudent[];
  githubClient: GitHubClient;
}): Promise<GroupApplyPreflightResult> => {
  const plan = buildGroupApplyPreviewPlan(input.config, input.students);
  if (plan.errors.length > 0)
    return {
      targets: plan.targets,
      warnings: plan.warnings,
      errors: plan.errors,
      mutationSupported: true
    };
  const errors: Diagnostic[] = [];
  for (const target of plan.targets) {
    const repository = await input.githubClient.getRepository(
      input.config.course.github.organization,
      target.repositoryName
    );
    if (repository !== null)
      errors.push(
        createConfigDiagnostic(
          "group_repository_untracked_collision",
          `Repository ${target.repositoryName} already exists and is not manifest-tracked. Graider will not adopt untracked repositories automatically. If this repository was created by a failed group Apply, delete it manually or use a future reconcile workflow, then run Apply again.`,
          { groupId: target.groupId, repositoryName: target.repositoryName }
        )
      );
  }
  return {
    targets: plan.targets,
    warnings: plan.warnings,
    errors,
    mutationSupported: true
  };
};
