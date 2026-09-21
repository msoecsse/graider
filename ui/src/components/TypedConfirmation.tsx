import type { ReactElement } from "react";

export interface TypedConfirmationProps {
  readonly word: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

/**
 * README section 2: anything that affects a roster or student repositories
 * requires typing a confirmation word -- the name of the thing being
 * destroyed, not a constant like DELETE. Shared by ConfirmDialog and
 * ConfirmationWithPreviewModal so both ask for it the same way; the caller
 * owns the typed value and resets it when its dialog closes.
 */
export const isTypedConfirmationSatisfied = (word: string, value: string): boolean =>
  value === word;

export const TypedConfirmation = ({
  word,
  value,
  onChange,
  disabled = false
}: TypedConfirmationProps): ReactElement => (
  <label className="typed-confirmation">
    Type <strong>{word}</strong> to confirm
    <input
      disabled={disabled}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
      type="text"
      value={value}
    />
  </label>
);
