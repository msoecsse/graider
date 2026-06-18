import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { copyTextToClipboard } from "./assignmentDetailClipboard";
import { normalizeAssignmentDetail } from "./assignmentDetailNormalization";
import { normalizeGradeStatus } from "../grade-status/gradeStatusNormalization";
import { getGradeStatusRunUrl } from "../grade-status/gradeStatusRunUrl";
import type {
  GradeStatusLoadResult,
  GradeStatusRepositoryRow,
  NormalizedGradeStatus
} from "../grade-status/gradeStatusTypes";
import {
  collectNeedsAttentionItems,
  deriveAssignmentReadiness,
  formatNullableValue,
  formatStatusLabel,
  getDiagnosticCategory,
  groupDiagnostics,
  hasAttentionStatus,
  hasTokenRequiredReadiness
} from "./assignmentDetailReadiness";
import type {
  AssignmentDetailAction,
  AssignmentDetailDiagnostic,
  AssignmentDetailLoadResult,
  AssignmentDetailPageProps,
  AssignmentNeedsAttentionItem,
  NormalizedAssignmentDetail
} from "./assignmentDetailTypes";

const ACTION_LABELS = {
  validate: "Validate / Refresh detail",
  apply: "Preview apply",
  grade: "Grade submissions",
  report: "Generate report",
  publishStudentReports: "Publish student reports",
  generateWorkflow: "Generate/update workflow"
} as const;

type ActionKey = keyof typeof ACTION_LABELS;

const ACTION_ORDER: readonly ActionKey[] = [
  "validate",
  "apply",
  "grade",
  "report",
  "publishStudentReports",
  "generateWorkflow"
];

const COPY_FEEDBACK_TIMEOUT_MS = 2200;

type CopyKey = "assignment-path" | "course-folder-path" | "template-repository" | "workflow-path";

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

const getCommandErrorMessage = (result: AssignmentDetailLoadResult | null): string | null => {
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

  if (errorCode === "invalid_assignment_detail_json") {
    return "Graider returned invalid assignment detail JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to load assignment detail.";
};

const getGradeStatusCommandErrorMessage = (result: GradeStatusLoadResult | null): string | null => {
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
    return "GitHub authentication is required to check grade status. Run gh auth login, then refresh.";
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

  return "Unable to load grade status summary.";
};

const getAssignmentTitle = (
  detail: NormalizedAssignmentDetail | null,
  fallbackTitle: string | null,
  fallbackSlug: string | null
): string => detail?.assignment.title ?? fallbackTitle ?? fallbackSlug ?? "Assignment detail";

const getCourseTermSubtitle = (detail: NormalizedAssignmentDetail | null): string => {
  const course = detail?.course.title ?? detail?.course.slug;
  const term = detail?.term.title ?? detail?.term.slug;

  if (course !== undefined && course !== null && term !== undefined && term !== null) {
    return `${course} · ${term}`;
  }

  return course ?? term ?? "Course assignment";
};

const getStatusBadges = (detail: NormalizedAssignmentDetail | null): readonly string[] => {
  if (detail === null) {
    return [];
  }

  const badges = [
    detail.assignment.status,
    detail.grading.enabled ? "Grading enabled" : "No grading"
  ];

  if (detail.status === "partial_success") {
    badges.push("Partial");
  }

  if (
    detail.diagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    hasAttentionStatus(detail.template.status) ||
    hasAttentionStatus(detail.template.repositoryStatus) ||
    hasAttentionStatus(detail.template.branchStatus) ||
    hasAttentionStatus(detail.grading.workflowStatus) ||
    hasAttentionStatus(detail.grading.workflowDispatch)
  ) {
    badges.push("Needs attention");
  } else {
    badges.push("Ready");
  }

  return badges.filter((badge): badge is string => badge !== null);
};

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

interface StatusItemProps {
  readonly label: string;
  readonly value: string | null;
}

const StatusItem = ({ label, value }: StatusItemProps): ReactElement => {
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

interface CopyButtonProps {
  readonly label: string;
  readonly value: string | null;
  readonly copyKey: CopyKey;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}

const CopyButton = ({
  label,
  value,
  copyKey,
  copyState,
  onCopy
}: CopyButtonProps): ReactElement | null => {
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
  detail,
  needsAttentionItems
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly needsAttentionItems: readonly AssignmentNeedsAttentionItem[];
}): ReactElement => {
  const readiness = deriveAssignmentReadiness(detail);

  return (
    <section
      className={`readiness-summary readiness-summary--${readiness.status}`}
      aria-labelledby="assignment-readiness-title"
    >
      <div className="readiness-summary__header">
        <div>
          <h2 id="assignment-readiness-title">Readiness</h2>
          <p className="readiness-summary__status">{readiness.label}</p>
        </div>
        <span className="status-chip">{formatStatusLabel(detail.status)}</span>
      </div>
      <p>{readiness.description}</p>
      {needsAttentionItems.length === 0 ? null : (
        <ul className="needs-attention-list" aria-label="Readiness items needing attention">
          {needsAttentionItems.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
              <em>{item.category}</em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const SummaryPanel = ({
  detail,
  courseFolderPath,
  copyState,
  onCopy
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly courseFolderPath: string;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="assignment-summary-title">
    <h2 id="assignment-summary-title">Summary</h2>
    <dl className="detail-grid">
      <DetailItem label="Title" value={detail.assignment.title} />
      <DetailItem label="Slug" value={detail.assignment.slug} />
      <DetailItem label="Type" value={detail.assignment.type} />
      <DetailItem label="Status" value={detail.assignment.status} />
      <DetailItem label="Points" value={detail.metadata.points} />
      <DetailItem label="Due date" value={detail.deadline.dueAt} />
      <DetailItem label="Late policy" value={detail.deadline.latePolicy} />
      <DetailItem label="Sections" value={detail.sections.join(", ") || null} />
      <DetailItem label="Faculty owner" value={detail.metadata.facultyOwner} />
      <DetailItem label="LMS assignment ID" value={detail.metadata.lmsAssignmentId} />
      <DetailItem label="Grading category" value={detail.metadata.gradingCategory} />
      <DetailItem
        label="Assignment file path"
        value={detail.assignment.file}
        valueClassName="copyable-value"
        action={
          <CopyButton
            label="Copy assignment path"
            value={detail.assignment.file}
            copyKey="assignment-path"
            copyState={copyState}
            onCopy={onCopy}
          />
        }
      />
      <DetailItem
        label="Course folder path"
        value={courseFolderPath}
        valueClassName="copyable-value"
        action={
          <CopyButton
            label="Copy course folder path"
            value={courseFolderPath}
            copyKey="course-folder-path"
            copyState={copyState}
            onCopy={onCopy}
          />
        }
      />
    </dl>
  </section>
);

const TemplatePanel = ({
  detail,
  copyState,
  onCopy
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="template-readiness-title">
    <h2 id="template-readiness-title">Template</h2>
    <dl className="detail-grid">
      <DetailItem
        label="Repository"
        value={detail.template.repository}
        valueClassName="copyable-value"
        action={
          <CopyButton
            label="Copy template repository"
            value={detail.template.repository}
            copyKey="template-repository"
            copyState={copyState}
            onCopy={onCopy}
          />
        }
      />
      <DetailItem label="Branch" value={detail.template.branch} />
      <StatusItem label="Overall status" value={detail.template.status} />
      <StatusItem label="Repository status" value={detail.template.repositoryStatus} />
      <StatusItem label="Branch status" value={detail.template.branchStatus} />
    </dl>
  </section>
);

const GradingPanel = ({
  detail,
  copyState,
  onCopy
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly copyState: CopyState | null;
  readonly onCopy: (copyKey: CopyKey, value: string) => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="grading-readiness-title">
    <h2 id="grading-readiness-title">Grading</h2>
    {!detail.grading.enabled ? (
      <p className="detail-panel__note">No grading configured.</p>
    ) : (
      <dl className="detail-grid">
        <DetailItem label="Enabled" value={displayBoolean(detail.grading.enabled)} />
        <DetailItem label="Mode" value={detail.grading.mode} />
        <DetailItem
          label="Workflow path"
          value={detail.grading.workflow}
          valueClassName="copyable-value"
          action={
            <CopyButton
              label="Copy workflow path"
              value={detail.grading.workflow}
              copyKey="workflow-path"
              copyState={copyState}
              onCopy={onCopy}
            />
          }
        />
        <DetailItem label="Artifact name" value={detail.grading.artifact} />
        <DetailItem label="Result file" value={detail.grading.resultFile} />
        <StatusItem label="Workflow status" value={detail.grading.workflowStatus} />
        <StatusItem label="workflow_dispatch status" value={detail.grading.workflowDispatch} />
      </dl>
    )}
  </section>
);

const StudentReportsPanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="student-reports-title">
    <h2 id="student-reports-title">Student reports</h2>
    <dl className="detail-grid">
      <DetailItem label="Enabled" value={displayBoolean(detail.studentReports.enabled)} />
      <DetailItem label="Mode" value={detail.studentReports.mode} />
    </dl>
  </section>
);

const RosterPanel = ({ detail }: { readonly detail: NormalizedAssignmentDetail }): ReactElement => (
  <section className="detail-panel" aria-labelledby="roster-sections-title">
    <h2 id="roster-sections-title">Roster / Sections</h2>
    <dl className="detail-grid">
      <DetailItem label="Sections" value={detail.sections.join(", ") || null} />
      {detail.roster === null ? (
        <DetailItem label="Roster" value="Roster summary unavailable." />
      ) : (
        <>
          <DetailItem label="Section count" value={detail.roster.sectionCount} />
          <DetailItem label="Active students" value={detail.roster.activeStudentCount} />
          <DetailItem label="Total students" value={detail.roster.totalStudentCount} />
        </>
      )}
    </dl>
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
  <section className="detail-panel" aria-labelledby="assignment-diagnostics-title">
    <h2 id="assignment-diagnostics-title">Diagnostics</h2>
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

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const getGradeStatusStudentLabel = (row: GradeStatusRepositoryRow): string =>
  // Prefer roster/course identity when present. Current grade-status JSON always
  // exposes studentId, with GitHub login available as a fallback.
  row.studentUsername ?? row.studentId ?? row.githubUsername ?? "Unknown student";

const getRepositoryShortName = (repository: string | null): string =>
  repository?.split("/").at(-1) ?? "Not configured";

const formatGradeStatusSummaryLabel = (row: GradeStatusRepositoryRow): string => {
  if (row.status === "queued") {
    return "Queued";
  }

  if (row.status === "in_progress") {
    return "In progress";
  }

  if (row.status === "completed") {
    if (row.conclusion === "success") {
      return "Completed — success";
    }

    if (row.conclusion === "failure") {
      return "Completed — failure";
    }

    if (row.conclusion === "cancelled") {
      return "Cancelled";
    }

    if (row.conclusion === "timed_out") {
      return "Timed out";
    }

    return "Completed — unknown";
  }

  if (row.status === "missing") {
    return "Missing";
  }

  if (row.status === "token_required") {
    return "Token required";
  }

  return row.status === "blocked" ? "Blocked" : "Unknown";
};

const formatReadableDateTime = (timestamp: string | null): string | null => {
  if (timestamp === null) {
    return null;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : DATE_TIME_FORMATTER.format(date);
};

const formatGradeStatusLastUpdate = (row: GradeStatusRepositoryRow): string => {
  const completedAt = formatReadableDateTime(row.completedAt);

  if (completedAt !== null) {
    return `Last completed ${completedAt}`;
  }

  const startedAt = formatReadableDateTime(row.startedAt);

  if (startedAt !== null) {
    return `Started ${startedAt}`;
  }

  return "No run time available";
};

const getGradeStatusSummaryText = (status: NormalizedGradeStatus): string => {
  const activeRuns = status.summary.queued + status.summary.inProgress;
  const parts = [
    status.summary.needsAttention > 0
      ? `${status.summary.needsAttention} grading runs need attention.`
      : null,
    activeRuns > 0 ? `${activeRuns} runs still in progress.` : null,
    status.summary.missing > 0
      ? `${status.summary.missing} repositories are missing completed grading runs.`
      : null,
    status.summary.unknown > 0 ? `${status.summary.unknown} repositories are unknown.` : null,
    status.summary.blocked > 0 ? `${status.summary.blocked} repositories are blocked.` : null
  ].filter((part): part is string => part !== null);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  if (status.repositories.length === 0) {
    return "No repository status rows were returned.";
  }

  return "No grading runs need attention.";
};

const GradeStatusSummaryPanel = ({
  status,
  isLoading,
  errorMessage,
  onViewFullGradeStatus
}: {
  readonly status: NormalizedGradeStatus | null;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly onViewFullGradeStatus: () => void;
}): ReactElement => (
  <section
    className="detail-panel grade-status-summary-panel"
    aria-labelledby="assignment-grade-status-summary-title"
  >
    <div className="grade-status-summary-panel__header">
      <div>
        <h2 id="assignment-grade-status-summary-title">Grade status summary</h2>
        <p className="detail-panel__note">
          {status === null
            ? "Graider checks grading workflow run status without starting workflows."
            : getGradeStatusSummaryText(status)}
        </p>
      </div>
      <button className="secondary-action" type="button" onClick={onViewFullGradeStatus}>
        View full grade status
      </button>
    </div>

    {isLoading ? <p className="loading-state">Loading grade status summary...</p> : null}
    {errorMessage === null ? null : (
      <p className="error-message" role="alert">
        {errorMessage}
      </p>
    )}

    {status === null ? (
      <p className="detail-panel__note">Grade status data is not available yet.</p>
    ) : status.repositories.length === 0 ? (
      <p className="detail-panel__note">No student grading rows were returned.</p>
    ) : (
      <div className="grade-status-summary-table-wrap">
        <table className="grade-status-summary-table">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Section</th>
              <th scope="col">Repository</th>
              <th scope="col">Status</th>
              <th scope="col">Last update</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {status.repositories.map((row) => {
              const runUrl = getGradeStatusRunUrl(row);

              return (
                <tr
                  key={`${row.studentId ?? row.githubUsername ?? row.repository ?? "row"}-${row.section ?? "section"}`}
                >
                  <td>{getGradeStatusStudentLabel(row)}</td>
                  <td>{formatNullableValue(row.section)}</td>
                  <td>{getRepositoryShortName(row.repository)}</td>
                  <td>
                    <span
                      className={
                        row.needsAttention ? "status-chip status-chip--attention" : "status-chip"
                      }
                    >
                      {formatGradeStatusSummaryLabel(row)}
                    </span>
                  </td>
                  <td>{formatGradeStatusLastUpdate(row)}</td>
                  <td>
                    {runUrl === null ? (
                      <span className="detail-panel__note">No run link</span>
                    ) : (
                      <a href={runUrl} target="_blank" rel="noreferrer">
                        Open run
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    {status === null || status.diagnostics.length === 0 ? null : (
      <details className="grade-status-summary-diagnostics">
        <summary>Grade status diagnostics ({status.diagnostics.length})</summary>
        <ul className="assignment-detail-diagnostics">
          {status.diagnostics.map((diagnostic, index) => (
            <DiagnosticEntry
              diagnostic={diagnostic}
              key={`${diagnostic.code ?? "diagnostic"}-${index}`}
            />
          ))}
        </ul>
      </details>
    )}
  </section>
);

const CollapsibleDiagnosticsPanel = ({
  diagnostics
}: {
  readonly diagnostics: readonly AssignmentDetailDiagnostic[];
}): ReactElement => (
  <details className="detail-panel assignment-detail-disclosure">
    <summary>Diagnostics ({diagnostics.length})</summary>
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
  </details>
);

const getActionDescription = (action: AssignmentDetailAction, actionKey: ActionKey): string => {
  if (actionKey === "validate") {
    return action.available ? "Runs assignment detail again." : "Unavailable for this assignment";
  }

  if (!action.available) {
    return action.reason ?? "Unavailable for this assignment";
  }

  if (actionKey === "apply") {
    return "Preview what apply would do. No changes are made.";
  }

  if (actionKey === "grade") {
    return "Preview grading workflow dispatches. No workflows are started.";
  }

  if (!action.implemented) {
    return "Coming in a future slice";
  }

  return "Coming in a future slice";
};

const ActionsPanel = ({
  detail,
  isLoading,
  onRefresh,
  onPreviewApply,
  onPreviewGrade
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly isLoading: boolean;
  readonly onRefresh: () => void;
  readonly onPreviewApply: () => void;
  readonly onPreviewGrade: () => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="assignment-actions-title">
    <h2 id="assignment-actions-title">Available actions</h2>
    <div className="assignment-actions">
      {ACTION_ORDER.map((actionKey) => {
        const action = detail.actions[actionKey];
        const isValidate = actionKey === "validate";
        const isApplyPreview = actionKey === "apply";
        const isGradePreview = actionKey === "grade";

        return (
          <div className="assignment-action" key={actionKey}>
            <button
              className={
                isValidate ? "secondary-action" : "secondary-action assignment-action__button"
              }
              type="button"
              disabled={
                (!isValidate && !isApplyPreview && !isGradePreview) ||
                isLoading ||
                !action.available
              }
              onClick={
                isValidate
                  ? onRefresh
                  : isApplyPreview
                    ? onPreviewApply
                    : isGradePreview
                      ? onPreviewGrade
                      : undefined
              }
              aria-describedby={`assignment-action-${actionKey}-description`}
            >
              {ACTION_LABELS[actionKey]}
            </button>
            <p id={`assignment-action-${actionKey}-description`}>
              {getActionDescription(action, actionKey)}
            </p>
          </div>
        );
      })}
    </div>
  </section>
);

export const AssignmentDetailPage = ({
  selection,
  initialLoadResult = null,
  onBack,
  onPreviewApply,
  onPreviewGrade,
  onViewGradeStatus,
  onDetailLoaded
}: AssignmentDetailPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<AssignmentDetailLoadResult | null>(
    initialLoadResult
  );
  const [gradeStatusLoadResult, setGradeStatusLoadResult] = useState<GradeStatusLoadResult | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGradeStatus, setIsLoadingGradeStatus] = useState(false);
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  const detail = useMemo(
    () =>
      loadResult?.detail === null || loadResult?.detail === undefined
        ? null
        : normalizeAssignmentDetail(loadResult.detail, selection, loadResult.refreshedAt),
    [loadResult, selection]
  );
  const gradeStatus = useMemo(
    () =>
      gradeStatusLoadResult?.gradeStatus === null ||
      gradeStatusLoadResult?.gradeStatus === undefined
        ? null
        : normalizeGradeStatus(
            gradeStatusLoadResult.gradeStatus,
            selection,
            gradeStatusLoadResult.refreshedAt
          ),
    [gradeStatusLoadResult, selection]
  );

  const loadDetail = async (): Promise<void> => {
    setIsLoading(true);

    try {
      const nextResult = await window.graiderUI.getAssignmentDetail({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile
      });

      setLoadResult(nextResult);
      onDetailLoaded?.(nextResult);
    } catch {
      const failureResult = {
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        status: "failure" as const,
        detail: null,
        error: {
          code: "assignment_detail_failed",
          message: "Unable to load assignment detail.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: null
      };

      setLoadResult(failureResult);
      onDetailLoaded?.(failureResult);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGradeStatusSummary = async (): Promise<void> => {
    setIsLoadingGradeStatus(true);

    try {
      setGradeStatusLoadResult(
        await window.graiderUI.getAssignmentGradeStatus({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
    } catch {
      setGradeStatusLoadResult((currentResult) => ({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        status: "failure",
        gradeStatus: currentResult?.gradeStatus ?? null,
        error: {
          code: "assignment_grade_status_failed",
          message: "Unable to load grade status summary.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: currentResult?.refreshedAt ?? null
      }));
    } finally {
      setIsLoadingGradeStatus(false);
    }
  };

  const hasInitialResultForSelection =
    initialLoadResult?.courseFolderId === selection.courseFolderId &&
    initialLoadResult.assignmentFile === selection.assignmentFile;

  useEffect(() => {
    if (hasInitialResultForSelection) {
      setLoadResult(initialLoadResult);
      onDetailLoaded?.(initialLoadResult);
    } else {
      void loadDetail();
    }
  }, [selection.assignmentFile, selection.courseFolderId]);

  useEffect(() => {
    setGradeStatusLoadResult(null);
    void loadGradeStatusSummary();
  }, [selection.assignmentFile, selection.courseFolderId, selection.courseFolderPath]);

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

  useEffect(
    () => () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    },
    []
  );

  const title = getAssignmentTitle(detail, selection.assignmentTitle, selection.assignmentSlug);
  const commandErrorMessage = getCommandErrorMessage(loadResult);
  const gradeStatusCommandErrorMessage = getGradeStatusCommandErrorMessage(gradeStatusLoadResult);
  const showTokenGuidance = detail !== null && hasTokenRequiredReadiness(detail);
  const needsAttentionItems = detail === null ? [] : collectNeedsAttentionItems(detail);

  return (
    <main className="dashboard-shell" aria-labelledby="assignment-detail-title">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-header__eyebrow">Graider</p>
            <h1 id="assignment-detail-title">{title}</h1>
            <p className="assignment-detail__subtitle">{getCourseTermSubtitle(detail)}</p>
          </div>
          <div className="assignment-detail__header-actions">
            <button className="secondary-action" type="button" onClick={onBack}>
              Back to dashboard
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={detail === null}
              onClick={() => {
                onPreviewApply(selection, detail, loadResult);
              }}
            >
              Preview apply
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={detail === null}
              onClick={() => {
                onPreviewGrade(selection, detail, loadResult);
              }}
            >
              Preview grading
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={detail === null}
              onClick={() => {
                onViewGradeStatus(selection, detail, loadResult);
              }}
            >
              View grading status
            </button>
            <button
              className="primary-action"
              type="button"
              disabled={isLoading}
              onClick={() => {
                void loadDetail();
              }}
            >
              {isLoading ? "Refreshing detail..." : "Refresh detail"}
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-content assignment-detail" aria-label="Assignment detail">
        <p className="assignment-detail__path">
          Assignment file: {detail?.assignment.file ?? selection.assignmentFile}
        </p>

        {isLoading ? <p className="loading-state">Loading assignment detail...</p> : null}

        {commandErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {commandErrorMessage}
          </p>
        )}

        {showTokenGuidance ? (
          <section className="detail-guidance" aria-label="GitHub token guidance">
            <h2>GitHub token required for readiness checks.</h2>
            <p>Sign in with GitHub CLI using gh auth login, then refresh.</p>
          </section>
        ) : null}

        {detail === null ? (
          <section className="dashboard-placeholder" aria-label="Assignment detail loading">
            <h2>Loading assignment detail.</h2>
            <p>Graider is reading the assignment configuration and readiness checks.</p>
          </section>
        ) : (
          <>
            <ReadinessPanel detail={detail} needsAttentionItems={needsAttentionItems} />

            <div className="assignment-detail__badges" aria-label="Assignment status">
              {getStatusBadges(detail).map((badge) => (
                <span className="status-chip" key={badge}>
                  {badge}
                </span>
              ))}
            </div>

            <div className="assignment-detail-grid">
              <SummaryPanel
                detail={detail}
                courseFolderPath={selection.courseFolderPath}
                copyState={copyState}
                onCopy={handleCopy}
              />
              <TemplatePanel detail={detail} copyState={copyState} onCopy={handleCopy} />
              <GradingPanel detail={detail} copyState={copyState} onCopy={handleCopy} />
              <StudentReportsPanel detail={detail} />
              <RosterPanel detail={detail} />
              <GradeStatusSummaryPanel
                status={gradeStatus}
                isLoading={isLoadingGradeStatus}
                errorMessage={gradeStatusCommandErrorMessage}
                onViewFullGradeStatus={() => {
                  onViewGradeStatus(selection, detail, loadResult);
                }}
              />
              <DiagnosticsPanel diagnostics={detail.diagnostics} />
              <ActionsPanel
                detail={detail}
                isLoading={isLoading}
                onRefresh={() => {
                  void loadDetail();
                }}
                onPreviewApply={() => {
                  onPreviewApply(selection, detail, loadResult);
                }}
                onPreviewGrade={() => {
                  onPreviewGrade(selection, detail, loadResult);
                }}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
};
