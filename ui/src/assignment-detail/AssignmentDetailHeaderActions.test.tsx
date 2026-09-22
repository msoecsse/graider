import { fireEvent, render, screen, within } from "@testing-library/react";
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
  sections: ["001", "002"],
  roster: { sectionCount: 2, activeStudentCount: 5, totalStudentCount: 5 },
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
      ungroupedActiveStudentCount: 5,
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
      onPreviewApply={vi.fn()}
      onPreviewGrade={vi.fn()}
      onViewFacultyReport={vi.fn()}
      onViewGradeStatus={vi.fn()}
      {...props}
    />
  );

const openOverflowMenu = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: "More assignment actions" }));
};

const clickOverflowItem = async (label: string): Promise<void> => {
  await openOverflowMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(`^${label}`, "u") }));
};

const assertNoDuplicateAccessibleNames = (): void => {
  const buttons = screen.queryAllByRole("button");
  const menuitems = screen.queryAllByRole("menuitem");
  const names = [...buttons, ...menuitems].map((element) => {
    const label = element.getAttribute("aria-label");
    return (label ?? element.textContent ?? "").trim();
  });
  const seen = new Set<string>();
  const duplicates = names.filter((name) => {
    if (name === "") return false;
    if (seen.has(name)) return true;
    seen.add(name);
    return false;
  });
  expect(duplicates).toEqual([]);
};

describe("AssignmentDetailPage header actions", () => {
  it('shows "Apply to N students" when the assignment has not been applied', async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          createAssignmentDetailJson({
            applyState: { status: "not_applied" },
            roster: { sectionCount: 2, activeStudentCount: 5, totalStudentCount: 5 }
          })
        )
      )
    });
    renderAssignmentDetailPage();

    expect(await screen.findByRole("button", { name: "Apply to 5 students" })).toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it('shows "Continue grading" once the assignment has been applied', async () => {
    mockGraiderUI({
      getAssignmentDetail: vi
        .fn()
        .mockResolvedValue(
          createAssignmentDetailResult(
            createAssignmentDetailJson({ applyState: { status: "applied" } })
          )
        )
    });
    renderAssignmentDetailPage();

    expect(await screen.findByRole("button", { name: "Continue grading" })).toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it('treats "partially_applied" the same as applied: "Continue grading"', async () => {
    mockGraiderUI({
      getAssignmentDetail: vi
        .fn()
        .mockResolvedValue(
          createAssignmentDetailResult(
            createAssignmentDetailJson({ applyState: { status: "partially_applied" } })
          )
        )
    });
    renderAssignmentDetailPage();

    expect(await screen.findByRole("button", { name: "Continue grading" })).toBeInTheDocument();
  });

  it("shows the specific blocker fix, in the blocked style, when a readiness item needs attention", async () => {
    mockGraiderUI({
      getAssignmentDetail: vi.fn().mockResolvedValue(
        createAssignmentDetailResult(
          createAssignmentDetailJson({
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

    const fixButton = await screen.findByRole("button", { name: "Fix template repository" });
    expect(fixButton).toHaveClass("primary-action--blocked");
    // Blocked state takes precedence over apply state; clicking it reveals the
    // existing Readiness panel rather than opening apply or grading.
    fireEvent.click(fixButton);
    expect(screen.getByRole("heading", { level: 2, name: "Readiness" })).toHaveFocus();
    assertNoDuplicateAccessibleNames();
  });

  it("moves delete to the bottom of the overflow menu and requires typing the assignment name", async () => {
    const deleteAssignment = vi.fn().mockResolvedValue({
      status: "success",
      path: ASSIGNMENT_FILE,
      diagnostics: []
    });
    mockGraiderUI({ deleteAssignment });
    renderAssignmentDetailPage();
    await screen.findByRole("heading", { level: 1, name: "Lab 02" });

    await clickOverflowItem("Delete assignment");
    const dialog = screen.getByRole("dialog", { name: "Delete assignment?" });
    const confirmButton = within(dialog).getByRole("button", { name: "Delete assignment" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Wrong name" } });
    expect(confirmButton).toBeDisabled();
    expect(deleteAssignment).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Lab 02" } });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    await vi.waitFor(() => expect(deleteAssignment).toHaveBeenCalledTimes(1));
  });

  it("does not delete when the dialog is cancelled with the wrong name typed", async () => {
    const deleteAssignment = vi.fn();
    mockGraiderUI({ deleteAssignment });
    renderAssignmentDetailPage();
    await screen.findByRole("heading", { level: 1, name: "Lab 02" });

    await clickOverflowItem("Delete assignment");
    const dialog = screen.getByRole("dialog", { name: "Delete assignment?" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "not the name" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Delete assignment?" })).not.toBeInTheDocument();
    expect(deleteAssignment).not.toHaveBeenCalled();
  });

  it("keeps every action the deleted Available actions panel offered reachable from the overflow menu", async () => {
    const onEditAssignment = vi.fn();
    mockGraiderUI({});
    renderAssignmentDetailPage({ onEditAssignment });
    await screen.findByRole("heading", { level: 1, name: "Lab 02" });

    expect(screen.queryByRole("heading", { name: "Available actions" })).not.toBeInTheDocument();

    await openOverflowMenu();
    const menu = screen.getByRole("menu", { name: "More assignment actions" });
    for (const label of [
      "Edit assignment",
      "Group settings",
      "Student access page",
      "Apply to new students",
      "Download student repositories",
      "Regenerate grading workflow",
      "View grading status",
      "Faculty report",
      "Delete assignment"
    ]) {
      expect(
        within(menu).getByRole("menuitem", { name: new RegExp(`^${label}`, "u") })
      ).toBeInTheDocument();
    }

    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Edit assignment/u }));
    expect(onEditAssignment).toHaveBeenCalledTimes(1);
  });

  it("has no duplicate accessible names anywhere on the page, including with the overflow menu open", async () => {
    mockGraiderUI({});
    renderAssignmentDetailPage();
    await screen.findByRole("heading", { level: 1, name: "Lab 02" });
    assertNoDuplicateAccessibleNames();

    await openOverflowMenu();
    assertNoDuplicateAccessibleNames();
  });

  it("shows a quiet refresh icon button with a relative timestamp instead of a prominent Refresh button", async () => {
    mockGraiderUI({});
    renderAssignmentDetailPage();
    await screen.findByRole("heading", { level: 1, name: "Lab 02" });

    const refreshButton = await screen.findByRole("button", {
      name: "Refresh assignment detail"
    });
    expect(refreshButton).not.toHaveClass("primary-action");
    expect(screen.getByText(/Updated .* ago/u)).toBeInTheDocument();
  });
});
