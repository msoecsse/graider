import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AssignmentGradeStatusJsonResponse,
  AssignmentGradeStatusResult,
  GraiderUIApi
} from "../../electron/ipc";
import {
  GradeStatusPage,
  AUTO_REFRESH_INTERVAL_MS,
  AUTO_REFRESH_MAX_DURATION_MS
} from "./GradeStatusPage";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";

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

const createGradeStatusJson = (
  rows: readonly unknown[] = [
    {
      studentId: "s001",
      githubUsername: "ada",
      section: "001",
      repository: "graider-sandbox/csc1120-lab02-ada",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: 123,
      runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123",
      status: "queued",
      conclusion: "unknown",
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: null,
      selectionStrategy: "latest_configured_workflow_run",
      reason: "queued",
      needsAttention: false,
      diagnostics: []
    },
    {
      studentId: "s002",
      githubUsername: "grace",
      section: "001",
      repository: "graider-sandbox/csc1120-lab02-grace",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: 456,
      runUrl: "https://github.com/graider-sandbox/csc1120-lab02-grace/actions/runs/456",
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
    file: SELECTION.assignmentFile,
    status: "active"
  },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: {
    sections: ["001"],
    sectionCount: 1,
    studentCount: rows.length,
    activeStudentCount: rows.length
  },
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
    totalRepositories: rows.length,
    queued: rows.filter((row) => (row as { status?: string }).status === "queued").length,
    inProgress: rows.filter((row) => (row as { status?: string }).status === "in_progress").length,
    completed: rows.filter((row) => (row as { status?: string }).status === "completed").length,
    successful: rows.filter((row) => (row as { conclusion?: string }).conclusion === "success")
      .length,
    failed: rows.filter((row) => (row as { conclusion?: string }).conclusion === "failure").length,
    cancelled: 0,
    timedOut: 0,
    missing: 0,
    unknown: rows.filter((row) => (row as { status?: string }).status === "unknown").length,
    blocked: 0,
    needsAttention: rows.filter(
      (row) => (row as { needsAttention?: boolean }).needsAttention === true
    ).length,
    readyForReport:
      rows.length > 0 && rows.every((row) => (row as { status?: string }).status === "completed")
  },
  repositories: rows,
  actions: {},
  ...overrides
});

const createGradeStatusResult = (
  gradeStatus: AssignmentGradeStatusJsonResponse | null = createGradeStatusJson(),
  overrides: Partial<AssignmentGradeStatusResult> = {}
): AssignmentGradeStatusResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: gradeStatus === null ? "failure" : "success",
  gradeStatus,
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
    getAssignmentGradeStatus: vi.fn().mockResolvedValue(createGradeStatusResult()),
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

const renderGradeStatusPage = (onBack = vi.fn(), onViewFacultyReport = vi.fn()) =>
  render(
    <GradeStatusPage
      selection={SELECTION}
      assignmentDetail={null}
      onBack={onBack}
      onViewFacultyReport={onViewFacultyReport}
    />
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("GradeStatusPage", () => {
  it("auto-loads full grade status and renders summary, rows, run links, and disabled report action", async () => {
    const getAssignmentGradeStatus = vi.fn().mockResolvedValue(createGradeStatusResult());
    const graiderUI = mockGraiderUI({ getAssignmentGradeStatus });

    renderGradeStatusPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Status" })
    ).toBeInTheDocument();
    expect(getAssignmentGradeStatus).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
    expect(screen.getByText("Total repositories")).toBeInTheDocument();
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
    expect(screen.getByText("Completed — success")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run 123" })).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123"
    );
    expect(screen.getByRole("button", { name: "View faculty report" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Publish student reports — deferred" })
    ).toBeDisabled();
    expect(graiderUI.gradeAssignment).not.toHaveBeenCalled();
  });

  it("opens faculty report from the latest loaded status", async () => {
    const onViewFacultyReport = vi.fn();

    mockGraiderUI({});
    renderGradeStatusPage(vi.fn(), onViewFacultyReport);

    fireEvent.click(await screen.findByRole("button", { name: "View faculty report" }));

    expect(onViewFacultyReport).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        assignment: expect.objectContaining({ slug: "lab02" })
      })
    );
  });

  it("manual refresh runs full grade status and keeps prior rows visible while refreshing", async () => {
    let resolveRefresh: (value: AssignmentGradeStatusResult) => void = () => {};
    const refreshPromise = new Promise<AssignmentGradeStatusResult>((resolve) => {
      resolveRefresh = resolve;
    });
    const getAssignmentGradeStatus = vi
      .fn()
      .mockResolvedValueOnce(createGradeStatusResult())
      .mockReturnValueOnce(refreshPromise);

    mockGraiderUI({ getAssignmentGradeStatus });
    renderGradeStatusPage();

    expect(await screen.findByText("Completed — success")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));

    expect(screen.getByText("Completed — success")).toBeInTheDocument();
    expect(
      screen.getByText("Refreshing status while keeping the current snapshot.")
    ).toBeInTheDocument();

    resolveRefresh(createGradeStatusResult(createGradeStatusJson([], { repositories: [] })));

    await waitFor(() => {
      expect(getAssignmentGradeStatus).toHaveBeenCalledTimes(2);
    });
    expect(getAssignmentGradeStatus).toHaveBeenNthCalledWith(2, {
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
  });

  it("renders faculty-facing labels for cancelled and timed-out completed runs", async () => {
    const cancelledRow = {
      studentId: "s001",
      githubUsername: "ada",
      section: "001",
      repository: "graider-sandbox/csc1120-lab02-ada",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: 123,
      runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123",
      status: "completed",
      conclusion: "cancelled",
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:05:00.000Z",
      selectionStrategy: "latest_configured_workflow_run",
      reason: "cancelled",
      needsAttention: true,
      diagnostics: []
    };
    const timedOutRow = {
      studentId: "s002",
      githubUsername: "grace",
      section: "001",
      repository: "graider-sandbox/csc1120-lab02-grace",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: 456,
      runUrl: "https://github.com/graider-sandbox/csc1120-lab02-grace/actions/runs/456",
      status: "completed",
      conclusion: "timed_out",
      startedAt: "2026-06-10T12:00:00.000Z",
      completedAt: "2026-06-10T12:10:00.000Z",
      selectionStrategy: "latest_configured_workflow_run",
      reason: "timed_out",
      needsAttention: true,
      diagnostics: []
    };
    const getAssignmentGradeStatus = vi
      .fn()
      .mockResolvedValue(
        createGradeStatusResult(createGradeStatusJson([cancelledRow, timedOutRow]))
      );

    mockGraiderUI({ getAssignmentGradeStatus });
    renderGradeStatusPage();

    expect((await screen.findAllByText("Cancelled")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Timed out").length).toBeGreaterThan(0);
  });

  it("auto-refreshes only unfinished rows and merges returned rows", async () => {
    vi.useFakeTimers();
    const finishedS001 = {
      ...(createGradeStatusJson().repositories[0] as Record<string, unknown>),
      status: "completed",
      conclusion: "success",
      completedAt: "2026-06-10T12:15:00.000Z"
    };
    const getAssignmentGradeStatus = vi
      .fn()
      .mockResolvedValueOnce(createGradeStatusResult())
      .mockResolvedValueOnce(createGradeStatusResult(createGradeStatusJson([finishedS001])));

    mockGraiderUI({ getAssignmentGradeStatus });
    renderGradeStatusPage();

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByText("Auto-refreshing every 15 seconds while grading is running.")
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getAssignmentGradeStatus).toHaveBeenCalledTimes(2);
    expect(getAssignmentGradeStatus).toHaveBeenNthCalledWith(2, {
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile,
      studentIds: ["s001"]
    });
    expect(screen.getAllByText("Completed — success")).toHaveLength(2);
    expect(screen.getAllByText("Ready for report generation.").length).toBeGreaterThan(0);
  });

  it("stops auto-refresh after the max duration", async () => {
    vi.useFakeTimers();
    const getAssignmentGradeStatus = vi.fn().mockResolvedValue(createGradeStatusResult());

    mockGraiderUI({ getAssignmentGradeStatus });
    renderGradeStatusPage();

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByText("Auto-refreshing every 15 seconds while grading is running.")
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_REFRESH_MAX_DURATION_MS + AUTO_REFRESH_INTERVAL_MS);
    });

    expect(
      screen.getByText("Auto-refresh stopped. Use Refresh status to check again.")
    ).toBeInTheDocument();
  });

  it("stops auto-refresh when leaving the page", async () => {
    vi.useFakeTimers();
    const getAssignmentGradeStatus = vi.fn().mockResolvedValue(createGradeStatusResult());

    mockGraiderUI({ getAssignmentGradeStatus });
    const view = renderGradeStatusPage();

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByText("Auto-refreshing every 15 seconds while grading is running.")
    ).toBeInTheDocument();

    view.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS * 2);
    });

    expect(getAssignmentGradeStatus).toHaveBeenCalledTimes(1);
  });

  it("renders token guidance and partial rows safely", async () => {
    const getAssignmentGradeStatus = vi.fn().mockResolvedValue(
      createGradeStatusResult(
        createGradeStatusJson(
          [
            {
              studentId: "s001",
              githubUsername: "ada",
              section: "001",
              repository: "graider-sandbox/csc1120-lab02-ada",
              workflow: ".github/workflows/grade.yml",
              ref: "main",
              runId: null,
              runUrl: null,
              status: "token_required",
              conclusion: "unknown",
              startedAt: null,
              completedAt: null,
              selectionStrategy: "no_configured_workflow_run",
              reason: "token_required",
              needsAttention: true,
              diagnostics: []
            }
          ],
          {
            status: "partial_success",
            diagnostics: [
              {
                code: "github_token_required",
                severity: "error",
                message: "GitHub token required to check grading status."
              }
            ]
          }
        )
      )
    );

    mockGraiderUI({ getAssignmentGradeStatus });
    renderGradeStatusPage();

    expect(await screen.findByText("Token required")).toBeInTheDocument();
    expect(
      screen.getAllByText("GitHub token required to check grading status.").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Sign in with GitHub CLI using gh auth login, then refresh.")
    ).toBeInTheDocument();
  });

  it("renders invalid JSON and CLI missing errors safely", async () => {
    const getAssignmentGradeStatus = vi.fn().mockResolvedValue(
      createGradeStatusResult(null, {
        error: {
          code: "invalid_assignment_grade_status_json",
          message: "invalid json",
          exitCode: 0,
          stdoutSnippet: "not json",
          stderrSnippet: null
        }
      })
    );

    mockGraiderUI({ getAssignmentGradeStatus });
    renderGradeStatusPage();

    expect(
      await screen.findByText("Graider returned invalid grade status JSON.")
    ).toBeInTheDocument();
  });
});
