import type { CommonCommandOptions } from "../core/command-context.js";
import { evaluateMutationGuard, type MutationGuardResult } from "../execution/mutation-guard.js";
import type { Manifest, ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import { updateRepositoryIdentity } from "../manifest/manifest-updater.js";
import type { InitializedTemplateSyncAnchors, TemplateSyncResult } from "./template-sync.js";
import { getTemplateSyncFailure } from "./template-sync-failure.js";
import type { TemplateSyncFailure } from "./template-sync-failure.js";

const FIRST_REPOSITORY_POSITION = 1;

export interface AssignmentTemplateSyncProgress {
  readonly current: number;
  readonly total: number;
  readonly studentId: string;
  readonly repository: string;
}

export interface AssignmentTemplateSyncInput {
  manifest: Manifest;
  /** Optional trusted manifest selector; absence preserves assignment-wide synchronization. */
  studentId?: string;
  options: CommonCommandOptions;
  resolveCurrentTemplateCommitSha(): Promise<string>;
  runRepositorySync(
    repository: ManifestRepositoryRecord,
    targetTemplateCommitSha: string
  ): Promise<{ result: TemplateSyncResult; anchors?: InitializedTemplateSyncAnchors }>;
  persistManifest(manifest: Manifest): Promise<void>;
  /** Observational only; delivery failures must not affect repository synchronization. */
  onProgress?: (progress: AssignmentTemplateSyncProgress) => void;
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
  | {
      status: "failure";
      error: unknown;
      failure?: TemplateSyncFailure;
      outcomes: AssignmentTemplateSyncRepositoryOutcome[];
    };

export const isApplicableRepository = (
  repository: ManifestRepositoryRecord,
  manifest: Manifest
): boolean =>
  manifest.template !== undefined &&
  repository.repository.createdFromTemplate &&
  repository.repository.templateRepository !== undefined &&
  repository.repository.templateRepository === manifest.template.repository &&
  !["archived", "access_removed", "missing", "error"].includes(repository.lifecycle.status);

export const syncAssignmentTemplate = async (
  input: AssignmentTemplateSyncInput
): Promise<AssignmentTemplateSyncResult> => {
  const guard = evaluateMutationGuard({ options: input.options });
  if (!guard.allowed) return { status: "blocked", guard, outcomes: [] };
  if (input.studentId !== undefined && input.manifest.repositoryMode === "group")
    return {
      status: "failure",
      error: new Error(
        "Single-student template synchronization is available only for individual repositories."
      ),
      outcomes: []
    };

  const applicableRepositories = input.manifest.repositories.filter((candidate) =>
    isApplicableRepository(candidate, input.manifest)
  );
  const repositories =
    input.studentId === undefined
      ? applicableRepositories
      : applicableRepositories.filter((repository) => repository.studentId === input.studentId);
  if (input.studentId !== undefined && repositories.length !== 1)
    return {
      status: "failure",
      error: new Error("The selected student does not have an applicable repository to update."),
      outcomes: []
    };

  let templateCommitSha: string;
  try {
    templateCommitSha = await input.resolveCurrentTemplateCommitSha();
  } catch (error: unknown) {
    const failure = getTemplateSyncFailure(error);
    return {
      status: "failure",
      error,
      outcomes: [],
      ...(failure === undefined ? {} : { failure })
    };
  }

  let manifest = input.manifest;
  const outcomes: AssignmentTemplateSyncRepositoryOutcome[] = [];
  let hasPersistedAnchorChanges = false;

  for (const [index, repository] of repositories.entries()) {
    try {
      input.onProgress?.({
        current: index + FIRST_REPOSITORY_POSITION,
        total: repositories.length,
        studentId: repository.studentId,
        repository: repository.repository.fullName
      });
    } catch {
      // Progress delivery is deliberately isolated from synchronization behavior.
    }
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
      const failure = getTemplateSyncFailure(error);
      outcomes.push({
        studentId: repository.studentId,
        repository: repository.repository.fullName,
        result: {
          status: "failure",
          error,
          ...(failure === undefined ? {} : { failure })
        }
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
