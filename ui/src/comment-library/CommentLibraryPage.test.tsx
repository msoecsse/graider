import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentLibraryPage } from "./CommentLibraryPage";

const comment = {
  id: "comment-1",
  title: "Loop bounds",
  text: "Check `index < length`.",
  defaultDeduction: -2,
  tags: ["Loops", "Java"]
};

const mockGraiderUI = (overrides: Record<string, unknown> = {}): void => {
  Object.defineProperty(window, "graiderUI", {
    configurable: true,
    value: {
      loadGradingCommentLibrary: vi
        .fn()
        .mockResolvedValue({ status: "success", comments: [comment] }),
      createGradingLibraryComment: vi.fn(),
      editGradingLibraryComment: vi.fn(),
      deleteGradingLibraryComment: vi.fn(),
      ...overrides
    }
  });
};

const renderPage = (): void => {
  render(
    <CommentLibraryPage
      courseFolderId="course-folder-csc1120"
      courseTermLabel="CSC1120 · Spring 2027"
      termCode="27s1"
    />
  );
};

describe("CommentLibraryPage", () => {
  it("loads through the registered course ID and canonical term, with no Apply action", async () => {
    const loadGradingCommentLibrary = vi
      .fn()
      .mockResolvedValue({ status: "success", comments: [comment] });
    mockGraiderUI({ loadGradingCommentLibrary });
    renderPage();

    expect(await screen.findByText("Loop bounds")).toBeInTheDocument();
    expect(loadGradingCommentLibrary).toHaveBeenCalledWith({
      courseFolderId: "course-folder-csc1120",
      termCode: "27s1"
    });
    expect(screen.queryByRole("button", { name: /Apply/u })).not.toBeInTheDocument();
    expect(screen.getByText("index < length").tagName).toBe("CODE");
  });

  it("shows the useful empty state and starts new comments with category None", async () => {
    mockGraiderUI({
      loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] })
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "New Comment" }));
    expect(screen.getByRole("heading", { name: "New Comment" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Default rubric category" })).toHaveValue("");
  });

  it("keeps a local create when publication fails and reports recovery guidance", async () => {
    const created = { ...comment, id: "comment-2", title: "Whitespace" };
    const createGradingLibraryComment = vi.fn().mockResolvedValue({
      status: "success",
      comment: created,
      diagnostics: [],
      publication: { status: "failure", diagnostics: [] }
    });
    mockGraiderUI({
      loadGradingCommentLibrary: vi
        .fn()
        .mockResolvedValue({ status: "success", comments: [comment] }),
      createGradingLibraryComment
    });
    renderPage();

    await screen.findByText("Loop bounds");
    fireEvent.click(screen.getByRole("button", { name: "New Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Whitespace" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Comment text" }), {
      target: { value: "Use consistent whitespace." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));

    expect(await screen.findByText("Whitespace")).toBeInTheDocument();
    expect(
      screen.getByText(/saved locally, but the shared course repository could not be published/u)
    ).toBeInTheDocument();
    expect(createGradingLibraryComment).toHaveBeenCalledWith(
      expect.objectContaining({ courseFolderId: "course-folder-csc1120", termCode: "27s1" })
    );
  });

  it("confirms deletion and leaves applied student comments explicitly untouched", async () => {
    const deleteGradingLibraryComment = vi.fn().mockResolvedValue({
      status: "success",
      diagnostics: [],
      publication: { status: "success", diagnostics: [] }
    });
    mockGraiderUI({ deleteGradingLibraryComment });
    renderPage();

    await screen.findByText("Loop bounds");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Comments already applied to students are unchanged."
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete reusable comment" }));
    await waitFor(() => expect(screen.queryByText("Loop bounds")).not.toBeInTheDocument());
  });
});
