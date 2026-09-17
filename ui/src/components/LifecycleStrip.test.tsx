import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LifecycleStrip } from "./LifecycleStrip";

describe("LifecycleStrip", () => {
  it("renders each step with a state-specific modifier class", () => {
    render(
      <LifecycleStrip
        steps={[
          { id: "created", label: "Created", detail: "Jun 1", state: "complete" },
          { id: "applied", label: "Applied", detail: "24 repositories", state: "current" },
          { id: "submissions", label: "Submissions", state: "upcoming" },
          {
            id: "grading",
            label: "Grading",
            detail: "Template repository missing",
            state: "blocked"
          }
        ]}
      />
    );

    expect(screen.getByText("Created").closest("li")).toHaveClass(
      "lifecycle-strip__step--complete"
    );
    expect(screen.getByText("Applied").closest("li")).toHaveClass("lifecycle-strip__step--current");
    expect(screen.getByText("Submissions").closest("li")).toHaveClass(
      "lifecycle-strip__step--upcoming"
    );
    const blocked = screen.getByText("Grading").closest("li");
    expect(blocked).toHaveClass("lifecycle-strip__step--blocked");
    expect(screen.getByText("Template repository missing")).toBeInTheDocument();
  });

  it("does not render a chevron before the first step", () => {
    render(
      <LifecycleStrip
        steps={[
          { id: "created", label: "Created", state: "complete" },
          { id: "applied", label: "Applied", state: "current" }
        ]}
      />
    );

    const steps = screen.getAllByRole("listitem");
    expect(steps[0]?.querySelector(".lifecycle-strip__chevron")).toBeNull();
    expect(steps[1]?.querySelector(".lifecycle-strip__chevron")).not.toBeNull();
  });
});
