import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { registerExternalNavigation } from "../../electron/externalNavigation";
import { GradingWorkspacePage } from "./GradingWorkspacePage";

const REQUEST = {
  courseFolderId: "course-1",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1"
};
const ADA_URL = "https://github.com/course/custom-ada-repository";
const GRACE_URL = "https://github.com/course/shared-group-repository";

const configure = (repositoryUrls: readonly (string | undefined)[] = [ADA_URL, GRACE_URL]) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: [],
      rubric: [],
      students: ["ada", "grace"].map((studentId, index) => ({
        studentId,
        section: "001",
        gradingStatus: "not_started",
        repositoryUrl: repositoryUrls[index]
      }))
    }),
    markGradingStudentComplete: vi.fn()
  });
};

describe("grading workspace repository link", () => {
  it("opens the recorded repository through Electron's existing safe external navigation without changing grading", async () => {
    configure();
    render(<GradingWorkspacePage request={REQUEST} />);
    const link = await screen.findByRole("link", { name: "Open GitHub repository for ada" });
    expect(link).toBeVisible();
    expect(link.parentElement).toContainElement(screen.getByLabelText("Submission timing for ada"));
    expect(link).toHaveAttribute("href", ADA_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link.tabIndex).toBe(0);

    const openExternal = vi.fn().mockResolvedValue(undefined);
    const setWindowOpenHandler = vi.fn();
    registerExternalNavigation({ webContents: { setWindowOpenHandler, on: vi.fn() } } as never, {
      openExternal
    });
    const openHandler = setWindowOpenHandler.mock.calls[0]?.[0] as (details: { url: string }) => {
      action: string;
    };
    // JSDOM has no Electron default link action; dispatch its destination to
    // the real registered policy after checking the anchor's native contract.
    link.addEventListener("click", (event) => {
      event.preventDefault();
      expect(openHandler({ url: link.getAttribute("href") ?? "" })).toEqual({ action: "deny" });
    });
    fireEvent.click(link);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(ADA_URL);
    expect(screen.getByLabelText("Submission timing for ada")).toBeVisible();
    expect(window.graiderUI.prepareGradingWorkspace).toHaveBeenCalledTimes(1);
    expect(window.graiderUI.markGradingStudentComplete).not.toHaveBeenCalled();
    expect(window.graiderUI.getAssignmentGradeStatus).not.toHaveBeenCalled();

    await screen.findByRole("button", { name: "Preview Report" });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByRole("textbox", { name: "Comment" })).toBeVisible();
  });

  it("allows native Enter activation instead of marking the student complete", async () => {
    configure();
    render(<GradingWorkspacePage request={REQUEST} />);
    const link = await screen.findByRole("link", { name: "Open GitHub repository for ada" });
    await screen.findByRole("button", { name: "Preview Report" });
    act(() => link.focus());
    expect(link).toHaveFocus();
    expect(fireEvent.keyDown(link, { key: "Enter" })).toBe(true);
    expect(window.graiderUI.markGradingStudentComplete).not.toHaveBeenCalled();
  });

  it("updates immediately to the selected student's recorded group destination", async () => {
    configure();
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByRole("link", { name: "Open GitHub repository for ada" });
    fireEvent.click(screen.getByRole("button", { name: /grace · Section/u }));
    expect(
      await screen.findByRole("link", { name: "Open GitHub repository for grace" })
    ).toHaveAttribute("href", GRACE_URL);
    expect(screen.queryByRole("link", { name: "Open GitHub repository for ada" })).toBeNull();
  });

  it("omits a missing destination and removes the previous student's link", async () => {
    configure([ADA_URL, undefined]);
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByRole("link", { name: "Open GitHub repository for ada" });
    fireEvent.click(screen.getByRole("button", { name: /grace · Section/u }));
    await waitFor(() => expect(screen.getByLabelText("Submission timing for grace")).toBeVisible());
    expect(screen.queryByRole("link", { name: /Open GitHub repository/u })).toBeNull();
    expect(screen.getByLabelText("Submission timing for grace")).toHaveTextContent("grace");
  });
});
