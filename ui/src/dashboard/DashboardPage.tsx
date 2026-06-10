import { useEffect, useState, type ReactElement } from "react";
import type {
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord
} from "../../electron/ipc";
import { CourseCardGrid } from "./CourseCardGrid";
import { CourseFolderList } from "./CourseFolderList";
import { FolderErrorPanel } from "./FolderErrorPanel";
import { aggregateDashboardResults } from "./dashboardAggregation";

const getSafeErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not update course folders.";

export const DashboardPage = (): ReactElement => {
  const [courseFolders, setCourseFolders] = useState<CourseFolderRecord[]>([]);
  const [refreshResults, setRefreshResults] = useState<
    Readonly<Record<string, CourseFolderDashboardResult>>
  >({});
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    window.graiderUI
      .listCourseFolders()
      .then((folders) => {
        if (isMounted) {
          setCourseFolders(folders);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(getSafeErrorMessage(error));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingFolders(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenCourseFolder = async (): Promise<void> => {
    setIsSelectingFolder(true);
    setErrorMessage(null);

    try {
      const result = await window.graiderUI.selectCourseFolder();

      if (!result.canceled && result.courseFolder !== null) {
        const selectedCourseFolder = result.courseFolder;

        setCourseFolders((currentFolders) => {
          const existingIndex = currentFolders.findIndex(
            (courseFolder) => courseFolder.id === selectedCourseFolder.id
          );

          if (existingIndex < 0) {
            return [...currentFolders, selectedCourseFolder];
          }

          return currentFolders.map((courseFolder) =>
            courseFolder.id === selectedCourseFolder.id ? selectedCourseFolder : courseFolder
          );
        });
      }
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      setIsSelectingFolder(false);
    }
  };

  const handleRemoveCourseFolder = async (id: string): Promise<void> => {
    setRemovingId(id);
    setErrorMessage(null);

    try {
      await window.graiderUI.removeCourseFolder(id);
      setCourseFolders((currentFolders) =>
        currentFolders.filter((courseFolder) => courseFolder.id !== id)
      );
      setRefreshResults((currentResults) => {
        const { [id]: _removedResult, ...remainingResults } = currentResults;

        return remainingResults;
      });
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      setRemovingId(null);
    }
  };

  const applyRefreshResultMetadata = (result: CourseFolderDashboardResult): void => {
    if (result.refreshedAt !== null) {
      setCourseFolders((currentFolders) =>
        currentFolders.map((courseFolder) =>
          courseFolder.id === result.courseFolderId
            ? {
                ...courseFolder,
                lastRefreshedAt: result.refreshedAt,
                lastDashboardStatus: result.dashboard?.status ?? result.status
              }
            : courseFolder
        )
      );
    }
  };

  const rememberRefreshResult = (result: CourseFolderDashboardResult): void => {
    setRefreshResults((currentResults) => ({
      ...currentResults,
      [result.courseFolderId]: result
    }));
    applyRefreshResultMetadata(result);
  };

  const handleRefreshCourseFolder = async (id: string): Promise<void> => {
    setRefreshingId(id);
    setErrorMessage(null);

    try {
      rememberRefreshResult(await window.graiderUI.refreshCourseFolder(id));
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRefreshDashboard = async (): Promise<void> => {
    setIsRefreshingAll(true);
    setErrorMessage(null);

    try {
      const combinedResult: CombinedDashboardResult = await window.graiderUI.refreshDashboard();
      const nextResults = combinedResult.results.reduce<
        Record<string, CourseFolderDashboardResult>
      >(
        (results, result) => ({
          ...results,
          [result.courseFolderId]: result
        }),
        {}
      );

      setRefreshResults((currentResults) => ({
        ...currentResults,
        ...nextResults
      }));
      for (const result of combinedResult.results) {
        applyRefreshResultMetadata(result);
      }
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const isRefreshing = isRefreshingAll || refreshingId !== null;
  const aggregatedDashboard = aggregateDashboardResults(refreshResults);
  const hasCourseFolders = courseFolders.length > 0;

  return (
    <main className="dashboard-shell" aria-labelledby="dashboard-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="dashboard-title">Your Courses</h1>
          </div>
          <button
            className="primary-action"
            type="button"
            disabled={isSelectingFolder}
            onClick={() => {
              void handleOpenCourseFolder();
            }}
          >
            Open course folder
          </button>
        </div>
      </header>

      <section className="dashboard-content" aria-label="Course dashboard">
        <div className="toolbar" aria-label="Dashboard controls">
          <label className="search-field">
            <span>Search</span>
            <input type="search" placeholder="Search for a course or assignment" disabled />
          </label>
          <label className="select-field">
            <span>View</span>
            <select disabled>
              <option>Active</option>
            </select>
          </label>
          <label className="select-field">
            <span>Sort</span>
            <select disabled>
              <option>Newest first</option>
            </select>
          </label>
          <button
            className="secondary-action"
            type="button"
            disabled={!hasCourseFolders || isRefreshing}
            onClick={() => {
              void handleRefreshDashboard();
            }}
          >
            {isRefreshingAll ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {errorMessage === null ? null : (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoadingFolders ? <p className="loading-state">Loading course folders...</p> : null}

        {!isLoadingFolders && !hasCourseFolders ? (
          <section className="empty-state" aria-labelledby="empty-state-title">
            <div className="empty-state__marker" aria-hidden="true" />
            <h2 id="empty-state-title">No courses added yet.</h2>
            <p>Open a Graider course folder to get started.</p>
            <button
              className="primary-action"
              type="button"
              disabled={isSelectingFolder}
              onClick={() => {
                void handleOpenCourseFolder();
              }}
            >
              Open course folder
            </button>
            <p className="empty-state__note">Dashboard cards arrive in UI-1D.</p>
          </section>
        ) : null}

        {!isLoadingFolders && hasCourseFolders ? (
          <>
            <FolderErrorPanel folderErrors={aggregatedDashboard.folderErrors} />
            <CourseCardGrid cards={aggregatedDashboard.cards} />

            {isRefreshingAll ? <p className="loading-state">Loading dashboard...</p> : null}

            {!aggregatedDashboard.hasRefreshResults ? (
              <section className="dashboard-placeholder" aria-label="Dashboard loading prompt">
                <h2>Refresh to load course cards.</h2>
                <p>Graider will run dashboard checks for each registered course folder.</p>
              </section>
            ) : null}

            {aggregatedDashboard.hasRefreshResults && aggregatedDashboard.cards.length === 0 ? (
              <section className="dashboard-placeholder" aria-label="No course cards">
                <h2>No course-term cards found.</h2>
                <p>Review the registered folder status or diagnostics, then refresh again.</p>
              </section>
            ) : null}

            <CourseFolderList
              courseFolders={courseFolders}
              refreshResults={refreshResults}
              refreshingId={refreshingId}
              removingId={removingId}
              onRefresh={(id) => {
                void handleRefreshCourseFolder(id);
              }}
              onRemove={(id) => {
                void handleRemoveCourseFolder(id);
              }}
            />
          </>
        ) : null}
      </section>
    </main>
  );
};
