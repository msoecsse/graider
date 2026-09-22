import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  GradingStudentEvidenceResult,
  GradingWorkspacePrepareRequest
} from "../../electron/ipc";

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({
    studentId,
    onCanonicalSelectionChange
  }: {
    readonly studentId: string;
    readonly onCanonicalSelectionChange?: (
      target: { file: string; startLine: number; endLine: number } | undefined
    ) => void;
  }) => (
    <div className="grading-source-editor">
      <textarea aria-label="Mock Monaco keyboard target" readOnly />
      <div data-testid="mock-monaco">Source for {studentId}</div>
      <button
        onClick={() =>
          onCanonicalSelectionChange?.({ file: "src/Main.java", startLine: 1, endLine: 1 })
        }
      >
        Select {studentId} line
      </button>
    </div>
  )
}));

import { GradingWorkspacePage } from "./GradingWorkspacePage";

const REQUEST: GradingWorkspacePrepareRequest = {
  courseFolderId: "course-1",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1"
};

interface WorkspaceStudent {
  readonly studentId: string;
  readonly section: string;
  readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
}

const students: readonly WorkspaceStudent[] = [
  { studentId: "ada", section: "001", gradingStatus: "not_started" },
  { studentId: "grace", section: "002", gradingStatus: "in_progress" }
];

const mixedStudents: readonly WorkspaceStudent[] = [
  { studentId: "ada", section: "001", gradingStatus: "not_started" },
  { studentId: "bea", section: "001", gradingStatus: "complete" },
  { studentId: "cy", section: "002", gradingStatus: "complete" },
  { studentId: "dan", section: "002", gradingStatus: "published" },
  { studentId: "eve", section: "003", gradingStatus: "published" },
  { studentId: "frank", section: "003", gradingStatus: "in_progress" }
];

const source = (studentId: string) => ({
  status: "success",
  studentId,
  combinedText: `class ${studentId} {}`,
  syntheticCombinedLines: [],
  sections: [
    {
      status: "found",
      file: "src/Main.java",
      sourceText: `class ${studentId} {}`,
      sourceLineCount: 1,
      combinedStartLine: 1,
      combinedEndLine: 1,
      insertionLine: 1
    }
  ]
});

const snapshot = (
  studentId: string,
  gradingStatus: "not_started" | "in_progress" | "complete" | "published" = "not_started"
) => ({
  status: "success" as const,
  studentId,
  gradingStatus,
  appliedComments: [],
  manualAdjustments: [],
  grade: {
    pointsPossible: 100,
    totalScore: 100,
    categories: [],
    uncategorizedCommentAdjustmentTotal: 0
  }
});

const evidenceWithFailures = (
  studentId: string
): Extract<GradingStudentEvidenceResult, { readonly status: "success" }> => ({
  status: "success",
  studentId,
  submissionCommitSha: "0123456789abcdef0123456789abcdef01234567",
  runId: 10,
  runAttempt: 1,
  evidence: {
    metadata: {
      schemaVersion: 1,
      submissionCommitSha: "0123456789abcdef0123456789abcdef01234567",
      workflowRunId: "10",
      workflowRunAttempt: "1",
      compile: { outcome: "success" },
      junit: { outcome: "failure" },
      checkstyle: { outcome: "success" }
    },
    junit: {
      available: true,
      outcome: "failure",
      summary: { total: 2, passed: 0, failed: 1, errors: 1, skipped: 0 },
      failures: [
        { name: "first failure", kind: "failure", message: "boom" },
        { name: "second failure", kind: "error", message: "kaboom" }
      ]
    },
    checkstyle: { available: true, outcome: "success", violationCount: 0, violations: [] }
  }
});

const setApis = ({
  workspaceStudents = students,
  loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve(
      snapshot(
        studentId,
        workspaceStudents.find((student) => student.studentId === studentId)?.gradingStatus ??
          "not_started"
      )
    )
  ),
  loadEvidence = vi.fn().mockResolvedValue({ status: "not_applicable", studentId: "ada" }),
  loadCommitHistory = vi.fn().mockResolvedValue({
    status: "success",
    studentId: "ada",
    submissionCommitSha: "a".repeat(40),
    commits: [{ sha: "a".repeat(40), committedAt: "2026-09-11T10:00:00-05:00", message: "Commit" }]
  }),
  loadCommentLibrary = vi.fn().mockResolvedValue({ status: "success", comments: [] }),
  rubric = [] as { readonly id: string; readonly name: string; readonly points: number }[],
  addComment = vi.fn().mockResolvedValue({
    status: "success",
    studentId: "ada",
    gradingStatus: "in_progress",
    appliedComments: []
  }),
  markComplete = vi.fn().mockResolvedValue({
    status: "success",
    studentId: "ada",
    gradingStatus: "complete"
  }),
  publishReport = vi.fn().mockResolvedValue({
    status: "success",
    studentId: "ada",
    gradingStatus: "published",
    reportPath: "grading/report.html",
    remoteWrite: "created_or_updated",
    warnings: []
  })
}: {
  readonly loadSnapshot?: ReturnType<typeof vi.fn>;
  readonly loadEvidence?: ReturnType<typeof vi.fn>;
  readonly loadCommitHistory?: ReturnType<typeof vi.fn>;
  readonly loadCommentLibrary?: ReturnType<typeof vi.fn>;
  readonly rubric?: { readonly id: string; readonly name: string; readonly points: number }[];
  readonly addComment?: ReturnType<typeof vi.fn>;
  readonly markComplete?: ReturnType<typeof vi.fn>;
  readonly publishReport?: ReturnType<typeof vi.fn>;
  readonly workspaceStudents?: readonly WorkspaceStudent[];
} = {}) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: ["src/Main.java"],
      rubric,
      students: workspaceStudents
    }),
    loadGradingStudentSource: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve(source(studentId))
    ),
    loadGradingStudentViewState: vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      submissionCommitSha: "a".repeat(40),
      gradingStatus: "not_started",
      viewState: null
    }),
    loadGradingStudentSnapshot: loadSnapshot,
    loadGradingStudentEvidence: loadEvidence,
    loadGradingStudentCommitHistory: loadCommitHistory,
    loadGradingCommentLibrary: loadCommentLibrary,
    addGradingStudentComment: addComment,
    markGradingStudentComplete: markComplete,
    publishGradingStudentReport: publishReport,
    previewGradingStudentReport: vi.fn()
  });
};

describe("GradingWorkspacePage keyboard shortcuts", () => {
  it("moves to the next ungraded student with J and back with K", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada");

    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace"));

    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada"));
  });

  it("keeps J and K in the To grade filter and wraps at both ends", async () => {
    setApis({ workspaceStudents: mixedStudents });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("frank"));
    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada"));
    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("frank"));
  });

  it("keeps J and K in the Graded filter and wraps at both ends", async () => {
    setApis({ workspaceStudents: mixedStudents });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Graded 2" }));

    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("bea"));
    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("cy"));
    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("bea"));
    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("cy"));
  });

  it("keeps J and K in Published and All filters", async () => {
    setApis({ workspaceStudents: mixedStudents });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Published 2" }));

    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("dan"));
    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("eve"));

    fireEvent.click(screen.getByRole("button", { name: "All 6" }));
    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("frank"));
    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada"));
    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("frank"));
  });

  it("selects the filter edge when the current student is not visible", async () => {
    setApis({ workspaceStudents: mixedStudents });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Graded 2" }));

    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("bea"));

    fireEvent.click(screen.getByRole("button", { name: "To grade 2" }));
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/ }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada"));
    fireEvent.click(screen.getByRole("button", { name: "Graded 2" }));
    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("cy"));
  });

  it("does nothing when the active filter is empty", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Published 0" }));

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "k" });
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada");
  });

  it("uses Shift+J to navigate the full roster regardless of the active filter", async () => {
    setApis({ workspaceStudents: mixedStudents });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Graded 2" }));
    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("bea"));
    fireEvent.keyDown(window, { key: "J", shiftKey: true });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("cy"));
    fireEvent.keyDown(window, { key: "J", shiftKey: true });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("dan"));

    fireEvent.click(screen.getByRole("button", { name: "All 6" }));
    fireEvent.click(screen.getByRole("button", { name: /frank · Section 003/ }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("frank"));
    fireEvent.click(screen.getByRole("button", { name: "Graded 2" }));
    fireEvent.keyDown(window, { key: "J", shiftKey: true });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada"));
  });

  it("ignores shortcuts while focus is in a text field", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search comments" }), {
      target: { value: "j" }
    });
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search comments" }), { key: "j" });
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada");
  });

  it("Enter opens the mark-complete confirmation, then confirms it and advances to the next ungraded student", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "Enter" });
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Mark ada grading complete?");

    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace"));
  });

  it("P opens the publish review screen, showing the completed student as ready to publish", async () => {
    const loadSnapshot = vi.fn().mockResolvedValue(snapshot("ada", "complete"));
    setApis({ loadSnapshot });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "p" });
    expect(await screen.findByRole("heading", { name: "Publish review" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select ada to publish" })).toBeChecked();
  });

  it("Escape cancels the publish review and returns to the grading grid", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "p" });
    expect(await screen.findByRole("heading", { name: "Publish review" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Publish review" })).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("mock-monaco")).toBeInTheDocument();
  });

  it("suspends grading shortcuts while the publish review is open", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "p" });
    await screen.findByRole("heading", { name: "Publish review" });

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Publish review" })).toBeInTheDocument();
  });

  it("C opens the add-comment editor once a source line is selected", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "c" });
    expect(screen.queryByRole("form", { name: "Add comment" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.keyDown(window, { key: "c" });
    expect(await screen.findByRole("form", { name: "Add comment" })).toBeInTheDocument();
  });

  it("keeps shortcuts active in the read-only source editor", async () => {
    const loadCommentLibrary = vi.fn().mockResolvedValue({
      status: "success",
      comments: [
        { id: "one", title: "First comment", text: "Feedback one", defaultDeduction: -1, tags: [] }
      ]
    });
    setApis({
      loadCommentLibrary,
      loadEvidence: vi.fn().mockResolvedValue(evidenceWithFailures("ada"))
    });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    const sourceKeyboardTarget = screen.getByRole("textbox", {
      name: "Mock Monaco keyboard target"
    });

    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    sourceKeyboardTarget.focus();
    fireEvent.keyDown(sourceKeyboardTarget, { key: "c" });
    expect(await screen.findByRole("form", { name: "Add comment" })).toHaveTextContent(
      "Source target: src/Main.java: 1"
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel comment" }));
    sourceKeyboardTarget.focus();
    fireEvent.keyDown(sourceKeyboardTarget, { key: "a" });
    expect(await screen.findByText("Automated Checks")).toBeInTheDocument();

    sourceKeyboardTarget.focus();
    fireEvent.keyDown(sourceKeyboardTarget, { key: "h" });
    expect(await screen.findByText("Commit History")).toHaveFocus();

    sourceKeyboardTarget.focus();
    fireEvent.keyDown(sourceKeyboardTarget, { key: "j" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace"));

    const nextSourceKeyboardTarget = screen.getByRole("textbox", {
      name: "Mock Monaco keyboard target"
    });
    nextSourceKeyboardTarget.focus();
    fireEvent.keyDown(nextSourceKeyboardTarget, { key: "k" });
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada"));
  });

  it("allows reusable-comment shortcuts from the read-only source editor", async () => {
    const loadCommentLibrary = vi.fn().mockResolvedValue({
      status: "success",
      comments: [
        { id: "one", title: "First comment", text: "Feedback one", defaultDeduction: -1, tags: [] }
      ]
    });
    setApis({ loadCommentLibrary });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByText("First comment");
    await screen.findByTestId("mock-monaco");
    const sourceKeyboardTarget = screen.getByRole("textbox", {
      name: "Mock Monaco keyboard target"
    });

    sourceKeyboardTarget.focus();
    fireEvent.keyDown(sourceKeyboardTarget, { key: "1" });

    expect(await screen.findByRole("form", { name: "Apply First comment" })).toBeInTheDocument();
  });

  it("suppresses shortcuts in comment editing controls", async () => {
    const loadEvidence = vi.fn().mockResolvedValue(evidenceWithFailures("ada"));
    setApis({ loadEvidence, rubric: [{ id: "quality", name: "Code Quality", points: 100 }] });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.keyDown(window, { key: "c" });
    await screen.findByRole("form", { name: "Add comment" });
    await waitFor(() => expect(loadEvidence).toHaveBeenCalledTimes(1));

    const title = screen.getByRole("textbox", { name: "Title" });
    const comment = screen.getByRole("textbox", { name: "Comment" });
    const deduction = screen.getByRole("spinbutton", { name: "Deduction" });
    const category = screen.getByRole("combobox", { name: "Comment rubric category" });
    fireEvent.change(title, { target: { value: "j" } });
    fireEvent.keyDown(title, { key: "j" });
    fireEvent.change(comment, { target: { value: "Needs a clearer justification" } });
    fireEvent.keyDown(comment, { key: "a" });
    fireEvent.change(deduction, { target: { value: "1" } });
    fireEvent.keyDown(deduction, { key: "p" });
    fireEvent.keyDown(category, { key: "1" });

    expect(title).toHaveValue("j");
    expect(comment).toHaveValue("Needs a clearer justification");
    expect(deduction).toHaveValue(1);
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada");
    expect(loadEvidence).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Publish review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Apply First comment" })).not.toBeInTheDocument();
  });

  it("does not consume modifier shortcuts from the source editor", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    const sourceKeyboardTarget = screen.getByRole("textbox", {
      name: "Mock Monaco keyboard target"
    });

    const event = fireEvent.keyDown(sourceKeyboardTarget, { key: "c", ctrlKey: true });

    expect(event).toBe(true);
    expect(screen.queryByRole("form", { name: "Add comment" })).not.toBeInTheDocument();
  });

  it("M opens the add-adjustment editor when a rubric is configured", async () => {
    setApis({ rubric: [{ id: "quality", name: "Code Quality", points: 100 }] });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "m" });
    expect(await screen.findByRole("form", { name: "Add manual adjustment" })).toBeInTheDocument();
  });

  it("applies a reusable comment by its position with a digit key", async () => {
    const loadCommentLibrary = vi.fn().mockResolvedValue({
      status: "success",
      comments: [
        { id: "one", title: "First comment", text: "Feedback one", defaultDeduction: -1, tags: [] },
        { id: "two", title: "Second comment", text: "Feedback two", defaultDeduction: -2, tags: [] }
      ]
    });
    setApis({ loadCommentLibrary });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByText("First comment");

    fireEvent.keyDown(window, { key: "2" });
    expect(await screen.findByRole("form", { name: "Apply Second comment" })).toBeInTheDocument();
  });

  it("A opens and focuses the automated checks panel, and pressing A again returns focus", async () => {
    setApis({ loadEvidence: vi.fn().mockResolvedValue(evidenceWithFailures("ada")) });
    render(<GradingWorkspacePage request={REQUEST} />);
    const filterButton = await screen.findByRole("button", { name: "To grade 2" });
    filterButton.focus();
    expect(filterButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "a" });
    const summary = (await screen.findByText("Automated Checks")).closest("summary");
    expect(summary).toHaveFocus();

    fireEvent.keyDown(window, { key: "a" });
    expect(filterButton).toHaveFocus();
  });

  it("says evidence is still loading instead of focusing an empty panel", async () => {
    const pendingEvidence = new Promise<GradingStudentEvidenceResult>(() => {});
    setApis({ loadEvidence: vi.fn().mockReturnValue(pendingEvidence) });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "a" });
    const loadingMessage = await screen.findByText("Loading automated checks for ada…");
    expect(loadingMessage).toHaveFocus();
  });

  it("R reloads automated checks while the panel has focus", async () => {
    const loadEvidence = vi.fn().mockResolvedValue(evidenceWithFailures("ada"));
    setApis({ loadEvidence });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    await waitFor(() => expect(loadEvidence).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: "a" });
    const summary = (await screen.findByText("Automated Checks")).closest("summary");
    fireEvent.keyDown(summary as HTMLElement, { key: "r" });
    await waitFor(() => expect(loadEvidence).toHaveBeenCalledTimes(2));
  });

  it("N and Shift+N step focus between JUnit failures", async () => {
    setApis({ loadEvidence: vi.fn().mockResolvedValue(evidenceWithFailures("ada")) });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "a" });
    const panelSummary = (await screen.findByText("Automated Checks")).closest(
      "summary"
    ) as HTMLElement;

    fireEvent.keyDown(panelSummary, { key: "n" });
    const first = await screen.findByText("first failure");
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "n" });
    const second = await screen.findByText("second failure");
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: "n" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "n", shiftKey: true });
    expect(second).toHaveFocus();
  });

  it("H opens the panel and focuses commit history", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "h" });
    expect(await screen.findByText("Commit History")).toHaveFocus();
  });

  it("Escape closes an open delete-comment confirmation", async () => {
    const loadSnapshot = vi.fn().mockResolvedValue({
      ...snapshot("ada", "in_progress"),
      appliedComments: [{ id: "applied", text: "Existing feedback", deduction: -1 }]
    });
    setApis({ loadSnapshot });
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete comment: Existing feedback" })
    );
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("opens the shortcut cheat sheet with ? and closes it with Escape", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "?" });
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument()
    );
  });

  it("focuses the active filter pill with /", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByRole("button", { name: "To grade 2" })).toHaveFocus();
  });

  it("shows a persistent hint bar with the six most useful shortcuts and a save indicator", async () => {
    setApis({});
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    const hints = screen.getByRole("list", { name: "Keyboard shortcut hints" });
    expect(hints).toHaveTextContent("J Next in filter");
    expect(hints).toHaveTextContent("K Previous");
    expect(hints).toHaveTextContent("C Comment");
    expect(hints).toHaveTextContent("A Checks");
    expect(hints).toHaveTextContent("⏎ Complete");
    expect(hints).toHaveTextContent("? All shortcuts");
    expect(screen.getByText("Saved automatically")).toBeInTheDocument();
  });
});
