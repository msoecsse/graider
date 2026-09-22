import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraiderUIApi } from "../../electron/ipc";
import type { AssignmentDetailSelection } from "../assignment-detail/assignmentDetailTypes";
import { AssignmentEditPage } from "./AssignmentEditPage";

const selection: AssignmentDetailSelection = {
  courseFolderId: "course",
  courseFolderPath: "/courses/csc1120",
  assignmentFile: "terms/27s1/assignments/lab04/assignment.yml",
  assignmentTitle: "Lab 04",
  assignmentSlug: "lab04",
  assignmentStatus: "active",
  courseTitle: "CSC1120",
  courseSlug: "csc1120",
  termTitle: "Spring 2027",
  termSlug: "27s1"
};

const assignment = {
  assignmentFile: selection.assignmentFile,
  assignmentSlug: "lab04",
  termCode: "27s1",
  assignmentTitle: "Lab 04",
  assignmentStatus: "active",
  sectionIds: ["001"],
  templateRepository: "",
  templateBranch: "",
  dueAt: "2027-01-01T12:00:00-06:00",
  latePolicy: "none",
  gradingEnabled: true,
  points: 100,
  gradingCategory: "labs",
  facultyOwner: "jones",
  lmsAssignmentId: null,
  workflow: "",
  gradingMode: null,
  gradingPreset: null,
  artifact: "",
  resultFile: "",
  requiredFiles: ["src/Main.java"],
  rubric: [{ id: "style", name: "Code style", points: 10 }],
  gradingConfigurationPresent: true,
  originalContent: "schema_version: 1\n"
};

const typeText = (input: HTMLInputElement, value: string): void => {
  input.focus();
  for (const character of value) {
    fireEvent.input(input, { target: { value: `${input.value}${character}` } });
    expect(document.activeElement).toBe(input);
  }
};

const setup = (api: Partial<GraiderUIApi> = {}) => {
  const getAssignmentForEdit = vi.fn().mockResolvedValue({
    status: "ready",
    model: assignment,
    terms: [{ code: "27s1", sections: ["001"] }],
    diagnostics: []
  });
  const previewAssignmentEdit = vi.fn().mockResolvedValue({
    status: "ready",
    path: selection.assignmentFile,
    content: "schema_version: 1\n",
    diagnostics: []
  });
  const saveAssignmentEdit = vi.fn().mockResolvedValue({
    status: "success",
    path: selection.assignmentFile,
    diagnostics: []
  });
  const onSaved = vi.fn();
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: {
      getAssignmentForEdit,
      previewAssignmentEdit,
      saveAssignmentEdit,
      ...api
    } satisfies Partial<GraiderUIApi>
  });
  render(<AssignmentEditPage selection={selection} onBack={vi.fn()} onSaved={onSaved} />);
  return { onSaved, previewAssignmentEdit, saveAssignmentEdit };
};

const getPanel = (name: string): HTMLElement => {
  const heading = screen.getByRole("heading", { name });
  if (heading.parentElement === null) throw new Error(`Missing ${name} panel.`);
  return heading.parentElement;
};

describe("AssignmentEditPage editable rows", () => {
  it("keeps loaded required-file and rubric inputs focused while typing successive characters", async () => {
    setup();
    const requiredFile = (await screen.findByRole("textbox", {
      name: "Required file 1"
    })) as HTMLInputElement;
    fireEvent.input(requiredFile, { target: { value: "" } });
    typeText(requiredFile, "src/App.java");

    const rubricId = screen.getByRole("textbox", { name: "Rubric ID 1" }) as HTMLInputElement;
    const rubricName = screen.getByRole("textbox", {
      name: "Rubric name 1"
    }) as HTMLInputElement;
    const rubricPoints = screen.getByRole("spinbutton", {
      name: "Rubric points 1"
    }) as HTMLInputElement;
    fireEvent.input(rubricId, { target: { value: "" } });
    fireEvent.input(rubricName, { target: { value: "" } });
    fireEvent.input(rubricPoints, { target: { value: "" } });
    typeText(rubricId, "tests");
    typeText(rubricName, "Automated tests");
    typeText(rubricPoints, "15");
  });

  it("preserves logical rows through add, reorder, removal, preview, and save", async () => {
    const { onSaved, previewAssignmentEdit, saveAssignmentEdit } = setup();
    await screen.findByRole("textbox", { name: "Required file 1" });
    const requiredFiles = within(getPanel("Required files"));
    const rubric = within(getPanel("Rubric"));

    fireEvent.click(requiredFiles.getByRole("button", { name: "Add required file" }));
    fireEvent.input(requiredFiles.getByRole("textbox", { name: "Required file 2" }), {
      target: { value: "src/Test.java" }
    });
    fireEvent.click(requiredFiles.getAllByRole("button", { name: "Down" })[0] as HTMLButtonElement);
    expect(requiredFiles.getByRole("textbox", { name: "Required file 1" })).toHaveValue(
      "src/Test.java"
    );
    fireEvent.click(
      requiredFiles.getAllByRole("button", { name: "Remove" })[1] as HTMLButtonElement
    );
    expect(requiredFiles.getByRole("textbox", { name: "Required file 1" })).toHaveValue(
      "src/Test.java"
    );

    fireEvent.click(rubric.getByRole("button", { name: "Add rubric category" }));
    fireEvent.input(rubric.getByRole("textbox", { name: "Rubric ID 2" }), {
      target: { value: "tests" }
    });
    fireEvent.input(rubric.getByRole("textbox", { name: "Rubric name 2" }), {
      target: { value: "Automated tests" }
    });
    fireEvent.input(rubric.getByRole("spinbutton", { name: "Rubric points 2" }), {
      target: { value: "20" }
    });
    fireEvent.click(rubric.getAllByRole("button", { name: "Down" })[0] as HTMLButtonElement);
    expect(rubric.getByRole("textbox", { name: "Rubric ID 1" })).toHaveValue("tests");
    fireEvent.click(rubric.getAllByRole("button", { name: "Remove" })[1] as HTMLButtonElement);
    expect(rubric.getByRole("textbox", { name: "Rubric ID 1" })).toHaveValue("tests");

    fireEvent.click(screen.getByRole("button", { name: "Save assignment changes" }));
    await waitFor(() => expect(previewAssignmentEdit).toHaveBeenCalledOnce());
    const [request] = previewAssignmentEdit.mock.calls[0] ?? [];
    expect(request).toMatchObject({
      requiredFiles: ["src/Test.java"],
      rubric: [{ id: "tests", name: "Automated tests", points: 20 }]
    });
    expect(JSON.stringify(request)).not.toContain('"key"');

    const dialog = await screen.findByRole("dialog", { name: "Save assignment changes?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save assignment changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(saveAssignmentEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredFiles: ["src/Test.java"],
        rubric: [{ id: "tests", name: "Automated tests", points: 20 }],
        confirmed: true
      })
    );
  });
});
