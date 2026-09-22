import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingManualAdjustmentsPanel } from "./GradingManualAdjustmentsPanel";

const adjustment = { id: "a1", rubricCategoryId: "style", amount: -3, note: "Missed a case" };
const categories = [
  {
    id: "style",
    name: "Style",
    score: 7,
    pointsPossible: 10,
    categorizedCommentAdjustmentTotal: 0,
    manualAdjustmentTotal: -3
  }
];
const rubric = [{ id: "style", name: "Style", points: 10 }];

const baseProps = {
  manualAdjustments: [adjustment],
  categories,
  rubric,
  studentId: "ada",
  gradingMutationStudentId: undefined,
  isStudentMutationBlocked: () => false,
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onRequestDelete: vi.fn(),
  editor: undefined,
  onEditorChange: vi.fn(),
  onSubmitEditor: vi.fn(),
  onCancelEditor: vi.fn(),
  deleteConfirmation: undefined,
  onConfirmDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  signedAmount: (amount: number) => (amount >= 0 ? `+${amount}` : `${amount}`)
};

describe("GradingManualAdjustmentsPanel", () => {
  it("renders each adjustment and requests an edit on click", () => {
    const onEdit = vi.fn();
    render(<GradingManualAdjustmentsPanel {...baseProps} onEdit={onEdit} />);

    expect(screen.getByText("Adjustment: -3")).toBeInTheDocument();
    expect(screen.getByText("Missed a case")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Edit adjustment: style"));
    expect(onEdit).toHaveBeenCalledWith(adjustment);
  });

  it("disables Add adjustment and shows guidance when the assignment has no rubric", () => {
    render(<GradingManualAdjustmentsPanel {...baseProps} rubric={[]} />);

    expect(screen.getByRole("button", { name: "Add adjustment" })).toBeDisabled();
    expect(screen.getByText("Manual adjustments require a rubric category.")).toBeInTheDocument();
  });

  it("renders the editor form for the matching student and submits it", () => {
    const onSubmitEditor = vi.fn();
    render(
      <GradingManualAdjustmentsPanel
        {...baseProps}
        editor={{
          operation: "add",
          studentId: "ada",
          rubricCategoryId: "style",
          amount: "5",
          note: ""
        }}
        onSubmitEditor={onSubmitEditor}
      />
    );

    expect(screen.getByRole("form", { name: "Add manual adjustment" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save new adjustment" }));
    expect(onSubmitEditor).toHaveBeenCalledTimes(1);
  });
});
