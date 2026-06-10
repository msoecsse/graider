import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord,
  GraiderUIApi
} from "../../electron/ipc";
import { DashboardPage } from "./DashboardPage";

const COURSE_FOLDER: CourseFolderRecord = {
  id: "course-folder-csc1120",
  path: "/Users/sean/dev/csc1120",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T19:30:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const SECOND_COURSE_FOLDER: CourseFolderRecord = {
  id: "course-folder-csc4641",
  path: "/Users/sean/dev/csc4641",
  displayAlias: null,
  lastOpenedAt: "2026-06-09T20:00:00.000Z",
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
  roster: {
    sectionCount: 1,
    activeStudentCount: 3,
    totalStudentCount: 3
  },
  assignmentCount: 4,
  recentAssignments: [
    {
      slug: "lab02",
      title: "Lab 02",
      status: "active",
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
      needsAttention: false,
      diagnostics: []
    },
    {
      slug: "hw01",
      title: "HW 01",
      status: "completed",
      assignmentFile: "terms/27s1/assignments/hw01/assignment.yml",
      needsAttention: false,
      diagnostics: []
    }
  ],
  diagnostics: []
};

const SECOND_COURSE_TERM_CARD = {
  ...COURSE_TERM_CARD,
  displayName: "27s1-csc4641",
  courseSlug: "csc4641",
  courseTitle: "CSC4641"
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
    selectCourseFolder: vi.fn().mockResolvedValue({ canceled: true, courseFolder: null }),
    listCourseFolders: vi.fn().mockResolvedValue([]),
    removeCourseFolder: vi.fn().mockResolvedValue(undefined),
    refreshCourseFolder: vi.fn().mockResolvedValue(createDashboardResult()),
    refreshDashboard: vi.fn().mockResolvedValue(createCombinedDashboardResult([])),
    ...api
  };

  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: graiderUI
  });

  return graiderUI;
};

const getFirstOpenCourseFolderButton = async (): Promise<HTMLElement> => {
  const openButtons = await screen.findAllByRole("button", { name: "Open course folder" });
  const openButton = openButtons[0];

  if (openButton === undefined) {
    throw new Error("Expected an Open course folder button.");
  }

  return openButton;
};

const getCourseCardHeadingNames = (): string[] =>
  screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent ?? "")
    .filter((text) => text.startsWith("27"));

describe("DashboardPage", () => {
  it("renders the empty course state", async () => {
    render(<DashboardPage />);

    expect(screen.getByText("Graider")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "No courses added yet." })
    ).toBeInTheDocument();
    expect(screen.getByText("Open a Graider course folder to get started.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open course folder" })).toHaveLength(2);
  });

  it("renders accessible toolbar controls", async () => {
    render(<DashboardPage />);

    await screen.findByRole("heading", { level: 2, name: "No courses added yet." });

    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "View" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Sort" })).toBeEnabled();
  });

  it("renders registered folder records", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER])
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Registered course folders")).toBeInTheDocument();
    expect(screen.getAllByText(COURSE_FOLDER.path).length).toBeGreaterThan(0);
    expect(screen.getAllByText(SECOND_COURSE_FOLDER.path).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { level: 2, name: "No courses added yet." })).toBeNull();
  });

  it("shows refresh controls for registered folders", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER])
    });

    render(<DashboardPage />);

    expect(
      await screen.findByRole("button", { name: `Refresh ${COURSE_FOLDER.path}` })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("clicking Open course folder calls the preload API", async () => {
    const selectCourseFolder = vi.fn().mockResolvedValue({ canceled: true, courseFolder: null });

    mockGraiderUI({ selectCourseFolder });
    render(<DashboardPage />);

    fireEvent.click(await getFirstOpenCourseFolderButton());

    await waitFor(() => {
      expect(selectCourseFolder).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("heading", { level: 2, name: "No courses added yet." })
    ).toBeInTheDocument();
  });

  it("successful folder selection updates the visible list", async () => {
    mockGraiderUI({
      selectCourseFolder: vi.fn().mockResolvedValue({
        canceled: false,
        courseFolder: COURSE_FOLDER
      })
    });
    render(<DashboardPage />);

    fireEvent.click(await getFirstOpenCourseFolderButton());

    expect(await screen.findByText(COURSE_FOLDER.path)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "No courses added yet." })).toBeNull();
  });

  it("clicking Remove from dashboard removes the folder from the UI", async () => {
    const removeCourseFolder = vi.fn().mockResolvedValue(undefined);

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      removeCourseFolder
    });
    render(<DashboardPage />);

    expect(await screen.findByText(COURSE_FOLDER.path)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: `Remove ${COURSE_FOLDER.path} from dashboard` })
    );

    await waitFor(() => {
      expect(removeCourseFolder).toHaveBeenCalledWith(COURSE_FOLDER.id);
    });
    expect(screen.queryByText(COURSE_FOLDER.path)).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 2, name: "No courses added yet." })
    ).toBeInTheDocument();
  });

  it("clicking folder Refresh calls the preload API and shows success", async () => {
    const refreshCourseFolder = vi.fn().mockResolvedValue(createDashboardResult());

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshCourseFolder
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: `Refresh ${COURSE_FOLDER.path}` }));

    await waitFor(() => {
      expect(refreshCourseFolder).toHaveBeenCalledWith(COURSE_FOLDER.id);
    });
    expect(await screen.findByText("1 card loaded")).toBeInTheDocument();
  });

  it("Refresh all calls the preload API", async () => {
    const refreshDashboard = vi
      .fn()
      .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()]));

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(refreshDashboard).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("1 card loaded")).toBeInTheDocument();
  });

  it("combines cards from multiple successful folder results", async () => {
    const firstResult = createDashboardResult({}, [COURSE_TERM_CARD]);
    const secondResult = createDashboardResult(
      {
        courseFolderId: SECOND_COURSE_FOLDER.id,
        courseFolderPath: SECOND_COURSE_FOLDER.path
      },
      [SECOND_COURSE_TERM_CARD]
    );
    const refreshDashboard = vi
      .fn()
      .mockResolvedValue(createCombinedDashboardResult([firstResult, secondResult]));

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER]),
      refreshDashboard
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "27s1-csc4641" })).toBeInTheDocument();
    expect(screen.getAllByText(COURSE_FOLDER.path).length).toBeGreaterThan(0);
    expect(screen.getAllByText(SECOND_COURSE_FOLDER.path).length).toBeGreaterThan(0);
  });

  it("filters cards with local search and shows a filtered empty state", async () => {
    const refreshDashboard = vi.fn().mockResolvedValue(
      createCombinedDashboardResult([
        createDashboardResult({}, [COURSE_TERM_CARD]),
        createDashboardResult(
          {
            courseFolderId: SECOND_COURSE_FOLDER.id,
            courseFolderPath: SECOND_COURSE_FOLDER.path
          },
          [SECOND_COURSE_TERM_CARD]
        )
      ])
    );

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER]),
      refreshDashboard
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "  csc4641  " }
    });

    expect(screen.queryByRole("heading", { level: 2, name: "27s1-csc1120" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "27s1-csc4641" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "lab 02" }
    });

    expect(screen.getByRole("heading", { level: 2, name: "27s1-csc1120" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "27s1-csc4641" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "no-match" }
    });

    expect(
      screen.getByRole("heading", { level: 2, name: "No matching courses found." })
    ).toBeInTheDocument();
  });

  it("filters by active, needs attention, and all views", async () => {
    const inactiveCard = {
      ...SECOND_COURSE_TERM_CARD,
      displayName: "27s1-csc4641",
      status: "inactive"
    };
    const attentionCard = {
      ...COURSE_TERM_CARD,
      displayName: "27s1-csc1120",
      needsAttention: true,
      attentionCount: 1
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER]),
      refreshDashboard: vi.fn().mockResolvedValue(
        createCombinedDashboardResult([
          createDashboardResult({}, [attentionCard]),
          createDashboardResult(
            {
              courseFolderId: SECOND_COURSE_FOLDER.id,
              courseFolderPath: SECOND_COURSE_FOLDER.path
            },
            [inactiveCard]
          )
        ])
      )
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "27s1-csc4641" })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "View" }), {
      target: { value: "all" }
    });
    expect(screen.getByRole("heading", { level: 2, name: "27s1-csc4641" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "View" }), {
      target: { value: "needs-attention" }
    });
    expect(screen.getByRole("heading", { level: 2, name: "27s1-csc1120" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "27s1-csc4641" })).toBeNull();
  });

  it("sorts cards from the toolbar", async () => {
    const alphaCard = {
      ...COURSE_TERM_CARD,
      displayName: "27s1-alpha",
      courseSlug: "alpha",
      courseTitle: "Alpha",
      termSlug: "27s2",
      needsAttention: true,
      attentionCount: 3,
      recentAssignments: [
        {
          slug: "new",
          title: "New",
          status: "active",
          assignmentFile: "new.yml",
          dueAt: "2027-06-01T00:00:00.000Z",
          needsAttention: false,
          diagnostics: []
        }
      ]
    };
    const zetaCard = {
      ...SECOND_COURSE_TERM_CARD,
      displayName: "27s2-zeta",
      courseSlug: "zeta",
      courseTitle: "Zeta",
      termSlug: "27s1",
      needsAttention: true,
      attentionCount: 1,
      recentAssignments: [
        {
          slug: "old",
          title: "Old",
          status: "active",
          assignmentFile: "old.yml",
          dueAt: "2027-01-01T00:00:00.000Z",
          needsAttention: false,
          diagnostics: []
        }
      ]
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER]),
      refreshDashboard: vi.fn().mockResolvedValue(
        createCombinedDashboardResult([
          createDashboardResult(
            {
              refreshedAt: "2026-06-09T12:00:00.000Z"
            },
            [zetaCard]
          ),
          createDashboardResult(
            {
              courseFolderId: SECOND_COURSE_FOLDER.id,
              courseFolderPath: SECOND_COURSE_FOLDER.path,
              refreshedAt: "2026-06-10T12:00:00.000Z"
            },
            [alphaCard]
          )
        ])
      )
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-alpha" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), {
      target: { value: "course" }
    });
    expect(getCourseCardHeadingNames()).toEqual(["27s1-alpha", "27s2-zeta"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), {
      target: { value: "term" }
    });
    expect(getCourseCardHeadingNames()).toEqual(["27s2-zeta", "27s1-alpha"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), {
      target: { value: "needs-attention" }
    });
    expect(getCourseCardHeadingNames()).toEqual(["27s1-alpha", "27s2-zeta"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), {
      target: { value: "recently-refreshed" }
    });
    expect(getCourseCardHeadingNames()).toEqual(["27s1-alpha", "27s2-zeta"]);
  });

  it("renders course card content and recent assignments in returned order", async () => {
    const card = {
      ...COURSE_TERM_CARD,
      recentAssignments: [
        {
          slug: "completed-first",
          title: "Completed First",
          status: "completed",
          assignmentFile: "terms/27s1/assignments/completed-first/assignment.yml",
          needsAttention: false,
          diagnostics: []
        },
        {
          slug: "active-second",
          title: "Active Second",
          status: "active",
          assignmentFile: "terms/27s1/assignments/active-second/assignment.yml",
          needsAttention: false,
          diagnostics: []
        }
      ]
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult({}, [card])]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
    expect(screen.getByText("CSC1120 · Spring 2027")).toBeInTheDocument();
    expect(screen.getByText("3 students · 1 section · 4 assignments")).toBeInTheDocument();
    expect(screen.getByText("Completed First")).toBeInTheDocument();
    expect(screen.getByText("Active Second")).toBeInTheDocument();
    expect(
      screen.getByText("Completed First").compareDocumentPosition(screen.getByText("Active Second"))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders fallback card title when displayName is missing", async () => {
    const card = {
      ...COURSE_TERM_CARD,
      displayName: null,
      courseSlug: "csc1120",
      termSlug: "27s1"
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult({}, [card])]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
  });

  it("renders needs-attention badges and assignment indicators", async () => {
    const card = {
      ...COURSE_TERM_CARD,
      needsAttention: true,
      attentionCount: 2,
      recentAssignments: [
        {
          slug: "lab02",
          title: "Lab 02",
          status: "active",
          assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
          needsAttention: true,
          diagnostics: []
        }
      ]
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult({}, [card])]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("2 issues")).toBeInTheDocument();
    expect(screen.getByLabelText("Lab 02 needs attention")).toBeInTheDocument();
  });

  it("renders accessible fallback for needs-attention without count", async () => {
    const card = {
      ...COURSE_TERM_CARD,
      needsAttention: true,
      attentionCount: null
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult({}, [card])]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(await screen.findByLabelText("27s1-csc1120 needs attention")).toBeInTheDocument();
  });

  it("shows card and assignment diagnostics safely", async () => {
    const card = {
      ...COURSE_TERM_CARD,
      diagnostics: [
        {
          code: "dashboard_grading_workflow_missing",
          severity: "error",
          message: "Configured grading workflow was not found."
        }
      ],
      recentAssignments: [
        {
          slug: "lab02",
          title: "Lab 02",
          status: "active",
          assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
          needsAttention: true,
          diagnostics: [
            {
              code: "assignment_config_parse_failed",
              severity: "error",
              message: "Could not parse assignment.yml."
            }
          ]
        }
      ]
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult({}, [card])]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(await screen.findByText("View diagnostics"));

    expect(screen.getByText("Configured grading workflow was not found.")).toBeInTheDocument();
    expect(screen.getByText("Could not parse assignment.yml.")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
  });

  it("shows no-card state when refresh succeeds with empty cards", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult({}, [])]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "No course-term cards found." })
    ).toBeInTheDocument();
  });

  it("shows cards plus folder-level errors for partial failures", async () => {
    const failureResult: CourseFolderDashboardResult = {
      courseFolderId: SECOND_COURSE_FOLDER.id,
      courseFolderPath: SECOND_COURSE_FOLDER.path,
      status: "failure",
      dashboard: null,
      error: {
        code: "graider_cli_not_found",
        message: "missing secret-token-value",
        exitCode: null,
        stdoutSnippet: null,
        stderrSnippet: null
      },
      refreshedAt: null
    };

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(
          createCombinedDashboardResult([
            createDashboardResult({}, [COURSE_TERM_CARD]),
            failureResult
          ])
        )
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
    expect(screen.getByText(`Could not load ${SECOND_COURSE_FOLDER.path}`)).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
  });

  it("refreshing one folder replaces only that folder's cards", async () => {
    const refreshDashboard = vi.fn().mockResolvedValue(
      createCombinedDashboardResult([
        createDashboardResult({}, [{ ...COURSE_TERM_CARD, displayName: "old-csc1120" }]),
        createDashboardResult(
          {
            courseFolderId: SECOND_COURSE_FOLDER.id,
            courseFolderPath: SECOND_COURSE_FOLDER.path
          },
          [{ ...SECOND_COURSE_TERM_CARD, displayName: "stable-csc4641" }]
        )
      ])
    );
    const refreshCourseFolder = vi
      .fn()
      .mockResolvedValue(
        createDashboardResult({}, [{ ...COURSE_TERM_CARD, displayName: "new-csc1120" }])
      );

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER, SECOND_COURSE_FOLDER]),
      refreshDashboard,
      refreshCourseFolder
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "old-csc1120" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Refresh ${COURSE_FOLDER.path}` }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "new-csc1120" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "old-csc1120" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "stable-csc4641" })).toBeInTheDocument();
  });

  it("shows refresh loading state", async () => {
    let resolveRefresh: (value: CourseFolderDashboardResult) => void = () => undefined;
    const refreshCourseFolder = vi.fn(
      async () =>
        await new Promise<CourseFolderDashboardResult>((resolve) => {
          resolveRefresh = resolve;
        })
    );

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshCourseFolder
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: `Refresh ${COURSE_FOLDER.path}` }));

    expect(await screen.findByText("Refreshing...")).toBeInTheDocument();
    resolveRefresh(createDashboardResult());
    expect(await screen.findByText("1 card loaded")).toBeInTheDocument();
  });

  it("shows GitHub token setup guidance without rendering token values", async () => {
    const refreshCourseFolder = vi.fn().mockResolvedValue(
      createDashboardResult({
        status: "failure",
        dashboard: null,
        error: {
          code: "github_token_unavailable",
          message: "missing secret-token-value",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: null
      })
    );

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshCourseFolder
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: `Refresh ${COURSE_FOLDER.path}` }));

    expect((await screen.findAllByText(/GitHub token required/u)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/gh auth login/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
  });

  it("shows Graider CLI PATH guidance", async () => {
    const refreshCourseFolder = vi.fn().mockResolvedValue(
      createDashboardResult({
        status: "failure",
        dashboard: null,
        error: {
          code: "graider_cli_not_found",
          message: "missing cli",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        }
      })
    );

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshCourseFolder
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: `Refresh ${COURSE_FOLDER.path}` }));

    expect((await screen.findAllByText(/Graider CLI not found/u)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PATH/u).length).toBeGreaterThan(0);
  });

  it("shows safe invalid JSON error text", async () => {
    const refreshCourseFolder = vi.fn().mockResolvedValue(
      createDashboardResult({
        status: "failure",
        dashboard: null,
        error: {
          code: "invalid_dashboard_json",
          message: "Unexpected token at stack line",
          exitCode: 0,
          stdoutSnippet: "not json",
          stderrSnippet: null
        }
      })
    );

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshCourseFolder
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: `Refresh ${COURSE_FOLDER.path}` }));

    expect(
      (await screen.findAllByText("Graider dashboard returned invalid JSON.")).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Unexpected token/u)).toBeNull();
  });

  it("does not use delete wording for registry removal", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER])
    });

    render(<DashboardPage />);

    expect(
      await screen.findByRole("button", { name: `Remove ${COURSE_FOLDER.path} from dashboard` })
    ).toBeInTheDocument();
    expect(screen.queryByText("Delete")).toBeNull();
  });
});
