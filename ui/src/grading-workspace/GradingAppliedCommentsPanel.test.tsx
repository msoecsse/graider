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

  it("renders formatted applied-comment bodies but keeps the delete summary plain", () => {
    const { container } = render(
      <GradingAppliedCommentsPanel
        {...baseProps}
        appliedComments={[{ ...comment, text: "Use `scanner.nextLine()`\n```\n  value();\n```" }]}
        deleteConfirmation={{
          studentId: "ada",
          commentId: "c1",
          text: "Use `scanner.nextLine()`",
          deduction: -2
        }}
      />
    );

    expect(screen.getByText("scanner.nextLine()").tagName).toBe("CODE");
    expect(
      container.querySelector(".formatted-grading-comment__code-block code")?.textContent
    ).toBe("  value();");
    expect(screen.getByText("“Use `scanner.nextLine()`” · Adjustment: -2")).toBeInTheDocument();
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

it("navigates linked comment clicks/keyboard and preserves Edit, but never navigates general/stale comments", () => {
  const onNavigate = vi.fn();
  const onEdit = vi.fn();
  const linked = {
    ...comment,
    sourceLocation: { file: "src/Main.java", startLine: 40, endLine: 42 }
  };
  const props = { ...baseProps, onNavigate, onEdit };
  const { rerender } = render(
    <GradingAppliedCommentsPanel {...props} appliedComments={[linked]} />
  );
  fireEvent.click(screen.getByText(comment.text));
  fireEvent.keyDown(screen.getByRole("button", { name: /Show comment location/u }), {
    key: "Enter"
  });
  expect(onNavigate).toHaveBeenCalledTimes(2);
  expect(onNavigate).toHaveBeenLastCalledWith(linked);
  fireEvent.click(screen.getByLabelText(`Edit comment: ${comment.text}`));
  expect(onEdit).toHaveBeenCalledWith(linked);
  onNavigate.mockClear();
  rerender(<GradingAppliedCommentsPanel {...props} appliedComments={[comment]} />);
  fireEvent.click(screen.getByText(comment.text));
  expect(screen.queryByRole("button", { name: /Show comment location/u })).not.toBeInTheDocument();
  const stale = {
    ...linked,
    sourceAnchor: {
      status: "stale" as const,
      originalCommitSha: "abc",
      originalLocation: linked.sourceLocation
    }
  };
  rerender(<GradingAppliedCommentsPanel {...props} appliedComments={[stale]} />);
  fireEvent.click(screen.getByText(comment.text));
  fireEvent.click(screen.getByLabelText(`Edit comment: ${comment.text}`));
  expect(onNavigate).not.toHaveBeenCalled();
  expect(screen.getByText(/Stale\/unresolved/u)).toBeInTheDocument();
});
