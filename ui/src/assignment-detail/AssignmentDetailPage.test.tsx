import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentDetailJsonResponse,
  AssignmentDetailResult,
  AssignmentGradeStatusJsonResponse,
  AssignmentGradeStatusResult,
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
  roster: { sectionCount: 2, activeStudentCount: 3, totalStudentCount: 3 },
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
    file: ASSIGNMENT_FILE,
    status: "active"
  },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001", "002"], sectionCount: 2, studentCount: 4, activeStudentCount: 4 },
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
    totalRepositories: 4,
    queued: 0,
    inProgress: 1,
    completed: 2,
    successful: 1,
    failed: 1,
    cancelled: 0,
    timedOut: 0,
    missing: 1,
    unknown: 0,
    blocked: 0,
    needsAttention: 2,
    readyForReport: false
  },
  repositories: [
    {
      studentUsername: "ada.course",
      studentId: "s001",
      githubUsername: "adalovelace",
      section: "001",
      repository: "graider-sandbox/csc1120-lab02-ada",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: 123,
      runUrl: "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-06-12T17:32:49Z",
      completedAt: "2026-06-12T17:33:39Z",
      selectionStrategy: "latest_configured_workflow_run",
      reason: "success",
      needsAttention: false,
      diagnostics: []
    },
    {
      studentId: null,
      githubUsername: "github-only",
      section: "002",
      repository: "graider-sandbox/csc1120-lab02-github-only",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: null,
      runUrl: null,
      status: "completed",
      conclusion: "failure",
      startedAt: "2026-06-12T18:00:00Z",
      completedAt: "2026-06-12T18:05:00Z",
      selectionStrategy: "latest_configured_workflow_run",
      reason: "tests_failed",
      needsAttention: true,
      diagnostics: []
    },
    {
      studentId: "s003",
      githubUsername: "linchen",
      section: "001",
      repository: "graider-sandbox/csc1120-lab02-lin",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: null,
      runUrl: null,
      status: "in_progress",
      conclusion: null,
      startedAt: "2026-06-12T19:10:00Z",
      completedAt: null,
      selectionStrategy: "latest_configured_workflow_run",
      reason: "workflow_running",
      needsAttention: false,
      diagnostics: []
    },
    {
      studentId: "s004",
      githubUsername: "missingrepo",
      section: "002",
      repository: "graider-sandbox/csc1120-lab02-missing",
      workflow: ".github/workflows/grade.yml",
      ref: "main",
      runId: null,
      runUrl: null,
      status: "missing",
      conclusion: null,
      startedAt: null,
      completedAt: null,
      selectionStrategy: "latest_configured_workflow_run",
      reason: "no_workflow_run_found",
      needsAttention: true,
      diagnostics: []
    }
  ],
  actions: {},
  ...overrides
});

const createAssignmentGradeStatusResult = (
  gradeStatus: AssignmentGradeStatusJsonResponse | null = createAssignmentGradeStatusJson(),
  overrides: Partial<AssignmentGradeStatusResult> = {}
): AssignmentGradeStatusResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: gradeStatus === null ? "failure" : "success",
  gradeStatus,
  error: null,
  refreshedAt: "2026-06-10T16:00:00.000Z",
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
    getAssignmentApplyPreview: vi.fn(),
    getAssignmentGradePreview: vi.fn(),
    getAssignmentGradeStatus: vi.fn().mockResolvedValue(createAssignmentGradeStatusResult()),
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

describe("AssignmentDetailPage", () => {
  it("renders the existing assignment panels with a compact grade status summary before diagnostics", async () => {
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
    expect(screen.getByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Preview apply" })[0]).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Preview grading" })[0]).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "View grading status" })[0]).toBeEnabled();
    expect(screen.getByRole("button", { name: "Refresh detail" })).toBeEnabled();
    expect(screen.getAllByText("Needs attention").length).toBeGreaterThan(0);
    expect(screen.getByText("Template repository is missing.")).toBeInTheDocument();
    expect(
      screen.getByText("GitHub authentication needed for readiness checks.")
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Template" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Grading" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Roster / Sections" })
    ).toBeInTheDocument();
    const summaryHeading = await screen.findByRole("heading", {
      level: 2,
      name: "Grade status summary"
    });
    const diagnosticsHeading = screen.getByRole("heading", { level: 2, name: "Diagnostics" });
    expect(
      summaryHeading.compareDocumentPosition(diagnosticsHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByText("assignment_detail_template_repository_missing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish student reports" })).toBeDisabled();
  });

  it("renders neutral placeholders and missing grade-status data without crashing", async () => {
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
      ),
      getAssignmentGradeStatus: vi.fn().mockResolvedValue(createAssignmentGradeStatusResult(null))
    });

    renderAssignmentDetailPage();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Grade status summary" })
    ).toBeInTheDocument();
    expect(screen.getByText("Grade status data is not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Roster counts could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("No grading")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeInTheDocument();
  });

  it("renders compact grade status rows using roster usernames, readable times, and no workflow column", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });

    renderAssignmentDetailPage();

    const summary = await screen.findByLabelText("Grade status summary");
    expect(within(summary).getByText("ada.course")).toBeInTheDocument();
    expect(within(summary).getByText("github-only")).toBeInTheDocument();
    expect(within(summary).queryByText("adalovelace")).toBeNull();
    expect(within(summary).queryByRole("columnheader", { name: "Workflow" })).toBeNull();
    expect(screen.queryByText("2026-06-12T17:33:39Z")).toBeNull();
    expect(within(summary).getAllByText(/Last completed .*Jun 12, 2026/u).length).toBeGreaterThan(
      0
    );
    expect(within(summary).getByText(/Started .*Jun 12, 2026/u)).toBeInTheDocument();
    expect(within(summary).getByText("No run time available")).toBeInTheDocument();
    expect(within(summary).getByText("Completed — success")).toBeInTheDocument();
    expect(within(summary).getByText("Completed — failure")).toBeInTheDocument();
    expect(within(summary).getByText("In progress")).toBeInTheDocument();
    expect(within(summary).getByText("Missing")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123"
    );
    expect(within(summary).getAllByText("No run link")).toHaveLength(3);
  });

  it("builds Open run links from full student repository and run id when backend runUrl is missing", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
      getAssignmentGradeStatus: vi.fn().mockResolvedValue(
        createAssignmentGradeStatusResult(
          createAssignmentGradeStatusJson({
            repositories: [
              {
                studentId: "s001",
                githubUsername: "adalovelace",
                section: "001",
                repository: "graider-sandbox/csc1120-lab02-ada",
                workflow: ".github/workflows/grade.yml",
                ref: "main",
                runId: 789,
                runUrl: null,
                status: "completed",
                conclusion: "success",
                startedAt: "2026-06-12T17:32:49Z",
                completedAt: "2026-06-12T17:33:39Z",
                selectionStrategy: "latest_configured_workflow_run",
                reason: "success",
                needsAttention: false,
                diagnostics: []
              }
            ]
          })
        )
      )
    });

    renderAssignmentDetailPage();

    const summary = await screen.findByLabelText("Grade status summary");
    expect(within(summary).getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/789"
    );
  });

  it("does not render Open run for unsafe, repo-name-only, or course-admin run URLs", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
      getAssignmentGradeStatus: vi.fn().mockResolvedValue(
        createAssignmentGradeStatusResult(
          createAssignmentGradeStatusJson({
            repositories: [
              {
                studentId: "repo-name-only",
                githubUsername: null,
                section: "001",
                repository: "csc1120-lab02-ada",
                workflow: ".github/workflows/grade.yml",
                ref: "main",
                runId: 123,
                runUrl: null,
                status: "completed",
                conclusion: "success",
                startedAt: "2026-06-12T17:32:49Z",
                completedAt: "2026-06-12T17:33:39Z",
                selectionStrategy: "latest_configured_workflow_run",
                reason: "success",
                needsAttention: false,
                diagnostics: []
              },
              {
                studentId: "javascript-url",
                githubUsername: null,
                section: "001",
                repository: "graider-sandbox/csc1120-lab02-js",
                workflow: ".github/workflows/grade.yml",
                ref: "main",
                runId: 456,
                runUrl: "javascript:alert(1)",
                status: "completed",
                conclusion: "success",
                startedAt: "2026-06-12T17:32:49Z",
                completedAt: "2026-06-12T17:33:39Z",
                selectionStrategy: "latest_configured_workflow_run",
                reason: "success",
                needsAttention: false,
                diagnostics: []
              },
              {
                studentId: "admin-url",
                githubUsername: null,
                section: "001",
                repository: "graider-sandbox/csc1120-lab02-admin",
                workflow: ".github/workflows/grade.yml",
                ref: "main",
                runId: 789,
                runUrl: "https://github.com/graider-sandbox/course-admin/actions/runs/789",
                status: "completed",
                conclusion: "success",
                startedAt: "2026-06-12T17:32:49Z",
                completedAt: "2026-06-12T17:33:39Z",
                selectionStrategy: "latest_configured_workflow_run",
                reason: "success",
                needsAttention: false,
                diagnostics: []
              }
            ]
          })
        )
      )
    });

    renderAssignmentDetailPage();

    const summary = await screen.findByLabelText("Grade status summary");
    expect(within(summary).queryByRole("link", { name: "Open run" })).toBeNull();
    expect(within(summary).getAllByText("No run link")).toHaveLength(3);
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

  it("keeps the full grade status action available from the compact summary", async () => {
    const onViewGradeStatus = vi.fn();

    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });
    renderAssignmentDetailPage({ onViewGradeStatus });

    const summary = await screen.findByLabelText("Grade status summary");
    fireEvent.click(within(summary).getByRole("button", { name: "View full grade status" }));

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

  it("renders remaining concise grade status labels", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
      getAssignmentGradeStatus: vi.fn().mockResolvedValue(
        createAssignmentGradeStatusResult(
          createAssignmentGradeStatusJson({
            repositories: [
              {
                studentId: "queued",
                githubUsername: null,
                section: "001",
                repository: "owner/queued",
                status: "queued",
                conclusion: null,
                startedAt: null,
                completedAt: null,
                diagnostics: []
              },
              {
                studentId: "unknown",
                githubUsername: null,
                section: "001",
                repository: "owner/unknown",
                status: "unknown",
                conclusion: null,
                startedAt: null,
                completedAt: null,
                diagnostics: []
              },
              {
                studentId: "blocked",
                githubUsername: null,
                section: "001",
                repository: "owner/blocked",
                status: "blocked",
                conclusion: null,
                startedAt: null,
                completedAt: null,
                diagnostics: []
              },
              {
                studentId: "token",
                githubUsername: null,
                section: "001",
                repository: "owner/token",
                status: "token_required",
                conclusion: null,
                startedAt: null,
                completedAt: null,
                diagnostics: []
              }
            ]
          })
        )
      )
    });

    renderAssignmentDetailPage();

    const summary = await screen.findByLabelText("Grade status summary");
    expect(within(summary).getByText("Queued")).toBeInTheDocument();
    expect(within(summary).getByText("Unknown")).toBeInTheDocument();
    expect(within(summary).getByText("Blocked")).toBeInTheDocument();
    expect(within(summary).getByText("Token required")).toBeInTheDocument();
  });

  it("keeps grade status diagnostics collapsed and sanitizes command failures", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult()),
      getAssignmentGradeStatus: vi.fn().mockResolvedValue(
        createAssignmentGradeStatusResult(
          createAssignmentGradeStatusJson({
            diagnostics: [
              {
                code: "grade_status_warning",
                severity: "warning",
                message: "Authorization: Bearer secret-token-value"
              }
            ]
          }),
          {
            error: {
              code: "grade_status_failed",
              message: "Authorization: Bearer secret-token-value",
              exitCode: 1,
              stdoutSnippet: "ghp_secretTokenShouldNotRender",
              stderrSnippet: "secret-token-value"
            }
          }
        )
      )
    });

    renderAssignmentDetailPage();

    const summary = await screen.findByLabelText("Grade status summary");
    expect(within(summary).getByText("Grade status diagnostics (1)")).toBeInTheDocument();
    expect(within(summary).getByText("Unable to load grade status summary.")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
    expect(screen.queryByText(/ghp_secretTokenShouldNotRender/u)).toBeNull();
    expect(screen.getByText("Sensitive diagnostic details were redacted.")).toBeInTheDocument();
  });

  it("does not call mutating commands while loading the grade status summary", async () => {
    const api = mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });

    renderAssignmentDetailPage();

    await screen.findByLabelText("Grade status summary");

    expect(api.getAssignmentGradeStatus).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
    expect(api.applyAssignment).not.toHaveBeenCalled();
    expect(api.gradeAssignment).not.toHaveBeenCalled();
    expect(api.getFacultyReport).not.toHaveBeenCalled();
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
