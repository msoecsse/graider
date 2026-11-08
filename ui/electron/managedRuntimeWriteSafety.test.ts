// @vitest-environment node
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { managedCourseOperation } from "./managedCourseOperationContext";
import { createGradingStudentViewStateService } from "./gradingStudentViewStateService";
import type { VerifiedCourseMutationContext } from "./managedCourseMutationTypes";

describe("runtime mutation freshness after awaited preparation", () => {
  it.each(["save", "clear"] as const)(
    "revalidates before %s and makes zero backend writes after invalidation",
    async (operation) => {
      const root = path.resolve("course-fixture");
      let active = true;
      const write = vi.fn(() => ({
        status: "grading_state_error" as const,
        studentId: "s1",
        code: "unexpected-write"
      }));
      const service = createGradingStudentViewStateService({
        resolveFacultyScope: () => ({
          status: "success",
          sections: ["001"],
          students: [{ studentId: "s1", githubUsername: "student", section: "001" }],
          errors: []
        }),
        resolveRepository: () => ({ status: "success", localPath: root }),
        readHead: async () => {
          await Promise.resolve();
          active = false;
          return { status: "success", submissionCommitSha: "a".repeat(40) };
        },
        loadBackend: () => ({
          saveGradingStudentViewStateContext: write,
          clearGradingStudentViewStateContext: write,
          loadGradingStudentViewStateContext: write
        })
      });
      const context: VerifiedCourseMutationContext = {
        managed: true,
        userId: 42,
        repositoryId: 20,
        authoritativeCommit: "a".repeat(40),
        operationalCommit: "a".repeat(40),
        courseFolderId: "fixture",
        courseFolderPath: root,
        mode: "new_mutation",
        revalidate: async () => {
          if (!active) throw new Error("Account or authoritative source invalidated.");
        }
      };
      const request = {
        courseFolderId: "fixture",
        courseFolderPath: root,
        userDataPath: root,
        termCode: "27s1",
        assignmentSlug: "lab01",
        studentId: "s1",
        viewState: { scrollTop: 0, cursor: { file: "main.java", line: 1, column: 1 } }
      };
      await expect(
        managedCourseOperation.run(context, () => service[operation](request))
      ).rejects.toThrow("invalidated");
      expect(write).not.toHaveBeenCalled();
    }
  );
});
