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
  readonly hasPendingCourseLoads: boolean;
  readonly isSelectingFolder: boolean;
  readonly refreshingId: string | null;
  readonly removingId: string | null;
  readonly errorMessage: string | null;
  readonly setErrorMessage: (message: string | null) => void;
  readonly acceptGithubAccount: (userId: number | null) => void;
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
  const measuredDashboard = useRef(false);
  useEffect(() => {
    if (
      !measuredDashboard.current &&
      Object.values(refreshResults).some((result) => result.dashboard) &&
      typeof performance.measure === "function"
    ) {
      measuredDashboard.current = true;
      performance.measure("graider.dashboard_displayed", { start: 0, end: performance.now() });
      if (Object.values(refreshResults).some((result) => result.dashboard?.status === "cached"))
        performance.measure("graider.cached_assignments_displayed", {
          start: 0,
          end: performance.now()
        });
    }
  }, [refreshResults]);
  const [pendingCourseLoads, setPendingCourseLoads] = useState(0);
  const remoteVersion = useRef("");
  const remoteAccount = useRef<number | null | undefined>(undefined);
  const accountEpoch = useRef(0);
  const acceptGithubAccount = (userId: number | null): void => {
    if (remoteAccount.current !== userId) {
      remoteAccount.current = userId;
      accountEpoch.current += 1;
      remoteVersion.current = "";
      displayFolders.current = [];
      setCourseFolders([]);
      setRefreshResults({});
      setPendingCourseLoads(0);
      setErrorMessage(null);
    }
  };
  const remoteFolders = useRef(new Map<string, string>());
  const folderRequests = useRef(new Map<string, number>());
  const hasStartedStartupRefresh = useRef(false);
  const displayFolders = useRef<CourseFolderRecord[]>([]);
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

  useEffect(() => {
    let active = true;
    let pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const readingEpoch = accountEpoch.current;
        const state = await window.graiderUI.githubOAuth?.get();
        if (!active || !state || readingEpoch !== accountEpoch.current) return;
        const account = state.identity?.id ?? null;
        const accountChanged =
          remoteAccount.current !== undefined && remoteAccount.current !== account;
        remoteAccount.current = account;
        const bindings = new Map<string, string>();
        for (const course of state.courseDiscovery.courses) {
          for (const id of [
            ...course.localFolderIds,
            `managed-course:${account}:${course.repositoryId}`
          ])
            bindings.set(
              id,
              JSON.stringify([
                course.repositoryId,
                course.authorization,
                course.synchronization?.currentCommit
              ])
            );
        }
        const version = JSON.stringify([account, [...bindings]]);
        if (version === remoteVersion.current) return;
        const initial = remoteVersion.current === "";
        const previous = remoteFolders.current;
        remoteFolders.current = bindings;
        remoteVersion.current = version;
        if (accountChanged) {
          accountEpoch.current += 1;
          displayFolders.current = [];
          setRefreshResults({});
          setPendingCourseLoads(0);
        }
        const epoch = accountEpoch.current;
        const cached = await window.graiderUI.loadDashboardDisplay?.(
          window.location.hash.match(/^#\/course\/([^/]+)/u)?.[1]
        );
        if (!active || version !== remoteVersion.current || epoch !== accountEpoch.current) return;
        if (cached?.userId !== undefined && cached.userId !== account) return;
        if (cached) {
          setRefreshResults((current) => ({
            ...Object.fromEntries(cached.results.map((result) => [result.courseFolderId, result])),
            ...current
          }));
          displayFolders.current = cached.results.map((result) => ({
            id: result.courseFolderId,
            path: result.courseFolderPath,
            displayAlias: null,
            lastOpenedAt: "",
            lastRefreshedAt: result.refreshedAt,
            lastDashboardStatus: "cached"
          }));
        }
        const liveFolders = await window.graiderUI.listCourseFolders();
        const folders = [
          ...new Map(
            [...displayFolders.current, ...liveFolders].map((folder) => [folder.id, folder])
          ).values()
        ];
        if (!active || version !== remoteVersion.current || epoch !== accountEpoch.current) return;
        setCourseFolders(folders);
        if ((initial || accountChanged) && bindings.size === 0) {
          if (folders.length > 0) void runRefreshDashboard();
        } else {
          void Promise.all(
            folders
              .filter(
                (folder) =>
                  initial || accountChanged || bindings.get(folder.id) !== previous.get(folder.id)
              )
              .map(async (folder) => {
                const request = (folderRequests.current.get(folder.id) ?? 0) + 1;
                folderRequests.current.set(folder.id, request);
                setPendingCourseLoads((pending) => pending + 1);
                try {
                  const result = await (
                    window.graiderUI.refreshCourseDisplay ?? window.graiderUI.refreshCourseFolder
                  )(folder.id);
                  if (
                    active &&
                    account === remoteAccount.current &&
                    epoch === accountEpoch.current &&
                    request === folderRequests.current.get(folder.id)
                  )
                    rememberRefreshResult(result);
                } finally {
                  if (active && epoch === accountEpoch.current)
                    setPendingCourseLoads((pending) => Math.max(0, pending - 1));
                }
              })
          ).catch(() => {
            if (active && account === remoteAccount.current && epoch === accountEpoch.current)
              setErrorMessage("Could not refresh some course folders.");
          });
        }
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(() => {
      void check().catch(() => {});
    }, 1000);
    void check().catch(() => {});
    return () => {
      active = false;
      clearInterval(timer);
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
      [result.courseFolderId]: result.dashboard
        ? result
        : {
            ...result,
            dashboard: currentResults[result.courseFolderId]?.dashboard ?? null
          }
    }));
    applyRefreshResultMetadata(result);
  };

  const rememberCombinedDashboardResult = (combinedResult: CombinedDashboardResult): void => {
    setRefreshResults((current) =>
      combinedResult.results.reduce<Record<string, CourseFolderDashboardResult>>(
        (results, result) => ({
          ...results,
          [result.courseFolderId]: result.dashboard
            ? result
            : {
                ...result,
                dashboard: results[result.courseFolderId]?.dashboard ?? null
              }
        }),
        { ...current }
      )
    );
    for (const result of combinedResult.results) {
      applyRefreshResultMetadata(result);
    }
  };

  const runRefreshDashboard = async (): Promise<void> => {
    if (isRefreshingAllRef.current) {
      return;
    }

    const startedAccount = remoteAccount.current;
    const startedEpoch = accountEpoch.current;
    const startedRequests = new Map(folderRequests.current);
    isRefreshingAllRef.current = true;
    setIsRefreshingAll(true);
    setErrorMessage(null);

    try {
      const result = await window.graiderUI.refreshDashboard();
      if (startedAccount === remoteAccount.current && startedEpoch === accountEpoch.current)
        rememberCombinedDashboardResult({
          ...result,
          results: result.results.filter(
            (entry) =>
              startedRequests.get(entry.courseFolderId) ===
              folderRequests.current.get(entry.courseFolderId)
          )
        });
    } catch (error) {
      if (startedEpoch === accountEpoch.current) setErrorMessage(getSafeErrorMessage(error));
    } finally {
      isRefreshingAllRef.current = false;
      setIsRefreshingAll(false);
      if (startedAccount !== remoteAccount.current || startedEpoch !== accountEpoch.current)
        void runRefreshDashboard();
    }
  };

  useEffect(() => {
    if (
      window.graiderUI.loadDashboardDisplay ||
      isLoadingFolders ||
      courseFolders.length === 0 ||
      hasStartedStartupRefresh.current
    ) {
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
    const account = remoteAccount.current;
    const epoch = accountEpoch.current;
    const request = (folderRequests.current.get(id) ?? 0) + 1;
    folderRequests.current.set(id, request);
    setRefreshingId(id);
    setErrorMessage(null);

    try {
      const result = await window.graiderUI.refreshCourseFolder(id);
      if (
        account === remoteAccount.current &&
        epoch === accountEpoch.current &&
        request === folderRequests.current.get(id)
      )
        rememberRefreshResult(result);
    } catch (error) {
      if (epoch === accountEpoch.current) setErrorMessage(getSafeErrorMessage(error));
    } finally {
      if (request === folderRequests.current.get(id)) setRefreshingId(null);
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
    hasPendingCourseLoads: pendingCourseLoads > 0,
    isSelectingFolder,
    refreshingId,
    removingId,
    errorMessage,
    setErrorMessage,
    acceptGithubAccount,
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
