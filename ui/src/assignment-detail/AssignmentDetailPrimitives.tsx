import type { ReactElement } from "react";
import { formatNullableValue, getDiagnosticCategory } from "./assignmentDetailReadiness";
import { formatStatusLabel, hasAttentionStatus } from "../components/statusLabels";
import type { AssignmentDetailDiagnostic } from "./assignmentDetailTypes";

export type CopyKey = "template-repository" | "workflow-path" | "canvas-link" | "publish-commands";

export interface CopyState {
  readonly key: CopyKey;
  readonly status: "copied" | "failed";
}

export const getCopyStateText = (copyState: CopyState | null, copyKey: CopyKey): string | null => {
  if (copyState?.key !== copyKey) {
    return null;
  }

  return copyState.status === "copied" ? "Copied" : "Unable to copy.";
};

export interface DetailItemProps {
  readonly label: string;
  readonly value: string | number | null | undefined;
  readonly valueClassName?: string;
  readonly action?: ReactElement | null;
}

export const DetailItem = ({
  label,
  value,
  valueClassName,
  action = null
}: DetailItemProps): ReactElement => (
  <div className="detail-item">
    <dt>{label}</dt>
    <dd className={valueClassName}>
      <span>{formatNullableValue(value)}</span>
      {action}
    </dd>
  </div>
);

export interface StatusItemProps {
  readonly label: string;
  readonly value: string | null;
}

export const StatusItem = ({ label, value }: StatusItemProps): ReactElement => {
  const hasAttention = hasAttentionStatus(value);

  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>
        <span className={hasAttention ? "status-chip status-chip--attention" : "status-chip"}>
          {formatStatusLabel(value)}
        </span>
      </dd>
    </div>
  );
};

export interface CopyButtonProps {
  readonly label: string;
  readonly value: string | null;
  readonly copyKey: CopyKey;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}

export const CopyButton = ({
  label,
  value,
  copyKey,
  copyState,
  onCopy
}: CopyButtonProps): ReactElement | null => {
  if (value === null) {
    return null;
  }

  return (
    <span className="copy-affordance">
      <button
        className="copy-button"
        type="button"
        aria-label={label}
        onClick={() => {
          onCopy(copyKey, value);
        }}
      >
        Copy
      </button>
      <span className="copy-feedback" aria-live="polite">
        {getCopyStateText(copyState, copyKey)}
      </span>
    </span>
  );
};

// Shared by the facts card's Template row and the compact grade-status
// table's Repository column.
export const getRepositoryShortName = (repository: string | null): string =>
  repository?.split("/").at(-1) ?? "Not configured";

export const DiagnosticEntry = ({
  diagnostic
}: {
  readonly diagnostic: AssignmentDetailDiagnostic;
}): ReactElement => (
  <li>
    <strong>{formatStatusLabel(diagnostic.severity)}</strong>
    <span className="diagnostic-category">{getDiagnosticCategory(diagnostic)}</span>
    <span>{diagnostic.message}</span>
    {diagnostic.code === null ? null : <code>{diagnostic.code}</code>}
    {Object.keys(diagnostic.context).length === 0 ? null : (
      <dl className="diagnostic-context">
        {Object.entries(diagnostic.context).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    )}
  </li>
);
