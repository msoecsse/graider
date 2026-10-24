import { describe, expect, it, vi } from "vitest";
import { createGradingBulkReportPublicationService } from "./gradingBulkReportPublicationService.js";

const request = {
  courseFolderId: "course",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1",
  studentIds: ["ada", "grace", "linus"],
  userDataPath: "/trusted/user-data"
};

describe("grading bulk report publication service", () => {
  it("publishes sequentially in request order and continues after per-student failure", async () => {
    const active: string[] = [];
    const publishOne = vi.fn(async ({ studentId }: { studentId: string }) => {
      expect(active).toEqual([]);
      active.push(studentId);
      const result =
        studentId === "grace"
          ? { status: "report_write_permission_unavailable" as const }
          : {
              status: "success" as const,
              studentId,
              gradingStatus: "published" as const,
              reportPath: `feedback/${studentId}.html`,
              remoteWrite: "created_or_updated" as const,
              warnings: []
            };
      active.pop();
      return result;
    });
    const service = createGradingBulkReportPublicationService({ publishOne });

    await expect(service(request)).resolves.toEqual({
      status: "success",
      results: [
        expect.objectContaining({
          studentId: "ada",
          result: {
            status: "success",
            studentId: "ada",
            gradingStatus: "published",
            reportPath: "feedback/ada.html",
            remoteWrite: "created_or_updated",
            warnings: []
          }
        }),
        { studentId: "grace", result: { status: "report_write_permission_unavailable" } },
        expect.objectContaining({
          studentId: "linus",
          result: {
            status: "success",
            studentId: "linus",
            gradingStatus: "published",
            reportPath: "feedback/linus.html",
            remoteWrite: "created_or_updated",
            warnings: []
          }
        })
      ]
    });
    expect(publishOne.mock.calls.map(([value]) => value.studentId)).toEqual([
      "ada",
      "grace",
      "linus"
    ]);
    expect(publishOne).toHaveBeenNthCalledWith(1, {
      courseFolderId: "course",
      courseFolderPath: "/trusted/course",
      termCode: "27s1",
      assignmentSlug: "lab1",
      studentId: "ada",
      userDataPath: "/trusted/user-data"
    });
  });

  it("converts an unexpected per-student exception and still attempts later students", async () => {
    const publishOne = vi.fn(async ({ studentId }: { studentId: string }) => {
      if (studentId === "grace") throw new Error("private token/path detail");
      return { status: "grading_not_complete" as const, studentId };
    });
    const service = createGradingBulkReportPublicationService({ publishOne });

    const result = await service(request);
    expect(result.results).toEqual([
      { studentId: "ada", result: { status: "grading_not_complete", studentId: "ada" } },
      { studentId: "grace", result: { status: "report_publish_failed" } },
      { studentId: "linus", result: { status: "grading_not_complete", studentId: "linus" } }
    ]);
    expect(JSON.stringify(result)).not.toContain("private token/path detail");
    expect(publishOne).toHaveBeenCalledTimes(3);
  });
});

it("emits actual sequential boundaries, advancing failures and preserving narrow outcomes", async () => {
  const events: import("./gradingBulkReportPublicationService.js").GradingBulkReportPublicationProgress[] =
    [];
  const publishOne = vi.fn(async ({ studentId }: { studentId: string }) => {
    expect(events.at(-1)).toEqual({
      total: 3,
      completed: publishOne.mock.calls.length - 1,
      currentStudentId: studentId
    });
    if (studentId === "grace") throw new Error("private detail");
    return { status: "grading_not_complete" as const, studentId };
  });
  const service = createGradingBulkReportPublicationService({
    publishOne,
    onProgress: (event) => {
      events.push(event);
    }
  });
  const result = await service(request);
  expect(events.map(({ completed, currentStudentId }) => [completed, currentStudentId])).toEqual([
    [0, undefined],
    [0, "ada"],
    [1, undefined],
    [1, "grace"],
    [2, undefined],
    [2, "linus"],
    [3, undefined]
  ]);
  expect(events[4]?.lastCompleted).toEqual({
    studentId: "grace",
    result: { status: "report_publish_failed", warnings: [] }
  });
  expect(result.results.map(({ studentId }) => studentId)).toEqual(request.studentIds);
  expect(JSON.stringify(events)).not.toContain("private detail");
});

it("reports empty service input without invoking publication (IPC still rejects empty requests)", async () => {
  const publishOne = vi.fn();
  const onProgress = vi.fn();
  expect(
    await createGradingBulkReportPublicationService({ publishOne, onProgress })({
      ...request,
      studentIds: []
    })
  ).toEqual({ status: "success", results: [] });
  expect(onProgress).toHaveBeenCalledExactlyOnceWith({ total: 0, completed: 0 });
  expect(publishOne).not.toHaveBeenCalled();
});
