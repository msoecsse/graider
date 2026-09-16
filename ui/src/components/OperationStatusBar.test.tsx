import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationStatusBar } from "./OperationStatusBar";

describe("OperationStatusBar", () => {
  it("renders its label, detail, accessible status, and indeterminate progress", () => {
    render(
      <OperationStatusBar
        label="Applying assignment"
        detail="Creating and updating student repositories..."
      />
    );

    expect(screen.getByText("Applying assignment")).toBeInTheDocument();
    expect(screen.getByText("Creating and updating student repositories...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByRole("progressbar", { name: "Applying assignment progress" })
    ).toHaveAttribute("aria-valuetext", "In progress");
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });
});
