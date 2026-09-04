import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
  StudentAccessPagesConfigResult,
  AssignmentGroupConfigResult,
  StudentRepositoryAccessPagePublishResult,
  StudentRepositoryAccessPagePublishActionResult,
  StudentRepositoryAccessPageResult,
  TemplateWorkflowResult,
  TemplateWorkflowSavePreview,
  TemplateWorkflowSaveResult
} from "../../electron/ipc";
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

interface StudentAccessPagesConfigSaveOutcome {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

const ACTION_ORDER: readonly ActionKey[] = [
  "validate",
  "apply",
  "grade",
  "report",
  "publishStudentReports",
  "generateWorkflow"
];

const COPY_FEEDBACK_TIMEOUT_MS = 2200;

const derivePagesBaseUrl = (repository: string): string => {
  const [owner, name] = repository.trim().split("/");
  return owner === undefined || name === undefined || owner === "" || name === ""
    ? ""
    : `https://${owner}.github.io/${name}`;
};

const getConfiguredPagesBaseUrl = (
  result: StudentRepositoryAccessPageResult,
  defaultRepository: string
): string => {
  const suffix = `/${result.outputPath}`;
  return result.pagesUrl !== null && result.pagesUrl.endsWith(suffix)
    ? result.pagesUrl.slice(0, -suffix.length)
    : derivePagesBaseUrl(result.pagesRepository ?? defaultRepository);
};

const hasFacultyReportContext = ({
  courseFolderId,
  courseFolderPath,
  assignmentFile
}: AssignmentDetailPageProps["selection"]): boolean =>
  courseFolderId.trim().length > 0 &&
  courseFolderPath.trim().length > 0 &&
  assignmentFile.trim().length > 0;

type CopyKey =
  | "assignment-path"
  | "course-folder-path"
  | "template-repository"
  | "workflow-path"
  | "canvas-link"
  | "publish-commands";

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

const GradeWorkflowPanel = ({
  detail,
  workflowResult,
  draft,
  preview,
  isLoading,
  isPushing,
  onViewWorkflow,
  onDraftChange,
  onPreview,
  onPush
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly workflowResult: TemplateWorkflowResult | null;
  readonly draft: string;
  readonly preview: TemplateWorkflowSavePreview | null;
  readonly isLoading: boolean;
  readonly isPushing: boolean;
  readonly onViewWorkflow: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onPreview: () => void;
  readonly onPush: () => void;
}): ReactElement => {
  const isConfigured =
    detail.grading.enabled &&
    detail.template.repository !== null &&
    detail.template.branch !== null;

  return (
    <section className="detail-panel grade-workflow-panel" aria-labelledby="grade-workflow-title">
      <div className="grade-workflow-panel__header">
        <div>
          <h2 id="grade-workflow-title">Grade workflow</h2>
          <p className="detail-panel__note">
            Workflow changes are not saved in this version. Saving to the template repository will
            be added in a later slice.
          </p>
        </div>
        <button
          className="secondary-action"
          type="button"
          disabled={!isConfigured || isLoading}
          onClick={onViewWorkflow}
        >
          {isLoading ? "Loading workflow..." : "View workflow"}
        </button>
      </div>
      {!isConfigured ? (
        <p className="detail-panel__note">Grading or the template repository is not configured.</p>
      ) : null}
      {workflowResult === null ? null : (
        <>
          <dl className="detail-grid">
            <DetailItem label="Repository" value={workflowResult.repository} />
            <DetailItem label="Branch" value={workflowResult.branch} />
            <DetailItem label="Workflow path" value={workflowResult.path} />
            <DetailItem label="Fetch status" value={workflowResult.status} />
          </dl>
          {workflowResult.diagnostics.map((item) => (
            <p className="error-message" role="alert" key={item.message}>
              {item.message}
            </p>
          ))}
          {workflowResult.status === "missing" ? (
            <p className="detail-panel__note">Start a workflow draft here. It is not saved yet.</p>
          ) : null}
          {workflowResult.status === "success" || workflowResult.status === "missing" ? (
            <textarea
              aria-label="Grade workflow draft"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              rows={16}
            />
          ) : null}
          {preview === null ? null : (
            <>
              <p className={preview.status === "ready" ? "detail-panel__note" : "error-message"}>
                {preview.diagnostics.map((item) => item.message).join(" ") ||
                  `${preview.operation} ready`}
              </p>
              <p className="detail-panel__note">
                This will commit directly to the template repository branch used by this assignment.
              </p>
              <dl className="detail-grid">
                <DetailItem label="Operation" value={preview.operation} />
                <DetailItem label="Commit message" value={preview.commitMessage} />
              </dl>
            </>
          )}
          {workflowResult.status === "success" || workflowResult.status === "missing" ? (
            <button
              className="secondary-action"
              type="button"
              disabled={isLoading || isPushing || draft === workflowResult.content}
              onClick={onPreview}
            >
              Preview save
            </button>
          ) : null}
          <button
            className="primary-action"
            type="button"
            disabled={preview?.status !== "ready" || isPushing}
            onClick={onPush}
          >
            {isPushing ? "Pushing..." : "Confirm push"}
          </button>
        </>
      )}
    </section>
  );
};

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

const StudentRepositoryAccessPagePanel = ({
  result,
  isGenerating,
  isSelectingPagesFolder,
  copyFeedback,
  onGenerate,
  onSelectPagesFolder,
  onSaveConfig,
  isSavingConfig,
  configFeedback,
  defaultRepository,
  onCopy
}: {
  readonly result: StudentRepositoryAccessPageResult;
  readonly isGenerating: boolean;
  readonly isSelectingPagesFolder: boolean;
  readonly copyFeedback: string | null;
  readonly onGenerate: () => void;
  readonly onSelectPagesFolder: () => Promise<string | null>;
  readonly onSaveConfig: (
    repository: string,
    baseUrl: string,
    branch: string
  ) => Promise<StudentAccessPagesConfigSaveOutcome>;
  readonly isSavingConfig: boolean;
  readonly configFeedback: string | null;
  readonly defaultRepository: string;
  readonly onCopy: (value: string) => void;
}): ReactElement => {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [repository, setRepository] = useState(result.pagesRepository ?? defaultRepository);
  const [baseUrl, setBaseUrl] = useState(
    result.pagesBaseUrl ?? getConfiguredPagesBaseUrl(result, defaultRepository)
  );
  const [branch, setBranch] = useState(result.pagesBranch ?? "main");
  const [selectedPagesFolderPath, setSelectedPagesFolderPath] = useState<string | null>(null);
  const [formDiagnostic, setFormDiagnostic] = useState<string | null>(null);
  const invalid =
    !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(repository) ||
    !baseUrl.startsWith("https://") ||
    branch.trim() === "";
  const updateRepository = (next: string): void => {
    const previousAutoUrl = derivePagesBaseUrl(repository);
    setRepository(next);
    if (baseUrl === "" || baseUrl === previousAutoUrl) setBaseUrl(derivePagesBaseUrl(next));
  };
  const save = async (): Promise<void> => {
    if (invalid) {
      setFormDiagnostic("Enter an owner/repository, HTTPS base URL, and branch before saving.");
      return;
    }
    setFormDiagnostic(null);
    const outcome = await onSaveConfig(repository.trim(), baseUrl.trim(), branch.trim());
    if (outcome.ok) {
      setIsConfiguring(false);
    } else {
      setFormDiagnostic(
        outcome.diagnostics.join(" ") || "Unable to save Student Access Pages settings."
      );
    }
  };
  const selectPagesFolder = async (): Promise<void> => {
    const folderPath = await onSelectPagesFolder();
    if (folderPath !== null) setSelectedPagesFolderPath(folderPath);
  };
  return (
    <section className="detail-panel" aria-labelledby="student-repository-access-page-title">
      <h2 id="student-repository-access-page-title">Student repository access page</h2>
      <p className="detail-panel__note">
        Apply generates this HTML page in the configured Pages repository. Regenerate it here after
        roster or repository-link corrections. Course repository files remain the source for
        assignment, roster, and manifest data.
      </p>
      <dl className="detail-grid">
        <DetailItem label="Status" value={formatStatusLabel(result.status)} />
        <DetailItem label="Pages repository" value={result.pagesRepository ?? "Not configured"} />
        <DetailItem label="Generated page path" value={result.outputPath || "Unavailable"} />
        <DetailItem label="Generated" value={result.generatedAt ?? "Not generated yet"} />
        <DetailItem label="Active students" value={String(result.summary.activeStudents)} />
        <DetailItem label="Included" value={String(result.summary.includedStudents)} />
        <DetailItem label="Skipped inactive" value={String(result.summary.skippedInactive)} />
        <DetailItem label="Missing repositories" value={String(result.summary.missingRepository)} />
      </dl>
      {result.pagesRepository === null ? (
        <>
          <p role="status">
            A Pages repository must be configured before Graider can generate a public student
            access page.
          </p>
          <button className="secondary-action" type="button" onClick={() => setIsConfiguring(true)}>
            Configure Student Access Pages
          </button>
        </>
      ) : !result.pagesRepositoryFolderSelected ? (
        <>
          <p role="status">Pages repository folder is not selected.</p>
          <button
            className="secondary-action"
            type="button"
            disabled={isSelectingPagesFolder}
            onClick={onSelectPagesFolder}
          >
            {isSelectingPagesFolder
              ? "Selecting Pages repository folder..."
              : "Select Pages repository folder"}
          </button>
        </>
      ) : result.pagesUrl === null ? (
        <p role="status">
          Graider cannot determine the GitHub Pages URL. The access page can be generated locally,
          but a Canvas link is unavailable until a valid HTTPS Pages URL is configured.
        </p>
      ) : (
        <div className="detail-copy-row">
          <a href={result.pagesUrl} target="_blank" rel="noreferrer">
            {result.pagesUrl}
          </a>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              if (result.pagesUrl !== null) onCopy(result.pagesUrl);
            }}
          >
            Copy Canvas link
          </button>
          {copyFeedback === null ? null : <span role="status">{copyFeedback}</span>}
        </div>
      )}
      {result.pagesRepository !== null ? (
        <button className="secondary-action" type="button" onClick={() => setIsConfiguring(true)}>
          Edit Student Access Pages Settings
        </button>
      ) : null}
      {isConfiguring ? (
        <section
          className="detail-panel student-access-pages-settings"
          aria-label="Student Access Pages settings"
        >
          <p>
            Student Access Pages need a public GitHub Pages repository, a published base URL, and a
            local clone where Graider can generate the page.
          </p>
          <div className="student-access-pages-settings__fields">
            <label>
              Pages repository
              <input
                value={repository}
                onChange={(event) => updateRepository(event.target.value)}
              />
            </label>
            <label>
              Base URL
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <label>
              Branch
              <input value={branch} onChange={(event) => setBranch(event.target.value)} />
            </label>
          </div>
          <div className="student-access-pages-settings__folder">
            <strong>Local Pages repository folder</strong>
            <span>
              {selectedPagesFolderPath ??
                (result.pagesRepositoryFolderSelected ? "Selected" : "Not selected")}
            </span>
            <button
              className="secondary-action"
              type="button"
              disabled={isSelectingPagesFolder}
              onClick={() => void selectPagesFolder()}
            >
              {isSelectingPagesFolder
                ? "Selecting Pages repository folder..."
                : "Select Pages repository folder"}
            </button>
          </div>
          {formDiagnostic === null ? null : (
            <p className="error-message" role="alert">
              {formDiagnostic}
            </p>
          )}
          <button
            className="primary-action"
            type="button"
            disabled={isSavingConfig}
            onClick={() => void save()}
          >
            {isSavingConfig
              ? "Saving Student Access Pages Settings..."
              : "Save Student Access Pages Settings"}
          </button>
        </section>
      ) : null}
      {configFeedback === null ? null : (
        <p className="success-message" role="status">
          {configFeedback}
        </p>
      )}
      <p className="detail-panel__note">
        Pages repository: {result.pagesRepository ?? "Not configured"}. This requires GitHub Pages
        to be enabled for the Pages repository; Graider does not enable it or publish this file.
      </p>
      {result.summary.missingRepository > 0 ? (
        <p role="status">
          {String(result.summary.missingRepository)} active student(s) are missing repository links
          and will be excluded.
        </p>
      ) : null}
      {result.diagnostics.length > 0 ? (
        <ul className="detail-diagnostics">
          {result.diagnostics.map((item) => (
            <li key={item.message}>{item.message}</li>
          ))}
        </ul>
      ) : null}
      <button
        className="primary-action"
        type="button"
        disabled={isGenerating || !result.pagesRepositoryFolderSelected}
        onClick={onGenerate}
      >
        {isGenerating
          ? "Generating student access page..."
          : result.exists
            ? "Regenerate student access page"
            : "Generate student access page"}
      </button>
    </section>
  );
};

const StudentRepositoryAccessPagePublishPanel = ({
  result,
  copyFeedback,
  onCopy,
  onPublish,
  isPublishing,
  publishResult
}: {
  readonly result: StudentRepositoryAccessPagePublishResult;
  readonly copyFeedback: string | null;
  readonly onCopy: (value: string) => void;
  readonly onPublish: () => void;
  readonly isPublishing: boolean;
  readonly publishResult: StudentRepositoryAccessPagePublishActionResult | null;
}): ReactElement => {
  const [isReviewingPublish, setIsReviewingPublish] = useState(false);
  const canPublish = result.status === "uncommitted" || result.status === "unpushed";
  const commitMessage = `Publish student access page for ${result.assignmentSlug ?? "assignment"}`;
  return (
    <section
      className="detail-panel"
      aria-labelledby="student-repository-access-page-publish-title"
    >
      <h3 id="student-repository-access-page-publish-title">Publish readiness</h3>
      <dl className="detail-grid">
        <DetailItem label="Publish status" value={formatStatusLabel(result.status)} />
        <DetailItem
          label="Pages repository folder"
          value={result.checks.pagesRepositoryFolderSelected ? "Selected" : "Not selected"}
        />
        <DetailItem
          label="Local file"
          value={result.checks.fileExists ? "Exists" : "Not generated"}
        />
        <DetailItem
          label="Git repository"
          value={result.checks.isGitRepository ? "Detected" : "Not detected"}
        />
        <DetailItem label="Branch" value={result.checks.currentBranch} />
        <DetailItem label="Upstream" value={result.checks.upstreamBranch} />
        <DetailItem
          label="Uncommitted access page"
          value={result.checks.hasUncommittedAccessPage ? "Yes" : "No"}
        />
        <DetailItem label="Commits ahead" value={result.checks.aheadCount} />
        <DetailItem label="Commits behind" value={result.checks.behindCount} />
        <DetailItem
          label="Pages remote"
          value={
            result.checks.remoteMatchesConfiguredRepository === null
              ? "Unknown"
              : result.checks.remoteMatchesConfiguredRepository
                ? "Matches configured repository"
                : "May not match configured repository"
          }
        />
      </dl>
      {result.diagnostics.map((item) => (
        <p className="detail-panel__note" role="status" key={item.message}>
          {item.message}
        </p>
      ))}
      {canPublish && !isReviewingPublish ? (
        <button
          className="primary-action"
          type="button"
          onClick={() => setIsReviewingPublish(true)}
        >
          Publish Student Access Page
        </button>
      ) : null}
      {isReviewingPublish ? (
        <section className="detail-panel" aria-label="Publish Student Access Page review">
          <p>Review the local Git change before publishing.</p>
          <dl className="detail-grid">
            <DetailItem label="Pages repository folder" value={result.pagesRepositoryFolderPath} />
            <DetailItem label="Branch" value={result.checks.currentBranch} />
            <DetailItem label="Upstream" value={result.checks.upstreamBranch} />
            <DetailItem label="Generated page" value={result.outputPath} />
            <DetailItem label="Commit message" value={commitMessage} />
          </dl>
          <p className="detail-panel__note">
            GitHub Pages must already be enabled in GitHub. Graider does not check live GitHub Pages
            publication status.
          </p>
          <button
            className="primary-action"
            type="button"
            disabled={isPublishing}
            onClick={onPublish}
          >
            {isPublishing
              ? "Publishing Student Access Page..."
              : "Confirm Publish Student Access Page"}
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={isPublishing}
            onClick={() => setIsReviewingPublish(false)}
          >
            Cancel
          </button>
        </section>
      ) : null}
      {publishResult === null ? null : (
        <p
          className={publishResult.status === "failure" ? "error-message" : "success-message"}
          role="status"
        >
          {publishResult.diagnostics.map((item) => item.message).join(" ")}
        </p>
      )}
      {result.suggestedCommands.length === 0 ? null : (
        <>
          <p className="detail-panel__note">Suggested manual commands:</p>
          <pre>{result.suggestedCommands.join("\n")}</pre>
          <button
            className="secondary-action"
            type="button"
            onClick={() => onCopy(result.suggestedCommands.join("\n"))}
          >
            Copy commands
          </button>
          {copyFeedback === null ? null : <span role="status">{copyFeedback}</span>}
        </>
      )}
      <p className="detail-panel__note">
        Run suggested commands from the local Pages repository folder. GitHub Pages must be enabled
        and published for the Pages repository before students can use the link. Pages live status
        is unknown; Graider does not check or enable GitHub Pages.
      </p>
    </section>
  );
};

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

const getGradeStatusSummaryChipClassName = (row: GradeStatusRepositoryRow): string => {
  if (row.status === "completed" && row.conclusion === "success") {
    return "status-chip status-chip--success";
  }

  if (row.status === "completed" && row.conclusion === "failure") {
    return "status-chip status-chip--error";
  }

  return row.needsAttention ? "status-chip status-chip--attention" : "status-chip";
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
                    <span className={getGradeStatusSummaryChipClassName(row)}>
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

const getActionDescription = (
  action: AssignmentDetailAction,
  actionKey: ActionKey,
  canGenerateFacultyReport: boolean
): string => {
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

  if (actionKey === "report") {
    return canGenerateFacultyReport
      ? "Generate and view the faculty report."
      : "A course folder and assignment file are required to generate a faculty report.";
  }

  if (!action.implemented) {
    return "This action is not available in this view.";
  }

  return "This action is not available in this view.";
};

const ActionsPanel = ({
  detail,
  isLoading,
  onRefresh,
  onPreviewApply,
  onPreviewGrade,
  onViewFacultyReport,
  canGenerateFacultyReport
}: {
  readonly detail: NormalizedAssignmentDetail;
  readonly isLoading: boolean;
  readonly onRefresh: () => void;
  readonly onPreviewApply: () => void;
  readonly onPreviewGrade: () => void;
  readonly onViewFacultyReport: () => void;
  readonly canGenerateFacultyReport: boolean;
}): ReactElement => (
  <section className="detail-panel" aria-labelledby="assignment-actions-title">
    <h2 id="assignment-actions-title">Available actions</h2>
    <div className="assignment-actions">
      {ACTION_ORDER.map((actionKey) => {
        const action = detail.actions[actionKey];
        const isValidate = actionKey === "validate";
        const isApplyPreview = actionKey === "apply";
        const isGradePreview = actionKey === "grade";
        const isFacultyReport = actionKey === "report";

        return (
          <div className="assignment-action" key={actionKey}>
            <button
              className={
                isValidate ? "secondary-action" : "secondary-action assignment-action__button"
              }
              type="button"
              disabled={
                (!isValidate && !isApplyPreview && !isGradePreview && !isFacultyReport) ||
                isLoading ||
                (isFacultyReport ? !canGenerateFacultyReport : !action.available)
              }
              onClick={
                isValidate
                  ? onRefresh
                  : isApplyPreview
                    ? onPreviewApply
                    : isGradePreview
                      ? onPreviewGrade
                      : isFacultyReport
                        ? onViewFacultyReport
                        : undefined
              }
              aria-describedby={`assignment-action-${actionKey}-description`}
            >
              {ACTION_LABELS[actionKey]}
            </button>
            <p id={`assignment-action-${actionKey}-description`}>
              {getActionDescription(action, actionKey, canGenerateFacultyReport)}
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
  onViewFacultyReport,
  onViewGradeStatus,
  onDetailLoaded,
  onEditAssignment = () => undefined,
  onDeleted = () => undefined
}: AssignmentDetailPageProps): ReactElement => {
  const [loadResult, setLoadResult] = useState<AssignmentDetailLoadResult | null>(
    initialLoadResult
  );
  const [gradeStatusLoadResult, setGradeStatusLoadResult] = useState<GradeStatusLoadResult | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingRepositories, setIsDownloadingRepositories] = useState(false);
  const [repositoryDownloadError, setRepositoryDownloadError] = useState<string | null>(null);
  const [repositoryDownloadResult, setRepositoryDownloadResult] = useState<Awaited<
    ReturnType<NonNullable<typeof window.graiderUI.downloadAssignmentRepositories>>
  > | null>(null);
  const [isLoadingGradeStatus, setIsLoadingGradeStatus] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<TemplateWorkflowResult | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState("");
  const [workflowPreview, setWorkflowPreview] = useState<TemplateWorkflowSavePreview | null>(null);
  const [workflowSaveResult, setWorkflowSaveResult] = useState<TemplateWorkflowSaveResult | null>(
    null
  );
  const [isPushingWorkflow, setIsPushingWorkflow] = useState(false);
  const [accessPage, setAccessPage] = useState<StudentRepositoryAccessPageResult | null>(null);
  const [isSelectingPagesFolder, setIsSelectingPagesFolder] = useState(false);
  const [accessPagePublishStatus, setAccessPagePublishStatus] =
    useState<StudentRepositoryAccessPagePublishResult | null>(null);
  const [isGeneratingAccessPage, setIsGeneratingAccessPage] = useState(false);
  const [isSavingAccessPagesConfig, setIsSavingAccessPagesConfig] = useState(false);
  const [isPublishingAccessPage, setIsPublishingAccessPage] = useState(false);
  const [accessPagePublishResult, setAccessPagePublishResult] =
    useState<StudentRepositoryAccessPagePublishActionResult | null>(null);
  const [accessPagesConfigFeedback, setAccessPagesConfigFeedback] = useState<string | null>(null);
  const [groupConfig, setGroupConfig] = useState<AssignmentGroupConfigResult | null>(null);
  const [groupMode, setGroupMode] = useState<"individual" | "group">("individual");
  const [groupsCsv, setGroupsCsv] = useState("group_id,student_id\n");
  const [isSavingGroupConfig, setIsSavingGroupConfig] = useState(false);
  const [groupConfigFeedback, setGroupConfigFeedback] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  const deleteLocalAssignment = async (): Promise<void> => {
    if (!isDeleteConfirmed || window.graiderUI.deleteAssignment === undefined) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await window.graiderUI.deleteAssignment({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        confirmed: true
      });
      if (result.status === "success") {
        onDeleted();
      } else {
        setDeleteError(result.diagnostics.map((diagnostic) => diagnostic.message).join(" "));
      }
    } catch {
      setDeleteError("Unable to delete local assignment configuration.");
    } finally {
      setIsDeleting(false);
    }
  };

  const downloadStudentRepositories = async (): Promise<void> => {
    if (
      window.graiderUI.selectRepositoryDownloadFolder === undefined ||
      window.graiderUI.downloadAssignmentRepositories === undefined
    )
      return;
    const selected = await window.graiderUI.selectRepositoryDownloadFolder();
    if (selected.canceled || selected.folderPath === null) return;
    setIsDownloadingRepositories(true);
    setRepositoryDownloadError(null);
    try {
      setRepositoryDownloadResult(
        await window.graiderUI.downloadAssignmentRepositories({
          ...selection,
          destination: selected.folderPath
        })
      );
    } catch {
      setRepositoryDownloadError("Unable to download student repositories.");
    } finally {
      setIsDownloadingRepositories(false);
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

  const loadTemplateWorkflow = async (): Promise<void> => {
    if (detail === null || window.graiderUI.getTemplateWorkflow === undefined) return;
    setIsLoadingWorkflow(true);
    try {
      const result = await window.graiderUI.getTemplateWorkflow({
        templateRepository: detail.template.repository,
        templateBranch: detail.template.branch,
        workflowPath: detail.grading.workflow,
        gradingEnabled: detail.grading.enabled
      });
      setWorkflowResult(result);
      setWorkflowDraft(result.content ?? "");
      setWorkflowPreview(null);
      setWorkflowSaveResult(null);
    } catch {
      setWorkflowResult({
        status: "error",
        repository: detail.template.repository,
        branch: detail.template.branch,
        path: detail.grading.workflow ?? ".github/workflows/grade.yml",
        content: null,
        sha: null,
        diagnostics: [{ message: "Unable to fetch the grade workflow." }]
      });
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  const createWorkflowSaveRequest = () =>
    detail === null || workflowResult === null
      ? null
      : {
          templateRepository: detail.template.repository,
          templateBranch: detail.template.branch,
          workflowPath: detail.grading.workflow,
          gradingEnabled: detail.grading.enabled,
          assignmentSlug: detail.assignment.slug,
          content: workflowDraft,
          loadedSha: workflowResult.sha,
          confirmed: false
        };
  const previewWorkflowSave = async (): Promise<void> => {
    const request = createWorkflowSaveRequest();
    if (request === null || window.graiderUI.previewTemplateWorkflowSave === undefined) return;
    setWorkflowPreview(await window.graiderUI.previewTemplateWorkflowSave(request));
    setWorkflowSaveResult(null);
  };
  const pushWorkflow = async (): Promise<void> => {
    const request = createWorkflowSaveRequest();
    if (
      request === null ||
      workflowPreview?.status !== "ready" ||
      window.graiderUI.saveTemplateWorkflow === undefined
    )
      return;
    setIsPushingWorkflow(true);
    try {
      const result = await window.graiderUI.saveTemplateWorkflow({ ...request, confirmed: true });
      setWorkflowSaveResult(result);
      if (result.status === "success") {
        setWorkflowResult((current) =>
          current === null
            ? current
            : { ...current, content: workflowDraft, sha: result.commitSha ?? current.sha }
        );
        setWorkflowPreview(null);
      }
    } finally {
      setIsPushingWorkflow(false);
    }
  };

  const loadStudentRepositoryAccessPageStatus = async (): Promise<void> => {
    if (window.graiderUI.getStudentRepositoryAccessPageStatus === undefined) return;
    setAccessPage(
      await window.graiderUI.getStudentRepositoryAccessPageStatus({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile
      })
    );
  };

  const loadAssignmentGroupConfig = async (): Promise<void> => {
    if (window.graiderUI.getAssignmentGroupConfig === undefined) return;
    const result = await window.graiderUI.getAssignmentGroupConfig({
      courseFolderId: selection.courseFolderId,
      courseFolderPath: selection.courseFolderPath,
      assignmentFile: selection.assignmentFile
    });
    setGroupConfig(result);
    setGroupMode(result.repositoryMode);
    setGroupsCsv(result.groupsCsv);
  };

  const saveAssignmentGroupConfig = async (): Promise<void> => {
    if (window.graiderUI.saveAssignmentGroupConfig === undefined) return;
    setIsSavingGroupConfig(true);
    setGroupConfigFeedback(null);
    try {
      const result = await window.graiderUI.saveAssignmentGroupConfig({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        repositoryMode: groupMode,
        groupsCsv
      });
      setGroupConfig(result);
      setGroupConfigFeedback(result.diagnostics.map((item) => item.message).join(" "));
      if (result.status === "success") await loadAssignmentGroupConfig();
    } catch {
      setGroupConfigFeedback("Unable to save group assignment settings.");
    } finally {
      setIsSavingGroupConfig(false);
    }
  };

  const loadStudentRepositoryAccessPagePublishStatus = async (): Promise<void> => {
    if (window.graiderUI.getStudentRepositoryAccessPagePublishStatus === undefined) return;
    setAccessPagePublishStatus(
      await window.graiderUI.getStudentRepositoryAccessPagePublishStatus({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile
      })
    );
  };

  const generateStudentRepositoryAccessPage = async (): Promise<void> => {
    if (window.graiderUI.generateStudentRepositoryAccessPage === undefined) return;
    setIsGeneratingAccessPage(true);
    try {
      setAccessPage(
        await window.graiderUI.generateStudentRepositoryAccessPage({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
      await loadStudentRepositoryAccessPagePublishStatus();
    } finally {
      setIsGeneratingAccessPage(false);
    }
  };

  const selectStudentAccessPagesRepositoryFolder = async (): Promise<string | null> => {
    if (window.graiderUI.selectStudentAccessPagesRepositoryFolder === undefined) return null;
    setIsSelectingPagesFolder(true);
    try {
      const result = await window.graiderUI.selectStudentAccessPagesRepositoryFolder(
        selection.courseFolderId
      );
      if (!result.canceled && result.folderPath !== null) {
        await loadStudentRepositoryAccessPageStatus();
        await loadStudentRepositoryAccessPagePublishStatus();
        return result.folderPath;
      }
      return null;
    } finally {
      setIsSelectingPagesFolder(false);
    }
  };

  const saveStudentAccessPagesConfig = async (
    repository: string,
    baseUrl: string,
    branch: string
  ): Promise<StudentAccessPagesConfigSaveOutcome> => {
    if (window.graiderUI.saveStudentAccessPagesConfig === undefined)
      return { ok: false, diagnostics: ["Student Access Pages settings are unavailable."] };
    setIsSavingAccessPagesConfig(true);
    setAccessPagesConfigFeedback(null);
    try {
      const result: StudentAccessPagesConfigResult =
        await window.graiderUI.saveStudentAccessPagesConfig({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          repository,
          baseUrl,
          branch
        });
      const diagnostics = result.diagnostics.map((diagnostic) => diagnostic.message);
      if (result.status !== "success") return { ok: false, diagnostics };
      setAccessPagesConfigFeedback(
        diagnostics.join(" ") ||
          "Course config changes were saved locally. Commit and push the admin repo so this setting is shared."
      );
      await Promise.allSettled([
        loadStudentRepositoryAccessPageStatus(),
        loadStudentRepositoryAccessPagePublishStatus()
      ]);
      return { ok: true, diagnostics };
    } catch {
      setAccessPagesConfigFeedback(null);
      return { ok: false, diagnostics: ["Unable to save Student Access Pages settings."] };
    } finally {
      setIsSavingAccessPagesConfig(false);
    }
  };

  const publishStudentRepositoryAccessPage = async (): Promise<void> => {
    if (window.graiderUI.publishStudentRepositoryAccessPage === undefined) return;
    setIsPublishingAccessPage(true);
    setAccessPagePublishResult(null);
    try {
      setAccessPagePublishResult(
        await window.graiderUI.publishStudentRepositoryAccessPage({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          assignmentFile: selection.assignmentFile
        })
      );
    } catch {
      setAccessPagePublishResult({
        status: "failure",
        diagnostics: [{ message: "Unable to publish the student access page." }],
        commitMessage: null
      });
    } finally {
      await Promise.allSettled([
        loadStudentRepositoryAccessPageStatus(),
        loadStudentRepositoryAccessPagePublishStatus()
      ]);
      setIsPublishingAccessPage(false);
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

  useEffect(() => {
    setGroupConfig(null);
    void loadAssignmentGroupConfig();
  }, [selection.assignmentFile, selection.courseFolderId, selection.courseFolderPath]);

  useEffect(() => {
    setAccessPage(null);
    setAccessPagePublishStatus(null);
    void loadStudentRepositoryAccessPageStatus();
    void loadStudentRepositoryAccessPagePublishStatus();
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
  const canGenerateFacultyReport = hasFacultyReportContext(selection);

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
              onClick={onEditAssignment}
            >
              Edit assignment
            </button>
            <button
              className="danger-action"
              type="button"
              disabled={detail === null || isDeleting}
              onClick={() => {
                setIsConfirmingDelete(true);
                setIsDeleteConfirmed(false);
                setDeleteError(null);
              }}
            >
              Delete assignment
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
              disabled={detail === null || isDownloadingRepositories}
              onClick={() => void downloadStudentRepositories()}
            >
              {isDownloadingRepositories
                ? "Downloading repositories..."
                : "Download Student Repositories"}
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
      {!isConfirmingDelete ? null : (
        <section className="detail-panel" role="dialog" aria-labelledby="delete-assignment-title">
          <h2 id="delete-assignment-title">Delete assignment</h2>
          <p>
            This deletes only the local assignment configuration file. It does not delete GitHub
            repositories, student repositories, GitHub Classroom resources, or other remote
            resources.
          </p>
          <label className="confirmation-check">
            <input
              type="checkbox"
              checked={isDeleteConfirmed}
              onChange={(event) => setIsDeleteConfirmed(event.target.checked)}
            />
            I understand this deletes the local assignment configuration.
          </label>
          <div className="apply-confirmation-actions">
            <button
              className="secondary-action"
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setIsConfirmingDelete(false);
                setIsDeleteConfirmed(false);
              }}
            >
              Cancel
            </button>
            <button
              className="danger-action"
              type="button"
              disabled={!isDeleteConfirmed || isDeleting}
              onClick={() => void deleteLocalAssignment()}
            >
              {isDeleting ? "Deleting assignment..." : "Delete assignment"}
            </button>
          </div>
        </section>
      )}
      {deleteError === null ? null : (
        <p className="error-message" role="alert">
          {deleteError}
        </p>
      )}
      {repositoryDownloadResult === null ? null : (
        <section className="detail-panel" aria-label="Repository download results">
          <h2>Repository download</h2>
          <p>
            {repositoryDownloadResult.clonedCount} cloned, {repositoryDownloadResult.failedCount}{" "}
            failed of {repositoryDownloadResult.totalTargets}. Destination:{" "}
            {repositoryDownloadResult.destination}
          </p>
          {repositoryDownloadResult.diagnostics.map((diagnostic) => (
            <p key={diagnostic.message} role="alert">
              {diagnostic.message}
            </p>
          ))}
          <ul>
            {repositoryDownloadResult.targets.map((target) => (
              <li key={target.targetId}>
                <strong>{target.repositoryName}</strong> — {target.status} — {target.localPath}
                {target.groupId === undefined ? null : ` (${target.groupId})`}
                <span> {target.studentIds.join(", ")}</span>
                {target.githubUsernames.length === 0 ? null : (
                  <span> ({target.githubUsernames.join(", ")})</span>
                )}
                {target.diagnostics.map((diagnostic) => (
                  <p key={diagnostic.message}>{diagnostic.message}</p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="dashboard-content assignment-detail" aria-label="Assignment detail">
        {isLoading ? <p className="loading-state">Loading assignment detail...</p> : null}

        {commandErrorMessage === null ? null : (
          <p className="error-message" role="alert">
            {commandErrorMessage}
          </p>
        )}
        {repositoryDownloadError === null ? null : (
          <p className="error-message" role="alert">
            {repositoryDownloadError}
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
            {needsAttentionItems.length === 0 ? null : (
              <ReadinessPanel detail={detail} needsAttentionItems={needsAttentionItems} />
            )}

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
              {accessPage === null ? null : (
                <StudentRepositoryAccessPagePanel
                  result={accessPage}
                  isGenerating={isGeneratingAccessPage}
                  isSelectingPagesFolder={isSelectingPagesFolder}
                  copyFeedback={getCopyStateText(copyState, "canvas-link")}
                  onGenerate={() => {
                    void generateStudentRepositoryAccessPage();
                  }}
                  onSelectPagesFolder={() => selectStudentAccessPagesRepositoryFolder()}
                  onSaveConfig={saveStudentAccessPagesConfig}
                  isSavingConfig={isSavingAccessPagesConfig}
                  configFeedback={accessPagesConfigFeedback}
                  defaultRepository={
                    (accessPage.githubOrganization ?? selection.courseSlug) === null
                      ? ""
                      : `${accessPage.githubOrganization ?? selection.courseSlug}/${accessPage.githubOrganization ?? selection.courseSlug}pages`
                  }
                  onCopy={(value) => {
                    handleCopy("canvas-link", value);
                  }}
                />
              )}
              <RosterPanel detail={detail} />
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
                onViewFacultyReport={() => {
                  onViewFacultyReport(selection, detail, loadResult);
                }}
                canGenerateFacultyReport={canGenerateFacultyReport}
              />
              <details className="detail-panel assignment-detail__advanced">
                <summary>Advanced details</summary>
                <p className="assignment-detail__path">Assignment file: {detail.assignment.file}</p>
                <TemplatePanel detail={detail} copyState={copyState} onCopy={handleCopy} />
                <GradingPanel detail={detail} copyState={copyState} onCopy={handleCopy} />
                <GradeWorkflowPanel
                  detail={detail}
                  workflowResult={workflowResult}
                  draft={workflowDraft}
                  preview={workflowPreview}
                  isLoading={isLoadingWorkflow}
                  isPushing={isPushingWorkflow}
                  onViewWorkflow={() => {
                    void loadTemplateWorkflow();
                  }}
                  onDraftChange={(value) => {
                    setWorkflowDraft(value);
                    setWorkflowPreview(null);
                    setWorkflowSaveResult(null);
                  }}
                  onPreview={() => {
                    void previewWorkflowSave();
                  }}
                  onPush={() => {
                    void pushWorkflow();
                  }}
                />
                {workflowSaveResult?.status === "success" ? (
                  <p role="status">
                    Workflow pushed
                    {workflowSaveResult.commitSha === null
                      ? "."
                      : `: ${workflowSaveResult.commitSha}`}
                  </p>
                ) : null}
                <StudentReportsPanel detail={detail} />
                {groupConfig === null ? null : (
                  <section className="detail-panel" aria-labelledby="repository-mode-title">
                    <h2 id="repository-mode-title">Repository mode</h2>
                    <label>
                      Repository mode
                      <select
                        value={groupMode}
                        onChange={(event) =>
                          setGroupMode(event.target.value as "individual" | "group")
                        }
                      >
                        <option value="individual">Individual repositories</option>
                        <option value="group">Group repositories</option>
                      </select>
                    </label>
                    {groupMode === "group" ? (
                      <>
                        <p className="detail-panel__note">
                          Apply creates one shared repository per group. Use Preview apply to verify
                          group membership and repository targets before applying changes.
                        </p>
                        <label>
                          Group membership CSV
                          <textarea
                            aria-label="Group membership CSV"
                            value={groupsCsv}
                            rows={8}
                            onChange={(event) => setGroupsCsv(event.target.value)}
                          />
                        </label>
                        <p className="detail-panel__note">
                          {String(groupConfig.groupCount)} groups,{" "}
                          {String(groupConfig.groupedStudentCount)}
                          {" grouped students, "}
                          {String(groupConfig.ungroupedActiveStudentCount)} ungrouped active
                          students.
                        </p>
                      </>
                    ) : groupConfig.groupsCsv.trim() !== "group_id,student_id" ? (
                      <p className="detail-panel__note">
                        Existing groups.csv is retained and ignored while Individual repositories is
                        selected.
                      </p>
                    ) : null}
                    <button
                      className="primary-action"
                      type="button"
                      disabled={isSavingGroupConfig}
                      onClick={() => void saveAssignmentGroupConfig()}
                    >
                      {isSavingGroupConfig ? "Saving repository mode..." : "Save repository mode"}
                    </button>
                    {groupConfigFeedback === null ? null : (
                      <p role="status">{groupConfigFeedback}</p>
                    )}
                  </section>
                )}
                {accessPagePublishStatus === null ? null : (
                  <StudentRepositoryAccessPagePublishPanel
                    result={accessPagePublishStatus}
                    copyFeedback={getCopyStateText(copyState, "publish-commands")}
                    onPublish={() => {
                      void publishStudentRepositoryAccessPage();
                    }}
                    isPublishing={isPublishingAccessPage}
                    publishResult={accessPagePublishResult}
                    onCopy={(value) => {
                      handleCopy("publish-commands", value);
                    }}
                  />
                )}
                <GradeStatusSummaryPanel
                  status={gradeStatus}
                  isLoading={isLoadingGradeStatus}
                  errorMessage={gradeStatusCommandErrorMessage}
                  onViewFullGradeStatus={() => {
                    onViewGradeStatus(selection, detail, loadResult);
                  }}
                />
                <DiagnosticsPanel diagnostics={detail.diagnostics} />
              </details>
            </div>
          </>
        )}
      </section>
    </main>
  );
};
