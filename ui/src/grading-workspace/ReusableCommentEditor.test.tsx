import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReusableCommentEditor } from "./ReusableCommentEditor";

const value = {
  title: "Style",
  text: "Use `final`.",
  defaultDeduction: -1,
  defaultRubricCategoryId: "missing",
  tags: ["Java"]
};

describe("ReusableCommentEditor", () => {
  it("keeps rendering when blank comment text receives its first characters", () => {
    render(
      <StrictMode>
        <ReusableCommentEditor
          categories={[]}
          initialValue={{ title: "", text: "", defaultDeduction: 0, tags: [] }}
          onCancel={vi.fn()}
          onSave={vi.fn()}
          tagSuggestions={[]}
        />
      </StrictMode>
    );

    const commentText = screen.getByRole("textbox", { name: "Comment text" });
    expect(screen.getByText("No comment text yet.")).toBeInTheDocument();

    fireEvent.change(commentText, { target: { value: "a" } });
    expect(commentText).toHaveValue("a");
    expect(screen.queryByText("No comment text yet.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Comment preview")).toHaveTextContent("a");

    fireEvent.change(commentText, { target: { value: "ab" } });
    expect(commentText).toHaveValue("ab");
    expect(screen.getByLabelText("Comment preview")).toHaveTextContent("ab");
  });

  it("selects None when a new comment has no category in an empty category list", () => {
    render(
      <ReusableCommentEditor
        categories={[]}
        initialValue={{ title: "New", text: "Text", defaultDeduction: 0, tags: [] }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        tagSuggestions={[]}
      />
    );

    expect(screen.getByRole("combobox", { name: "Default rubric category" })).toHaveValue("");
  });

  it("shows unavailable categories, a formatted preview, and submits edited values", () => {
    const onSave = vi.fn();
    render(
      <ReusableCommentEditor
        categories={[{ id: "design", name: "Design" }]}
        initialValue={value}
        onCancel={vi.fn()}
        onSave={onSave}
        tagSuggestions={["Java"]}
      />
    );
    expect(screen.getByRole("option", { name: "Unavailable: missing" })).toBeDisabled();
    expect(screen.getByText("final").tagName).toBe("CODE");
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Updated" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Comment text" }), {
      target: { value: "Updated `comment`." }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Default adjustment" }), {
      target: { value: "-2.5" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Default rubric category" }), {
      target: { value: "design" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Add a tag" }), {
      target: { value: "Style" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(onSave).toHaveBeenCalledWith({
      title: "Updated",
      text: "Updated `comment`.",
      defaultDeduction: -2.5,
      defaultRubricCategoryId: "design",
      tags: ["Java", "Style"]
    });
  });
});
