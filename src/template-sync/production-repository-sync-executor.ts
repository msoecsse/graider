import type { ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import {
  withProductionTemplateSyncWorkspace,
  type ProductionTemplateSyncWorkspaceInput
} from "./production-template-sync-workspace.js";
import {
  syncTemplateUpdate,
  type TemplateSyncAnchors,
  type TemplateSyncResult
} from "./template-sync.js";
import { getTemplateSyncFailure } from "./template-sync-failure.js";

export const runProductionRepositoryTemplateSync = async (
  repository: ManifestRepositoryRecord,
  targetTemplateCommitSha: string,
  workspace: Omit<
    ProductionTemplateSyncWorkspaceInput,
    "templateCommitSha" | "studentDefaultBranch"
  >
): Promise<{ result: TemplateSyncResult; anchors?: Required<TemplateSyncAnchors> }> => {
  let anchors: Required<TemplateSyncAnchors> | undefined;
  let result: TemplateSyncResult;
  try {
    result = await withProductionTemplateSyncWorkspace(
      { ...workspace, templateCommitSha: targetTemplateCommitSha },
      async ({ gateway, pullRequests, studentDefaultBranch }) =>
        await syncTemplateUpdate({
          templateRepository: {
            owner: repository.repository.owner,
            name: repository.repository.templateRepository.split("/").at(-1) ?? "template"
          },
          studentRepository: {
            owner: repository.repository.owner,
            name: repository.repository.name,
            defaultBranch: studentDefaultBranch
          },
          currentTemplateCommitSha: targetTemplateCommitSha,
          anchors: {
            ...(repository.repository.templateCommitSha === undefined
              ? {}
              : { templateCommitSha: repository.repository.templateCommitSha }),
            ...(repository.repository.studentDefaultBranchCommitSha === undefined
              ? {}
              : {
                  studentDefaultBranchCommitSha: repository.repository.studentDefaultBranchCommitSha
                }),
            templateSyncBaselineStatus:
              repository.repository.templateSyncBaselineStatus ?? "baseline_required"
          },
          gateway,
          pullRequests,
          updateAnchors: async (updated) => {
            anchors = updated;
          }
        })
    );
  } catch (error: unknown) {
    const failure = getTemplateSyncFailure(error);
    result = {
      status: "failure",
      error,
      ...(failure === undefined ? {} : { failure })
    };
  }
  return anchors === undefined ? { result } : { result, anchors };
};
