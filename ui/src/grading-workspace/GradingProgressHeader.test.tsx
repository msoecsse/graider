import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingProgressHeader } from "./GradingProgressHeader";

const baseProps = {
  assignmentTitle: "Lab 02",
  termCode: "27s1",
  assignmentSlug: "lab02",
  allStudentsCount: 24,
  gradedOrPublishedCount: 7,
  publishedCount: 3,
  publishedProgressPercent: 12.5,
  gradedNotPublishedProgressPercent: 16.7,
  completeCount: 4,
  publishReviewOpen: false,
  onOpenPublishReview: vi.fn(),
  onOpenCheatSheet: vi.fn()
};

describe("GradingProgressHeader", () => {
  it("renders the assignment title, progress readout, and publish button", () => {
    const onOpenPublishReview = vi.fn();
    render(<GradingProgressHeader {...baseProps} onOpenPublishReview={onOpenPublishReview} />);

    expect(screen.getByRole("heading", { level: 1, name: "Lab 02" })).toBeInTheDocument();
    expect(screen.getByText("27s1 · lab02")).toBeInTheDocument();
    expect(screen.getByText("7 of 24 graded · 3 published")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish 4 reports" }));
    expect(onOpenPublishReview).toHaveBeenCalledTimes(1);
  });

  it("hides the progress readout and publish button when there are no students, or when publish review is open", () => {
    const { rerender } = render(<GradingProgressHeader {...baseProps} allStudentsCount={0} />);
    expect(screen.queryByText(/graded ·/)).toBeNull();

    rerender(<GradingProgressHeader {...baseProps} publishReviewOpen />);
    expect(screen.queryByRole("button", { name: /Publish \d+ reports?/ })).toBeNull();
  });
});
