import type { ReactElement } from "react";
import type {
  AssignmentTemplateSyncExecutionResult,
  AssignmentTemplateSyncOutcome
} from "../../electron/ipc";

const getTemplateSyncOutcomeLabel = (status: AssignmentTemplateSyncOutcome["status"]): string => {
  switch (status) {
    case "updated":
      return "Updated";
    case "already_current":
      return "Already current";
    case "pull_request_created":
      return "Pull request created — student action required";
    case "pull_request_pending":
      return "Pull request pending — student action required";
    case "baseline_required":
      return "Baseline required";
    case "failed":
    case "pull_request_closed":
      return "Failed";
  }
};

export const TemplateSyncResultsPanel = ({
  result
}: {
  readonly result: AssignmentTemplateSyncExecutionResult;
}): ReactElement => (
  <section
    className="detail-panel template-sync-results-panel"
    aria-labelledby="template-sync-results-title"
    aria-label="Template update results"
  >
    <h2 id="template-sync-results-title">Template update results</h2>
    <p className="detail-panel__note">
      {result.outcomes.length} student{" "}
      {result.outcomes.length === 1 ? "repository" : "repositories"} processed.
    </p>
    {result.blocker === undefined ? null : (
      <p className="error-message" role="alert">
        {result.blocker.message}
      </p>
    )}
    <ul className="template-sync-results-list">
      {result.outcomes.map((outcome) => (
        <li key={outcome.studentId}>
          <div className="template-sync-results-list__heading">
            <strong>{outcome.studentId}</strong>
            <span className="status-chip">{getTemplateSyncOutcomeLabel(outcome.status)}</span>
          </div>
          {outcome.status === "baseline_required" ? (
            <p>
              {outcome.message ??
                "Graider cannot safely update this older repository until a synchronization baseline is established."}
            </p>
          ) : null}
          {outcome.status === "failed" || outcome.status === "pull_request_closed" ? (
            <p>
              {outcome.message ??
                "Try again. If the problem continues, check GitHub access and repository settings."}
            </p>
          ) : null}
          {outcome.pullRequest === undefined ? null : (
            <a href={outcome.pullRequest.url} target="_blank" rel="noreferrer">
              Open pull request #{outcome.pullRequest.number}
            </a>
          )}
        </li>
      ))}
    </ul>
  </section>
);
