import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudentRepositoryAccessPagePublishResult } from "../../electron/ipc";
import { StudentRepositoryAccessPagePublishPanel } from "./StudentRepositoryAccessPagePublishPanel";

const createResult = (
  overrides: Partial<StudentRepositoryAccessPagePublishResult> = {}
): StudentRepositoryAccessPagePublishResult => ({
  schemaVersion: 1,
  assignmentFile: "terms/27s1/assignments/lab02/assignment.yml",
  termCode: "27s1",
  assignmentSlug: "lab02",
  outputPath: "terms/27s1/notifications/lab02/student-repositories.html",
  pagesUrl: "https://graider-sandbox.github.io/csc1120/student-repositories.html",
  status: "uncommitted",
  checks: {
    pagesRepositoryFolderSelected: true,
    fileExists: true,
    isGitRepository: true,
    currentBranch: "main",
    hasUncommittedAccessPage: true,
    hasUncommittedOtherChanges: false,
    upstreamBranch: "origin/main",
    aheadCount: 0,
    behindCount: 0,
    pagesUrlAvailable: true,
    remoteMatchesConfiguredRepository: true
  },
  suggestedCommands: [],
  diagnostics: [],
  pagesRepositoryFolderPath: "/Users/sean/dev/csc1120pages",
  ...overrides
});

describe("StudentRepositoryAccessPagePublishPanel", () => {
  it("shows the review step and publishes on confirm", () => {
    const onPublish = vi.fn();
    render(
      <StudentRepositoryAccessPagePublishPanel
        result={createResult()}
        copyFeedback={null}
        onCopy={vi.fn()}
        onPublish={onPublish}
        isPublishing={false}
        publishResult={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish Student Access Page" }));

    const review = screen.getByRole("region", { name: "Publish Student Access Page review" });
    expect(within(review).getByText("/Users/sean/dev/csc1120pages")).toBeInTheDocument();

    fireEvent.click(
      within(review).getByRole("button", { name: "Confirm Publish Student Access Page" })
    );
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("shows the publish result and copyable suggested commands", () => {
    render(
      <StudentRepositoryAccessPagePublishPanel
        result={createResult({
          suggestedCommands: ["git add .", "git commit -m 'Publish'", "git push"]
        })}
        copyFeedback="Copied"
        onCopy={vi.fn()}
        onPublish={vi.fn()}
        isPublishing={false}
        publishResult={{
          status: "success",
          diagnostics: [{ message: "Student access page published." }],
          commitMessage: "Publish Lab 02 student repository access page"
        }}
      />
    );

    expect(screen.getByText("Student access page published.")).toHaveClass("success-message");
    expect(screen.getByText("git add .", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy commands" }));
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });
});
