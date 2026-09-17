import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KbdHint } from "./KbdHint";

describe("KbdHint", () => {
  it("renders the key label inside a kbd element", () => {
    render(<KbdHint label="P" />);

    const kbd = screen.getByText("P");
    expect(kbd.tagName).toBe("KBD");
    expect(kbd).toHaveClass("kbd-hint");
  });
});
