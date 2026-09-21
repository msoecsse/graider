import type { ReactElement } from "react";
import type { GradingStudentCommitHistoryResult } from "../../electron/ipc";
import { formatReadableDateTime } from "../components/dateTime";

type HistorySuccess = Extract<GradingStudentCommitHistoryResult, { readonly status: "success" }>;

export type CommitHistoryLoadState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly studentId: string }
  | { readonly status: "success"; readonly result: HistorySuccess }
  | {
      readonly status: "message";
      readonly studentId: string;
      readonly message: string;
      readonly tone: "neutral" | "warning";
    };

const unavailableMessage = "Commit history is unavailable for this submission.";
const genericWarning = "Commit history could not be loaded safely.";

export const shortenCommitSha = (sha: string): string => sha.slice(0, 8);

export const commitHistoryResultToLoadState = (
  result: GradingStudentCommitHistoryResult,
  studentId: string
): CommitHistoryLoadState => {
  if (result.status === "success")
    return result.studentId === studentId
      ? { status: "success", result }
      : { status: "message", studentId, message: genericWarning, tone: "warning" };
  if (result.status === "submission_changed")
    return {
      status: "message",
      studentId,
      message:
        "The local submission changed after grading state was created. Commit history belongs to a different local submission and was not shown.",
      tone: "warning"
    };
  if (
    result.status === "repository_not_recorded" ||
    result.status === "repository_unavailable" ||
    result.status === "registry_error" ||
    result.status === "submission_commit_unavailable" ||
    result.status === "commit_history_unavailable"
  )
    return { status: "message", studentId, message: unavailableMessage, tone: "neutral" };
  return { status: "message", studentId, message: genericWarning, tone: "warning" };
};

const formatCommitTimestamp = (committedAt: string): string =>
  formatReadableDateTime(committedAt) ?? "Unknown time";

export const GradingCommitHistoryContent = ({
  state
}: {
  readonly state: CommitHistoryLoadState;
}): ReactElement | null => {
  if (state.status === "idle") return null;
  return (
    <div className="grading-commit-history">
      {state.status === "loading" ? (
        <p aria-live="polite">Loading commit history for {state.studentId}…</p>
      ) : state.status === "message" ? (
        <p
          className={`grading-commit-history__message grading-commit-history__message--${state.tone}`}
          role="status"
        >
          {state.message}
        </p>
      ) : (
        <>
          <p className="grading-commit-history__student">
            Commit history for {state.result.studentId}
          </p>
          {state.result.commits.length === 0 ? (
            <p>No commits available.</p>
          ) : (
            <ol className="grading-commit-history__list" aria-label="Recent commits">
              {state.result.commits.map((commit) => (
                <li key={commit.sha}>
                  <p className="grading-commit-history__message-text">{commit.message}</p>
                  <p className="grading-commit-history__metadata">
                    <code title={commit.sha} aria-label={`Commit ${commit.sha}`}>
                      {shortenCommitSha(commit.sha)}
                    </code>
                    {" · "}
                    <time dateTime={commit.committedAt}>
                      {formatCommitTimestamp(commit.committedAt)}
                    </time>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
};

export const GradingCommitHistoryPanel = ({
  state
}: {
  readonly state: CommitHistoryLoadState;
}) => (
  <section className="grading-commit-history" aria-labelledby="commit-history-heading">
    <h3 id="commit-history-heading">Commit History</h3>
    <GradingCommitHistoryContent state={state} />
  </section>
);
