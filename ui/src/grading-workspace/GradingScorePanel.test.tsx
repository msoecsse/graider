import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GradingScorePanel, type SnapshotGrade } from "./GradingScorePanel";

describe("GradingScorePanel", () => {
  it("renders the total score and each rubric category", () => {
    const grade: SnapshotGrade = {
      totalScore: 85,
      pointsPossible: 100,
      uncategorizedCommentAdjustmentTotal: 0,
      categories: [
        {
          id: "correctness",
          name: "Correctness",
          score: 40,
          pointsPossible: 50,
          categorizedCommentAdjustmentTotal: 0,
          manualAdjustmentTotal: 0
        }
      ]
    };

    render(<GradingScorePanel grade={grade} />);

    expect(screen.getByText("85 / 100")).toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("40 / 50")).toBeInTheDocument();
  });

  it("shows the manual-entry message and no category list when no rubric is configured", () => {
    const grade: SnapshotGrade = {
      totalScore: 0,
      pointsPossible: 0,
      uncategorizedCommentAdjustmentTotal: 0,
      categories: []
    };

    render(<GradingScorePanel grade={grade} />);

    expect(screen.getByText("No rubric — enter a score manually")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Rubric categories" })).toBeNull();
  });
});
