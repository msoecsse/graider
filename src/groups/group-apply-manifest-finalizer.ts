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
  const failed =
    execution.errors.length > 0 ||
    execution.targets.length !== planned.length ||
    execution.targets.some(
      (result, index) =>
        result.status !== "created" ||
        result.target.targetId !== planned[index]?.targetId ||
        result.htmlUrl === null
    );
  if (failed)
    return {
      status: "failure",
      targets: [],
      studentMappings: [],
      diagnostics: [
        createConfigDiagnostic(
          "group_apply_manifest_not_finalized",
          "Group Apply did not complete successfully, so no manifest can be finalized."
        )
      ]
    };
  const targets = execution.targets.map((result) => ({
    targetId: result.target.targetId,
    mode: "group" as const,
    groupId: result.target.groupId,
    repositoryName: result.target.repositoryName,
    htmlUrl: result.htmlUrl as string,
    ...(result.cloneUrl === null ? {} : { cloneUrl: result.cloneUrl }),
    sectionIds: [...result.target.sectionIds],
    studentIds: [...result.target.studentIds],
    githubUsernames: [...result.target.githubUsernames],
    diagnostics: [...result.diagnostics]
  }));
  const studentMappings = execution.targets.flatMap((result) =>
    result.target.studentIds.map((studentId, index) => ({
      studentId,
      githubUsername: result.target.githubUsernames[index] ?? "",
      targetId: result.target.targetId,
      repositoryName: result.target.repositoryName,
      htmlUrl: result.htmlUrl as string,
      ...(result.cloneUrl === null ? {} : { cloneUrl: result.cloneUrl })
    }))
  );
  return { status: "success", targets, studentMappings, diagnostics: [] };
};
