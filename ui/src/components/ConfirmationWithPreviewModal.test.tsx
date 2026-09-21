import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationWithPreviewModal } from "./ConfirmationWithPreviewModal";

const renderModal = (
  overrides: Partial<ComponentProps<typeof ConfirmationWithPreviewModal>> = {}
) => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  // The default here never closes the modal (isOpen below is a static
  // `true`, not driven by caller state) -- exactly the "caller resolves
  // without closing" shape that PR7-1a fixes. Every test in this file that
  // does not override onSuccess is implicitly exercising that scenario.
  const onSuccess = vi.fn();

  render(
    <ConfirmationWithPreviewModal
      isOpen
      title="Save roster changes"
      summary="12 student records will be updated."
      preview={<pre>student_id,github_username</pre>}
      confirmLabel="Save changes"
      onCancel={onCancel}
      onConfirm={onConfirm}
      onSuccess={onSuccess}
      {...overrides}
    />
  );

  return { onCancel, onConfirm, onSuccess };
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
    const { onConfirm, onSuccess } = renderModal({
      acknowledgementLabel: "I understand this replaces the existing roster."
    });

    const confirm = screen.getByRole("button", { name: "Save changes" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I understand this replaces the existing roster."));
    fireEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(true);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Changes saved."));
  });

  it("requires the exact typed confirmation word before confirming", async () => {
    const { onConfirm } = renderModal({ confirmationWord: "lab02" });
    const confirm = screen.getByRole("button", { name: "Save changes" });
    const input = screen.getByRole("textbox", { name: /Type lab02 to confirm/u });

    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "lab0" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "lab02x" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "lab02" } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("resets the typed confirmation word on close, so a reopened modal does not start pre-confirmed", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const props = {
      title: "Remove section",
      summary: "This removes section 001.",
      confirmLabel: "Remove section",
      confirmationWord: "001",
      onCancel,
      onConfirm,
      onSuccess
    };
    const { rerender } = render(<ConfirmationWithPreviewModal isOpen {...props} />);

    fireEvent.change(screen.getByRole("textbox", { name: /Type 001 to confirm/u }), {
      target: { value: "001" }
    });
    expect(screen.getByRole("button", { name: "Remove section" })).not.toBeDisabled();

    rerender(<ConfirmationWithPreviewModal isOpen={false} {...props} />);
    rerender(<ConfirmationWithPreviewModal isOpen {...props} />);

    expect(screen.getByRole("textbox", { name: /Type 001 to confirm/u })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Remove section" })).toBeDisabled();
  });

  // README section 2.6: a modal never displays a success message inside
  // itself. This asserts the absence directly, since the component this
  // test previously asserted the opposite of the fix -- the in-modal
  // "Changes saved." message next to a still-enabled button was the bug.
  it("never renders a success message inside the dialog, and calls onSuccess instead", async () => {
    const { onSuccess } = renderModal({ successMessage: "Student repositories updated." });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Student repositories updated."));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Student repositories updated.")).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the confirm button disabled after a successful confirm, so a second click cannot resubmit", async () => {
    const { onConfirm, onSuccess } = renderModal();
    const confirm = screen.getByRole("button", { name: "Save changes" });

    fireEvent.click(confirm);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // PR7-1a regression: bbd6bee left isConfirming true after success so the
  // confirm button could not be clicked twice, but every exit (Cancel,
  // Confirm, Escape) was gated on that same flag. A caller whose onConfirm
  // resolves without closing the modal -- three real call sites do this,
  // see GradingWorkspacePage.tsx -- left the user with no way out short of
  // restarting the app. This must fail against bbd6bee.
  it("leaves Cancel and Escape usable after a successful confirm that the caller does not close, without weakening the double-submit guard", async () => {
    const { onCancel, onConfirm, onSuccess } = renderModal();
    const confirm = screen.getByRole("button", { name: "Save changes" });

    fireEvent.click(confirm);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

    // The double-submit fix is not weakened: Confirm stays disabled and a
    // second click still does not call onConfirm again.
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // But the user is not trapped: Cancel and Escape both work, because
    // nothing is "in flight" any more once onConfirm has resolved.
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).not.toBeDisabled();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("starts in a clean, enabled state if the modal is reopened after a successful confirm", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const props = {
      title: "Save roster changes",
      summary: "12 student records will be updated.",
      confirmLabel: "Save changes",
      onCancel,
      onConfirm,
      onSuccess
    };
    const { rerender } = render(<ConfirmationWithPreviewModal isOpen {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    // The caller closes the modal, then reopens it for a fresh confirmation.
    rerender(<ConfirmationWithPreviewModal isOpen={false} {...props} />);
    rerender(<ConfirmationWithPreviewModal isOpen {...props} />);

    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });

  it("keeps the dialog open and reports an async confirmation failure, with the button usable to retry", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(undefined);
    const { onSuccess } = renderModal({ onConfirm });

    const confirm = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(confirm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirm).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Changes saved."));
  });

  it("disables actions while confirmation is running", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    const { onSuccess } = renderModal({ onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    resolveConfirm();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Changes saved."));
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
