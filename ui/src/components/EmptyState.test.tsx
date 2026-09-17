import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders a title and description with no action by default", () => {
    render(<EmptyState title="No students yet" description="Upload a roster to get started." />);

    expect(screen.getByRole("heading", { name: "No students yet" })).toBeInTheDocument();
    expect(screen.getByText("Upload a roster to get started.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the fill-it action and invokes its handler", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No students yet"
        description="Upload a roster to get started."
        action={{ label: "Upload roster", onClick }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload roster" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
