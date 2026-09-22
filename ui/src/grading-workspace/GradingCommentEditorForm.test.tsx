import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingCommentEditorForm, type CommentEditorState } from "./GradingCommentEditorForm";

const rubric = [{ id: "style", name: "Style", points: 10 }];

const addEditor: CommentEditorState = {
  operation: "add",
  studentId: "ada",
  title: "Looks good",
  text: "Nice work",
  deduction: "0",
  rubricCategoryId: "",
  targetMode: "general"
};

const baseProps = {
  onEditorChange: vi.fn(),
  rubric,
  canonicalSourceTarget: undefined,
  gradingMutationStudentId: undefined,
  isStudentMutationBlocked: () => false,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  sourceTargetLabel: (target: { file: string; startLine: number; endLine: number }) =>
    `${target.file}:${target.startLine}`
};

describe("GradingCommentEditorForm", () => {
  it("submits a general comment when the target mode is general", () => {
    const onSubmit = vi.fn();
    render(<GradingCommentEditorForm {...baseProps} editor={addEditor} onSubmit={onSubmit} />);

    expect(screen.getByRole("heading", { name: "Add comment" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables submit for a source-targeted comment with no selected range", () => {
    render(
      <GradingCommentEditorForm
        {...baseProps}
        editor={{ ...addEditor, targetMode: "source" }}
        canonicalSourceTarget={undefined}
      />
    );

    expect(screen.getByRole("button", { name: "Apply comment" })).toBeDisabled();
    expect(
      screen.getByText("Select a valid source line or range, or choose General.")
    ).toBeInTheDocument();
  });

  it("shows the reusable-comment title and cancels on click", () => {
    const onCancel = vi.fn();
    render(
      <GradingCommentEditorForm
        {...baseProps}
        editor={{ ...addEditor, reusableCommentTitle: "Off-by-one" }}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole("heading", { name: "Apply Off-by-one" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel comment" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
