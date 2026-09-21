import type { ReactElement, ReactNode } from "react";

export interface UnsavedChangesBarProps {
  readonly message: ReactNode;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
  readonly saveLabel?: string;
  readonly discardLabel?: string;
  readonly saving?: boolean;
}

export const UnsavedChangesBar = ({
  message,
  onDiscard,
  onSave,
  saveLabel = "Review and save",
  discardLabel = "Discard",
  saving = false
}: UnsavedChangesBarProps): ReactElement => (
  <div className="unsaved-changes-bar" role="status">
    <span className="unsaved-changes-bar__message">{message}</span>
    <div className="unsaved-changes-bar__actions">
      <button className="secondary-action" disabled={saving} onClick={onDiscard} type="button">
        {discardLabel}
      </button>
      <button className="primary-action" disabled={saving} onClick={onSave} type="button">
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  </div>
);
