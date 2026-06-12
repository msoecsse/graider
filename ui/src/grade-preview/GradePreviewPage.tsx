import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  formatNullableValue,
  formatStatusLabel,
  getDiagnosticCategory,
  groupDiagnostics,
  hasAttentionStatus
} from "../assignment-detail/assignmentDetailReadiness";
import type { AssignmentDetailDiagnostic } from "../assignment-detail/assignmentDetailTypes";
import { normalizeGradeDispatchResult } from "./gradeResultNormalization";
import { normalizeGradePreview } from "./gradePreviewNormalization";
import {
  canDispatchGradePreview,
  formatGradePreviewRepositoryStatus,
  getGradeDispatchBlockerReasons,
  getGradePreviewReadinessLabel,
  getGradePreviewStatusItems,
  hasGradePreviewTokenRequirement
} from "./gradePreviewReadiness";
import type {
  GradeDispatchResultRepositoryRow,
  GradeExecutionLoadResult,
  GradePreviewLoadResult,
  GradePreviewPageProps,
  GradePreviewRepositoryRow,
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

const getStudentLabel = (row: GradePreviewRepositoryRow): string =>
  row.githubUsername ?? row.studentId ?? "Unknown student";

const getDispatchResultStudentLabel = (row: GradeDispatchResultRepositoryRow): string =>
  row.githubUsername ?? row.studentId ?? "Unknown student";

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
      <DetailItem label="Assignment status" value={preview.assignment.status} />
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

const RepositorySummaryPanel = ({
  preview
}: {
  readonly preview: NormalizedGradePreview;
}): ReactElement => (
  <section className="detail-panel apply-preview-summary" aria-labelledby="grade-plan-summary">
    <h2 id="grade-plan-summary">Repository dispatch preview</h2>
    <dl className="apply-preview-counts">
      <div>
        <dt>Would dispatch</dt>
        <dd>{preview.plan.summary.wouldDispatch}</dd>
      </div>
      <div>
        <dt>Would skip</dt>
        <dd>{preview.plan.summary.wouldSkip}</dd>
      </div>
      <div>
        <dt>Blocked</dt>
        <dd>{preview.plan.summary.blocked}</dd>
      </div>
      <div>
        <dt>Unknown</dt>
        <dd>{preview.plan.summary.unknown}</dd>
      </div>
    </dl>
  </section>
);

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

const RepositoryRowsPanel = ({
  preview
}: {
  readonly preview: NormalizedGradePreview;
}): ReactElement => (
  <section
    className="detail-panel apply-preview-repositories"
    aria-labelledby="grade-preview-rows-title"
  >
    <h2 id="grade-preview-rows-title">Repository rows</h2>
    {preview.plan.repositories.length === 0 ? (
      <p className="detail-panel__note">No repository preview rows.</p>
    ) : (
      <div className="apply-preview-table" role="table" aria-label="Grade dispatch preview rows">
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Preview status</span>
          <span role="columnheader">Workflow / ref</span>
          <span role="columnheader">Reason</span>
        </div>
        {preview.plan.repositories.map((row) => (
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
                  row.status === "blocked" ||
                  row.status === "unknown" ||
                  row.status === "token_required"
                    ? "status-chip status-chip--attention"
                    : "status-chip"
                }
              >
                {formatGradePreviewRepositoryStatus(row.status)}
              </span>
            </span>
            <span role="cell">
              {formatNullableValue(row.workflow)}
              {row.ref === null ? null : <span className="muted-inline"> @ {row.ref}</span>}
            </span>
            <span role="cell">
              {formatNullableValue(row.reason)}
              <RowDiagnostics diagnostics={row.diagnostics} />
            </span>
          </div>
        ))}
      </div>
    )}
  </section>
);

const formatGradeDispatchResultStatus = (
  status: GradeDispatchResultRepositoryRow["status"]
): string => {
  if (status === "dispatched") {
    return "Dispatched";
  }

  if (status === "skipped") {
    return "Skipped";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Failed";
};

const DispatchResultSummaryPanel = ({
  preview,
  result
}: {
  readonly preview: NormalizedGradePreview;
  readonly result: NormalizedGradeDispatchResult;
}): ReactElement => (
  <section className="detail-panel apply-preview-summary" aria-labelledby="grade-result-title">
    <h2 id="grade-result-title">Grade Dispatch Result Summary</h2>
    <div className="apply-result-meta">
      <span className="status-chip">{formatStatusLabel(result.status)}</span>
      <span>Exit code {result.exitCode}</span>
      {result.dispatchedAt === null ? null : <span>Dispatched at {result.dispatchedAt}</span>}
    </div>
    <dl className="apply-preview-counts">
      <div>
        <dt>Workflow dispatched</dt>
        <dd>{result.summary.dispatchAttempted > 0 ? "Yes" : "No"}</dd>
      </div>
      <div>
        <dt>Targeted</dt>
        <dd>{result.summary.targetsSelected}</dd>
      </div>
      <div>
        <dt>Dispatched</dt>
        <dd>{result.summary.dispatchSucceeded}</dd>
      </div>
      <div>
        <dt>Skipped</dt>
        <dd>{result.summary.skipped}</dd>
      </div>
      <div>
        <dt>Failed / blocked</dt>
        <dd>{result.summary.failedOrBlocked}</dd>
      </div>
    </dl>
    <dl className="detail-grid apply-result-files">
      <DetailItem label="Assignment" value={preview.assignment.title ?? preview.assignment.slug} />
      <DetailItem label="Course" value={preview.course.title ?? preview.course.slug} />
      <DetailItem label="Term" value={preview.term.title ?? preview.term.slug} />
      <DetailItem label="Assignment file" value={result.assignmentFile} />
      <DetailItem
        label="Workflow file"
        value={preview.files.workflowFile ?? preview.grading.workflow}
      />
      <DetailItem label="Dispatch ref" value={preview.grading.workflowRef} />
    </dl>
  </section>
);

const DispatchResultRowsPanel = ({
  result
}: {
  readonly result: NormalizedGradeDispatchResult;
}): ReactElement => (
  <section className="detail-panel apply-preview-repositories" aria-labelledby="grade-result-rows">
    <h2 id="grade-result-rows">Repository dispatch result rows</h2>
    {result.rows.length === 0 ? (
      <p className="detail-panel__note">No per-student grade dispatch result rows were returned.</p>
    ) : (
      <div
        className="apply-preview-table"
        role="table"
        aria-label="Repository grade dispatch result rows"
      >
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Result status</span>
          <span role="columnheader">Workflow / ref</span>
          <span role="columnheader">Reason</span>
        </div>
        {result.rows.map((row) => (
          <div
            className="apply-preview-table__row"
            role="row"
            key={`${row.studentId ?? row.githubUsername ?? row.repository ?? "row"}-${row.section ?? "section"}`}
          >
            <span role="cell">{getDispatchResultStudentLabel(row)}</span>
            <span role="cell">{formatNullableValue(row.section)}</span>
            <span role="cell" className="apply-preview-table__repository">
              {formatNullableValue(row.repository)}
            </span>
            <span role="cell">
              <span
                className={
                  row.status === "failed" || row.status === "blocked"
                    ? "status-chip status-chip--attention"
                    : "status-chip"
                }
              >
                {formatGradeDispatchResultStatus(row.status)}
              </span>
            </span>
            <span role="cell">
              {formatNullableValue(row.workflow)}
              {row.ref === null ? null : <span className="muted-inline"> @ {row.ref}</span>}
            </span>
            <span role="cell">
              {formatNullableValue(row.reason)}
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

const DiagnosticsPanel = ({
  diagnostics
}: {
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="grade-preview-diagnostics-title">
    <h2 id="grade-preview-diagnostics-title">Diagnostics / blockers</h2>
    {diagnostics.length === 0 ? (
      <p className="detail-panel__note">No blockers or warnings.</p>
    ) : (
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
    )}
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

const GradeDispatchResultPanel = ({
  preview,
  result,
  onBack,
  onViewGradeStatus,
  onRefreshAssignmentDetail,
  onBackToDashboard
}: {
  readonly preview: NormalizedGradePreview;
  readonly result: NormalizedGradeDispatchResult;
  readonly onBack: () => void;
  readonly onViewGradeStatus?: () => void;
  readonly onRefreshAssignmentDetail?: () => void;
  readonly onBackToDashboard?: () => void;
}): ReactElement => (
  <>
    <DispatchResultSummaryPanel preview={preview} result={result} />
    <DispatchResultRowsPanel result={result} />
    <DiagnosticsPanel diagnostics={result.diagnostics} />
    <section
      className="detail-panel apply-preview-final-action"
      aria-labelledby="post-grade-dispatch-title"
    >
      <h2 id="post-grade-dispatch-title">Post-dispatch actions</h2>
      <div className="apply-confirmation-actions">
        <button className="secondary-action" type="button" onClick={onBack}>
          Back to assignment detail
        </button>
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
        {onBackToDashboard === undefined ? null : (
          <button className="secondary-action" type="button" onClick={onBackToDashboard}>
            Back to dashboard
          </button>
        )}
      </div>
    </section>
  </>
);

export const GradePreviewPage = ({
  selection,
  assignmentDetail,
  onBack,
  onViewGradeStatus,
  onRefreshAssignmentDetail,
  onBackToDashboard
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
            <button className="secondary-action" type="button" onClick={onBack}>
              Back to assignment detail
            </button>
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
            : "Grade dispatch result — preview context remains visible below."}
        </p>
        <p className="assignment-detail__path">
          Assignment file: {preview?.files.assignmentFile ?? selection.assignmentFile}
        </p>
        {preview?.refreshedAt === null || preview?.refreshedAt === undefined ? null : (
          <p className="assignment-detail__path">Last refreshed: {preview.refreshedAt}</p>
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
              <RepositorySummaryPanel preview={preview} />
              <RepositoryRowsPanel preview={preview} />
              <DiagnosticsPanel diagnostics={preview.diagnostics} />
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
                <GradeDispatchResultPanel
                  preview={preview}
                  result={normalizedGradeResult}
                  onBack={onBack}
                  {...(onViewGradeStatus === undefined ? {} : { onViewGradeStatus })}
                  {...(onRefreshAssignmentDetail === undefined
                    ? {}
                    : { onRefreshAssignmentDetail })}
                  {...(onBackToDashboard === undefined ? {} : { onBackToDashboard })}
                />
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
};
