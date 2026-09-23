import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReusableCommentTagInput } from "./ReusableCommentTagInput";

describe("ReusableCommentTagInput", () => {
  it("adds arbitrary tags, preserves suggestion casing, rejects duplicate casing, and removes tokens", () => {
    const onChange = vi.fn();
    render(
      <ReusableCommentTagInput
        onChange={onChange}
        suggestions={["Java", "Loops"]}
        tags={["Loops"]}
      />
    );
    const input = screen.getByRole("combobox", { name: "Add a tag" });
    fireEvent.change(input, { target: { value: "Java" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(["Loops", "Java"]);
    fireEvent.change(input, { target: { value: "loops" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("That tag has already been added.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove tag Loops" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
