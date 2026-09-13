import type { LoadedGraiderConfig } from "../config/config-models.js";
import { createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import type { Manifest } from "../manifest/manifest-models.js";
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
  trackedTargetIds: ReadonlySet<string>;
}

export const runGroupApplyPreflight = async (input: {
  config: LoadedGraiderConfig;
  students: readonly RosterStudent[];
  githubClient: GitHubClient;
  manifest?: Manifest;
}): Promise<GroupApplyPreflightResult> => {
  const plan = buildGroupApplyPreviewPlan(input.config, input.students);
  const trackedTargets = new Map(
    (input.manifest?.targets ?? []).map((target) => [target.targetId, target])
  );
  const trackedTargetIds = new Set<string>();
  if (plan.errors.length > 0)
    return {
      targets: plan.targets,
      warnings: plan.warnings,
      errors: plan.errors,
      mutationSupported: true,
      trackedTargetIds
    };
  const errors: Diagnostic[] = [];
  for (const target of plan.targets) {
    const tracked = trackedTargets.get(target.targetId);
    if (tracked !== undefined && tracked.repositoryName !== target.repositoryName) {
      errors.push(
        createConfigDiagnostic(
          "group_manifest_target_mismatch",
          `Manifest target ${target.targetId} does not match planned repository ${target.repositoryName}.`,
          {
            groupId: target.groupId,
            repositoryName: target.repositoryName,
            manifestRepositoryName: tracked.repositoryName
          }
        )
      );
      continue;
    }
    const repository = await input.githubClient.getRepository(
      input.config.course.github.organization,
      target.repositoryName
    );
    if (tracked !== undefined && repository === null) {
      errors.push(
        createConfigDiagnostic(
          "manifest_tracked_repository_missing",
          `Manifest-tracked repository ${target.repositoryName} was not found on GitHub.`,
          { groupId: target.groupId, repositoryName: target.repositoryName }
        )
      );
    } else if (tracked !== undefined) {
      trackedTargetIds.add(target.targetId);
    } else if (repository !== null)
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
    mutationSupported: true,
    trackedTargetIds
  };
};
