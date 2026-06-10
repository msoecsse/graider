import type { ReactElement } from "react";
import type { CourseFolderRecord } from "../../electron/ipc";

interface CourseFolderListProps {
  readonly courseFolders: readonly CourseFolderRecord[];
  readonly onRemove: (id: string) => void;
  readonly removingId: string | null;
}

export const CourseFolderList = ({
  courseFolders,
  onRemove,
  removingId
}: CourseFolderListProps): ReactElement => (
  <section className="folder-panel" aria-labelledby="registered-folders-title">
    <div className="folder-panel__header">
      <div>
        <h2 id="registered-folders-title">Registered course folders</h2>
        <p>Dashboard cards will load from these folders in a later slice.</p>
      </div>
    </div>
    <ul className="folder-list">
      {courseFolders.map((courseFolder) => (
        <li className="folder-list__item" key={courseFolder.id}>
          <div className="folder-list__details">
            <span className="folder-list__path">{courseFolder.path}</span>
            <span className="folder-list__meta">
              Last opened {new Date(courseFolder.lastOpenedAt).toLocaleString()}
            </span>
          </div>
          <button
            className="danger-action"
            type="button"
            aria-label={`Remove ${courseFolder.path} from dashboard`}
            disabled={removingId === courseFolder.id}
            onClick={() => {
              onRemove(courseFolder.id);
            }}
          >
            Remove from dashboard
          </button>
        </li>
      ))}
    </ul>
  </section>
);
