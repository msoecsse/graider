import type { ReactElement } from "react";
import type { FolderDashboardError } from "./dashboardTypes";

interface FolderErrorPanelProps {
  readonly folderErrors: readonly FolderDashboardError[];
}

export const FolderErrorPanel = ({ folderErrors }: FolderErrorPanelProps): ReactElement | null => {
  if (folderErrors.length === 0) {
    return null;
  }

  return (
    <section className="folder-errors" aria-label="Folder refresh errors">
      {folderErrors.map((folderError) => (
        <article className="folder-error" key={folderError.sourceFolderId} role="alert">
          <h2>Could not load {folderError.sourceFolderPath}</h2>
          <p>{folderError.message}</p>
          <span className="folder-error__code">{folderError.code}</span>
        </article>
      ))}
    </section>
  );
};
