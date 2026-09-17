import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnsavedChangesBar } from "./UnsavedChangesBar";

describe("UnsavedChangesBar", () => {
  it("renders the plain-English summary and both actions", () => {
    render(
      <UnsavedChangesBar
        message="6 unsaved changes — 3 added, 1 dropped, 2 changed"
        onDiscard={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(
      screen.getByText("6 unsaved changes — 3 added, 1 dropped, 2 changed")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and save" })).toBeInTheDocument();
  });

  it("calls onDiscard and onSave", () => {
    const onDiscard = vi.fn();
    const onSave = vi.fn();
    render(<UnsavedChangesBar message="1 unsaved change" onDiscard={onDiscard} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("disables both actions and shows Saving… while saving", () => {
    render(
      <UnsavedChangesBar message="1 unsaved change" onDiscard={vi.fn()} onSave={vi.fn()} saving />
    );

    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
