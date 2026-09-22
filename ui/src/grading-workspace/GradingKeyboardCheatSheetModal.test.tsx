import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingKeyboardCheatSheetModal } from "./GradingKeyboardCheatSheetModal";

describe("GradingKeyboardCheatSheetModal", () => {
  it("renders the shortcut groups and calls onClose when dismissed", () => {
    const onClose = vi.fn();
    render(<GradingKeyboardCheatSheetModal open onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("Next student in the active filter")).toBeInTheDocument();
    expect(screen.getByText("Next student in the full roster")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close keyboard shortcuts" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    render(<GradingKeyboardCheatSheetModal open={false} onClose={() => undefined} />);

    expect(screen.queryByRole("heading", { name: "Keyboard shortcuts" })).toBeNull();
  });
});
