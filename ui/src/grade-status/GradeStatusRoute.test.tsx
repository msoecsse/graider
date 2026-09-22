import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord
} from "../../electron/ipc";
import { renderAtRoute } from "../test/routeTestUtils";

const COURSE_FOLDER: CourseFolderRecord = {
  id: "course-folder-csc1120",
  path: "/Users/sean/dev/csc1120",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T19:30:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab02/assignment.yml";

const COURSE_TERM_CARD = {
  kind: "course-term",
  displayName: "27s1-csc1120",
  courseSlug: "csc1120",
  courseTitle: "CSC1120",
  coursePath: ".",
  termSlug: "27s1",
  termTitle: "Spring 2027",
  status: "active",
  needsAttention: false,
  attentionCount: 0,
  roster: { sectionCount: 1, activeStudentCount: 3, totalStudentCount: 3 },
  assignmentCount: 1,
  recentAssignments: [
    {
      slug: "lab02",
      title: "Lab 02",
      status: "active",
      assignmentFile: ASSIGNMENT_FILE,
      needsAttention: false,
      diagnostics: []
    }
  ],
  diagnostics: []
};

const createDashboardResult = (): CourseFolderDashboardResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  status: "success",
  dashboard: {
    schemaVersion: 1,
    commandName: "dashboard",
    status: "success",
    exitCode: 0,
    diagnostics: [],
    summary: { cardCount: 1 },
    cards: [COURSE_TERM_CARD]
  },
  error: null,
  refreshedAt: "2026-06-10T12:00:00.000Z"
});

const createCombinedDashboardResult = (
  results: readonly CourseFolderDashboardResult[]
): CombinedDashboardResult => ({ status: "success", results });

const GRADE_STATUS_JSON = {
  schemaVersion: 1,
  commandName: "assignment grade-status",
  status: "success",
  exitCode: 0,
  diagnostics: [],
  assignment: { slug: "lab02", title: "Lab 02", file: ASSIGNMENT_FILE, status: "active" },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 1, activeStudentCount: 1 },
  grading: {
    enabled: true,
    resolvedFrom: "course_default",
    mode: "custom-workflow",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "results.json",
    workflowRef: "main"
  },
  summary: {
    totalRepositories: 1,
    queued: 0,
    inProgress: 0,
    completed: 1,
    successful: 1,
    failed: 0,
    cancelled: 0,
    timedOut: 0,
    missing: 0,
    unknown: 0,
    blocked: 0,
    needsAttention: 0,
    readyForReport: true
  },
  repositories: [
    {
      studentId: "s001",
      githubUsername: "ada",
      section: "001",
      repository: "graider-sandbox/csc1120-lab02-ada",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: 123,
      runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:05:00.000Z",
      selectionStrategy: "latest_configured_workflow_run",
      reason: "success",
      needsAttention: false,
      diagnostics: []
    }
  ],
  actions: {}
};

const mockGraiderUI = (overrides: Record<string, unknown> = {}): void => {
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
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentGradeStatus: vi.fn().mockResolvedValue({
        courseFolderId: COURSE_FOLDER.id,
        courseFolderPath: COURSE_FOLDER.path,
        assignmentFile: ASSIGNMENT_FILE,
        status: "success",
        gradeStatus: GRADE_STATUS_JSON,
        error: null,
        refreshedAt: "2026-06-10T16:00:00.000Z"
      }),
      getFacultyReport: vi.fn().mockResolvedValue({
        courseFolderId: COURSE_FOLDER.id,
        courseFolderPath: COURSE_FOLDER.path,
        assignmentFile: ASSIGNMENT_FILE,
        status: "success",
        report: {
          schemaVersion: 1,
          commandName: "report",
          assignmentFile: ASSIGNMENT_FILE,
          status: "success",
          exitCode: 0,
          diagnostics: [],
          warnings: [],
          errors: [],
          generatedFiles: ["terms/27s1/reports/lab02/faculty-summary.json"],
          summary: {
            assignmentSlug: "lab02",
            courseCode: "csc1120",
            termCode: "27s1",
            studentCount: 1,
            passedCount: 1,
            failedCount: 0,
            reportFileCount: 3
          }
        },
        error: null,
        refreshedAt: "2026-06-10T16:30:00.000Z"
      }),
      ...overrides
    }
  });
};

describe("GradeStatusRoute", () => {
  it("renders a breadcrumb trail with Status as the current page", async () => {
    mockGraiderUI();
    renderAtRoute(`/course/csc1120/27s1/lab02/status`);

    await screen.findByRole("heading", { level: 1, name: "Grade Status" });
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb).toHaveTextContent(
      "Dashboard" + "CSC1120 · Spring 2027" + "Lab 02" + "Status"
    );
    expect(within(breadcrumb).getByRole("link", { name: "Lab 02" })).toBeInTheDocument();
  });

  it("navigates to faculty report via the view faculty report action", async () => {
    mockGraiderUI();
    renderAtRoute(`/course/csc1120/27s1/lab02/status`);

    await screen.findByRole("heading", { level: 1, name: "Grade Status" });
    fireEvent.click(await screen.findByRole("button", { name: "View faculty report" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Faculty Report" })
    ).toBeInTheDocument();
  });

  it("shows RouteNotFound when the assignment slug is unresolvable", async () => {
    mockGraiderUI();
    renderAtRoute("/course/csc1120/27s1/does-not-exist/status");

    expect(
      await screen.findByRole("heading", { name: "This page could not be found." })
    ).toBeInTheDocument();
  });
});
