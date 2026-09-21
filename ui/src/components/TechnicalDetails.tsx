import { useEffect, useState, type ReactElement } from "react";
import { copyTextToClipboard } from "./clipboard";

export interface TechnicalDetailsItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly copyable?: boolean;
}

export interface TechnicalDetailsProps {
  readonly items: readonly TechnicalDetailsItem[];
}

const COPY_FEEDBACK_DURATION_MS = 2000;

interface CopyState {
  readonly id: string;
  readonly status: "copied" | "failed";
}

const getCopyFeedback = (copyState: CopyState | null, id: string): string | null => {
  if (copyState?.id !== id) {
    return null;
  }

  return copyState.status === "copied" ? "Copied" : "Unable to copy";
};

const CopyButton = ({
  item,
  copyState,
  onCopy
}: {
  readonly item: TechnicalDetailsItem;
  readonly copyState: CopyState | null;
  readonly onCopy: (item: TechnicalDetailsItem) => void;
}): ReactElement => (
  <span className="copy-affordance">
    <button
      className="copy-button"
      type="button"
      aria-label={`Copy ${item.label}`}
      onClick={() => {
        onCopy(item);
      }}
    >
      Copy
    </button>
    <span className="copy-feedback" aria-live="polite">
      {getCopyFeedback(copyState, item.id)}
    </span>
  </span>
);

export const TechnicalDetails = ({ items }: TechnicalDetailsProps): ReactElement => {
  const [copyState, setCopyState] = useState<CopyState | null>(null);

  useEffect(() => {
    if (copyState === null) {
      return;
    }

    const timer = setTimeout(() => {
      setCopyState(null);
    }, COPY_FEEDBACK_DURATION_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [copyState]);

  const handleCopy = (item: TechnicalDetailsItem): void => {
    void copyTextToClipboard(item.value).then((result) => {
      setCopyState({ id: item.id, status: result === "success" ? "copied" : "failed" });
    });
  };

  return (
    <details className="technical-details">
      <summary>Technical details</summary>
      <dl className="technical-details__list">
        {items.map((item) => (
          <div className="technical-details__row" key={item.id}>
            <dt>{item.label}</dt>
            <dd>
              <span className="copyable-value">
                <code>{item.value}</code>
                {item.copyable === true ? (
                  <CopyButton item={item} copyState={copyState} onCopy={handleCopy} />
                ) : null}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
};
