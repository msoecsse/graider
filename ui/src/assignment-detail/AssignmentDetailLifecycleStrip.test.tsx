import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentDetailJsonResponse,
  AssignmentDetailResult,
  AssignmentGradingLifecycleResult,
  GraiderUIApi
} from "../../electron/ipc";
import { AssignmentDetailPage } from "./AssignmentDetailPage";
import type { AssignmentDetailSelection } from "./assignmentDetailTypes";

const COURSE_FOLDER_PATH = "/Users/sean/dev/csc1120";
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab02/assignment.yml";

const SELECTION: AssignmentDetailSelection = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: COURSE_FOLDER_PATH,
  assignmentFile: ASSIGNMENT_FILE,
  assignmentTitle: "Lab 02",
  assignmentSlug: "lab02",
  assignmentStatus: "active",
  courseTitle: "CSC1120",
  courseSlug: "csc1120",
  termTitle: "Spring 2027",
  termSlug: "27s1"
};

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
    lmsAssignmentId: "lms-123",
    gradingCategory: "labs",
    points: 100
  },
  deadline: { dueAt: "2027-06-15T23:59:00+09:00", latePolicy: "standard" },
  sections: ["001", "002"],
  roster: { sectionCount: 2, activeStudentCount: 24, totalStudentCount: 24 },
  template: {
    repository: "graider-sandbox/csc1120L2Template",
    branch: "main",
    status: "available",
    repositoryStatus: "available",
    branchStatus: "available"
  },
  grading: {
    enabled: true,
    mode: "preset",
    workflow: ".github/workflows/grade.yml",
    artifact: "grading-results",
    resultFile: "grading-results.json",
    workflowStatus: "available",
    workflowDispatch: "available"
  },
  studentReports: { enabled: false, mode: "disabled" },
  applyState: { status: "applied" },
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
  detail: AssignmentDetailJsonResponse | null = createAssignmentDetailJson(),
  overrides: Partial<AssignmentDetailResult> = {}
): AssignmentDetailResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: detail === null ? "failure" : "success",
  detail,
  error: null,
  refreshedAt: "2026-06-10T13:00:00.000Z",
  ...overrides
});

const createLifecycleResult = (
  overrides: Partial<Extract<AssignmentGradingLifecycleResult, { status: "success" }>> = {}
): AssignmentGradingLifecycleResult => ({
  status: "success",
  // The strip only reads the counts below; the per-student rows exist for
  // PR6b's student table and are irrelevant to every assertion in this file.
  students: [],
  totalStudentCount: 24,
  gradingDoneCount: 0,
  publishedCount: 0,
  unknownStatusCount: 0,
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
    listCourseFolders: vi.fn().mockResolvedValue([]),
    removeCourseFolder: vi.fn().mockResolvedValue(undefined),
    refreshCourseFolder: vi.fn(),
    refreshDashboard: vi.fn(),
    getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
    prepareAssignmentTemplateSync: vi.fn().mockResolvedValue({
      available: false,
      repositoryCount: 0,
      templateRepository: null,
      recordedTemplateRevision: null
    }),
    executeAssignmentTemplateSync: vi.fn(),
    onAssignmentTemplateSyncProgress: vi.fn(() => () => undefined),
    getAssignmentGroupConfig: vi.fn().mockResolvedValue({
      status: "ready",
      repositoryMode: "individual",
      groupsFile: "groups.csv",
      groupsCsv: "group_id,student_id\n",
      groupCount: 0,
      groupedStudentCount: 0,
      ungroupedActiveStudentCount: 24,
      diagnostics: []
    }),
    getAssignmentApplyPreview: vi.fn(),
    getAssignmentGradePreview: vi.fn(),
    getAssignmentGradeStatus: vi.fn().mockResolvedValue({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile,
      status: "success",
      gradeStatus: null,
      error: null,
      refreshedAt: "2026-06-10T16:00:00.000Z"
    }),
    getAssignmentGradingLifecycle: vi.fn().mockResolvedValue(createLifecycleResult()),
    getFacultyReport: vi.fn(),
    applyAssignment: vi.fn(),
    gradeAssignment: vi.fn(),
    ...api
  };

  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: graiderUI
  });

  return graiderUI as unknown as GraiderUIApi;
};

const renderAssignmentDetailPage = (
  props: Partial<ComponentProps<typeof AssignmentDetailPage>> = {}
) =>
  render(
    <AssignmentDetailPage
      selection={SELECTION}
      onBack={vi.fn()}
      onPreviewApply={vi.fn()}
      onPreviewGrade={vi.fn()}
      onViewFacultyReport={vi.fn()}
      onViewGradeStatus={vi.fn()}
      {...props}
    />
  );

const lifecycleStrip = (): HTMLElement => document.querySelector(".lifecycle-strip") as HTMLElement;

const stepState = (label: string): string | null => {
  const item = within(lifecycleStrip()).getByText(label).closest("li");
  const stateClass = [...(item?.classList ?? [])].find((name) =>
    name.startsWith("lifecycle-strip__step--")
  );
  return stateClass?.replace("lifecycle-strip__step--", "") ?? null;
};

describe("AssignmentDetailPage lifecycle strip", () => {
  it("shows Created and Applied as complete, and Grading as current, before any grading is done", async () => {
    mockGraiderUI({
      getAssignmentGradingLifecycle: vi.fn().mockResolvedValue(createLifecycleResult())
    });
    renderAssignmentDetailPage();

    await screen.findByText("24 repositories");
    expect(stepState("Created")).toBe("complete");
    expect(stepState("Applied")).toBe("complete");
    expect(stepState("Grading")).toBe("current");
    expect(stepState("Published")).toBe("upcoming");
    expect(screen.getByText("0 of 24 done")).toBeInTheDocument();
    expect(screen.getByText("0 of 24 sent")).toBeInTheDocument();
  });

  it("marks Applied as current, and Grading/Published as upcoming, before the assignment is applied", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi
        .fn()
        .mockResolvedValue(
          createAssignmentDetailResult(
            createAssignmentDetailJson({ applyState: { status: "not_applied" } })
          )
        )
    });
    renderAssignmentDetailPage();

    await screen.findByText("24 repositories");
    expect(stepState("Created")).toBe("complete");
    expect(stepState("Applied")).toBe("current");
    expect(stepState("Grading")).toBe("upcoming");
    expect(stepState("Published")).toBe("upcoming");
  });

  it("shows Published as upcoming while Grading is still in progress, even with some already published", async () => {
    mockGraiderUI({
      getAssignmentGradingLifecycle: vi
        .fn()
        .mockResolvedValue(createLifecycleResult({ gradingDoneCount: 18, publishedCount: 5 }))
    });
    renderAssignmentDetailPage();

    expect(await screen.findByText("18 of 24 done")).toBeInTheDocument();
    expect(screen.getByText("5 of 24 sent")).toBeInTheDocument();
    expect(stepState("Grading")).toBe("current");
    expect(stepState("Published")).toBe("upcoming");
  });

  it("shows Published as current once Grading is fully done but publishing is only partial", async () => {
    mockGraiderUI({
      getAssignmentGradingLifecycle: vi
        .fn()
        .mockResolvedValue(createLifecycleResult({ gradingDoneCount: 24, publishedCount: 5 }))
    });
    renderAssignmentDetailPage();

    await screen.findByText("24 of 24 done");
    expect(stepState("Grading")).toBe("complete");
    expect(stepState("Published")).toBe("current");
  });

  it("marks Grading and Published complete once every active student is graded and published", async () => {
    mockGraiderUI({
      getAssignmentGradingLifecycle: vi
        .fn()
        .mockResolvedValue(createLifecycleResult({ gradingDoneCount: 24, publishedCount: 24 }))
    });
    renderAssignmentDetailPage();

    await screen.findByText("24 of 24 done");
    expect(stepState("Grading")).toBe("complete");
    expect(stepState("Published")).toBe("complete");
  });

  it("shows how many students have an unknown grading status, and still renders", async () => {
    mockGraiderUI({
      getAssignmentGradingLifecycle: vi
        .fn()
        .mockResolvedValue(createLifecycleResult({ gradingDoneCount: 20, unknownStatusCount: 2 }))
    });
    renderAssignmentDetailPage();

    expect(await screen.findByText("20 of 24 done · 2 unknown")).toBeInTheDocument();
    // The rest of the page is unaffected by one assignment's unreadable files.
    expect(await screen.findByRole("button", { name: "Continue grading" })).toBeInTheDocument();
  });

  it("still renders the strip when the grading lifecycle summary is unavailable", async () => {
    mockGraiderUI({});
    delete (window.graiderUI as { getAssignmentGradingLifecycle?: unknown })
      .getAssignmentGradingLifecycle;
    renderAssignmentDetailPage();

    await screen.findByText("24 repositories");
    expect(screen.getByText("0 of 24 done")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Continue grading" })).toBeInTheDocument();
  });

  it("shows the blocked step in the same style, with the same fix label, as the primary action", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          createAssignmentDetailJson({
            applyState: { status: "not_applied" },
            template: {
              repository: "owner/missing-template",
              branch: "main",
              status: "missing",
              repositoryStatus: "missing",
              branchStatus: "available"
            }
          })
        )
      )
    });
    renderAssignmentDetailPage();

    await screen.findByRole("button", { name: "Fix template repository" });
    expect(stepState("Applied")).toBe("blocked");
    expect(within(lifecycleStrip()).getByText("Fix template repository").closest("li")).toHaveClass(
      "lifecycle-strip__step--blocked"
    );
  });

  it("requests the assignment-wide summary by assignment identity, not a faculty-scoped one", async () => {
    const getAssignmentGradingLifecycle = vi.fn().mockResolvedValue(createLifecycleResult());
    mockGraiderUI({ getAssignmentGradingLifecycle });
    renderAssignmentDetailPage();

    await screen.findByText("24 repositories");
    expect(getAssignmentGradingLifecycle).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      termCode: SELECTION.termSlug,
      assignmentSlug: SELECTION.assignmentSlug
    });
  });

  it("is placed below the header and above the main content", async () => {
    mockGraiderUI({});
    renderAssignmentDetailPage();

    await screen.findByText("24 repositories");
    const strip = document.querySelector(".lifecycle-strip");
    const mainContent = document.querySelector(".assignment-detail");
    expect(strip).not.toBeNull();
    expect(mainContent).not.toBeNull();
    expect(
      strip?.compareDocumentPosition(mainContent as Node) === Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(true);
  });
});
