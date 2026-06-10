import { useEffect, useState, type ReactElement } from "react";
import type { CourseFolderRecord } from "../../electron/ipc";
import { CourseFolderList } from "./CourseFolderList";

const getSafeErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not update course folders.";

export const DashboardPage = (): ReactElement => {
  const [courseFolders, setCourseFolders] = useState<CourseFolderRecord[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
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
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      setRemovingId(null);
    }
  };

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
          <button className="secondary-action" type="button" disabled>
            Refresh
          </button>
        </div>

        {errorMessage === null ? null : (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoadingFolders ? <p className="loading-state">Loading course folders...</p> : null}

        {!isLoadingFolders && courseFolders.length === 0 ? (
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
            <p className="empty-state__note">Dashboard loading arrives in UI-1C.</p>
          </section>
        ) : null}

        {!isLoadingFolders && courseFolders.length > 0 ? (
          <CourseFolderList
            courseFolders={courseFolders}
            removingId={removingId}
            onRemove={(id) => {
              void handleRemoveCourseFolder(id);
            }}
          />
        ) : null}
      </section>
    </main>
  );
};
