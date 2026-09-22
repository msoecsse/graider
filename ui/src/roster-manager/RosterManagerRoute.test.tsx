import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord,
  GraiderUIApi
} from "../../electron/ipc";
import { renderAtRoute } from "../test/routeTestUtils";

/**
 * RosterManagerRoute resolves `:courseSlug`/`:termSlug` into a registered
 * course folder (README section 4.1) and renders RosterManagerPage with a
 * breadcrumb trail above it in place of the removed "Back to dashboard"
 * button. These tests were moved out of DashboardPage.test.tsx: since
 * DashboardPage no longer renders RosterManagerPage directly (it only
 * navigates to this route), asserting on roster content requires mounting
 * the real route tree via `renderAtRoute`, not `DashboardPage` alone.
 */

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
  assignmentCount: 1,
  recentAssignments: [
    {
      slug: "lab02",
      title: "Lab 02",
      status: "active",
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
      needsAttention: false,
      diagnostics: []
    }
  ],
  diagnostics: []
};

const createDashboardResult = (
  overrides: Partial<CourseFolderDashboardResult> = {},
  cards: readonly unknown[] = [COURSE_TERM_CARD]
): CourseFolderDashboardResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  status: "success",
  dashboard: {
    schemaVersion: 1,
    commandName: "dashboard",
    status: "success",
    exitCode: 0,
    diagnostics: [],
    summary: { cardCount: cards.length },
    cards
  },
  error: null,
  refreshedAt: "2026-06-10T12:00:00.000Z",
  ...overrides
});

const createCombinedDashboardResult = (
  results: readonly CourseFolderDashboardResult[]
): CombinedDashboardResult => ({
  status: results.every((result) => result.status === "success") ? "success" : "partial_failure",
  results
});

const mockGraiderUI = (api: Partial<GraiderUIApi>): GraiderUIApi => {
  const graiderUI = {
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
    refreshDashboard: vi
      .fn()
      .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
    ...api
  };

  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: graiderUI
  });

  return graiderUI as unknown as GraiderUIApi;
};

describe("RosterManagerRoute", () => {
  it("renders a breadcrumb trail: Dashboard, course/term, Roster", async () => {
    mockGraiderUI({});
    renderAtRoute("/course/csc1120/27s1/roster");

    await screen.findByRole("heading", { level: 1, name: "Manage rosters" });
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb).toHaveTextContent("Dashboard" + "CSC1120 · Spring 2027" + "Roster");
    expect(within(breadcrumb).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("manages a roster through the typed preload APIs", async () => {
    const loadRosterTerms = vi.fn().mockResolvedValue({
      terms: [{ code: "27s1", sections: ["001"] }],
      diagnostics: []
    });
    const getRosterForSection = vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/section-001.csv",
      exists: false,
      rows: [],
      diagnostics: []
    });
    const previewRosterSave = vi.fn().mockResolvedValue({
      status: "ready",
      path: "terms/27s1/rosters/section-001.csv",
      content: "student_id,github_username,email,first_name,last_name,section,status\n",
      exists: false,
      diagnostics: []
    });
    const saveRoster = vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/section-001.csv",
      diagnostics: []
    });
    const refreshCourseFolder = vi.fn().mockResolvedValue(createDashboardResult());

    mockGraiderUI({
      loadRosterTerms,
      getRosterForSection,
      previewRosterSave,
      saveRoster,
      refreshCourseFolder
    });
    renderAtRoute("/");

    await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" });
    fireEvent.click(
      await screen.findByRole("button", { name: `Manage rosters in ${COURSE_FOLDER.path}` })
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Manage rosters" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "001" } });
    await waitFor(() => expect(getRosterForSection).toHaveBeenCalledTimes(1));
    expect(screen.getByText("A new roster will be created.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Student" }));
    fireEvent.change(screen.getByLabelText("student_id row 1"), { target: { value: "S001" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Student 1" }));
    expect(screen.queryByLabelText("student_id row 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Student" }));
    fireEvent.change(screen.getByLabelText("student_id row 1"), { target: { value: "S001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));
    await waitFor(() => expect(previewRosterSave).toHaveBeenCalledTimes(1));
    const confirmation = await screen.findByRole("dialog", { name: "Save roster changes?" });
    expect(
      within(confirmation).getByText("Create roster with 1 student record.")
    ).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Save roster" }));

    expect(await screen.findByText("Saved terms/27s1/rosters/section-001.csv")).toBeInTheDocument();
    await waitFor(() => expect(refreshCourseFolder).toHaveBeenCalledWith(COURSE_FOLDER.id));
  });

  it("keeps the roster status select on its raw machine value, not a display label", async () => {
    // README section 2.3 asks for status enums to display as plain language, but
    // RosterManagerPage.tsx's status <select> is a form control, not display
    // text -- PR8-2 deliberately left it alone (see its summary). This locks in
    // that the option text and the submitted value both stay the raw roster
    // status the backend expects ("active"/"dropped"/"hold"), not a mapped label.
    mockGraiderUI({
      loadRosterTerms: vi.fn().mockResolvedValue({
        terms: [{ code: "27s1", sections: ["001"] }],
        diagnostics: []
      }),
      getRosterForSection: vi.fn().mockResolvedValue({
        status: "ready",
        path: "terms/27s1/rosters/section-001.csv",
        exists: false,
        rows: [],
        diagnostics: []
      })
    });
    renderAtRoute("/");

    // Wait for the dashboard's own card to load before clicking "Manage
    // rosters": that button also exists in the "Advanced details" folder
    // list, which needs only `courseFolders` (no dashboard cards) to render,
    // so it can become clickable before `aggregatedDashboard.cards` is
    // populated -- clicking it that early hits the same card-resolution gap
    // as roster management does generally (see the PR10-1 summary).
    await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" });
    fireEvent.click(
      await screen.findByRole("button", { name: `Manage rosters in ${COURSE_FOLDER.path}` })
    );
    await screen.findByRole("heading", { level: 1, name: "Manage rosters" });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "001" } });
    await screen.findByText("A new roster will be created.");

    fireEvent.click(screen.getByRole("button", { name: "Add Student" }));
    const statusSelect = screen.getByLabelText("status row 1") as HTMLSelectElement;

    expect(statusSelect.value).toBe("active");
    expect(screen.getByRole("option", { name: "dropped" })).toBeInTheDocument();

    fireEvent.change(statusSelect, { target: { value: "dropped" } });

    expect(statusSelect.value).toBe("dropped");
  });

  it("removes a selected section through the confirmed section action", async () => {
    const removeSection = vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/section-001.csv",
      diagnostics: []
    });
    mockGraiderUI({
      loadRosterTerms: vi.fn().mockResolvedValue({
        terms: [{ code: "27s1", sections: ["001"] }],
        diagnostics: []
      }),
      getRosterForSection: vi.fn().mockResolvedValue({
        status: "ready",
        path: "terms/27s1/rosters/section-001.csv",
        exists: false,
        rows: [],
        diagnostics: []
      }),
      removeSection
    });
    renderAtRoute("/");

    await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" });
    fireEvent.click(
      await screen.findByRole("button", { name: `Manage rosters in ${COURSE_FOLDER.path}` })
    );
    await screen.findByRole("option", { name: "27s1" });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "001" } });
    await screen.findByRole("button", { name: "Remove Section" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Section" }));
    const removeSectionConfirm = screen.getByRole("button", { name: "Remove section" });
    expect(removeSectionConfirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Type 001 to confirm/u }), {
      target: { value: "001" }
    });
    fireEvent.click(removeSectionConfirm);

    await waitFor(() =>
      expect(removeSection).toHaveBeenCalledWith({
        courseFolderId: COURSE_FOLDER.id,
        courseFolderPath: COURSE_FOLDER.path,
        termCode: "27s1",
        sectionId: "001",
        confirmed: true
      })
    );
    expect(screen.queryByRole("option", { name: "001" })).toBeNull();
  });

  it("blocks roster save when the preview has validation errors", async () => {
    const saveRoster = vi.fn();
    mockGraiderUI({
      loadRosterTerms: vi.fn().mockResolvedValue({
        terms: [{ code: "27s1", sections: ["001"] }],
        diagnostics: []
      }),
      getRosterForSection: vi.fn().mockResolvedValue({
        status: "ready",
        path: "terms/27s1/rosters/section-001.csv",
        exists: false,
        rows: [],
        diagnostics: []
      }),
      previewRosterSave: vi.fn().mockResolvedValue({
        status: "invalid",
        path: "terms/27s1/rosters/section-001.csv",
        content: "student_id,github_username,email,first_name,last_name,section,status\n",
        exists: false,
        diagnostics: [{ message: "Roster row 2 is missing email." }]
      }),
      saveRoster
    });
    renderAtRoute("/");

    await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" });
    fireEvent.click(
      await screen.findByRole("button", { name: `Manage rosters in ${COURSE_FOLDER.path}` })
    );
    await screen.findByRole("option", { name: "27s1" });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "001" } });
    await screen.findByRole("button", { name: "Add Student" });
    fireEvent.click(screen.getByRole("button", { name: "Save roster" }));

    expect(await screen.findByText("Roster row 2 is missing email.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Save roster changes?" })).toBeNull();
    expect(saveRoster).not.toHaveBeenCalled();
  });

  it("requires confirmation before removing an entire roster", async () => {
    const removeRoster = vi.fn().mockResolvedValue({
      status: "success",
      path: "terms/27s1/rosters/section-001.csv",
      diagnostics: []
    });
    mockGraiderUI({
      loadRosterTerms: vi.fn().mockResolvedValue({
        terms: [{ code: "27s1", sections: ["001"] }],
        diagnostics: []
      }),
      getRosterForSection: vi.fn().mockResolvedValue({
        status: "ready",
        path: "terms/27s1/rosters/section-001.csv",
        exists: true,
        rows: [],
        diagnostics: []
      }),
      removeRoster
    });
    renderAtRoute("/");

    await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" });
    fireEvent.click(
      await screen.findByRole("button", { name: `Manage rosters in ${COURSE_FOLDER.path}` })
    );
    await screen.findByRole("option", { name: "27s1" });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "001" } });
    await screen.findByText("Updating existing roster.");
    fireEvent.click(screen.getByRole("button", { name: "Remove Roster" }));

    expect(screen.getByRole("dialog", { name: "Remove roster" })).toBeInTheDocument();
    expect(removeRoster).not.toHaveBeenCalled();
    const removeRosterConfirm = screen.getByRole("button", { name: "Remove roster" });
    expect(removeRosterConfirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Type 001 to confirm/u }), {
      target: { value: "001" }
    });
    fireEvent.click(removeRosterConfirm);

    await waitFor(() =>
      expect(removeRoster).toHaveBeenCalledWith({
        courseFolderId: COURSE_FOLDER.id,
        courseFolderPath: COURSE_FOLDER.path,
        termCode: "27s1",
        sectionId: "001",
        confirmed: true
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: "001" })).not.toBeInTheDocument()
    );
  });
});
