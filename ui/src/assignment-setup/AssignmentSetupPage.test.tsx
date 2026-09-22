import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraiderUIApi } from "../../electron/ipc";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
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

describe("AssignmentSetupPage preview response handling", () => {
  it("shows a plain error instead of crashing when the preview response has no files array", async () => {
    // PR10-1a: `ui/electron/main.ts`'s previewAssignmentSetup handler used to
    // return a saveAssignmentSetup-shaped result (no `files`) when the
    // template repository field was left blank. That handler is fixed, but
    // this proves AssignmentSetupPage itself never trusts an IPC response's
    // declared shape blindly -- this must fail (an uncaught render error)
    // without the Array.isArray(nextPreview.files) check in handlePreview.
    Object.defineProperty(window, "graiderUI", {
      configurable: true,
      value: {
        loadAssignmentSetupTerms: vi.fn().mockResolvedValue({ terms: [], diagnostics: [] }),
        previewAssignmentSetup: vi.fn().mockResolvedValue({
          status: "failure",
          writtenFiles: [],
          diagnostics: [{ message: "Assignment setup must be confirmed before saving." }]
        }),
        saveAssignmentSetup: vi.fn()
      } satisfies Partial<GraiderUIApi>
    });
    render(
      <AssignmentSetupPage
        courseFolder={courseFolder}
        onBack={vi.fn()}
        onOpenAssignment={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));

    expect(
      await screen.findByText(
        "Assignment setup preview returned an unexpected response. Try again."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("creates an assignment with no template repository through a full preview-confirm-save flow", async () => {
    // The test PR7-1 deferred ("the existing test only opens the modal,
    // never confirms it"), specifically for the blank-template-repository
    // path -- the one that used to crash (see the test above).
    const onOpenAssignment = vi.fn();
    const previewAssignmentSetup = vi.fn().mockResolvedValue({
      status: "ready",
      files: [
        {
          path: "terms/27s1/assignments/lab04/assignment.yml",
          content: "schema_version: 1\n",
          exists: false
        }
      ],
      diagnostics: [],
      hasConflicts: false
    });
    const saveAssignmentSetup = vi.fn().mockResolvedValue({
      status: "success",
      writtenFiles: ["terms/27s1/assignments/lab04/assignment.yml"],
      diagnostics: []
    });
    Object.defineProperty(window, "graiderUI", {
      configurable: true,
      value: {
        loadAssignmentSetupTerms: vi.fn().mockResolvedValue({
          terms: [{ code: "27s1", sections: ["001"] }],
          diagnostics: []
        }),
        previewAssignmentSetup,
        saveAssignmentSetup
      } satisfies Partial<GraiderUIApi>
    });
    render(
      <AssignmentSetupPage
        courseFolder={courseFolder}
        onBack={vi.fn()}
        onOpenAssignment={onOpenAssignment}
      />
    );

    fireEvent.change(await screen.findByLabelText("Term"), { target: { value: "27s1" } });
    fireEvent.click(screen.getByLabelText("Section 001"));
    fireEvent.change(screen.getByLabelText("Assignment title"), { target: { value: "Lab 04" } });
    fireEvent.change(screen.getByLabelText("Assignment slug"), { target: { value: "lab04" } });

    fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));

    const dialog = await screen.findByRole("dialog", { name: "Create assignment?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create assignment" }));

    await waitFor(() => expect(onOpenAssignment).toHaveBeenCalledTimes(1));
    expect(saveAssignmentSetup).toHaveBeenCalledWith(
      expect.objectContaining({ templateRepository: "", confirmed: true })
    );
    expect(onOpenAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentFile: "terms/27s1/assignments/lab04/assignment.yml",
        assignmentSlug: "lab04"
      })
    );
  });
});

const READY_PREVIEW = {
  status: "ready",
  files: [
    {
      path: "terms/27s1/assignments/lab04/assignment.yml",
      content: "schema_version: 1\n",
      exists: false
    }
  ],
  diagnostics: [],
  hasConflicts: false
};

const renderToConfirmDialog = async (
  api: Partial<GraiderUIApi>,
  onOpenAssignment: (selection: AssignmentDetailSelection) => void = vi.fn()
): Promise<{ readonly dialog: HTMLElement }> => {
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: {
      loadAssignmentSetupTerms: vi.fn().mockResolvedValue({
        terms: [{ code: "27s1", sections: ["001"] }],
        diagnostics: []
      }),
      previewAssignmentSetup: vi.fn().mockResolvedValue(READY_PREVIEW),
      ...api
    } satisfies Partial<GraiderUIApi>
  });
  render(
    <AssignmentSetupPage
      courseFolder={courseFolder}
      onBack={vi.fn()}
      onOpenAssignment={onOpenAssignment}
    />
  );

  fireEvent.change(await screen.findByLabelText("Term"), { target: { value: "27s1" } });
  fireEvent.click(screen.getByLabelText("Section 001"));
  fireEvent.change(screen.getByLabelText("Assignment title"), { target: { value: "Lab 04" } });
  fireEvent.change(screen.getByLabelText("Assignment slug"), { target: { value: "lab04" } });
  fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));

  const dialog = await screen.findByRole("dialog", { name: "Create assignment?" });
  return { dialog };
};

const confirmAndExpectAlert = async (
  dialog: HTMLElement,
  expectedMessage: string
): Promise<void> => {
  fireEvent.click(within(dialog).getByRole("button", { name: "Create assignment" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(expectedMessage);
};

describe("AssignmentSetupPage save error handling", () => {
  it("surfaces the backend's diagnostic when the save fails, not a generic sentence", async () => {
    const { dialog } = await renderToConfirmDialog({
      saveAssignmentSetup: vi.fn().mockResolvedValue({
        status: "failure",
        writtenFiles: [],
        diagnostics: [
          { message: "Existing assignment.yml must be explicitly replaced before saving." }
        ]
      })
    });

    await confirmAndExpectAlert(
      dialog,
      "Existing assignment.yml must be explicitly replaced before saving."
    );
    expect(screen.queryByText("Unable to save assignment.yml.")).toBeNull();
  });

  it.each([
    "Generated path is outside the selected course folder.",
    "Unable to write assignment.yml."
  ])("reaches the user distinguishably for the backend reason %s", async (message) => {
    const { dialog } = await renderToConfirmDialog({
      saveAssignmentSetup: vi.fn().mockResolvedValue({
        status: "failure",
        writtenFiles: [],
        diagnostics: [{ message }]
      })
    });

    await confirmAndExpectAlert(dialog, message);
  });

  it("says a reason was not given when the backend reports failure with no diagnostics", async () => {
    const { dialog } = await renderToConfirmDialog({
      saveAssignmentSetup: vi.fn().mockResolvedValue({
        status: "failure",
        writtenFiles: [],
        diagnostics: []
      })
    });

    await confirmAndExpectAlert(dialog, "Assignment setup failed, and no reason was reported.");
  });

  it("does not report a successful save's navigation failure as a save failure", async () => {
    const onOpenAssignment = vi.fn(() => {
      throw new Error("route resolution failed");
    });
    const saveAssignmentSetup = vi.fn().mockResolvedValue({
      status: "success",
      writtenFiles: ["terms/27s1/assignments/lab04/assignment.yml"],
      diagnostics: []
    });
    const { dialog } = await renderToConfirmDialog({ saveAssignmentSetup }, onOpenAssignment);

    await confirmAndExpectAlert(
      dialog,
      "The assignment was saved, but opening it failed: route resolution failed"
    );
    expect(saveAssignmentSetup).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Unable to save assignment.yml.")).toBeNull();
  });

  it("preserves a genuine error's own message when the preview call itself rejects", async () => {
    Object.defineProperty(window, "graiderUI", {
      configurable: true,
      value: {
        loadAssignmentSetupTerms: vi.fn().mockResolvedValue({ terms: [], diagnostics: [] }),
        previewAssignmentSetup: vi
          .fn()
          .mockRejectedValue(
            new Error("A registered course folder is required for assignment setup.")
          ),
        saveAssignmentSetup: vi.fn()
      } satisfies Partial<GraiderUIApi>
    });
    render(
      <AssignmentSetupPage
        courseFolder={courseFolder}
        onBack={vi.fn()}
        onOpenAssignment={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));

    expect(
      await screen.findByText("A registered course folder is required for assignment setup.")
    ).toBeInTheDocument();
  });
});
