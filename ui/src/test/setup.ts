import { cleanup, configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * Testing Library retries `findBy*` and `waitFor` for 1s by default. These pages render behind
 * mocked IPC promises, which resolve in well under 200ms in isolation but can miss a 1s deadline
 * under the parallel load of a full run -- surfacing as a misleading "Unable to find role" rather
 * than a timeout. This deadline absorbs the load without masking a query that will never match.
 */
const ASYNC_QUERY_TIMEOUT_MS = 10000;

configure({ asyncUtilTimeout: ASYNC_QUERY_TIMEOUT_MS });

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: {
      getAppInfo: vi.fn().mockResolvedValue({ name: "Graider", version: "0.1.0" }),
      checkGitHubAuth: vi.fn().mockResolvedValue({
        status: "connected",
        username: null,
        diagnostic: null,
        diagnosticCode: null
      }),
      selectCourseFolder: vi.fn().mockResolvedValue({ canceled: true, courseFolder: null }),
      listCourseFolders: vi.fn().mockResolvedValue([]),
      removeCourseFolder: vi.fn().mockResolvedValue(undefined),
      refreshCourseFolder: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        status: "success",
        dashboard: {
          schemaVersion: 1,
          commandName: "dashboard",
          status: "success",
          exitCode: 0,
          diagnostics: [],
          summary: { cardCount: 0 },
          cards: []
        },
        error: null,
        refreshedAt: "2026-06-10T12:00:00.000Z"
      }),
      refreshDashboard: vi.fn().mockResolvedValue({
        status: "success",
        results: []
      }),
      getAssignmentDetail: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "failure",
        detail: null,
        error: null,
        refreshedAt: null
      }),
      getAssignmentApplyPreview: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "failure",
        preview: null,
        error: null,
        refreshedAt: null
      }),
      getAssignmentGradePreview: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "failure",
        preview: null,
        error: null,
        refreshedAt: null
      }),
      getAssignmentGradeStatus: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "failure",
        gradeStatus: null,
        error: null,
        refreshedAt: null
      }),
      getFacultyReport: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "failure",
        report: null,
        error: null,
        refreshedAt: null
      }),
      applyAssignment: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "failure",
        apply: null,
        error: null,
        appliedAt: null
      }),
      gradeAssignment: vi.fn().mockResolvedValue({
        courseFolderId: "course-folder-default",
        courseFolderPath: "/tmp/course",
        assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
        status: "failure",
        grade: null,
        error: null,
        dispatchedAt: null
      })
    }
  });
});
