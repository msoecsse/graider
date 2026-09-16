import type { IpcMain } from "electron";
import {
  type AssignmentTemplateSyncAvailability,
  type AssignmentTemplateSyncExecuteRequest,
  type AssignmentTemplateSyncExecutionResult,
  type AssignmentTemplateSyncOutcome,
  type AssignmentTemplateSyncProgress,
  type AssignmentTemplateSyncRequest,
  type AssignmentTemplateSyncService
} from "./assignmentTemplateSyncService.js";
import { IPC_CHANNELS } from "./ipc.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyRequestFields = (
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean => Object.keys(value).every((key) => allowed.includes(key));

export const isAssignmentTemplateSyncRequest = (
  value: unknown
): value is AssignmentTemplateSyncRequest =>
  isRecord(value) &&
  hasOnlyRequestFields(value, [
    "courseFolderId",
    "courseFolderPath",
    "assignmentFile",
    "studentId"
  ]) &&
  typeof value.courseFolderId === "string" &&
  typeof value.courseFolderPath === "string" &&
  typeof value.assignmentFile === "string" &&
  (value.studentId === undefined || typeof value.studentId === "string");

export const isAssignmentTemplateSyncExecuteRequest = (
  value: unknown
): value is AssignmentTemplateSyncExecuteRequest =>
  isRecord(value) &&
  hasOnlyRequestFields(value, [
    "courseFolderId",
    "courseFolderPath",
    "assignmentFile",
    "studentId",
    "confirmed"
  ]) &&
  isAssignmentTemplateSyncRequest(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== "confirmed"))
  ) &&
  typeof value.confirmed === "boolean";

const projectBlocker = (blocker: { code: string; message: string } | undefined) =>
  blocker === undefined ? {} : { blocker: { code: blocker.code, message: blocker.message } };

export const projectTemplateSyncAvailability = (
  result: AssignmentTemplateSyncAvailability
): AssignmentTemplateSyncAvailability => ({
  available: result.available,
  repositoryCount: result.repositoryCount,
  templateRepository: result.templateRepository,
  recordedTemplateRevision: result.recordedTemplateRevision,
  ...(result.selectedRepository === undefined
    ? {}
    : {
        selectedRepository: {
          studentId: result.selectedRepository.studentId,
          repository: result.selectedRepository.repository
        }
      }),
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

export const projectTemplateSyncProgress = (
  progress: AssignmentTemplateSyncProgress
): AssignmentTemplateSyncProgress => ({
  current: progress.current,
  total: progress.total,
  studentId: progress.studentId,
  repository: progress.repository
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
  ipc.handle(IPC_CHANNELS.executeAssignmentTemplateSync, async (event, request: unknown) => {
    if (!isAssignmentTemplateSyncExecuteRequest(request) || !isRegisteredCourse(request))
      throw new Error("Confirmed assignment template-sync request is required.");
    return projectTemplateSyncExecutionResult(
      await service.execute(request, (progress) => {
        event.sender.send(
          IPC_CHANNELS.assignmentTemplateSyncProgress,
          projectTemplateSyncProgress(progress)
        );
      })
    );
  });
};
