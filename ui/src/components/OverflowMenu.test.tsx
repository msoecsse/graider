import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverflowMenu, type OverflowMenuGroup } from "./OverflowMenu";

const buildGroups = (onSelect: () => void, onDelete: () => void): OverflowMenuGroup[] => [
  {
    id: "assignment",
    heading: "Assignment",
    items: [
      { id: "edit", label: "Edit assignment", caption: "Change points or due date", onSelect }
    ]
  },
  {
    id: "danger",
    items: [
      {
        id: "delete",
        label: "Delete assignment",
        destructive: true,
        onSelect: onDelete
      }
    ]
  }
];

describe("OverflowMenu", () => {
  it("is closed by default and opens on trigger click", () => {
    render(<OverflowMenu groups={buildGroups(vi.fn(), vi.fn())} />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Edit assignment/ })).toBeInTheDocument();
  });

  it("calls the item's onSelect and closes the menu", () => {
    const onSelect = vi.fn();
    render(<OverflowMenu groups={buildGroups(onSelect, vi.fn())} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Edit assignment/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks a destructive item with the destructive class", () => {
    render(<OverflowMenu groups={buildGroups(vi.fn(), vi.fn())} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(screen.getByRole("menuitem", { name: "Delete assignment" })).toHaveClass(
      "overflow-menu__item--destructive"
    );
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<OverflowMenu groups={buildGroups(vi.fn(), vi.fn())} />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when clicking outside the menu", () => {
    render(<OverflowMenu groups={buildGroups(vi.fn(), vi.fn())} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
