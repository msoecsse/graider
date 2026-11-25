import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CourseCardGrid } from "./CourseCardGrid";
import type { CombinedDashboardCard, RecentAssignmentSummary } from "./dashboardTypes";

const ASSIGNMENT: RecentAssignmentSummary = {
  slug: "archived-quiz",
  title: "Archived Quiz",
  status: "inactive",
  assignmentFile: "terms/27s1/assignments/archived-quiz/assignment.yml",
  dueAt: null,
  needsAttention: false,
  diagnostics: []
};

const CARD: CombinedDashboardCard = {
  id: "course-term",
  sourceFolderId: "course-folder",
  sourceFolderPath: "course-folder",
  sourceLastRefreshedAt: null,
  dashboardStatus: "success",
  card: {
    kind: "course-term",
    displayName: "27s1-csc1120",
    courseSlug: "csc1120",
    courseTitle: "CSC1120",
    coursePath: ".",
    termSlug: "27s1",
    termTitle: "Spring 2027",
    status: "active",
    needsAttention: false,
    attentionCount: 0,
    roster: null,
    assignmentCount: 1,
    assignments: [ASSIGNMENT],
    recentAssignments: [],
    diagnostics: []
  }
};

const renderGrid = (assignment = ASSIGNMENT) => {
  const card = { ...CARD, card: { ...CARD.card, assignments: [assignment] } };
  const onOpenAssignment = vi.fn();
  const onRefresh = vi.fn();
  render(
    <CourseCardGrid
      cards={[card]}
      courseFolders={[
        {
          id: CARD.sourceFolderId,
          path: CARD.sourceFolderPath,
          displayAlias: null,
          lastOpenedAt: "2026-11-25T00:00:00.000Z",
          lastRefreshedAt: null,
          lastDashboardStatus: null
        }
      ]}
      refreshingId={null}
      onOpenAssignment={onOpenAssignment}
      onManageCommentLibrary={vi.fn()}
      onSetupAssignment={vi.fn()}
      onManageRosters={vi.fn()}
      onRefresh={onRefresh}
    />
  );
  const cell = screen.getByRole("cell", { name: "Archived Quiz" });
  const row = cell.closest("tr");
  if (row === null) throw new Error("Expected assignment table row");
  return { row, cell, card, onOpenAssignment, onRefresh };
};

describe("dashboard full assignment list row navigation", () => {
  it.each(["row", "title", "metadata"])("opens the assignment from %s", (target) => {
    const { row, cell, card, onOpenAssignment } = renderGrid();
    fireEvent.click(
      target === "row" ? row : target === "title" ? cell : within(row).getByText("27s1")
    );
    expect(onOpenAssignment).toHaveBeenCalledExactlyOnceWith(card, ASSIGNMENT);
  });

  it.each(["Enter", " "])("opens a focused row with %j and prevents scrolling", (key) => {
    const { row, card, onOpenAssignment } = renderGrid();
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAccessibleName("Open Archived Quiz");
    expect(row).toHaveAccessibleDescription("Press Enter or Space to open assignment.");
    row.focus();
    expect(row).toHaveFocus();
    expect(fireEvent.keyDown(row, { key })).toBe(false);
    expect(onOpenAssignment).toHaveBeenCalledExactlyOnceWith(card, ASSIGNMENT);
    // The retained Open button remains available without a duplicate tab stop.
    expect(within(row).getByRole("button", { name: "Open Archived Quiz" }).tabIndex).toBe(-1);
    expect(row.querySelector("a a, a button, button a, button button")).toBeNull();
  });

  it("keeps Open working exactly once, including clicks on its descendants", () => {
    const { row, card, onOpenAssignment } = renderGrid();
    const button = within(row).getByRole("button", { name: "Open Archived Quiz" });
    const span = document.createElement("span");
    span.textContent = "Open";
    button.append(span);
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
    expect(onOpenAssignment).not.toHaveBeenCalled();
    fireEvent.click(span);
    expect(onOpenAssignment).toHaveBeenCalledExactlyOnceWith(card, ASSIGNMENT);
  });

  it.each([
    '<button type="button"><span>Action</span></button>',
    '<a href="#existing-action"><span>Link</span></a>',
    '<label><span>Check</span><input type="checkbox" /></label>',
    '<input type="checkbox" />',
    "<select><option>Option</option></select>",
    "<textarea>Notes</textarea>",
    "<details><summary><span>Menu</span></summary></details>",
    '<div role="menu"><span>Menu item</span></div>',
    '<div role="button" tabindex="0"><span>Action</span></div>',
    '<div contenteditable="true"><span>Editable</span></div>'
  ])("leaves interactive children alone: %s", (markup) => {
    const { row, cell, onOpenAssignment } = renderGrid();
    // Open is currently the only row action. Exercise the guard with realistic
    // descendants so additional actions cannot accidentally activate the row.
    const container = document.createElement("div");
    container.innerHTML = markup;
    cell.append(container);
    const control = container.firstElementChild;
    if (!(control instanceof HTMLElement)) throw new Error("Expected control");
    const target = control.querySelector("span") ?? control;
    const onClick = vi.fn();
    control.addEventListener("click", onClick);
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalled();
    if (control instanceof HTMLLabelElement) {
      expect(control.querySelector("input")).toBeChecked();
    }
    expect(fireEvent.keyDown(target, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(target, { key: " " })).toBe(true);
    expect(onOpenAssignment).not.toHaveBeenCalled();
    expect(row).toBeInTheDocument();
  });

  it("does not navigate while selecting row text", () => {
    const { row, cell, onOpenAssignment } = renderGrid();
    const selection = window.getSelection();
    if (selection === null) throw new Error("Expected selection API");
    const range = document.createRange();
    range.selectNodeContents(cell);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      expect(selection.toString()).toBe("Archived Quiz");
      fireEvent.click(cell);
      fireEvent.keyDown(row, { key: "Enter" });
      fireEvent.keyDown(row, { key: " " });
      expect(onOpenAssignment).not.toHaveBeenCalled();
    } finally {
      selection.removeAllRanges();
    }
    fireEvent.click(cell);
    expect(onOpenAssignment).toHaveBeenCalledOnce();
  });

  it("preserves unavailable assignments as disabled", () => {
    const { row, cell, onOpenAssignment } = renderGrid({ ...ASSIGNMENT, assignmentFile: null });
    expect(row).not.toHaveAttribute("tabindex");
    expect(within(row).getByRole("button", { name: "Open Archived Quiz" })).toBeDisabled();
    fireEvent.click(cell);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onOpenAssignment).not.toHaveBeenCalled();
  });

  it("ignores repeated keys, modifiers, prevented events and non-primary clicks", () => {
    const { row, cell, onOpenAssignment } = renderGrid();
    fireEvent.keyDown(row, { key: "ArrowDown" });
    fireEvent.keyDown(row, { key: "Enter", repeat: true });
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) {
      fireEvent.click(cell, { [modifier]: true });
      fireEvent.keyDown(row, { key: "Enter", [modifier]: true });
    }
    fireEvent.click(cell, { button: 1 });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(cell, event);
    expect(onOpenAssignment).not.toHaveBeenCalled();
  });

  it("does not make table headers or course summaries navigate", () => {
    const { onOpenAssignment, onRefresh } = renderGrid();
    fireEvent.click(screen.getByRole("columnheader", { name: "Title" }));
    fireEvent.click(screen.getByRole("heading", { name: "27s1-csc1120" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh csc1120 - CSC1120" }));
    expect(onRefresh).toHaveBeenCalledExactlyOnceWith(CARD.sourceFolderId);
    expect(onOpenAssignment).not.toHaveBeenCalled();
  });
});
