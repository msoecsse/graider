import type { CommonCommandOptions } from "../core/command-context.js";
import { evaluateMutationGuard, type MutationGuardResult } from "../execution/mutation-guard.js";
import type { Manifest, ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import { updateRepositoryIdentity } from "../manifest/manifest-updater.js";
import type { TemplateSyncAnchors, TemplateSyncResult } from "./template-sync.js";

export interface AssignmentTemplateSyncInput {
  manifest: Manifest;
  options: CommonCommandOptions;
  resolveCurrentTemplateCommitSha(): Promise<string>;
  runRepositorySync(
    repository: ManifestRepositoryRecord,
    targetTemplateCommitSha: string
  ): Promise<{ result: TemplateSyncResult; anchors?: Required<TemplateSyncAnchors> }>;
  persistManifest(manifest: Manifest): Promise<void>;
}

export interface AssignmentTemplateSyncRepositoryOutcome {
  studentId: string;
  repository: string;
  result: TemplateSyncResult;
}

export type AssignmentTemplateSyncResult =
  | { status: "blocked"; guard: MutationGuardResult; outcomes: [] }
  | {
      status: "completed" | "completed_with_failures";
      templateCommitSha: string;
      outcomes: AssignmentTemplateSyncRepositoryOutcome[];
      manifest: Manifest;
      persistenceError?: unknown;
    }
  | { status: "failure"; error: unknown; outcomes: AssignmentTemplateSyncRepositoryOutcome[] };

export const isApplicableRepository = (
  repository: ManifestRepositoryRecord,
  manifest: Manifest
): boolean =>
  repository.repository.createdFromTemplate &&
  repository.repository.templateRepository === manifest.template.repository &&
  !["archived", "access_removed", "missing", "error"].includes(repository.lifecycle.status);

const hasAnchorUpdate = (
  result: TemplateSyncResult
): result is Extract<TemplateSyncResult, { status: "updated" | "pull_request_reconciled" }> =>
  result.status === "updated" || result.status === "pull_request_reconciled";

export const syncAssignmentTemplate = async (
  input: AssignmentTemplateSyncInput
): Promise<AssignmentTemplateSyncResult> => {
  const guard = evaluateMutationGuard({ options: input.options });
  if (!guard.allowed) return { status: "blocked", guard, outcomes: [] };

  let templateCommitSha: string;
  try {
    templateCommitSha = await input.resolveCurrentTemplateCommitSha();
  } catch (error: unknown) {
    return { status: "failure", error, outcomes: [] };
  }

  let manifest = input.manifest;
  const outcomes: AssignmentTemplateSyncRepositoryOutcome[] = [];
  let hasPersistedAnchorChanges = false;

  for (const repository of input.manifest.repositories.filter((candidate) =>
    isApplicableRepository(candidate, input.manifest)
  )) {
    try {
      const execution = await input.runRepositorySync(repository, templateCommitSha);
      const result = execution.result;
      if (execution.anchors !== undefined) {
        manifest = updateRepositoryIdentity(manifest, {
          studentId: repository.studentId,
          repository: execution.anchors
        });
        hasPersistedAnchorChanges = true;
      }
      outcomes.push({
        studentId: repository.studentId,
        repository: repository.repository.fullName,
        result
      });
    } catch (error: unknown) {
      outcomes.push({
        studentId: repository.studentId,
        repository: repository.repository.fullName,
        result: { status: "failure", error }
      });
    }
  }

  if (hasPersistedAnchorChanges) {
    try {
      await input.persistManifest(manifest);
    } catch (persistenceError: unknown) {
      return {
        status: "completed_with_failures",
        templateCommitSha,
        outcomes,
        manifest,
        persistenceError
      };
    }
  }

  return {
    status: outcomes.some((outcome) => outcome.result.status === "failure")
      ? "completed_with_failures"
      : "completed",
    templateCommitSha,
    outcomes,
    manifest
  };
};
