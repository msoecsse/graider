import {
  syncAssignmentTemplate,
  type AssignmentTemplateSyncInput,
  type AssignmentTemplateSyncResult
} from "./assignment-template-sync.js";
import { runProductionRepositoryTemplateSync } from "./production-repository-sync-executor.js";
import { resolveStudentCloneUrl } from "./repository-clone-url.js";
import type { TemplateSyncResult } from "./template-sync.js";
import { createTemplateSyncOperationError } from "./template-sync-failure.js";

type RepositoryExecutor = typeof runProductionRepositoryTemplateSync;

export interface ProductionAssignmentTemplateSyncBridgeInput extends Omit<
  AssignmentTemplateSyncInput,
  "runRepositorySync"
> {
  token: string;
  templateCloneUrl: string;
  executor?: RepositoryExecutor;
  workspace: Omit<
    Parameters<RepositoryExecutor>[2],
    "token" | "templateCloneUrl" | "studentCloneUrl"
  >;
}

export const runProductionAssignmentTemplateSync = async (
  input: ProductionAssignmentTemplateSyncBridgeInput
): Promise<AssignmentTemplateSyncResult> => {
  const executor = input.executor ?? runProductionRepositoryTemplateSync;
  return await syncAssignmentTemplate({
    ...input,
    runRepositorySync: async (repository, targetTemplateCommitSha) => {
      const student = resolveStudentCloneUrl(repository.repository);
      if (student.status === "failure") {
        const error = createTemplateSyncOperationError(
          "invalid_repository",
          "Student repository identity is invalid.",
          new Error(student.message)
        );
        return {
          result: {
            status: "failure",
            error,
            failure: error.templateSyncFailure
          } as TemplateSyncResult
        };
      }
      return await executor(repository, targetTemplateCommitSha, {
        ...input.workspace,
        token: input.token,
        templateCloneUrl: input.templateCloneUrl,
        studentCloneUrl: student.cloneUrl
      });
    }
  });
};
