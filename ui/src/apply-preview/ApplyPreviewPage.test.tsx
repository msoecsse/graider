import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentApplyPreviewJsonResponse,
  AssignmentApplyPreviewResult,
  GraiderUIApi
} from "../../electron/ipc";
import { ApplyPreviewPage } from "./ApplyPreviewPage";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";

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
  target: { sections: ["001"], sectionCount: 1, studentCount: 4 },
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
      wouldSkipRepositories: 1,
      blockedRepositories: 1,
      unknownRepositories: 1
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
      },
      {
        studentId: "s002",
        githubUsername: "grace",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-grace",
        status: "would_update",
        reason: "student_repository_exists",
        diagnostics: []
      },
      {
        studentId: "s003",
        githubUsername: "katherine",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-katherine",
        status: "would_skip",
        reason: "student_status_hold",
        diagnostics: []
      },
      {
        studentId: "s004",
        githubUsername: "dorothy",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-dorothy",
        status: "blocked",
        reason: "assignment_archived",
        diagnostics: [
          {
            code: "assignment_archived",
            severity: "error",
            message: "Archived assignments cannot be applied."
          }
        ]
      },
      {
        studentId: "s005",
        githubUsername: "mary",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-mary",
        status: "unknown",
        reason: "student_repository_status_unknown",
        diagnostics: []
      }
    ]
  },
  files: {
    assignmentFile: ASSIGNMENT_FILE,
    workflowFile: ".github/workflows/grade.yml",
    templateSource: "graider-sandbox/csc1120L2Template@main"
  },
  actions: { apply: { available: false, implemented: false, previewOnly: true } },
  ...overrides
});

const createApplyPreviewResult = (
  preview: AssignmentApplyPreviewJsonResponse | null = createApplyPreviewJson(),
  overrides: Partial<AssignmentApplyPreviewResult> = {}
): AssignmentApplyPreviewResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: preview === null ? "failure" : "success",
  preview,
  error: null,
  refreshedAt: "2026-06-10T14:00:00.000Z",
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
    getAssignmentApplyPreview: vi.fn().mockResolvedValue(createApplyPreviewResult()),
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

const renderApplyPreviewPage = (onBack = vi.fn()) =>
  render(<ApplyPreviewPage selection={SELECTION} assignmentDetail={null} onBack={onBack} />);

describe("ApplyPreviewPage", () => {
  it("auto-loads and renders preview context, panels, rows, diagnostics, and disabled apply", async () => {
    const getAssignmentApplyPreview = vi.fn().mockResolvedValue(createApplyPreviewResult());

    mockGraiderUI({ getAssignmentApplyPreview });
    renderApplyPreviewPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Apply Preview" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preview only — no repositories or files will be changed.")
    ).toBeInTheDocument();
    expect(screen.getByText("Lab 02")).toBeInTheDocument();
    expect(screen.getByText("CSC1120 · Spring 2027")).toBeInTheDocument();
    expect(screen.getByText(`Assignment file: ${ASSIGNMENT_FILE}`)).toBeInTheDocument();
    expect(screen.getByText("Needs attention before apply")).toBeInTheDocument();
    expect(screen.getByText("Sections")).toBeInTheDocument();
    expect(screen.getByText("Student count")).toBeInTheDocument();
    expect(screen.getByText("graider-sandbox/csc1120L2Template")).toBeInTheDocument();
    expect(screen.getByText(".github/workflows/grade.yml")).toBeInTheDocument();
    expect(screen.getAllByText("Would create").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Would update").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Would skip").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getByText("student_repository_missing")).toBeInTheDocument();
    expect(screen.getAllByText("assignment_archived").length).toBeGreaterThan(0);
    expect(screen.getByText("Apply changes — coming in UI-3B")).toBeDisabled();
    expect(
      screen.getByText("This preview is read-only. Applying changes will be added in UI-3B.")
    ).toBeInTheDocument();
    expect(getAssignmentApplyPreview).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
  });

  it("renders no-grading and no diagnostics states cleanly", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi.fn().mockResolvedValue(
        createApplyPreviewResult(
          createApplyPreviewJson({
            diagnostics: [],
            grading: {
              enabled: false,
              mode: "no-grading",
              workflow: null,
              artifact: null,
              resultFile: null,
              workflowStatus: "not_required",
              workflowDispatch: "not_required"
            },
            plan: {
              summary: {
                wouldCreateRepositories: 0,
                wouldUpdateRepositories: 0,
                wouldSkipRepositories: 0,
                blockedRepositories: 0,
                unknownRepositories: 0
              },
              repositories: []
            }
          })
        )
      )
    });

    renderApplyPreviewPage();

    expect(await screen.findByText("No grading workflow required.")).toBeInTheDocument();
    expect(screen.getByText("No blockers or warnings.")).toBeInTheDocument();
    expect(screen.getByText("No repository preview rows.")).toBeInTheDocument();
  });

  it("shows missing token guidance and redacts token-looking diagnostics", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi.fn().mockResolvedValue(
        createApplyPreviewResult(
          createApplyPreviewJson({
            status: "partial_success",
            diagnostics: [
              {
                code: "github_token_required",
                severity: "error",
                message: "GRAIDER_GITHUB_TOKEN=ghp_secret_token required",
                context: { authorization: "Bearer ghp_secret_token" }
              }
            ]
          })
        )
      )
    });

    renderApplyPreviewPage();

    expect(
      (await screen.findAllByText("GitHub token required to determine repository status.")).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Sign in with GitHub CLI using gh auth login, then refresh.")
    ).toBeInTheDocument();
    expect(screen.getByText("Sensitive diagnostic details were redacted.")).toBeInTheDocument();
    expect(screen.getByText("[redacted]")).toBeInTheDocument();
    expect(screen.queryByText(/ghp_secret_token/u)).toBeNull();
  });

  it("refreshes preview while preserving prior preview", async () => {
    let resolveRefresh: (value: AssignmentApplyPreviewResult) => void = () => undefined;
    const getAssignmentApplyPreview = vi
      .fn()
      .mockResolvedValueOnce(createApplyPreviewResult())
      .mockImplementationOnce(
        async () =>
          await new Promise<AssignmentApplyPreviewResult>((resolve) => {
            resolveRefresh = resolve;
          })
      );

    mockGraiderUI({ getAssignmentApplyPreview });
    renderApplyPreviewPage();

    expect(await screen.findByText("graider-sandbox/csc1120-lab02-ada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh apply preview" }));

    expect(await screen.findByText("Loading apply preview...")).toBeInTheDocument();
    expect(screen.getByText("graider-sandbox/csc1120-lab02-ada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh apply preview" })).toBeDisabled();

    resolveRefresh(
      createApplyPreviewResult(
        createApplyPreviewJson({
          plan: {
            summary: {
              wouldCreateRepositories: 0,
              wouldUpdateRepositories: 1,
              wouldSkipRepositories: 0,
              blockedRepositories: 0,
              unknownRepositories: 0
            },
            repositories: [
              {
                studentId: "s002",
                githubUsername: "grace",
                section: "001",
                repository: "graider-sandbox/csc1120-lab02-grace",
                status: "would_update",
                reason: "student_repository_exists",
                diagnostics: []
              }
            ]
          }
        })
      )
    );

    expect(await screen.findByText("graider-sandbox/csc1120-lab02-grace")).toBeInTheDocument();
    expect(getAssignmentApplyPreview).toHaveBeenCalledTimes(2);
  });

  it("shows safe command errors and preserves prior preview on thrown refresh failure", async () => {
    const getAssignmentApplyPreview = vi
      .fn()
      .mockResolvedValueOnce(createApplyPreviewResult())
      .mockRejectedValueOnce(new Error("secret-token-value"));

    mockGraiderUI({ getAssignmentApplyPreview });
    renderApplyPreviewPage();

    expect(await screen.findByText("graider-sandbox/csc1120-lab02-ada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh apply preview" }));

    expect(await screen.findByText("Unable to load apply preview.")).toBeInTheDocument();
    expect(screen.getByText("graider-sandbox/csc1120-lab02-ada")).toBeInTheDocument();
    expect(screen.queryByText(/secret-token-value/u)).toBeNull();
  });

  it("shows invalid JSON and missing CLI errors safely", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi.fn().mockResolvedValue(
        createApplyPreviewResult(null, {
          status: "failure",
          error: {
            code: "invalid_assignment_apply_preview_json",
            message: "Unexpected token",
            exitCode: 0,
            stdoutSnippet: "Authorization: Bearer secret-token-value",
            stderrSnippet: null
          }
        })
      )
    });

    renderApplyPreviewPage();

    expect(
      await screen.findByText("Graider returned invalid apply preview JSON.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
  });

  it("copies template repository with feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    mockClipboard(writeText);
    mockGraiderUI({
      getAssignmentApplyPreview: vi.fn().mockResolvedValue(createApplyPreviewResult())
    });
    renderApplyPreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Copy template repository" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("graider-sandbox/csc1120L2Template");
    });
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("Back to assignment calls the provided navigation callback", async () => {
    const onBack = vi.fn();

    mockGraiderUI({
      getAssignmentApplyPreview: vi.fn().mockResolvedValue(createApplyPreviewResult())
    });
    renderApplyPreviewPage(onBack);

    fireEvent.click(await screen.findByRole("button", { name: "Back to assignment" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
