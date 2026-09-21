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
      <button
        type="button"
        onClick={() =>
          onCanonicalSelectionChange?.({ file: "src/Main.java", startLine: 2, endLine: 5 })
        }
      >
        Select {studentId} range
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
  rubricCategoryId: "quality",
  sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
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

const defaultStudents = [
  { studentId: "ada", section: "001", gradingStatus: "in_progress" as const }
];

const setApis = ({
  students = defaultStudents,
  loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve(
      snapshot(
        studentId,
        students.find((entry) => entry.studentId === studentId)?.gradingStatus ?? "in_progress"
      )
    )
  ),
  markComplete = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve({ status: "success", studentId, gradingStatus: "complete" })
  ),
  repairGradingStudentWorkflow = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve({
      status: "ready",
      studentId,
      repositoryFullName: `trusted-org/lab1-${studentId}`
    })
  )
}: {
  students?: readonly { studentId: string; section: string; gradingStatus: GradingStatus }[];
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
      students
    }),
    loadGradingStudentSource: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
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
      })
    ),
    loadGradingStudentViewState: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        submissionCommitSha: "a".repeat(40),
        gradingStatus:
          students.find((entry) => entry.studentId === studentId)?.gradingStatus ?? "in_progress",
        viewState: null
      })
    ),
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
    render(<GradingWorkspacePage request={REQUEST} />);

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
    render(<GradingWorkspacePage request={REQUEST} />);

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
    render(<GradingWorkspacePage request={REQUEST} />);

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
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
    expect(screen.getByRole("button", { name: "Cancel adjustment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete applied comment?");
    assertNoDuplicateAccessibleNames();
  });

  it("opening the workflow-repair confirmation closes an open comment editor", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);

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
    render(<GradingWorkspacePage request={REQUEST} />);

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
    render(<GradingWorkspacePage request={REQUEST} />);

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
    expect(await screen.findByRole("status")).toHaveTextContent("Discarded the unsaved comment.");
    assertNoDuplicateAccessibleNames();
  });

  it("C, M, and Enter close whichever panel is open, exactly like their buttons", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);
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
    render(<GradingWorkspacePage request={REQUEST} />);

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
    render(<GradingWorkspacePage request={REQUEST} />);

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

const twoStudents = [
  { studentId: "ada", section: "001", gradingStatus: "in_progress" as const },
  { studentId: "grace", section: "002", gradingStatus: "in_progress" as const }
];

describe("GradingWorkspacePage sibling panel invariant — switching students", () => {
  it("pressing J while a comment draft is dirty prompts, and declining keeps the student and the draft", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Still typing" }
    });

    fireEvent.keyDown(window, { key: "j" });
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved comment?" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Discard the unsaved comment?" })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("Source for ada");
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Still typing");
    assertNoDuplicateAccessibleNames();
  });

  it("confirming the discard prompt while pressing J discards the draft and advances to the next student", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Still typing" }
    });

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.click(screen.getByRole("button", { name: "Discard comment" }));

    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("Source for grace");
    expect(screen.queryByRole("textbox", { name: "Comment" })).not.toBeInTheDocument();
  });

  it("pressing K while an adjustment draft is dirty prompts, and confirming discards and navigates back", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("Source for grace");

    fireEvent.click(screen.getByRole("button", { name: "Add adjustment" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "3" }
    });

    fireEvent.keyDown(window, { key: "k" });
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved adjustment?" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("Source for grace");

    fireEvent.click(screen.getByRole("button", { name: "Discard adjustment" }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("Source for ada");
  });

  it("clicking a different student row while a draft is dirty prompts instead of switching silently", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Still typing" }
    });

    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved comment?" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("Source for ada");

    fireEvent.click(screen.getByRole("button", { name: "Discard comment" }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("Source for grace");
    assertNoDuplicateAccessibleNames();
  });

  it("clicking the already-selected student row is a no-op and never prompts", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Still typing" }
    });

    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));
    expect(
      screen.queryByRole("dialog", { name: "Discard the unsaved comment?" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Still typing");
  });

  it("re-anchoring an edited comment to a different source range counts as an unsaved change", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    expect(screen.getByRole("radio", { name: "Source" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Select ada range" }));
    fireEvent.click(screen.getByRole("button", { name: "Use current selection" }));

    fireEvent.keyDown(window, { key: "j" });
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved comment?" })
    ).toBeInTheDocument();
  });

  it("changing the student filter does not touch the selected student or prompt for a dirty draft", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Draft" }
    });

    fireEvent.click(screen.getByRole("button", { name: /^All\b/u }));
    expect(
      screen.queryByRole("dialog", { name: "Discard the unsaved comment?" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Draft");
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("Source for ada");
  });
});
