import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from "react";
import type {
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord
} from "../../electron/ipc";
import { aggregateDashboardResults } from "./dashboardAggregation";
import type { AggregatedDashboard } from "./dashboardTypes";

const getSafeErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not update course folders.";

/**
 * The dashboard's own data layer (registered course folders, their
 * aggregated dashboard cards, and the handlers that load/refresh/remove
 * them), hoisted out of DashboardPage so every route can resolve a
 * courseSlug/termSlug/assignment slug against the same data -- see
 * dashboardResolvers.ts. This is the "shared cache," not a per-route loader:
 * it is fetched once, the same way DashboardPage already fetched it, and
 * routes read from it rather than re-fetching per navigation.
 *
 * UI-only state that has nothing to do with resolving routes (search text,
 * sort order, the faculty-settings panel's open/closed state, and so on)
 * stays local to DashboardPage; it is not part of this context.
 */
export interface DashboardDataValue {
  readonly courseFolders: readonly CourseFolderRecord[];
  readonly refreshResults: Readonly<Record<string, CourseFolderDashboardResult>>;
  readonly aggregatedDashboard: AggregatedDashboard;
  readonly isLoadingFolders: boolean;
  readonly isRefreshingAll: boolean;
  readonly isSelectingFolder: boolean;
  readonly refreshingId: string | null;
  readonly removingId: string | null;
  readonly errorMessage: string | null;
  readonly setErrorMessage: (message: string | null) => void;
  readonly handleOpenCourseFolder: () => Promise<void>;
  readonly handleRefreshCourseFolder: (id: string) => Promise<void>;
  readonly handleRefreshDashboard: () => Promise<void>;
  readonly handleRemoveCourseFolder: (id: string) => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

export const DashboardDataProvider = ({
  children
}: {
  readonly children: ReactNode;
}): ReactElement => {
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
  const hasStartedStartupRefresh = useRef(false);
  const isRefreshingAllRef = useRef(false);

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

  const rememberCombinedDashboardResult = (combinedResult: CombinedDashboardResult): void => {
    const nextResults = combinedResult.results.reduce<Record<string, CourseFolderDashboardResult>>(
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
  };

  const runRefreshDashboard = async (): Promise<void> => {
    if (isRefreshingAllRef.current) {
      return;
    }

    isRefreshingAllRef.current = true;
    setIsRefreshingAll(true);
    setErrorMessage(null);

    try {
      rememberCombinedDashboardResult(await window.graiderUI.refreshDashboard());
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      isRefreshingAllRef.current = false;
      setIsRefreshingAll(false);
    }
  };

  useEffect(() => {
    if (isLoadingFolders || courseFolders.length === 0 || hasStartedStartupRefresh.current) {
      return;
    }

    hasStartedStartupRefresh.current = true;
    void runRefreshDashboard();
  }, [courseFolders.length, isLoadingFolders]);

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
      } else if (!result.canceled && result.error !== undefined) {
        setErrorMessage(`${result.error.message} Course folder: ${result.error.folderPath}`);
      }
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      setIsSelectingFolder(false);
    }
  };

  const handleRefreshCourseFolder = async (id: string): Promise<void> => {
    if (isRefreshingAllRef.current) {
      return;
    }

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
    await runRefreshDashboard();
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

  const value: DashboardDataValue = {
    courseFolders,
    refreshResults,
    aggregatedDashboard: aggregateDashboardResults(refreshResults),
    isLoadingFolders,
    isRefreshingAll,
    isSelectingFolder,
    refreshingId,
    removingId,
    errorMessage,
    setErrorMessage,
    handleOpenCourseFolder,
    handleRefreshCourseFolder,
    handleRefreshDashboard,
    handleRemoveCourseFolder
  };

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
};

export const useDashboardData = (): DashboardDataValue => {
  const value = useContext(DashboardDataContext);

  if (value === null) {
    throw new Error("useDashboardData must be used within a DashboardDataProvider");
  }

  return value;
};
