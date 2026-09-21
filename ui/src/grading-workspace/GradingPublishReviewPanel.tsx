import type { ReactElement } from "react";

export type PublishReviewDetailState =
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly scoreLabel: string; readonly summaryLabel: string }
  | { readonly status: "unavailable" };

export interface PublishReviewOutcome {
  readonly tone: "success" | "warning" | "error";
  readonly message: string;
  readonly warnings: readonly string[];
}

export interface PublishReviewReadyRow {
  readonly studentId: string;
  readonly section: string;
  readonly detail: PublishReviewDetailState;
  readonly outcome?: PublishReviewOutcome;
}

export interface PublishReviewPublishedRow {
  readonly studentId: string;
  readonly section: string;
  readonly outcome?: PublishReviewOutcome;
}

const detailScoreText = (detail: PublishReviewDetailState): string => {
  if (detail.status === "success") return detail.scoreLabel;
  if (detail.status === "loading") return "Loading…";
  return "Score unavailable";
};

const detailSummaryText = (detail: PublishReviewDetailState): string => {
  if (detail.status === "success") return detail.summaryLabel;
  if (detail.status === "loading") return "";
  return "Report contents unavailable";
};

export const GradingPublishReviewPanel = ({
  readyRows,
  publishedRows,
  notGradedCount,
  selectedIds,
  onToggle,
  onCancel,
  onPublish,
  running,
  refreshFailedStudentIds
}: {
  readonly readyRows: readonly PublishReviewReadyRow[];
  readonly publishedRows: readonly PublishReviewPublishedRow[];
  readonly notGradedCount: number;
  readonly selectedIds: readonly string[];
  readonly onToggle: (studentId: string, selected: boolean) => void;
  readonly onCancel: () => void;
  readonly onPublish: () => void;
  readonly running: boolean;
  readonly refreshFailedStudentIds: readonly string[];
}): ReactElement => {
  const selectedCount = selectedIds.length;
  return (
    <section className="grading-publish-review" aria-labelledby="publish-review-heading">
      <h2 id="publish-review-heading">Publish review</h2>
      <p className="grading-publish-review__intro">
        Publishing writes each selected report to that student&rsquo;s GitHub repository. Students
        can see a published report immediately.
      </p>
      {refreshFailedStudentIds.length === 0 ? null : (
        <p className="grading-publish-review__refresh-warning" role="status">
          Current grading status could not be refreshed for {refreshFailedStudentIds.join(", ")}.
          Reopen publish review to see their latest status.
        </p>
      )}
      <div className="grading-publish-review__section">
        <h3>Ready to publish ({readyRows.length})</h3>
        {readyRows.length === 0 ? (
          <p>No completed reports are ready to publish.</p>
        ) : (
          <table className="grading-publish-review__table">
            <caption className="visually-hidden">Students ready to publish</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Publish</span>
                </th>
                <th scope="col">Student</th>
                <th scope="col">Section</th>
                <th scope="col">Score</th>
                <th scope="col">Report contents</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {readyRows.map((row) => {
                const inputId = `publish-review-select-${row.studentId}`;
                return (
                  <tr key={row.studentId}>
                    <td>
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={selectedIds.includes(row.studentId)}
                        disabled={running}
                        aria-label={`Select ${row.studentId} to publish`}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          onToggle(row.studentId, checked);
                        }}
                      />
                    </td>
                    <th scope="row">
                      <label htmlFor={inputId}>{row.studentId}</label>
                    </th>
                    <td>Section {row.section}</td>
                    <td>{detailScoreText(row.detail)}</td>
                    <td>{detailSummaryText(row.detail)}</td>
                    <td>
                      {row.outcome === undefined ? null : (
                        <div
                          className={`grading-publish-review__outcome grading-publish-review__outcome--${row.outcome.tone}`}
                          role="status"
                        >
                          <p>{row.outcome.message}</p>
                          {row.outcome.warnings.length === 0 ? null : (
                            <ul>
                              {row.outcome.warnings.map((warning, index) => (
                                <li key={`${row.studentId}-${index}`}>{warning}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="grading-publish-review__section">
        <h3>Already published ({publishedRows.length})</h3>
        {publishedRows.length === 0 ? (
          <p>No reports have been published yet.</p>
        ) : (
          <ul className="grading-publish-review__published-list">
            {publishedRows.map((row) => (
              <li key={row.studentId} className="grading-publish-review__published-row">
                <span aria-hidden="true">✓</span> {row.studentId} · Section {row.section} ·
                Published
                {row.outcome === undefined ? null : (
                  <div
                    className={`grading-publish-review__outcome grading-publish-review__outcome--${row.outcome.tone}`}
                    role="status"
                  >
                    <p>{row.outcome.message}</p>
                    {row.outcome.warnings.length === 0 ? null : (
                      <ul>
                        {row.outcome.warnings.map((warning, index) => (
                          <li key={`${row.studentId}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grading-publish-review__section">
        <h3>Not graded yet</h3>
        {notGradedCount === 0 ? (
          <p>All students have a grade recorded.</p>
        ) : (
          <p>
            {notGradedCount} {notGradedCount === 1 ? "student" : "students"} not graded yet.
            They&rsquo;re excluded from this run and can be published later in the week once grading
            is complete.
          </p>
        )}
      </div>
      <div className="grading-publish-review__footer">
        <p>
          {selectedCount} {selectedCount === 1 ? "report" : "reports"} will be committed to{" "}
          {selectedCount} {selectedCount === 1 ? "repository" : "repositories"}.
        </p>
        <div className="grading-publish-review__footer-actions">
          <button className="secondary-action" type="button" disabled={running} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary-action"
            type="button"
            disabled={running || selectedCount === 0}
            onClick={onPublish}
          >
            {running
              ? `Publishing ${selectedCount} ${selectedCount === 1 ? "report" : "reports"}…`
              : `Publish ${selectedCount} ${selectedCount === 1 ? "report" : "reports"}`}
          </button>
        </div>
      </div>
    </section>
  );
};
