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
      prepareAssignmentTemplateSync: vi.fn().mockResolvedValue({
        available: false,
        repositoryCount: 0,
        templateRepository: null,
        recordedTemplateRevision: null
      }),
      onAssignmentTemplateSyncProgress: vi.fn(() => () => undefined),
      getAssignmentDetail: vi.fn().mockResolvedValue({
        courseFolderId: COURSE_FOLDER.id,
        courseFolderPath: COURSE_FOLDER.path,
        assignmentFile: ASSIGNMENT_FILE,
        status: "success",
        detail: {
          schemaVersion: 1,
          commandName: "assignment detail",
          status: "success",
          exitCode: 0,
          diagnostics: [],
          course: { slug: "csc1120", title: "CSC1120", file: "course.yml" },
          term: { slug: "27s1", title: "Spring 2027", file: "terms/27s1/term.yml" },
          assignment: {
            slug: "lab02",
            title: "Lab 02",
            type: "individual",
            status: "active",
            file: ASSIGNMENT_FILE
          },
          metadata: {
            facultyOwner: "professor",
            lmsAssignmentId: null,
            gradingCategory: "labs",
            points: 100
          },
          deadline: { dueAt: "2027-06-15T23:59:00+09:00", latePolicy: "standard" },
          sections: ["001"],
          roster: { sectionCount: 1, activeStudentCount: 3, totalStudentCount: 3 },
          template: {
            repository: "graider-sandbox/csc1120L2Template",
            branch: "main",
            status: "available",
            repositoryStatus: "available",
            branchStatus: "available"
          },
          grading: {
            enabled: true,
            mode: "custom-workflow",
            workflow: ".github/workflows/grade.yml",
            artifact: "grading-results",
            resultFile: "grading-results.json",
            workflowStatus: "available",
            workflowDispatch: "available"
          },
          studentReports: { enabled: false, mode: "disabled" },
          applyState: { status: "not_applied" },
          actions: {
            validate: { available: true, implemented: true },
            apply: { available: true, implemented: false },
            grade: { available: true, implemented: false },
            report: { available: true, implemented: false },
            publishStudentReports: { available: false, implemented: false },
            generateWorkflow: { available: true, implemented: false }
          }
        },
        error: null,
        refreshedAt: "2026-06-10T13:00:00.000Z"
      }),
      ...overrides
    }
  });
};

describe("AssignmentEditRoute", () => {
  it("renders a breadcrumb trail with Edit as the current page", async () => {
    mockGraiderUI();
    renderAtRoute(`/course/csc1120/27s1/lab02/edit`);

    await screen.findByRole("heading", { level: 1, name: "Edit Assignment" });
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb).toHaveTextContent("Dashboard" + "CSC1120 · Spring 2027" + "Lab 02" + "Edit");
    expect(within(breadcrumb).getByRole("link", { name: "Lab 02" })).toBeInTheDocument();
  });

  it("Cancel navigates back to assignment detail", async () => {
    mockGraiderUI();
    renderAtRoute(`/course/csc1120/27s1/lab02/edit`);

    await screen.findByRole("heading", { level: 1, name: "Edit Assignment" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
  });

  it("shows RouteNotFound when the assignment slug is unresolvable", async () => {
    mockGraiderUI();
    renderAtRoute("/course/csc1120/27s1/does-not-exist/edit");

    expect(
      await screen.findByRole("heading", { name: "This page could not be found." })
    ).toBeInTheDocument();
  });
});
