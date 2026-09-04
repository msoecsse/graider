import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface ConfirmationWithPreviewModalProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly summary: ReactNode;
  readonly preview?: ReactNode;
  readonly supplementalContent?: ReactNode;
  readonly acknowledgementLabel?: string;
  readonly confirmDisabled?: boolean;
  readonly confirmLabel: string;
  readonly successMessage?: string;
  readonly onConfirm: (acknowledged: boolean) => Promise<void> | void;
  readonly onCancel: () => void;
}

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );

export const ConfirmationWithPreviewModal = ({
  isOpen,
  title,
  summary,
  preview,
  supplementalContent,
  acknowledgementLabel,
  confirmDisabled = false,
  confirmLabel,
  successMessage = "Changes saved.",
  onConfirm,
  onCancel
}: ConfirmationWithPreviewModalProps): ReactNode => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const titleId = useId();
  const summaryId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setAcknowledged(false);
      setIsConfirming(false);
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = async (): Promise<void> => {
    if (isConfirming || confirmDisabled || (acknowledgementLabel !== undefined && !acknowledged)) {
      return;
    }

    setIsConfirming(true);
    setFeedback(null);

    try {
      await onConfirm(acknowledged);
      setFeedback({ type: "success", message: successMessage });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save changes."
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape" && !isConfirming) {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="confirmation-modal__backdrop">
      <div
        aria-describedby={summaryId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirmation-modal"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="confirmation-modal__summary" id={summaryId}>
          {summary}
        </div>
        {preview === undefined ? null : (
          <details className="confirmation-modal__preview" open>
            <summary>Preview details</summary>
            <div>{preview}</div>
          </details>
        )}
        {supplementalContent === undefined ? null : (
          <div className="confirmation-modal__supplemental">{supplementalContent}</div>
        )}
        {acknowledgementLabel === undefined ? null : (
          <label className="confirmation-check">
            <input
              checked={acknowledged}
              disabled={isConfirming}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
              type="checkbox"
            />
            {acknowledgementLabel}
          </label>
        )}
        {feedback === null ? null : (
          <p
            className={feedback.type === "error" ? "error-message" : "success-message"}
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
        <div className="apply-confirmation-actions">
          <button
            className="secondary-action"
            disabled={isConfirming}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="primary-action"
            disabled={
              isConfirming ||
              confirmDisabled ||
              (acknowledgementLabel !== undefined && !acknowledged)
            }
            onClick={() => void handleConfirm()}
            type="button"
          >
            {isConfirming ? "Confirming…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
