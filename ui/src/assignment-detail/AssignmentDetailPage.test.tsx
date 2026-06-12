import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentDetailJsonResponse,
  AssignmentDetailResult,
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

const mockGraiderUI = (api: Partial<GraiderUIApi>): GraiderUIApi => {
  const graiderUI = {
    getAppInfo: vi.fn().mockResolvedValue({ name: "Graider", version: "0.1.0" }),
    selectCourseFolder: vi.fn().mockResolvedValue({ canceled: true, courseFolder: null }),
    listCourseFolders: vi.fn().mockResolvedValue([]),
    removeCourseFolder: vi.fn().mockResolvedValue(undefined),
    refreshCourseFolder: vi.fn(),
    refreshDashboard: vi.fn(),
    getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
    getAssignmentApplyPreview: vi.fn(),
    getAssignmentGradePreview: vi.fn(),
    getAssignmentGradeStatus: vi.fn(),
    getFacultyReport: vi.fn(),
    applyAssignment: vi.fn(),
    gradeAssignment: vi.fn(),
    ...api
  };

  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: graiderUI
  });

  return graiderUI;
};

const mockClipboard = (writeText: ReturnType<typeof vi.fn>): void => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText
    }
  });
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
      onViewGradeStatus={vi.fn()}
      {...props}
    />
  );

const getFirstPreviewApplyButton = (): HTMLElement => {
  const button = screen.getAllByRole("button", { name: "Preview apply" })[0];

  if (button === undefined) {
    throw new Error("Expected a Preview apply button.");
  }

  return button;
};

describe("AssignmentDetailPage", () => {
  it("renders readiness, cleaned panels, grouped diagnostics, and disabled actions", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          createAssignmentDetailJson({
            diagnostics: [
              {
                code: "assignment_detail_template_repository_missing",
                severity: "error",
                message: "Template repository missing.",
                context: { repository: "owner/missing-template" }
              },
              {
                code: "github_token_required",
                severity: "warning",
                message: "GitHub token required."
              }
            ],
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

    expect(await screen.findByRole("heading", { level: 2, name: "Readiness" })).toBeInTheDocument();
    expect(screen.getAllByText("Needs attention").length).toBeGreaterThan(0);
    expect(screen.getByText("Template repository is missing.")).toBeInTheDocument();
    expect(
      screen.getByText("GitHub authentication needed for readiness checks.")
    ).toBeInTheDocument();
    expect(screen.getByText("LMS assignment ID")).toBeInTheDocument();
    expect(screen.getByText("lms-123")).toBeInTheDocument();
    expect(screen.getByText("Course folder path")).toBeInTheDocument();
    expect(screen.getByText(COURSE_FOLDER_PATH)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Warnings" })).toBeInTheDocument();
    expect(screen.getByText("assignment_detail_template_repository_missing")).toBeInTheDocument();
    expect(screen.getAllByText("Template").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Validate / Refresh detail" })).toBeEnabled();
    expect(getFirstPreviewApplyButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Grade submissions" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generate report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish student reports" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate/update workflow" })).toBeDisabled();
    expect(screen.getAllByText("Coming in a future slice").length).toBeGreaterThan(0);
    expect(screen.getByText("Unavailable for this assignment")).toBeInTheDocument();
  });

  it("renders neutral placeholders, no-grading state, disabled reports, and missing roster", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          createAssignmentDetailJson({
            metadata: {
              facultyOwner: null,
              lmsAssignmentId: null,
              gradingCategory: null,
              points: null
            },
            deadline: { dueAt: null, latePolicy: null },
            roster: null,
            grading: {
              enabled: false,
              mode: "no-grading",
              workflow: null,
              artifact: null,
              resultFile: null,
              workflowStatus: "not_required",
              workflowDispatch: "not_required"
            },
            studentReports: { enabled: false, mode: "disabled" }
          })
        )
      )
    });

    renderAssignmentDetailPage();

    expect(await screen.findByText("No grading configured.")).toBeInTheDocument();
    expect(screen.getByText("Roster summary unavailable.")).toBeInTheDocument();
    expect(screen.getByText("Roster counts could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("No diagnostics.")).toBeInTheDocument();
  });

  it("copies assignment path, course folder path, template repository, and workflow path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    mockClipboard(writeText);
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });

    renderAssignmentDetailPage();

    await screen.findByRole("button", { name: "Copy assignment path" });

    fireEvent.click(screen.getByRole("button", { name: "Copy assignment path" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(ASSIGNMENT_FILE);
    });
    expect(await screen.findByText("Copied")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy course folder path" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(COURSE_FOLDER_PATH);
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy template repository" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("graider-sandbox/csc1120L2Template");
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy workflow path" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(".github/workflows/grade.yml");
    });
  });

  it("calls the grade preview entry point with current assignment detail", async () => {
    const onPreviewGrade = vi.fn();

    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });
    renderAssignmentDetailPage({ onPreviewGrade });

    fireEvent.click(await screen.findByRole("button", { name: "Preview grading" }));

    expect(onPreviewGrade).toHaveBeenCalledTimes(1);
    expect(onPreviewGrade).toHaveBeenCalledWith(
      SELECTION,
      expect.objectContaining({
        assignment: expect.objectContaining({ slug: "lab02" })
      }),
      expect.objectContaining({
        assignmentFile: ASSIGNMENT_FILE
      })
    );
  });

  it("calls the grade status entry point with current assignment detail", async () => {
    const onViewGradeStatus = vi.fn();

    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });
    renderAssignmentDetailPage({ onViewGradeStatus });

    fireEvent.click(await screen.findByRole("button", { name: "View grading status" }));

    expect(onViewGradeStatus).toHaveBeenCalledTimes(1);
    expect(onViewGradeStatus).toHaveBeenCalledWith(
      SELECTION,
      expect.objectContaining({
        assignment: expect.objectContaining({ slug: "lab02" })
      }),
      expect.objectContaining({
        assignmentFile: ASSIGNMENT_FILE
      })
    );
  });

  it("shows copy failure feedback without storing copied values", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));

    mockClipboard(writeText);
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });

    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Copy assignment path" }));

    expect(await screen.findByText("Unable to copy.")).toBeInTheDocument();
  });

  it("keeps prior detail visible and disables refresh while loading", async () => {
    let resolveRefresh: (value: AssignmentDetailResult) => void = () => undefined;
    const getAssignmentDetail = vi
      .fn()
      .mockResolvedValueOnce(createAssignmentDetailResult())
      .mockImplementationOnce(
        async () =>
          await new Promise<AssignmentDetailResult>((resolve) => {
            resolveRefresh = resolve;
          })
      );

    mockGraiderUI({ getAssignmentDetail });
    renderAssignmentDetailPage();

    expect(await screen.findByText("100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh detail" }));

    expect(await screen.findByText("Loading assignment detail...")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refreshing detail..." })).toBeDisabled();

    resolveRefresh(
      createAssignmentDetailResult(
        createAssignmentDetailJson({
          metadata: {
            facultyOwner: "professor",
            lmsAssignmentId: "lms-123",
            gradingCategory: "labs",
            points: 90
          }
        })
      )
    );

    expect(await screen.findByText("90")).toBeInTheDocument();
    expect(getAssignmentDetail).toHaveBeenCalledTimes(2);
  });

  it("renders safe command errors without raw snippets", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(null, {
          status: "failure",
          error: {
            code: "invalid_assignment_detail_json",
            message: "Unexpected token secret-token-value",
            exitCode: 0,
            stdoutSnippet: "Authorization: Bearer secret-token-value",
            stderrSnippet: null
          }
        })
      )
    });

    renderAssignmentDetailPage();

    expect(
      await screen.findByText("Graider returned invalid assignment detail JSON.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
  });
});
