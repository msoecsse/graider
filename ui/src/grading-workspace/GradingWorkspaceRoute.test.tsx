import { screen, within } from "@testing-library/react";
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
      getAssignmentGradePreview: vi.fn().mockResolvedValue({
        courseFolderId: COURSE_FOLDER.id,
        courseFolderPath: COURSE_FOLDER.path,
        assignmentFile: ASSIGNMENT_FILE,
        status: "failure",
        preview: null,
        error: null,
        refreshedAt: null
      }),
      ...overrides
    }
  });
};

describe("GradingWorkspaceRoute", () => {
  it("redirects to grade-preview when prepareGradingWorkspace is unavailable, replacing the history entry", async () => {
    // README section 4.1: the old click handler only ever set gradingSelection
    // when window.graiderUI.prepareGradingWorkspace existed, so a build
    // without it can only reach the grading workspace via a direct/deep-linked
    // visit -- this route redirects instead of rendering a workspace the
    // build cannot run.
    mockGraiderUI();
    renderAtRoute(`/course/csc1120/27s1/lab02/grade`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Dispatch Preview" })
    ).toBeInTheDocument();
  });

  it("renders a breadcrumb trail with Grade as the current page when the workspace is available", async () => {
    mockGraiderUI({
      prepareGradingWorkspace: vi.fn().mockResolvedValue({
        status: "success",
        assignment: { title: "Lab 02", termCode: "27s1", slug: "lab02" },
        requiredFiles: [],
        rubric: [],
        students: []
      })
    });
    renderAtRoute(`/course/csc1120/27s1/lab02/grade`);

    await screen.findByText("Lab 02");
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb).toHaveTextContent(
      "Dashboard" + "CSC1120 · Spring 2027" + "Lab 02" + "Grade"
    );
    expect(within(breadcrumb).getByRole("link", { name: "Lab 02" })).toBeInTheDocument();
  });

  it("shows RouteNotFound when the assignment slug is unresolvable", async () => {
    mockGraiderUI();
    renderAtRoute("/course/csc1120/27s1/does-not-exist/grade");

    expect(
      await screen.findByRole("heading", { name: "This page could not be found." })
    ).toBeInTheDocument();
  });
});
