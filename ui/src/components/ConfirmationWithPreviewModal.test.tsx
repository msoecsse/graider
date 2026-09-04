import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationWithPreviewModal } from "./ConfirmationWithPreviewModal";

const renderModal = (
  overrides: Partial<ComponentProps<typeof ConfirmationWithPreviewModal>> = {}
) => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);

  render(
    <ConfirmationWithPreviewModal
      isOpen
      title="Save roster changes"
      summary="12 student records will be updated."
      preview={<pre>student_id,github_username</pre>}
      confirmLabel="Save changes"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />
  );

  return { onCancel, onConfirm };
};

describe("ConfirmationWithPreviewModal", () => {
  it("presents the change summary and optional preview in an accessible dialog", () => {
    renderModal();

    const dialog = screen.getByRole("dialog", { name: "Save roster changes" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    expect(screen.getByText("12 student records will be updated.")).toBeInTheDocument();
    expect(screen.getByText("student_id,github_username")).toBeInTheDocument();
  });

  it("requires acknowledgement when configured and executes confirmation asynchronously", async () => {
    const { onConfirm } = renderModal({
      acknowledgementLabel: "I understand this replaces the existing roster."
    });

    const confirm = screen.getByRole("button", { name: "Save changes" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I understand this replaces the existing roster."));
    fireEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("status")).toHaveTextContent("Changes saved.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the dialog open and reports an async confirmation failure", async () => {
    renderModal({ onConfirm: vi.fn().mockRejectedValue(new Error("Network unavailable")) });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables actions while confirmation is running", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    renderModal({ onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    resolveConfirm();
    expect(await screen.findByRole("status")).toHaveTextContent("Changes saved.");
  });

  it("cancels with Escape unless confirmation is executing", () => {
    const { onCancel } = renderModal();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("honors an external confirmation blocker and renders supplemental content", () => {
    renderModal({
      confirmDisabled: true,
      supplementalContent: <p>3 repositories would be created.</p>
    });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText("3 repositories would be created.")).toBeInTheDocument();
  });
});
