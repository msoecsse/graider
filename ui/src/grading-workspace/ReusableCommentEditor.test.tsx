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
