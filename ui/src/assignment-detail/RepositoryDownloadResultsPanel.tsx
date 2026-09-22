import type { ReactElement } from "react";
import type { AssignmentRepositoryDownloadResult } from "../../electron/ipc";
import { formatStatusLabel } from "../components/statusLabels";

export const RepositoryDownloadResultsPanel = ({
  result
}: {
  readonly result: AssignmentRepositoryDownloadResult;
}): ReactElement => (
  <section className="detail-panel" aria-label="Repository download results">
    <h2>Repository download</h2>
    <p>
      {result.clonedCount} cloned, {result.failedCount} failed of {result.totalTargets}.
      Destination: {result.destination}
    </p>
    {result.diagnostics.map((diagnostic) => (
      <p key={diagnostic.message} role="alert">
        {diagnostic.message}
      </p>
    ))}
    <ul>
      {result.targets.map((target) => (
        <li key={target.targetId}>
          <strong>{target.repositoryName}</strong> — {formatStatusLabel(target.status)} —{" "}
          {target.localPath}
          {target.groupId === undefined ? null : ` (${target.groupId})`}
          <span> {target.studentIds.join(", ")}</span>
          {target.diagnostics.map((diagnostic) => (
            <p key={diagnostic.message}>{diagnostic.message}</p>
          ))}
        </li>
      ))}
    </ul>
  </section>
);
