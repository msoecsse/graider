import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudentRepositoryAccessPageResult } from "../../electron/ipc";
import { StudentRepositoryAccessPagePanel } from "./StudentRepositoryAccessPagePanel";

const createResult = (
  overrides: Partial<StudentRepositoryAccessPageResult> = {}
): StudentRepositoryAccessPageResult => ({
  schemaVersion: 1,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  termCode: "27s1",
  assignmentSlug: "lab02",
  outputPath: "terms/27s1/notifications/lab02/student-repositories.html",
  pagesRepository: "csc1120/csc1120pages",
  pagesRepositoryFolderSelected: true,
  pagesUrl:
    "https://graider-sandbox.github.io/csc1120/terms/27s1/notifications/lab02/student-repositories.html",
  generatedAt: null,
  exists: false,
  status: "partial",
  summary: { activeStudents: 3, includedStudents: 2, skippedInactive: 1, missingRepository: 1 },
  rows: [],
  diagnostics: [],
  ...overrides
});

describe("StudentRepositoryAccessPagePanel", () => {
  it("prompts to configure Student Access Pages when no Pages repository is set", () => {
    render(
      <StudentRepositoryAccessPagePanel
        result={createResult({ pagesRepository: null, pagesUrl: null })}
        isGenerating={false}
        isSelectingPagesFolder={false}
        copyFeedback={null}
        onGenerate={vi.fn()}
        onSelectPagesFolder={vi.fn()}
        onSaveConfig={vi.fn()}
        isSavingConfig={false}
        configFeedback={null}
        defaultRepository="csc1120/csc1120pages"
        onCopy={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        "A Pages repository must be configured before Graider can generate a public student access page."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Configure Student Access Pages" })
    ).toBeInTheDocument();
  });

  it("shows the Canvas link and copies it when everything is configured", () => {
    const onCopy = vi.fn();
    render(
      <StudentRepositoryAccessPagePanel
        result={createResult()}
        isGenerating={false}
        isSelectingPagesFolder={false}
        copyFeedback="Copied"
        onGenerate={vi.fn()}
        onSelectPagesFolder={vi.fn()}
        onSaveConfig={vi.fn()}
        isSavingConfig={false}
        configFeedback={null}
        defaultRepository="csc1120/csc1120pages"
        onCopy={onCopy}
      />
    );

    const link = screen.getByRole("link", {
      name: "https://graider-sandbox.github.io/csc1120/terms/27s1/notifications/lab02/student-repositories.html"
    });
    expect(link).toHaveAttribute(
      "href",
      "https://graider-sandbox.github.io/csc1120/terms/27s1/notifications/lab02/student-repositories.html"
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Canvas link" }));
    expect(onCopy).toHaveBeenCalledWith(
      "https://graider-sandbox.github.io/csc1120/terms/27s1/notifications/lab02/student-repositories.html"
    );
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("calls onGenerate from the primary action, labelled Regenerate once the page already exists", () => {
    const onGenerate = vi.fn();
    render(
      <StudentRepositoryAccessPagePanel
        result={createResult({ exists: true })}
        isGenerating={false}
        isSelectingPagesFolder={false}
        copyFeedback={null}
        onGenerate={onGenerate}
        onSelectPagesFolder={vi.fn()}
        onSaveConfig={vi.fn()}
        isSavingConfig={false}
        configFeedback={null}
        defaultRepository="csc1120/csc1120pages"
        onCopy={vi.fn()}
      />
    );

    const button = screen.getByRole("button", { name: "Regenerate student access page" });
    fireEvent.click(button);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});
