import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingCommentLibraryBrowser, type ReusableComment } from "./GradingCommentLibraryBrowser";

const comment: ReusableComment = {
  id: "r1",
  title: "Off-by-one",
  text: "Check your loop bounds.",
  defaultDeduction: -2,
  tags: ["loops"]
};

const baseProps = {
  commentLibrary: { status: "success" as const, comments: [comment] },
  commentSearch: "",
  onSearchChange: vi.fn(),
  availableCommentTags: ["loops"],
  selectedCommentTags: [],
  onTagsChange: vi.fn(),
  matchingComments: [comment],
  studentId: "ada",
  gradingMutationStudentId: undefined,
  isStudentMutationBlocked: () => false,
  onApply: vi.fn()
};

describe("GradingCommentLibraryBrowser", () => {
  it("renders matching comments and applies one on click", () => {
    const onApply = vi.fn();
    render(<GradingCommentLibraryBrowser {...baseProps} onApply={onApply} />);

    expect(screen.getByText("Check your loop bounds.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Off-by-one" }));
    expect(onApply).toHaveBeenCalledWith(comment);
  });

  it("disables Apply when no student is selected", () => {
    render(<GradingCommentLibraryBrowser {...baseProps} studentId={undefined} />);

    expect(screen.getByRole("button", { name: "Apply Off-by-one" })).toBeDisabled();
  });

  it("shows the loading and failure states instead of the browser", () => {
    const { rerender } = render(
      <GradingCommentLibraryBrowser {...baseProps} commentLibrary={{ status: "loading" }} />
    );
    expect(screen.getByText("Loading shared comments…")).toBeInTheDocument();

    rerender(
      <GradingCommentLibraryBrowser
        {...baseProps}
        commentLibrary={{ status: "failure", message: "Comment library unavailable." }}
      />
    );
    expect(screen.getByText("Comment library unavailable.")).toBeInTheDocument();
  });
});
