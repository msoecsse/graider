import { useEffect, useRef, useState, type ReactElement } from "react";
import type {
  AssignmentDetailResult,
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord,
  GitHubAuthResult
} from "../../electron/ipc";
import { ApplyPreviewPage } from "../apply-preview/ApplyPreviewPage";
import { AssignmentDetailPage } from "../assignment-detail/AssignmentDetailPage";
import type {
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "../assignment-detail/assignmentDetailTypes";
import { FacultyReportPage } from "../faculty-report/FacultyReportPage";
import { CourseSetupPage } from "../course-setup/CourseSetupPage";
import { AssignmentSetupPage } from "../assignment-setup/AssignmentSetupPage";
import { AssignmentEditPage } from "../assignment-edit/AssignmentEditPage";
import { RosterManagerPage } from "../roster-manager/RosterManagerPage";
import { GradePreviewPage } from "../grade-preview/GradePreviewPage";
import { GradeStatusPage } from "../grade-status/GradeStatusPage";
import type { NormalizedGradeStatus } from "../grade-status/gradeStatusTypes";
import { CourseCardGrid } from "./CourseCardGrid";
import { CourseFolderList } from "./CourseFolderList";
import { DashboardToolbar } from "./DashboardToolbar";
import { FolderErrorPanel } from "./FolderErrorPanel";
import { aggregateDashboardResults } from "./dashboardAggregation";
import {
  filterAndSortDashboardCards,
  filterFolderErrors,
  type DashboardSortOption,
  type DashboardViewFilter
} from "./dashboardFilters";
import type { CombinedDashboardCard, RecentAssignmentSummary } from "./dashboardTypes";

const getSafeErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not update course folders.";

type GitHubAuthViewState =
  | {
      readonly status: "checking";
      readonly result: null;
      readonly errorMessage: null;
    }
  | {
      readonly status: "connected" | "not_connected";
      readonly result: GitHubAuthResult;
      readonly errorMessage: null;
    }
  | {
      readonly status: "check_failed";
      readonly result: null;
      readonly errorMessage: string;
    };

const GITHUB_AUTH_GUIDANCE =
  "GitHub authentication is required for repository checks and grading actions.";
const GITHUB_BROWSER_404_NOTE =
  "If GitHub opens a 404 page for a private course repository, make sure you are signed into GitHub in your browser with the same account.";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<DashboardViewFilter>("active");
  const [sortOption, setSortOption] = useState<DashboardSortOption>("newest-first");
  const [githubAuthState, setGithubAuthState] = useState<GitHubAuthViewState>({
    status: "checking",
    result: null,
    errorMessage: null
  });
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentDetailSelection | null>(
    null
  );
  const [selectedCourseSetupFolderPath, setSelectedCourseSetupFolderPath] = useState<string | null>(
    null
  );
  const [selectedAssignmentSetupCourse, setSelectedAssignmentSetupCourse] =
    useState<CourseFolderRecord | null>(null);
  const [selectedRosterCourse, setSelectedRosterCourse] = useState<CourseFolderRecord | null>(null);
  const [selectedAssignmentDetailResult, setSelectedAssignmentDetailResult] =
    useState<AssignmentDetailResult | null>(null);
  const [isEditingAssignment, setIsEditingAssignment] = useState(false);
  const [selectedApplyPreview, setSelectedApplyPreview] = useState<{
    readonly selection: AssignmentDetailSelection;
    readonly detail: NormalizedAssignmentDetail | null;
  } | null>(null);
  const [selectedGradePreview, setSelectedGradePreview] = useState<{
    readonly selection: AssignmentDetailSelection;
    readonly detail: NormalizedAssignmentDetail | null;
  } | null>(null);
  const [selectedGradeStatus, setSelectedGradeStatus] = useState<{
    readonly selection: AssignmentDetailSelection;
    readonly detail: NormalizedAssignmentDetail | null;
  } | null>(null);
  const [selectedFacultyReport, setSelectedFacultyReport] = useState<{
    readonly selection: AssignmentDetailSelection;
    readonly detail: NormalizedAssignmentDetail | null;
    readonly gradeStatus: NormalizedGradeStatus | null;
  } | null>(null);
  const hasStartedStartupRefresh = useRef(false);
  const isRefreshingAllRef = useRef(false);

  const runGitHubAuthCheck = async (): Promise<void> => {
    setGithubAuthState({
      status: "checking",
      result: null,
      errorMessage: null
    });

    try {
      const result = await window.graiderUI.checkGitHubAuth();
      setGithubAuthState({
        status: result.status,
        result,
        errorMessage: null
      });
    } catch {
      setGithubAuthState({
        status: "check_failed",
        result: null,
        errorMessage:
          "GitHub authentication check failed. Try again after confirming GitHub CLI is installed."
      });
    }
  };

  useEffect(() => {
    void runGitHubAuthCheck();
  }, []);

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
      } else if (!result.canceled && result.error !== undefined) {
        setErrorMessage(`${result.error.message} Course folder: ${result.error.folderPath}`);
      }
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
    } finally {
      setIsSelectingFolder(false);
    }
  };

  const handleOpenCourseSetup = async (): Promise<void> => {
    const selectCourseSetupFolder = window.graiderUI.selectCourseSetupFolder;

    if (selectCourseSetupFolder === undefined) {
      setErrorMessage("Course setup is unavailable in this app build.");
      return;
    }

    try {
      const result = await selectCourseSetupFolder();
      if (!result.canceled && result.courseFolderPath !== null) {
        setSelectedCourseSetupFolderPath(result.courseFolderPath);
      }
    } catch (error) {
      setErrorMessage(getSafeErrorMessage(error));
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

  useEffect(() => {
    if (isLoadingFolders || courseFolders.length === 0 || hasStartedStartupRefresh.current) {
      return;
    }

    hasStartedStartupRefresh.current = true;
    void runRefreshDashboard();
  }, [courseFolders.length, isLoadingFolders]);

  const handleOpenAssignmentDetail = (
    combinedCard: CombinedDashboardCard,
    assignment: RecentAssignmentSummary
  ): void => {
    if (assignment.assignmentFile === null) {
      setErrorMessage("Assignment file path is unavailable for this dashboard row.");
    } else {
      setSelectedAssignment({
        courseFolderId: combinedCard.sourceFolderId,
        courseFolderPath: combinedCard.sourceFolderPath,
        assignmentFile: assignment.assignmentFile,
        assignmentTitle: assignment.title,
        assignmentSlug: assignment.slug,
        assignmentStatus: assignment.status,
        courseTitle: combinedCard.card.courseTitle,
        courseSlug: combinedCard.card.courseSlug,
        termTitle: combinedCard.card.termTitle,
        termSlug: combinedCard.card.termSlug
      });
      setSelectedAssignmentDetailResult(null);
      setSelectedApplyPreview(null);
      setSelectedGradePreview(null);
      setSelectedGradeStatus(null);
      setSelectedFacultyReport(null);
    }
  };

  const handleOpenAssignmentSetup = (courseFolder: CourseFolderRecord): void => {
    setSelectedAssignmentSetupCourse(courseFolder);
    setErrorMessage(null);
  };

  const handleOpenRosterManager = (courseFolder: CourseFolderRecord): void => {
    setSelectedRosterCourse(courseFolder);
    setErrorMessage(null);
  };

  const aggregatedDashboard = aggregateDashboardResults(refreshResults);
  const hasCourseFolders = courseFolders.length > 0;
  const visibleCards = filterAndSortDashboardCards(
    aggregatedDashboard.cards,
    searchQuery,
    viewFilter,
    sortOption
  );
  const visibleFolderErrors = filterFolderErrors(
    aggregatedDashboard.folderErrors,
    searchQuery,
    viewFilter
  );
  const hasFilteredOutCards = aggregatedDashboard.cards.length > 0 && visibleCards.length === 0;

  if (selectedApplyPreview !== null) {
    return (
      <ApplyPreviewPage
        selection={selectedApplyPreview.selection}
        assignmentDetail={selectedApplyPreview.detail}
        onBack={() => {
          setSelectedApplyPreview(null);
        }}
        onRefreshAssignmentDetail={() => {
          setSelectedAssignmentDetailResult(null);
          setSelectedApplyPreview(null);
          setSelectedGradePreview(null);
          setSelectedFacultyReport(null);
        }}
        onBackToDashboard={() => {
          setSelectedAssignment(null);
          setSelectedAssignmentDetailResult(null);
          setSelectedApplyPreview(null);
          setSelectedGradePreview(null);
          setSelectedGradeStatus(null);
          setSelectedFacultyReport(null);
        }}
      />
    );
  }

  if (selectedCourseSetupFolderPath !== null) {
    return (
      <CourseSetupPage
        courseFolderPath={selectedCourseSetupFolderPath}
        onBack={() => {
          setSelectedCourseSetupFolderPath(null);
        }}
        onSaved={() => {
          setSelectedCourseSetupFolderPath(null);
          void handleRefreshDashboard();
        }}
      />
    );
  }

  if (selectedAssignmentSetupCourse !== null) {
    return (
      <AssignmentSetupPage
        courseFolder={selectedAssignmentSetupCourse}
        onBack={() => {
          setSelectedAssignmentSetupCourse(null);
        }}
        onOpenAssignment={(selection) => {
          setSelectedAssignmentSetupCourse(null);
          setSelectedAssignment(selection);
          setSelectedAssignmentDetailResult(null);
          setSelectedApplyPreview(null);
          setSelectedGradePreview(null);
          setSelectedGradeStatus(null);
          setSelectedFacultyReport(null);
          void handleRefreshCourseFolder(selection.courseFolderId);
        }}
      />
    );
  }

  if (selectedRosterCourse !== null) {
    return (
      <RosterManagerPage
        courseFolder={selectedRosterCourse}
        onBack={() => {
          setSelectedRosterCourse(null);
        }}
        onSaved={() => {
          void handleRefreshCourseFolder(selectedRosterCourse.id);
        }}
      />
    );
  }

  if (selectedGradePreview !== null) {
    return (
      <GradePreviewPage
        selection={selectedGradePreview.selection}
        assignmentDetail={selectedGradePreview.detail}
        onBack={() => {
          setSelectedGradePreview(null);
        }}
        onViewGradeStatus={() => {
          setSelectedGradeStatus(selectedGradePreview);
          setSelectedFacultyReport(null);
          setSelectedGradePreview(null);
        }}
        onRefreshAssignmentDetail={() => {
          setSelectedAssignmentDetailResult(null);
          setSelectedGradePreview(null);
          setSelectedGradeStatus(null);
          setSelectedFacultyReport(null);
        }}
        onBackToDashboard={() => {
          setSelectedAssignment(null);
          setSelectedAssignmentDetailResult(null);
          setSelectedApplyPreview(null);
          setSelectedGradePreview(null);
          setSelectedGradeStatus(null);
          setSelectedFacultyReport(null);
        }}
      />
    );
  }

  if (selectedFacultyReport !== null) {
    return (
      <FacultyReportPage
        selection={selectedFacultyReport.selection}
        assignmentDetail={selectedFacultyReport.detail}
        gradeStatus={selectedFacultyReport.gradeStatus}
        onBackToGradeStatus={() => {
          setSelectedFacultyReport(null);
        }}
        onBackToAssignmentDetail={() => {
          setSelectedFacultyReport(null);
          setSelectedGradeStatus(null);
        }}
      />
    );
  }

  if (selectedGradeStatus !== null) {
    return (
      <GradeStatusPage
        selection={selectedGradeStatus.selection}
        assignmentDetail={selectedGradeStatus.detail}
        onBack={() => {
          setSelectedGradeStatus(null);
        }}
        onViewFacultyReport={(gradeStatus) => {
          setSelectedFacultyReport({
            selection: selectedGradeStatus.selection,
            detail: selectedGradeStatus.detail,
            gradeStatus
          });
        }}
      />
    );
  }

  if (selectedAssignment !== null) {
    if (isEditingAssignment) {
      return (
        <AssignmentEditPage
          selection={selectedAssignment}
          onBack={() => setIsEditingAssignment(false)}
          onSaved={() => {
            setIsEditingAssignment(false);
            setSelectedAssignmentDetailResult(null);
          }}
        />
      );
    }
    return (
      <AssignmentDetailPage
        selection={selectedAssignment}
        initialLoadResult={selectedAssignmentDetailResult}
        onDetailLoaded={setSelectedAssignmentDetailResult}
        onEditAssignment={() => {
          setIsEditingAssignment(true);
        }}
        onBack={() => {
          setSelectedAssignment(null);
          setSelectedAssignmentDetailResult(null);
          setSelectedApplyPreview(null);
          setSelectedGradePreview(null);
          setSelectedGradeStatus(null);
          setSelectedFacultyReport(null);
        }}
        onPreviewApply={(selection, detail, loadResult) => {
          setSelectedAssignment(selection);
          setSelectedAssignmentDetailResult(loadResult);
          setSelectedApplyPreview({ selection, detail });
          setSelectedGradePreview(null);
          setSelectedGradeStatus(null);
          setSelectedFacultyReport(null);
        }}
        onPreviewGrade={(selection, detail, loadResult) => {
          setSelectedAssignment(selection);
          setSelectedAssignmentDetailResult(loadResult);
          setSelectedApplyPreview(null);
          setSelectedGradePreview({ selection, detail });
          setSelectedGradeStatus(null);
          setSelectedFacultyReport(null);
        }}
        onViewFacultyReport={(selection, detail, loadResult) => {
          setSelectedAssignment(selection);
          setSelectedAssignmentDetailResult(loadResult);
          setSelectedApplyPreview(null);
          setSelectedGradePreview(null);
          setSelectedGradeStatus(null);
          setSelectedFacultyReport({ selection, detail, gradeStatus: null });
        }}
        onViewGradeStatus={(selection, detail, loadResult) => {
          setSelectedAssignment(selection);
          setSelectedAssignmentDetailResult(loadResult);
          setSelectedApplyPreview(null);
          setSelectedGradePreview(null);
          setSelectedGradeStatus({ selection, detail });
          setSelectedFacultyReport(null);
        }}
      />
    );
  }

  return (
    <main className="dashboard-shell" aria-labelledby="dashboard-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="dashboard-title">Your Courses</h1>
          </div>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              void handleOpenCourseSetup();
            }}
          >
            Set up course folder
          </button>
        </div>
      </header>

      <section className="dashboard-content" aria-label="Course dashboard">
        <DashboardToolbar
          searchQuery={searchQuery}
          viewFilter={viewFilter}
          sortOption={sortOption}
          isRefreshing={isRefreshingAll}
          isSelectingFolder={isSelectingFolder}
          hasCourseFolders={hasCourseFolders}
          visibleCardCount={visibleCards.length}
          totalCardCount={aggregatedDashboard.cards.length}
          onSearchQueryChange={setSearchQuery}
          onViewFilterChange={setViewFilter}
          onSortOptionChange={setSortOption}
          onRefreshDashboard={() => {
            void handleRefreshDashboard();
          }}
          onOpenCourseFolder={() => {
            void handleOpenCourseFolder();
          }}
        />

        <section className="github-auth-status" aria-labelledby="github-auth-title">
          <div>
            <h2 id="github-auth-title">
              GitHub authentication:{" "}
              {githubAuthState.status === "connected"
                ? "Connected"
                : githubAuthState.status === "not_connected"
                  ? "Not connected"
                  : githubAuthState.status === "check_failed"
                    ? "Check failed"
                    : "Checking"}
            </h2>
            {githubAuthState.status === "connected" ? (
              <p>
                Repository checks and grading actions can use GitHub authentication
                {githubAuthState.result.username === null
                  ? "."
                  : ` as ${githubAuthState.result.username}.`}
              </p>
            ) : null}
            {githubAuthState.status === "not_connected" ? (
              <>
                <p>{GITHUB_AUTH_GUIDANCE}</p>
                <p>Run this once in Terminal:</p>
                <pre>gh auth login</pre>
                <p>Then return to Graider and click Check GitHub auth.</p>
                <p className="github-auth-status__note">{GITHUB_BROWSER_404_NOTE}</p>
                {githubAuthState.result.diagnostic === null ? null : (
                  <p className="github-auth-status__diagnostic">
                    {githubAuthState.result.diagnostic}
                  </p>
                )}
              </>
            ) : null}
            {githubAuthState.status === "check_failed" ? (
              <p>{githubAuthState.errorMessage}</p>
            ) : null}
            {githubAuthState.status === "checking" ? (
              <p>Checking GitHub authentication...</p>
            ) : null}
          </div>
          <button
            className="secondary-action"
            type="button"
            disabled={githubAuthState.status === "checking"}
            onClick={() => {
              void runGitHubAuthCheck();
            }}
          >
            {githubAuthState.status === "checking" ? "Checking..." : "Check GitHub auth"}
          </button>
        </section>

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
            <FolderErrorPanel folderErrors={visibleFolderErrors} />
            <CourseCardGrid
              cards={visibleCards}
              courseFolders={courseFolders}
              refreshingId={refreshingId}
              onOpenAssignment={handleOpenAssignmentDetail}
              onSetupAssignment={handleOpenAssignmentSetup}
              onManageRosters={handleOpenRosterManager}
              onRefresh={(id) => {
                void handleRefreshCourseFolder(id);
              }}
            />

            {isRefreshingAll ? <p className="loading-state">Loading dashboard...</p> : null}

            {!isRefreshingAll && !aggregatedDashboard.hasRefreshResults ? (
              <section className="dashboard-placeholder" aria-label="Dashboard loading prompt">
                <h2>Refresh to load course cards.</h2>
                <p>Graider will run dashboard checks for each registered course folder.</p>
              </section>
            ) : null}

            {!isRefreshingAll &&
            aggregatedDashboard.hasRefreshResults &&
            aggregatedDashboard.cards.length === 0 ? (
              <section className="dashboard-placeholder" aria-label="No course cards">
                <h2>No course-term cards found.</h2>
                <p>Review the registered folder status or diagnostics, then refresh again.</p>
              </section>
            ) : null}

            {hasFilteredOutCards ? (
              <section className="dashboard-placeholder" aria-label="No matching courses">
                <h2>No matching courses found.</h2>
                <p>Try a different search or change the view filter.</p>
              </section>
            ) : null}

            <CourseFolderList
              courseFolders={courseFolders}
              refreshResults={refreshResults}
              refreshingId={refreshingId}
              isRefreshingAll={isRefreshingAll}
              removingId={removingId}
              onRefresh={(id) => {
                void handleRefreshCourseFolder(id);
              }}
              onRemove={(id) => {
                void handleRemoveCourseFolder(id);
              }}
              onSetupAssignment={handleOpenAssignmentSetup}
              onManageRosters={handleOpenRosterManager}
            />
          </>
        ) : null}
      </section>
    </main>
  );
};
