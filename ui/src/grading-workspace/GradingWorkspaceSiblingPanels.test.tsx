import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GradingWorkspacePrepareRequest } from "../../electron/ipc";

type SourceTarget = { file: string; startLine: number; endLine: number };
let updateCanonicalSelection: ((target: SourceTarget | undefined) => void) | undefined;

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({
    studentId,
    onCanonicalSelectionChange
  }: {
    studentId: string;
    onCanonicalSelectionChange?: (target: SourceTarget | undefined) => void;
  }) => {
    updateCanonicalSelection = onCanonicalSelectionChange;
    return (
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
    );
  }
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
  students = defaultStudents
}: {
  students?: readonly { studentId: string; section: string; gradingStatus: GradingStatus }[];
} = {}) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: ["src/Main.java"],
      rubric,
      students
    }),
    loadGradingStudentSource: vi.fn(({ studentId }: { studentId: string }) => {
      const sourceText = [`class ${studentId} {`, "  void run() {", "    work();", "  }", "}"].join(
        "\n"
      );
      const sourceLineCount = sourceText.split("\n").length;
      return Promise.resolve({
        status: "success",
        studentId,
        combinedText: sourceText,
        syntheticCombinedLines: [],
        sections: [
          {
            status: "found",
            file: "src/Main.java",
            sourceText,
            sourceLineCount,
            combinedStartLine: 1,
            combinedEndLine: sourceLineCount,
            insertionLine: 1
          }
        ]
      });
    }),
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
    loadGradingStudentSnapshot: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve(
        snapshot(
          studentId,
          students.find((entry) => entry.studentId === studentId)?.gradingStatus ?? "in_progress"
        )
      )
    ),
    loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] }),
    addGradingStudentComment: vi.fn(),
    editGradingStudentComment: vi.fn(),
    deleteGradingStudentComment: vi.fn(),
    addGradingStudentManualAdjustment: vi.fn(),
    editGradingStudentManualAdjustment: vi.fn(),
    deleteGradingStudentManualAdjustment: vi.fn(),
    markGradingStudentComplete: vi.fn(),
    publishGradingStudentReport: vi.fn(),
    previewGradingStudentReport: vi.fn(),
    repairGradingStudentWorkflow: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "ready",
        studentId,
        repositoryFullName: `trusted-org/lab1-${studentId}`
      })
    ),
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

const twoStudents = [
  { studentId: "ada", section: "001", gradingStatus: "in_progress" as const },
  { studentId: "grace", section: "002", gradingStatus: "in_progress" as const }
];

const expectNoGradingMutations = (): void => {
  for (const mutation of [
    window.graiderUI.addGradingStudentComment,
    window.graiderUI.editGradingStudentComment,
    window.graiderUI.deleteGradingStudentComment,
    window.graiderUI.addGradingStudentManualAdjustment,
    window.graiderUI.editGradingStudentManualAdjustment,
    window.graiderUI.deleteGradingStudentManualAdjustment,
    window.graiderUI.markGradingStudentComplete,
    window.graiderUI.publishGradingStudentReport,
    window.graiderUI.bulkPublishGradingStudentReports
  ]) {
    expect(mutation).not.toHaveBeenCalled();
  }
  // Workflow readiness uses the same API with confirmed: false on selection.
  expect(window.graiderUI.repairGradingStudentWorkflow).not.toHaveBeenCalledWith(
    expect.objectContaining({ confirmed: true })
  );
};

// The comment workspace replaces the grading grid. Its hidden student rows and
// sibling controls must not be clicked to reproduce the pre-ITEM-50 tests.
// Draft protection still applies when leaving it or replacing an adjustment.
describe("GradingWorkspacePage current editor draft guards", () => {
  it.each(["Back to grading", "Cancel comment", "Escape"])(
    "%s protects a comment draft on cancel and discards only on confirmation",
    async (exit) => {
      setApis({ students: twoStudents });
      render(<GradingWorkspacePage request={REQUEST} />);
      fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
      fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
        target: { value: "In-progress draft" }
      });
      const leaveEditor = (): void => {
        if (exit === "Escape") fireEvent.keyDown(window, { key: "Escape" });
        else fireEvent.click(screen.getByRole("button", { name: exit }));
      };
      leaveEditor();
      expect(
        screen.getByRole("dialog", { name: "Discard the unsaved comment?" })
      ).toBeInTheDocument();
      assertNoDuplicateAccessibleNames();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Comments · ada" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("In-progress draft");
      expectNoGradingMutations();

      leaveEditor();
      fireEvent.click(screen.getByRole("button", { name: "Discard comment" }));
      expect(
        await screen.findByRole("heading", { name: "Manual adjustments" })
      ).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Comment" })).not.toBeInTheDocument();
      expect(screen.getByTestId("mock-monaco")).toHaveTextContent("Source for ada");
      expect(screen.getByRole("status")).toHaveTextContent("Discarded the unsaved comment.");
      expectNoGradingMutations();
      assertNoDuplicateAccessibleNames();
    }
  );

  it.each(["j", "k", "c", "m", "Enter", "p"])(
    "suppresses %s during comment takeover and preserves the student and dirty draft",
    async (key) => {
      setApis({ students: twoStudents });
      render(<GradingWorkspacePage request={REQUEST} />);
      fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
      fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
        target: { value: "Still typing" }
      });
      fireEvent.keyDown(window, { key });
      expect(screen.getByRole("heading", { name: "Comments · ada" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Still typing");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Publish review" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /grace · Section 002/u })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add adjustment" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark Complete" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Delete comment: Original feedback" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Replace Graider workflow…" })
      ).not.toBeInTheDocument();
      expectNoGradingMutations();
      assertNoDuplicateAccessibleNames();
    }
  );

  it("opening the comment editor closes an unmodified adjustment editor", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByRole("button", { name: "Cancel comment" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to grading" }));
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    assertNoDuplicateAccessibleNames();
    expectNoGradingMutations();
  });

  it("protects a dirty adjustment before opening a comment editor by shortcut", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "9" }
    });
    fireEvent.keyDown(window, { key: "c" });
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved adjustment?" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("spinbutton", { name: "Amount" })).toHaveValue(9);
    expect(screen.queryByRole("textbox", { name: "Comment" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.click(screen.getByRole("button", { name: "Discard adjustment" }));
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Back to grading" }));
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    expectNoGradingMutations();
    assertNoDuplicateAccessibleNames();
  });

  it("opening delete-comment confirmation closes a clean adjustment and cancel does not mutate", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete applied comment?");
    assertNoDuplicateAccessibleNames();
    fireEvent.click(screen.getByRole("button", { name: "Cancel deleting comment" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Original feedback")).toBeInTheDocument();
    expectNoGradingMutations();
  });

  it("keeps sequential confirmations exclusive and protects an edited adjustment before delete", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete adjustment: quality" }));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Mark ada grading complete?");
    assertNoDuplicateAccessibleNames();
    fireEvent.click(screen.getByRole("button", { name: "Cancel marking complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit adjustment: quality" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "9" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    assertNoDuplicateAccessibleNames();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("spinbutton", { name: "Amount" })).toHaveValue(9);
    expect(screen.getByRole("textbox", { name: "Note (optional)" })).toHaveValue("Late");
    expectNoGradingMutations();
    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard adjustment" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    assertNoDuplicateAccessibleNames();
    fireEvent.click(screen.getByRole("button", { name: "Cancel deleting comment" }));
    expectNoGradingMutations();
  });

  it.each(["j", "k", "student row"])(
    "%s protects an adjustment draft on cancel and navigates only after discard",
    async (navigation) => {
      setApis({ students: twoStudents });
      render(<GradingWorkspacePage request={REQUEST} />);
      await screen.findByTestId("mock-monaco");
      const origin = navigation === "k" ? "grace" : "ada";
      const destination = navigation === "k" ? "ada" : "grace";
      if (origin === "grace")
        fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
      await waitFor(() =>
        expect(screen.getByTestId("mock-monaco")).toHaveTextContent(`Source for ${origin}`)
      );
      fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
      fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
        target: { value: "3" }
      });
      const navigate = (): void => {
        if (navigation === "student row")
          fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
        else fireEvent.keyDown(window, { key: navigation });
      };
      navigate();
      expect(
        screen.getByRole("dialog", { name: "Discard the unsaved adjustment?" })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByTestId("mock-monaco")).toHaveTextContent(`Source for ${origin}`);
      expect(screen.getByRole("spinbutton", { name: "Amount" })).toHaveValue(3);
      expectNoGradingMutations();
      navigate();
      fireEvent.click(screen.getByRole("button", { name: "Discard adjustment" }));
      await waitFor(() =>
        expect(screen.getByTestId("mock-monaco")).toHaveTextContent(`Source for ${destination}`)
      );
      expect(screen.queryByRole("button", { name: "Cancel adjustment" })).not.toBeInTheDocument();
      expectNoGradingMutations();
      assertNoDuplicateAccessibleNames();
    }
  );

  it("preserves a dirty adjustment when selecting the same student or changing the filter", async () => {
    setApis({ students: twoStudents });
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit adjustment: quality" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note (optional)" }), {
      target: { value: "Draft note" }
    });
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note (optional)" })).toHaveValue("Draft note");
    fireEvent.click(screen.getByRole("button", { name: /^Graded\b/u }));
    expect(screen.queryByRole("button", { name: /ada · Section 001/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("Source for ada");
    expect(screen.getByRole("textbox", { name: "Note (optional)" })).toHaveValue("Draft note");
    expectNoGradingMutations();
  });

  it("treats only explicit re-anchoring of an edited comment as a dirty source change", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    // The real source viewer can deliver selection callbacks while hidden. Use
    // that callback rather than clicking controls in the hidden grading grid.
    act(() => updateCanonicalSelection?.({ file: "src/Main.java", startLine: 2, endLine: 5 }));
    expect(screen.getByText("Source target: src/Main.java: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to grading" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit comment: Original feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Use current selection" }));
    expect(screen.getByText("Source target: src/Main.java: 2-5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to grading" }));
    expect(
      screen.getByRole("dialog", { name: "Discard the unsaved comment?" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Source target: src/Main.java: 2-5")).toBeInTheDocument();
    expectNoGradingMutations();
  });
});

describe("GradingWorkspacePage sibling panels after comment takeover", () => {
  it("returns to the existing grading panels without reloading the selected student", async () => {
    setApis();
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByRole("heading", { name: "Comments · ada" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manual adjustments" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to grading" }));
    expect(await screen.findByRole("heading", { name: "Manual adjustments" })).toBeInTheDocument();
    expect(screen.getByText("Original feedback")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace Graider workflow…" })).toBeInTheDocument();
    expect(window.graiderUI.loadGradingStudentSource).toHaveBeenCalledTimes(1);
    expect(window.graiderUI.loadGradingStudentSnapshot).toHaveBeenCalledTimes(1);
    expectNoGradingMutations();
  });
});
