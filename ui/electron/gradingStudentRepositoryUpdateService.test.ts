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
