import { describe, expect, it, vi } from "vitest";
import type {
  CreateGradingLibraryCommentRequest,
  DeleteGradingLibraryCommentRequest,
  EditGradingLibraryCommentRequest,
  GraiderUIApi,
  GradingStudentWorkflowRepairRequest,
  PublishGradingStudentReportRequest,
  RosterSectionSummariesRequest
} from "./ipc.js";

const electron = vi.hoisted(() => ({
  exposedApi: undefined as GraiderUIApi | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: GraiderUIApi) => {
      electron.exposedApi = api;
    }
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener
  }
}));

import "./preload.js";

describe("grading workflow repair preload bridge", () => {
  it("subscribes to projected template-sync progress and cleans up its listener", () => {
    const api = electron.exposedApi;
    if (api === undefined) throw new Error("Expected preload API.");
    const listener = vi.fn();

    const unsubscribe = api.onAssignmentTemplateSyncProgress(listener);
    const handler = electron.on.mock.calls[0]?.[1] as
      | ((event: unknown, progress: unknown) => void)
      | undefined;
    if (handler === undefined) throw new Error("Expected template-sync progress listener.");
    handler({}, { current: 1, total: 1, studentId: "ada", repository: "course/lab-ada" });
    unsubscribe();

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      current: 1,
      total: 1,
      studentId: "ada",
      repository: "course/lab-ada"
    });
    expect(electron.removeListener).toHaveBeenCalledExactlyOnceWith(
      "graider-ui:assignment-template-sync:progress",
      handler
    );
  });

  it("subscribes to projected Apply progress and cleans up its listener", () => {
    const api = electron.exposedApi;
    if (api === undefined) throw new Error("Expected preload API.");
    const listener = vi.fn();

    const unsubscribe = api.onAssignmentApplyProgress(listener);
    const applySubscription = electron.on.mock.calls.find(
      ([channel]) => channel === "graider-ui:assignment-apply:progress"
    );
    const handler = applySubscription?.[1] as
      | ((event: unknown, progress: unknown) => void)
      | undefined;
    if (handler === undefined) throw new Error("Expected Apply progress listener.");
    handler(
      {},
      {
        courseFolderId: "course",
        assignmentFile: "assignment.yml",
        progress: {
          current: 1,
          total: 1,
          mode: "individual",
          studentId: "ada",
          repository: "course/lab-ada"
        }
      }
    );
    unsubscribe();

    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        courseFolderId: "course",
        assignmentFile: "assignment.yml"
      })
    );
    expect(electron.removeListener).toHaveBeenCalledWith(
      "graider-ui:assignment-apply:progress",
      handler
    );
  });

  it("exposes only the narrow identity-and-confirmation request", async () => {
    const api = electron.exposedApi;
    if (api?.repairGradingStudentWorkflow === undefined)
      throw new Error("Expected workflow repair preload method.");
    const request: GradingStudentWorkflowRepairRequest = {
      courseFolderId: "course",
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada",
      confirmed: true
    };
    electron.invoke.mockResolvedValue({ status: "repository_not_recorded", studentId: "ada" });

    await api.repairGradingStudentWorkflow(request);

    expect(electron.invoke).toHaveBeenCalledWith(
      "graider-ui:grading-student-workflow:repair",
      request
    );
  });

  it("exposes report preview with only the trusted report identity", async () => {
    const api = electron.exposedApi;
    if (api?.previewGradingStudentReport === undefined)
      throw new Error("Expected report preview preload method.");
    const request: PublishGradingStudentReportRequest = {
      courseFolderId: "course",
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada"
    };
    electron.invoke.mockResolvedValue({
      status: "success",
      studentId: "ada",
      html: "<!doctype html><p>trusted</p>",
      warnings: []
    });

    await api.previewGradingStudentReport(request);

    expect(electron.invoke).toHaveBeenCalledWith(
      "graider-ui:grading-student-report:preview",
      request
    );
  });

  it("exposes the bulk roster section summaries read", async () => {
    const api = electron.exposedApi;
    if (api?.getRosterSectionSummaries === undefined)
      throw new Error("Expected roster section summaries preload method.");
    const request: RosterSectionSummariesRequest = {
      courseFolderId: "course",
      courseFolderPath: "/trusted/course",
      termCode: "27s1"
    };
    electron.invoke.mockResolvedValue({ status: "ready", summaries: [], diagnostics: [] });

    await api.getRosterSectionSummaries(request);

    expect(electron.invoke).toHaveBeenCalledWith(
      "graider-ui:roster-manager:section-summaries",
      request
    );
  });

  it("exposes narrow comment-library mutations with publication-aware results", async () => {
    const api = electron.exposedApi;
    if (
      api?.createGradingLibraryComment === undefined ||
      api.editGradingLibraryComment === undefined ||
      api.deleteGradingLibraryComment === undefined
    )
      throw new Error("Expected comment-library mutation preload methods.");
    const identity = { courseFolderId: "course", termCode: "27s1" };
    const comment = {
      title: "Title",
      text: "Text",
      defaultDeduction: -1,
      tags: ["style"]
    };
    const createRequest: CreateGradingLibraryCommentRequest = { ...identity, comment };
    const editRequest: EditGradingLibraryCommentRequest = {
      ...identity,
      commentId: "comment-id",
      replacement: comment
    };
    const deleteRequest: DeleteGradingLibraryCommentRequest = {
      ...identity,
      commentId: "comment-id"
    };
    electron.invoke.mockResolvedValue({
      status: "success",
      diagnostics: [],
      publication: { status: "success", diagnostics: [] }
    });

    await api.createGradingLibraryComment(createRequest);
    await api.editGradingLibraryComment(editRequest);
    await api.deleteGradingLibraryComment(deleteRequest);

    expect(electron.invoke).toHaveBeenCalledWith(
      "graider-ui:grading-comment-library:create",
      createRequest
    );
    expect(electron.invoke).toHaveBeenCalledWith(
      "graider-ui:grading-comment-library:edit",
      editRequest
    );
    expect(electron.invoke).toHaveBeenCalledWith(
      "graider-ui:grading-comment-library:delete",
      deleteRequest
    );
  });
});
