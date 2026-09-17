import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("defaults to the neutral variant", () => {
    render(<StatusChip label="Published" />);

    expect(screen.getByText("Published")).toHaveClass("status-chip");
  });

  it.each([
    ["success", "status-chip--success"],
    ["warning", "status-chip--attention"],
    ["error", "status-chip--error"],
    ["info", "status-chip--info"]
  ] as const)("maps the %s variant to %s", (variant, expectedClass) => {
    render(<StatusChip label="Status" variant={variant} />);

    expect(screen.getByText("Status")).toHaveClass(expectedClass);
  });
});
