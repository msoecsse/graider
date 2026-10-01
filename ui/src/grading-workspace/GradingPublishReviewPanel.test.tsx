import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingPublishReviewPanel } from "./GradingPublishReviewPanel";

describe("GradingPublishReviewPanel", () => {
  it("renders a retry action only for unavailable publish-review details", () => {
    const onRetryDetail = vi.fn();
    render(
      <GradingPublishReviewPanel
        readyRows={[
          {
            studentId: "ada",
            section: "001",
            detail: { status: "unavailable" }
          },
          {
            studentId: "grace",
            section: "002",
            detail: { status: "success", scoreLabel: "10 / 10", summaryLabel: "No comments" }
          }
        ]}
        publishedRows={[]}
        notGradedCount={0}
        selectedIds={["ada", "grace"]}
        onToggle={vi.fn()}
        onCancel={vi.fn()}
        onPublish={vi.fn()}
        onRetryDetail={onRetryDetail}
        running={false}
        refreshFailedStudentIds={[]}
      />
    );

    expect(screen.getByText("Score unavailable")).toBeInTheDocument();
    expect(screen.getByText("Report contents unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryDetail).toHaveBeenCalledWith("ada");
  });
});
