import type { ReactElement } from "react";
import type { AssignmentRepositoryUpdateResult } from "../../electron/ipc";

export const RepositoryPullResultsPanel = ({
  result
}: {
  readonly result: AssignmentRepositoryUpdateResult;
}): ReactElement => (
  <section className="detail-panel" aria-label="Student pull results">
    <h2>Student pull results</h2>
    <p role="status">
      {result.counts.total} students processed: {result.counts.updated} updated,{" "}
      {result.counts.unchanged} unchanged, {result.counts.failure} failed,{" "}
      {result.counts.notDownloaded} not downloaded.
    </p>
    {result.counts.failure > 0 ? (
      <p role="alert">
        Some students could not be updated. Review their messages below, resolve the reported
        problems and retry. Successful students are preserved.
      </p>
    ) : null}
    <ul>
      {result.results.map((row) => (
        <li key={row.studentId}>
          <strong>{row.studentId}</strong>: {row.outcome.replaceAll("_", " ")} — {row.message}
        </li>
      ))}
    </ul>
  </section>
);
