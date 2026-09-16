import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraiderUIApi } from "../../electron/ipc";
import { AssignmentSetupPage } from "./AssignmentSetupPage";

const courseFolder = {
  id: "course",
  path: "/courses/csc1120",
  displayAlias: "CSC1120",
  lastOpenedAt: "2027-01-01T00:00:00.000Z",
  lastRefreshedAt: null,
  lastDashboardStatus: null
};

const typeText = (input: HTMLInputElement, value: string): void => {
  input.focus();
  for (const character of value) {
    fireEvent.input(input, { target: { value: `${input.value}${character}` } });
    expect(document.activeElement).toBe(input);
  }
};

const setup = () => {
  const previewAssignmentSetup = vi.fn().mockResolvedValue({
    status: "ready",
    files: [],
    diagnostics: [],
    hasConflicts: false
  });
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: {
      loadAssignmentSetupTerms: vi.fn().mockResolvedValue({ terms: [], diagnostics: [] }),
      previewAssignmentSetup,
      saveAssignmentSetup: vi.fn()
    } satisfies Partial<GraiderUIApi>
  });
  render(
    <AssignmentSetupPage courseFolder={courseFolder} onBack={vi.fn()} onOpenAssignment={vi.fn()} />
  );
  return { previewAssignmentSetup };
};

describe("AssignmentSetupPage editable rows", () => {
  it("keeps required-file and rubric inputs focused while typing successive characters", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add required file" }));
    const requiredFile = screen.getByRole("textbox", { name: "Required file 1" });
    typeText(requiredFile as HTMLInputElement, "src/Main.java");
    expect(requiredFile).toHaveValue("src/Main.java");

    fireEvent.click(screen.getByRole("button", { name: "Add rubric category" }));
    const rubricId = screen.getByRole("textbox", { name: "Rubric ID 1" });
    const rubricName = screen.getByRole("textbox", { name: "Rubric name 1" });
    typeText(rubricId as HTMLInputElement, "style");
    typeText(rubricName as HTMLInputElement, "Code style");
    fireEvent.input(screen.getByRole("spinbutton", { name: "Rubric points 1" }), {
      target: { value: "15" }
    });
    expect(rubricId).toHaveValue("style");
    expect(rubricName).toHaveValue("Code style");
    expect(screen.getByRole("spinbutton", { name: "Rubric points 1" })).toHaveValue(15);
  });

  it("preserves logical row values through reorder/removal and projects no UI keys to requests", async () => {
    const { previewAssignmentSetup } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add required file" }));
    fireEvent.click(screen.getByRole("button", { name: "Add required file" }));
    fireEvent.input(screen.getByRole("textbox", { name: "Required file 1" }), {
      target: { value: "first.java" }
    });
    fireEvent.input(screen.getByRole("textbox", { name: "Required file 2" }), {
      target: { value: "second.java" }
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Down" })[0] as HTMLButtonElement);
    expect(screen.getByRole("textbox", { name: "Required file 1" })).toHaveValue("second.java");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1] as HTMLButtonElement);

    fireEvent.click(screen.getByRole("button", { name: "Add rubric category" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rubric category" }));
    fireEvent.input(screen.getByRole("textbox", { name: "Rubric ID 1" }), {
      target: { value: "first" }
    });
    fireEvent.input(screen.getByRole("textbox", { name: "Rubric ID 2" }), {
      target: { value: "second" }
    });
    const upButtons = screen.getAllByRole("button", { name: "Up" });
    fireEvent.click(upButtons[2] as HTMLButtonElement);
    expect(screen.getByRole("textbox", { name: "Rubric ID 1" })).toHaveValue("second");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[2] as HTMLButtonElement);

    fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));
    await waitFor(() => expect(previewAssignmentSetup).toHaveBeenCalledOnce());
    const [request] = previewAssignmentSetup.mock.calls[0] ?? [];
    expect(request).toMatchObject({
      requiredFiles: ["second.java"],
      rubric: [{ id: "second", name: "", points: Number.NaN }]
    });
    expect(JSON.stringify(request)).not.toContain('"key"');
  });
});
