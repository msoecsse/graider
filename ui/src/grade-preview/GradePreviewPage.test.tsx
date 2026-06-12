import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentGradeJsonResponse,
  AssignmentGradePreviewJsonResponse,
  AssignmentGradePreviewResult,
  AssignmentGradeResult,
  GraiderUIApi
} from "../../electron/ipc";
import { GradePreviewPage } from "./GradePreviewPage";
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

const createGradePreviewJson = (
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
    file: SELECTION.assignmentFile,
    status: "active"
  },
  course: { slug: "csc1120", title: "CSC1120" },
  term: { slug: "27s1", title: "Spring 2027" },
  target: { sections: ["001"], sectionCount: 1, studentCount: 3, activeStudentCount: 2 },
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
      blocked: 1,
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
      },
      {
        studentId: "s003",
        githubUsername: "linus",
        section: "001",
        repository: null,
        status: "blocked",
        reason: "manifest_entry_missing",
        workflow: ".github/workflows/grade.yml",
        ref: "main",
        diagnostics: [
          {
            code: "manifest_missing",
            severity: "error",
            message: "Repository manifest entry missing."
          }
        ]
      }
    ]
  },
  files: {
    assignmentFile: SELECTION.assignmentFile,
    manifestFile: "terms/27s1/manifests/lab02/manifest.yml",
    workflowFile: ".github/workflows/grade.yml"
  },
  actions: {
    grade: { available: true, implemented: false, previewOnly: true }
  },
  ...overrides
});

const createGradePreviewResult = (
  preview: AssignmentGradePreviewJsonResponse | null = createGradePreviewJson(),
  overrides: Partial<AssignmentGradePreviewResult> = {}
): AssignmentGradePreviewResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: preview === null ? "failure" : "success",
  preview,
  error: null,
  refreshedAt: "2026-06-10T14:30:00.000Z",
  ...overrides
});

const createReadyGradePreviewJson = (): AssignmentGradePreviewJsonResponse =>
  createGradePreviewJson({
    plan: {
      summary: {
        wouldDispatch: 2,
        wouldSkip: 0,
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
          status: "would_dispatch",
          reason: "workflow_dispatch_available",
          workflow: ".github/workflows/grade.yml",
          ref: "main",
          diagnostics: []
        }
      ]
    }
  });

const createGradeJson = (
  overrides: Partial<AssignmentGradeJsonResponse> = {}
): AssignmentGradeJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment grade",
  assignmentFile: SELECTION.assignmentFile,
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
    dispatchSucceeded: 1,
    dispatchFailed: 1,
    skipped: 0,
    repositories: [
      {
        studentId: "s001",
        githubUsername: "ada",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-ada",
        status: "dispatched",
        reason: "workflow_dispatch_created",
        workflow: ".github/workflows/grade.yml",
        ref: "main",
        diagnostics: []
      },
      {
        studentId: "s002",
        githubUsername: "grace",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-grace",
        status: "failed",
        reason: "workflow_dispatch_failed",
        workflow: ".github/workflows/grade.yml",
        ref: "main",
        diagnostics: [
          {
            code: "workflow_dispatch_failed",
            severity: "error",
            message: "Workflow dispatch failed."
          }
        ]
      }
    ]
  },
  ...overrides
});

const createGradeResult = (
  grade: AssignmentGradeJsonResponse | null = createGradeJson(),
  overrides: Partial<AssignmentGradeResult> = {}
): AssignmentGradeResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: grade === null || grade.status === "failure" ? "failure" : "success",
  grade,
  error: null,
  dispatchedAt: "2026-06-10T15:30:00.000Z",
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
    getAssignmentGradePreview: vi.fn().mockResolvedValue(createGradePreviewResult()),
    getAssignmentGradeStatus: vi.fn(),
    getFacultyReport: vi.fn(),
    applyAssignment: vi.fn(),
    gradeAssignment: vi.fn().mockResolvedValue(createGradeResult()),
    ...api
  };

  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: graiderUI
  });

  return graiderUI;
};

const renderGradePreviewPage = (onBack = vi.fn()) =>
  render(<GradePreviewPage selection={SELECTION} assignmentDetail={null} onBack={onBack} />);

describe("GradePreviewPage", () => {
  it("auto-loads grade preview and renders target, grading, workflow, summary, and rows", async () => {
    const getAssignmentGradePreview = vi.fn().mockResolvedValue(createGradePreviewResult());
    const applyAssignment = vi.fn();

    mockGraiderUI({ getAssignmentGradePreview, applyAssignment });
    renderGradePreviewPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Grade Dispatch Preview" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preview only — no GitHub Actions workflows will be started.")
    ).toBeInTheDocument();
    expect(getAssignmentGradePreview).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
    expect(screen.getByRole("heading", { level: 2, name: "Target" })).toBeInTheDocument();
    expect(screen.getByText("Student count")).toBeInTheDocument();
    expect(screen.getByText("Effective grading")).toBeInTheDocument();
    expect(screen.getByText("course_default")).toBeInTheDocument();
    expect(screen.getAllByText(".github/workflows/grade.yml").length).toBeGreaterThan(0);
    expect(screen.getByText("workflow_dispatch readiness")).toBeInTheDocument();
    expect(screen.getByText("Repository dispatch preview")).toBeInTheDocument();
    expect(screen.getAllByText("Would dispatch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Would skip").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.queryByText("Dispatched")).toBeNull();
    expect(screen.getByRole("button", { name: "Dispatch grading" })).toBeDisabled();
    expect(
      screen.getByText("Dispatch grading is disabled until the latest preview has no blockers.")
    ).toBeInTheDocument();
    expect(applyAssignment).not.toHaveBeenCalled();
  });

  it("enables dispatch when preview has no blockers and requires confirmation", async () => {
    mockGraiderUI({
      getAssignmentGradePreview: vi
        .fn()
        .mockResolvedValue(createGradePreviewResult(createReadyGradePreviewJson()))
    });
    renderGradePreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review grade dispatch" }));

    expect(
      screen.getByRole("heading", { level: 3, name: "Confirm grade dispatch" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This will start GitHub Actions grading workflows on student repositories.")
    ).toBeInTheDocument();
    expect(screen.getByText("This does not collect results yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Reports and result collection are handled in later slices.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dispatch grading" })).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(
        "I understand this will start grading workflows on student repositories"
      )
    );

    expect(screen.getByRole("button", { name: "Dispatch grading" })).toBeEnabled();
  });

  it("confirmed dispatch calls gradeAssignment exactly once with assignment context", async () => {
    let resolveDispatch: (value: AssignmentGradeResult) => void = () => undefined;
    const gradeAssignment = vi.fn(
      async () =>
        await new Promise<AssignmentGradeResult>((resolve) => {
          resolveDispatch = resolve;
        })
    );

    mockGraiderUI({
      getAssignmentGradePreview: vi
        .fn()
        .mockResolvedValue(createGradePreviewResult(createReadyGradePreviewJson())),
      gradeAssignment
    });
    renderGradePreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review grade dispatch" }));
    fireEvent.click(
      screen.getByLabelText(
        "I understand this will start grading workflows on student repositories"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Dispatch grading" }));
    fireEvent.click(screen.getByRole("button", { name: "Dispatching..." }));

    expect(gradeAssignment).toHaveBeenCalledTimes(1);
    expect(gradeAssignment).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
    expect(screen.getByText("Dispatching grading workflows...")).toBeInTheDocument();

    resolveDispatch(createGradeResult());

    expect(
      await screen.findByRole("heading", { level: 2, name: "Grade Dispatch Result Summary" })
    ).toBeInTheDocument();
  });

  it("renders success result summary and completed dispatch rows", async () => {
    mockGraiderUI({
      getAssignmentGradePreview: vi
        .fn()
        .mockResolvedValue(createGradePreviewResult(createReadyGradePreviewJson())),
      gradeAssignment: vi.fn().mockResolvedValue(createGradeResult())
    });
    renderGradePreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review grade dispatch" }));
    fireEvent.click(
      screen.getByLabelText(
        "I understand this will start grading workflows on student repositories"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Dispatch grading" }));

    expect(
      await screen.findByText("Grade dispatch result — preview context remains visible below.")
    ).toBeInTheDocument();
    expect(screen.getByText("Workflow dispatched")).toBeInTheDocument();
    expect(screen.getAllByText("Dispatched").length).toBeGreaterThan(0);
    expect(screen.getByText("Failed / blocked")).toBeInTheDocument();
    expect(screen.getByText("Workflow dispatch failed.")).toBeInTheDocument();
    expect(screen.queryByText("Would dispatched")).toBeNull();
  });

  it("renders partial-success and failure diagnostics safely", async () => {
    const partialResult = createGradeResult(
      createGradeJson({
        status: "partial_success",
        exitCode: 2,
        diagnostics: [
          {
            code: "workflow_dispatch_failed",
            severity: "error",
            message: "Authorization: Bearer secret-token-value",
            context: { token: "ghp_secret-token-value" }
          }
        ],
        summary: {
          targetsSelected: 1,
          dispatchAttempted: 1,
          dispatchSucceeded: 0,
          dispatchFailed: 1,
          skipped: 0
        }
      })
    );

    mockGraiderUI({
      getAssignmentGradePreview: vi
        .fn()
        .mockResolvedValue(createGradePreviewResult(createReadyGradePreviewJson())),
      gradeAssignment: vi.fn().mockResolvedValue(partialResult)
    });
    renderGradePreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review grade dispatch" }));
    fireEvent.click(
      screen.getByLabelText(
        "I understand this will start grading workflows on student repositories"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Dispatch grading" }));

    expect(await screen.findByText("Partially checked")).toBeInTheDocument();
    expect(screen.getByText("Sensitive diagnostic details were redacted.")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
    expect(screen.queryByText(/ghp_/u)).toBeNull();
  });

  it("renders safe grade command errors and invalid JSON errors", async () => {
    mockGraiderUI({
      getAssignmentGradePreview: vi
        .fn()
        .mockResolvedValue(createGradePreviewResult(createReadyGradePreviewJson())),
      gradeAssignment: vi.fn().mockResolvedValue(
        createGradeResult(null, {
          status: "failure",
          error: {
            code: "invalid_assignment_grade_json",
            message: "Unexpected token secret-token-value",
            exitCode: 0,
            stdoutSnippet: "Authorization: Bearer secret-token-value",
            stderrSnippet: null
          }
        })
      )
    });
    renderGradePreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review grade dispatch" }));
    fireEvent.click(
      screen.getByLabelText(
        "I understand this will start grading workflows on student repositories"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Dispatch grading" }));

    expect(await screen.findByText("Graider returned invalid grade JSON.")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
  });

  it("refreshes preview and keeps the previous preview visible while refreshing", async () => {
    let resolveRefresh: (value: AssignmentGradePreviewResult) => void = () => undefined;
    const firstResult = createGradePreviewResult();
    const secondPreview = createGradePreviewJson({
      plan: {
        summary: {
          wouldDispatch: 2,
          wouldSkip: 0,
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
            status: "would_dispatch",
            reason: "workflow_dispatch_available",
            workflow: ".github/workflows/grade.yml",
            ref: "main",
            diagnostics: []
          }
        ]
      }
    });
    const getAssignmentGradePreview = vi
      .fn()
      .mockResolvedValueOnce(firstResult)
      .mockImplementationOnce(
        async () =>
          await new Promise<AssignmentGradePreviewResult>((resolve) => {
            resolveRefresh = resolve;
          })
      );

    mockGraiderUI({ getAssignmentGradePreview });
    renderGradePreviewPage();

    expect(await screen.findByText("manifest_entry_missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh grade preview" }));

    expect(await screen.findByText("Loading grade preview...")).toBeInTheDocument();
    expect(screen.getByText("manifest_entry_missing")).toBeInTheDocument();

    resolveRefresh(createGradePreviewResult(secondPreview));

    await waitFor(() => {
      expect(screen.queryByText("manifest_entry_missing")).toBeNull();
    });
    expect(getAssignmentGradePreview).toHaveBeenCalledTimes(2);
  });

  it("renders token and command diagnostics safely", async () => {
    const preview = createGradePreviewJson({
      status: "partial_success",
      diagnostics: [
        {
          code: "github_token_required",
          severity: "warning",
          message: "Token required for repository checks."
        },
        {
          code: "student_repository_status_unknown",
          severity: "warning",
          message: "Authorization: Bearer secret-token-value",
          context: { token: "ghp_secret-token-value" }
        }
      ],
      plan: {
        summary: {
          wouldDispatch: 0,
          wouldSkip: 0,
          blocked: 0,
          unknown: 1
        },
        repositories: [
          {
            studentId: "s001",
            githubUsername: "ada",
            section: "001",
            repository: null,
            status: "token_required",
            reason: "token_required",
            workflow: ".github/workflows/grade.yml",
            ref: "main",
            diagnostics: []
          }
        ]
      }
    });

    mockGraiderUI({
      getAssignmentGradePreview: vi.fn().mockResolvedValue(createGradePreviewResult(preview))
    });
    renderGradePreviewPage();

    expect(await screen.findByText("Token required")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "GitHub token required to determine dispatchability."
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Sensitive diagnostic details were redacted.")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
    expect(screen.queryByText(/ghp_/u)).toBeNull();
  });

  it("renders safe command errors and invalid JSON errors", async () => {
    mockGraiderUI({
      getAssignmentGradePreview: vi.fn().mockResolvedValue(
        createGradePreviewResult(null, {
          status: "failure",
          error: {
            code: "invalid_assignment_grade_preview_json",
            message: "Unexpected token secret-token-value",
            exitCode: 0,
            stdoutSnippet: "Authorization: Bearer secret-token-value",
            stderrSnippet: null
          }
        })
      )
    });
    renderGradePreviewPage();

    expect(
      await screen.findByText("Graider returned invalid grade preview JSON.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
  });

  it("returns to assignment detail", async () => {
    const onBack = vi.fn();

    mockGraiderUI({});
    renderGradePreviewPage(onBack);

    fireEvent.click(await screen.findByRole("button", { name: "Back to assignment detail" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
