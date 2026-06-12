import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentDetailJsonResponse,
  AssignmentApplyPreviewJsonResponse,
  AssignmentApplyPreviewResult,
  AssignmentDetailResult,
  AssignmentGradePreviewJsonResponse,
  AssignmentGradePreviewResult,
  AssignmentGradeJsonResponse,
  AssignmentGradeResult,
  AssignmentGradeStatusJsonResponse,
  AssignmentGradeStatusResult,
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord,
  FacultyReportJsonResponse,
  FacultyReportResult,
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

const createAssignmentDetailJson = (
  overrides: Partial<AssignmentDetailJsonResponse> = {}
): AssignmentDetailJsonResponse => ({
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
    file: "terms/27s1/assignments/lab02/assignment.yml"
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
  },
  ...overrides
});

const createAssignmentDetailResult = (
  overrides: Partial<AssignmentDetailResult> = {},
  detail: AssignmentDetailJsonResponse | null = createAssignmentDetailJson()
): AssignmentDetailResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  status: detail === null ? "failure" : "success",
  detail,
  error: null,
  refreshedAt: "2026-06-10T13:00:00.000Z",
  ...overrides
});

const createAssignmentApplyPreviewJson = (
  overrides: Partial<AssignmentApplyPreviewJsonResponse> = {}
): AssignmentApplyPreviewJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment apply-preview",
  status: "success",
  exitCode: 0,
  diagnostics: [],
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    file: "terms/27s1/assignments/lab02/assignment.yml",
    status: "active"
  },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 2 },
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
    resultFile: "results.json",
    workflowStatus: "available",
    workflowDispatch: "available"
  },
  plan: {
    summary: {
      wouldCreateRepositories: 1,
      wouldUpdateRepositories: 1,
      wouldSkipRepositories: 0,
      blockedRepositories: 0,
      unknownRepositories: 0
    },
    repositories: [
      {
        studentId: "s001",
        githubUsername: "ada",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-ada",
        status: "would_create",
        reason: "student_repository_missing",
        diagnostics: []
      }
    ]
  },
  files: {
    assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
    workflowFile: ".github/workflows/grade.yml",
    templateSource: "graider-sandbox/csc1120L2Template@main"
  },
  actions: {
    apply: { available: true, implemented: false, previewOnly: true }
  },
  ...overrides
});

const createAssignmentApplyPreviewResult = (
  overrides: Partial<AssignmentApplyPreviewResult> = {},
  preview: AssignmentApplyPreviewJsonResponse | null = createAssignmentApplyPreviewJson()
): AssignmentApplyPreviewResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  status: preview === null ? "failure" : "success",
  preview,
  error: null,
  refreshedAt: "2026-06-10T14:00:00.000Z",
  ...overrides
});

const createAssignmentGradePreviewJson = (
  overrides: Partial<AssignmentGradePreviewJsonResponse> = {}
): AssignmentGradePreviewJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade-preview",
  status: "success",
  exitCode: 0,
  diagnostics: [],
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    file: "terms/27s1/assignments/lab02/assignment.yml",
    status: "active"
  },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 2, activeStudentCount: 2 },
  grading: {
    enabled: true,
    resolvedFrom: "course_default",
    mode: "custom-workflow",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "results.json",
    workflowDispatch: "available",
    workflowRef: "main"
  },
  plan: {
    summary: {
      wouldDispatch: 1,
      wouldSkip: 1,
      blocked: 0,
      unknown: 0
    },
    repositories: [
      {
        studentId: "s001",
        githubUsername: "ada",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-ada",
        status: "would_dispatch",
        reason: "workflow_dispatch_available",
        workflow: ".github/workflows/grade.yml",
        ref: "main",
        diagnostics: []
      },
      {
        studentId: "s002",
        githubUsername: "grace",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-grace",
        status: "would_skip",
        reason: "roster_status_hold",
        workflow: ".github/workflows/grade.yml",
        ref: "main",
        diagnostics: []
      }
    ]
  },
  files: {
    assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
    manifestFile: "terms/27s1/manifests/lab02/manifest.yml",
    workflowFile: ".github/workflows/grade.yml"
  },
  actions: {
    grade: { available: true, implemented: false, previewOnly: true }
  },
  ...overrides
});

const createAssignmentGradePreviewResult = (
  overrides: Partial<AssignmentGradePreviewResult> = {},
  preview: AssignmentGradePreviewJsonResponse | null = createAssignmentGradePreviewJson()
): AssignmentGradePreviewResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  status: preview === null ? "failure" : "success",
  preview,
  error: null,
  refreshedAt: "2026-06-10T14:30:00.000Z",
  ...overrides
});

const createAssignmentGradeJson = (
  overrides: Partial<AssignmentGradeJsonResponse> = {}
): AssignmentGradeJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  status: "success",
  exitCode: 0,
  diagnostics: [],
  warnings: [],
  errors: [],
  generatedFiles: [],
  summary: {
    assignmentSlug: "lab02",
    gradingEnabled: true,
    targetsSelected: 2,
    dispatchAttempted: 2,
    dispatchSucceeded: 2,
    dispatchFailed: 0,
    skipped: 0
  },
  ...overrides
});

const createAssignmentGradeResult = (
  overrides: Partial<AssignmentGradeResult> = {},
  grade: AssignmentGradeJsonResponse | null = createAssignmentGradeJson()
): AssignmentGradeResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  status: grade === null || grade.status === "failure" ? "failure" : "success",
  grade,
  error: null,
  dispatchedAt: "2026-06-10T15:30:00.000Z",
  ...overrides
});

const createAssignmentGradeStatusJson = (
  overrides: Partial<AssignmentGradeStatusJsonResponse> = {}
): AssignmentGradeStatusJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade-status",
  status: "success",
  exitCode: 0,
  diagnostics: [],
  assignment: {
    slug: "lab02",
    title: "Lab 02",
    file: "terms/27s1/assignments/lab02/assignment.yml",
    status: "active"
  },
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
  actions: {},
  ...overrides
});

const createAssignmentGradeStatusResult = (
  overrides: Partial<AssignmentGradeStatusResult> = {},
  gradeStatus: AssignmentGradeStatusJsonResponse | null = createAssignmentGradeStatusJson()
): AssignmentGradeStatusResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  status: gradeStatus === null ? "failure" : "success",
  gradeStatus,
  error: null,
  refreshedAt: "2026-06-10T16:00:00.000Z",
  ...overrides
});

const createFacultyReportJson = (
  overrides: Partial<FacultyReportJsonResponse> = {}
): FacultyReportJsonResponse => ({
  schemaVersion: 1,
  commandName: "report",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
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
  },
  ...overrides
});

const createFacultyReportResult = (
  overrides: Partial<FacultyReportResult> = {},
  report: FacultyReportJsonResponse | null = createFacultyReportJson()
): FacultyReportResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  status: report === null ? "failure" : "success",
  report,
  error: null,
  refreshedAt: "2026-06-10T16:30:00.000Z",
  ...overrides
});

const mockGraiderUI = (api: Partial<GraiderUIApi>): GraiderUIApi => {
  const graiderUI = {
    getAppInfo: vi.fn().mockResolvedValue({ name: "Graider", version: "0.1.0" }),
    selectCourseFolder: vi.fn().mockResolvedValue({ canceled: true, courseFolder: null }),
    listCourseFolders: vi.fn().mockResolvedValue([]),
    removeCourseFolder: vi.fn().mockResolvedValue(undefined),
    refreshCourseFolder: vi.fn().mockResolvedValue(createDashboardResult()),
    refreshDashboard: vi.fn().mockResolvedValue(createCombinedDashboardResult([])),
    getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
    getAssignmentApplyPreview: vi.fn().mockResolvedValue(createAssignmentApplyPreviewResult()),
    getAssignmentGradePreview: vi.fn().mockResolvedValue(createAssignmentGradePreviewResult()),
    getAssignmentGradeStatus: vi.fn().mockResolvedValue(createAssignmentGradeStatusResult()),
    getFacultyReport: vi.fn().mockResolvedValue(createFacultyReportResult()),
    applyAssignment: vi.fn(),
    gradeAssignment: vi.fn().mockResolvedValue(createAssignmentGradeResult()),
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

const getFirstPreviewApplyButton = (): HTMLElement => {
  const button = screen.getAllByRole("button", { name: "Preview apply" })[0];

  if (button === undefined) {
    throw new Error("Expected a Preview apply button.");
  }

  return button;
};

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

  it("opens assignment detail from a dashboard assignment row", async () => {
    const getAssignmentDetail = vi.fn().mockResolvedValue(createAssignmentDetailResult());

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
    expect(getAssignmentDetail).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
    });
    expect(screen.getByText("terms/27s1/assignments/lab02/assignment.yml")).toBeInTheDocument();
  });

  it("returns to the preserved dashboard from assignment detail", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));

    expect(screen.getByRole("heading", { level: 2, name: "27s1-csc1120" })).toBeInTheDocument();
  });

  it("renders assignment detail panels and disabled future actions", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()]))
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );

    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.getByText("2027-06-15T23:59:00+09:00")).toBeInTheDocument();
    expect(screen.getByText("graider-sandbox/csc1120L2Template")).toBeInTheDocument();
    expect(screen.getByText(".github/workflows/grade.yml")).toBeInTheDocument();
    expect(screen.getByText("workflow_dispatch status")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("No diagnostics.")).toBeInTheDocument();
    expect(getFirstPreviewApplyButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Grade submissions" })).toBeEnabled();
    expect(screen.getAllByText("Coming in a future slice").length).toBeGreaterThan(0);
  });

  it("opens apply preview from assignment detail and returns to assignment detail", async () => {
    const getAssignmentDetail = vi.fn().mockResolvedValue(createAssignmentDetailResult());
    const getAssignmentApplyPreview = vi
      .fn()
      .mockResolvedValue(createAssignmentApplyPreviewResult());

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail,
      getAssignmentApplyPreview
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();

    fireEvent.click(getFirstPreviewApplyButton());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Apply Preview" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preview only — no repositories or files will be changed.")
    ).toBeInTheDocument();
    expect(getAssignmentApplyPreview).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to assignment" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
    expect(getAssignmentDetail).toHaveBeenCalledTimes(1);
  });

  it("opens grade dispatch preview from assignment detail and returns to assignment detail", async () => {
    const getAssignmentDetail = vi.fn().mockResolvedValue(createAssignmentDetailResult());
    const getAssignmentGradePreview = vi
      .fn()
      .mockResolvedValue(createAssignmentGradePreviewResult());

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail,
      getAssignmentGradePreview
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview grading" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Dispatch Preview" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preview only — no GitHub Actions workflows will be started.")
    ).toBeInTheDocument();
    expect(getAssignmentGradePreview).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to assignment detail" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
    expect(getAssignmentDetail).toHaveBeenCalledTimes(1);
  });

  it("opens faculty report from grade status and returns to grade status", async () => {
    const getAssignmentDetail = vi.fn().mockResolvedValue(createAssignmentDetailResult());
    const getAssignmentGradeStatus = vi.fn().mockResolvedValue(createAssignmentGradeStatusResult());
    const getFacultyReport = vi.fn().mockResolvedValue(createFacultyReportResult());

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail,
      getAssignmentGradeStatus,
      getFacultyReport
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View grading status" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Status" })
    ).toBeInTheDocument();
    expect(getAssignmentGradeStatus).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
    });

    fireEvent.click(await screen.findByRole("button", { name: "View faculty report" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Faculty Report" })
    ).toBeInTheDocument();
    expect(getFacultyReport).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: "terms/27s1/assignments/lab02/assignment.yml"
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to grading status" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Status" })
    ).toBeInTheDocument();
  });

  it("refreshes assignment detail while preserving prior detail", async () => {
    let resolveSecondRefresh: (value: AssignmentDetailResult) => void = () => undefined;
    const getAssignmentDetail = vi
      .fn()
      .mockResolvedValueOnce(createAssignmentDetailResult())
      .mockImplementationOnce(
        async () =>
          await new Promise<AssignmentDetailResult>((resolve) => {
            resolveSecondRefresh = resolve;
          })
      );

    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );
    expect(await screen.findByText("100")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh detail" }));

    expect(await screen.findByText("Loading assignment detail...")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refreshing detail..." })).toBeDisabled();

    resolveSecondRefresh(
      createAssignmentDetailResult(
        {},
        createAssignmentDetailJson({
          metadata: {
            facultyOwner: "professor",
            lmsAssignmentId: null,
            gradingCategory: "labs",
            points: 90
          }
        })
      )
    );

    expect(await screen.findByText("90")).toBeInTheDocument();
  });

  it("renders no-grading assignment detail cleanly", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          {},
          createAssignmentDetailJson({
            grading: {
              enabled: false,
              mode: "no-grading",
              workflow: null,
              artifact: null,
              resultFile: null,
              workflowStatus: "not_required",
              workflowDispatch: "not_required"
            }
          })
        )
      )
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );

    expect(await screen.findByText("No grading configured.")).toBeInTheDocument();
    expect(screen.queryByText("No grading configured.")).toBeInTheDocument();
  });

  it("renders partial assignment detail diagnostics and token guidance safely", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          {},
          createAssignmentDetailJson({
            status: "partial_success",
            diagnostics: [
              {
                code: "github_token_required",
                severity: "warning",
                message: "GitHub token required.",
                context: { assignmentFile: "terms/27s1/assignments/lab02/assignment.yml" }
              }
            ],
            template: {
              repository: "graider-sandbox/csc1120L2Template",
              branch: "main",
              status: "token_required",
              repositoryStatus: "token_required",
              branchStatus: "token_required"
            }
          })
        )
      )
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );

    expect(
      await screen.findByText("GitHub token required for readiness checks.")
    ).toBeInTheDocument();
    expect(screen.getByText(/gh auth login/u)).toBeInTheDocument();
    expect(screen.getByText("github_token_required")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
  });

  it("shows safe assignment detail command errors", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          {
            status: "failure",
            error: {
              code: "graider_cli_not_found",
              message: "missing secret-token-value",
              exitCode: null,
              stdoutSnippet: null,
              stderrSnippet: null
            }
          },
          null
        )
      )
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );

    expect((await screen.findAllByText(/Graider CLI not found/u)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
  });

  it("shows invalid assignment detail JSON safely", async () => {
    mockGraiderUI({
      listCourseFolders: vi.fn().mockResolvedValue([COURSE_FOLDER]),
      refreshDashboard: vi
        .fn()
        .mockResolvedValue(createCombinedDashboardResult([createDashboardResult()])),
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          {
            status: "failure",
            error: {
              code: "invalid_assignment_detail_json",
              message: "Unexpected token stack",
              exitCode: 0,
              stdoutSnippet: "not json",
              stderrSnippet: null
            }
          },
          null
        )
      )
    });
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open assignment detail for Lab 02" })
    );

    expect(
      await screen.findByText("Graider returned invalid assignment detail JSON.")
    ).toBeInTheDocument();
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
