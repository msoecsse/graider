import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, type GradingWorkspacePrepareRequest } from "./ipc.js";
import { isPrepareGradingWorkspaceRequest } from "./gradingWorkspaceRequestValidation.js";
import { createAssignmentRepositoryUpdateService } from "./assignmentRepositoryUpdateService.js";

export const createAssignmentRepositoryUpdateHandler =
  (dependencies: {
    readonly userDataPath: () => string;
    readonly isRegistered: (request: GradingWorkspacePrepareRequest) => boolean;
    readonly update: ReturnType<typeof createAssignmentRepositoryUpdateService>;
  }) =>
  async (event: Pick<IpcMainInvokeEvent, "sender">, request: unknown, ...extra: unknown[]) => {
    if (
      extra.length > 0 ||
      !isPrepareGradingWorkspaceRequest(request) ||
      !dependencies.isRegistered(request)
    )
      throw new Error("A registered assignment is required for student repository updates.");
    return dependencies.update(
      { ...request, userDataPath: dependencies.userDataPath() },
      (progress) => {
        if (!event.sender.isDestroyed())
          event.sender.send(IPC_CHANNELS.assignmentRepositoryUpdateProgress, progress);
      }
    );
  };
