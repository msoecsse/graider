import { createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type {
  ManifestRepositoryTarget,
  ManifestStudentMapping
} from "../manifest/manifest-models.js";
import type { GroupTargetExecutionResult } from "./group-target-executor.js";
import type { GroupApplyPreviewTarget } from "./group-preview-planner.js";

export interface GroupApplyManifestFinalizationResult {
  readonly status: "success" | "failure";
  readonly targets: readonly ManifestRepositoryTarget[];
  readonly studentMappings: readonly ManifestStudentMapping[];
  readonly diagnostics: readonly Diagnostic[];
}

export const buildGroupApplyManifestV2 = (
  planned: readonly GroupApplyPreviewTarget[],
  execution: GroupTargetExecutionResult
): GroupApplyManifestFinalizationResult => {
  const plannedById = new Map(planned.map((target) => [target.targetId, target]));
  const invalidResult = execution.targets.find((result) => {
    const plannedTarget = plannedById.get(result.target.targetId);
    return (
      plannedTarget === undefined ||
      plannedTarget.repositoryName !== result.target.repositoryName ||
      plannedTarget.groupId !== result.target.groupId
    );
  });
  if (invalidResult !== undefined)
    return {
      status: "failure",
      targets: [],
      studentMappings: [],
      diagnostics: [
        createConfigDiagnostic(
          "group_apply_manifest_not_finalized",
          "Group Apply returned repository identity that does not match the planned target."
        )
      ]
    };
  const observedResults = execution.targets.filter((result) => result.htmlUrl !== null);
  const targets = observedResults.map((result) => ({
    targetId: result.target.targetId,
    mode: "group" as const,
    groupId: result.target.groupId,
    repositoryName: result.target.repositoryName,
    htmlUrl: result.htmlUrl as string,
    ...(result.cloneUrl === null ? {} : { cloneUrl: result.cloneUrl }),
    sectionIds: [...result.target.sectionIds],
    studentIds: [...result.target.studentIds],
    githubUsernames: [...result.target.githubUsernames],
    diagnostics: [...result.target.diagnostics, ...result.diagnostics]
  }));
  const studentMappings = observedResults.flatMap((result) =>
    result.target.studentIds.map((studentId, index) => ({
      studentId,
      githubUsername: result.target.githubUsernames[index] ?? "",
      targetId: result.target.targetId,
      repositoryName: result.target.repositoryName,
      htmlUrl: result.htmlUrl as string,
      ...(result.cloneUrl === null ? {} : { cloneUrl: result.cloneUrl })
    }))
  );
  return {
    status: "success",
    targets,
    studentMappings,
    diagnostics: [...execution.warnings, ...execution.errors]
  };
};
