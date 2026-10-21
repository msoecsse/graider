import type { ReactElement } from "react";
export const DocumentFindBar = ({
  query,
  onQuery,
  onNext,
  onPrevious,
  status,
  disabled = false
}: {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly status: string;
  readonly disabled?: boolean;
}): ReactElement => (
  <div className="repository-document__find">
    <label>
      Find in document{" "}
      <input
        value={query}
        disabled={disabled}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrevious();
            else onNext();
          }
        }}
      />
    </label>
    <button type="button" disabled={disabled || query.trim() === ""} onClick={onPrevious}>
      Previous match
    </button>
    <button type="button" disabled={disabled || query.trim() === ""} onClick={onNext}>
      Next match
    </button>
    <span role="status">{status}</span>
  </div>
);
