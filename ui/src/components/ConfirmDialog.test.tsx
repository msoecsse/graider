import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Save roster changes"
        summary="6 unsaved changes"
        confirmLabel="Review and save"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the diff as labelled, typed rows instead of raw content", () => {
    render(
      <ConfirmDialog
        isOpen
        title="Save roster changes"
        summary="6 unsaved changes"
        diff={[
          { id: "s1", type: "added", label: "Ada Lovelace", detail: "Section 001" },
          { id: "s2", type: "removed", label: "Grace Hopper" }
        ]}
        confirmLabel="Review and save"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Section 001")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
  });

  it("never renders a success message inside the dialog", () => {
    render(
      <ConfirmDialog
        isOpen
        title="Save roster changes"
        summary="6 unsaved changes"
        confirmLabel="Review and save"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText(/changes saved/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("calls onConfirm and onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Save roster changes"
        summary="6 unsaved changes"
        confirmLabel="Review and save"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Delete assignment"
        summary="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("requires the exact confirmation word before enabling Confirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Delete assignment"
        summary="This cannot be undone."
        confirmLabel="Delete"
        confirmationWord="lab02"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    const input = screen.getByRole("textbox");

    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "lab0" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "lab02" } });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
