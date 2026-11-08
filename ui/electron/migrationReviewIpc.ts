import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "./ipc.js";
import {
  isGraderAccessCompleteRequest,
  isMigrationReviewLoadRequest,
  isMigrationReviewSessionRequest,
  isMigrationReviewVerifyRequest,
  isMigrationReviewCompleteRequest,
  type MigrationReviewService
} from "./migrationReviewService.js";

/** Owner comes from Electron, never renderer data. None of these channels uses a write guard. */
export const registerMigrationReviewIpc = (
  ipc: Pick<IpcMain, "handle">,
  service: MigrationReviewService
): void => {
  const owners = new Set<number>();
  ipc.handle(IPC_CHANNELS.loadMigrationReviewAnalysis, (event, request: unknown) => {
    if (!isMigrationReviewLoadRequest(request))
      throw new Error("A managed course selector is required.");
    const owner = event.sender.id;
    if (!owners.has(owner)) {
      owners.add(owner);
      event.sender.once("destroyed", () => {
        owners.delete(owner);
        service.close(owner);
      });
    }
    return service.load(owner, request);
  });
  ipc.handle(IPC_CHANNELS.refreshMigrationReview, (event, request: unknown) => {
    if (!isMigrationReviewSessionRequest(request))
      throw new Error("An exact review binding is required.");
    return service.refresh(event.sender.id, request);
  });
  ipc.handle(IPC_CHANNELS.verifyMigrationFacultyIdentity, (event, request: unknown) => {
    if (!isMigrationReviewVerifyRequest(request))
      throw new Error("An institutional username and GitHub login are required.");
    return service.verify(event.sender.id, request);
  });
  ipc.handle(IPC_CHANNELS.saveMigrationReview, (event, request: unknown) => {
    if (!isMigrationReviewCompleteRequest(request))
      throw new Error("Typed review decisions are required.");
    return service.save(event.sender.id, request);
  });
  ipc.handle(IPC_CHANNELS.saveGraderAccessReview, (event, request: unknown) => {
    if (!isGraderAccessCompleteRequest(request))
      throw new Error("Typed grader decisions are required.");
    return service.saveGrader(event.sender.id, request);
  });
  ipc.handle(IPC_CHANNELS.completeMigrationReview, (event, request: unknown) => {
    if (!isMigrationReviewCompleteRequest(request))
      throw new Error("Typed review decisions are required.");
    return service.complete(event.sender.id, request);
  });
  ipc.handle(IPC_CHANNELS.loadGraderAccessReview, (event, request: unknown) => {
    if (!isMigrationReviewSessionRequest(request))
      throw new Error("Exact review binding required.");
    return service.loadGrader(event.sender.id, request);
  });
  ipc.handle(IPC_CHANNELS.completeGraderAccessReview, (event, request: unknown) => {
    if (!isGraderAccessCompleteRequest(request))
      throw new Error("Explicit grader decisions required.");
    return service.completeGrader(event.sender.id, request);
  });
  ipc.handle(IPC_CHANNELS.closeMigrationReview, (event, request: unknown) => {
    if (request !== undefined && !isMigrationReviewSessionRequest(request))
      throw new Error("An exact review binding is required.");
    if (request === undefined) service.close(event.sender.id);
    else service.close(event.sender.id, request);
  });
};
