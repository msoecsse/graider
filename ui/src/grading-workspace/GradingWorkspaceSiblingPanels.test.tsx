import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GradingWorkspacePrepareRequest } from "../../electron/ipc";

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({
    studentId,
    onCanonicalSelectionChange
  }: {
    studentId: string;
    onCanonicalSelectionChange?: (
      target: { file: string; startLine: number; endLine: number } | undefined
    ) => void;
  }) => (
    <div>
      <div data-testid="mock-monaco">Source for {studentId}</div>
      <button
        type="button"
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

const rubric = [{ id: "quality", name: "Code Quality", points: 10 }];

const appliedComment = {
  id: "applied-one",
  title: "Feedback",
  text: "Original feedback",
  deduction: 5,
  rubricCategoryId: "quality"
};

const manualAdjustment = {
  id: "adjustment-one",
  rubricCategoryId: "quality",
  amount: -1,
  note: "Late"
};

type GradingStatus = "not_started" | "in_progress" | "complete" | "published";

const snapshot = (studentId: string, gradingStatus: GradingStatus) => ({
  status: "success" as const,
  studentId,
  gradingStatus,
  appliedComments: [appliedComment],
  manualAdjustments: [manualAdjustment],
  grade: {
    pointsPossible: 10,
    totalScore: 4,
    categories: [
      {
        id: "quality",
        name: "Code Quality",
        pointsPossible: 10,
        score: 4,
        categorizedCommentAdjustmentTotal: -5,
        manualAdjustmentTotal: -1
      }
    ],
    uncategorizedCommentAdjustmentTotal: 0
  }
});

const setApis = ({
  gradingStatus = "in_progress" as GradingStatus,
  loadSnapshot = vi.fn().mockResolvedValue(snapshot("ada", gradingStatus)),
  markComplete = vi
    .fn()
    .mockResolvedValue({ status: "success", studentId: "ada", gradingStatus: "complete" }),
  repairGradingStudentWorkflow = vi.fn().mockResolvedValue({
    status: "ready",
    studentId: "ada",
    repositoryFullName: "trusted-org/lab1-ada"
  })
}: {
  gradingStatus?: GradingStatus;
  loadSnapshot?: ReturnType<typeof vi.fn>;
  markComplete?: ReturnType<typeof vi.fn>;
  repairGradingStudentWorkflow?: ReturnType<typeof vi.fn>;
} = {}) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: ["src/Main.java"],
      rubric,
      students: [{ studentId: "ada", section: "001", gradingStatus }]
    }),
    loadGradingStudentSource: vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      combinedText: "class ada {}",
      syntheticCombinedLines: [],
      sections: [
        {
          status: "found",
          file: "src/Main.java",
          sourceText: "class ada {}",
          sourceLineCount: 1,
          combinedStartLine: 1,
          combinedEndLine: 1,
          insertionLine: 1
        }
      ]
    }),
    loadGradingStudentViewState: vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      submissionCommitSha: "a".repeat(40),
      gradingStatus,
      viewState: null
    }),
    loadGradingStudentSnapshot: loadSnapshot,
    loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] }),
    addGradingStudentComment: vi.fn(),
    editGradingStudentComment: vi.fn(),
    deleteGradingStudentComment: vi.fn(),
    addGradingStudentManualAdjustment: vi.fn(),
    editGradingStudentManualAdjustment: vi.fn(),
    deleteGradingStudentManualAdjustment: vi.fn(),
    markGradingStudentComplete: markComplete,
    publishGradingStudentReport: vi.fn(),
    previewGradingStudentReport: vi.fn(),
    repairGradingStudentWorkflow,
    repairGradingAssignmentWorkflows: vi.fn(),
    bulkPublishGradingStudentReports: vi.fn().mockResolvedValue({ status: "success", results: [] })
  });
};

const assertNoDuplicateAccessibleNames = (): void => {
  const names = screen.getAllByRole("button").map((button) => {
    const label = button.getAttribute("aria-label");
    return (label ?? button.textContent ?? "").trim();
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

describe("GradingWorkspacePage sibling panel invariant", () => {
  it("opening the manual adjustment editor closes an open, unmodified comment editor", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByRole("button", { name: "Cancel comment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add adjustment" }));
    expect(screen.queryByRole("button", { name: "Cancel comment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel adjustment" })).toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it("opening the comment editor closes an open, unmodified manual adjustment editor", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
    expect(screen.getByRole("button", { name: "Cancel adjustment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel comment" })).toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it("opening the mark-complete confirmation closes an open comment editor", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByRole("button", { name: "Cancel comment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark Complete" }));
    expect(screen.queryByRole("button", { name: "Cancel comment" })).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Mark ada grading complete?");
    assertNoDuplicateAccessibleNames();
  });

  it("opening a delete-comment confirmation closes an open manual adjustment editor", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
    expect(screen.getByRole("button", { name: "Cancel adjustment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete applied comment?");
    assertNoDuplicateAccessibleNames();
  });

  it("opening the workflow-repair confirmation closes an open comment editor", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByRole("button", { name: "Cancel comment" })).toBeInTheDocument();

    const repairButton = await screen.findByRole("button", { name: "Replace workflow & run" });
    await waitFor(() => expect(repairButton).toBeEnabled());
    fireEvent.click(repairButton);
    expect(screen.queryByRole("button", { name: "Cancel comment" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Replace workflow and start grading run?" })
    ).toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it("declining the discard prompt keeps the dirty comment draft open and untouched", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "In-progress draft" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Add adjustment" }));
    const prompt = screen.getByRole("dialog", { name: "Discard the unsaved comment?" });
    expect(prompt).toBeInTheDocument();
    // Declining must be the built-in Cancel from the shared confirmation modal,
    // not a bespoke one — this is the "two instances of ConfirmationWithPreviewModal
    // can't coexist" guarantee the invariant is supposed to provide structurally.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Discard the unsaved comment?" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("In-progress draft");
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it("confirming the discard prompt discards the dirty draft and opens the requested panel", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "In-progress draft" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Add adjustment" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard comment" }));

    expect(
      screen.queryByRole("dialog", { name: "Discard the unsaved comment?" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Comment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel adjustment" })).toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it("C, M, and Enter close whichever panel is open, exactly like their buttons", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.keyDown(window, { key: "m" });
    expect(screen.getByRole("button", { name: "Cancel adjustment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.keyDown(window, { key: "c" });
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel comment" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Cancel comment" })).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Mark ada grading complete?");
    assertNoDuplicateAccessibleNames();
  });

  it("M and P route through the discard prompt instead of silently switching when the comment draft is dirty", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Typed but not saved" }
    });

    fireEvent.keyDown(window, { key: "m" });
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved comment?" })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Typed but not saved");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.keyDown(window, { key: "p" });
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved comment?" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Publish review" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Typed but not saved");

    fireEvent.click(screen.getByRole("button", { name: "Discard comment" }));
    expect(await screen.findByRole("heading", { name: "Publish review" })).toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
  });

  it("regression: forcing two panels open in sequence never leaves duplicate-named controls mounted", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit comment: Original feedback" }));
    assertNoDuplicateAccessibleNames();

    fireEvent.click(screen.getByRole("button", { name: "Delete adjustment: quality" }));
    assertNoDuplicateAccessibleNames();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete manual adjustment?");

    fireEvent.click(screen.getByRole("button", { name: "Cancel deleting adjustment" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Complete" }));
    assertNoDuplicateAccessibleNames();

    fireEvent.click(screen.getByRole("button", { name: "Cancel marking complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit adjustment: quality" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "9" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    // The edit is dirty, so the delete confirmation must not have opened yet.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    assertNoDuplicateAccessibleNames();

    fireEvent.click(screen.getByRole("button", { name: "Discard adjustment" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete applied comment?");
    assertNoDuplicateAccessibleNames();
  });
});
