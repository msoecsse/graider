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
        status: "failure",
        gradeStatus: null,
        error: null,
        refreshedAt: null
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

describe("FacultyReportRoute", () => {
  it("renders a breadcrumb trail with Report as the current page, Lab 02 linking to assignment detail", async () => {
    mockGraiderUI();
    renderAtRoute(`/course/csc1120/27s1/lab02/report`);

    await screen.findByRole("heading", { level: 1, name: "Faculty Report" });
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb).toHaveTextContent(
      "Dashboard" + "CSC1120 · Spring 2027" + "Lab 02" + "Report"
    );
    expect(within(breadcrumb).getByRole("link", { name: "Lab 02" })).toBeInTheDocument();
    // No breadcrumb crumb represents grade status (README section 4.1):
    // this trail's parent is assignment detail, not status.
    expect(breadcrumb).not.toHaveTextContent("Status");
  });

  it("keeps the Back to grading status button, navigating to the status route", async () => {
    mockGraiderUI();
    renderAtRoute(`/course/csc1120/27s1/lab02/report`);

    await screen.findByRole("heading", { level: 1, name: "Faculty Report" });
    fireEvent.click(screen.getByRole("button", { name: "Back to grading status" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Status" })
    ).toBeInTheDocument();
  });

  it("shows RouteNotFound when the assignment slug is unresolvable", async () => {
    mockGraiderUI();
    renderAtRoute("/course/csc1120/27s1/does-not-exist/report");

    expect(
      await screen.findByRole("heading", { name: "This page could not be found." })
    ).toBeInTheDocument();
  });
});
