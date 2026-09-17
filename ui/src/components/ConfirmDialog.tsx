import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from "react";

export type DiffEntryType = "added" | "changed" | "removed" | "neutral";

export interface DiffEntry {
  readonly id: string;
  readonly type: DiffEntryType;
  readonly label: string;
  readonly detail?: string;
}

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly summary: ReactNode;
  readonly diff?: readonly DiffEntry[];
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly confirmDisabled?: boolean;
  readonly isConfirming?: boolean;
  readonly confirmationWord?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

const DIFF_BADGE_TEXT: Record<DiffEntryType, string> = {
  added: "Added",
  changed: "Changed",
  removed: "Removed",
  neutral: "Unchanged"
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );

export const ConfirmDialog = ({
  isOpen,
  title,
  summary,
  diff = [],
  confirmLabel,
  cancelLabel = "Cancel",
  confirmDisabled = false,
  isConfirming = false,
  confirmationWord,
  onConfirm,
  onCancel
}: ConfirmDialogProps): ReactElement | null => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const titleId = useId();
  const summaryId = useId();

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    } else {
      setTypedConfirmation("");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const confirmationSatisfied =
    confirmationWord === undefined || typedConfirmation === confirmationWord;
  const isConfirmDisabled = confirmDisabled || isConfirming || !confirmationSatisfied;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
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
    <div className="confirm-dialog__backdrop">
      <div
        aria-describedby={summaryId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="confirm-dialog__summary" id={summaryId}>
          {summary}
        </div>
        {diff.length === 0 ? null : (
          <ul className="confirm-dialog__diff">
            {diff.map((entry) => (
              <li
                className={`confirm-dialog__diff-item confirm-dialog__diff-item--${entry.type}`}
                key={entry.id}
              >
                <span className="confirm-dialog__diff-badge">{DIFF_BADGE_TEXT[entry.type]}</span>
                <span className="confirm-dialog__diff-label">{entry.label}</span>
                {entry.detail === undefined ? null : (
                  <span className="confirm-dialog__diff-detail">{entry.detail}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {confirmationWord === undefined ? null : (
          <label className="confirm-dialog__confirmation">
            Type <strong>{confirmationWord}</strong> to confirm
            <input
              onChange={(event) => {
                setTypedConfirmation(event.currentTarget.value);
              }}
              type="text"
              value={typedConfirmation}
            />
          </label>
        )}
        <div className="apply-confirmation-actions">
          <button
            className="secondary-action"
            disabled={isConfirming}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="primary-action"
            disabled={isConfirmDisabled}
            onClick={onConfirm}
            type="button"
          >
            {isConfirming ? "Confirming…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
