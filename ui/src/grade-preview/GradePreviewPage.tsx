import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  formatNullableValue,
  getDiagnosticCategory,
  groupDiagnostics
} from "../assignment-detail/assignmentDetailReadiness";
import {
  formatReasonLabel,
  formatStatusLabel,
  hasAttentionStatus
} from "../components/statusLabels";
import { formatReadableDateTime } from "../components/dateTime";
import type { AssignmentDetailDiagnostic } from "../assignment-detail/assignmentDetailTypes";
import { normalizeGradeDispatchResult } from "./gradeResultNormalization";
import { normalizeGradePreview } from "./gradePreviewNormalization";
import {
  canDispatchGradePreview,
  getGradeDispatchBlockerReasons,
  getGradePreviewReadinessLabel,
  getGradePreviewStatusItems,
  hasGradePreviewTokenRequirement
} from "./gradePreviewReadiness";
import {
  formatMergedGradeRowStatus,
  getGradePlanSummaryText,
  mergedGradeRowNeedsAttention,
  mergeGradeRows
} from "./gradePreviewMerge";
import type {
  GradeExecutionLoadResult,
  GradePreviewLoadResult,
  GradePreviewPageProps,
  GradeRowState,
  NormalizedGradeDispatchResult,
  NormalizedGradePreview
} from "./gradePreviewTypes";

const displayBoolean = (value: boolean): string => (value ? "Enabled" : "Disabled");

const getCommandErrorMessage = (result: GradePreviewLoadResult | null): string | null => {
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

  if (errorCode === "invalid_assignment_grade_preview_json") {
    return "Graider returned invalid grade preview JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to load grade preview.";
};

const getGradeCommandErrorMessage = (result: GradeExecutionLoadResult | null): string | null => {
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

  if (errorCode === "invalid_assignment_grade_json") {
    return "Graider returned invalid grade JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to dispatch grading.";
};

const getAssignmentTitle = (
  preview: NormalizedGradePreview | null,
  fallbackTitle: string | null,
  fallbackSlug: string | null
): string => preview?.assignment.title ?? fallbackTitle ?? fallbackSlug ?? "Grade Dispatch Preview";

const getCourseTermSubtitle = (preview: NormalizedGradePreview | null): string => {
  const course = preview?.course.title ?? preview?.course.slug;
  const term = preview?.term.title ?? preview?.term.slug;

  if (course !== undefined && course !== null && term !== undefined && term !== null) {
    return `${course} · ${term}`;
  }

  return course ?? term ?? "Course assignment";
};

const getStudentLabel = (row: GradeRowState): string => row.studentId ?? "Unknown student";

interface DetailItemProps {
  readonly label: string;
  readonly value: string | number | null | undefined;
}

const DetailItem = ({ label, value }: DetailItemProps): ReactElement => (
  <div className="detail-item">
    <dt>{label}</dt>
    <dd>
      <span>{formatNullableValue(value)}</span>
    </dd>
  </div>
);

const StatusItem = ({
  label,
  value
}: {
  readonly label: string;
  readonly value: string | null;
}): ReactElement => (
  <div className="detail-item">
    <dt>{label}</dt>
    <dd>
      <span
        className={hasAttentionStatus(value) ? "status-chip status-chip--attention" : "status-chip"}
      >
        {formatStatusLabel(value)}
      </span>
    </dd>
  </div>
);

const PreviewStatusPanel = ({
  preview
}: {
  readonly preview: NormalizedGradePreview;
}): ReactElement => {
  const statusItems = getGradePreviewStatusItems(preview);
  const readinessClass = statusItems.length === 0 ? "ready" : "needs_attention";

  return (
    <section
      className={`readiness-summary readiness-summary--${readinessClass}`}
      aria-labelledby="grade-preview-readiness-title"
    >
      <div className="readiness-summary__header">
        <div>
          <h2 id="grade-preview-readiness-title">Preview status</h2>
          <p className="readiness-summary__status">{getGradePreviewReadinessLabel(preview)}</p>
        </div>
        <span className="status-chip">{formatStatusLabel(preview.status)}</span>
      </div>
      <p>
        {preview.plan.summary.wouldDispatch} student repositories would receive grading workflow
        dispatches.
      </p>
      {statusItems.length === 0 ? null : (
        <ul className="needs-attention-list" aria-label="Grade preview items needing attention">
          {statusItems.map((item) => (
            <li key={item}>
              <strong>{item}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const ContextPanel = ({ preview }: { readonly preview: NormalizedGradePreview }): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-preview-context-title">
    <h2 id="grade-preview-context-title">Context</h2>
    <dl className="detail-grid">
      <DetailItem label="Assignment" value={preview.assignment.title ?? preview.assignment.slug} />
      <DetailItem label="Assignment status" value={formatStatusLabel(preview.assignment.status)} />
      <DetailItem label="Course" value={preview.course.title ?? preview.course.slug} />
      <DetailItem label="Term" value={preview.term.title ?? preview.term.slug} />
      <DetailItem label="Assignment file" value={preview.files.assignmentFile} />
      <DetailItem label="Manifest file" value={preview.files.manifestFile} />
    </dl>
  </section>
);

const TargetPanel = ({ preview }: { readonly preview: NormalizedGradePreview }): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-preview-target-title">
    <h2 id="grade-preview-target-title">Target</h2>
    <dl className="detail-grid">
      <DetailItem label="Sections" value={preview.target.sections.join(", ") || null} />
      <DetailItem label="Section count" value={preview.target.sectionCount} />
      <DetailItem label="Student count" value={preview.target.studentCount} />
      <DetailItem label="Active students" value={preview.target.activeStudentCount} />
    </dl>
    {preview.target.studentCount === 0 ? (
      <p className="detail-panel__note">No target students found.</p>
    ) : null}
  </section>
);

const GradingPanel = ({ preview }: { readonly preview: NormalizedGradePreview }): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-preview-grading-title">
    <h2 id="grade-preview-grading-title">Effective grading</h2>
    {!preview.grading.enabled ? (
      <p className="detail-panel__note">Grading is disabled for this assignment.</p>
    ) : (
      <dl className="detail-grid">
        <DetailItem label="Enabled" value={displayBoolean(preview.grading.enabled)} />
        <DetailItem label="Resolved from" value={preview.grading.resolvedFrom} />
        <DetailItem label="Mode" value={preview.grading.mode} />
        <DetailItem label="Workflow path" value={preview.grading.workflow} />
        <DetailItem label="Artifact name" value={preview.grading.artifact} />
        <DetailItem label="Result file" value={preview.grading.resultFile} />
      </dl>
    )}
  </section>
);

const WorkflowPanel = ({ preview }: { readonly preview: NormalizedGradePreview }): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-preview-workflow-title">
    <h2 id="grade-preview-workflow-title">Workflow</h2>
    <dl className="detail-grid">
      <DetailItem
        label="Workflow file"
        value={preview.files.workflowFile ?? preview.grading.workflow}
      />
      <DetailItem label="Dispatch ref" value={preview.grading.workflowRef} />
      <StatusItem label="workflow_dispatch readiness" value={preview.grading.workflowDispatch} />
    </dl>
  </section>
);

const getDispatchedAtLabel = (dispatchedAt: string | null): string | null =>
  dispatchedAt === null ? null : formatReadableDateTime(dispatchedAt);

/**
 * README section 5.4: "one summary sentence, not ten counter boxes" -- here,
 * two four-box panels. The sentence is computed from the same merged rows
 * the table below renders, so its counts agree with the rows shown by
 * construction -- see gradePreviewMerge.ts. The result metadata block
 * (status/exit code/dispatched time) only appears once dispatch has run;
 * the rest of `DispatchResultSummaryPanel`'s old fields (Assignment, Course,
 * Term, Workflow file, Dispatch ref) were dropped rather than carried over
 * -- they duplicated `ContextPanel`/`WorkflowPanel`, which stay unconditional
 * and unchanged (see the PR9-2 summary).
 */
const PlanSummaryPanel = ({
  result,
  rows
}: {
  readonly result: NormalizedGradeDispatchResult | null;
  readonly rows: readonly GradeRowState[];
}): ReactElement => {
  const dispatchedAtLabel = result === null ? null : getDispatchedAtLabel(result.dispatchedAt);

  return (
    <section className="detail-panel apply-preview-summary" aria-labelledby="grade-plan-summary">
      <h2 id="grade-plan-summary">Repository dispatch plan</h2>
      <p>{getGradePlanSummaryText(result !== null, rows)}</p>
      {result === null ? null : (
        <div className="apply-result-meta">
          <span className="status-chip">{formatStatusLabel(result.status)}</span>
          <span>Exit code {result.exitCode}</span>
          {dispatchedAtLabel === null ? null : <span>Dispatched {dispatchedAtLabel}</span>}
        </div>
      )}
    </section>
  );
};

const RowDiagnostics = ({
  diagnostics
}: {
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}): ReactElement | null => {
  if (diagnostics.length === 0) {
    return null;
  }

  return (
    <ul className="apply-preview-row-diagnostics" aria-label="Row diagnostics">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code ?? "diagnostic"}-${index}`}>
          <strong>{formatStatusLabel(diagnostic.severity)}</strong>
          <span>{diagnostic.message}</span>
          {diagnostic.code === null ? null : <code>{diagnostic.code}</code>}
        </li>
      ))}
    </ul>
  );
};

/**
 * One row per student, its preview and (once dispatch has run) result
 * status joined. README section 5.4: "one plan table... updates that
 * table's Status column in place" -- there is no second table appended once
 * dispatch runs; this same table's Status/Reason cells just start reading
 * differently for rows the result covers.
 */
const RepositoryRowsPanel = ({
  rows
}: {
  readonly rows: readonly GradeRowState[];
}): ReactElement => (
  <section
    className="detail-panel apply-preview-repositories"
    aria-labelledby="grade-preview-rows-title"
  >
    <h2 id="grade-preview-rows-title">Repository rows</h2>
    {rows.length === 0 ? (
      <p className="detail-panel__note">No repository rows.</p>
    ) : (
      <div className="apply-preview-table" role="table" aria-label="Repository rows">
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Workflow / ref</span>
          <span role="columnheader">Reason</span>
        </div>
        {rows.map((row) => (
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
              <span
                className={
                  mergedGradeRowNeedsAttention(row)
                    ? "status-chip status-chip--attention"
                    : "status-chip"
                }
              >
                {formatMergedGradeRowStatus(row)}
              </span>
            </span>
            <span role="cell">
              {formatNullableValue(row.workflow)}
              {row.ref === null ? null : <span className="muted-inline"> @ {row.ref}</span>}
            </span>
            <span role="cell">
              {formatReasonLabel(row.resultStatus === null ? row.previewReason : row.resultReason)}
              <RowDiagnostics diagnostics={row.diagnostics} />
            </span>
          </div>
        ))}
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
    {Object.keys(diagnostic.context).length === 0 ? null : (
      <dl className="diagnostic-context">
        {Object.entries(diagnostic.context).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    )}
  </li>
);

/**
 * README section 5.4: "one diagnostics region, shown only when there is
 * something to say" -- callers only render this when `diagnostics` is
 * non-empty, so unlike its predecessor this component never needs its own
 * empty state.
 */
const DiagnosticsPanel = ({
  diagnostics
}: {
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-preview-diagnostics-title">
    <h2 id="grade-preview-diagnostics-title">Diagnostics / blockers</h2>
    <div className="diagnostic-groups">
      {groupDiagnostics(diagnostics).map((group) => (
        <section className="diagnostic-group" aria-label={group.label} key={group.key}>
          <h3>{group.key === "needs_attention" ? "Blockers" : group.label}</h3>
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
  </section>
);

const ConfirmationPanel = ({
  preview,
  isConfirming,
  isConfirmed,
  isDispatching,
  onOpenConfirmation,
  onConfirmationChange,
  onCancel,
  onDispatch
}: {
  readonly preview: NormalizedGradePreview;
  readonly isConfirming: boolean;
  readonly isConfirmed: boolean;
  readonly isDispatching: boolean;
  readonly onOpenConfirmation: () => void;
  readonly onConfirmationChange: (checked: boolean) => void;
  readonly onCancel: () => void;
  readonly onDispatch: () => void;
}): ReactElement => {
  const blockerReasons = getGradeDispatchBlockerReasons(preview);
  const canDispatch = blockerReasons.length === 0;

  return (
    <section
      className="detail-panel apply-preview-final-action"
      aria-labelledby="grade-dispatch-confirmation-title"
    >
      <h2 id="grade-dispatch-confirmation-title">Dispatch grading</h2>
      {canDispatch ? (
        <p>Preview is ready. Review and confirm before starting grading workflows.</p>
      ) : (
        <>
          <p>Dispatch grading is disabled until the latest preview has no blockers.</p>
          <ul className="needs-attention-list" aria-label="Grade dispatch blockers">
            {blockerReasons.map((reason) => (
              <li key={reason}>
                <strong>{reason}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {!canDispatch ? (
        <button className="primary-action" type="button" disabled>
          Dispatch grading
        </button>
      ) : null}
      {canDispatch && !isConfirming ? (
        <button
          className="primary-action"
          type="button"
          disabled={isDispatching}
          onClick={onOpenConfirmation}
        >
          Review grade dispatch
        </button>
      ) : null}
      {canDispatch && isConfirming ? (
        <div className="apply-confirmation-panel" role="dialog" aria-modal="false">
          <h3>Confirm grade dispatch</h3>
          <ul>
            <li>This will start GitHub Actions grading workflows on student repositories.</li>
            <li>This does not collect results yet.</li>
            <li>Reports and result collection are handled in later slices.</li>
          </ul>
          <label className="confirmation-check">
            <input
              type="checkbox"
              checked={isConfirmed}
              disabled={isDispatching}
              onChange={(event) => {
                onConfirmationChange(event.currentTarget.checked);
              }}
            />
            <span>I understand this will start grading workflows on student repositories</span>
          </label>
          <div className="apply-confirmation-actions">
            <button
              className="secondary-action"
              type="button"
              disabled={isDispatching}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={!isConfirmed || isDispatching}
              onClick={onDispatch}
            >
              {isDispatching ? "Dispatching..." : "Dispatch grading"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

/**
 * The one part of the old design that genuinely was a single panel whose
 * content changes: pre-dispatch this slot holds `ConfirmationPanel`,
 * post-dispatch it holds this. Never both at once, so it was never part of
 * the stacking defect README section 5.4 describes.
 */
const PostDispatchActionsPanel = ({
  onViewGradeStatus,
  onRefreshAssignmentDetail
}: {
  readonly onViewGradeStatus?: () => void;
  readonly onRefreshAssignmentDetail?: () => void;
}): ReactElement => (
  <section
    className="detail-panel apply-preview-final-action"
    aria-labelledby="post-grade-dispatch-title"
  >
    <h2 id="post-grade-dispatch-title">Post-dispatch actions</h2>
    <div className="apply-confirmation-actions">
      {onViewGradeStatus === undefined ? null : (
        <button className="primary-action" type="button" onClick={onViewGradeStatus}>
          View grading status
        </button>
      )}
      {onRefreshAssignmentDetail === undefined ? null : (
        <button className="primary-action" type="button" onClick={onRefreshAssignmentDetail}>
          Refresh assignment detail
        </button>
      )}
    </div>
  </section>
);

export const GradePreviewPage = ({
  selection,
  assignmentDetail,
  onViewGradeStatus,
  onRefreshAssignmentDetail
}: GradePreviewPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<GradePreviewLoadResult | null>(null);
  const [gradeResult, setGradeResult] = useState<GradeExecutionLoadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isConfirmingDispatch, setIsConfirmingDispatch] = useState(false);
  const [isDispatchConfirmed, setIsDispatchConfirmed] = useState(false);

  const preview = useMemo(
    () =>
      loadResult?.preview === null || loadResult?.preview === undefined
        ? null
        : normalizeGradePreview(loadResult.preview, selection, loadResult.refreshedAt),
    [loadResult, selection]
  );

  const normalizedGradeResult = useMemo(
    () =>
      gradeResult?.grade === null || gradeResult?.grade === undefined
        ? null
        : normalizeGradeDispatchResult(gradeResult.grade, gradeResult.dispatchedAt),
    [gradeResult]
  );

  const mergedRows = useMemo(
    () => (preview === null ? [] : mergeGradeRows(preview, normalizedGradeResult)),
    [preview, normalizedGradeResult]
  );

  const loadPreview = async (): Promise<void> => {
    setIsLoading(true);
    setIsConfirmingDispatch(false);
    setIsDispatchConfirmed(false);

    try {
      setLoadResult(
        await window.graiderUI.getAssignmentGradePreview({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
    } catch {
      setLoadResult((currentResult) => ({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        status: "failure",
        preview: currentResult?.preview ?? null,
        error: {
          code: "assignment_grade_preview_failed",
          message: "Unable to load grade preview.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: currentResult?.refreshedAt ?? null
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDispatch = async (): Promise<void> => {
    if (
      preview === null ||
      !canDispatchGradePreview(preview) ||
      !isDispatchConfirmed ||
      isDispatching
    ) {
      return;
    }

    setIsDispatching(true);

    try {
      setGradeResult(
        await window.graiderUI.gradeAssignment({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
      setIsConfirmingDispatch(false);
      setIsDispatchConfirmed(false);
    } catch {
      setGradeResult({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        status: "failure",
        grade: null,
        error: {
          code: "assignment_grade_failed",
          message: "Unable to dispatch grading.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        dispatchedAt: null
      });
    } finally {
      setIsDispatching(false);
    }
  };

  useEffect(() => {
    void loadPreview();
  }, [selection.assignmentFile, selection.courseFolderId, selection.courseFolderPath]);

  const title = getAssignmentTitle(
    preview,
    assignmentDetail?.assignment.title ?? selection.assignmentTitle,
    assignmentDetail?.assignment.slug ?? selection.assignmentSlug
  );
  const commandErrorMessage = getCommandErrorMessage(loadResult);
  const gradeErrorMessage = getGradeCommandErrorMessage(gradeResult);
  const showTokenGuidance = preview !== null && hasGradePreviewTokenRequirement(preview);
  const activeDiagnostics =
    normalizedGradeResult === null
      ? (preview?.diagnostics ?? [])
      : normalizedGradeResult.diagnostics;
  const refreshedAtLabel = preview === null ? null : formatReadableDateTime(preview.refreshedAt);

  return (
    <main className="dashboard-shell" aria-labelledby="grade-preview-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="grade-preview-title">Grade Dispatch Preview</h1>
            <p className="assignment-detail__subtitle">{title}</p>
            <p className="assignment-detail__subtitle">{getCourseTermSubtitle(preview)}</p>
          </div>
          <div className="assignment-detail__header-actions">
            <button
              className="primary-action"
              type="button"
              disabled={isLoading || isDispatching}
              onClick={() => {
                void loadPreview();
              }}
              aria-label="Refresh grade preview"
            >
              {isLoading ? "Refreshing preview..." : "Refresh preview"}
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-content assignment-detail" aria-label="Grade dispatch preview">
        <p className="preview-only-notice">
          {normalizedGradeResult === null
            ? "Preview only — no GitHub Actions workflows will be started."
            : "Grading workflows have been dispatched. The plan below reflects what happened."}
        </p>
        <p className="assignment-detail__path">
          Assignment file: {preview?.files.assignmentFile ?? selection.assignmentFile}
        </p>
        {refreshedAtLabel === null ? null : (
          <p className="assignment-detail__path">Last refreshed: {refreshedAtLabel}</p>
        )}

        {isLoading ? <p className="loading-state">Loading grade preview...</p> : null}

        {commandErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {commandErrorMessage}
          </p>
        )}

        {gradeErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {gradeErrorMessage}
          </p>
        )}

        {isDispatching ? <p className="loading-state">Dispatching grading workflows...</p> : null}

        {showTokenGuidance ? (
          <section className="detail-guidance" aria-label="GitHub token guidance">
            <h2>GitHub token required to determine dispatchability.</h2>
            <p>Sign in with GitHub CLI using gh auth login, then refresh.</p>
          </section>
        ) : null}

        {preview === null ? (
          <section className="dashboard-placeholder" aria-label="Grade preview loading">
            <h2>Loading grade preview.</h2>
            <p>Graider is calculating target students and workflow dispatch readiness.</p>
          </section>
        ) : (
          <>
            <PreviewStatusPanel preview={preview} />
            <div className="assignment-detail-grid apply-preview-grid">
              <ContextPanel preview={preview} />
              <TargetPanel preview={preview} />
              <GradingPanel preview={preview} />
              <WorkflowPanel preview={preview} />
              <PlanSummaryPanel result={normalizedGradeResult} rows={mergedRows} />
              <RepositoryRowsPanel rows={mergedRows} />
              {activeDiagnostics.length === 0 ? null : (
                <DiagnosticsPanel diagnostics={activeDiagnostics} />
              )}
              {normalizedGradeResult === null ? (
                <ConfirmationPanel
                  preview={preview}
                  isConfirming={isConfirmingDispatch}
                  isConfirmed={isDispatchConfirmed}
                  isDispatching={isDispatching}
                  onOpenConfirmation={() => {
                    setIsConfirmingDispatch(true);
                    setIsDispatchConfirmed(false);
                  }}
                  onConfirmationChange={setIsDispatchConfirmed}
                  onCancel={() => {
                    setIsConfirmingDispatch(false);
                    setIsDispatchConfirmed(false);
                  }}
                  onDispatch={() => {
                    void handleDispatch();
                  }}
                />
              ) : (
                <PostDispatchActionsPanel
                  {...(onViewGradeStatus === undefined ? {} : { onViewGradeStatus })}
                  {...(onRefreshAssignmentDetail === undefined
                    ? {}
                    : { onRefreshAssignmentDetail })}
                />
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
};
