import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GradingFooterHintBar } from "./GradingFooterHintBar";

describe("GradingFooterHintBar", () => {
  it("renders the keyboard shortcut hints and the autosave status", () => {
    render(<GradingFooterHintBar />);

    expect(screen.getByRole("list", { name: "Keyboard shortcut hints" })).toBeInTheDocument();
    expect(screen.getByText("Next student")).toBeInTheDocument();
    expect(screen.getByText("Saved automatically")).toBeInTheDocument();
  });
});
