import type { ReactElement } from "react";
import type { CourseFolderDashboardResult, CourseFolderRecord } from "../../electron/ipc";

interface CourseFolderListProps {
  readonly courseFolders: readonly CourseFolderRecord[];
  readonly refreshResults: Readonly<Record<string, CourseFolderDashboardResult>>;
  readonly refreshingId: string | null;
  readonly isRefreshingAll: boolean;
  readonly onRemove: (id: string) => void;
  readonly onRefresh: (id: string) => void;
  readonly onSetupAssignment: (courseFolder: CourseFolderRecord) => void;
  readonly onManageRosters: (courseFolder: CourseFolderRecord) => void;
  readonly removingId: string | null;
}

const formatTimestamp = (value: string): string => new Date(value).toLocaleString();

const getCardCountLabel = (cardCount: unknown): string => {
  if (typeof cardCount !== "number") {
    return "Dashboard loaded";
  }

  return cardCount === 1 ? "1 card loaded" : `${cardCount} cards loaded`;
};

const getErrorMessage = (result: CourseFolderDashboardResult): string => {
  const errorCode = result.error?.code;

  if (errorCode === "github_token_unavailable" || errorCode === "github_token_missing") {
    return "GitHub token required. Graider needs GitHub access to check current course and assignment status. Run: gh auth login";
  }

  if (errorCode === "github_cli_not_found") {
    return "GitHub CLI was not found. Install GitHub CLI or set GRAIDER_GITHUB_TOKEN before launching Graider.";
  }

  if (errorCode === "github_cli_auth_failed") {
    return "GitHub CLI is installed, but no authenticated token was available. Run gh auth login, then refresh.";
  }

  if (errorCode === "graider_cli_not_found") {
    return "Graider CLI not found. Install Graider or make sure graider is available on PATH.";
  }

  if (errorCode === "bundled_graider_cli_not_found") {
    return "Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app.";
  }

  if (errorCode === "invalid_dashboard_json") {
    return "Graider dashboard returned invalid JSON.";
  }

  if (errorCode === "dashboard_command_failed") {
    return "Dashboard command failed while reading this course folder.";
  }

  return "Could not refresh this course folder.";
};

const getResultMessage = (result: CourseFolderDashboardResult): string => {
  if (result.status === "success" && result.dashboard !== null) {
    return getCardCountLabel(result.dashboard.summary.cardCount);
  }

  if (result.dashboard !== null) {
    return `Dashboard returned ${result.dashboard.status}.`;
  }

  return getErrorMessage(result);
};

export const CourseFolderList = ({
  courseFolders,
  refreshResults,
  refreshingId,
  isRefreshingAll,
  onRemove,
  onRefresh,
  onSetupAssignment,
  onManageRosters,
  removingId
}: CourseFolderListProps): ReactElement => (
  <section className="folder-panel" aria-labelledby="registered-folders-title">
    <div className="folder-panel__header">
      <div>
        <h2 id="registered-folders-title">Registered course folders</h2>
        <p>Refresh a folder to load its Graider dashboard JSON.</p>
      </div>
    </div>
    <ul className="folder-list">
      {courseFolders.map((courseFolder) => {
        const refreshResult = refreshResults[courseFolder.id];
        const isRefreshing = refreshingId === courseFolder.id;
        const isRefreshDisabled = isRefreshing || isRefreshingAll;

        return (
          <li className="folder-list__item" key={courseFolder.id}>
            <div className="folder-list__details">
              <span className="folder-list__path">{courseFolder.path}</span>
              <span className="folder-list__meta">
                Last opened {formatTimestamp(courseFolder.lastOpenedAt)}
              </span>
              {courseFolder.lastRefreshedAt === null ? null : (
                <span className="folder-list__meta">
                  Last refreshed {formatTimestamp(courseFolder.lastRefreshedAt)}
                </span>
              )}
              {courseFolder.lastDashboardStatus === null ? null : (
                <span className="folder-list__meta">
                  Last dashboard status: {courseFolder.lastDashboardStatus}
                </span>
              )}
              {isRefreshing ? <span className="folder-list__status">Refreshing...</span> : null}
              {!isRefreshing && refreshResult !== undefined ? (
                <span
                  className={
                    refreshResult.status === "success"
                      ? "folder-list__status folder-list__status--success"
                      : "folder-list__status folder-list__status--error"
                  }
                  role={refreshResult.status === "failure" ? "alert" : undefined}
                >
                  {getResultMessage(refreshResult)}
                </span>
              ) : null}
            </div>
            <div className="folder-list__actions">
              <button
                className="secondary-action"
                type="button"
                aria-label={`Refresh ${courseFolder.path}`}
                disabled={isRefreshDisabled}
                onClick={() => {
                  onRefresh(courseFolder.id);
                }}
              >
                Refresh
              </button>
              <button
                className="secondary-action"
                type="button"
                aria-label={`Create a new assignment in ${courseFolder.path}`}
                onClick={() => {
                  onSetupAssignment(courseFolder);
                }}
              >
                New Assignment
              </button>
              <button
                className="secondary-action"
                type="button"
                aria-label={`Manage rosters in ${courseFolder.path}`}
                onClick={() => {
                  onManageRosters(courseFolder);
                }}
              >
                Manage Rosters
              </button>
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
            </div>
          </li>
        );
      })}
    </ul>
  </section>
);
