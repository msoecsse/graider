import { expect, it, vi } from "vitest";
import { createAssignmentRepositoryUpdateHandler } from "./assignmentRepositoryUpdateIpc.js";
import { createAssignmentRepositoryUpdateService } from "./assignmentRepositoryUpdateService.js";
import { IPC_CHANNELS } from "./ipc.js";
import { COURSE_MUTATION_CHANNELS } from "./courseMutationIpc.js";
import {
  LOCAL_GRADING_MUTATION_CHANNELS,
  managedOperationFamily
} from "./managedOperationInventory.js";

const request = {
  courseFolderId: "registered",
  courseFolderPath: "/course",
  termCode: "27s1",
  assignmentSlug: "lab1"
};
const fixture = () => {
  const updateStudent = vi.fn().mockResolvedValue({ status: "unchanged" });
  const update = vi.fn(
    createAssignmentRepositoryUpdateService({
      resolveFacultyScope: () => ({
        status: "success",
        sections: ["001"],
        students: [{ studentId: "ada", githubUsername: "ada", section: "001" }],
        errors: []
      }),
      updateStudent
    })
  );
  const isRegistered = vi.fn().mockReturnValue(true);
  const handler = createAssignmentRepositoryUpdateHandler({
    userDataPath: () => "/private-user-data",
    isRegistered,
    update
  });
  const event = {
    sender: { isDestroyed: vi.fn().mockReturnValue(false), send: vi.fn() }
  } as unknown as Parameters<typeof handler>[0];
  return { handler, update, updateStudent, event, isRegistered };
};

it("keeps assignment Pull in the guarded repository mutation inventory", () => {
  expect(COURSE_MUTATION_CHANNELS).toContain(IPC_CHANNELS.pullLatestAssignmentStudentChanges);
  expect(LOCAL_GRADING_MUTATION_CHANNELS).toContain(
    IPC_CHANNELS.pullLatestAssignmentStudentChanges
  );
  expect(managedOperationFamily(IPC_CHANNELS.pullLatestAssignmentStudentChanges)).toBe(
    "repositories"
  );
  expect(COURSE_MUTATION_CHANNELS).not.toContain(IPC_CHANNELS.assignmentRepositoryUpdateProgress);
});

it.each([
  null,
  {},
  { ...request, studentId: "outside-scope" },
  { ...request, localPath: "/foreign" },
  { ...request, userDataPath: "/foreign" },
  { ...request, expectedHead: "forged" },
  { ...request, authentication: "forged" }
])("rejects renderer-selected authority: %j", async (value) => {
  const f = fixture();
  await expect(f.handler(f.event, value)).rejects.toThrow("registered assignment");
  expect(f.update).not.toHaveBeenCalled();
});
it("rejects unregistered assignments and extra arguments before any update", async () => {
  const f = fixture();
  f.isRegistered.mockReturnValue(false);
  await expect(f.handler(f.event, request)).rejects.toThrow();
  await expect(f.handler(f.event, request, { confirmed: true })).rejects.toThrow();
  expect(f.update).not.toHaveBeenCalled();
});
it("derives private storage in main and emits assignment-scoped progress", async () => {
  const f = fixture();
  await expect(f.handler(f.event, request)).resolves.toMatchObject({ counts: { unchanged: 1 } });
  expect(f.updateStudent).toHaveBeenCalledExactlyOnceWith({
    ...request,
    userDataPath: "/private-user-data",
    studentId: "ada"
  });
  expect(f.event.sender.send).toHaveBeenLastCalledWith(
    IPC_CHANNELS.assignmentRepositoryUpdateProgress,
    {
      courseFolderId: "registered",
      termCode: "27s1",
      assignmentSlug: "lab1",
      completed: 1,
      total: 1
    }
  );
});
it("finishes after the renderer closes or progress delivery throws", async () => {
  const f = fixture();
  vi.mocked(f.event.sender.send).mockImplementation(() => {
    throw new Error("closed");
  });
  await expect(f.handler(f.event, request)).resolves.toMatchObject({ counts: { unchanged: 1 } });
  vi.mocked(f.event.sender.isDestroyed).mockReturnValue(true);
  await expect(f.handler(f.event, request)).resolves.toMatchObject({ counts: { unchanged: 1 } });
});
