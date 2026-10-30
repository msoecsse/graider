import type { IpcMain, WebContents } from "electron";
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
  resolveSetup?: (path: unknown) => { readonly isNew: boolean; readonly folderId?: string },
  views: () => readonly WebContents[] = () => []
): Pick<IpcMain, "handle"> => {
  const active = new Set<string>();
  const documents = new WeakMap<
    WebContents,
    { stale: boolean; epoch: number; revision: number; loadingRevision: number }
  >();
  const document = (sender: WebContents) => {
    let state = documents.get(sender);
    if (!state) {
      state = { stale: false, epoch: 0, revision: 0, loadingRevision: 0 };
      documents.set(sender, state);
      const captured = state;
      sender.on?.("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) captured.loadingRevision = captured.revision;
      });
      sender.on?.("did-finish-load", () => {
        // A load begun before the final worktree verification cannot make an editor current.
        captured.stale = captured.loadingRevision !== captured.revision;
        captured.epoch++;
      });
    }
    return state;
  };
  const invalidate = (sender: WebContents) => {
    const state = document(sender);
    state.stale = true;
    state.revision++;
  };
  const requireFreshView = (state: { stale: boolean; epoch: number }, epoch: number) => {
    if (state.stale || state.epoch !== epoch)
      blockMutation(
        "view_refresh_required",
        "Course source changed. Refresh/reopen this view before retrying the change.",
        "refresh_view"
      );
  };
  ipc.handle(IPC_CHANNELS.reloadCourseView, (event) => {
    event.sender.reload();
  });
  ipc.handle(IPC_CHANNELS.updateCourseSource, async (event, folderId: unknown) => {
    if (typeof folderId !== "string") throw new Error("Registered course folder ID is required.");
    const boundary = guard();
    if (!boundary)
      blockMutation(
        "authorization_required",
        "Authorize course access before updating.",
        "authorization"
      );
    const affected = new Set<WebContents>();
    try {
      await boundary!.updateSource(folderId, () => {
        for (const sender of [event.sender, ...views()]) {
          if (sender.isDestroyed()) continue;
          invalidate(sender);
          affected.add(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
        }
      });
      for (const sender of affected)
        if (!sender.isDestroyed()) {
          invalidate(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "source_updated" });
        }
    } catch (error) {
      for (const sender of affected)
        if (!sender.isDestroyed()) {
          invalidate(sender);
          sender.send(COURSE_MUTATION_NOTICE, { status: "view_invalidated" });
        }
      if (error instanceof CourseMutationBlocked && !event.sender.isDestroyed())
        event.sender.send(COURSE_MUTATION_NOTICE, error.result);
      throw error;
    }
  });
  return {
    handle(channel, handler) {
      ipc.handle(channel, async (event, ...args: unknown[]) => {
        if (!COURSE_MUTATION_CHANNELS.includes(channel)) return handler(event, ...args);
        const view = document(event.sender);
        const epoch = view.epoch;
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
          requireFreshView(view, epoch);
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
              requireFreshView(view, epoch);
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
