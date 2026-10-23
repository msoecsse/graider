import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { GradingSubmissionViewerPane, type SourceLoadState } from "./GradingSubmissionViewerPane";
import type { GradingStudentDocumentRequest } from "../../electron/ipc";

const viewer = vi.hoisted(() => ({ mounts: vi.fn() }));
vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: () => {
    const [value, setValue] = useState("source position");
    return (
      <input
        aria-label="Source state"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  }
}));
vi.mock("./RepositoryDocumentViewer", () => ({
  RepositoryDocumentViewer: ({ request }: { request: GradingStudentDocumentRequest }) => {
    viewer.mounts(request);
    return (
      <p>
        Document for {request.studentId}: {request.file}
      </p>
    );
  }
}));
const request = {
  courseFolderId: "course",
  courseFolderPath: "/course",
  termCode: "27s1",
  assignmentSlug: "lab"
};
const source = (studentId = "ada", revision = "old"): SourceLoadState => ({
  status: "success",
  initialViewState: null,
  autosaveEnabled: true,
  source: {
    status: "success",
    studentId,
    documentRevision: revision,
    combinedText: "source",
    syntheticCombinedLines: [],
    documents: ["normal.pdf", "nested/Notes.DOCX"],
    sections: [
      {
        status: "found",
        file: "Main.java",
        sourceText: "source",
        combinedStartLine: 1,
        combinedEndLine: 1,
        sourceLineCount: 1,
        insertionLine: 1
      }
    ]
  }
});
const props = {
  request,
  hasSelectedStudent: true,
  viewStateWarning: undefined,
  snapshotStudentId: "ada",
  sourceAnnotations: [],
  canonicalSourceTarget: undefined,
  gradingMutationStudentId: undefined,
  isStudentMutationBlocked: () => false,
  onCanonicalSelectionChange: vi.fn(),
  onScheduleViewStateSave: vi.fn(),
  onAddComment: vi.fn(),
  sourceTargetLabel: () => "source"
};
describe("documents inside the grading source pane", () => {
  it("switches source/PDF/DOCX/source repeatedly while preserving source state and disabling anchored document comments", async () => {
    render(<GradingSubmissionViewerPane {...props} source={source()} />);
    const input = await screen.findByRole("textbox", { name: "Source state" });
    fireEvent.change(input, { target: { value: "saved editor position" } });
    const select = screen.getByRole("combobox", { name: "View submission file" });
    for (const file of ["normal.pdf", "nested/Notes.DOCX", "normal.pdf", ""]) {
      fireEvent.change(select, { target: { value: file } });
      if (file !== "") {
        expect(screen.getByText(`Document for ada: ${file}`)).toBeVisible();
        expect(screen.queryByRole("button", { name: "Add Comment" })).not.toBeInTheDocument();
      }
    }
    expect(input).toBeVisible();
    expect(input).toHaveValue("saved editor position");
    expect(props.onAddComment).not.toHaveBeenCalled();
    expect(props.onScheduleViewStateSave).not.toHaveBeenCalled();
    expect(props.onCanonicalSelectionChange).toHaveBeenCalledWith("ada", undefined);
  });
  it("resets the document on student navigation and repository refresh, allowing a fresh reopen", async () => {
    const { rerender } = render(<GradingSubmissionViewerPane {...props} source={source()} />);
    const select = screen.getByRole("combobox", { name: "View submission file" });
    fireEvent.change(select, { target: { value: "normal.pdf" } });
    rerender(<GradingSubmissionViewerPane {...props} source={source("ada", "new")} />);
    await waitFor(() => expect(select).toHaveValue(""));
    fireEvent.change(select, { target: { value: "normal.pdf" } });
    expect(screen.getByText("Document for ada: normal.pdf")).toBeVisible();
    rerender(<GradingSubmissionViewerPane {...props} source={source("grace", "other")} />);
    await waitFor(() => expect(select).toHaveValue(""));
    fireEvent.change(select, { target: { value: "nested/Notes.DOCX" } });
    expect(screen.getByText("Document for grace: nested/Notes.DOCX")).toBeVisible();
  });
});

it("opens source instead of the active repository document for comment navigation", async () => {
  const loaded = source();
  const { rerender } = render(<GradingSubmissionViewerPane {...props} source={loaded} />);
  await screen.findByRole("textbox", { name: "Source state" });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "normal.pdf" } });
  expect(screen.getByText("Document for ada: normal.pdf")).toBeVisible();
  rerender(
    <GradingSubmissionViewerPane
      {...props}
      source={loaded}
      navigation={{ target: { file: "Main.java", startLine: 1, endLine: 1 } }}
    />
  );
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(""));
  expect(screen.getByRole("textbox", { name: "Source state" })).toBeVisible();
});
