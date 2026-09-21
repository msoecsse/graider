import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentDetailJsonResponse,
  AssignmentDetailResult,
  AssignmentApplyPreviewJsonResponse,
  AssignmentApplyPreviewResult,
  AssignmentGradePreviewJsonResponse,
  AssignmentGradePreviewResult,
  AssignmentGradeStatusJsonResponse,
  AssignmentGradeStatusResult,
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord,
  FacultyReportJsonResponse,
  FacultyReportResult,
  GraiderUIApi
} from "../electron/ipc";
import { renderAtRoute } from "./test/routeTestUtils";

/**
 * End-to-end route coverage for PR10-1 (README section 4.1). Everything here
 * renders the real `AppRoutes` tree via `renderAtRoute`, so a click that
 * calls `navigate()` actually changes the URL and mounts the destination
 * route -- this is the home for every test that used to assert on a screen
 * `DashboardPage` no longer renders directly (it used to hold that screen in
 * nullable selection state; now it only navigates to it). Assertions that
 * used to click a removed "Back to X" button now click the equivalent
 * breadcrumb, since breadcrumbs are what replaced those buttons.
 */

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
  },
  ...overrides
});

const createAssignmentDetailResult = (
  overrides: Partial<AssignmentDetailResult> = {},
  detail: AssignmentDetailJsonResponse | null = createAssignmentDetailJson()
): AssignmentDetailResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: ASSIGNMENT_FILE,
  status: detail === null ? "failure" : "success",
  detail,
  error: null,
  refreshedAt: "2026-06-10T13:00:00.000Z",
  ...overrides
});

const createApplyPreviewJson = (
  overrides: Partial<AssignmentApplyPreviewJsonResponse> = {}
): AssignmentApplyPreviewJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment apply-preview",
  status: "success",
  exitCode: 0,
  diagnostics: [],
  assignment: { slug: "lab02", title: "Lab 02", file: ASSIGNMENT_FILE, status: "active" },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 1 },
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
      wouldUpdateRepositories: 0,
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
    assignmentFile: ASSIGNMENT_FILE,
    workflowFile: ".github/workflows/grade.yml",
    templateSource: "graider-sandbox/csc1120L2Template@main"
  },
  actions: { apply: { available: true, implemented: false, previewOnly: true } },
  ...overrides
});

const createApplyPreviewResult = (
  overrides: Partial<AssignmentApplyPreviewResult> = {},
  preview: AssignmentApplyPreviewJsonResponse | null = createApplyPreviewJson()
): AssignmentApplyPreviewResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: ASSIGNMENT_FILE,
  status: preview === null ? "failure" : "success",
  preview,
  error: null,
  refreshedAt: "2026-06-10T14:00:00.000Z",
  ...overrides
});

const createGradePreviewJson = (
  overrides: Partial<AssignmentGradePreviewJsonResponse> = {}
): AssignmentGradePreviewJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade-preview",
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
    workflowDispatch: "available",
    workflowRef: "main"
  },
  plan: {
    summary: { wouldDispatch: 1, wouldSkip: 0, blocked: 0, unknown: 0 },
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
      }
    ]
  },
  files: {
    assignmentFile: ASSIGNMENT_FILE,
    manifestFile: "terms/27s1/manifests/lab02/manifest.yml",
    workflowFile: ".github/workflows/grade.yml"
  },
  actions: { grade: { available: true, implemented: false, previewOnly: true } },
  ...overrides
});

const createGradePreviewResult = (
  overrides: Partial<AssignmentGradePreviewResult> = {},
  preview: AssignmentGradePreviewJsonResponse | null = createGradePreviewJson()
): AssignmentGradePreviewResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: ASSIGNMENT_FILE,
  status: preview === null ? "failure" : "success",
  preview,
  error: null,
  refreshedAt: "2026-06-10T14:30:00.000Z",
  ...overrides
});

const createGradeStatusJson = (
  overrides: Partial<AssignmentGradeStatusJsonResponse> = {}
): AssignmentGradeStatusJsonResponse => ({
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
  actions: {},
  ...overrides
});

const createGradeStatusResult = (
  overrides: Partial<AssignmentGradeStatusResult> = {},
  gradeStatus: AssignmentGradeStatusJsonResponse | null = createGradeStatusJson()
): AssignmentGradeStatusResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: ASSIGNMENT_FILE,
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
  },
  ...overrides
});

const createFacultyReportResult = (
  overrides: Partial<FacultyReportResult> = {},
  report: FacultyReportJsonResponse | null = createFacultyReportJson()
): FacultyReportResult => ({
  courseFolderId: COURSE_FOLDER.id,
  courseFolderPath: COURSE_FOLDER.path,
  assignmentFile: ASSIGNMENT_FILE,
  status: report === null ? "failure" : "success",
  report,
  error: null,
  refreshedAt: "2026-06-10T16:30:00.000Z",
  ...overrides
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
    getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
    prepareAssignmentTemplateSync: vi.fn().mockResolvedValue({
      available: false,
      repositoryCount: 0,
      templateRepository: null,
      recordedTemplateRevision: null
    }),
    executeAssignmentTemplateSync: vi.fn(),
    onAssignmentTemplateSyncProgress: vi.fn(() => () => undefined),
    getAssignmentApplyPreview: vi.fn().mockResolvedValue(createApplyPreviewResult()),
    getAssignmentGradePreview: vi.fn().mockResolvedValue(createGradePreviewResult()),
    getAssignmentGradeStatus: vi.fn().mockResolvedValue(createGradeStatusResult()),
    getFacultyReport: vi.fn().mockResolvedValue(createFacultyReportResult()),
    applyAssignment: vi.fn(),
    onAssignmentApplyProgress: vi.fn(() => () => undefined),
    gradeAssignment: vi.fn(),
    ...api
  };

  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: graiderUI
  });

  return graiderUI as unknown as GraiderUIApi;
};

const openAssignmentDetail = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: "Open assignment detail for Lab 02" }));
  await screen.findByRole("heading", { level: 1, name: "Lab 02" });
};

const getApplyPrimaryButton = (): HTMLElement =>
  screen.getByRole("button", { name: /^Apply to \d+ students?$/u });

const openAssignmentOverflowMenu = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: "More assignment actions" }));
};

const clickAssignmentOverflowItem = async (label: string): Promise<void> => {
  await openAssignmentOverflowMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(`^${label}`, "u") }));
};

describe("App routing — reached from the dashboard", () => {
  it("opens assignment detail from a dashboard assignment row", async () => {
    const getAssignmentDetail = vi.fn().mockResolvedValue(createAssignmentDetailResult());
    mockGraiderUI({ getAssignmentDetail });
    renderAtRoute("/");

    await openAssignmentDetail();

    expect(getAssignmentDetail).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: ASSIGNMENT_FILE
    });
    expect(screen.getByText(ASSIGNMENT_FILE)).toBeInTheDocument();
  });

  it("returns to the dashboard from assignment detail via the Dashboard breadcrumb", async () => {
    mockGraiderUI({});
    renderAtRoute("/");

    await openAssignmentDetail();
    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
  });

  it("renders assignment detail panels, compact grade status summary, and workflow actions", async () => {
    mockGraiderUI({});
    renderAtRoute("/");

    await openAssignmentDetail();

    expect(screen.getByRole("heading", { level: 2, name: "Assignment facts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Template" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Grading" })).toBeInTheDocument();
    const gradeSummary = screen.getByLabelText("Grade status summary");
    expect(within(gradeSummary).getByText("s001")).toBeInTheDocument();
    expect(getApplyPrimaryButton()).toBeEnabled();
    await openAssignmentOverflowMenu();
    expect(screen.getByRole("menuitem", { name: /^Faculty report/u })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /^View grading status/u })).toBeEnabled();
  });

  it("opens apply preview from assignment detail and returns via the assignment breadcrumb", async () => {
    const getAssignmentDetail = vi.fn().mockResolvedValue(createAssignmentDetailResult());
    const getAssignmentApplyPreview = vi.fn().mockResolvedValue(createApplyPreviewResult());
    mockGraiderUI({ getAssignmentDetail, getAssignmentApplyPreview });
    renderAtRoute("/");

    await openAssignmentDetail();
    fireEvent.click(getApplyPrimaryButton());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Apply Preview" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preview only — no repositories or files will be changed.")
    ).toBeInTheDocument();
    expect(getAssignmentApplyPreview).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: ASSIGNMENT_FILE
    });

    fireEvent.click(screen.getByRole("link", { name: "Lab 02" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
  });

  it("opens grade dispatch preview from assignment detail and returns via the assignment breadcrumb", async () => {
    // The grade preview entry point is the header's primary "Continue grading"
    // action once the assignment is applied. Grading workspace availability
    // (prepareGradingWorkspace) is unset in this suite's default mock, so
    // AssignmentDetailRoute's onPreviewGrade falls back to grade-preview.
    const getAssignmentDetail = vi
      .fn()
      .mockResolvedValue(
        createAssignmentDetailResult(
          {},
          createAssignmentDetailJson({ applyState: { status: "applied" } })
        )
      );
    const getAssignmentGradePreview = vi.fn().mockResolvedValue(createGradePreviewResult());
    mockGraiderUI({ getAssignmentDetail, getAssignmentGradePreview });
    renderAtRoute("/");

    await openAssignmentDetail();
    fireEvent.click(screen.getByRole("button", { name: "Continue grading" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Dispatch Preview" })
    ).toBeInTheDocument();
    expect(getAssignmentGradePreview).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: ASSIGNMENT_FILE
    });

    fireEvent.click(screen.getByRole("link", { name: "Lab 02" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
  });

  it("opens faculty report from grade status and returns via the kept Back to grading status button", async () => {
    const getAssignmentGradeStatus = vi.fn().mockResolvedValue(createGradeStatusResult());
    const getFacultyReport = vi.fn().mockResolvedValue(createFacultyReportResult());
    mockGraiderUI({ getAssignmentGradeStatus, getFacultyReport });
    renderAtRoute("/");

    await openAssignmentDetail();
    await clickAssignmentOverflowItem("View grading status");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Status" })
    ).toBeInTheDocument();
    expect(getAssignmentGradeStatus).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: ASSIGNMENT_FILE
    });

    fireEvent.click(await screen.findByRole("button", { name: "View faculty report" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Faculty Report" })
    ).toBeInTheDocument();
    expect(getFacultyReport).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: ASSIGNMENT_FILE
    });

    // FacultyReportPage's "Back to grading status" button was kept (README
    // section 4.1): no breadcrumb crumb represents grade status, so this is
    // still the only way back to it.
    fireEvent.click(screen.getByRole("button", { name: "Back to grading status" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Status" })
    ).toBeInTheDocument();
  });

  it("opens faculty report directly from assignment detail with the selected course context", async () => {
    const getFacultyReport = vi.fn().mockResolvedValue(createFacultyReportResult());
    const api = mockGraiderUI({ getFacultyReport });
    renderAtRoute("/");

    await openAssignmentDetail();
    await clickAssignmentOverflowItem("Faculty report");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Faculty Report" })
    ).toBeInTheDocument();
    expect(getFacultyReport).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: ASSIGNMENT_FILE
    });
    expect(api.applyAssignment).not.toHaveBeenCalled();
    expect(api.gradeAssignment).not.toHaveBeenCalled();
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
    mockGraiderUI({ getAssignmentDetail });
    renderAtRoute("/");

    await openAssignmentDetail();
    expect(await screen.findByText("100")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh assignment detail" }));

    expect(await screen.findByText("Loading assignment detail...")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();

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
    renderAtRoute("/");

    await openAssignmentDetail();

    expect(await screen.findAllByText("No grading")).toHaveLength(2);
  });

  it("creates an assignment through Assignment Setup and navigates to its Assignment Detail", async () => {
    const loadAssignmentSetupTerms = vi.fn().mockResolvedValue({
      terms: [{ code: "27s1", sections: ["001", "002"] }],
      diagnostics: []
    });
    const previewAssignmentSetup = vi.fn().mockResolvedValue({
      status: "ready",
      diagnostics: [{ message: "Template repository validated. Using default branch: master." }],
      hasConflicts: false,
      files: [
        {
          path: "terms/27s1/assignments/lab03/assignment.yml",
          content: "schema_version: 1\n",
          exists: false
        }
      ]
    });
    const saveAssignmentSetup = vi.fn().mockResolvedValue({
      status: "success",
      writtenFiles: ["terms/27s1/assignments/lab03/assignment.yml"],
      diagnostics: []
    });
    const cardWithLab03 = {
      ...COURSE_TERM_CARD,
      assignmentCount: 2,
      recentAssignments: [
        ...COURSE_TERM_CARD.recentAssignments,
        {
          slug: "lab03",
          title: "Lab 03",
          status: "active",
          assignmentFile: "terms/27s1/assignments/lab03/assignment.yml",
          needsAttention: false,
          diagnostics: []
        }
      ]
    };
    const getAssignmentDetail = vi.fn().mockResolvedValue(
      createAssignmentDetailResult(
        { assignmentFile: "terms/27s1/assignments/lab03/assignment.yml" },
        createAssignmentDetailJson({
          assignment: {
            slug: "lab03",
            title: "Lab 03",
            type: "individual",
            status: "active",
            file: "terms/27s1/assignments/lab03/assignment.yml"
          }
        })
      )
    );

    mockGraiderUI({
      loadAssignmentSetupTerms,
      previewAssignmentSetup,
      saveAssignmentSetup,
      refreshCourseFolder: vi.fn().mockResolvedValue(createDashboardResult({}, [cardWithLab03])),
      getAssignmentDetail
    });
    renderAtRoute("/");

    fireEvent.click(
      await screen.findByRole("button", {
        name: `Create a new assignment in ${COURSE_FOLDER.path}`
      })
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Assignment Setup" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Assignment title"), { target: { value: "Lab 03" } });
    fireEvent.change(screen.getByLabelText("Assignment slug"), { target: { value: "lab03" } });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.click(screen.getByLabelText("Section 002"));
    fireEvent.change(screen.getByLabelText("GitHub template repository"), {
      target: { value: "graider-sandbox/lab03-template" }
    });
    fireEvent.change(screen.getByLabelText("Due date and time"), {
      target: { value: "2027-06-15T23:59" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));

    const confirmation = await screen.findByRole("dialog", { name: "Create assignment?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Create assignment" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 03" })).toBeInTheDocument();
    expect(getAssignmentDetail).toHaveBeenCalledWith({
      courseFolderId: COURSE_FOLDER.id,
      courseFolderPath: COURSE_FOLDER.path,
      assignmentFile: "terms/27s1/assignments/lab03/assignment.yml"
    });
  });

  it("shows safe assignment detail command errors", async () => {
    mockGraiderUI({
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
    renderAtRoute("/");

    await openAssignmentDetail();

    expect((await screen.findAllByText(/Graider CLI not found/u)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
  });
});

describe("App routing — each route, and unresolvable slugs", () => {
  it("renders the dashboard at /", async () => {
    mockGraiderUI({});
    renderAtRoute("/");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Your Courses" })
    ).toBeInTheDocument();
  });

  it("renders roster manager at the roster route", async () => {
    mockGraiderUI({});
    renderAtRoute("/course/csc1120/27s1/roster");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Manage rosters" })
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "Dashboard" + "CSC1120 · Spring 2027" + "Roster"
    );
  });

  it("renders assignment detail at the assignment route", async () => {
    mockGraiderUI({});
    renderAtRoute(`/course/csc1120/27s1/lab02`);

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
  });

  it("renders apply preview at the apply route", async () => {
    mockGraiderUI({});
    renderAtRoute(`/course/csc1120/27s1/lab02/apply`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Apply Preview" })
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "Dashboard" + "CSC1120 · Spring 2027" + "Lab 02" + "Apply"
    );
  });

  it("renders grade dispatch preview at the grade-preview route", async () => {
    mockGraiderUI({});
    renderAtRoute(`/course/csc1120/27s1/lab02/grade-preview`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Dispatch Preview" })
    ).toBeInTheDocument();
  });

  it("renders grade status at the status route", async () => {
    mockGraiderUI({});
    renderAtRoute(`/course/csc1120/27s1/lab02/status`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Status" })
    ).toBeInTheDocument();
  });

  it("renders faculty report at the report route", async () => {
    mockGraiderUI({});
    renderAtRoute(`/course/csc1120/27s1/lab02/report`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Faculty Report" })
    ).toBeInTheDocument();
  });

  it("renders assignment edit at the edit route", async () => {
    mockGraiderUI({});
    renderAtRoute(`/course/csc1120/27s1/lab02/edit`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit Assignment" })
    ).toBeInTheDocument();
  });

  it("redirects the grade route to grade-preview when the grading workspace is unavailable", async () => {
    mockGraiderUI({});
    renderAtRoute(`/course/csc1120/27s1/lab02/grade`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Dispatch Preview" })
    ).toBeInTheDocument();
  });

  it("renders the grading workspace at the grade route when available", async () => {
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

    expect(await screen.findByText("Lab 02")).toBeInTheDocument();
  });

  it("navigates dashboard to assignment detail to the grading workspace and back", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi
        .fn()
        .mockResolvedValue(
          createAssignmentDetailResult(
            {},
            createAssignmentDetailJson({ applyState: { status: "applied" } })
          )
        ),
      prepareGradingWorkspace: vi.fn().mockResolvedValue({
        status: "success",
        assignment: { title: "Lab 02", termCode: "27s1", slug: "lab02" },
        requiredFiles: [],
        rubric: [],
        students: []
      })
    });
    renderAtRoute("/");

    await openAssignmentDetail();
    fireEvent.click(screen.getByRole("button", { name: "Continue grading" }));

    await waitFor(() => {
      expect(screen.getAllByText("Lab 02").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Grade");

    fireEvent.click(screen.getByRole("link", { name: "Lab 02" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
  });

  it("shows RouteNotFound for an unresolvable assignment slug, and its action returns to the dashboard", async () => {
    mockGraiderUI({});
    renderAtRoute("/course/csc1120/27s1/does-not-exist");

    expect(
      await screen.findByRole("heading", { name: "This page could not be found." })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This assignment could not be found. It may have been deleted or renamed.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Return to dashboard" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "27s1-csc1120" })
    ).toBeInTheDocument();
  });

  it("shows RouteNotFound for an unresolvable course/term", async () => {
    mockGraiderUI({});
    renderAtRoute("/course/does-not-exist/00x0/roster");

    expect(
      await screen.findByRole("heading", { name: "This page could not be found." })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This course and term could not be found. It may have been removed.")
    ).toBeInTheDocument();
  });

  it("shows RouteNotFound for an unmatched path", async () => {
    mockGraiderUI({});
    renderAtRoute("/nothing/here");

    expect(
      await screen.findByRole("heading", { name: "This page could not be found." })
    ).toBeInTheDocument();
    expect(screen.getByText("There is no page at this address.")).toBeInTheDocument();
  });
});
