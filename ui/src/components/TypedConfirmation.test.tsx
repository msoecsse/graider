import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isTypedConfirmationSatisfied, TypedConfirmation } from "./TypedConfirmation";

describe("isTypedConfirmationSatisfied", () => {
  it("requires an exact match", () => {
    expect(isTypedConfirmationSatisfied("lab02", "lab02")).toBe(true);
    expect(isTypedConfirmationSatisfied("lab02", "lab0")).toBe(false);
    expect(isTypedConfirmationSatisfied("lab02", "lab02 ")).toBe(false);
    expect(isTypedConfirmationSatisfied("lab02", "")).toBe(false);
  });
});

describe("TypedConfirmation", () => {
  it("labels the input with the word to type", () => {
    render(<TypedConfirmation word="lab02" value="" onChange={() => undefined} />);

    expect(screen.getByText("lab02")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Type lab02 to confirm/u })).toBeInTheDocument();
  });
});
