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

export const runProductionRepositoryTemplateSync = async (
  repository: ManifestRepositoryRecord,
  targetTemplateCommitSha: string,
  workspace: Omit<
    ProductionTemplateSyncWorkspaceInput,
    "templateCommitSha" | "studentDefaultBranch"
  >
): Promise<{ result: TemplateSyncResult; anchors?: Required<TemplateSyncAnchors> }> => {
  let anchors: Required<TemplateSyncAnchors> | undefined;
  const result = await withProductionTemplateSyncWorkspace(
    { ...workspace, templateCommitSha: targetTemplateCommitSha, studentDefaultBranch: "main" },
    async ({ gateway, pullRequests }) =>
      await syncTemplateUpdate({
        templateRepository: {
          owner: repository.repository.owner,
          name: repository.repository.templateRepository.split("/").at(-1) ?? "template"
        },
        studentRepository: {
          owner: repository.repository.owner,
          name: repository.repository.name,
          defaultBranch: "main"
        },
        currentTemplateCommitSha: targetTemplateCommitSha,
        anchors: {
          templateCommitSha: repository.repository.templateCommitSha,
          studentDefaultBranchCommitSha: repository.repository.studentDefaultBranchCommitSha,
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
  return anchors === undefined ? { result } : { result, anchors };
};
