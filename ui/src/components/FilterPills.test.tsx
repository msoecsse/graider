import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterPills } from "./FilterPills";

const PILLS = [
  { id: "to-grade", label: "To grade", count: 7 },
  { id: "graded", label: "Graded", count: 12 },
  { id: "published", label: "Published", count: 3 }
];

describe("FilterPills", () => {
  it("marks the active pill and shows each count", () => {
    render(<FilterPills pills={PILLS} activeId="graded" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "To grade 7" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Graded 12" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("calls onSelect with the pill id when clicked", () => {
    const onSelect = vi.fn();
    render(<FilterPills pills={PILLS} activeId="graded" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Published 3" }));

    expect(onSelect).toHaveBeenCalledWith("published");
  });
});
