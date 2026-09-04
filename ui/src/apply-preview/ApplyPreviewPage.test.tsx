import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentApplyJsonResponse,
  AssignmentApplyResult,
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

const createReadyApplyPreviewJson = (): AssignmentApplyPreviewJsonResponse =>
  createApplyPreviewJson({
    plan: {
      summary: {
        wouldCreateRepositories: 1,
        wouldUpdateRepositories: 1,
        wouldSkipRepositories: 1,
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
        }
      ]
    },
    actions: { apply: { available: true, implemented: false, previewOnly: true } }
  });

const createReadyGroupApplyPreviewJson = (): AssignmentApplyPreviewJsonResponse =>
  createApplyPreviewJson({
    repositoryMode: "group",
    applySupported: true,
    target: { sections: ["111", "121"], sectionCount: 2, studentCount: 3 },
    plan: {
      summary: {
        wouldCreateRepositories: 2,
        wouldUpdateRepositories: 0,
        wouldSkipRepositories: 0,
        blockedRepositories: 0,
        unknownRepositories: 0
      },
      repositories: [],
      groupTargets: [
        {
          targetId: "team-1",
          groupId: "team-1",
          repositoryName: "27s2-csc1120-lab02-team-1",
          sectionIds: ["111"],
          studentIds: ["alpha", "beta"],
          githubUsernames: ["alpha-gh", "beta-gh"],
          plannedStudentPermission: "admin",
          facultyTeam: "faculty",
          facultyTeamPermission: "push",
          graderTeam: "graders",
          graderTeamPermission: "maintain"
        },
        {
          targetId: "team-2",
          groupId: "team-2",
          repositoryName: "27s2-csc1120-lab02-team-2",
          sectionIds: ["121"],
          studentIds: ["gamma"],
          githubUsernames: ["gamma-gh"],
          plannedStudentPermission: "admin",
          facultyTeam: "faculty",
          facultyTeamPermission: "push",
          graderTeam: "graders",
          graderTeamPermission: "maintain"
        }
      ]
    },
    actions: { apply: { available: true, implemented: true, previewOnly: false } }
  });

const createBlockedGroupApplyPreviewJson = (): AssignmentApplyPreviewJsonResponse => ({
  ...createReadyGroupApplyPreviewJson(),
  status: "failure",
  applySupported: false,
  diagnostics: [
    {
      code: "group_repository_untracked_collision",
      severity: "error",
      message: "The planned repository already exists and cannot be adopted.",
      context: { groupId: "team-1", repositoryName: "27s2-csc1120-lab02-team-1" }
    }
  ],
  actions: { apply: { available: false, implemented: true, previewOnly: false } }
});

const createApplyJson = (
  overrides: Partial<AssignmentApplyJsonResponse> = {}
): AssignmentApplyJsonResponse => ({
  schemaVersion: 1,
  commandName: "assignment apply",
  assignmentFile: ASSIGNMENT_FILE,
  status: "success",
  exitCode: 0,
  diagnostics: [],
  warnings: [],
  errors: [],
  generatedFiles: ["terms/27s1/manifests/lab02/manifest.yml"],
  summary: {
    assignmentSlug: "lab02",
    manifestFile: "terms/27s1/manifests/lab02/manifest.yml",
    created: 1,
    updated: 1,
    skipped: 1,
    failed: 0,
    blocked: 0,
    repositories: [
      {
        studentId: "s001",
        githubUsername: "ada",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-ada",
        status: "created",
        reason: "repository_created",
        diagnostics: []
      },
      {
        studentId: "s002",
        githubUsername: "grace",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-grace",
        status: "updated",
        reason: "repository_updated",
        diagnostics: []
      },
      {
        studentId: "s003",
        githubUsername: "katherine",
        section: "001",
        repository: "graider-sandbox/csc1120-lab02-katherine",
        status: "skipped",
        reason: "student_status_hold",
        diagnostics: []
      }
    ]
  },
  ...overrides
});

const createGroupApplyJson = (
  overrides: Partial<AssignmentApplyJsonResponse> = {}
): AssignmentApplyJsonResponse =>
  createApplyJson({
    generatedFiles: ["terms/27s2/manifests/lab02/manifest.yml"],
    summary: {
      repositoryMode: "group",
      targetCount: 2,
      studentMappingCount: 3,
      manifestFile: "terms/27s2/manifests/lab02/manifest.yml",
      manifestWritten: true,
      groupTargets: [
        {
          groupId: "team-1",
          repositoryName: "27s2-csc1120-lab02-team-1",
          htmlUrl: "https://github.com/csc1120/27s2-csc1120-lab02-team-1",
          cloneUrl: "https://github.com/csc1120/27s2-csc1120-lab02-team-1.git",
          studentIds: ["alpha", "beta"],
          githubUsernames: ["alpha-gh", "beta-gh"],
          status: "success",
          diagnostics: [
            {
              code: "grading_workflow_pending",
              severity: "warning",
              message: "Grade workflow visibility is pending.",
              context: { groupId: "team-1", repositoryName: "27s2-csc1120-lab02-team-1" }
            }
          ]
        },
        {
          groupId: "team-2",
          repositoryName: "27s2-csc1120-lab02-team-2",
          htmlUrl: "https://github.com/csc1120/27s2-csc1120-lab02-team-2",
          studentIds: ["gamma"],
          githubUsernames: ["gamma-gh"],
          status: "success",
          diagnostics: []
        }
      ]
    },
    ...overrides
  });

const createApplyResult = (
  apply: AssignmentApplyJsonResponse | null = createApplyJson(),
  overrides: Partial<AssignmentApplyResult> = {}
): AssignmentApplyResult => ({
  courseFolderId: SELECTION.courseFolderId,
  courseFolderPath: SELECTION.courseFolderPath,
  assignmentFile: SELECTION.assignmentFile,
  status: apply === null || apply.status === "failure" ? "failure" : "success",
  apply,
  error: null,
  appliedAt: "2026-06-10T15:00:00.000Z",
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
    getAssignmentDetail: vi.fn(),
    getAssignmentApplyPreview: vi.fn().mockResolvedValue(createApplyPreviewResult()),
    getAssignmentGradePreview: vi.fn(),
    getAssignmentGradeStatus: vi.fn(),
    getFacultyReport: vi.fn(),
    applyAssignment: vi.fn().mockResolvedValue(createApplyResult()),
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

const renderApplyPreviewPage = (onBack = vi.fn()) =>
  render(<ApplyPreviewPage selection={SELECTION} assignmentDetail={null} onBack={onBack} />);

describe("ApplyPreviewPage", () => {
  it("auto-loads and renders preview context, panels, rows, diagnostics, and disabled apply for blockers", async () => {
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
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
    expect(
      screen.getByText("Apply is disabled until the latest preview has no blockers.")
    ).toBeInTheDocument();
    expect(screen.getByText("Repository rows are blocked")).toBeInTheDocument();
    expect(screen.getByText("Repository rows have unknown status")).toBeInTheDocument();
    expect(getAssignmentApplyPreview).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
  });

  it("enables apply entry point when preview has no blockers", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyApplyPreviewJson()))
    });
    renderApplyPreviewPage();

    expect(await screen.findByRole("button", { name: "Review apply changes" })).toBeEnabled();
    expect(screen.getByText("Ready to preview apply")).toBeInTheDocument();
    expect(screen.queryByText("Created")).toBeNull();
  });

  it("shows confirmation and disables Apply changes until acknowledged", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyApplyPreviewJson()))
    });
    renderApplyPreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("This will create or update student repositories.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This may write manifests/local apply state if the backend apply command does so."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This may push files/commits to GitHub according to the existing apply implementation."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to student repositories")
    );

    expect(screen.getByRole("button", { name: "Apply changes" })).toBeEnabled();
  });

  it("shows group targets and confirms one shared repository per group", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyGroupApplyPreviewJson()))
    });
    renderApplyPreviewPage();

    expect(
      await screen.findByRole("table", { name: "Group repository targets" })
    ).toBeInTheDocument();
    expect(screen.getByText("27s2-csc1120-lab02-team-1")).toBeInTheDocument();
    expect(screen.getByText("alpha, beta")).toBeInTheDocument();
    expect(screen.queryByText(/alpha-gh/u)).toBeNull();
    expect(screen.getAllByText("admin")).toHaveLength(2);
    expect(screen.getByText("2 group repositories would be affected.")).toBeInTheDocument();
    expect(screen.queryByText("graider-sandbox/csc1120-lab02-alpha")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Review apply changes" }));

    expect(
      screen.getByText(
        "This will create or update one shared repository per group. Every group member will receive admin access."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("I understand this will apply changes to group repositories")
    ).toBeInTheDocument();
  });

  it("guards Apply when group preview diagnostics are blocking", async () => {
    const applyAssignment = vi.fn();
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createBlockedGroupApplyPreviewJson())),
      applyAssignment
    });
    renderApplyPreviewPage();

    expect(
      await screen.findByText("The planned repository already exists and cannot be adopted.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
    expect(applyAssignment).not.toHaveBeenCalled();
  });

  it("renders group Apply results with shared targets, mappings, and pending workflow warnings", async () => {
    const applyAssignment = vi.fn().mockResolvedValue(createApplyResult(createGroupApplyJson()));
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyGroupApplyPreviewJson())),
      applyAssignment
    });
    renderApplyPreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));
    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to group repositories")
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(
      await screen.findByRole("heading", { name: "Group repository results" })
    ).toBeInTheDocument();
    expect(applyAssignment).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });
    expect(screen.getByText("Group repositories")).toBeInTheDocument();
    expect(screen.getByText("Student mappings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "27s2-csc1120-lab02-team-1" })).toHaveAttribute(
      "href",
      "https://github.com/csc1120/27s2-csc1120-lab02-team-1"
    );
    expect(screen.getAllByText("alpha, beta")).toHaveLength(2);
    expect(screen.queryByText(/alpha-gh/u)).toBeNull();
    expect(screen.getByText("grading_workflow_pending")).toBeInTheDocument();
    expect(screen.queryByText("Repository result rows")).toBeNull();
  });

  it("shows the no-manifest warning after a failed group Apply", async () => {
    const incompleteMessage =
      "Group Apply did not complete, so no manifest was written. Some group repositories may have been created before the failure. Graider will not adopt untracked repositories automatically. Delete any partial repositories manually or use a future reconcile workflow, then run Apply again.";
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyGroupApplyPreviewJson())),
      applyAssignment: vi.fn().mockResolvedValue(
        createApplyResult(
          createGroupApplyJson({
            status: "failure",
            exitCode: 1,
            diagnostics: [
              {
                code: "group_repository_untracked_collision",
                severity: "error",
                message:
                  "Repository 27s2-csc1120-lab02-team-2 already exists and Graider will not adopt untracked repositories automatically.",
                context: { groupId: "team-2", repositoryName: "27s2-csc1120-lab02-team-2" }
              },
              {
                code: "group_apply_manifest_not_written",
                severity: "warning",
                message: incompleteMessage
              }
            ],
            generatedFiles: [],
            summary: {
              repositoryMode: "group",
              targetCount: 2,
              studentMappingCount: 3,
              groupTargets: []
            }
          })
        )
      )
    });
    renderApplyPreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));
    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to group repositories")
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(await screen.findByText(incompleteMessage)).toBeInTheDocument();
    expect(
      screen.getAllByText(/will not adopt untracked repositories automatically/u)
    ).toHaveLength(2);
  });

  it("confirmed apply calls applyAssignment exactly once with assignment context", async () => {
    let resolveApply: (value: AssignmentApplyResult) => void = () => undefined;
    const applyAssignment = vi.fn(
      async () =>
        await new Promise<AssignmentApplyResult>((resolve) => {
          resolveApply = resolve;
        })
    );

    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyApplyPreviewJson())),
      applyAssignment
    });
    renderApplyPreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));
    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to student repositories")
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Applying..." }));

    expect(await screen.findByText("Applying assignment changes...")).toBeInTheDocument();
    expect(applyAssignment).toHaveBeenCalledTimes(1);
    expect(applyAssignment).toHaveBeenCalledWith({
      courseFolderId: SELECTION.courseFolderId,
      courseFolderPath: SELECTION.courseFolderPath,
      assignmentFile: SELECTION.assignmentFile
    });

    resolveApply(createApplyResult());

    expect(await screen.findByText("Apply Result Summary")).toBeInTheDocument();
    expect(applyAssignment).toHaveBeenCalledTimes(1);
  });

  it("renders success result summary, completed rows, and post-apply actions", async () => {
    const onBack = vi.fn();
    const onRefreshAssignmentDetail = vi.fn();
    const onBackToDashboard = vi.fn();

    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyApplyPreviewJson())),
      applyAssignment: vi.fn().mockResolvedValue(createApplyResult())
    });
    render(
      <ApplyPreviewPage
        selection={SELECTION}
        assignmentDetail={null}
        onBack={onBack}
        onRefreshAssignmentDetail={onRefreshAssignmentDetail}
        onBackToDashboard={onBackToDashboard}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));
    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to student repositories")
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(await screen.findByText("Apply Result Summary")).toBeInTheDocument();
    expect(screen.getAllByText("Created").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Updated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Would create").length).toBeGreaterThan(0);
    expect(screen.getAllByText("terms/27s1/manifests/lab02/manifest.yml").length).toBeGreaterThan(
      0
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh assignment detail" }));
    expect(onRefreshAssignmentDetail).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(onBackToDashboard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to assignment detail" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders partial success and failure diagnostics safely", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyApplyPreviewJson())),
      applyAssignment: vi.fn().mockResolvedValue(
        createApplyResult(
          createApplyJson({
            status: "partial_success",
            exitCode: 2,
            diagnostics: [
              {
                code: "github_api_error",
                severity: "error",
                message: "GitHub API failed without token ghp_secret_token",
                context: { authorization: "Bearer ghp_secret_token" }
              }
            ],
            summary: {
              created: 1,
              updated: 0,
              skipped: 0,
              failed: 1,
              blocked: 0,
              manifestFile: "terms/27s1/manifests/lab02/manifest.yml"
            }
          })
        )
      )
    });
    renderApplyPreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));
    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to student repositories")
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(await screen.findByText("Apply Result Summary")).toBeInTheDocument();
    expect(screen.getByText("Sensitive diagnostic details were redacted.")).toBeInTheDocument();
    expect(screen.getByText("[redacted]")).toBeInTheDocument();
    expect(screen.queryByText(/ghp_secret_token/u)).toBeNull();
  });

  it("renders missing CLI, invalid JSON, and thrown apply errors safely", async () => {
    mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyApplyPreviewJson())),
      applyAssignment: vi.fn().mockResolvedValue(
        createApplyResult(null, {
          status: "failure",
          error: {
            code: "invalid_assignment_apply_json",
            message: "Unexpected token",
            exitCode: 0,
            stdoutSnippet: "Authorization: Bearer secret-token-value",
            stderrSnippet: null
          }
        })
      )
    });
    renderApplyPreviewPage();

    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));
    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to student repositories")
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(await screen.findByText("Graider returned invalid apply JSON.")).toBeInTheDocument();
    expect(screen.queryByText(/Authorization/u)).toBeNull();
  });

  it("does not call unrelated mutation APIs", async () => {
    const graiderUI = mockGraiderUI({
      getAssignmentApplyPreview: vi
        .fn()
        .mockResolvedValue(createApplyPreviewResult(createReadyApplyPreviewJson())),
      applyAssignment: vi.fn().mockResolvedValue(createApplyResult())
    });

    renderApplyPreviewPage();
    fireEvent.click(await screen.findByRole("button", { name: "Review apply changes" }));
    fireEvent.click(
      screen.getByLabelText("I understand this will apply changes to student repositories")
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    expect(await screen.findByText("Apply Result Summary")).toBeInTheDocument();
    expect(graiderUI.getAssignmentDetail).not.toHaveBeenCalled();
    expect(graiderUI.refreshDashboard).not.toHaveBeenCalled();
    expect(graiderUI.refreshCourseFolder).not.toHaveBeenCalled();
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
