import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  FacultyReportJsonResponse,
  FacultyReportResult,
  GraiderUIApi
} from "../../electron/ipc";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import { FacultyReportPage } from "./FacultyReportPage";

const SELECTION: AssignmentDetailSelection = {
  courseFolderId: "course-folder-csc1120",
  courseFolderPath: "/Users/sean/dev/csc1120",
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  assignmentTitle: "Lab 02",
  assignmentSlug: "lab02",
  assignmentStatus: "active",
  courseTitle: "CSC1120",
  courseSlug: "csc1120",
  termTitle: "Spring 2027",
  termSlug: "27s1"
};

const createFacultyReportJson = (
  overrides: Partial<FacultyReportJsonResponse> = {}
): FacultyReportJsonResponse => ({
  schemaVersion: 1,
  commandName: "report",
  assignmentFile: SELECTION.assignmentFile,
  status: "success",
  exitCode: 0,
  diagnostics: [],
  warnings: [],
  errors: [],
  generatedFiles: [
    "terms/27s1/reports/lab02/faculty-summary.json",
    "terms/27s1/reports/lab02/faculty-summary.md"
  ],
  summary: {
    assignmentSlug: "lab02",
    courseCode: "csc1120",
    termCode: "27s1",
    studentCount: 2,
    activeStudentCount: 2,
    passedCount: 1,
    failedCount: 1,
    errorCount: 0,
    skippedCount: 0,
    notConfiguredCount: 0,
    missingArtifactCount: 0,
    invalidResultFileCount: 0,
    warningCount: 0,
    errorCountTotal: 0,
    reportFileCount: 5,
    studentsReported: 2
  },
  report: {
    assignment: {
      course_code: "csc1120",
      term_code: "27s1",
      assignment_slug: "lab02",
      assignment_title: "Lab 02"
    },
    students: [
      {
        student_id: "s001",
        github_username: "ada",
        section: "001",
        repository_name: "csc1120-lab02-ada",
        repository_status: "available",
        grading: {
          workflow_status: "completed",
          artifact_status: "found",
          result_file_status: "valid",
          result_status: "passed",
          score: 10,
          max_score: 10,
          checks: [{ name: "Unit tests", status: "passed" }]
        },
        warnings: [],
        errors: []
      },
      {
        student_id: "s002",
        github_username: "grace",
        section: "001",
        repository_name: "csc1120-lab02-grace",
        repository_status: "available",
        grading: {
          workflow_status: "completed",
          artifact_status: "found",
          result_file_status: "valid",
          result_status: "failed",
          score: 4,
          max_score: 10,
          checks: [{ name: "Style", status: "failed" }]
        },
        warnings: [],
        errors: []
      }
    ]
  },
  ...overrides
});

const createFacultyReportResult = (
  report: FacultyReportJsonResponse | null = createFacultyReportJson(),
  overrides: Partial<FacultyReportResult> = {}
): FacultyReportResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: report === null ? "failure" : "success",
  report,
  error: null,
  refreshedAt: "2026-06-10T12:10:00.000Z",
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
    getAssignmentDetail: vi.fn(),
    getAssignmentApplyPreview: vi.fn(),
    getAssignmentGradePreview: vi.fn(),
    getAssignmentGradeStatus: vi.fn(),
    getFacultyReport: vi.fn().mockResolvedValue(createFacultyReportResult()),
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

const renderFacultyReportPage = (
  callbacks: {
    readonly onBackToGradeStatus?: () => void;
    readonly onBackToAssignmentDetail?: () => void;
  } = {}
) =>
  render(
    <FacultyReportPage
      selection={SELECTION}
      assignmentDetail={null}
      gradeStatus={null}
      onBackToGradeStatus={callbacks.onBackToGradeStatus ?? vi.fn()}
      onBackToAssignmentDetail={callbacks.onBackToAssignmentDetail ?? vi.fn()}
    />
  );

describe("FacultyReportPage", () => {
  it("auto-loads report JSON and renders summary, rows, generated files, and disabled publishing", async () => {
    const getFacultyReport = vi.fn().mockResolvedValue(createFacultyReportResult());
    const graiderUI = mockGraiderUI({ getFacultyReport });

    renderFacultyReportPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Faculty Report" })
    ).toBeInTheDocument();
    expect(getFacultyReport).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
    expect(screen.getByText("Report summary")).toBeInTheDocument();
    expect(screen.getByText("terms/27s1/reports/lab02/faculty-summary.json")).toBeInTheDocument();
    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish student reports — deferred" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export report — deferred" })).toBeDisabled();
    expect(graiderUI.gradeAssignment).not.toHaveBeenCalled();
    expect(graiderUI.applyAssignment).not.toHaveBeenCalled();
    expect(graiderUI.getAssignmentApplyPreview).not.toHaveBeenCalled();
    expect(graiderUI.getAssignmentGradePreview).not.toHaveBeenCalled();
    expect(graiderUI.getAssignmentGradeStatus).not.toHaveBeenCalled();
  });

  it("renders missing result states from valid JSON as normal report data", async () => {
    const missingReport = createFacultyReportJson({
      status: "success",
      summary: {
        studentCount: 1,
        missingArtifactCount: 1,
        invalidResultFileCount: 0,
        errorCountTotal: 1,
        reportFileCount: 3
      },
      report: {
        students: [
          {
            student_id: "s001",
            github_username: "ada",
            section: "001",
            repository_name: "csc1120-lab02-ada",
            repository_status: "available",
            grading: {
              workflow_status: "completed",
              artifact_status: "missing",
              result_file_status: "missing",
              result_status: "missing_result_file",
              checks: []
            },
            warnings: [],
            errors: []
          }
        ]
      }
    });
    mockGraiderUI({
      getFacultyReport: vi.fn().mockResolvedValue(createFacultyReportResult(missingReport))
    });

    renderFacultyReportPage();

    expect(
      await screen.findByText("Report data is not available for all students yet.")
    ).toBeInTheDocument();
    expect(screen.getByText("missing_result_file")).toBeInTheDocument();
  });

  it("renders partial success and diagnostics with available data", async () => {
    const partialReport = createFacultyReportJson({
      status: "partial_success",
      diagnostics: [
        {
          code: "student_result_artifact_missing",
          severity: "warning",
          message: "A student result artifact was missing."
        }
      ]
    });
    mockGraiderUI({
      getFacultyReport: vi.fn().mockResolvedValue(createFacultyReportResult(partialReport))
    });

    renderFacultyReportPage();

    expect(await screen.findByText("A student result artifact was missing.")).toBeInTheDocument();
    expect(screen.getByText("student_result_artifact_missing")).toBeInTheDocument();
    expect(screen.getByText("terms/27s1/reports/lab02/faculty-summary.json")).toBeInTheDocument();
  });

  it("manual refresh reruns report and keeps prior data visible while refreshing", async () => {
    let resolveRefresh: (value: FacultyReportResult) => void = () => {};
    const refreshPromise = new Promise<FacultyReportResult>((resolve) => {
      resolveRefresh = resolve;
    });
    const getFacultyReport = vi
      .fn()
      .mockResolvedValueOnce(createFacultyReportResult())
      .mockReturnValueOnce(refreshPromise);

    mockGraiderUI({ getFacultyReport });
    renderFacultyReportPage();

    expect(await screen.findByText("ada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh report" }));

    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(
      screen.getByText("Refreshing report while keeping the current summary.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refreshing report..." })).toBeDisabled();

    resolveRefresh(createFacultyReportResult());

    await waitFor(() => {
      expect(getFacultyReport).toHaveBeenCalledTimes(2);
    });
  });

  it("renders invalid JSON and CLI missing errors safely", async () => {
    mockGraiderUI({
      getFacultyReport: vi.fn().mockResolvedValue(
        createFacultyReportResult(null, {
          error: {
            code: "invalid_faculty_report_json",
            message: "invalid json",
            exitCode: 0,
            stdoutSnippet: "not json ghp_secret_token",
            stderrSnippet: null
          }
        })
      )
    });

    renderFacultyReportPage();

    expect(
      await screen.findByText("Graider returned invalid faculty report JSON.")
    ).toBeInTheDocument();
    expect(screen.queryByText("ghp_secret_token")).not.toBeInTheDocument();
  });

  it("navigates back to grade status and assignment detail", async () => {
    const onBackToGradeStatus = vi.fn();
    const onBackToAssignmentDetail = vi.fn();

    mockGraiderUI({});
    renderFacultyReportPage({ onBackToGradeStatus, onBackToAssignmentDetail });

    fireEvent.click(await screen.findByRole("button", { name: "Back to grading status" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to assignment detail" }));

    expect(onBackToGradeStatus).toHaveBeenCalledTimes(1);
    expect(onBackToAssignmentDetail).toHaveBeenCalledTimes(1);
  });
});
