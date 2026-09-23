import { useRef, type ChangeEvent, type ReactElement } from "react";
import type { RosterSource, RosterSourceKind } from "../../electron/ipc";
import { formatReadableDateTime } from "../components/dateTime";
import { StatusChip } from "../components/StatusChip";
import { getSourceKindLabel } from "./rosterManagerModel";

export const RosterSourceBar = ({
  source,
  pendingSourceKind,
  emptySourceExplanation,
  disabled,
  onReplace
}: {
  readonly source: RosterSource | undefined;
  readonly pendingSourceKind: RosterSourceKind | undefined;
  readonly emptySourceExplanation: string;
  readonly disabled: boolean;
  readonly onReplace: (event: ChangeEvent<HTMLInputElement>) => void;
}): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null);
  const readableTime = source === undefined ? null : formatReadableDateTime(source.updatedAt);

  return (
    <section className="roster-source-bar" aria-label="Roster source">
      <div className="roster-source-bar__details">
        <p className="roster-source-bar__source">
          <strong>Source:</strong>{" "}
          {source === undefined ? "Not recorded" : getSourceKindLabel(source.kind)}
        </p>
        {source === undefined ? (
          <p className="roster-source-bar__meta">{emptySourceExplanation}</p>
        ) : (
          <p className="roster-source-bar__meta">
            {readableTime === null ? "Update time unavailable" : `Last updated ${readableTime}`}
            {source.updatedBy === null ? null : ` by ${source.updatedBy}`}
          </p>
        )}
        {pendingSourceKind === undefined ? null : (
          <p className="roster-source-bar__pending" role="status">
            Source after save: {getSourceKindLabel(pendingSourceKind)}
          </p>
        )}
      </div>
      <div className="roster-source-bar__actions">
        <StatusChip label="Canvas sync not connected" variant="neutral" />
        <button
          className="secondary-action"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Replace from CSV
        </button>
        <input
          accept=".csv,text/csv"
          aria-label="Roster CSV file"
          className="sr-only"
          disabled={disabled}
          onChange={onReplace}
          ref={inputRef}
          type="file"
        />
      </div>
    </section>
  );
};
