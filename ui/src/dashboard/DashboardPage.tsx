import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import type {
  CourseFolderRecord,
  CoursePublishActionResult,
  CoursePublishStatusResult,
  GitHubAuthResult
} from "../../electron/ipc";
import { CourseSetupPage } from "../course-setup/CourseSetupPage";
import { AssignmentSetupPage } from "../assignment-setup/AssignmentSetupPage";
import { EmptyState } from "../components/EmptyState";
import { CourseCardGrid } from "./CourseCardGrid";
import { CourseFolderList } from "./CourseFolderList";
import { DashboardToolbar } from "./DashboardToolbar";
import { FolderErrorPanel } from "./FolderErrorPanel";
import { useDashboardData } from "./DashboardDataContext";
import {
  filterAndSortDashboardCards,
  filterFolderErrors,
  type DashboardSortOption,
  type DashboardViewFilter
} from "./dashboardFilters";
import { findAnyCardForFolder } from "./dashboardResolvers";
import type { CombinedDashboardCard, RecentAssignmentSummary } from "./dashboardTypes";
import { getAssignmentDetailPath, getRosterPath, toRouteSlug } from "./routePaths";

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

const CoursePublishPanel = ({
  courseFolder,
  result,
  isPublishing,
  publishResult,
  onPublish
}: {
  readonly courseFolder: CourseFolderRecord;
  readonly result: CoursePublishStatusResult;
  readonly isPublishing: boolean;
  readonly publishResult: CoursePublishActionResult | null;
  readonly onPublish: () => void;
}): ReactElement => {
  const [isReviewing, setIsReviewing] = useState(false);
  const canPublish = result.status === "changes_pending" || result.status === "unpushed";
  return (
    <section
      className="github-auth-status"
      aria-label={`Publish course changes for ${courseFolder.path}`}
    >
      <div>
        <h2>Course changes</h2>
        <p>{result.diagnostics.map((item) => item.message).join(" ")}</p>
        {result.allowedChangedFiles.length > 0 ? (
          <ul>
            {result.allowedChangedFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        ) : null}
        {result.unrelatedChangedFiles.length > 0 ? (
          <p>Unrelated local changes will not be staged.</p>
        ) : null}
        {isReviewing ? (
          <div>
            <p>Review the course repository change before publishing.</p>
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Folder</dt>
                <dd>{result.courseFolderPath}</dd>
              </div>
              <div className="detail-item">
                <dt>Branch</dt>
                <dd>{result.currentBranch ?? "Unknown"}</dd>
              </div>
              <div className="detail-item">
                <dt>Upstream</dt>
                <dd>{result.upstreamBranch ?? "Not configured"}</dd>
              </div>
              <div className="detail-item">
                <dt>Commit message</dt>
                <dd>Publish Graider course changes</dd>
              </div>
            </dl>
            <p>
              Only the listed Graider-managed files will be staged. Unrelated changes will not be
              staged.
            </p>
            <button
              className="primary-action"
              type="button"
              disabled={isPublishing}
              onClick={onPublish}
            >
              {isPublishing ? "Publishing Course Changes..." : "Confirm Publish Course Changes"}
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={isPublishing}
              onClick={() => setIsReviewing(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}
        {publishResult === null ? null : (
          <p
            className={publishResult.status === "failure" ? "error-message" : "success-message"}
            role="status"
          >
            {publishResult.diagnostics.map((item) => item.message).join(" ")}
          </p>
        )}
      </div>
      {canPublish && !isReviewing ? (
        <button className="primary-action" type="button" onClick={() => setIsReviewing(true)}>
          Publish Course Changes
        </button>
      ) : null}
    </section>
  );
};

export const DashboardPage = (): ReactElement => {
  const {
    courseFolders,
    refreshResults,
    aggregatedDashboard,
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
  } = useDashboardData();
  const navigate = useNavigate();
  const [coursePublishStatuses, setCoursePublishStatuses] = useState<
    Readonly<Record<string, CoursePublishStatusResult>>
  >({});
  const [coursePublishResults, setCoursePublishResults] = useState<
    Readonly<Record<string, CoursePublishActionResult>>
  >({});
  const [publishingCourseId, setPublishingCourseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<DashboardViewFilter>("active");
  const [sortOption, setSortOption] = useState<DashboardSortOption>("newest-first");
  const [isFacultySettingsOpen, setIsFacultySettingsOpen] = useState(false);
  const [facultyUsername, setFacultyUsername] = useState("");
  const [facultySettingsMessage, setFacultySettingsMessage] = useState<string | null>(null);
  const [githubAuthState, setGithubAuthState] = useState<GitHubAuthViewState>({
    status: "checking",
    result: null,
    errorMessage: null
  });
  const [selectedCourseSetupFolderPath, setSelectedCourseSetupFolderPath] = useState<string | null>(
    null
  );
  const [selectedAssignmentSetupCourse, setSelectedAssignmentSetupCourse] =
    useState<CourseFolderRecord | null>(null);
  const githubAuthNeedsAttention =
    githubAuthState.status === "not_connected" || githubAuthState.status === "check_failed";

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

  const loadCoursePublishStatus = async (courseFolderId: string): Promise<void> => {
    if (window.graiderUI.getCoursePublishStatus === undefined) return;
    const result = await window.graiderUI.getCoursePublishStatus(courseFolderId);
    setCoursePublishStatuses((current) => ({ ...current, [courseFolderId]: result }));
  };

  const publishCourseChanges = async (courseFolderId: string): Promise<void> => {
    if (window.graiderUI.publishCourseChanges === undefined) return;
    setPublishingCourseId(courseFolderId);
    setCoursePublishResults((current) => {
      const { [courseFolderId]: _previous, ...remaining } = current;
      return remaining;
    });
    try {
      const result = await window.graiderUI.publishCourseChanges(courseFolderId);
      setCoursePublishResults((current) => ({ ...current, [courseFolderId]: result }));
    } catch {
      setCoursePublishResults((current) => ({
        ...current,
        [courseFolderId]: {
          status: "failure",
          diagnostics: [{ message: "Unable to publish course changes." }],
          commitMessage: null
        }
      }));
    } finally {
      await Promise.allSettled([
        loadCoursePublishStatus(courseFolderId),
        handleRefreshCourseFolder(courseFolderId)
      ]);
      setPublishingCourseId(null);
    }
  };

  useEffect(() => {
    for (const courseFolder of courseFolders) void loadCoursePublishStatus(courseFolder.id);
  }, [courseFolders]);

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
      setErrorMessage(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Could not open course setup."
      );
    }
  };

  const handleOpenFacultySettings = async (): Promise<void> => {
    const getLocalSettings = window.graiderUI.getLocalSettings;
    if (getLocalSettings === undefined) {
      setFacultySettingsMessage("Local settings are unavailable in this app build.");
      return;
    }
    try {
      const settings = await getLocalSettings();
      setFacultyUsername(settings.currentFacultyMsoeUsername ?? "");
      setFacultySettingsMessage(null);
      setIsFacultySettingsOpen(true);
    } catch {
      setFacultySettingsMessage("Unable to load local faculty settings.");
    }
  };

  const handleSaveFacultySettings = async (): Promise<void> => {
    const saveLocalSettings = window.graiderUI.saveLocalSettings;
    if (saveLocalSettings === undefined) return;
    try {
      const settings = await saveLocalSettings(facultyUsername);
      setFacultyUsername(settings.currentFacultyMsoeUsername ?? "");
      setFacultySettingsMessage(
        settings.currentFacultyMsoeUsername === null
          ? "Faculty identity cleared."
          : "Faculty identity saved."
      );
    } catch {
      setFacultySettingsMessage("Unable to save local faculty settings.");
    }
  };

  const handleOpenAssignmentDetail = (
    combinedCard: CombinedDashboardCard,
    assignment: RecentAssignmentSummary
  ): void => {
    if (assignment.assignmentFile === null) {
      setErrorMessage("Assignment file path is unavailable for this dashboard row.");
      return;
    }

    navigate(
      getAssignmentDetailPath(
        toRouteSlug(combinedCard.card.courseSlug),
        toRouteSlug(combinedCard.card.termSlug),
        toRouteSlug(assignment.slug)
      )
    );
  };

  const handleOpenAssignmentSetup = (courseFolder: CourseFolderRecord): void => {
    setSelectedAssignmentSetupCourse(courseFolder);
    setErrorMessage(null);
  };

  const handleOpenRosterManager = (courseFolder: CourseFolderRecord): void => {
    const card = findAnyCardForFolder(aggregatedDashboard.cards, courseFolder.id);

    if (card === null) {
      setErrorMessage("Refresh this course folder before managing its rosters.");
      return;
    }

    navigate(getRosterPath(toRouteSlug(card.card.courseSlug), toRouteSlug(card.card.termSlug)));
  };

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
          void handleRefreshCourseFolder(selection.courseFolderId);

          // AssignmentSetupPage only has the bare CourseFolderRecord, not a
          // dashboard card, so its selection's courseSlug is always null.
          // The folder was already on the dashboard before this flow
          // started, so its card (and the real courseSlug) is already in
          // aggregatedDashboard.cards -- no need to wait for the refresh
          // just kicked off, which only needs to pick up the new assignment.
          const card = findAnyCardForFolder(aggregatedDashboard.cards, selection.courseFolderId);

          navigate(
            getAssignmentDetailPath(
              toRouteSlug(card?.card.courseSlug ?? selection.courseSlug),
              toRouteSlug(selection.termSlug),
              toRouteSlug(selection.assignmentSlug)
            )
          );
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
            <h1 id="dashboard-title" className="app-header__title">
              Your Courses
            </h1>
          </div>
          <div className="app-header__actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                void handleOpenCourseSetup();
              }}
            >
              Set up course folder
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => void handleOpenFacultySettings()}
            >
              Faculty settings
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-content" aria-label="Course dashboard">
        {!isFacultySettingsOpen ? null : (
          <section className="detail-panel" aria-label="Faculty settings">
            <h2>Faculty settings</h2>
            <label>
              Current faculty MSOE username
              <input
                value={facultyUsername}
                placeholder="jones"
                onChange={(event) => setFacultyUsername(event.target.value)}
              />
            </label>
            <button
              className="primary-action"
              type="button"
              onClick={() => void handleSaveFacultySettings()}
            >
              Save faculty settings
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setIsFacultySettingsOpen(false)}
            >
              Close
            </button>
            {facultySettingsMessage === null ? null : <p role="status">{facultySettingsMessage}</p>}
          </section>
        )}
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

        <details className="github-auth-status" open={githubAuthNeedsAttention}>
          <summary>
            GitHub authentication:{" "}
            {githubAuthState.status === "connected"
              ? "Connected"
              : githubAuthState.status === "not_connected"
                ? "Not connected"
                : githubAuthState.status === "check_failed"
                  ? "Check failed"
                  : "Checking"}
          </summary>
          <div className="github-auth-status__content">
            <h2 className="visually-hidden">
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
        </details>

        {courseFolders.map((courseFolder) => {
          const publishStatus = coursePublishStatuses[courseFolder.id];
          return publishStatus === undefined ? null : (
            <CoursePublishPanel
              key={courseFolder.id}
              courseFolder={courseFolder}
              result={publishStatus}
              isPublishing={publishingCourseId === courseFolder.id}
              publishResult={coursePublishResults[courseFolder.id] ?? null}
              onPublish={() => {
                void publishCourseChanges(courseFolder.id);
              }}
            />
          );
        })}

        {errorMessage === null ? null : (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoadingFolders ? <p className="loading-state">Loading course folders...</p> : null}

        {!isLoadingFolders && !hasCourseFolders ? (
          <section aria-label="No courses added yet.">
            <EmptyState
              title="No courses added yet."
              description={
                <>
                  <span>Open a Graider course folder to get started.</span>
                  <br />
                  <span className="empty-state__note">
                    Once you add one, its courses and assignments will appear here.
                  </span>
                </>
              }
              action={{
                label: "Open course folder",
                disabled: isSelectingFolder,
                onClick: () => {
                  void handleOpenCourseFolder();
                }
              }}
            />
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
              <section aria-label="Dashboard loading prompt">
                <EmptyState
                  title="Refresh to load course cards."
                  description="Graider will run dashboard checks for each registered course folder."
                />
              </section>
            ) : null}

            {!isRefreshingAll &&
            aggregatedDashboard.hasRefreshResults &&
            aggregatedDashboard.cards.length === 0 ? (
              <section aria-label="No course cards">
                <EmptyState
                  title="No course-term cards found."
                  description="Review the registered folder status or diagnostics, then refresh again."
                />
              </section>
            ) : null}

            {hasFilteredOutCards ? (
              <section aria-label="No matching courses">
                <EmptyState
                  title="No matching courses found."
                  description="Try a different search or change the view filter."
                />
              </section>
            ) : null}

            <details className="dashboard-advanced">
              <summary>Advanced details</summary>
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
            </details>
          </>
        ) : null}
      </section>
    </main>
  );
};
