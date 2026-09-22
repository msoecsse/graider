import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { copyTextToClipboard } from "../assignment-detail/assignmentDetailClipboard";
import { OperationStatusBar } from "../components/OperationStatusBar";
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
import type { AssignmentApplyProgressEvent } from "../../electron/ipc";
import { normalizeApplyResult } from "./applyResultNormalization";
import { normalizeApplyPreview } from "./applyPreviewNormalization";
import {
  canApplyPreview,
  deriveApplyPreviewReadiness,
  getApplyBlockerReasons
} from "./applyPreviewReadiness";
import {
  formatMergedGroupRowStatus,
  formatMergedRowStatus,
  getApplyPlanSummaryText,
  mergedGroupRowNeedsAttention,
  mergedRowNeedsAttention,
  mergeApplyGroupRows,
  mergeApplyRows
} from "./applyPreviewMerge";
import type {
  ApplyExecutionLoadResult,
  ApplyGroupRowState,
  ApplyPreviewLoadResult,
  ApplyPreviewPageProps,
  ApplyRowState,
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

  if (errorCode === "github_cli_not_found") {
    return "GitHub CLI was not found. Install GitHub CLI or set GRAIDER_GITHUB_TOKEN before launching Graider.";
  }

  if (errorCode === "github_cli_auth_failed" || errorCode === "github_token_unavailable") {
    return "GitHub authentication is required. Run gh auth login in Terminal, then refresh.";
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

  if (errorCode === "github_cli_not_found") {
    return "GitHub CLI was not found. Install GitHub CLI or set GRAIDER_GITHUB_TOKEN before launching Graider.";
  }

  if (errorCode === "github_cli_auth_failed" || errorCode === "github_token_unavailable") {
    return "GitHub authentication is required. Run gh auth login in Terminal, then refresh.";
  }

  if (errorCode === "bundled_graider_cli_not_found") {
    return "Bundled Graider CLI could not be started. Rebuild or reinstall the Graider app.";
  }

  if (errorCode === "invalid_assignment_apply_json") {
    return "Graider returned invalid apply JSON.";
  }

  if (errorCode === "student_repository_access_page_generation_failed") {
    return result?.error?.message ?? "Student repository access page generation failed.";
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

const getStudentLabel = (row: ApplyRowState): string => row.studentId ?? "Unknown student";

const getApplyOperationDetail = (progress: AssignmentApplyProgressEvent | null): string =>
  progress === null
    ? "Creating and updating student repositories..."
    : `Repository ${progress.progress.current} of ${progress.progress.total} · ${
        progress.progress.mode === "individual"
          ? progress.progress.studentId
          : progress.progress.groupId
      } · ${progress.progress.repository}`;

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
        <StatusItem label="Workflow dispatch status" value={preview.grading.workflowDispatch} />
      </dl>
    )}
  </section>
);

const getAppliedAtLabel = (appliedAt: string | null): string | null =>
  appliedAt === null ? null : formatReadableDateTime(appliedAt);

/**
 * README section 5.4: "one summary sentence, not ten counter boxes" (five
 * preview, five result). The sentence is computed from the same merged rows
 * the table below renders, so its counts agree with the rows shown by
 * construction -- see applyPreviewMerge.ts.
 */
const PlanSummaryPanel = ({
  preview,
  result,
  rows,
  groupRows
}: {
  readonly preview: NormalizedApplyPreview;
  readonly result: NormalizedApplyResult | null;
  readonly rows: readonly ApplyRowState[];
  readonly groupRows: readonly ApplyGroupRowState[];
}): ReactElement => {
  const appliedAtLabel = result === null ? null : getAppliedAtLabel(result.appliedAt);

  return (
    <section className="detail-panel apply-preview-summary" aria-labelledby="repository-plan-title">
      <h2 id="repository-plan-title">Repository plan</h2>
      <p>{getApplyPlanSummaryText(preview, result !== null, rows, groupRows)}</p>
      {result === null ? null : (
        <>
          <div className="apply-result-meta">
            <span className="status-chip">{formatStatusLabel(result.status)}</span>
            <span>Exit code {result.exitCode}</span>
            {appliedAtLabel === null ? null : <span>Applied {appliedAtLabel}</span>}
          </div>
          <dl className="detail-grid apply-result-files">
            {result.repositoryMode !== "group" ? null : (
              <>
                <DetailItem label="Group repositories" value={result.targetCount} />
                <DetailItem label="Student mappings" value={result.studentMappingCount} />
              </>
            )}
            <DetailItem label="Assignment file" value={result.assignmentFile} />
            <DetailItem label="Manifest file" value={result.manifestFile} />
            <DetailItem label="Generated files" value={result.generatedFiles.join(", ") || null} />
          </dl>
        </>
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
 * One row per student, its preview and (once apply has run) result status
 * joined. README section 5.4: "one plan table... updates that table's
 * Status column in place" -- there is no second table appended once apply
 * runs; this same table's Status/Reason cells just start reading
 * differently for rows the result covers.
 */
const RepositoryRowsPanel = ({
  rows
}: {
  readonly rows: readonly ApplyRowState[];
}): ReactElement => (
  <section
    className="detail-panel apply-preview-repositories"
    aria-labelledby="repository-rows-title"
  >
    <h2 id="repository-rows-title">Repository rows</h2>
    {rows.length === 0 ? (
      <p className="detail-panel__note">No repository rows.</p>
    ) : (
      <div className="apply-preview-table" role="table" aria-label="Repository rows">
        <div className="apply-preview-table__header" role="row">
          <span role="columnheader">Student</span>
          <span role="columnheader">Section</span>
          <span role="columnheader">Repository</span>
          <span role="columnheader">Status</span>
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
                  mergedRowNeedsAttention(row)
                    ? "status-chip status-chip--attention"
                    : "status-chip"
                }
              >
                {formatMergedRowStatus(row)}
              </span>
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

/** Group-mode equivalent of `RepositoryRowsPanel`. */
const GroupTargetsPanel = ({
  preview,
  rows
}: {
  readonly preview: NormalizedApplyPreview;
  readonly rows: readonly ApplyGroupRowState[];
}): ReactElement | null => {
  if (preview.repositoryMode !== "group") return null;

  return (
    <section
      className="detail-panel apply-preview-repositories"
      aria-labelledby="group-targets-title"
    >
      <h2 id="group-targets-title">Group repositories</h2>
      <p className="detail-panel__note">
        Apply creates one repository per group and gives every group member admin access.
      </p>
      {rows.length === 0 ? (
        <p className="detail-panel__note">No group repository targets were found.</p>
      ) : (
        <div className="apply-preview-table" role="table" aria-label="Group repositories">
          <div className="apply-preview-table__header" role="row">
            <span role="columnheader">Group</span>
            <span role="columnheader">Section</span>
            <span role="columnheader">Repository</span>
            <span role="columnheader">Students</span>
            <span role="columnheader">Permission</span>
            <span role="columnheader">Teams</span>
            <span role="columnheader">Status</span>
          </div>
          {rows.map((row) => (
            <div
              className="apply-preview-table__row"
              role="row"
              key={row.groupId ?? row.repositoryName ?? "group"}
            >
              <span role="cell">{formatNullableValue(row.groupId)}</span>
              <span role="cell">{row.sectionIds.join(", ") || "—"}</span>
              <span role="cell" className="apply-preview-table__repository">
                {row.htmlUrl === null ? (
                  formatNullableValue(row.repositoryName)
                ) : (
                  <a href={row.htmlUrl} target="_blank" rel="noreferrer">
                    {row.repositoryName ?? row.htmlUrl}
                  </a>
                )}
              </span>
              <span role="cell">{row.studentIds.join(", ") || "—"}</span>
              <span role="cell">{formatNullableValue(row.plannedStudentPermission)}</span>
              <span role="cell">{`${row.facultyTeam ?? "—"} (${row.facultyTeamPermission ?? "—"}), ${row.graderTeam ?? "—"} (${row.graderTeamPermission ?? "—"})`}</span>
              <span role="cell">
                <span
                  className={
                    mergedGroupRowNeedsAttention(row)
                      ? "status-chip status-chip--attention"
                      : "status-chip"
                  }
                >
                  {formatMergedGroupRowStatus(row)}
                </span>
                <RowDiagnostics diagnostics={row.diagnostics} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

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
  <section className="detail-panel" aria-labelledby="apply-preview-diagnostics-title">
    <h2 id="apply-preview-diagnostics-title">Diagnostics / blockers</h2>
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
        <p>
          {preview.repositoryMode === "group"
            ? "Preview is ready. Apply will create one repository per group and give every group member admin access."
            : "Preview is ready. Review and confirm before applying changes to student repositories."}
        </p>
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
            <li>
              {preview.repositoryMode === "group"
                ? "This will create or update one shared repository per group. Every group member will receive admin access."
                : "This will create or update student repositories."}
            </li>
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
            <span>
              {preview.repositoryMode === "group"
                ? "I understand this will apply changes to group repositories"
                : "I understand this will apply changes to student repositories"}
            </span>
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

/**
 * The one part of the old "two panel sets" design that genuinely was a
 * single panel whose content changes: pre-apply this slot holds
 * `ConfirmationPanel`, post-apply it holds this. Never both at once, so it
 * was never part of the stacking defect README section 5.4 describes.
 */
const PostApplyActionsPanel = ({
  onRefreshAssignmentDetail
}: {
  readonly onRefreshAssignmentDetail?: () => void;
}): ReactElement => (
  <section className="detail-panel apply-preview-final-action" aria-labelledby="post-apply-title">
    <h2 id="post-apply-title">Post-apply actions</h2>
    <div className="apply-confirmation-actions">
      {onRefreshAssignmentDetail === undefined ? null : (
        <button className="primary-action" type="button" onClick={onRefreshAssignmentDetail}>
          Refresh assignment detail
        </button>
      )}
    </div>
  </section>
);

export const ApplyPreviewPage = ({
  selection,
  assignmentDetail,
  onRefreshAssignmentDetail
}: ApplyPreviewPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<ApplyPreviewLoadResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyExecutionLoadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<AssignmentApplyProgressEvent | null>(null);
  const [isConfirmingApply, setIsConfirmingApply] = useState(false);
  const [isApplyConfirmed, setIsApplyConfirmed] = useState(false);
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const applyProgressActiveRef = useRef(false);

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

  const mergedRows = useMemo(
    () => (preview === null ? [] : mergeApplyRows(preview, normalizedApplyResult)),
    [preview, normalizedApplyResult]
  );

  const mergedGroupRows = useMemo(
    () => (preview === null ? [] : mergeApplyGroupRows(preview, normalizedApplyResult)),
    [preview, normalizedApplyResult]
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
    applyProgressActiveRef.current = true;
    setApplyProgress(null);

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
      applyProgressActiveRef.current = false;
      setApplyProgress(null);
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

  useEffect(() => {
    const unsubscribe = window.graiderUI.onAssignmentApplyProgress((progress) => {
      if (
        applyProgressActiveRef.current &&
        progress.courseFolderId === selection.courseFolderId &&
        progress.assignmentFile === selection.assignmentFile
      ) {
        setApplyProgress(progress);
      }
    });

    return () => {
      applyProgressActiveRef.current = false;
      unsubscribe();
    };
  }, [selection.assignmentFile, selection.courseFolderId]);

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
      mergedRows.some(
        (row) => row.previewStatus === "token_required" || row.previewReason === "token_required"
      ));
  const activeDiagnostics =
    normalizedApplyResult === null
      ? (preview?.diagnostics ?? [])
      : normalizedApplyResult.diagnostics;
  const refreshedAtLabel = preview === null ? null : formatReadableDateTime(preview.refreshedAt);

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
            : "Apply has finished. The plan below reflects what happened."}
        </p>
        <p className="assignment-detail__path">
          Assignment file: {preview?.files.assignmentFile ?? selection.assignmentFile}
        </p>
        {refreshedAtLabel === null ? null : (
          <p className="assignment-detail__path">Last refreshed: {refreshedAtLabel}</p>
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

        {isApplying ? (
          <OperationStatusBar
            label="Applying assignment"
            detail={getApplyOperationDetail(applyProgress)}
          />
        ) : null}

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
              <PlanSummaryPanel
                preview={preview}
                result={normalizedApplyResult}
                rows={mergedRows}
                groupRows={mergedGroupRows}
              />
              {preview.repositoryMode === "group" ? (
                <GroupTargetsPanel preview={preview} rows={mergedGroupRows} />
              ) : (
                <RepositoryRowsPanel rows={mergedRows} />
              )}
              {activeDiagnostics.length === 0 ? null : (
                <DiagnosticsPanel diagnostics={activeDiagnostics} />
              )}
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
                <PostApplyActionsPanel
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
