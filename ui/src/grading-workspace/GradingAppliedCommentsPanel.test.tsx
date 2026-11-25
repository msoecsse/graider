import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it.each(["first", "middle", "last"])(
    "places confirmation directly beneath the targeted %s comment, inside its list item",
    (targetId) => {
      const comments = ["first", "middle", "last"].map((id) => ({ ...comment, id }));
      render(
        <GradingAppliedCommentsPanel
          {...baseProps}
          appliedComments={comments}
          deleteConfirmation={{
            studentId: "ada",
            commentId: targetId,
            text: comment.text,
            deduction: comment.deduction
          }}
        />
      );

      const items = screen.getAllByRole("listitem");
      const targetItem = items[comments.findIndex(({ id }) => id === targetId)];
      expect(targetItem).toContainElement(
        screen.getByRole("alertdialog", { name: "Delete applied comment?" })
      );
      expect(targetItem?.lastElementChild).toBe(screen.getByRole("alertdialog"));
      for (const item of items.filter((item) => item !== targetItem)) {
        expect(within(item).queryByRole("alertdialog")).not.toBeInTheDocument();
      }
    }
  );

  it("renders each applied comment and requests deletion on click", () => {
    const onRequestDelete = vi.fn();
    render(<GradingAppliedCommentsPanel {...baseProps} onRequestDelete={onRequestDelete} />);

    expect(screen.getByText("Consider extracting this helper.")).toBeInTheDocument();
    expect(screen.getByText("Category: Style")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Delete comment: Consider extracting this helper."));
    expect(onRequestDelete).toHaveBeenCalledWith(comment);
  });

  it.each(["another student", "missing comment", "empty list"])(
    "hides an obsolete confirmation for %s",
    (scenario) => {
      render(
        <GradingAppliedCommentsPanel
          {...baseProps}
          appliedComments={scenario === "empty list" ? [] : [comment]}
          deleteConfirmation={{
            studentId: scenario === "another student" ? "grace" : "ada",
            commentId: scenario === "missing comment" ? "missing" : comment.id,
            text: comment.text,
            deduction: comment.deduction
          }}
        />
      );
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    }
  );

  it("keeps confirmation visible outside collapsed source context", () => {
    const location = { file: "Main.java", startLine: 1, endLine: 1 };
    render(
      <GradingAppliedCommentsPanel
        {...baseProps}
        appliedComments={[
          {
            ...comment,
            sourceLocation: location,
            sourceAnchor: {
              status: "stale",
              originalCommitSha: "a".repeat(40),
              originalLocation: location,
              originalText: "helper();"
            }
          }
        ]}
        deleteConfirmation={{
          studentId: "ada",
          commentId: comment.id,
          text: comment.text,
          deduction: comment.deduction,
          sourceLocation: location
        }}
      />
    );
    const dialog = screen.getByRole("alertdialog", { name: "Delete applied comment?" });
    expect(dialog).toBeVisible();
    expect(dialog.closest("details")).toBeNull();
    expect(dialog).toHaveTextContent("Source: Main.java:1");
  });

  it.each(["Cancel", "Escape"])(
    "%s cancels once and restores focus to the targeted Delete button",
    (action) => {
      const onCancelDelete = vi.fn();
      const onConfirmDelete = vi.fn();
      const confirmation = {
        studentId: "ada",
        commentId: comment.id,
        text: comment.text,
        deduction: comment.deduction
      };
      const { rerender } = render(<GradingAppliedCommentsPanel {...baseProps} />);
      const trigger = screen.getByRole("button", { name: `Delete comment: ${comment.text}` });
      trigger.focus();
      fireEvent.click(trigger);
      rerender(
        <GradingAppliedCommentsPanel
          {...baseProps}
          deleteConfirmation={confirmation}
          onCancelDelete={onCancelDelete}
          onConfirmDelete={onConfirmDelete}
        />
      );
      expect(trigger).toHaveFocus();
      const dialog = screen.getByRole("alertdialog");
      expect(trigger.closest("li")).toContainElement(dialog);
      const cancel = within(dialog).getByRole("button", { name: "Cancel deleting comment" });
      cancel.focus();
      if (action === "Escape") fireEvent.keyDown(cancel, { key: "Escape" });
      else fireEvent.click(cancel);
      expect(onCancelDelete).toHaveBeenCalledTimes(1);
      expect(onConfirmDelete).not.toHaveBeenCalled();
      rerender(<GradingAppliedCommentsPanel {...baseProps} />);
      expect(trigger).toHaveFocus();
    }
  );

  it("disables confirmation actions while deletion is pending", () => {
    const onCancelDelete = vi.fn();
    const onConfirmDelete = vi.fn();
    render(
      <GradingAppliedCommentsPanel
        {...baseProps}
        gradingMutationStudentId="ada"
        deleteConfirmation={{
          studentId: "ada",
          commentId: comment.id,
          text: comment.text,
          deduction: comment.deduction
        }}
        onCancelDelete={onCancelDelete}
        onConfirmDelete={onConfirmDelete}
      />
    );
    const confirm = screen.getByRole("button", { name: "Deleting comment…" });
    const cancel = screen.getByRole("button", { name: "Cancel deleting comment" });
    expect(confirm).toBeDisabled();
    expect(cancel).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.click(cancel);
    fireEvent.keyDown(cancel, { key: "Escape" });
    expect(onConfirmDelete).not.toHaveBeenCalled();
    expect(onCancelDelete).not.toHaveBeenCalled();
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
