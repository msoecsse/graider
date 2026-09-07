import type { IpcMain } from "electron";
import {
  type AssignmentTemplateSyncAvailability,
  type AssignmentTemplateSyncExecuteRequest,
  type AssignmentTemplateSyncExecutionResult,
  type AssignmentTemplateSyncOutcome,
  type AssignmentTemplateSyncRequest,
  type AssignmentTemplateSyncService
} from "./assignmentTemplateSyncService.js";
import { IPC_CHANNELS } from "./ipc.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAssignmentTemplateSyncRequest = (
  value: unknown
): value is AssignmentTemplateSyncRequest =>
  isRecord(value) &&
  typeof value.courseFolderId === "string" &&
  typeof value.courseFolderPath === "string" &&
  typeof value.assignmentFile === "string";

export const isAssignmentTemplateSyncExecuteRequest = (
  value: unknown
): value is AssignmentTemplateSyncExecuteRequest =>
  isAssignmentTemplateSyncRequest(value) &&
  typeof (value as unknown as Record<string, unknown>).confirmed === "boolean";

const projectBlocker = (blocker: { code: string; message: string } | undefined) =>
  blocker === undefined ? {} : { blocker: { code: blocker.code, message: blocker.message } };

export const projectTemplateSyncAvailability = (
  result: AssignmentTemplateSyncAvailability
): AssignmentTemplateSyncAvailability => ({
  available: result.available,
  repositoryCount: result.repositoryCount,
  templateRepository: result.templateRepository,
  recordedTemplateRevision: result.recordedTemplateRevision,
  ...projectBlocker(result.blocker)
});

const projectOutcome = (outcome: AssignmentTemplateSyncOutcome): AssignmentTemplateSyncOutcome => ({
  studentId: outcome.studentId,
  status: outcome.status === "pull_request_closed" ? "failed" : outcome.status,
  ...(outcome.pullRequest === undefined
    ? {}
    : { pullRequest: { number: outcome.pullRequest.number, url: outcome.pullRequest.url } }),
  ...(outcome.failureStage === undefined ? {} : { failureStage: outcome.failureStage }),
  ...(outcome.message === undefined ? {} : { message: outcome.message })
});

export const projectTemplateSyncExecutionResult = (
  result: AssignmentTemplateSyncExecutionResult
): AssignmentTemplateSyncExecutionResult => ({
  status: result.status,
  outcomes: result.outcomes.map(projectOutcome),
  ...projectBlocker(result.blocker)
});

export const registerAssignmentTemplateSyncIpc = (
  ipc: Pick<IpcMain, "handle">,
  service: AssignmentTemplateSyncService,
  isRegisteredCourse: (request: AssignmentTemplateSyncRequest) => boolean
): void => {
  ipc.handle(IPC_CHANNELS.prepareAssignmentTemplateSync, async (_event, request: unknown) => {
    if (!isAssignmentTemplateSyncRequest(request) || !isRegisteredCourse(request))
      throw new Error("Assignment template-sync preview request is required.");
    return projectTemplateSyncAvailability(await service.prepare(request));
  });
  ipc.handle(IPC_CHANNELS.executeAssignmentTemplateSync, async (_event, request: unknown) => {
    if (!isAssignmentTemplateSyncExecuteRequest(request) || !isRegisteredCourse(request))
      throw new Error("Confirmed assignment template-sync request is required.");
    return projectTemplateSyncExecutionResult(await service.execute(request));
  });
};
