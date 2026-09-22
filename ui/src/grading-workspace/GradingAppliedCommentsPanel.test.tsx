import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingAppliedCommentsPanel } from "./GradingAppliedCommentsPanel";

const comment = {
  id: "c1",
  title: "Nice work",
  text: "Consider extracting this helper.",
  deduction: -2,
  rubricCategoryId: "style"
};

const categories = [
  {
    id: "style",
    name: "Style",
    score: 8,
    pointsPossible: 10,
    categorizedCommentAdjustmentTotal: -2,
    manualAdjustmentTotal: 0
  }
];

const baseProps = {
  appliedComments: [comment],
  categories,
  studentId: "ada",
  gradingMutationStudentId: undefined,
  isStudentMutationBlocked: () => false,
  onEdit: vi.fn(),
  onRequestDelete: vi.fn(),
  deleteConfirmation: undefined,
  onConfirmDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  sourceLocationLabel: (location: { file: string; startLine: number; endLine: number }) =>
    `${location.file}:${location.startLine}`
};

describe("GradingAppliedCommentsPanel", () => {
  it("renders each applied comment and requests deletion on click", () => {
    const onRequestDelete = vi.fn();
    render(<GradingAppliedCommentsPanel {...baseProps} onRequestDelete={onRequestDelete} />);

    expect(screen.getByText("Consider extracting this helper.")).toBeInTheDocument();
    expect(screen.getByText("Category: Style")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Delete comment: Consider extracting this helper."));
    expect(onRequestDelete).toHaveBeenCalledWith(comment);
  });

  it("shows the delete confirmation for the matching student and confirms on click", () => {
    const onConfirmDelete = vi.fn();
    render(
      <GradingAppliedCommentsPanel
        {...baseProps}
        deleteConfirmation={{
          studentId: "ada",
          commentId: "c1",
          text: comment.text,
          deduction: -2
        }}
        onConfirmDelete={onConfirmDelete}
      />
    );

    expect(screen.getByText("Delete applied comment?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting comment" }));
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when there are no applied comments", () => {
    render(<GradingAppliedCommentsPanel {...baseProps} appliedComments={[]} />);

    expect(screen.getByText("No comments applied.")).toBeInTheDocument();
  });
});
