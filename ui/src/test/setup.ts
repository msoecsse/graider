import { cleanup, configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

// Testing Library's findBy*/waitFor default (1000ms) is tuned for an
// isolated test. Under a full-suite parallel run, GradingWorkspacePage's
// cold first render (it must resolve prepareGradingWorkspace and a student
// snapshot before the elements these tests wait for exist) measured
// 500ms in isolation but 620-760ms across repeated full-suite runs on an
// 8-core machine, competing with other test files for CPU. 5000ms gives
// roughly 6x headroom over the worst full-suite render observed, while
// staying comfortably under testTimeout so a genuinely hung component
// still fails fast with Testing Library's specific "unable to find"
// message instead of a generic test-timeout error.
const ASYNC_UTIL_TIMEOUT_MS = 5000;
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

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
      prepareGradingWorkspace: vi.fn().mockResolvedValue({
        status: "success",
        assignment: { title: "Lab 02", termCode: "27s1", slug: "lab02" },
        requiredFiles: [],
        rubric: [],
        students: []
      }),
      loadGradingStudentSource: vi.fn().mockResolvedValue({
        status: "success",
        studentId: "student",
        combinedText: "",
        sections: [],
        syntheticCombinedLines: []
      }),
      loadGradingStudentViewState: vi.fn().mockResolvedValue({
        status: "success",
        studentId: "student",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "not_started",
        viewState: null
      }),
      saveGradingStudentViewState: vi.fn().mockImplementation(({ studentId, viewState }) =>
        Promise.resolve({
          status: "success",
          studentId,
          submissionCommitSha: "a".repeat(40),
          gradingStatus: "not_started",
          viewState
        })
      ),
      clearGradingStudentViewState: vi.fn().mockResolvedValue({
        status: "success",
        studentId: "student",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "not_started",
        viewState: null
      }),
      loadGradingStudentSnapshot: vi.fn().mockImplementation(({ studentId }) =>
        Promise.resolve({
          status: "success",
          studentId,
          gradingStatus: "not_started",
          appliedComments: [],
          manualAdjustments: [],
          grade: {
            pointsPossible: 0,
            totalScore: 0,
            categories: [],
            uncategorizedCommentAdjustmentTotal: 0
          }
        })
      ),
      loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] }),
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
