import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GradingStudentSourceDto } from "./submissionSourceView";

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({ studentId }: { readonly studentId: string }) => (
    <div data-testid="mock-monaco">Source for {studentId}</div>
  )
}));

import { GradingSubmissionViewerPane } from "./GradingSubmissionViewerPane";

const model: GradingStudentSourceDto = {
  status: "success",
  studentId: "ada",
  combinedText: "class Main {}",
  sections: [
    {
      status: "found",
      file: "src/Main.java",
      sourceText: "class Main {}",
      sourceLineCount: 1,
      combinedStartLine: 1,
      combinedEndLine: 1,
      insertionLine: 1
    }
  ],
  syntheticCombinedLines: []
};

const baseProps = {
  hasSelectedStudent: true,
  viewStateWarning: undefined,
  snapshotStudentId: undefined,
  sourceAnnotations: [],
  canonicalSourceTarget: undefined,
  gradingMutationStudentId: undefined,
  isStudentMutationBlocked: () => false,
  onCanonicalSelectionChange: vi.fn(),
  onScheduleViewStateSave: vi.fn(),
  onAddComment: vi.fn(),
  sourceTargetLabel: (target: { file: string; startLine: number; endLine: number }) =>
    `${target.file}:${target.startLine}-${target.endLine}`
};

describe("GradingSubmissionViewerPane", () => {
  it("prompts to select a student when none is selected", () => {
    render(
      <GradingSubmissionViewerPane
        {...baseProps}
        hasSelectedStudent={false}
        source={{ status: "idle" }}
      />
    );

    expect(screen.getByText("Select a student to begin.")).toBeInTheDocument();
  });

  it("renders the source viewer and an Add Comment button disabled until a range is selected", async () => {
    const onAddComment = vi.fn();
    render(
      <GradingSubmissionViewerPane
        {...baseProps}
        onAddComment={onAddComment}
        source={{ status: "success", source: model, initialViewState: null, autosaveEnabled: true }}
      />
    );

    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("Source for ada");
    expect(screen.getByRole("button", { name: "Add Comment" })).toBeDisabled();
    expect(
      screen.getByText("Select a source line or range to add an anchored comment.")
    ).toBeInTheDocument();
  });

  it("enables Add Comment once a source range is selected, and reports the selected range", async () => {
    const onAddComment = vi.fn();
    render(
      <GradingSubmissionViewerPane
        {...baseProps}
        onAddComment={onAddComment}
        canonicalSourceTarget={{ file: "src/Main.java", startLine: 1, endLine: 1 }}
        source={{ status: "success", source: model, initialViewState: null, autosaveEnabled: true }}
      />
    );

    await screen.findByTestId("mock-monaco");
    const button = screen.getByRole("button", { name: "Add Comment" });
    expect(button).toBeEnabled();
    expect(screen.getByText("Selected source: src/Main.java:1-1")).toBeInTheDocument();
    fireEvent.click(button);
    expect(onAddComment).toHaveBeenCalledTimes(1);
  });
});
