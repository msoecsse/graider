import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "./ipc.js";
import {
  isMigrationReviewLoadRequest,
  isMigrationReviewSessionRequest
} from "./migrationReviewService.js";
import type { MigrationExecutionService } from "./migrationExecutionService.js";
import type {
  MigrationExecutionRequest,
  MigrationRecoveryRequest
} from "./migrationExecutionTypes.js";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const isMigrationExecutionRequest = (value: unknown): value is MigrationExecutionRequest => {
  if (
    !object(value) ||
    value.confirmed !== true ||
    Object.keys(value).some((key) => !["sessionId", "source", "confirmed"].includes(key))
  )
    return false;
  return isMigrationReviewSessionRequest({ sessionId: value.sessionId, source: value.source });
};
export const isMigrationRecoveryRequest = (value: unknown): value is MigrationRecoveryRequest =>
  object(value) &&
  Object.keys(value).every((key) => ["selector", "freshPlan"].includes(key)) &&
  (value.freshPlan === undefined || value.freshPlan === true) &&
  isMigrationReviewLoadRequest({ selector: value.selector });
export const registerMigrationExecutionIpc = (
  ipc: Pick<IpcMain, "handle">,
  service: MigrationExecutionService
): void => {
  ipc.handle(IPC_CHANNELS.startMigration, (event, request: unknown) => {
    if (!isMigrationExecutionRequest(request))
      throw new Error(
        "Confirm the exact current review. Compatibility assertions are not accepted."
      );
    return service.start(event.sender.id, request);
  });
  const handlers = {
    migrationExecutionStatus: service.status,
    cancelMigration: service.cancel,
    recoverMigrationPublication: service.recover,
    migrationHistory: service.history
  } as const;
  for (const [channel, handler] of Object.entries(handlers))
    ipc.handle(IPC_CHANNELS[channel as keyof typeof handlers], (_event, request: unknown) => {
      if (!isMigrationReviewLoadRequest(request))
        throw new Error("Select an authorized managed course.");
      return handler(request);
    });
  ipc.handle(IPC_CHANNELS.activeMigration, (_event, request: unknown) => {
    if (request !== undefined) throw new Error("Active migration accepts no authority assertions.");
    return service.active();
  });
  ipc.handle(IPC_CHANNELS.retryMigrationReconciliation, (_event, request: unknown) => {
    if (!isMigrationRecoveryRequest(request))
      throw new Error("Request current-state recovery; plans are not accepted.");
    return service.retry(request);
  });
};
