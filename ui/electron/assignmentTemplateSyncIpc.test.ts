import { describe, expect, it, vi } from "vitest";
import {
  isAssignmentTemplateSyncExecuteRequest,
  isAssignmentTemplateSyncRequest,
  registerAssignmentTemplateSyncIpc
} from "./assignmentTemplateSyncIpc.js";
import type { AssignmentTemplateSyncService } from "./assignmentTemplateSyncService.js";
import { IPC_CHANNELS } from "./ipc.js";

const identity = {
  courseFolderId: "course",
  courseFolderPath: "/courses/cs",
  assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
};

const setup = () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipc = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    })
  };
  const service: AssignmentTemplateSyncService = {
    prepare: vi.fn(async () => ({
      available: true,
      repositoryCount: 2,
      templateRepository: "course/template",
      recordedTemplateRevision: "abcdef"
    })),
    execute: vi.fn(async () => ({
      status: "partial_success" as const,
      outcomes: [
        {
          studentId: "S001",
          status: "pull_request_pending" as const,
          pullRequest: { number: 7, url: "https://github.com/course/student/pull/7" }
        }
      ]
    }))
  };
  registerAssignmentTemplateSyncIpc(ipc as never, service, () => true);
  const invoke = async (channel: string, request: unknown): Promise<unknown> => {
    const handler = handlers.get(channel);
    if (handler === undefined) throw new Error("Handler missing");
    return await handler({}, request);
  };
  return { ipc, service, invoke };
};

describe("assignment template-sync IPC", () => {
  it("prepares once without executing and projects safe availability", async () => {
    const { service, invoke } = setup();
    expect(await invoke(IPC_CHANNELS.prepareAssignmentTemplateSync, identity)).toEqual({
      available: true,
      repositoryCount: 2,
      templateRepository: "course/template",
      recordedTemplateRevision: "abcdef"
    });
    expect(service.prepare).toHaveBeenCalledExactlyOnceWith(identity);
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("forwards confirmation once and retains only student ID and PR data", async () => {
    const { service, invoke } = setup();
    const request = { ...identity, confirmed: true };
    const execute = vi.mocked(service.execute);
    execute.mockResolvedValueOnce({
      status: "partial_success",
      outcomes: [
        {
          studentId: "S001",
          status: "pull_request_created",
          pullRequest: { number: 7, url: "https://github.com/course/student/pull/7" },
          githubUsername: "octocat",
          branchName: "graider/template-update-secret",
          token: "secret-token",
          workspace: "/tmp/private"
        } as never
      ],
      githubClient: {} as never
    } as never);
    const result = await invoke(IPC_CHANNELS.executeAssignmentTemplateSync, request);
    expect(service.execute).toHaveBeenCalledExactlyOnceWith(request);
    expect(result).toEqual({
      status: "partial_success",
      outcomes: [
        {
          studentId: "S001",
          status: "pull_request_created",
          pullRequest: { number: 7, url: "https://github.com/course/student/pull/7" }
        }
      ]
    });
    expect(JSON.stringify(result)).not.toMatch(
      /octocat|branchName|secret-token|workspace|githubClient/
    );
  });

  it("rejects malformed prepare and execute requests", async () => {
    const { service, invoke } = setup();
    expect(isAssignmentTemplateSyncRequest(null)).toBe(false);
    expect(isAssignmentTemplateSyncExecuteRequest(identity)).toBe(false);
    await expect(invoke(IPC_CHANNELS.prepareAssignmentTemplateSync, {})).rejects.toThrow(
      "preview request"
    );
    await expect(
      invoke(IPC_CHANNELS.executeAssignmentTemplateSync, { ...identity, confirmed: "yes" })
    ).rejects.toThrow("Confirmed assignment template-sync request");
    expect(service.prepare).not.toHaveBeenCalled();
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("rejects assignments outside the registered course registry", async () => {
    const { ipc, service } = setup();
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const rejectingIpc = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
        handlers.set(channel, handler)
    };
    registerAssignmentTemplateSyncIpc(rejectingIpc as never, service, () => false);
    await expect(
      handlers.get(IPC_CHANNELS.prepareAssignmentTemplateSync)?.({}, identity)
    ).rejects.toThrow("preview request");
    expect(service.prepare).not.toHaveBeenCalled();
    expect(ipc.handle).toHaveBeenCalledTimes(2);
  });
});
