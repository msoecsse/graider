import { useEffect, useState, type ReactElement } from "react";
import type {
  AssignmentDetailResult,
  CombinedDashboardResult,
  CourseFolderDashboardResult,
  CourseFolderRecord
} from "../../electron/ipc";
import { ApplyPreviewPage } from "../apply-preview/ApplyPreviewPage";
import { AssignmentDetailPage } from "../assignment-detail/AssignmentDetailPage";
import type {
  AssignmentDetailSelection,
  NormalizedAssignmentDetail
} from "../assignment-detail/assignmentDetailTypes";
import { FacultyReportPage } from "../faculty-report/FacultyReportPage";
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
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentDetailSelection | null>(
    null
  );
  const [selectedAssignmentDetailResult, setSelectedAssignmentDetailResult] =
    useState<AssignmentDetailResult | null>(null);
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
    return (
      <AssignmentDetailPage
        selection={selectedAssignment}
        initialLoadResult={selectedAssignmentDetailResult}
        onDetailLoaded={setSelectedAssignmentDetailResult}
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
            <CourseCardGrid cards={visibleCards} onOpenAssignment={handleOpenAssignmentDetail} />

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
