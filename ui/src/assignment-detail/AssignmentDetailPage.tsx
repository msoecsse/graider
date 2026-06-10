import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  hasAttentionStatus,
  hasTokenRequiredReadiness,
  normalizeAssignmentDetail
} from "./assignmentDetailNormalization";
import type {
  AssignmentDetailAction,
  AssignmentDetailDiagnostic,
  AssignmentDetailLoadResult,
  AssignmentDetailPageProps,
  NormalizedAssignmentDetail
} from "./assignmentDetailTypes";

const ACTION_LABELS = {
  validate: "Validate / Refresh validation",
  apply: "Apply assignment",
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

const MISSING_VALUE = "Not configured";

const displayValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === "" ? MISSING_VALUE : String(value);

const displayBoolean = (value: boolean): string => (value ? "Enabled" : "Disabled");

const getCommandErrorMessage = (result: AssignmentDetailLoadResult | null): string | null => {
  const errorCode = result?.error?.code;

  if (errorCode === undefined) {
    return null;
  }

  if (errorCode === "graider_cli_not_found") {
    return "Graider CLI not found. Install Graider or make sure graider is available on PATH.";
  }

  if (errorCode === "invalid_assignment_detail_json") {
    return "Graider returned invalid assignment detail JSON.";
  }

  if (errorCode === "assignment_file_not_found") {
    return "Assignment file not found.";
  }

  return "Unable to load assignment detail.";
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
}

const DetailItem = ({ label, value }: DetailItemProps): ReactElement => (
  <div className="detail-item">
    <dt>{label}</dt>
    <dd>{displayValue(value)}</dd>
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
          {displayValue(value)}
        </span>
      </dd>
    </div>
  );
};

const SummaryPanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
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
    </dl>
  </section>
);

const TemplatePanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="template-readiness-title">
    <h2 id="template-readiness-title">Template</h2>
    <dl className="detail-grid">
      <DetailItem label="Repository" value={detail.template.repository} />
      <DetailItem label="Branch" value={detail.template.branch} />
      <StatusItem label="Overall status" value={detail.template.status} />
      <StatusItem label="Repository status" value={detail.template.repositoryStatus} />
      <StatusItem label="Branch status" value={detail.template.branchStatus} />
    </dl>
  </section>
);

const GradingPanel = ({
  detail
}: {
  readonly detail: NormalizedAssignmentDetail;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="grading-readiness-title">
    <h2 id="grading-readiness-title">Grading</h2>
    {!detail.grading.enabled ? (
      <p className="detail-panel__note">No grading configured.</p>
    ) : (
      <dl className="detail-grid">
        <DetailItem label="Enabled" value={displayBoolean(detail.grading.enabled)} />
        <DetailItem label="Mode" value={detail.grading.mode} />
        <DetailItem label="Workflow path" value={detail.grading.workflow} />
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
    <strong>{displayValue(diagnostic.severity)}</strong>
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
      <ul className="assignment-detail-diagnostics">
        {diagnostics.map((diagnostic, index) => (
          <DiagnosticEntry
            diagnostic={diagnostic}
            key={`${diagnostic.code ?? "diagnostic"}-${index}`}
          />
        ))}
      </ul>
    )}
  </section>
);

const getActionDescription = (action: AssignmentDetailAction, actionKey: ActionKey): string => {
  if (actionKey === "validate") {
    return action.available ? "Runs assignment detail again." : "Unavailable for this assignment";
  }

  if (!action.available) {
    return action.reason ?? "Unavailable for this assignment";
  }

  if (!action.implemented) {
    return "Coming in a future slice";
  }

  return "Coming in a future slice";
};

const ActionsPanel = ({
  detail,
  isLoading,
  onRefresh
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly isLoading: boolean;
  readonly onRefresh: () => void;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="assignment-actions-title">
    <h2 id="assignment-actions-title">Available actions</h2>
    <div className="assignment-actions">
      {ACTION_ORDER.map((actionKey) => {
        const action = detail.actions[actionKey];
        const isValidate = actionKey === "validate";

        return (
          <div className="assignment-action" key={actionKey}>
            <button
              className={
                isValidate ? "secondary-action" : "secondary-action assignment-action__button"
              }
              type="button"
              disabled={!isValidate || isLoading || !action.available}
              onClick={isValidate ? onRefresh : undefined}
            >
              {ACTION_LABELS[actionKey]}
            </button>
            <p>{getActionDescription(action, actionKey)}</p>
          </div>
        );
      })}
    </div>
  </section>
);

export const AssignmentDetailPage = ({
  selection,
  onBack
}: AssignmentDetailPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<AssignmentDetailLoadResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const detail = useMemo(
    () =>
      loadResult?.detail === null || loadResult?.detail === undefined
        ? null
        : normalizeAssignmentDetail(loadResult.detail, selection, loadResult.refreshedAt),
    [loadResult, selection]
  );

  const loadDetail = async (): Promise<void> => {
    setIsLoading(true);

    try {
      setLoadResult(
        await window.graiderUI.getAssignmentDetail({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
    } catch {
      setLoadResult({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        status: "failure",
        detail: null,
        error: {
          code: "assignment_detail_failed",
          message: "Unable to load assignment detail.",
          exitCode: null,
          stdoutSnippet: null,
          stderrSnippet: null
        },
        refreshedAt: null
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [selection.assignmentFile, selection.courseFolderId]);

  const title = getAssignmentTitle(detail, selection.assignmentTitle, selection.assignmentSlug);
  const commandErrorMessage = getCommandErrorMessage(loadResult);
  const showTokenGuidance = detail !== null && hasTokenRequiredReadiness(detail);

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
          {detail?.assignment.file ?? selection.assignmentFile}
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
            <div className="assignment-detail__badges" aria-label="Assignment status">
              {getStatusBadges(detail).map((badge) => (
                <span className="status-chip" key={badge}>
                  {badge}
                </span>
              ))}
            </div>

            <div className="assignment-detail-grid">
              <SummaryPanel detail={detail} />
              <TemplatePanel detail={detail} />
              <GradingPanel detail={detail} />
              <StudentReportsPanel detail={detail} />
              <RosterPanel detail={detail} />
              <DiagnosticsPanel diagnostics={detail.diagnostics} />
              <ActionsPanel
                detail={detail}
                isLoading={isLoading}
                onRefresh={() => {
                  void loadDetail();
                }}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
};
