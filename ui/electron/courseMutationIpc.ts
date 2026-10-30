import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "./ipc.js";
import {
  CourseMutationBlocked,
  blockMutation,
  type ManagedCourseMutationGuard
} from "./managedCourseMutationGuard.js";
import { COURSE_MUTATION_NOTICE } from "./managedCourseMutationTypes.js";

/** Explicit inventory: all handlers are wrapped before their first local/remote write. */
export const COURSE_MUTATION_CHANNELS: readonly string[] = [
  IPC_CHANNELS.saveCourseSetup,
  IPC_CHANNELS.saveRoster,
  IPC_CHANNELS.removeRoster,
  IPC_CHANNELS.removeSection,
  IPC_CHANNELS.saveAssignmentSetup,
  IPC_CHANNELS.saveAssignmentEdit,
  IPC_CHANNELS.deleteAssignment,
  IPC_CHANNELS.saveAssignmentGroupConfig,
  IPC_CHANNELS.saveStudentAccessPagesConfig,
  IPC_CHANNELS.createGradingLibraryComment,
  IPC_CHANNELS.editGradingLibraryComment,
  IPC_CHANNELS.deleteGradingLibraryComment,
  IPC_CHANNELS.publishCourseChanges,
  IPC_CHANNELS.applyAssignment,
  IPC_CHANNELS.gradeAssignment,
  IPC_CHANNELS.repairGradingStudentWorkflow,
  IPC_CHANNELS.repairGradingAssignmentWorkflows,
  IPC_CHANNELS.publishGradingStudentReport,
  IPC_CHANNELS.bulkPublishGradingStudentReports,
  IPC_CHANNELS.publishStudentRepositoryAccessPage,
  IPC_CHANNELS.saveTemplateWorkflow,
  IPC_CHANNELS.replaceTemplateManagedWorkflow,
  IPC_CHANNELS.executeAssignmentTemplateSync
];
/** No generic IPC is exposed. The adapter only registers the existing explicit channels. */
export const createCourseMutationIpc = (
  ipc: Pick<IpcMain, "handle">,
  guard: () => ManagedCourseMutationGuard | undefined,
  resolveSetup?: (path: unknown) => { readonly isNew: boolean; readonly folderId?: string }
): Pick<IpcMain, "handle"> => {
  const active = new Set<string>();
  return {
    handle(channel, handler) {
      ipc.handle(channel, async (event, ...args: unknown[]) => {
        if (!COURSE_MUTATION_CHANNELS.includes(channel)) return handler(event, ...args);
        const request = args[0];
        const fields =
          typeof request === "object" && request !== null
            ? (request as Record<string, unknown>)
            : {};
        const setup =
          channel === IPC_CHANNELS.saveCourseSetup
            ? resolveSetup?.(fields.courseFolderPath)
            : undefined;
        if (setup?.isNew) return handler(event, ...args);
        const folderId =
          setup?.folderId ??
          (channel === IPC_CHANNELS.publishCourseChanges ? request : fields.courseFolderId);
        const notify = (value: unknown) => {
          if (!event.sender.isDestroyed()) event.sender.send(COURSE_MUTATION_NOTICE, value);
        };
        const key = `${event.sender.id}:${channel}:${String(folderId)}`;
        if (active.has(key))
          blockMutation(
            "synchronization_retry_required",
            "This course action is already running. Wait for it to finish.",
            "retry"
          );
        active.add(key);
        notify({ status: "checking" });
        try {
          const boundary = guard();
          if (!boundary)
            return blockMutation(
              "authorization_required",
              "Course authorization is not ready. Retry after sign-in.",
              "authorization"
            );
          return await boundary.run(
            folderId,
            fields.courseFolderPath,
            channel === IPC_CHANNELS.publishCourseChanges ? "publication_retry" : "new_mutation",
            async () => {
              notify({ status: "finished" });
              return handler(event, ...args);
            }
          );
        } catch (error) {
          if (error instanceof CourseMutationBlocked) notify(error.result);
          throw error;
        } finally {
          active.delete(key);
          notify({ status: "finished" });
        }
      });
    }
  };
};
