import { fireEvent, render, screen } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Updated", tags: ["Java"] })
    );
  });
});
