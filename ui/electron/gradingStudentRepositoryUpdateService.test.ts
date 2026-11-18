import { createCourseMutationIpc } from "./courseMutationIpc";
import type { ManagedCourseMutationGuard } from "./managedCourseMutationGuard";
import { IPC_CHANNELS } from "./ipc";
import { describe, expect, it, vi } from "vitest";
import {
  createGradingStudentRepositoryUpdateService,
  type RepositoryUpdateBackend
} from "./gradingStudentRepositoryUpdateService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentId: "ada",
  userDataPath: "/user"
};
const fixture = () => {
  const authentication = { id: "operation" };
  const workspace = {
    root: "/local/ada",
    inspect: vi.fn(),
    remoteUrl: vi.fn(),
    stage: vi.fn(),
    commit: vi.fn(),
    pushUpstream: vi.fn(),
    resolveHead: vi.fn().mockResolvedValue("a".repeat(40)),
    readRevisionFile: vi.fn().mockResolvedValue("source"),
    pullUpstream: vi.fn().mockResolvedValue({ kind: "updated" })
  };
  const backend = {
    updateGradingStudentRepository: vi.fn<
      RepositoryUpdateBackend["updateGradingStudentRepository"]
    >(async (_request, adapter) => {
      await adapter.resolveHead();
      await adapter.readRevisionFile("a".repeat(40), "Main.java");
      await adapter.pullUpstream({
        expectedHead: "a".repeat(40),
        externalFastForward: { expectedRemote: "https://github.com/course/lab1-ada.git" }
      });
      return { status: "success" };
    })
  };
  const overrides = {
    resolveFacultyScope: vi
      .fn()
      .mockReturnValue({ status: "success", students: [{ studentId: "ada" }] }),
    resolveRepository: vi.fn().mockReturnValue({ status: "success", localPath: "/local/ada" }),
    authenticate: vi.fn().mockResolvedValue({
      authentication,
      factory: { open: vi.fn().mockResolvedValue(workspace) }
    }),
    loadBackend: vi.fn(() => backend)
  };
  return { overrides, backend, workspace, authentication };
};
describe("selected student authenticated repository update", () => {
  it("uses the exact operation authentication and trusted local repository without executing grading", async () => {
    const f = fixture();
    expect(await createGradingStudentRepositoryUpdateService(f.overrides)(request)).toEqual({
      status: "success"
    });
    expect(f.workspace.pullUpstream).toHaveBeenCalledExactlyOnceWith({
      authentication: f.authentication,
      revalidate: expect.any(Function),
      expectedHead: "a".repeat(40),
      externalFastForward: { expectedRemote: "https://github.com/course/lab1-ada.git" }
    });
    expect(f.backend.updateGradingStudentRepository).toHaveBeenCalledWith(
      { courseRoot: "/course", termCode: "27s1", assignmentSlug: "lab1", studentId: "ada" },
      expect.anything()
    );
    expect(f.workspace.commit).not.toHaveBeenCalled();
    expect(f.workspace.pushUpstream).not.toHaveBeenCalled();
  });
  it("rejects inaccessible students before authentication or Git access", async () => {
    const f = fixture();
    expect(
      await createGradingStudentRepositoryUpdateService(f.overrides)({
        ...request,
        studentId: "grace"
      })
    ).toEqual({ status: "student_not_accessible" });
    expect(f.overrides.resolveRepository).not.toHaveBeenCalled();
    expect(f.overrides.authenticate).not.toHaveBeenCalled();
  });
  it("leaves state alone when authentication is unavailable", async () => {
    const f = fixture();
    f.overrides.authenticate.mockResolvedValue(null);
    expect(await createGradingStudentRepositoryUpdateService(f.overrides)(request)).toEqual({
      status: "github_auth_unavailable"
    });
    expect(f.backend.updateGradingStudentRepository).not.toHaveBeenCalled();
  });
});

it.each(["success", "handler failure", "authorization failure"])(
  "releases the Pull Latest IPC mutation guard after %s",
  async (outcome) => {
    let invoke!: (...args: unknown[]) => Promise<unknown>;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const localGrading = vi.fn(
      async (_id: unknown, _path: unknown, operation: () => Promise<unknown>) => operation()
    );
    if (outcome === "authorization failure")
      localGrading.mockImplementationOnce(async () => {
        entered();
        await gate;
        throw new Error("Authorization failed");
      });
    const handler = vi
      .fn()
      .mockImplementationOnce(async () => {
        entered();
        await gate;
        if (outcome === "handler failure") throw new Error("Git failed");
        return { status: "success" };
      })
      .mockResolvedValue({ status: "unchanged" });
    const adapter = createCourseMutationIpc(
      {
        handle: (_channel, callback) => {
          invoke = callback as typeof invoke;
        }
      },
      () => ({ localGrading }) as unknown as ManagedCourseMutationGuard
    );
    adapter.handle(IPC_CHANNELS.pullLatestGradingStudentChanges, handler);
    const event = { sender: { id: 1, isDestroyed: () => false, send: vi.fn() } };
    const request = { courseFolderId: "registered", studentId: "ada" };
    const first = invoke(event, request);
    // Attach rejection handling before opening the gate.
    const settled = first.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    );
    await started;
    try {
      await expect(invoke(event, request)).rejects.toMatchObject({
        result: {
          reason: "synchronization_retry_required",
          message: expect.stringContaining("already running")
        }
      });
      expect(localGrading).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await settled;
    }
    if (outcome === "success") expect(await first).toEqual({ status: "success" });
    else await expect(first).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(outcome === "authorization failure" ? 0 : 1);
    handler.mockReset().mockResolvedValue({ status: "unchanged" });
    expect(await invoke(event, request)).toEqual({ status: "unchanged" });
    expect(localGrading).toHaveBeenCalledTimes(2);
    expect(event.sender.send).toHaveBeenLastCalledWith(expect.any(String), { status: "finished" });
  }
);
