import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord,
  GraiderUIApi
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
  assignmentCount: 0,
  recentAssignments: [],
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

const createCombinedDashboardResult = (): CombinedDashboardResult => ({
  status: "success",
  results: [createDashboardResult()]
});

const mockGraiderUI = (overrides: Partial<GraiderUIApi> = {}) => {
  const api = {
    getAppInfo: vi.fn().mockResolvedValue({ name: "Graider", version: "0.1.0" }),
    checkGitHubAuth: vi.fn().mockResolvedValue({
      status: "connected",
      username: null,
      diagnostic: null,
      diagnosticCode: null
    }),
    selectCourseFolder: vi.fn().mockResolvedValue({ canceled: true, courseFolder: null }),
    listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
    removeCourseFolder: vi.fn().mockResolvedValue(undefined),
    refreshCourseFolder: vi.fn().mockResolvedValue(createDashboardResult()),
    refreshDashboard: vi.fn().mockResolvedValue(createCombinedDashboardResult()),
    loadRosterTerms: vi.fn().mockResolvedValue({
      terms: [{ code: "27s1", sections: ["001"] }],
      diagnostics: []
    }),
    getRosterSectionSummaries: vi.fn().mockResolvedValue({
      status: "ready",
      summaries: [
        {
          sectionId: "001",
          status: "missing",
          exists: false,
          diagnostics: []
        }
      ],
      diagnostics: []
    }),
    getRosterForSection: vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/section-001.csv",
      exists: false,
      rows: [],
      faculty: [],
      diagnostics: []
    }),
    previewRosterSave: vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/section-001.csv",
      content: "student_id,github_username,section,status\n",
      exists: false,
      diagnostics: []
    }),
    saveRoster: vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/section-001.csv",
      source: {
        kind: "manual_edit",
        updatedAt: "2026-09-23T15:30:00.000Z",
        updatedBy: "jones"
      },
      diagnostics: []
    }),
    ...overrides
  };

  Object.defineProperty(window, "graiderUI", { configurable: true, value: api });
  return api;
};

describe("RosterManagerRoute", () => {
  it("uses the resolved canonical route term without asking faculty to select it again", async () => {
    const api = mockGraiderUI();
    renderAtRoute("/course/csc1120/27s1/roster");

    await screen.findByRole("heading", { level: 1, name: "Manage rosters" });
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb).toHaveTextContent("Dashboard" + "CSC1120 · Spring 2027" + "Roster");
    expect(
      screen.getByText("CSC1120 · Spring 2027", { selector: ".page-header__meta" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Section 001, No roster" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(api.getRosterSectionSummaries).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      termCode: "27s1"
    });
    expect(api.getRosterForSection).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      termCode: "27s1",
      sectionId: "001"
    });
  });

  it("navigates from the dashboard and saves through the typed preload APIs", async () => {
    const refreshCourseFolder = vi.fn().mockResolvedValue(createDashboardResult());
    const api = mockGraiderUI({ refreshCourseFolder });
    renderAtRoute("/");

    await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" });
    fireEvent.click(
      await screen.findByRole("button", { name: `Manage rosters in ${COURSE_FOLDER.path}` })
    );
    await screen.findByText(
      "No roster has been created for this section yet. Add students manually or replace from CSV."
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Add student" })[0]!);
    fireEvent.change(screen.getByLabelText("Student ID for row 1"), {
      target: { value: "S001" }
    });
    fireEvent.change(screen.getByLabelText("GitHub username for S001"), {
      target: { value: "ada" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    const dialog = await screen.findByRole("dialog", { name: "Review roster changes" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save roster" }));

    await waitFor(() =>
      expect(api.saveRoster).toHaveBeenCalledWith(
        expect.objectContaining({
          termCode: "27s1",
          sectionId: "001",
          sourceKind: "manual_edit",
          confirmed: true
        })
      )
    );
    expect(await screen.findByText("Roster saved.")).toHaveAttribute("role", "status");
    await waitFor(() => expect(refreshCourseFolder).toHaveBeenCalledWith(COURSE_FOLDER.id));
  });

  it("keeps the canonical breadcrumb when entered from the dashboard", async () => {
    mockGraiderUI();
    renderAtRoute("/");
    await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" });
    fireEvent.click(
      await screen.findByRole("button", { name: `Manage rosters in ${COURSE_FOLDER.path}` })
    );

    const breadcrumb = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(breadcrumb).toHaveTextContent("CSC1120 · Spring 2027");
    expect(breadcrumb).toHaveTextContent("Roster");
  });
});
