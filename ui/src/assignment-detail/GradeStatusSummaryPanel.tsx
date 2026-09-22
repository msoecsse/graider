import type { ReactElement } from "react";
import { DiagnosticEntry, getRepositoryShortName } from "./AssignmentDetailPrimitives";
import { formatNullableValue } from "./assignmentDetailReadiness";
import { formatReadableDateTime } from "../components/dateTime";
import {
  formatGradeStatusLabel,
  getGradeStatusChipClassName,
  getGradeStatusSummaryText
} from "../grade-status/gradeStatusLabels";
import { getGradeStatusRunUrl } from "../grade-status/gradeStatusRunUrl";
import type {
  GradeStatusRepositoryRow,
  NormalizedGradeStatus
} from "../grade-status/gradeStatusTypes";

const getGradeStatusStudentLabel = (row: GradeStatusRepositoryRow): string =>
  row.studentId ?? "Unknown student";

const formatGradeStatusLastUpdate = (row: GradeStatusRepositoryRow): string => {
  const completedAt = formatReadableDateTime(row.completedAt);

  if (completedAt !== null) {
    return `Last completed ${completedAt}`;
  }

  const startedAt = formatReadableDateTime(row.startedAt);

  if (startedAt !== null) {
    return `Started ${startedAt}`;
  }

  return "No run time available";
};

export const GradeStatusSummaryPanel = ({
  status,
  isLoading,
  errorMessage,
  onViewFullGradeStatus,
  canUpdateRepositories,
  isTemplateSyncPending,
  onUpdateRepository
}: {
  readonly status: NormalizedGradeStatus | null;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly onViewFullGradeStatus: () => void;
  readonly canUpdateRepositories: boolean;
  readonly isTemplateSyncPending: boolean;
  readonly onUpdateRepository: (studentId: string) => void;
}): ReactElement => (
  <section
    className="detail-panel grade-status-summary-panel"
    aria-labelledby="assignment-grade-status-summary-title"
  >
    <div className="grade-status-summary-panel__header">
      <div>
        <h2 id="assignment-grade-status-summary-title">Grade status summary</h2>
        <p className="detail-panel__note">
          {status === null
            ? "Graider checks grading workflow run status without starting workflows."
            : getGradeStatusSummaryText(status)}
        </p>
      </div>
      <button className="secondary-action" type="button" onClick={onViewFullGradeStatus}>
        View full grade status
      </button>
    </div>

    {isLoading ? <p className="loading-state">Loading grade status summary...</p> : null}
    {errorMessage === null ? null : (
      <p className="error-message" role="alert">
        {errorMessage}
      </p>
    )}

    {status === null ? (
      <p className="detail-panel__note">Grade status data is not available yet.</p>
    ) : status.repositories.length === 0 ? (
      <p className="detail-panel__note">No student grading rows were returned.</p>
    ) : (
      <div className="grade-status-summary-table-wrap">
        <table className="grade-status-summary-table">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Section</th>
              <th scope="col">Repository</th>
              <th scope="col">Status</th>
              <th scope="col">Last update</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {status.repositories.map((row) => {
              const runUrl = getGradeStatusRunUrl(row);

              return (
                <tr
                  key={`${row.studentId ?? row.githubUsername ?? row.repository ?? "row"}-${row.section ?? "section"}`}
                >
                  <td>{getGradeStatusStudentLabel(row)}</td>
                  <td>{formatNullableValue(row.section)}</td>
                  <td>
                    {row.repository === null ? (
                      getRepositoryShortName(row.repository)
                    ) : (
                      <a
                        href={`https://github.com/${row.repository}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {getRepositoryShortName(row.repository)}
                      </a>
                    )}
                  </td>
                  <td>
                    <span className={getGradeStatusChipClassName(row)}>
                      {formatGradeStatusLabel(row)}
                    </span>
                  </td>
                  <td>{formatGradeStatusLastUpdate(row)}</td>
                  <td>
                    {canUpdateRepositories && row.studentId !== null && row.repository !== null ? (
                      <button
                        className="secondary-action"
                        type="button"
                        disabled={isTemplateSyncPending}
                        aria-label={`Update repository for ${row.studentId}`}
                        onClick={() => {
                          if (row.studentId !== null) onUpdateRepository(row.studentId);
                        }}
                      >
                        Update Repository
                      </button>
                    ) : null}
                    {runUrl === null ? (
                      <span className="detail-panel__note">No run link</span>
                    ) : (
                      <a href={runUrl} target="_blank" rel="noreferrer">
                        Open run
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    {status === null || status.diagnostics.length === 0 ? null : (
      <details className="grade-status-summary-diagnostics">
        <summary>Grade status diagnostics ({status.diagnostics.length})</summary>
        <ul className="assignment-detail-diagnostics">
          {status.diagnostics.map((diagnostic, index) => (
            <DiagnosticEntry
              diagnostic={diagnostic}
              key={`${diagnostic.code ?? "diagnostic"}-${index}`}
            />
          ))}
        </ul>
      </details>
    )}
  </section>
);
