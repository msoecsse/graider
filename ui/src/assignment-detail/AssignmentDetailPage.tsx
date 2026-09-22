import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
  AssignmentGradingLifecycleResult,
  AssignmentTemplateSyncAvailability,
  AssignmentTemplateSyncExecutionResult,
  AssignmentTemplateSyncProgress,
  StudentAccessPagesConfigResult,
  AssignmentGroupConfigResult,
  StudentRepositoryAccessPagePublishResult,
  StudentRepositoryAccessPagePublishActionResult,
  StudentRepositoryAccessPageResult,
  TemplateWorkflowResult,
  TemplateWorkflowSavePreview,
  TemplateWorkflowSaveResult
} from "../../electron/ipc";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfirmationWithPreviewModal } from "../components/ConfirmationWithPreviewModal";
import {
  LifecycleStrip,
  type LifecycleStep,
  type LifecycleStepState
} from "../components/LifecycleStrip";
import { OperationStatusBar } from "../components/OperationStatusBar";
import { OverflowMenu, type OverflowMenuGroup } from "../components/OverflowMenu";
import { PageHeader } from "../components/PageHeader";
import { TechnicalDetails, type TechnicalDetailsItem } from "../components/TechnicalDetails";
import { Toast, useToast } from "../components/Toast";
import { AssignmentDetailStudentTable } from "./AssignmentDetailStudentTable";
import { AssignmentFactsPanel } from "./AssignmentFactsPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { GradeStatusSummaryPanel } from "./GradeStatusSummaryPanel";
import { GradeWorkflowPanel } from "./GradeWorkflowPanel";
import { GradingPanel } from "./GradingPanel";
import { GroupRepositoryModePanel } from "./GroupRepositoryModePanel";
import { ReadinessPanel } from "./ReadinessPanel";
import { RepositoryDownloadResultsPanel } from "./RepositoryDownloadResultsPanel";
import { RosterPanel } from "./RosterPanel";
import {
  StudentRepositoryAccessPagePanel,
  type StudentAccessPagesConfigSaveOutcome
} from "./StudentRepositoryAccessPagePanel";
import { StudentRepositoryAccessPagePublishPanel } from "./StudentRepositoryAccessPagePublishPanel";
import { StudentReportsPanel } from "./StudentReportsPanel";
import { TemplatePanel } from "./TemplatePanel";
import { TemplateSyncResultsPanel } from "./TemplateSyncResultsPanel";
import {
  DetailItem,
  DiagnosticEntry,
  getCopyStateText,
  type CopyKey,
  type CopyState
} from "./AssignmentDetailPrimitives";
import { copyTextToClipboard } from "./assignmentDetailClipboard";
import { normalizeAssignmentDetail } from "./assignmentDetailNormalization";
import { normalizeGradeStatus } from "../grade-status/gradeStatusNormalization";
import type {
  GradeStatusLoadResult,
  NormalizedGradeStatus
} from "../grade-status/gradeStatusTypes";
import {
  collectNeedsAttentionItems,
  deriveAssignmentReadiness,
  formatNullableValue,
  groupDiagnostics,
  hasTokenRequiredReadiness
} from "./assignmentDetailReadiness";
import { formatStatusLabel, hasAttentionStatus } from "../components/statusLabels";
import type {
  AssignmentDetailDiagnostic,
  AssignmentDetailLoadResult,
  AssignmentDetailPageProps,
  NormalizedAssignmentDetail
} from "./assignmentDetailTypes";

const COPY_FEEDBACK_TIMEOUT_MS = 2200;
const REFRESH_MINUTE_MS = 60_000;
const REFRESH_HOUR_MS = 60 * REFRESH_MINUTE_MS;
const REFRESH_DAY_MS = 24 * REFRESH_HOUR_MS;

const ADVANCED_DETAILS_ID = "assignment-advanced-details";

const BLOCKER_FIX_LABELS: Readonly<Record<string, string>> = {
  "github-token-required": "Fix GitHub authentication",
  "template-repository": "Fix template repository",
  "template-branch": "Fix template branch",
  "grading-workflow": "Fix grading workflow",
  "workflow-dispatch": "Fix workflow dispatch",
  "roster-summary": "Fix roster data",
  "partial-success": "Review readiness checks"
};

const formatRefreshedAgo = (refreshedAt: string | null): string => {
  if (refreshedAt === null) return "Not yet refreshed";
  const refreshedTime = new Date(refreshedAt).getTime();
  if (Number.isNaN(refreshedTime)) return "Not yet refreshed";
  const elapsedMs = Math.max(0, Date.now() - refreshedTime);
  if (elapsedMs < REFRESH_MINUTE_MS) return "Updated just now";
  if (elapsedMs < REFRESH_HOUR_MS) {
    const minutes = Math.floor(elapsedMs / REFRESH_MINUTE_MS);
    return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsedMs < REFRESH_DAY_MS) {
    const hours = Math.floor(elapsedMs / REFRESH_HOUR_MS);
    return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(elapsedMs / REFRESH_DAY_MS);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
};

// Reveals a section that already exists on the page (optionally inside the
// Advanced details disclosure) instead of performing an action of its own —
// these panels are out of scope to restructure this PR, so the overflow menu
// points faculty at the existing control rather than duplicating it.
const revealExistingSection = (headingId: string, detailsId?: string): void => {
  if (detailsId !== undefined) {
    const detailsElement = document.getElementById(detailsId);
    if (detailsElement instanceof HTMLDetailsElement) detailsElement.open = true;
  }
  const heading = document.getElementById(headingId);
  heading?.scrollIntoView?.({ block: "start" });
  heading?.focus();
};

interface AssignmentLifecycleStripInput {
  readonly activeStudentCount: number;
  readonly isApplied: boolean;
  readonly gradingDoneCount: number;
  readonly publishedCount: number;
  readonly unknownStatusCount: number;
  readonly isBlocked: boolean;
  readonly blockedDetail: string;
}

// Created is always complete once the page can render at all -- the
// assignment already exists -- but there is no "assignment created" date
// anywhere in the current data model, so its detail is intentionally left
// blank rather than inventing one. See the PR report.
const buildAssignmentLifecycleSteps = (
  input: AssignmentLifecycleStripInput
): readonly LifecycleStep[] => {
  const total = input.activeStudentCount;
  const gradingDone = input.isApplied && (total === 0 || input.gradingDoneCount >= total);
  const publishedDone = gradingDone && (total === 0 || input.publishedCount >= total);

  const appliedState: LifecycleStepState = input.isApplied ? "complete" : "current";
  const gradingState: LifecycleStepState = !input.isApplied
    ? "upcoming"
    : gradingDone
      ? "complete"
      : "current";
  const publishedState: LifecycleStepState = !gradingDone
    ? "upcoming"
    : publishedDone
      ? "complete"
      : "current";

  const steps: readonly LifecycleStep[] = [
    { id: "created", label: "Created", state: "complete" },
    {
      id: "applied",
      label: "Applied",
      detail: `${total} repositor${total === 1 ? "y" : "ies"}`,
      state: appliedState
    },
    {
      id: "grading",
      label: "Grading",
      detail:
        input.unknownStatusCount > 0
          ? `${input.gradingDoneCount} of ${total} done · ${input.unknownStatusCount} unknown`
          : `${input.gradingDoneCount} of ${total} done`,
      state: gradingState
    },
    {
      id: "published",
      label: "Published",
      detail: `${input.publishedCount} of ${total} sent`,
      state: publishedState
    }
  ];

  // Blocked takes precedence over whichever step is otherwise "current" —
  // the same precedence the primary action already applies.
  if (!input.isBlocked) return steps;
  return steps.map((step) =>
    step.state === "current" ? { ...step, state: "blocked", detail: input.blockedDetail } : step
  );
};

const hasFacultyReportContext = ({
  courseFolderId,
  courseFolderPath,
  assignmentFile
}: AssignmentDetailPageProps["selection"]): boolean =>
  courseFolderId.trim().length > 0 &&
  courseFolderPath.trim().length > 0 &&
  assignmentFile.trim().length > 0;

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
    detail.assignment.status === null ? null : formatStatusLabel(detail.assignment.status),
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

// The five implementation identifiers section 5.3 puts behind Technical
// details. Sourced from data the page already has -- assignment.file and
// assignment.slug from the detail response, grading.workflow from the same
// response's grading block, lmsAssignmentId from its metadata block, and
// courseFolderPath from the page's own selection -- no new field or fetch.
const buildTechnicalDetailsItems = (
  detail: NormalizedAssignmentDetail,
  courseFolderPath: string
): readonly TechnicalDetailsItem[] => [
  {
    id: "assignment-file-path",
    label: "Assignment file path",
    value: formatNullableValue(detail.assignment.file),
    copyable: detail.assignment.file !== null
  },
  {
    id: "course-folder-path",
    label: "Course folder path",
    value: courseFolderPath,
    copyable: true
  },
  {
    id: "workflow-path",
    label: "Workflow path",
    value: formatNullableValue(detail.grading.workflow),
    copyable: detail.grading.workflow !== null
  },
  {
    id: "slug",
    label: "Slug",
    value: formatNullableValue(detail.assignment.slug)
  },
  {
    id: "lms-assignment-id",
    label: "LMS assignment ID",
    value: formatNullableValue(detail.metadata.lmsAssignmentId)
  }
];

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

export const AssignmentDetailPage = ({
  selection,
  initialLoadResult = null,
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
  const [gradingLifecycleResult, setGradingLifecycleResult] =
    useState<AssignmentGradingLifecycleResult | null>(null);
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [templateSyncAvailability, setTemplateSyncAvailability] =
    useState<AssignmentTemplateSyncAvailability | null>(null);
  const [isPreparingTemplateSync, setIsPreparingTemplateSync] = useState(false);
  const [isTemplateSyncModalOpen, setIsTemplateSyncModalOpen] = useState(false);
  const [templateSyncTarget, setTemplateSyncTarget] =
    useState<AssignmentTemplateSyncAvailability | null>(null);
  const [isExecutingTemplateSync, setIsExecutingTemplateSync] = useState(false);
  const [templateSyncProgress, setTemplateSyncProgress] =
    useState<AssignmentTemplateSyncProgress | null>(null);
  const [templateSyncResult, setTemplateSyncResult] =
    useState<AssignmentTemplateSyncExecutionResult | null>(null);
  const [templateSyncError, setTemplateSyncError] = useState<string | null>(null);
  const templateSyncExecutionRef = useRef(false);
  const templateSyncProgressActiveRef = useRef(false);
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const { message: toastMessage, showToast } = useToast();

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
    if (window.graiderUI.deleteAssignment === undefined) return;
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
        if (result.publication?.status === "failure") {
          setDeleteError(result.diagnostics.map((diagnostic) => diagnostic.message).join(" "));
        } else {
          onDeleted();
        }
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

  const loadGradingLifecycleSummary = async (): Promise<void> => {
    const getGradingLifecycle = window.graiderUI.getAssignmentGradingLifecycle;
    if (
      getGradingLifecycle === undefined ||
      selection.termSlug === null ||
      selection.assignmentSlug === null
    ) {
      setGradingLifecycleResult(null);
      return;
    }
    try {
      setGradingLifecycleResult(
        await getGradingLifecycle({
          courseFolderId: selection.courseFolderId,
          courseFolderPath: selection.courseFolderPath,
          termCode: selection.termSlug,
          assignmentSlug: selection.assignmentSlug
        })
      );
    } catch {
      setGradingLifecycleResult(null);
    }
  };

  const executeTemplateSync = async (confirmed: boolean): Promise<void> => {
    if (!confirmed || templateSyncExecutionRef.current) return;

    templateSyncExecutionRef.current = true;
    templateSyncProgressActiveRef.current = true;
    setIsExecutingTemplateSync(true);
    setTemplateSyncProgress(null);
    setTemplateSyncError(null);
    try {
      const result = await window.graiderUI.executeAssignmentTemplateSync({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        ...(templateSyncTarget?.selectedRepository === undefined
          ? {}
          : { studentId: templateSyncTarget.selectedRepository.studentId }),
        confirmed: true
      });
      setTemplateSyncResult(result);
      setIsTemplateSyncModalOpen(false);
    } catch {
      setTemplateSyncError(
        "Unable to update student repositories. Check GitHub access and try again."
      );
      throw new Error("Unable to update student repositories. Check GitHub access and try again.");
    } finally {
      templateSyncExecutionRef.current = false;
      templateSyncProgressActiveRef.current = false;
      setIsExecutingTemplateSync(false);
      setTemplateSyncProgress(null);
    }
  };

  const prepareSingleRepositoryTemplateSync = async (studentId: string): Promise<void> => {
    const prepareTemplateSync = window.graiderUI.prepareAssignmentTemplateSync;
    if (prepareTemplateSync === undefined || templateSyncExecutionRef.current) return;
    setIsPreparingTemplateSync(true);
    setTemplateSyncError(null);
    setTemplateSyncResult(null);
    try {
      const availability = await prepareTemplateSync({
        courseFolderId: selection.courseFolderId,
        courseFolderPath: selection.courseFolderPath,
        assignmentFile: selection.assignmentFile,
        studentId
      });
      if (!availability.available || availability.selectedRepository === undefined) {
        setTemplateSyncError(
          availability.blocker?.message ?? "This student repository cannot be updated safely."
        );
        return;
      }
      setTemplateSyncTarget(availability);
      setIsTemplateSyncModalOpen(true);
    } catch {
      setTemplateSyncError("Unable to prepare this student repository update.");
    } finally {
      setIsPreparingTemplateSync(false);
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
    setGradingLifecycleResult(null);
    void loadGradingLifecycleSummary();
  }, [selection.assignmentFile, selection.courseFolderId, selection.courseFolderPath]);

  useEffect(() => {
    let isCurrent = true;
    const prepareTemplateSync = window.graiderUI.prepareAssignmentTemplateSync;
    setTemplateSyncAvailability(null);
    setTemplateSyncResult(null);
    setTemplateSyncError(null);
    setIsTemplateSyncModalOpen(false);
    setTemplateSyncTarget(null);
    setIsPreparingTemplateSync(true);

    if (prepareTemplateSync === undefined) {
      setTemplateSyncAvailability({
        available: false,
        repositoryCount: 0,
        templateRepository: null,
        recordedTemplateRevision: null
      });
      setIsPreparingTemplateSync(false);
      return () => {
        isCurrent = false;
      };
    }

    void prepareTemplateSync({
      courseFolderId: selection.courseFolderId,
      courseFolderPath: selection.courseFolderPath,
      assignmentFile: selection.assignmentFile
    })
      .then((availability) => {
        if (isCurrent) setTemplateSyncAvailability(availability);
      })
      .catch(() => {
        if (isCurrent) {
          setTemplateSyncAvailability({
            available: false,
            repositoryCount: 0,
            templateRepository: null,
            recordedTemplateRevision: null,
            blocker: {
              code: "template_sync_preview_failed",
              message: "Template updates could not be prepared. Check the assignment and try again."
            }
          });
        }
      })
      .finally(() => {
        if (isCurrent) setIsPreparingTemplateSync(false);
      });

    return () => {
      isCurrent = false;
    };
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

  useEffect(() => {
    const unsubscribe = window.graiderUI.onAssignmentTemplateSyncProgress((progress) => {
      if (templateSyncProgressActiveRef.current) setTemplateSyncProgress(progress);
    });

    return () => {
      templateSyncProgressActiveRef.current = false;
      unsubscribe();
    };
  }, []);

  const title = getAssignmentTitle(detail, selection.assignmentTitle, selection.assignmentSlug);
  const commandErrorMessage = getCommandErrorMessage(loadResult);
  const gradeStatusCommandErrorMessage = getGradeStatusCommandErrorMessage(gradeStatusLoadResult);
  const showTokenGuidance = detail !== null && hasTokenRequiredReadiness(detail);
  const needsAttentionItems = detail === null ? [] : collectNeedsAttentionItems(detail);
  const canGenerateFacultyReport = hasFacultyReportContext(selection);
  const isSingleTemplateSync = templateSyncTarget?.selectedRepository !== undefined;
  const templateSyncStatusDetail =
    templateSyncProgress === null
      ? isSingleTemplateSync
        ? `Updating ${templateSyncTarget.selectedRepository.studentId} · ${templateSyncTarget.selectedRepository.repository}...`
        : "Synchronizing template changes across student repositories..."
      : `Repository ${templateSyncProgress.current} of ${templateSyncProgress.total} · ${templateSyncProgress.studentId} · ${templateSyncProgress.repository}`;

  // Primary action label depends on lifecycle state: blocked (a readiness item
  // needs attention) takes precedence over apply state, which is otherwise
  // either "not yet applied" (derive the student count and go to apply) or
  // "applied" (go grade). The finer-grained applied/submissions/graded/
  // published split from the design doc is intentionally not implemented here
  // — see the PR report for why.
  const readiness = detail === null ? null : deriveAssignmentReadiness(detail);
  const isBlocked = readiness?.status === "needs_attention";
  // A missing GitHub token is a lesser concern than the readiness checks it
  // merely prevented from running (deriveAssignmentReadiness treats it the
  // same way — see hasNonTokenAttention above) so the primary action features
  // the first non-token blocker when one exists.
  const blockerItem =
    needsAttentionItems.find((item) => item.id !== "github-token-required") ??
    needsAttentionItems[0];
  const primaryHeaderAction =
    detail === null
      ? undefined
      : isBlocked
        ? {
            label:
              blockerItem === undefined
                ? "Review readiness checks"
                : (BLOCKER_FIX_LABELS[blockerItem.id] ?? "Review readiness checks"),
            onClick: () => revealExistingSection("assignment-readiness-title")
          }
        : detail.applyState.status === "applied" || detail.applyState.status === "partially_applied"
          ? {
              label: "Continue grading",
              onClick: () => {
                onPreviewGrade(selection, detail, loadResult);
              }
            }
          : {
              label: `Apply to ${detail.roster?.activeStudentCount ?? 0} student${
                (detail.roster?.activeStudentCount ?? 0) === 1 ? "" : "s"
              }`,
              onClick: () => {
                onPreviewApply(selection, detail, loadResult);
              }
            };

  const assignmentLifecycleSteps: readonly LifecycleStep[] =
    detail === null
      ? []
      : buildAssignmentLifecycleSteps({
          activeStudentCount: detail.roster?.activeStudentCount ?? 0,
          isApplied:
            detail.applyState.status === "applied" ||
            detail.applyState.status === "partially_applied",
          gradingDoneCount:
            gradingLifecycleResult?.status === "success"
              ? gradingLifecycleResult.gradingDoneCount
              : 0,
          publishedCount:
            gradingLifecycleResult?.status === "success"
              ? gradingLifecycleResult.publishedCount
              : 0,
          unknownStatusCount:
            gradingLifecycleResult?.status === "success"
              ? gradingLifecycleResult.unknownStatusCount
              : 0,
          isBlocked,
          blockedDetail:
            blockerItem === undefined
              ? "Review readiness checks"
              : (BLOCKER_FIX_LABELS[blockerItem.id] ?? "Review readiness checks")
        });

  const overflowGroups: readonly OverflowMenuGroup[] =
    detail === null
      ? []
      : [
          {
            id: "assignment",
            heading: "Assignment",
            items: [
              {
                id: "edit-assignment",
                label: "Edit assignment",
                caption: "Change assignment settings, points, and due date.",
                onSelect: onEditAssignment
              },
              {
                id: "group-settings",
                label: "Group settings",
                caption: "Switch between individual and shared group repositories.",
                disabled: groupConfig === null,
                onSelect: () => revealExistingSection("repository-mode-title", ADVANCED_DETAILS_ID)
              },
              {
                id: "student-access-page",
                label: "Student access page",
                caption: "Generate the public page students use to find their repository.",
                disabled: accessPage === null,
                onSelect: () => revealExistingSection("student-repository-access-page-title")
              }
            ]
          },
          {
            id: "repositories",
            heading: "Repositories",
            items: [
              {
                id: "apply-new-students",
                label: "Apply to new students",
                caption: "Create repositories for students not yet applied.",
                onSelect: () => {
                  onPreviewApply(selection, detail, loadResult);
                }
              },
              {
                id: "download-repositories",
                label: "Download student repositories",
                caption: "Clone all student repositories locally.",
                disabled: isDownloadingRepositories,
                onSelect: () => void downloadStudentRepositories()
              }
            ]
          },
          {
            id: "grading-setup",
            heading: "Grading setup",
            items: [
              {
                id: "regenerate-workflow",
                label: "Regenerate grading workflow",
                caption: "View, edit, and push the grading workflow file.",
                disabled: !detail.grading.enabled,
                onSelect: () => revealExistingSection("grade-workflow-title", ADVANCED_DETAILS_ID)
              },
              {
                id: "view-grading-status",
                label: "View grading status",
                caption: "See automated check status for every repository.",
                onSelect: () => {
                  onViewGradeStatus(selection, detail, loadResult);
                }
              }
            ]
          },
          {
            id: "reports",
            heading: "Reports",
            items: [
              {
                id: "faculty-report",
                label: "Faculty report",
                caption: canGenerateFacultyReport
                  ? "Generate and view the faculty report."
                  : "A course folder and assignment file are required to generate a faculty report.",
                disabled: !canGenerateFacultyReport,
                onSelect: () => {
                  onViewFacultyReport(selection, detail, loadResult);
                }
              }
            ]
          },
          {
            id: "danger",
            items: [
              {
                id: "delete-assignment",
                label: "Delete assignment",
                caption: "Remove the local assignment configuration only.",
                destructive: true,
                disabled: isDeleting,
                onSelect: () => {
                  setIsConfirmingDelete(true);
                  setDeleteError(null);
                }
              }
            ]
          }
        ];

  // A blank template repository is a valid assignment configuration (the
  // same fact PR10-1a/PR10-1b established for assignment creation), but
  // repository template-sync genuinely cannot work without one -- it syncs
  // existing repositories toward the template's *latest commit*, which does
  // not exist to sync toward when there is no template
  // (assignment-template-sync-context.ts's `resolveCurrentTemplateCommitSha`
  // requires a real template repository). So this is not a misconfiguration
  // to explain; it is a feature that does not apply to this assignment, and
  // README section 2.1/2.5 say that means hiding the action and its
  // guidance, not showing a disabled button or a failure banner for it.
  const templateSyncNotApplicable = templateSyncAvailability?.blocker?.code === "template_required";

  return (
    <main className="dashboard-shell" aria-label={title}>
      <PageHeader
        eyebrow="Graider"
        title={title}
        meta={getCourseTermSubtitle(detail)}
        secondaryActions={
          detail === null || templateSyncNotApplicable
            ? []
            : [
                {
                  label: isExecutingTemplateSync
                    ? "Updating Student Repositories..."
                    : "Update Student Repositories",
                  disabled:
                    isPreparingTemplateSync ||
                    isExecutingTemplateSync ||
                    templateSyncAvailability?.available !== true ||
                    templateSyncAvailability.repositoryCount === 0,
                  onClick: () => {
                    setTemplateSyncError(null);
                    setTemplateSyncTarget(null);
                    setIsTemplateSyncModalOpen(true);
                  }
                }
              ]
        }
        overflow={
          <>
            {primaryHeaderAction === undefined ? null : (
              <button
                className={isBlocked ? "primary-action primary-action--blocked" : "primary-action"}
                type="button"
                onClick={primaryHeaderAction.onClick}
              >
                {primaryHeaderAction.label}
              </button>
            )}
            <span className="page-header__refresh">
              <button
                className="page-header__refresh-button"
                type="button"
                aria-label="Refresh assignment detail"
                disabled={isLoading}
                onClick={() => {
                  void loadDetail();
                }}
              >
                ↻
              </button>
              <span className="page-header__refresh-status">
                {isLoading ? "Refreshing…" : formatRefreshedAgo(loadResult?.refreshedAt ?? null)}
              </span>
            </span>
            {detail === null ? null : (
              <OverflowMenu groups={overflowGroups} aria-label="More assignment actions" />
            )}
          </>
        }
      />
      {detail === null ? null : <LifecycleStrip steps={assignmentLifecycleSteps} />}
      <ConfirmationWithPreviewModal
        isOpen={isTemplateSyncModalOpen}
        title={
          templateSyncTarget?.selectedRepository === undefined
            ? "Update Student Repositories"
            : `Update repository for ${templateSyncTarget.selectedRepository.studentId}`
        }
        summary={
          <>
            <p>
              Clean template changes are applied automatically. Conflicts create a pull request that
              the student must resolve and merge.
            </p>
            {templateSyncTarget?.selectedRepository === undefined ? (
              <p>
                This will process {templateSyncAvailability?.repositoryCount ?? 0} student
                repositories.
              </p>
            ) : (
              <p>This will update one trusted student repository.</p>
            )}
          </>
        }
        preview={
          <dl className="detail-grid">
            <DetailItem
              label="Template"
              value={
                templateSyncTarget?.templateRepository ??
                templateSyncAvailability?.templateRepository ??
                null
              }
            />
            {templateSyncTarget?.selectedRepository === undefined ? null : (
              <>
                <DetailItem
                  label="Student"
                  value={templateSyncTarget.selectedRepository.studentId}
                />
                <DetailItem
                  label="Repository"
                  value={templateSyncTarget.selectedRepository.repository}
                />
              </>
            )}
            <DetailItem
              label="Recorded revision"
              value={templateSyncAvailability?.recordedTemplateRevision ?? null}
            />
          </dl>
        }
        acknowledgementLabel={
          templateSyncTarget?.selectedRepository === undefined
            ? "I understand this will update student repositories or create pull requests."
            : "I understand this will update this student repository or create a pull request."
        }
        confirmationWord={
          templateSyncTarget?.selectedRepository === undefined
            ? title
            : templateSyncTarget.selectedRepository.studentId
        }
        confirmDisabled={isExecutingTemplateSync}
        confirmLabel={
          templateSyncTarget?.selectedRepository === undefined
            ? "Update repositories"
            : "Update Repository"
        }
        successMessage="Student repositories updated."
        onConfirm={executeTemplateSync}
        onSuccess={(successMessage) => {
          setIsTemplateSyncModalOpen(false);
          showToast(successMessage);
        }}
        onCancel={() => {
          if (!isExecutingTemplateSync) setIsTemplateSyncModalOpen(false);
        }}
      />
      {isExecutingTemplateSync ? (
        <OperationStatusBar
          label={isSingleTemplateSync ? "Updating repository" : "Updating student repositories"}
          detail={templateSyncStatusDetail}
        />
      ) : null}
      {isDownloadingRepositories ? (
        <OperationStatusBar label="Downloading student repositories" />
      ) : null}
      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Delete assignment?"
        summary={
          <p>
            This deletes only the local assignment configuration file. It does not delete GitHub
            repositories, student repositories, GitHub Classroom resources, or other remote
            resources.
          </p>
        }
        confirmationWord={title}
        confirmLabel="Delete assignment"
        isConfirming={isDeleting}
        onConfirm={() => void deleteLocalAssignment()}
        onCancel={() => setIsConfirmingDelete(false)}
      />
      {deleteError === null ? null : (
        <p className="error-message" role="alert">
          {deleteError}
        </p>
      )}
      {repositoryDownloadResult === null ? null : (
        <RepositoryDownloadResultsPanel result={repositoryDownloadResult} />
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
        {templateSyncError === null ? null : (
          <p className="error-message" role="alert">
            {templateSyncError}
          </p>
        )}
        {templateSyncAvailability?.blocker === undefined || templateSyncNotApplicable ? null : (
          <section className="detail-guidance" aria-label="Template update guidance">
            <h2>Student repository updates unavailable</h2>
            <p>{templateSyncAvailability.blocker.message}</p>
          </section>
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
              <div className="assignment-detail__main">
                <AssignmentDetailStudentTable
                  lifecycleResult={gradingLifecycleResult}
                  gradeStatus={gradeStatus}
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
                <details
                  className="detail-panel assignment-detail__advanced"
                  id={ADVANCED_DETAILS_ID}
                >
                  <summary>Advanced details</summary>
                  <p className="assignment-detail__path">
                    Assignment file: {detail.assignment.file}
                  </p>
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
                    <GroupRepositoryModePanel
                      groupConfig={groupConfig}
                      groupMode={groupMode}
                      groupsCsv={groupsCsv}
                      isSavingGroupConfig={isSavingGroupConfig}
                      groupConfigFeedback={groupConfigFeedback}
                      onGroupModeChange={setGroupMode}
                      onGroupsCsvChange={setGroupsCsv}
                      onSave={() => void saveAssignmentGroupConfig()}
                    />
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
                  <DiagnosticsPanel diagnostics={detail.diagnostics} />
                </details>
              </div>
              <aside className="assignment-detail__sidebar">
                <AssignmentFactsPanel detail={detail} />
                <RosterPanel detail={detail} />
                <TechnicalDetails
                  items={buildTechnicalDetailsItems(detail, selection.courseFolderPath)}
                />
              </aside>
            </div>
            {templateSyncResult === null ? null : (
              <TemplateSyncResultsPanel result={templateSyncResult} />
            )}
            <GradeStatusSummaryPanel
              status={gradeStatus}
              isLoading={isLoadingGradeStatus}
              errorMessage={gradeStatusCommandErrorMessage}
              onViewFullGradeStatus={() => {
                onViewGradeStatus(selection, detail, loadResult);
              }}
              canUpdateRepositories={groupConfig?.repositoryMode === "individual"}
              isTemplateSyncPending={isPreparingTemplateSync || isExecutingTemplateSync}
              onUpdateRepository={(studentId) => {
                void prepareSingleRepositoryTemplateSync(studentId);
              }}
            />
          </>
        )}
      </section>
      <Toast message={toastMessage} />
    </main>
  );
};
