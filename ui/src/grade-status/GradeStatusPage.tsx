import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  formatNullableValue,
  formatStatusLabel,
  getDiagnosticCategory,
  groupDiagnostics
} from "../assignment-detail/assignmentDetailReadiness";
import type { AssignmentDetailDiagnostic } from "../assignment-detail/assignmentDetailTypes";
import {
  createGradeStatusSummary,
  isNonTerminalGradeStatusRow,
  mergeGradeStatusRows,
  normalizeGradeStatus
} from "./gradeStatusNormalization";
import { getGradeStatusRunUrl } from "./gradeStatusRunUrl";
import type {
  GradeStatusLoadResult,
  GradeStatusPageProps,
  GradeStatusRepositoryRow,
  NormalizedGradeStatus
} from "./gradeStatusTypes";

export const AUTO_REFRESH_INTERVAL_MS = 15_000;
export const AUTO_REFRESH_MAX_DURATION_MS = 600_000;
const MILLISECONDS_PER_SECOND = 1000;

const getCommandErrorMessage = (result: GradeStatusLoadResult | null): string | null => {
  const errorCode = result?.error?.code;

  if (errorCode === undefined) {
    return null;
  }

  if (errorCode === "graider_cli_not_found") {
    return "Graider CLI not found. Install Graider or make sure graider is available on PATH.";
  }

  if (errorCode === "github_cli_not_found") {
    return "GitHub CLI was not found. Install GitHub CLI or set GRAIDER_GITHUB_TOKEN before launching Graider.";
  }

  if (errorCode === "github_cli_auth_failed" || errorCode === "github_token_unavailable") {
    return "GitHub authentication is required. Run gh auth login in Terminal, then refresh.";
  }

  if (errorCode === "bundled_graider_cli_not_found") {
    return "Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app.";
  }

  if (errorCode === "invalid_assignment_grade_status_json") {
    return "Graider returned invalid grade status JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to load grade status.";
};

const getAssignmentTitle = (
  status: NormalizedGradeStatus | null,
  fallbackTitle: string | null,
  fallbackSlug: string | null
): string => status?.assignment.title ?? fallbackTitle ?? fallbackSlug ?? "Grade Status";

const getCourseTermSubtitle = (status: NormalizedGradeStatus | null): string => {
  const course = status?.course.title ?? status?.course.slug;
  const term = status?.term.title ?? status?.term.slug;

  if (course !== undefined && course !== null && term !== undefined && term !== null) {
    return `${course} · ${term}`;
  }

  return course ?? term ?? "Course assignment";
};

const formatSeconds = (milliseconds: number): number => milliseconds / MILLISECONDS_PER_SECOND;

const getStudentLabel = (row: GradeStatusRepositoryRow): string =>
  row.studentUsername ?? row.studentId ?? row.githubUsername ?? "Unknown student";

const formatGradeStatusRowLabel = (row: GradeStatusRepositoryRow): string => {
  if (row.status === "queued") {
    return "Queued";
  }

  if (row.status === "in_progress") {
    return "In progress";
  }

  if (row.status === "completed") {
    if (row.conclusion === "cancelled") {
      return "Cancelled";
    }

    if (row.conclusion === "timed_out") {
      return "Timed out";
    }

    return `Completed — ${row.conclusion ?? "unknown"}`;
  }

  if (row.status === "missing") {
    return "Missing";
  }

  if (row.status === "token_required") {
    return "Token required";
  }

  return row.status === "blocked" ? "Blocked" : "Unknown";
};

const getGradeStatusChipClassName = (row: GradeStatusRepositoryRow): string => {
  if (row.status === "completed" && row.conclusion === "success")
    return "status-chip status-chip--success";
  if (row.status === "completed" && row.conclusion === "failure")
    return "status-chip status-chip--error";
  return row.needsAttention ? "status-chip status-chip--attention" : "status-chip";
};

const getNotReadyReason = (status: NormalizedGradeStatus): string => {
  const parts = [
    status.summary.queued + status.summary.inProgress > 0
      ? `${status.summary.queued + status.summary.inProgress} runs still in progress.`
      : null,
    status.summary.missing > 0
      ? `${status.summary.missing} repositories are missing completed grading runs.`
      : null,
    status.summary.unknown > 0 ? `${status.summary.unknown} repositories are unknown.` : null,
    status.summary.blocked > 0 ? `${status.summary.blocked} repositories are blocked.` : null
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? "Status is not ready for report generation yet." : parts.join(" ");
};

const DetailItem = ({
  label,
  value
}: {
  readonly label: string;
  readonly value: string | number | null | undefined;
}): ReactElement => (
  <div className="detail-item">
    <dt>{label}</dt>
    <dd>
      <span>{formatNullableValue(value)}</span>
    </dd>
  </div>
);

const SummaryPanel = ({ status }: { readonly status: NormalizedGradeStatus }): ReactElement => (
  <section className="detail-panel apply-preview-summary" aria-labelledby="grade-status-summary">
    <h2 id="grade-status-summary">Status summary</h2>
    <dl className="apply-preview-counts">
      <div>
        <dt>Total repositories</dt>
        <dd>{status.summary.totalRepositories}</dd>
      </div>
      <div>
        <dt>Queued</dt>
        <dd>{status.summary.queued}</dd>
      </div>
      <div>
        <dt>In progress</dt>
        <dd>{status.summary.inProgress}</dd>
      </div>
      <div>
        <dt>Completed</dt>
        <dd>{status.summary.completed}</dd>
      </div>
      <div>
        <dt>Successful</dt>
        <dd>{status.summary.successful}</dd>
      </div>
      <div>
        <dt>Failed</dt>
        <dd>{status.summary.failed}</dd>
      </div>
      <div>
        <dt>Cancelled</dt>
        <dd>{status.summary.cancelled}</dd>
      </div>
      <div>
        <dt>Timed out</dt>
        <dd>{status.summary.timedOut}</dd>
      </div>
      <div>
        <dt>Missing</dt>
        <dd>{status.summary.missing}</dd>
      </div>
      <div>
        <dt>Unknown</dt>
        <dd>{status.summary.unknown}</dd>
      </div>
      <div>
        <dt>Needs attention</dt>
        <dd>{status.summary.needsAttention}</dd>
      </div>
      <div>
        <dt>Ready for report</dt>
        <dd>{status.summary.readyForReport ? "Yes" : "No"}</dd>
      </div>
    </dl>
    <p className="detail-panel__note">
      {status.summary.readyForReport ? "Ready for report generation." : getNotReadyReason(status)}
    </p>
  </section>
);

const ContextPanel = ({ status }: { readonly status: NormalizedGradeStatus }): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-status-context">
    <h2 id="grade-status-context">Context</h2>
    <dl className="detail-grid">
      <DetailItem label="Assignment" value={status.assignment.title ?? status.assignment.slug} />
      <DetailItem label="Assignment status" value={status.assignment.status} />
      <DetailItem label="Course" value={status.course.title ?? status.course.slug} />
      <DetailItem label="Term" value={status.term.title ?? status.term.slug} />
      <DetailItem label="Assignment file" value={status.assignment.file} />
      <DetailItem label="Sections" value={status.target.sections.join(", ") || null} />
      <DetailItem label="Student count" value={status.target.studentCount} />
      <DetailItem label="Active students" value={status.target.activeStudentCount} />
    </dl>
  </section>
);

const GradingPanel = ({ status }: { readonly status: NormalizedGradeStatus }): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-status-grading">
    <h2 id="grade-status-grading">Effective grading</h2>
    <dl className="detail-grid">
      <DetailItem label="Enabled" value={status.grading.enabled ? "Enabled" : "Disabled"} />
      <DetailItem label="Resolved from" value={status.grading.resolvedFrom} />
      <DetailItem label="Mode" value={status.grading.mode} />
      <DetailItem label="Workflow path" value={status.grading.workflow} />
      <DetailItem label="Artifact name" value={status.grading.artifact} />
      <DetailItem label="Result file" value={status.grading.resultFile} />
      <DetailItem label="Workflow ref" value={status.grading.workflowRef} />
    </dl>
  </section>
);

const RepositoryRowsPanel = ({
  rows
}: {
  readonly rows: readonly GradeStatusRepositoryRow[];
}): ReactElement => (
  <section className="detail-panel apply-preview-repositories" aria-labelledby="grade-status-rows">
    <h2 id="grade-status-rows">Repository status rows</h2>
    {rows.length === 0 ? (
      <p className="detail-panel__note">No repository status rows were returned.</p>
    ) : (
      <div className="apply-preview-table" role="table" aria-label="Repository grade status rows">
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Workflow</span>
          <span role="columnheader">Run</span>
        </div>
        {rows.map((row) => {
          const runUrl = getGradeStatusRunUrl(row);

          return (
            <div
              className="apply-preview-table__row"
              role="row"
              key={`${row.studentId ?? row.githubUsername ?? row.repository ?? "row"}-${row.section ?? "section"}`}
            >
              <span role="cell">{getStudentLabel(row)}</span>
              <span role="cell">{formatNullableValue(row.section)}</span>
              <span role="cell" className="apply-preview-table__repository">
                {formatNullableValue(row.repository)}
              </span>
              <span role="cell">
                <span className={getGradeStatusChipClassName(row)}>
                  {formatGradeStatusRowLabel(row)}
                </span>
              </span>
              <span role="cell">
                {formatNullableValue(row.workflow)}
                {row.ref === null ? null : <span className="muted-inline"> @ {row.ref}</span>}
              </span>
              <span role="cell">
                {runUrl === null ? (
                  <span>Run {formatNullableValue(row.runId)}</span>
                ) : (
                  <a href={runUrl} target="_blank" rel="noreferrer">
                    Run {formatNullableValue(row.runId)}
                  </a>
                )}
                <span className="muted-inline"> Started {formatNullableValue(row.startedAt)}</span>
                <span className="muted-inline">
                  {" "}
                  Completed {formatNullableValue(row.completedAt)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    )}
  </section>
);

const DiagnosticEntry = ({
  diagnostic
}: {
  readonly diagnostic: AssignmentDetailDiagnostic;
}): ReactElement => (
  <li>
    <strong>{formatStatusLabel(diagnostic.severity)}</strong>
    <span className="diagnostic-category">{getDiagnosticCategory(diagnostic)}</span>
    <span>{diagnostic.message}</span>
    {diagnostic.code === null ? null : <code>{diagnostic.code}</code>}
  </li>
);

const DiagnosticsPanel = ({
  diagnostics
}: {
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-status-diagnostics">
    <h2 id="grade-status-diagnostics">Diagnostics</h2>
    {diagnostics.length === 0 ? (
      <p className="detail-panel__note">No diagnostics.</p>
    ) : (
      <div className="diagnostic-groups">
        {groupDiagnostics(diagnostics).map((group) => (
          <section className="diagnostic-group" aria-label={group.label} key={group.key}>
            <h3>{group.label}</h3>
            <ul className="assignment-detail-diagnostics">
              {group.diagnostics.map((diagnostic, index) => (
                <DiagnosticEntry
                  diagnostic={diagnostic}
                  key={`${diagnostic.code ?? "diagnostic"}-${index}`}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )}
  </section>
);

export const GradeStatusPage = ({
  selection,
  assignmentDetail,
  onBack,
  onViewFacultyReport
}: GradeStatusPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<GradeStatusLoadResult | null>(null);
  const [mergedStatus, setMergedStatus] = useState<NormalizedGradeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshStopped, setAutoRefreshStopped] = useState(false);
  const autoRefreshStartedAtRef = useRef<number | null>(null);
  const hasInFlightAutoRefreshRef = useRef(false);

  const normalizedLoadStatus = useMemo(
    () =>
      loadResult?.gradeStatus === null || loadResult?.gradeStatus === undefined
        ? null
        : normalizeGradeStatus(loadResult.gradeStatus, selection, loadResult.refreshedAt),
    [loadResult, selection]
  );

  const commandErrorMessage = getCommandErrorMessage(loadResult);
  const activeStatus = mergedStatus ?? normalizedLoadStatus;
  const title = getAssignmentTitle(
    activeStatus,
    assignmentDetail?.assignment.title ?? selection.assignmentTitle,
    assignmentDetail?.assignment.slug ?? selection.assignmentSlug
  );
  const showTokenGuidance =
    activeStatus?.diagnostics.some((diagnostic) => diagnostic.code === "github_token_required") ??
    false;
  const unfinishedStudentIds =
    activeStatus?.repositories
      .filter(isNonTerminalGradeStatusRow)
      .map((row) => row.studentId)
      .filter((studentId): studentId is string => studentId !== null) ?? [];
  const hasUnfinishedRows = unfinishedStudentIds.length > 0;

  const loadStatus = async (studentIds?: readonly string[]): Promise<void> => {
    const filtered = studentIds !== undefined && studentIds.length > 0;

    if (filtered) {
      hasInFlightAutoRefreshRef.current = true;
    } else if (loadResult === null) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const nextResult = await window.graiderUI.getAssignmentGradeStatus({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        ...(filtered ? { studentIds } : {})
      });

      setLoadResult(nextResult);

      if (nextResult.gradeStatus !== null) {
        const normalized = normalizeGradeStatus(
          nextResult.gradeStatus,
          selection,
          nextResult.refreshedAt
        );

        setMergedStatus((currentStatus) => {
          if (!filtered || currentStatus === null) {
            return normalized;
          }

          const mergedRows = mergeGradeStatusRows(
            currentStatus.repositories,
            normalized.repositories
          );

          return {
            ...currentStatus,
            status: normalized.status,
            exitCode: normalized.exitCode,
            refreshedAt: normalized.refreshedAt,
            diagnostics: normalized.diagnostics,
            summary: createGradeStatusSummary(mergedRows),
            repositories: mergedRows
          };
        });
      }
    } catch {
      setLoadResult((currentResult) => ({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        ...(filtered ? { studentIds } : {}),
        status: "failure",
        gradeStatus: currentResult?.gradeStatus ?? null,
        error: {
          code: "assignment_grade_status_failed",
          message: "Unable to load grade status.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: currentResult?.refreshedAt ?? null
      }));
    } finally {
      if (filtered) {
        hasInFlightAutoRefreshRef.current = false;
      } else {
        setIsLoading(false);
        setIsRefreshing(false);
        setAutoRefreshStopped(false);
        autoRefreshStartedAtRef.current = Date.now();
      }
    }
  };

  useEffect(() => {
    autoRefreshStartedAtRef.current = Date.now();
    void loadStatus();
  }, [selection.assignmentFile, selection.courseFolderId, selection.courseFolderPath]);

  useEffect(() => {
    if (activeStatus === null || !hasUnfinishedRows || autoRefreshStopped) {
      return undefined;
    }

    if (autoRefreshStartedAtRef.current === null) {
      autoRefreshStartedAtRef.current = Date.now();
    }

    const timerId = window.setInterval(() => {
      const startedAt = autoRefreshStartedAtRef.current ?? Date.now();

      if (Date.now() - startedAt >= AUTO_REFRESH_MAX_DURATION_MS) {
        setAutoRefreshStopped(true);
        window.clearInterval(timerId);
      } else if (!hasInFlightAutoRefreshRef.current) {
        void loadStatus(unfinishedStudentIds);
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [hasUnfinishedRows, autoRefreshStopped, unfinishedStudentIds.join(",")]);

  return (
    <main className="dashboard-shell" aria-labelledby="grade-status-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="grade-status-title">Grade Status</h1>
            <p className="assignment-detail__subtitle">{title}</p>
            <p className="assignment-detail__subtitle">{getCourseTermSubtitle(activeStatus)}</p>
          </div>
          <div className="assignment-detail__header-actions">
            <button className="secondary-action" type="button" onClick={onBack}>
              Back to assignment detail
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={isLoading || isRefreshing}
              onClick={() => {
                void loadStatus();
              }}
            >
              {isLoading || isRefreshing ? "Refreshing status..." : "Refresh status"}
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-content assignment-detail" aria-label="Grade status">
        <p className="preview-only-notice">
          Read-only status view — no reports, artifacts, or workflow dispatches are started.
        </p>
        <p className="assignment-detail__path">
          Assignment file: {activeStatus?.assignment.file ?? selection.assignmentFile}
        </p>
        {activeStatus?.refreshedAt === null || activeStatus?.refreshedAt === undefined ? null : (
          <p className="assignment-detail__path">Last refreshed: {activeStatus.refreshedAt}</p>
        )}
        {isLoading ? <p className="loading-state">Loading grade status...</p> : null}
        {isRefreshing ? (
          <p className="loading-state">Refreshing status while keeping the current snapshot.</p>
        ) : null}
        {hasUnfinishedRows && !autoRefreshStopped ? (
          <p className="loading-state">
            Auto-refreshing every {formatSeconds(AUTO_REFRESH_INTERVAL_MS)} seconds while grading is
            running.
          </p>
        ) : null}
        {autoRefreshStopped ? (
          <p className="loading-state">Auto-refresh stopped. Use Refresh status to check again.</p>
        ) : null}

        {commandErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {commandErrorMessage}
          </p>
        )}

        {showTokenGuidance ? (
          <section className="detail-guidance" aria-label="GitHub token guidance">
            <h2>GitHub token required to check grading status.</h2>
            <p>Sign in with GitHub CLI using gh auth login, then refresh.</p>
          </section>
        ) : null}

        {activeStatus === null ? (
          <section className="dashboard-placeholder" aria-label="Grade status loading">
            <h2>Loading grade status.</h2>
            <p>Graider is reading GitHub Actions workflow run status.</p>
          </section>
        ) : (
          <div className="assignment-detail-grid apply-preview-grid">
            <ContextPanel status={activeStatus} />
            <GradingPanel status={activeStatus} />
            <SummaryPanel status={activeStatus} />
            <RepositoryRowsPanel rows={activeStatus.repositories} />
            <DiagnosticsPanel diagnostics={activeStatus.diagnostics} />
            <section className="detail-panel apply-preview-final-action">
              <h2>Report generation</h2>
              <p>
                {activeStatus.summary.readyForReport
                  ? "Ready for report generation."
                  : "Some grading runs are not complete. The report command can still run, but it may show missing results."}
              </p>
              <button
                className="primary-action"
                type="button"
                onClick={() => {
                  onViewFacultyReport(activeStatus);
                }}
              >
                View faculty report
              </button>
              <button className="secondary-action" type="button" disabled>
                Publish student reports — deferred
              </button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
};
