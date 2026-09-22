import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssignmentTemplateSyncExecutionResult } from "../../electron/ipc";
import { TemplateSyncResultsPanel } from "./TemplateSyncResultsPanel";

describe("TemplateSyncResultsPanel", () => {
  it("renders one outcome label per student, a pull request link, and the processed-count summary", () => {
    const result: AssignmentTemplateSyncExecutionResult = {
      status: "partial_success",
      outcomes: [
        { studentId: "s001", status: "updated" },
        { studentId: "s002", status: "already_current" },
        {
          studentId: "s003",
          status: "pull_request_created",
          pullRequest: { number: 31, url: "https://github.com/org/repo/pull/31" }
        },
        {
          studentId: "s004",
          status: "failed",
          failureStage: "push_failed",
          message: "Push to student repository was rejected."
        }
      ]
    };

    render(<TemplateSyncResultsPanel result={result} />);

    expect(screen.getByText("4 student repositories processed.")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getByText("Already current")).toBeInTheDocument();
    expect(screen.getByText("Pull request created — student action required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open pull request #31" })).toHaveAttribute(
      "href",
      "https://github.com/org/repo/pull/31"
    );
    expect(screen.getByText("Push to student repository was rejected.")).toBeInTheDocument();
  });

  it("shows the blocker message when the whole sync failed to start", () => {
    const result: AssignmentTemplateSyncExecutionResult = {
      status: "failure",
      outcomes: [],
      blocker: { code: "github_token_required", message: "GitHub authentication is required." }
    };

    render(<TemplateSyncResultsPanel result={result} />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("GitHub authentication is required.")).toBeInTheDocument();
  });
});
