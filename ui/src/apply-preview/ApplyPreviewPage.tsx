import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { copyTextToClipboard } from "../assignment-detail/assignmentDetailClipboard";
import {
  formatNullableValue,
  formatStatusLabel,
  getDiagnosticCategory,
  groupDiagnostics,
  hasAttentionStatus
} from "../assignment-detail/assignmentDetailReadiness";
import type { AssignmentDetailDiagnostic } from "../assignment-detail/assignmentDetailTypes";
import { normalizeApplyResult } from "./applyResultNormalization";
import { normalizeApplyPreview } from "./applyPreviewNormalization";
import {
  canApplyPreview,
  deriveApplyPreviewReadiness,
  formatApplyPreviewRepositoryStatus,
  formatApplyResultRepositoryStatus,
  getApplyBlockerReasons
} from "./applyPreviewReadiness";
import type {
  ApplyExecutionLoadResult,
  ApplyPreviewLoadResult,
  ApplyPreviewPageProps,
  ApplyPreviewRepositoryRow,
  ApplyResultRepositoryRow,
  NormalizedApplyPreview,
  NormalizedApplyResult
} from "./applyPreviewTypes";

const COPY_FEEDBACK_TIMEOUT_MS = 2200;

type CopyKey = "template-repository";

interface CopyState {
  readonly key: CopyKey;
  readonly status: "copied" | "failed";
}

const getCopyStateText = (copyState: CopyState | null, copyKey: CopyKey): string | null => {
  if (copyState?.key !== copyKey) {
    return null;
  }

  return copyState.status === "copied" ? "Copied" : "Unable to copy.";
};

const displayBoolean = (value: boolean): string => (value ? "Enabled" : "Disabled");

const getCommandErrorMessage = (result: ApplyPreviewLoadResult | null): string | null => {
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

  if (errorCode === "invalid_assignment_apply_preview_json") {
    return "Graider returned invalid apply preview JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to load apply preview.";
};

const getApplyCommandErrorMessage = (result: ApplyExecutionLoadResult | null): string | null => {
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

  if (errorCode === "invalid_assignment_apply_json") {
    return "Graider returned invalid apply JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to apply assignment.";
};

const getAssignmentTitle = (
  preview: NormalizedApplyPreview | null,
  fallbackTitle: string | null,
  fallbackSlug: string | null
): string => preview?.assignment.title ?? fallbackTitle ?? fallbackSlug ?? "Apply Preview";

const getCourseTermSubtitle = (preview: NormalizedApplyPreview | null): string => {
  const course = preview?.course.title ?? preview?.course.slug;
  const term = preview?.term.title ?? preview?.term.slug;

  if (course !== undefined && course !== null && term !== undefined && term !== null) {
    return `${course} · ${term}`;
  }

  return course ?? term ?? "Course assignment";
};

const getStudentLabel = (row: ApplyPreviewRepositoryRow): string =>
  row.githubUsername ?? row.studentId ?? "Unknown student";

interface DetailItemProps {
  readonly label: string;
  readonly value: string | number | null | undefined;
  readonly valueClassName?: string;
  readonly action?: ReactElement | null;
}

const DetailItem = ({
  label,
  value,
  valueClassName,
  action = null
}: DetailItemProps): ReactElement => (
  <div className="detail-item">
    <dt>{label}</dt>
    <dd className={valueClassName}>
      <span>{formatNullableValue(value)}</span>
      {action}
    </dd>
  </div>
);

const StatusItem = ({
  label,
  value
}: {
  readonly label: string;
  readonly value: string | null;
}): ReactElement => {
  const hasAttention = hasAttentionStatus(value);

  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>
        <span className={hasAttention ? "status-chip status-chip--attention" : "status-chip"}>
          {formatStatusLabel(value)}
        </span>
      </dd>
    </div>
  );
};

const CopyButton = ({
  label,
  value,
  copyKey,
  copyState,
  onCopy
}: {
  readonly label: string;
  readonly value: string | null;
  readonly copyKey: CopyKey;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}): ReactElement | null => {
  if (value === null) {
    return null;
  }

  return (
    <span className="copy-affordance">
      <button
        className="copy-button"
        type="button"
        aria-label={label}
        onClick={() => {
          onCopy(copyKey, value);
        }}
      >
        Copy
      </button>
      <span className="copy-feedback" aria-live="polite">
        {getCopyStateText(copyState, copyKey)}
      </span>
    </span>
  );
};

const ReadinessPanel = ({
  preview
}: {
  readonly preview: NormalizedApplyPreview;
}): ReactElement => {
  const readiness = deriveApplyPreviewReadiness(preview);

  return (
    <section
      className={`readiness-summary readiness-summary--${readiness.status}`}
      aria-labelledby="apply-preview-readiness-title"
    >
      <div className="readiness-summary__header">
        <div>
          <h2 id="apply-preview-readiness-title">Preview status</h2>
          <p className="readiness-summary__status">{readiness.label}</p>
        </div>
        <span className="status-chip">{formatStatusLabel(preview.status)}</span>
      </div>
      <p>{readiness.description}</p>
      {readiness.items.length === 0 ? null : (
        <ul className="needs-attention-list" aria-label="Apply preview items needing attention">
          {readiness.items.map((item) => (
            <li key={item}>
              <strong>{item}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const TargetPanel = ({ preview }: { readonly preview: NormalizedApplyPreview }): ReactElement => (
  <section className="detail-panel" aria-labelledby="apply-preview-target-title">
    <h2 id="apply-preview-target-title">Target</h2>
    <dl className="detail-grid">
      <DetailItem label="Sections" value={preview.target.sections.join(", ") || null} />
      <DetailItem label="Section count" value={preview.target.sectionCount} />
      <DetailItem label="Student count" value={preview.target.studentCount} />
    </dl>
    {preview.target.studentCount === 0 ? (
      <p className="detail-panel__note">No target students found.</p>
    ) : null}
  </section>
);

const TemplatePanel = ({
  preview,
  copyState,
  onCopy
}: {
  readonly preview: NormalizedApplyPreview;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="apply-preview-template-title">
    <h2 id="apply-preview-template-title">Template</h2>
    <dl className="detail-grid">
      <DetailItem
        label="Repository"
        value={preview.template.repository}
        valueClassName="copyable-value"
        action={
          <CopyButton
            label="Copy template repository"
            value={preview.template.repository}
            copyKey="template-repository"
            copyState={copyState}
            onCopy={onCopy}
          />
        }
      />
      <DetailItem label="Branch" value={preview.template.branch} />
      <StatusItem label="Overall status" value={preview.template.status} />
      <StatusItem label="Repository status" value={preview.template.repositoryStatus} />
      <StatusItem label="Branch status" value={preview.template.branchStatus} />
    </dl>
  </section>
);

const GradingPanel = ({ preview }: { readonly preview: NormalizedApplyPreview }): ReactElement => (
  <section className="detail-panel" aria-labelledby="apply-preview-grading-title">
    <h2 id="apply-preview-grading-title">Grading</h2>
    {!preview.grading.enabled ? (
      <p className="detail-panel__note">No grading workflow required.</p>
    ) : (
      <dl className="detail-grid">
        <DetailItem label="Enabled" value={displayBoolean(preview.grading.enabled)} />
        <DetailItem label="Mode" value={preview.grading.mode} />
        <DetailItem label="Workflow path" value={preview.grading.workflow} />
        <DetailItem label="Artifact name" value={preview.grading.artifact} />
        <DetailItem label="Result file" value={preview.grading.resultFile} />
        <StatusItem label="Workflow status" value={preview.grading.workflowStatus} />
        <StatusItem label="workflow_dispatch status" value={preview.grading.workflowDispatch} />
      </dl>
    )}
  </section>
);

const RepositorySummaryPanel = ({
  preview
}: {
  readonly preview: NormalizedApplyPreview;
}): ReactElement => (
  <section className="detail-panel apply-preview-summary" aria-labelledby="repository-plan-title">
    <h2 id="repository-plan-title">Repository plan summary</h2>
    <dl className="apply-preview-counts">
      <div>
        <dt>Would create</dt>
        <dd>{preview.plan.summary.wouldCreateRepositories}</dd>
      </div>
      <div>
        <dt>Would update</dt>
        <dd>{preview.plan.summary.wouldUpdateRepositories}</dd>
      </div>
      <div>
        <dt>Would skip</dt>
        <dd>{preview.plan.summary.wouldSkipRepositories}</dd>
      </div>
      <div>
        <dt>Blocked</dt>
        <dd>{preview.plan.summary.blockedRepositories}</dd>
      </div>
      <div>
        <dt>Unknown</dt>
        <dd>{preview.plan.summary.unknownRepositories}</dd>
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
  readonly preview: NormalizedApplyPreview;
}): ReactElement => (
  <section
    className="detail-panel apply-preview-repositories"
    aria-labelledby="repository-rows-title"
  >
    <h2 id="repository-rows-title">Repository rows</h2>
    {preview.plan.repositories.length === 0 ? (
      <p className="detail-panel__note">No repository preview rows.</p>
    ) : (
      <div className="apply-preview-table" role="table" aria-label="Repository preview rows">
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Preview status</span>
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
                  row.status === "blocked" || row.status === "unknown"
                    ? "status-chip status-chip--attention"
                    : "status-chip"
                }
              >
                {formatApplyPreviewRepositoryStatus(row.status)}
              </span>
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

const ApplyResultSummaryPanel = ({
  result
}: {
  readonly result: NormalizedApplyResult;
}): ReactElement => (
  <section className="detail-panel apply-preview-summary" aria-labelledby="apply-result-title">
    <h2 id="apply-result-title">Apply Result Summary</h2>
    <div className="apply-result-meta">
      <span className="status-chip">{formatStatusLabel(result.status)}</span>
      <span>Exit code {result.exitCode}</span>
      {result.appliedAt === null ? null : <span>Applied at {result.appliedAt}</span>}
    </div>
    <dl className="apply-preview-counts">
      <div>
        <dt>Created</dt>
        <dd>{result.summary.createdRepositories}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>{result.summary.updatedRepositories}</dd>
      </div>
      <div>
        <dt>Skipped</dt>
        <dd>{result.summary.skippedRepositories}</dd>
      </div>
      <div>
        <dt>Failed</dt>
        <dd>{result.summary.failedRepositories}</dd>
      </div>
      <div>
        <dt>Blocked</dt>
        <dd>{result.summary.blockedRepositories}</dd>
      </div>
    </dl>
    <dl className="detail-grid apply-result-files">
      <DetailItem label="Assignment file" value={result.assignmentFile} />
      <DetailItem label="Manifest file" value={result.manifestFile} />
      <DetailItem label="Generated files" value={result.generatedFiles.join(", ") || null} />
    </dl>
  </section>
);

const ApplyResultRowsPanel = ({
  result
}: {
  readonly result: NormalizedApplyResult;
}): ReactElement => (
  <section className="detail-panel apply-preview-repositories" aria-labelledby="apply-result-rows">
    <h2 id="apply-result-rows">Repository result rows</h2>
    {result.rows.length === 0 ? (
      <p className="detail-panel__note">No per-student apply result rows were returned.</p>
    ) : (
      <div className="apply-preview-table" role="table" aria-label="Repository apply result rows">
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Result status</span>
          <span role="columnheader">Reason</span>
        </div>
        {result.rows.map((row) => (
          <div
            className="apply-preview-table__row"
            role="row"
            key={`${row.studentId ?? row.githubUsername ?? row.repository ?? "row"}-${row.section ?? "section"}`}
          >
            <span role="cell">{getApplyResultStudentLabel(row)}</span>
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
                {formatApplyResultRepositoryStatus(row.status)}
              </span>
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
  <section className="detail-panel" aria-labelledby="apply-preview-diagnostics-title">
    <h2 id="apply-preview-diagnostics-title">Diagnostics / blockers</h2>
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

const getApplyResultStudentLabel = (row: ApplyResultRepositoryRow): string =>
  row.githubUsername ?? row.studentId ?? "Unknown student";

const ConfirmationPanel = ({
  preview,
  isConfirming,
  isConfirmed,
  isApplying,
  onOpenConfirmation,
  onConfirmationChange,
  onCancel,
  onApply
}: {
  readonly preview: NormalizedApplyPreview;
  readonly isConfirming: boolean;
  readonly isConfirmed: boolean;
  readonly isApplying: boolean;
  readonly onOpenConfirmation: () => void;
  readonly onConfirmationChange: (checked: boolean) => void;
  readonly onCancel: () => void;
  readonly onApply: () => void;
}): ReactElement => {
  const blockerReasons = getApplyBlockerReasons(preview);
  const canApply = blockerReasons.length === 0;

  return (
    <section
      className="detail-panel apply-preview-final-action"
      aria-labelledby="apply-confirmation-title"
    >
      <h2 id="apply-confirmation-title">Apply assignment</h2>
      {canApply ? (
        <p>Preview is ready. Review and confirm before applying changes to student repositories.</p>
      ) : (
        <>
          <p>Apply is disabled until the latest preview has no blockers.</p>
          <ul className="needs-attention-list" aria-label="Apply blockers">
            {blockerReasons.map((reason) => (
              <li key={reason}>
                <strong>{reason}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {!canApply ? (
        <button className="primary-action" type="button" disabled>
          Apply changes
        </button>
      ) : null}
      {canApply && !isConfirming ? (
        <button
          className="primary-action"
          type="button"
          disabled={isApplying}
          onClick={onOpenConfirmation}
        >
          Review apply changes
        </button>
      ) : null}
      {canApply && isConfirming ? (
        <div className="apply-confirmation-panel" role="dialog" aria-modal="false">
          <h3>Confirm apply changes</h3>
          <ul>
            <li>This will create or update student repositories.</li>
            <li>
              This may write manifests/local apply state if the backend apply command does so.
            </li>
            <li>
              This may push files/commits to GitHub according to the existing apply implementation.
            </li>
          </ul>
          <label className="confirmation-check">
            <input
              type="checkbox"
              checked={isConfirmed}
              disabled={isApplying}
              onChange={(event) => {
                onConfirmationChange(event.currentTarget.checked);
              }}
            />
            <span>I understand this will apply changes to student repositories</span>
          </label>
          <div className="apply-confirmation-actions">
            <button
              className="secondary-action"
              type="button"
              disabled={isApplying}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={!isConfirmed || isApplying}
              onClick={onApply}
            >
              {isApplying ? "Applying..." : "Apply changes"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

const ApplyResultPanel = ({
  result,
  onBack,
  onRefreshAssignmentDetail,
  onBackToDashboard
}: {
  readonly result: NormalizedApplyResult;
  readonly onBack: () => void;
  readonly onRefreshAssignmentDetail?: () => void;
  readonly onBackToDashboard?: () => void;
}): ReactElement => (
  <>
    <ApplyResultSummaryPanel result={result} />
    <ApplyResultRowsPanel result={result} />
    <DiagnosticsPanel diagnostics={result.diagnostics} />
    <section className="detail-panel apply-preview-final-action" aria-labelledby="post-apply-title">
      <h2 id="post-apply-title">Post-apply actions</h2>
      <div className="apply-confirmation-actions">
        <button className="secondary-action" type="button" onClick={onBack}>
          Back to assignment detail
        </button>
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

export const ApplyPreviewPage = ({
  selection,
  assignmentDetail,
  onBack,
  onRefreshAssignmentDetail,
  onBackToDashboard
}: ApplyPreviewPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<ApplyPreviewLoadResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyExecutionLoadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirmingApply, setIsConfirmingApply] = useState(false);
  const [isApplyConfirmed, setIsApplyConfirmed] = useState(false);
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  const preview = useMemo(
    () =>
      loadResult?.preview === null || loadResult?.preview === undefined
        ? null
        : normalizeApplyPreview(loadResult.preview, selection, loadResult.refreshedAt),
    [loadResult, selection]
  );

  const normalizedApplyResult = useMemo(
    () =>
      applyResult?.apply === null || applyResult?.apply === undefined
        ? null
        : normalizeApplyResult(applyResult.apply, applyResult.appliedAt),
    [applyResult]
  );

  const loadPreview = async (): Promise<void> => {
    setIsLoading(true);
    setIsConfirmingApply(false);
    setIsApplyConfirmed(false);

    try {
      setLoadResult(
        await window.graiderUI.getAssignmentApplyPreview({
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
          code: "assignment_apply_preview_failed",
          message: "Unable to load apply preview.",
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

  const handleApply = async (): Promise<void> => {
    if (preview === null || !canApplyPreview(preview) || !isApplyConfirmed || isApplying) {
      return;
    }

    setIsApplying(true);

    try {
      setApplyResult(
        await window.graiderUI.applyAssignment({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
      setIsConfirmingApply(false);
      setIsApplyConfirmed(false);
    } catch {
      setApplyResult({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        status: "failure",
        apply: null,
        error: {
          code: "assignment_apply_failed",
          message: "Unable to apply assignment.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        appliedAt: null
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleCopy = (copyKey: CopyKey, value: string): void => {
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }

    void copyTextToClipboard(value).then((result) => {
      setCopyState({
        key: copyKey,
        status: result === "success" ? "copied" : "failed"
      });
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setCopyState(null);
        copyFeedbackTimeoutRef.current = null;
      }, COPY_FEEDBACK_TIMEOUT_MS);
    });
  };

  useEffect(() => {
    void loadPreview();
  }, [selection.assignmentFile, selection.courseFolderId, selection.courseFolderPath]);

  useEffect(
    () => () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    },
    []
  );

  const title = getAssignmentTitle(
    preview,
    assignmentDetail?.assignment.title ?? selection.assignmentTitle,
    assignmentDetail?.assignment.slug ?? selection.assignmentSlug
  );
  const commandErrorMessage = getCommandErrorMessage(loadResult);
  const applyErrorMessage = getApplyCommandErrorMessage(applyResult);
  const showTokenGuidance =
    preview !== null &&
    (preview.diagnostics.some((diagnostic) => diagnostic.code === "github_token_required") ||
      preview.plan.repositories.some(
        (row) => row.status === "token_required" || row.reason === "token_required"
      ));

  return (
    <main className="dashboard-shell" aria-labelledby="apply-preview-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="apply-preview-title">Apply Preview</h1>
            <p className="assignment-detail__subtitle">{title}</p>
            <p className="assignment-detail__subtitle">{getCourseTermSubtitle(preview)}</p>
          </div>
          <div className="assignment-detail__header-actions">
            <button className="secondary-action" type="button" onClick={onBack}>
              Back to assignment
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={isLoading || isApplying}
              onClick={() => {
                void loadPreview();
              }}
              aria-label="Refresh apply preview"
            >
              {isLoading ? "Refreshing preview..." : "Refresh preview"}
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-content assignment-detail" aria-label="Apply preview">
        <p className="preview-only-notice">
          {normalizedApplyResult === null
            ? "Preview only — no repositories or files will be changed."
            : "Apply result — preview context remains visible below."}
        </p>
        <p className="assignment-detail__path">
          Assignment file: {preview?.files.assignmentFile ?? selection.assignmentFile}
        </p>
        {preview?.refreshedAt === null || preview?.refreshedAt === undefined ? null : (
          <p className="assignment-detail__path">Last refreshed: {preview.refreshedAt}</p>
        )}

        {isLoading ? <p className="loading-state">Loading apply preview...</p> : null}

        {commandErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {commandErrorMessage}
          </p>
        )}

        {applyErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {applyErrorMessage}
          </p>
        )}

        {isApplying ? <p className="loading-state">Applying assignment changes...</p> : null}

        {showTokenGuidance ? (
          <section className="detail-guidance" aria-label="GitHub token guidance">
            <h2>GitHub token required to determine repository status.</h2>
            <p>Sign in with GitHub CLI using gh auth login, then refresh.</p>
          </section>
        ) : null}

        {preview === null ? (
          <section className="dashboard-placeholder" aria-label="Apply preview loading">
            <h2>Loading apply preview.</h2>
            <p>Graider is calculating target students and repository preview rows.</p>
          </section>
        ) : (
          <>
            <ReadinessPanel preview={preview} />
            <div className="assignment-detail-grid apply-preview-grid">
              <TargetPanel preview={preview} />
              <TemplatePanel preview={preview} copyState={copyState} onCopy={handleCopy} />
              <GradingPanel preview={preview} />
              <RepositorySummaryPanel preview={preview} />
              <RepositoryRowsPanel preview={preview} />
              <DiagnosticsPanel diagnostics={preview.diagnostics} />
              {normalizedApplyResult === null ? (
                <ConfirmationPanel
                  preview={preview}
                  isConfirming={isConfirmingApply}
                  isConfirmed={isApplyConfirmed}
                  isApplying={isApplying}
                  onOpenConfirmation={() => {
                    setIsConfirmingApply(true);
                    setIsApplyConfirmed(false);
                  }}
                  onConfirmationChange={setIsApplyConfirmed}
                  onCancel={() => {
                    setIsConfirmingApply(false);
                    setIsApplyConfirmed(false);
                  }}
                  onApply={() => {
                    void handleApply();
                  }}
                />
              ) : (
                <ApplyResultPanel
                  result={normalizedApplyResult}
                  onBack={onBack}
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
