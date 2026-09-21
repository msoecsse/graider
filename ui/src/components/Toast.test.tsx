import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Toast, useToast } from "./Toast";

const Harness = (): ReactElement => {
  const { message, showToast } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast("Changes saved.")}>
        Raise
      </button>
      <Toast message={message} />
    </>
  );
};

describe("Toast", () => {
  it("renders nothing until a toast is raised", () => {
    render(<Harness />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the message with role status and aria-live polite once raised", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Raise" }));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Changes saved.");
    expect(toast).toHaveAttribute("aria-live", "polite");
  });

  it("auto-dismisses after its duration", () => {
    vi.useFakeTimers();
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Raise" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });
});
