import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
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

const CommentEditorHarness = ({
  initialEditor = addEditor
}: {
  readonly initialEditor?: CommentEditorState;
}): ReactElement => {
  const [editor, setEditor] = useState<CommentEditorState | undefined>(initialEditor);
  if (editor === undefined) return <></>;
  return <GradingCommentEditorForm {...baseProps} editor={editor} onEditorChange={setEditor} />;
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

  it("wraps selected text as inline code and shows the shared formatted preview", () => {
    render(
      <CommentEditorHarness initialEditor={{ ...addEditor, text: "Use scanner.nextLine()" }} />
    );

    const textarea = screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(4, "Use scanner.nextLine()".length);
    fireEvent.click(screen.getByRole("button", { name: "Inline code" }));

    expect(textarea).toHaveValue("Use `scanner.nextLine()`");
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText("scanner.nextLine()").tagName).toBe("CODE");
    expect(document.activeElement).toBe(textarea);
  });

  it("inserts an empty inline-code pair when no text is selected", () => {
    render(<CommentEditorHarness initialEditor={{ ...addEditor, text: "Use " }} />);

    const textarea = screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(4, 4);
    fireEvent.click(screen.getByRole("button", { name: "Inline code" }));

    expect(textarea).toHaveValue("Use ``");
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);
  });

  it("wraps selected lines in a language-free code block", () => {
    render(
      <CommentEditorHarness initialEditor={{ ...addEditor, text: "Before\n  value();\nAfter" }} />
    );

    const textarea = screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement;
    const selectedStart = "Before\n".length;
    const selectedEnd = "Before\n  value();".length;
    textarea.focus();
    textarea.setSelectionRange(selectedStart, selectedEnd);
    fireEvent.click(screen.getByRole("button", { name: "Code block" }));

    expect(textarea).toHaveValue("Before\n```\n  value();\n```\nAfter");
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(document.querySelector(".formatted-grading-comment__code-block code")?.textContent).toBe(
      "  value();"
    );
  });

  it("keeps focus and warns instead of wrapping an ambiguous closing fence", () => {
    render(<CommentEditorHarness initialEditor={{ ...addEditor, text: "first\n```\nlast" }} />);

    const textarea = screen.getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.click(screen.getByRole("button", { name: "Code block" }));

    expect(textarea).toHaveValue("first\n```\nlast");
    expect(
      screen.getByText(
        "Code block was not added because the selection contains a closing triple-backtick fence."
      )
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(textarea);
  });
});
