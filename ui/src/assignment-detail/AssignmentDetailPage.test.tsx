import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentDetailJsonResponse,
  AssignmentDetailResult,
  AssignmentGradeStatusJsonResponse,
  AssignmentGradeStatusResult,
  AssignmentRepositoryDownloadResult,
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

const createRepositoryDownloadResult = (
  overrides: Partial<AssignmentRepositoryDownloadResult> = {}
): AssignmentRepositoryDownloadResult => ({
  status: "success",
  destination: "/Users/sean/Downloads/lab02",
  repositoryMode: "individual",
  totalTargets: 2,
  clonedCount: 2,
  failedCount: 0,
  targets: [
    {
      targetId: "student-alpha",
      repositoryName: "27s1-csc1120-lab02-alpha",
      localPath: "/Users/sean/Downloads/lab02/27s1-csc1120-lab02-alpha",
      status: "cloned",
      studentIds: ["alpha"],
      githubUsernames: ["alpha-gh"],
      diagnostics: []
    },
    {
      targetId: "student-beta",
      repositoryName: "27s1-csc1120-lab02-beta",
      localPath: "/Users/sean/Downloads/lab02/27s1-csc1120-lab02-beta",
      status: "cloned",
      studentIds: ["beta"],
      githubUsernames: ["beta-gh"],
      diagnostics: []
    }
  ],
  diagnostics: [],
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

const createAccessPageResult = (overrides = {}) => ({
  schemaVersion: 1 as const,
  assignmentFile: ASSIGNMENT_FILE,
  termCode: "27s1",
  assignmentSlug: "lab02",
  outputPath: "terms/27s1/notifications/lab02/student-repositories.html",
  pagesRepository: "csc1120/csc1120pages",
  pagesRepositoryFolderSelected: true,
  pagesUrl:
    "https://graider-sandbox.github.io/csc1120/terms/27s1/notifications/lab02/student-repositories.html",
  generatedAt: null,
  exists: false,
  status: "partial" as const,
  summary: { activeStudents: 3, includedStudents: 2, skippedInactive: 1, missingRepository: 1 },
  rows: [],
  diagnostics: [{ message: "1 active student is missing a repository link." }],
  ...overrides
});

const createAccessPagePublishResult = (overrides = {}) => ({
  schemaVersion: 1 as const,
  assignmentFile: ASSIGNMENT_FILE,
  termCode: "27s1",
  assignmentSlug: "lab02",
  outputPath: "terms/27s1/notifications/lab02/student-repositories.html",
  pagesUrl:
    "https://graider-sandbox.github.io/csc1120/terms/27s1/notifications/lab02/student-repositories.html",
  status: "uncommitted" as const,
  checks: {
    pagesRepositoryFolderSelected: true,
    fileExists: true,
    isGitRepository: true,
    currentBranch: "main",
    hasUncommittedAccessPage: true,
    hasUncommittedOtherChanges: false,
    upstreamBranch: "origin/main",
    aheadCount: 0,
    behindCount: 0,
    pagesUrlAvailable: true,
    remoteMatchesConfiguredRepository: true
  },
  suggestedCommands: [
    "git add 'terms/27s1/notifications/lab02/student-repositories.html'",
    "git commit -m 'Add Lab 02 student repository access page'",
    "git push"
  ],
  diagnostics: [{ message: "The access page exists locally but has not been committed yet." }],
  ...overrides
});

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

describe("AssignmentDetailPage", () => {
  it("requires confirmation before deleting the local assignment and returns to the dashboard", async () => {
    const deleteAssignment = vi.fn().mockResolvedValue({
      status: "success",
      path: ASSIGNMENT_FILE,
      diagnostics: []
    });
    const onDeleted = vi.fn();
    mockGraiderUI({ deleteAssignment });
    renderAssignmentDetailPage({ onDeleted });

    fireEvent.click(await screen.findByRole("button", { name: "Delete assignment" }));
    expect(deleteAssignment).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Delete assignment" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByLabelText("I understand this deletes the local assignment configuration.")
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete assignment" }));

    await waitFor(() =>
      expect(deleteAssignment).toHaveBeenCalledWith({
        courseFolderId: SELECTION.courseFolderId,
        courseFolderPath: SELECTION.courseFolderPath,
        assignmentFile: ASSIGNMENT_FILE,
        confirmed: true
      })
    );
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("fetches and displays the grade workflow through the narrow API", async () => {
    const getTemplateWorkflow = vi.fn().mockResolvedValue({
      status: "success",
      repository: "graider-sandbox/csc1120L2Template",
      branch: "main",
      path: ".github/workflows/grade.yml",
      content: "name: Grade\n",
      diagnostics: []
    });
    mockGraiderUI({ getTemplateWorkflow });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "View workflow" }));
    await waitFor(() => expect(getTemplateWorkflow).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("Grade workflow draft")).toHaveValue("name: Grade\n");
    expect(screen.getByText(/Workflow changes are not saved/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save workflow|push workflow/u })).toBeNull();
  });

  it("shows and generates the student repository access page with a copyable Canvas link", async () => {
    const getStudentRepositoryAccessPageStatus = vi
      .fn()
      .mockResolvedValue(createAccessPageResult());
    const generateStudentRepositoryAccessPage = vi.fn().mockResolvedValue(
      createAccessPageResult({
        exists: true,
        status: "generated",
        generatedAt: "2027-01-15T12:00:00.000Z"
      })
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    mockGraiderUI({ getStudentRepositoryAccessPageStatus, generateStudentRepositoryAccessPage });
    renderAssignmentDetailPage();

    expect(
      await screen.findByRole("heading", { name: "Student repository access page" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("terms/27s1/notifications/lab02/student-repositories.html")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Canvas link" })).toBeInTheDocument();
    expect(screen.getByText(/GitHub Pages to be enabled/u)).toBeInTheDocument();
    expect(screen.getByText(/missing repository links/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy Canvas link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Generate student access page" }));
    await waitFor(() => expect(generateStudentRepositoryAccessPage).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: "Regenerate student access page" })
    ).toBeInTheDocument();
  });

  it("configures Student Access Pages from the access-page panel", async () => {
    const getStudentRepositoryAccessPageStatus = vi
      .fn()
      .mockResolvedValueOnce(
        createAccessPageResult({
          githubOrganization: "csc1120",
          pagesRepository: null,
          pagesBaseUrl: null,
          pagesBranch: null,
          pagesRepositoryFolderSelected: false,
          pagesUrl: null,
          status: "not_ready"
        })
      )
      .mockResolvedValue(createAccessPageResult());
    const getStudentRepositoryAccessPagePublishStatus = vi
      .fn()
      .mockResolvedValue(createAccessPagePublishResult());
    const selectStudentAccessPagesRepositoryFolder = vi.fn().mockResolvedValue({
      canceled: false,
      folderPath: "/tmp/csc1120pages"
    });
    const saveStudentAccessPagesConfig = vi.fn().mockResolvedValue({
      status: "success",
      changed: true,
      diagnostics: [
        {
          message:
            "Student Access Pages settings were saved locally. Commit and push course.yml manually when ready."
        }
      ]
    });
    mockGraiderUI({
      getStudentRepositoryAccessPageStatus,
      getStudentRepositoryAccessPagePublishStatus,
      selectStudentAccessPagesRepositoryFolder,
      saveStudentAccessPagesConfig
    });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Configure Student Access Pages" }));
    expect(screen.getByLabelText("Pages repository")).toHaveValue("csc1120/csc1120pages");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://csc1120.github.io/csc1120pages");
    expect(screen.getByLabelText("Branch")).toHaveValue("main");
    expect(screen.getByText("Not selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select Pages repository folder" }));
    await waitFor(() => expect(screen.getByText("/tmp/csc1120pages")).toBeInTheDocument());
    expect(selectStudentAccessPagesRepositoryFolder).toHaveBeenCalledWith(SELECTION.courseFolderId);
    fireEvent.click(screen.getByRole("button", { name: "Save Student Access Pages Settings" }));

    await waitFor(() =>
      expect(saveStudentAccessPagesConfig).toHaveBeenCalledWith({
        courseFolderId: SELECTION.courseFolderId,
        courseFolderPath: COURSE_FOLDER_PATH,
        repository: "csc1120/csc1120pages",
        baseUrl: "https://csc1120.github.io/csc1120pages",
        branch: "main"
      })
    );
    expect(getStudentRepositoryAccessPageStatus).toHaveBeenCalledTimes(3);
    expect(getStudentRepositoryAccessPagePublishStatus).toHaveBeenCalledTimes(3);
    expect(
      await screen.findByText(/Student Access Pages settings were saved locally/u)
    ).toBeInTheDocument();
  });

  it("reads saved Student Access Pages values into their matching fields", async () => {
    mockGraiderUI({
      getStudentRepositoryAccessPageStatus: vi.fn().mockResolvedValue(
        createAccessPageResult({
          githubOrganization: "csc1120",
          pagesRepository: "csc1120/csc1120pages",
          pagesBaseUrl: "https://pages.example.edu/course",
          pagesBranch: "published"
        })
      ),
      getStudentRepositoryAccessPagePublishStatus: vi
        .fn()
        .mockResolvedValue(createAccessPagePublishResult())
    });
    renderAssignmentDetailPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Student Access Pages Settings" })
    );

    expect(screen.getByLabelText("Pages repository")).toHaveValue("csc1120/csc1120pages");
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://pages.example.edu/course");
    expect(screen.getByLabelText("Branch")).toHaveValue("published");
  });

  it("configures group membership through the narrow assignment group settings API", async () => {
    const getAssignmentGroupConfig = vi.fn().mockResolvedValue({
      status: "ready",
      repositoryMode: "individual",
      groupsFile: "groups.csv",
      groupsCsv: "group_id,student_id\n",
      groupCount: 0,
      groupedStudentCount: 0,
      ungroupedActiveStudentCount: 2,
      diagnostics: []
    });
    const saveAssignmentGroupConfig = vi.fn().mockResolvedValue({
      status: "success",
      repositoryMode: "group",
      groupsFile: "groups.csv",
      groupsCsv: "group_id,student_id\nteam-1,s001\n",
      groupCount: 1,
      groupedStudentCount: 1,
      ungroupedActiveStudentCount: 1,
      diagnostics: [
        {
          message:
            "Group assignment settings were saved locally. Use Publish Course Changes to share them to the admin repo."
        }
      ]
    });
    mockGraiderUI({ getAssignmentGroupConfig, saveAssignmentGroupConfig });
    renderAssignmentDetailPage();

    expect(await screen.findByRole("heading", { name: "Repository mode" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Repository mode" }), {
      target: { value: "group" }
    });
    expect(screen.getByLabelText("Group membership CSV")).toBeInTheDocument();
    expect(screen.getByText(/Apply creates one shared repository per group/u)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Group membership CSV"), {
      target: { value: "group_id,student_id\nteam-1,s001\n" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save repository mode" }));
    await waitFor(() =>
      expect(saveAssignmentGroupConfig).toHaveBeenCalledWith({
        courseFolderId: SELECTION.courseFolderId,
        courseFolderPath: COURSE_FOLDER_PATH,
        assignmentFile: ASSIGNMENT_FILE,
        repositoryMode: "group",
        groupsCsv: "group_id,student_id\nteam-1,s001\n"
      })
    );
    expect(
      await screen.findByText(/Group assignment settings were saved locally/u)
    ).toBeInTheDocument();
  });

  it("shows local publish readiness and copy-only suggested git commands", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    mockGraiderUI({
      getStudentRepositoryAccessPageStatus: vi.fn().mockResolvedValue(createAccessPageResult()),
      getStudentRepositoryAccessPagePublishStatus: vi
        .fn()
        .mockResolvedValue(createAccessPagePublishResult())
    });
    renderAssignmentDetailPage();
    expect(await screen.findByRole("heading", { name: "Publish readiness" })).toBeInTheDocument();
    expect(screen.getByText(/has not been committed yet/u)).toBeInTheDocument();
    expect(
      screen.getByText(/git add 'terms\/27s1\/notifications\/lab02\/student-repositories.html'/u)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy commands" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /commit|push/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy commands" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it("confirms and publishes a generated student access page through the narrow API", async () => {
    const getStudentRepositoryAccessPageStatus = vi
      .fn()
      .mockResolvedValue(createAccessPageResult());
    const getStudentRepositoryAccessPagePublishStatus = vi
      .fn()
      .mockResolvedValue(createAccessPagePublishResult());
    const publishStudentRepositoryAccessPage = vi.fn().mockResolvedValue({
      status: "success",
      commitMessage: "Publish student access page for lab02",
      diagnostics: [{ message: "Student access page was committed and pushed." }]
    });
    mockGraiderUI({
      getStudentRepositoryAccessPageStatus,
      getStudentRepositoryAccessPagePublishStatus,
      publishStudentRepositoryAccessPage
    });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Publish Student Access Page" }));
    expect(await screen.findByText("Publish student access page for lab02")).toBeInTheDocument();
    expect(screen.getByText(/Graider does not check live GitHub Pages/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Student Access Page" }));

    await waitFor(() =>
      expect(publishStudentRepositoryAccessPage).toHaveBeenCalledWith({
        courseFolderId: SELECTION.courseFolderId,
        courseFolderPath: COURSE_FOLDER_PATH,
        assignmentFile: ASSIGNMENT_FILE
      })
    );
    expect(await screen.findByText(/committed and pushed/u)).toBeInTheDocument();
    expect(getStudentRepositoryAccessPageStatus).toHaveBeenCalledTimes(2);
    expect(getStudentRepositoryAccessPagePublishStatus).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "not generated",
      createAccessPagePublishResult({
        status: "not_generated",
        checks: { ...createAccessPagePublishResult().checks, fileExists: false },
        diagnostics: [
          { message: "Generate the student access page before publishing the Canvas link." }
        ]
      }),
      "Generate the student access page before publishing"
    ],
    [
      "unpushed",
      createAccessPagePublishResult({
        status: "unpushed",
        diagnostics: [
          {
            message:
              "The access page appears committed locally but has not been pushed to GitHub yet."
          }
        ]
      }),
      "has not been pushed to GitHub yet"
    ],
    [
      "no upstream",
      createAccessPagePublishResult({
        status: "no_upstream",
        diagnostics: [{ message: "This branch does not have an upstream branch configured." }]
      }),
      "does not have an upstream branch configured"
    ],
    [
      "ready",
      createAccessPagePublishResult({
        status: "ready_to_publish",
        diagnostics: [
          {
            message:
              "Local publishing checks look ready. Confirm GitHub Pages is enabled before posting the link in Canvas."
          }
        ]
      }),
      "Local publishing checks look ready"
    ]
  ])("shows the %s publish-readiness message", async (_name, publishResult, expectedText) => {
    mockGraiderUI({
      getStudentRepositoryAccessPagePublishStatus: vi.fn().mockResolvedValue(publishResult)
    });
    renderAssignmentDetailPage();
    expect(await screen.findByText(expectedText, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/GitHub Pages must be enabled and published/u)).toBeInTheDocument();
  });

  it("shows the missing GitHub Pages URL diagnostic without a Canvas copy action", async () => {
    mockGraiderUI({
      getStudentRepositoryAccessPageStatus: vi.fn().mockResolvedValue(
        createAccessPageResult({
          pagesUrl: null,
          status: "ready",
          summary: {
            activeStudents: 2,
            includedStudents: 2,
            skippedInactive: 0,
            missingRepository: 0
          }
        })
      )
    });
    renderAssignmentDetailPage();
    expect(await screen.findByText(/cannot determine the GitHub Pages URL/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Canvas link" })).toBeNull();
  });

  it("shows a blank draft when the workflow is missing", async () => {
    mockGraiderUI({
      getTemplateWorkflow: vi.fn().mockResolvedValue({
        status: "missing",
        repository: "graider-sandbox/csc1120L2Template",
        branch: "main",
        path: ".github/workflows/grade.yml",
        content: null,
        diagnostics: [
          {
            message:
              "No .github/workflows/grade.yml was found in the template repository on this branch."
          }
        ]
      })
    });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "View workflow" }));
    expect(await screen.findByText(/Start a workflow draft here/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Grade workflow draft")).toHaveValue("");
  });

  it("requires preview before a direct workflow push and invalidates it after editing", async () => {
    const previewTemplateWorkflowSave = vi.fn().mockResolvedValue({
      status: "ready",
      operation: "update",
      repository: "graider-sandbox/csc1120L2Template",
      branch: "main",
      path: ".github/workflows/grade.yml",
      commitMessage: "Update grading workflow for lab02",
      diagnostics: []
    });
    const saveTemplateWorkflow = vi.fn().mockResolvedValue({
      status: "success",
      operation: "update",
      repository: "graider-sandbox/csc1120L2Template",
      branch: "main",
      path: ".github/workflows/grade.yml",
      commitMessage: "Update grading workflow for lab02",
      diagnostics: [],
      commitSha: "commit-sha",
      commitUrl: null
    });
    mockGraiderUI({
      getTemplateWorkflow: vi.fn().mockResolvedValue({
        status: "success",
        repository: "graider-sandbox/csc1120L2Template",
        branch: "main",
        path: ".github/workflows/grade.yml",
        content: "name: Grade\n",
        sha: "workflow-sha",
        diagnostics: []
      }),
      previewTemplateWorkflowSave,
      saveTemplateWorkflow
    });
    renderAssignmentDetailPage();
    fireEvent.click(await screen.findByRole("button", { name: "View workflow" }));
    const draft = await screen.findByLabelText("Grade workflow draft");
    expect(screen.getByRole("button", { name: "Confirm push" })).toBeDisabled();
    fireEvent.change(draft, { target: { value: "name: Updated\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview save" }));
    await waitFor(() => expect(previewTemplateWorkflowSave).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Update grading workflow for lab02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm push" }));
    await waitFor(() => expect(saveTemplateWorkflow).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("commit-sha");
  });

  it("does not fetch a workflow when grading is disabled", async () => {
    const getTemplateWorkflow = vi.fn();
    mockGraiderUI({ getTemplateWorkflow });
    renderAssignmentDetailPage({
      initialLoadResult: createAssignmentDetailResult(
        createAssignmentDetailJson({
          grading: {
            enabled: false,
            mode: "no-grading",
            workflow: null,
            artifact: null,
            resultFile: null,
            workflowStatus: null,
            workflowDispatch: null
          }
        })
      )
    });

    expect(
      await screen.findByText("Grading or the template repository is not configured.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View workflow" })).toBeDisabled();
    expect(getTemplateWorkflow).not.toHaveBeenCalled();
  });

  it("renders the existing assignment panels with the repository list outside Advanced details", async () => {
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
    expect(summaryHeading.closest("details")).toBeNull();
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
    const advancedDetails = screen.getByText("Advanced details").closest("details");
    expect(advancedDetails).not.toContainElement(summary);
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
    expect(within(summary).getByText("Completed — success")).toHaveClass("status-chip--success");
    expect(within(summary).getByText("Completed — failure")).toHaveClass("status-chip--error");
    expect(within(summary).getByText("In progress")).toBeInTheDocument();
    expect(within(summary).getByText("Missing")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120-lab02-ada/actions/runs/123"
    );
    expect(within(summary).getByRole("link", { name: "csc1120-lab02-ada" })).toHaveAttribute(
      "href",
      "https://github.com/graider-sandbox/csc1120-lab02-ada"
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

  it("enables Generate report and opens the faculty report entry point with assignment context", async () => {
    const onViewFacultyReport = vi.fn();

    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });
    renderAssignmentDetailPage({ onViewFacultyReport });

    const reportButton = await screen.findByRole("button", { name: "Generate report" });
    expect(reportButton).toBeEnabled();
    expect(screen.getByText("Generate and view the faculty report.")).toBeInTheDocument();
    expect(screen.queryByText("Coming in a future slice")).toBeNull();

    fireEvent.click(reportButton);

    expect(onViewFacultyReport).toHaveBeenCalledWith(
      SELECTION,
      expect.objectContaining({
        assignment: expect.objectContaining({ slug: "lab02" })
      }),
      expect.objectContaining({
        courseFolderId: SELECTION.courseFolderId,
        courseFolderPath: SELECTION.courseFolderPath,
        assignmentFile: ASSIGNMENT_FILE
      })
    );
  });

  it("disables Generate report only when the faculty report context is incomplete", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(createAssignmentDetailResult())
    });
    renderAssignmentDetailPage({
      selection: { ...SELECTION, courseFolderPath: "" }
    });

    expect(await screen.findByRole("button", { name: "Generate report" })).toBeDisabled();
    expect(
      screen.getByText(
        "A course folder and assignment file are required to generate a faculty report."
      )
    ).toBeInTheDocument();
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

  it("opens the repository download folder picker and runs the fixed download command API", async () => {
    const selectRepositoryDownloadFolder = vi
      .fn()
      .mockResolvedValue({ canceled: false, folderPath: "/Users/sean/Downloads/lab02" });
    const downloadAssignmentRepositories = vi
      .fn()
      .mockResolvedValue(createRepositoryDownloadResult());
    mockGraiderUI({ selectRepositoryDownloadFolder, downloadAssignmentRepositories });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Download Student Repositories" }));

    await waitFor(() => expect(downloadAssignmentRepositories).toHaveBeenCalledTimes(1));
    expect(selectRepositoryDownloadFolder).toHaveBeenCalledTimes(1);
    expect(downloadAssignmentRepositories).toHaveBeenCalledWith({
      ...SELECTION,
      destination: "/Users/sean/Downloads/lab02"
    });
  });

  it("does nothing when the repository download folder picker is cancelled", async () => {
    const selectRepositoryDownloadFolder = vi
      .fn()
      .mockResolvedValue({ canceled: true, folderPath: null });
    const downloadAssignmentRepositories = vi.fn();
    mockGraiderUI({ selectRepositoryDownloadFolder, downloadAssignmentRepositories });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Download Student Repositories" }));

    await waitFor(() => expect(selectRepositoryDownloadFolder).toHaveBeenCalledTimes(1));
    expect(downloadAssignmentRepositories).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Repository download results")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows repository download busy state and individual target results", async () => {
    let resolveDownload: (value: AssignmentRepositoryDownloadResult) => void = () => undefined;
    const downloadAssignmentRepositories = vi.fn(
      async () =>
        await new Promise<AssignmentRepositoryDownloadResult>((resolve) => {
          resolveDownload = resolve;
        })
    );
    mockGraiderUI({
      selectRepositoryDownloadFolder: vi
        .fn()
        .mockResolvedValue({ canceled: false, folderPath: "/Users/sean/Downloads/lab02" }),
      downloadAssignmentRepositories
    });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Download Student Repositories" }));

    expect(
      await screen.findByRole("button", { name: "Downloading repositories..." })
    ).toBeDisabled();
    resolveDownload(createRepositoryDownloadResult());

    const results = await screen.findByLabelText("Repository download results");
    expect(within(results).getByText(/2 cloned, 0 failed of 2/u)).toBeInTheDocument();
    expect(
      within(results).getByText(/Destination:.*\/Users\/sean\/Downloads\/lab02/u)
    ).toBeInTheDocument();
    expect(within(results).getByText("27s1-csc1120-lab02-alpha")).toBeInTheDocument();
    expect(within(results).getByText("27s1-csc1120-lab02-beta")).toBeInTheDocument();
    expect(within(results).getByText("alpha")).toBeInTheDocument();
    expect(within(results).getByText(/\(alpha-gh\)/u)).toBeInTheDocument();
  });

  it("renders one shared group repository result with all group members", async () => {
    const groupResult = createRepositoryDownloadResult({
      repositoryMode: "group",
      totalTargets: 1,
      clonedCount: 1,
      targets: [
        {
          targetId: "team-1",
          groupId: "team-1",
          repositoryName: "27s1-csc1120-lab02-team-1",
          localPath: "/Users/sean/Downloads/lab02/27s1-csc1120-lab02-team-1",
          status: "cloned",
          studentIds: ["alpha", "beta"],
          githubUsernames: ["alpha-gh", "beta-gh"],
          diagnostics: []
        }
      ]
    });
    mockGraiderUI({
      selectRepositoryDownloadFolder: vi
        .fn()
        .mockResolvedValue({ canceled: false, folderPath: groupResult.destination }),
      downloadAssignmentRepositories: vi.fn().mockResolvedValue(groupResult)
    });
    renderAssignmentDetailPage();

    fireEvent.click(await screen.findByRole("button", { name: "Download Student Repositories" }));

    const results = await screen.findByLabelText("Repository download results");
    expect(within(results).getByText(/1 cloned, 0 failed of 1/u)).toBeInTheDocument();
    expect(within(results).getByText("27s1-csc1120-lab02-team-1")).toBeInTheDocument();
    expect(within(results).getByText(/\(team-1\)/u)).toBeInTheDocument();
    expect(within(results).getByText(/alpha, beta/u)).toBeInTheDocument();
    expect(within(results).getByText(/alpha-gh, beta-gh/u)).toBeInTheDocument();
    expect(within(results).getAllByRole("listitem")).toHaveLength(1);
  });

  it("keeps successful download rows visible and reports target and command failures safely", async () => {
    const partialFailure = createRepositoryDownloadResult({
      status: "partial_success",
      clonedCount: 1,
      failedCount: 1,
      targets: [
        createRepositoryDownloadResult().targets[0]!,
        {
          targetId: "student-beta",
          repositoryName: "27s1-csc1120-lab02-beta",
          localPath: "/Users/sean/Downloads/lab02/27s1-csc1120-lab02-beta",
          status: "failed",
          studentIds: ["beta"],
          githubUsernames: ["beta-gh"],
          diagnostics: [
            { message: "Destination folder already exists; Graider left it unchanged." }
          ]
        }
      ],
      diagnostics: [{ message: "One repository could not be downloaded." }]
    });
    const downloadAssignmentRepositories = vi
      .fn()
      .mockResolvedValueOnce(partialFailure)
      .mockRejectedValueOnce(new Error("command failure"));
    mockGraiderUI({
      selectRepositoryDownloadFolder: vi
        .fn()
        .mockResolvedValue({ canceled: false, folderPath: partialFailure.destination }),
      downloadAssignmentRepositories
    });
    renderAssignmentDetailPage();

    const button = await screen.findByRole("button", { name: "Download Student Repositories" });
    fireEvent.click(button);
    const results = await screen.findByLabelText("Repository download results");
    expect(within(results).getByText("27s1-csc1120-lab02-alpha")).toBeInTheDocument();
    expect(within(results).getByText("27s1-csc1120-lab02-beta")).toBeInTheDocument();
    expect(within(results).getByText(/Destination folder already exists/u)).toBeInTheDocument();
    expect(
      within(results).getByText(/One repository could not be downloaded/u)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Download Student Repositories" }));
    expect(await screen.findByText("Unable to download student repositories.")).toHaveAttribute(
      "role",
      "alert"
    );
    expect(screen.getByRole("button", { name: "Download Student Repositories" })).toBeEnabled();
    expect(screen.queryByText("command failure")).toBeNull();
  });
});
