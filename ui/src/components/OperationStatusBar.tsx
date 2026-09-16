import type { ReactElement } from "react";

interface OperationStatusBarProps {
  readonly label: string;
  readonly detail?: string;
  readonly current?: number;
  readonly total?: number;
}

export const OperationStatusBar = ({
  label,
  detail,
  current,
  total
}: OperationStatusBarProps): ReactElement => {
  const hasProgress = current !== undefined && total !== undefined && total > 0;

  return (
    <section className="operation-status-bar" role="status" aria-live="polite">
      <div className="operation-status-bar__copy">
        <strong>{label}</strong>
        {detail === undefined ? null : <span>{detail}</span>}
      </div>
      <div
        className="operation-status-bar__progress"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={hasProgress ? 0 : undefined}
        aria-valuemax={hasProgress ? total : undefined}
        aria-valuenow={hasProgress ? current : undefined}
        aria-valuetext={hasProgress ? `${current} of ${total}` : "In progress"}
      >
        {hasProgress ? (
          <span
            className="operation-status-bar__progress-value"
            style={{ width: `${Math.min(100, Math.max(0, (current / total) * 100))}%` }}
          />
        ) : null}
      </div>
    </section>
  );
};
