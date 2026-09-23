import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
  GradingEditorViewState,
  GradingStudentCommentResult,
  MarkGradingStudentCompleteResult,
  GradingStudentManualAdjustmentResult,
  GradingStudentCommitHistoryResult,
  GradingStudentEvidenceResult,
  GradingStudentWorkflowRepairResult,
  GradingBulkWorkflowRepairResult,
  GradingStudentSnapshotResult,
  GradingStudentViewStateResult,
  GradingWorkspacePrepareRequest,
  BulkPublishGradingStudentReportsResult,
  PublishGradingStudentReportResult,
  PreviewGradingStudentReportResult,
  GradingCommentLibraryMutationResult
} from "../../electron/ipc";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfirmationWithPreviewModal } from "../components/ConfirmationWithPreviewModal";
import { Toast, useToast } from "../components/Toast";
import {
  commitHistoryResultToLoadState,
  type CommitHistoryLoadState
} from "./GradingCommitHistoryPanel";
import {
  evidenceResultToLoadState,
  GradingEvidencePanel,
  type EvidenceLoadState,
  type GradingEvidenceFocusRequest
} from "./GradingEvidencePanel";
import {
  GradingPublishReviewPanel,
  type PublishReviewDetailState,
  type PublishReviewOutcome,
  type PublishReviewPublishedRow,
  type PublishReviewReadyRow
} from "./GradingPublishReviewPanel";
import type { GradingSourceAnnotation } from "./MonacoSourceViewer";
import { filterReusableComments, listReusableCommentTags } from "./commentLibrarySearch";
import { isGradingStudentSourceDto, type CanonicalSourceRange } from "./submissionSourceView";
import { GradingFooterHintBar } from "./GradingFooterHintBar";
import { GradingKeyboardCheatSheetModal } from "./GradingKeyboardCheatSheetModal";
import { GradingProgressHeader } from "./GradingProgressHeader";
import { GradingScorePanel } from "./GradingScorePanel";
import {
  GradingStudentListPane,
  type GradingStudentListEntry,
  type StudentFilterId
} from "./GradingStudentListPane";
import { GradingSubmissionViewerPane, type SourceLoadState } from "./GradingSubmissionViewerPane";
import {
  GradingAppliedCommentsPanel,
  type DeleteCommentConfirmation
} from "./GradingAppliedCommentsPanel";
import {
  GradingManualAdjustmentsPanel,
  type ManualAdjustmentEditorState,
  type DeleteManualAdjustmentConfirmation
} from "./GradingManualAdjustmentsPanel";
import {
  GradingWorkflowRepairPanel,
  type WorkflowRepairState,
  type WorkflowRepairConfirmation,
  type WorkflowRepairNotice,
  type BulkWorkflowRepairState
} from "./GradingWorkflowRepairPanel";
import { GradingCommentEditorForm, type CommentEditorState } from "./GradingCommentEditorForm";
import {
  GradingCommentLibraryBrowser,
  type CommentLibraryLoadState,
  type ReusableComment
} from "./GradingCommentLibraryBrowser";
import {
  emptyReusableCommentEditorValue,
  ReusableCommentEditor,
  type ReusableCommentEditorValue
} from "./ReusableCommentEditor";

type Student = { studentId: string; section: string; gradingStatus: string };
type Ready = {
  status: "success";
  assignment: { title: string; termCode: string; slug: string };
  requiredFiles: string[];
  rubric: { id: string; name: string; points: number }[];
  students: Student[];
};
type PreparationResult = Ready | { status: string; studentId?: string };
const isReady = (value: PreparationResult | null): value is Ready =>
  value?.status === "success" && "students" in value;
const label = (status: string): string =>
  ({
    not_started: "Not Started",
    in_progress: "In Progress",
    complete: "Complete",
    published: "Published"
  })[status] ?? status;

const effectiveGradingStatus = (
  overrides: Readonly<Record<string, string>>,
  studentId: string,
  fallbackStatus: string
): string => overrides[studentId] ?? fallbackStatus;

const UNGRADED_STATUSES: readonly string[] = ["not_started", "in_progress"];

const PUBLISH_REVIEW_DETAIL_CONCURRENCY = 5;

const STUDENT_FILTER_EMPTY_MESSAGE: Readonly<Record<StudentFilterId, string>> = {
  to_grade: "No students need grading right now.",
  graded: "No graded reports are waiting to be published.",
  published: "No reports have been published yet.",
  all: "No assigned students."
};

type Snapshot = Extract<GradingStudentSnapshotResult, { readonly status: "success" }>;
type SnapshotLoadState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly studentId: string }
  | { readonly status: "success"; readonly snapshot: Snapshot }
  | { readonly status: "failure"; readonly studentId: string; readonly message: string };

interface MarkCompleteConfirmation {
  readonly studentId: string;
}

interface ReportPublicationConfirmation {
  readonly studentId: string;
  readonly operation: "publish" | "republish";
}

interface DiscardDraftConfirmation {
  readonly kind: "comment" | "adjustment";
  readonly perform: () => void;
}

interface ReportPublicationNotice {
  readonly studentId: string;
  readonly tone: "success" | "warning" | "error";
  readonly message: string;
  readonly warnings?: readonly string[];
}

type SuccessfulReportPreview = Extract<
  PreviewGradingStudentReportResult,
  { readonly status: "success" }
>;

type ReportPreviewState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly studentId: string }
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly html: string;
      readonly warnings: SuccessfulReportPreview["warnings"];
    }
  | { readonly status: "failure"; readonly studentId: string; readonly message: string };

interface PendingViewStateSave {
  readonly studentId: string;
  readonly viewState: GradingEditorViewState;
}

type LibraryEditorState =
  | {
      readonly operation: "create";
      readonly value: ReusableCommentEditorValue;
      readonly promotion?: PromotionOffer;
    }
  | {
      readonly operation: "edit";
      readonly commentId: string;
      readonly value: ReusableCommentEditorValue;
    };

interface PromotionOffer {
  readonly studentId: string;
  readonly appliedCommentId: string;
  readonly value: ReusableCommentEditorValue;
}

const workflowRepairUnavailableMessage = (status: string): string => {
  const messages: Readonly<Record<string, string>> = {
    grading_not_eligible:
      "Workflow repair is unavailable for this assignment's grading configuration.",
    repository_not_recorded:
      "Workflow repair is unavailable because this student has no recorded repository.",
    repository_unavailable:
      "Workflow repair is unavailable because the recorded repository could not be verified.",
    github_auth_unavailable:
      "Workflow repair is unavailable because GitHub authentication could not be resolved.",
    student_not_accessible: "Workflow repair is unavailable for this student.",
    assignment_config_error:
      "Workflow repair is unavailable because assignment configuration could not be read."
  };
  return messages[status] ?? "Workflow repair is currently unavailable.";
};

const workflowRepairResultNotice = (
  result: Extract<GradingStudentWorkflowRepairResult, { readonly status: "success" }>
): WorkflowRepairNotice => {
  const workflowMessages: Readonly<Record<string, string>> = {
    created: "Graider workflow created.",
    replaced_managed: "Outdated Graider workflow replaced.",
    replaced_unmanaged: "Unmanaged workflow replaced with the Graider workflow.",
    replaced_unsupported:
      "Unsupported managed workflow replaced with the current Graider workflow.",
    already_current: "Graider workflow was already current.",
    write_failed: "Workflow write failed. No grading run was started.",
    read_failed: "The existing workflow could not be read. No grading run was started.",
    not_attempted: "Workflow repair was not attempted."
  };
  const workflowMessage =
    workflowMessages[result.result.workflow.status] ?? "Workflow repair finished.";
  if (result.result.dispatch.status === "dispatched")
    return {
      studentId: result.studentId,
      tone: "success",
      message: `${workflowMessage} Grading run dispatched successfully.`
    };
  if (
    result.result.dispatch.status === "failed" &&
    result.result.workflow.status !== "read_failed" &&
    result.result.workflow.status !== "write_failed" &&
    result.result.workflow.status !== "not_attempted"
  )
    return {
      studentId: result.studentId,
      tone: "warning",
      message: `${workflowMessage} Workflow repair succeeded, but the grading run could not be started.`
    };
  return { studentId: result.studentId, tone: "error", message: workflowMessage };
};

export const VIEW_STATE_AUTOSAVE_DEBOUNCE_MS = 400;

const submissionChangedWarning =
  "The local submission changed after grading state was created. Existing grading state was not modified. Editor position restoration and autosave are disabled for this student.";

const viewStateFailureMessage = (result: GradingStudentViewStateResult | undefined): string => {
  const messages: Readonly<Record<string, string>> = {
    repository_not_recorded:
      "This student's local repository is not recorded, so editor position could not be loaded or saved.",
    repository_unavailable:
      "This student's local repository is unavailable, so editor position could not be loaded or saved.",
    registry_error: "The local repository registry could not be read safely.",
    submission_commit_unavailable:
      "The local submission commit could not be verified, so editor position was not loaded or saved.",
    grading_state_error:
      "Grading state could not be read or saved safely. Existing grading state was not modified.",
    student_not_accessible: "This student is not accessible to the current faculty member.",
    faculty_identity_required: "Configure your local faculty MSOE username before grading.",
    no_assigned_sections: "Your faculty username is not assigned to sections for this term.",
    roster_error: "Roster data must be corrected before editor position can be saved.",
    term_config_error: "Term configuration could not be read safely."
  };
  return result?.status === "submission_changed"
    ? submissionChangedWarning
    : (messages[result?.status ?? ""] ?? "Editor position could not be loaded or saved safely.");
};

const sourceFailureMessage = (value: unknown): string => {
  const status =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>).status
      : undefined;
  const messages: Readonly<Record<string, string>> = {
    repository_not_recorded:
      "Download this student's repository through Graider before grading source can be shown.",
    repository_unavailable:
      "The downloaded repository is no longer available. Download it again through Graider.",
    registry_error: "The local repository registry could not be read.",
    student_not_accessible: "This student is not accessible to the current faculty member.",
    faculty_identity_required: "Configure your local faculty MSOE username before grading.",
    no_assigned_sections: "Your faculty username is not assigned to sections for this term.",
    roster_error: "Roster data must be corrected before source can be shown.",
    submission_commit_unavailable:
      "The local submission commit could not be verified, so source is unavailable.",
    grading_state_error: "Grading state could not be read safely, so source is unavailable.",
    assignment_config_error: "Assignment configuration could not be read.",
    source_error: "The configured source files could not be loaded safely."
  };
  if (status === "submission_changed") return snapshotSubmissionChangedWarning;
  return typeof status === "string"
    ? (messages[status] ?? "Student source could not be loaded.")
    : "Student source could not be loaded.";
};

const snapshotSubmissionChangedWarning =
  "The local submission changed after grading state was created. Existing grading state belongs to a different local submission and is not being applied.";

const snapshotFailureMessage = (result: GradingStudentSnapshotResult | undefined): string => {
  if (result?.status === "submission_changed") return snapshotSubmissionChangedWarning;
  if (result?.status === "grading_state_error" && result.code === "rubric_category_mismatch")
    return "Grading state references a rubric category that is no longer configured.";
  const messages: Readonly<Record<string, string>> = {
    repository_not_recorded:
      "Download this student's repository through Graider before grading details can be shown.",
    repository_unavailable:
      "The downloaded repository is no longer available. Download it again through Graider.",
    registry_error: "The local repository registry could not be read safely.",
    submission_commit_unavailable:
      "The local submission commit could not be verified, so grading details were not loaded.",
    grading_state_error: "Grading state could not be read safely.",
    student_not_accessible: "This student is not accessible to the current faculty member.",
    faculty_identity_required: "Configure your local faculty MSOE username before grading.",
    no_assigned_sections: "Your faculty username is not assigned to sections for this term.",
    roster_error: "Roster data must be corrected before grading details can be shown.",
    term_config_error: "Term configuration could not be read safely.",
    assignment_config_error: "Assignment configuration could not be read safely."
  };
  return messages[result?.status ?? ""] ?? "Grading details could not be loaded safely.";
};

const gradingMutationFailureMessage = (
  result:
    | GradingStudentCommentResult
    | GradingStudentManualAdjustmentResult
    | MarkGradingStudentCompleteResult
    | undefined
): string => {
  if (result?.status === "submission_changed") return snapshotSubmissionChangedWarning;
  const code = "code" in (result ?? {}) ? (result as { readonly code?: string }).code : undefined;
  const codeMessages: Readonly<Record<string, string>> = {
    rubric_category_mismatch: "The selected rubric category is no longer configured.",
    source_location_mismatch:
      "The selected source location is no longer valid for this assignment.",
    duplicate_applied_comment_id:
      "That comment could not be uniquely recorded. Try applying it again."
  };
  if (code !== undefined && codeMessages[code] !== undefined) return codeMessages[code];
  const messages: Readonly<Record<string, string>> = {
    repository_not_recorded:
      "Download this student's repository through Graider before applying grading feedback.",
    repository_unavailable:
      "The downloaded repository is unavailable, so grading feedback was not applied.",
    registry_error: "The local repository registry could not be read safely.",
    submission_commit_unavailable:
      "The local submission commit could not be verified, so grading feedback was not applied.",
    grading_state_error: "Grading state could not be updated safely.",
    assignment_config_error: "Assignment configuration could not be read safely.",
    student_not_accessible: "This student is not accessible to the current faculty member.",
    faculty_identity_required: "Configure your local faculty MSOE username before grading.",
    no_assigned_sections: "Your faculty username is not assigned to sections for this term.",
    roster_error: "Roster data must be corrected before applying grading feedback.",
    term_config_error: "Term configuration could not be read safely.",
    not_found: "The selected grading record could not be found."
  };
  return messages[result?.status ?? ""] ?? "The grading change could not be applied safely.";
};

const publicationWarningMessage = (warning: string): string =>
  ({
    automated_evidence_unavailable: "The report was published without automated evidence.",
    automated_evidence_invalid:
      "The report was published without automated evidence because the available evidence could not be trusted.",
    commit_history_unavailable: "The report was published without commit history."
  })[warning] ?? "The report was published with an informational warning.";

const previewWarningMessage = (warning: string): string =>
  ({
    automated_evidence_unavailable: "Automated evidence is unavailable and will be omitted.",
    automated_evidence_invalid:
      "Available automated evidence could not be trusted and will be omitted.",
    commit_history_unavailable: "Commit history is unavailable and will be omitted."
  })[warning] ?? "This preview includes an informational warning.";

const publicationFailureMessage = (result: PublishGradingStudentReportResult): string => {
  const messages: Readonly<Record<string, string>> = {
    grading_state_missing: "Complete this student's grading before publishing the report.",
    grading_not_complete: "Mark this student's grading Complete before publishing the report.",
    grading_state_error: "Grading state could not be read safely for publication.",
    assignment_config_error: "Assignment configuration could not be read safely for publication.",
    source_unavailable:
      "The trusted submission source is unavailable, so the report was not published.",
    repository_not_recorded:
      "The student's repository is not recorded, so the report was not published.",
    repository_unavailable:
      "The student's repository is unavailable, so the report was not published.",
    registry_error: "The local repository registry could not be read safely.",
    submission_commit_unavailable:
      "The submission commit could not be verified, so the report was not published.",
    report_destination_unavailable:
      "A Graider report destination is not configured for this assignment.",
    unsafe_report_destination:
      "The configured report destination is unsafe, so the report was not published.",
    github_auth_unavailable:
      "GitHub authentication is unavailable. Check the configured GitHub token and try again.",
    report_write_permission_unavailable:
      "Graider cannot publish the report because the GitHub token lacks repository Contents write permission.",
    report_render_failed: "The grading report could not be rendered safely.",
    report_publish_failed: "The grading report could not be published safely.",
    faculty_identity_required: "Configure your local faculty MSOE username before publishing.",
    no_assigned_sections: "Your faculty username is not assigned to sections for this term.",
    student_not_accessible: "This student is not accessible to the current faculty member.",
    roster_error: "Roster data must be corrected before publishing.",
    term_config_error: "Term configuration could not be read safely."
  };
  return messages[result.status] ?? "The grading report could not be published safely.";
};

const bulkPublicationResultLabel = (result: PublishGradingStudentReportResult): string => {
  if (result.status === "success") {
    const base = result.remoteWrite === "unchanged" ? "Already up to date" : "Published";
    return result.warnings.length === 0 ? base : `${base} with warnings`;
  }
  if (result.status === "publication_state_record_failed")
    return "Report published; Published status not recorded";
  if (result.status === "publication_stale") return "Publication stale";
  if (result.status === "submission_changed") return "Submission changed";
  if (result.status === "grading_not_complete" || result.status === "grading_state_missing")
    return "Not eligible";
  return `Failed: ${publicationFailureMessage(result)}`;
};

const publishReviewOutcomeTone = (
  result: PublishGradingStudentReportResult
): "success" | "warning" | "error" => {
  if (result.status === "success") return result.warnings.length === 0 ? "success" : "warning";
  if (
    result.status === "publication_state_record_failed" ||
    result.status === "publication_stale" ||
    result.status === "submission_changed"
  )
    return "warning";
  return "error";
};

const publishReviewOutcomeFromResult = (
  result: PublishGradingStudentReportResult
): PublishReviewOutcome => ({
  tone: publishReviewOutcomeTone(result),
  message: bulkPublicationResultLabel(result),
  warnings: result.status === "success" ? result.warnings.map(publicationWarningMessage) : []
});

const scoreSummaryLabel = (grade: Snapshot["grade"]): string =>
  grade.categories.length === 0
    ? "No rubric — enter a score manually"
    : `${grade.totalScore} / ${grade.pointsPossible}`;

const reportContentSummaryLabel = (studentSnapshot: Snapshot): string => {
  const commentCount = studentSnapshot.appliedComments.length;
  const adjustmentCount = studentSnapshot.manualAdjustments.length;
  if (commentCount === 0 && adjustmentCount === 0) return "No comments or adjustments yet";
  const parts: string[] = [];
  if (commentCount > 0)
    parts.push(`${commentCount} ${commentCount === 1 ? "comment" : "comments"}`);
  if (adjustmentCount > 0)
    parts.push(`${adjustmentCount} manual ${adjustmentCount === 1 ? "adjustment" : "adjustments"}`);
  return parts.join(" · ");
};

const signedAmount = (amount: number): string => (amount > 0 ? `+${amount}` : String(amount));

const sourceLocationLabel = (location: {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}): string =>
  location.startLine === location.endLine
    ? `${location.file}, line ${location.startLine}`
    : `${location.file}, lines ${location.startLine}–${location.endLine}`;

const sourceTargetLabel = (location: CanonicalSourceRange): string =>
  location.startLine === location.endLine
    ? `${location.file}: ${location.startLine}`
    : `${location.file}: ${location.startLine}-${location.endLine}`;

const isGradingShortcutSuppressedTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest(".grading-source-editor") !== null) return false;
  if (target.closest(".grading-comment-formatting-controls") !== null) return true;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
};

export const GradingWorkspacePage = ({
  request
}: {
  request: GradingWorkspacePrepareRequest;
}): ReactElement => {
  const [result, setResult] = useState<PreparationResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [studentFilter, setStudentFilter] = useState<StudentFilterId>("to_grade");
  const [source, setSource] = useState<SourceLoadState>({ status: "idle" });
  const [snapshot, setSnapshot] = useState<SnapshotLoadState>({ status: "idle" });
  const [evidence, setEvidence] = useState<EvidenceLoadState>({ status: "idle" });
  const [commitHistory, setCommitHistory] = useState<CommitHistoryLoadState>({ status: "idle" });
  const [workflowRepair, setWorkflowRepair] = useState<WorkflowRepairState>({ status: "idle" });
  const [workflowRepairConfirmation, setWorkflowRepairConfirmation] =
    useState<WorkflowRepairConfirmation>();
  const [workflowRepairNotice, setWorkflowRepairNotice] = useState<WorkflowRepairNotice>();
  const [bulkWorkflowRepairState, setBulkWorkflowRepairState] =
    useState<BulkWorkflowRepairState>("idle");
  const [bulkWorkflowRepairConfirmation, setBulkWorkflowRepairConfirmation] = useState(false);
  const [bulkWorkflowRepairResult, setBulkWorkflowRepairResult] =
    useState<GradingBulkWorkflowRepairResult>();
  const [commentLibrary, setCommentLibrary] = useState<CommentLibraryLoadState>({
    status: "loading"
  });
  const [commentSearch, setCommentSearch] = useState("");
  const [selectedCommentTags, setSelectedCommentTags] = useState<readonly string[]>([]);
  const [libraryEditor, setLibraryEditor] = useState<LibraryEditorState>();
  const [promotionOffer, setPromotionOffer] = useState<PromotionOffer>();
  const [libraryDeleteConfirmation, setLibraryDeleteConfirmation] = useState<ReusableComment>();
  const [libraryMutationPending, setLibraryMutationPending] = useState(false);
  const [libraryMutationMessage, setLibraryMutationMessage] = useState<string>();
  const [canonicalSourceTarget, setCanonicalSourceTarget] = useState<CanonicalSourceRange>();
  const [commentEditor, setCommentEditor] = useState<CommentEditorState>();
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteCommentConfirmation>();
  const [manualAdjustmentEditor, setManualAdjustmentEditor] =
    useState<ManualAdjustmentEditorState>();
  const [deleteManualAdjustmentConfirmation, setDeleteManualAdjustmentConfirmation] =
    useState<DeleteManualAdjustmentConfirmation>();
  const [markCompleteConfirmation, setMarkCompleteConfirmation] =
    useState<MarkCompleteConfirmation>();
  const [reportPublicationConfirmation, setReportPublicationConfirmation] =
    useState<ReportPublicationConfirmation>();
  const [reportPublicationStudentId, setReportPublicationStudentId] = useState<string>();
  const [reportPublicationNotice, setReportPublicationNotice] = useState<ReportPublicationNotice>();
  const [discardDraftConfirmation, setDiscardDraftConfirmation] =
    useState<DiscardDraftConfirmation>();
  const { message: toastMessage, showToast } = useToast();
  const [reportPreview, setReportPreview] = useState<ReportPreviewState>({ status: "idle" });
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [publishReviewSelectedIds, setPublishReviewSelectedIds] = useState<readonly string[]>([]);
  const [publishReviewDetails, setPublishReviewDetails] = useState<
    Readonly<Record<string, PublishReviewDetailState>>
  >({});
  const [publishReviewRunning, setPublishReviewRunning] = useState(false);
  const [publishReviewResults, setPublishReviewResults] =
    useState<BulkPublishGradingStudentReportsResult["results"]>();
  const [publishReviewRefreshFailedStudentIds, setPublishReviewRefreshFailedStudentIds] = useState<
    readonly string[]
  >([]);
  const [gradingMutationError, setGradingMutationError] = useState<string>();
  const [gradingMutationStudentId, setGradingMutationStudentId] = useState<string>();
  const [studentStatusOverrides, setStudentStatusOverrides] = useState<
    Readonly<Record<string, string>>
  >({});
  const [viewStateWarnings, setViewStateWarnings] = useState<Readonly<Record<string, string>>>({});
  const [evidencePanelOpen, setEvidencePanelOpen] = useState(false);
  const [evidenceFocusRequest, setEvidenceFocusRequest] = useState<GradingEvidenceFocusRequest>();
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const filterPillsContainerRef = useRef<HTMLDivElement>(null);
  const evidencePanelPriorFocusRef = useRef<HTMLElement | null>(null);
  const commentEditorBaseline = useRef<CommentEditorState | undefined>(undefined);
  const manualAdjustmentEditorBaseline = useRef<ManualAdjustmentEditorState | undefined>(undefined);
  const sourceRequestGeneration = useRef(0);
  const snapshotRequestGeneration = useRef(0);
  const evidenceRequestGeneration = useRef(0);
  const commitHistoryRequestGeneration = useRef(0);
  const workflowRepairRequestGeneration = useRef(0);
  const reportPublicationRequestGeneration = useRef(0);
  const reportPreviewRequestGeneration = useRef(0);
  const bulkPublicationRequestGeneration = useRef(0);
  const publishReviewDetailGeneration = useRef(0);
  const currentStudentId = isReady(result) ? result.students[selected]?.studentId : undefined;
  const currentStudentIdRef = useRef<string | undefined>(currentStudentId);
  const pendingViewStateSaves = useRef(new Map<string, GradingEditorViewState>());
  const autosaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const viewStateSavePromises = useRef(new Map<string, Promise<void>>());
  const gradingMutationStudents = useRef(new Set<string>());
  const gradingMutationBlockedStudents = useRef(new Set<string>());
  const autosaveBlockedStudents = useRef(new Set<string>());
  const mounted = useRef(true);
  currentStudentIdRef.current = currentStudentId;

  useEffect(() => {
    setPromotionOffer((current) =>
      current === undefined || current.studentId === currentStudentId ? current : undefined
    );
  }, [currentStudentId]);

  const setStudentWarning = useCallback((studentId: string, message?: string): void => {
    if (!mounted.current) return;
    setViewStateWarnings((current) => {
      if (message === undefined) {
        if (!(studentId in current)) return current;
        const next = { ...current };
        delete next[studentId];
        return next;
      }
      return current[studentId] === message ? current : { ...current, [studentId]: message };
    });
  }, []);

  const cancelPendingForStudent = useCallback((studentId: string): void => {
    pendingViewStateSaves.current.delete(studentId);
    const timer = autosaveTimers.current.get(studentId);
    if (timer !== undefined) clearTimeout(timer);
    autosaveTimers.current.delete(studentId);
  }, []);

  const persistViewState = useCallback(
    (pending: PendingViewStateSave): Promise<void> => {
      if (autosaveBlockedStudents.current.has(pending.studentId)) return Promise.resolve();
      const operation = window.graiderUI
        .saveGradingStudentViewState({
          courseFolderId: request.courseFolderId,
          courseFolderPath: request.courseFolderPath,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          studentId: pending.studentId,
          viewState: pending.viewState
        })
        .then((saveResult) => {
          if (saveResult.status === "success") {
            setStudentWarning(pending.studentId);
            return;
          }
          if (saveResult.status === "submission_changed") {
            autosaveBlockedStudents.current.add(pending.studentId);
            gradingMutationBlockedStudents.current.add(pending.studentId);
            cancelPendingForStudent(pending.studentId);
          }
          setStudentWarning(pending.studentId, viewStateFailureMessage(saveResult));
        })
        .catch(() => {
          setStudentWarning(
            pending.studentId,
            "Editor position could not be saved safely. The source viewer remains read-only."
          );
        });
      viewStateSavePromises.current.set(pending.studentId, operation);
      void operation.finally(() => {
        if (viewStateSavePromises.current.get(pending.studentId) === operation)
          viewStateSavePromises.current.delete(pending.studentId);
      });
      return operation;
    },
    [
      cancelPendingForStudent,
      request.assignmentSlug,
      request.courseFolderId,
      request.courseFolderPath,
      request.termCode,
      setStudentWarning
    ]
  );

  const flushPendingViewState = useCallback(
    async (studentId?: string, forceDuringGradingMutation = false): Promise<void> => {
      const studentIds =
        studentId === undefined
          ? [
              ...new Set([
                ...pendingViewStateSaves.current.keys(),
                ...autosaveTimers.current.keys()
              ])
            ]
          : [studentId];
      await Promise.all(
        studentIds.map(async (pendingStudentId) => {
          const timer = autosaveTimers.current.get(pendingStudentId);
          if (timer !== undefined) clearTimeout(timer);
          autosaveTimers.current.delete(pendingStudentId);
          const inFlight = viewStateSavePromises.current.get(pendingStudentId);
          if (inFlight !== undefined) await inFlight;
          const pending = pendingViewStateSaves.current.get(pendingStudentId);
          if (
            pending !== undefined &&
            (forceDuringGradingMutation || !gradingMutationStudents.current.has(pendingStudentId))
          ) {
            pendingViewStateSaves.current.delete(pendingStudentId);
            await persistViewState({ studentId: pendingStudentId, viewState: pending });
          }
        })
      );
    },
    [persistViewState]
  );

  const scheduleViewStateSave = useCallback(
    (studentId: string, viewState: GradingEditorViewState): void => {
      if (
        currentStudentIdRef.current !== studentId ||
        autosaveBlockedStudents.current.has(studentId)
      )
        return;
      pendingViewStateSaves.current.set(studentId, viewState);
      const existingTimer = autosaveTimers.current.get(studentId);
      if (existingTimer !== undefined) clearTimeout(existingTimer);
      autosaveTimers.current.delete(studentId);
      if (gradingMutationStudents.current.has(studentId)) return;
      const timer = setTimeout(() => {
        autosaveTimers.current.delete(studentId);
        const pending = pendingViewStateSaves.current.get(studentId);
        pendingViewStateSaves.current.delete(studentId);
        if (pending !== undefined) void persistViewState({ studentId, viewState: pending });
      }, VIEW_STATE_AUTOSAVE_DEBOUNCE_MS);
      autosaveTimers.current.set(studentId, timer);
    },
    [persistViewState]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void flushPendingViewState();
    };
  }, [flushPendingViewState]);

  useEffect(() => {
    void window.graiderUI.prepareGradingWorkspace(request).then((value) => {
      setSelected(0);
      setStudentStatusOverrides({});
      setResult(value as PreparationResult);
    });
  }, [request]);

  useEffect(() => {
    let active = true;
    setCommentLibrary({ status: "loading" });
    setCommentSearch("");
    setSelectedCommentTags([]);
    const loadLibrary = window.graiderUI.loadGradingCommentLibrary;
    if (loadLibrary === undefined) {
      setCommentLibrary({
        status: "failure",
        message: "The shared comment library is unavailable."
      });
      return () => {
        active = false;
      };
    }
    void loadLibrary({ courseFolderId: request.courseFolderId, termCode: request.termCode })
      .then((value) => {
        if (!active) return;
        if (value.status === "success" && "comments" in value) {
          setCommentLibrary({ status: "success", comments: value.comments });
          return;
        }
        setCommentLibrary({
          status: "failure",
          message: "The shared comment library could not be loaded safely."
        });
      })
      .catch(() => {
        if (active)
          setCommentLibrary({
            status: "failure",
            message: "The shared comment library could not be loaded safely."
          });
      });
    return () => {
      active = false;
    };
  }, [request.courseFolderId, request.termCode]);

  const selectedStudent = isReady(result) ? result.students[selected] : undefined;

  useEffect(() => {
    const generation = workflowRepairRequestGeneration.current + 1;
    workflowRepairRequestGeneration.current = generation;
    setWorkflowRepairConfirmation(undefined);
    setWorkflowRepairNotice(undefined);
    if (!isReady(result) || selectedStudent === undefined) {
      setWorkflowRepair({ status: "idle" });
      return;
    }
    const studentId = selectedStudent.studentId;
    const repair = window.graiderUI.repairGradingStudentWorkflow;
    if (repair === undefined) {
      setWorkflowRepair({
        status: "unavailable",
        studentId,
        message: "Workflow repair is unavailable in this application build."
      });
      return;
    }
    setWorkflowRepair({ status: "loading", studentId });
    void repair({
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId,
      confirmed: false
    })
      .then((value) => {
        if (
          !mounted.current ||
          workflowRepairRequestGeneration.current !== generation ||
          currentStudentIdRef.current !== studentId
        )
          return;
        setWorkflowRepair(
          value.status === "ready" && value.studentId === studentId
            ? {
                status: "ready",
                studentId,
                repositoryFullName: value.repositoryFullName
              }
            : {
                status: "unavailable",
                studentId,
                message: workflowRepairUnavailableMessage(value.status)
              }
        );
      })
      .catch(() => {
        if (
          workflowRepairRequestGeneration.current === generation &&
          currentStudentIdRef.current === studentId
        )
          setWorkflowRepair({
            status: "unavailable",
            studentId,
            message: "Workflow repair availability could not be checked safely."
          });
      });
  }, [request, result, selectedStudent]);

  const confirmWorkflowRepair = async (): Promise<void> => {
    const confirmation = workflowRepairConfirmation;
    const repair = window.graiderUI.repairGradingStudentWorkflow;
    if (
      confirmation === undefined ||
      repair === undefined ||
      confirmation.studentId !== currentStudentIdRef.current
    ) {
      // Stale, or the repair API is unavailable. Both are unreachable in
      // practice today -- this modal only opens once openWorkflowRepairConfirmation
      // has already confirmed workflowRepair.status is "ready", which itself
      // requires repair !== undefined, and window.graiderUI does not change
      // mid-session -- but the guard stays as defence in depth. See
      // confirmPublishReport's identical stale case above for why this
      // closes without a notice: workflowRepairNotice is scoped to a
      // student id the user may no longer be viewing.
      setWorkflowRepairConfirmation(undefined);
      return;
    }
    const generation = workflowRepairRequestGeneration.current + 1;
    workflowRepairRequestGeneration.current = generation;
    setWorkflowRepair({ status: "running", ...confirmation });
    setWorkflowRepairNotice(undefined);
    let value: GradingStudentWorkflowRepairResult;
    try {
      value = await repair({
        courseFolderId: request.courseFolderId,
        courseFolderPath: request.courseFolderPath,
        termCode: request.termCode,
        assignmentSlug: request.assignmentSlug,
        studentId: confirmation.studentId,
        confirmed: true
      });
    } catch {
      if (
        mounted.current &&
        workflowRepairRequestGeneration.current === generation &&
        currentStudentIdRef.current === confirmation.studentId
      ) {
        setWorkflowRepairConfirmation(undefined);
        setWorkflowRepairNotice({
          studentId: confirmation.studentId,
          tone: "error",
          message: "Workflow repair could not be completed safely."
        });
        setWorkflowRepair({ status: "ready", ...confirmation });
      }
      return;
    }
    if (
      !mounted.current ||
      workflowRepairRequestGeneration.current !== generation ||
      currentStudentIdRef.current !== confirmation.studentId
    )
      return;
    setWorkflowRepairConfirmation(undefined);
    if (value.status === "success" && value.studentId === confirmation.studentId) {
      setWorkflowRepairNotice(workflowRepairResultNotice(value));
      setWorkflowRepair({
        status: "ready",
        studentId: confirmation.studentId,
        repositoryFullName: value.result.repository.fullName
      });
      return;
    }
    setWorkflowRepairNotice({
      studentId: confirmation.studentId,
      tone: "error",
      message: workflowRepairUnavailableMessage(value.status)
    });
    setWorkflowRepair({
      status: "unavailable",
      studentId: confirmation.studentId,
      message: workflowRepairUnavailableMessage(value.status)
    });
  };

  const confirmBulkWorkflowRepair = async (): Promise<void> => {
    const repair = window.graiderUI.repairGradingAssignmentWorkflows;
    if (repair === undefined) return;
    setBulkWorkflowRepairState("running");
    setBulkWorkflowRepairConfirmation(false);
    try {
      setBulkWorkflowRepairResult(
        await repair({
          courseFolderId: request.courseFolderId,
          courseFolderPath: request.courseFolderPath,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          confirmed: true
        })
      );
    } finally {
      if (mounted.current) setBulkWorkflowRepairState("idle");
    }
  };
  const studentsWithStatus = useMemo(
    () =>
      isReady(result)
        ? result.students.map((candidate, index) => ({
            student: candidate,
            index,
            status: effectiveGradingStatus(
              studentStatusOverrides,
              candidate.studentId,
              candidate.gradingStatus
            )
          }))
        : [],
    [result, studentStatusOverrides]
  );
  const completeStudentIds = useMemo(
    () =>
      studentsWithStatus
        .filter((entry) => entry.status === "complete")
        .map((entry) => entry.student.studentId),
    [studentsWithStatus]
  );
  const publishReviewReadyEntries = useMemo(
    () =>
      studentsWithStatus
        .filter((entry) => entry.status === "complete")
        .map((entry) => ({ studentId: entry.student.studentId, section: entry.student.section })),
    [studentsWithStatus]
  );
  const publishReviewPublishedEntries = useMemo(
    () =>
      studentsWithStatus
        .filter((entry) => entry.status === "published")
        .map((entry) => ({ studentId: entry.student.studentId, section: entry.student.section })),
    [studentsWithStatus]
  );
  const toGradeCount = studentsWithStatus.filter((entry) =>
    UNGRADED_STATUSES.includes(entry.status)
  ).length;
  const gradedOnlyCount = studentsWithStatus.filter((entry) => entry.status === "complete").length;
  const publishedCount = studentsWithStatus.filter((entry) => entry.status === "published").length;
  const allStudentsCount = studentsWithStatus.length;
  const gradedOrPublishedCount = gradedOnlyCount + publishedCount;
  const filteredStudents = useMemo(
    () =>
      studentsWithStatus.filter((entry) => {
        if (studentFilter === "all") return true;
        if (studentFilter === "to_grade") return UNGRADED_STATUSES.includes(entry.status);
        if (studentFilter === "graded") return entry.status === "complete";
        return entry.status === "published";
      }),
    [studentsWithStatus, studentFilter]
  );
  const nextStudentNeedingGradingIndex = useMemo(() => {
    const total = studentsWithStatus.length;
    if (total === 0) return undefined;
    const searchOrder = Array.from(
      { length: total - 1 },
      (_, offset) => (selected + offset + 1) % total
    );
    return searchOrder.find((index) =>
      UNGRADED_STATUSES.includes(studentsWithStatus[index]?.status ?? "")
    );
  }, [studentsWithStatus, selected]);
  const loadEvidence = useCallback(
    async (studentId: string): Promise<void> => {
      const generation = evidenceRequestGeneration.current + 1;
      evidenceRequestGeneration.current = generation;
      setEvidence({ status: "loading", studentId });
      const loader = window.graiderUI.loadGradingStudentEvidence;
      if (loader === undefined) {
        setEvidence({ status: "not_applicable" });
        return;
      }
      try {
        const value: GradingStudentEvidenceResult = await loader({
          courseFolderId: request.courseFolderId,
          courseFolderPath: request.courseFolderPath,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          studentId
        });
        if (
          !mounted.current ||
          evidenceRequestGeneration.current !== generation ||
          currentStudentIdRef.current !== studentId
        )
          return;
        setEvidence(evidenceResultToLoadState(value, studentId));
      } catch {
        if (
          !mounted.current ||
          evidenceRequestGeneration.current !== generation ||
          currentStudentIdRef.current !== studentId
        )
          return;
        setEvidence({
          status: "message",
          studentId,
          message: "Automated evidence could not be trusted or read. You can continue grading.",
          tone: "warning"
        });
      }
    },
    [request.assignmentSlug, request.courseFolderId, request.courseFolderPath, request.termCode]
  );

  useEffect(() => {
    if (!isReady(result) || selectedStudent === undefined) {
      evidenceRequestGeneration.current += 1;
      setEvidence({ status: "idle" });
      return;
    }
    void loadEvidence(selectedStudent.studentId);
  }, [loadEvidence, result, selectedStudent]);

  useEffect(() => {
    const generation = commitHistoryRequestGeneration.current + 1;
    commitHistoryRequestGeneration.current = generation;
    if (!isReady(result) || selectedStudent === undefined) {
      setCommitHistory({ status: "idle" });
      return;
    }
    const studentId = selectedStudent.studentId;
    setCommitHistory({ status: "loading", studentId });
    const loader = window.graiderUI.loadGradingStudentCommitHistory;
    if (loader === undefined) {
      setCommitHistory({ status: "idle" });
      return;
    }
    void loader({
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId
    })
      .then((value: GradingStudentCommitHistoryResult) => {
        if (
          !mounted.current ||
          commitHistoryRequestGeneration.current !== generation ||
          currentStudentIdRef.current !== studentId
        )
          return;
        setCommitHistory(commitHistoryResultToLoadState(value, studentId));
      })
      .catch(() => {
        if (
          !mounted.current ||
          commitHistoryRequestGeneration.current !== generation ||
          currentStudentIdRef.current !== studentId
        )
          return;
        setCommitHistory({
          status: "message",
          studentId,
          message: "Commit history could not be loaded safely.",
          tone: "warning"
        });
      });
  }, [
    request.assignmentSlug,
    request.courseFolderId,
    request.courseFolderPath,
    request.termCode,
    result,
    selectedStudent
  ]);

  useEffect(() => {
    const generation = snapshotRequestGeneration.current + 1;
    snapshotRequestGeneration.current = generation;
    if (!isReady(result) || selectedStudent === undefined) {
      setSnapshot({ status: "idle" });
      return;
    }
    const studentId = selectedStudent.studentId;
    setSnapshot({ status: "loading", studentId });
    const loadSnapshot = window.graiderUI.loadGradingStudentSnapshot;
    if (loadSnapshot === undefined) {
      setSnapshot({
        status: "failure",
        studentId,
        message: "Grading details are unavailable."
      });
      return;
    }
    void loadSnapshot({
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId
    })
      .then((value) => {
        if (snapshotRequestGeneration.current !== generation) return;
        if (value.status === "success" && value.studentId === studentId) {
          gradingMutationBlockedStudents.current.delete(studentId);
          setSnapshot({ status: "success", snapshot: value });
          setStudentStatusOverrides((current) =>
            current[studentId] === value.gradingStatus
              ? current
              : { ...current, [studentId]: value.gradingStatus }
          );
          return;
        }
        if (value.status === "submission_changed") {
          gradingMutationBlockedStudents.current.add(studentId);
          autosaveBlockedStudents.current.add(studentId);
          cancelPendingForStudent(studentId);
        }
        setSnapshot({
          status: "failure",
          studentId,
          message: snapshotFailureMessage(value)
        });
      })
      .catch(() => {
        if (snapshotRequestGeneration.current !== generation) return;
        setSnapshot({
          status: "failure",
          studentId,
          message: "Grading details could not be loaded safely."
        });
      });
  }, [
    cancelPendingForStudent,
    request.assignmentSlug,
    request.courseFolderId,
    request.courseFolderPath,
    request.termCode,
    result,
    selectedStudent
  ]);

  useEffect(() => {
    setCanonicalSourceTarget(undefined);
    setCommentEditor(undefined);
    commentEditorBaseline.current = undefined;
    setDeleteConfirmation(undefined);
    setManualAdjustmentEditor(undefined);
    manualAdjustmentEditorBaseline.current = undefined;
    setDeleteManualAdjustmentConfirmation(undefined);
    setMarkCompleteConfirmation(undefined);
    setReportPublicationConfirmation(undefined);
    setReportPublicationNotice(undefined);
    setDiscardDraftConfirmation(undefined);
    reportPublicationRequestGeneration.current += 1;
    reportPreviewRequestGeneration.current += 1;
    setReportPreview({ status: "idle" });
    setGradingMutationError(undefined);
    evidencePanelPriorFocusRef.current = null;
  }, [currentStudentId]);

  useEffect(() => {
    const generation = sourceRequestGeneration.current + 1;
    sourceRequestGeneration.current = generation;
    if (!isReady(result) || selectedStudent === undefined) {
      setSource({ status: "idle" });
      return;
    }
    setSource({ status: "loading", studentId: selectedStudent.studentId });
    const identity = {
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: selectedStudent.studentId
    };
    void window.graiderUI
      .loadGradingStudentSource(identity)
      .then(async (value) => {
        if (sourceRequestGeneration.current !== generation) return;
        if (!isGradingStudentSourceDto(value) || value.studentId !== selectedStudent.studentId) {
          setSource({
            status: "failure",
            studentId: selectedStudent.studentId,
            message: sourceFailureMessage(value)
          });
          return;
        }
        let viewStateResult: GradingStudentViewStateResult;
        try {
          viewStateResult = await window.graiderUI.loadGradingStudentViewState(identity);
        } catch {
          if (sourceRequestGeneration.current !== generation) return;
          setStudentWarning(
            selectedStudent.studentId,
            "Editor position could not be loaded safely. The source viewer remains read-only."
          );
          setSource({
            status: "success",
            source: value,
            initialViewState: null,
            autosaveEnabled: false
          });
          return;
        }
        if (sourceRequestGeneration.current !== generation) return;
        if (
          viewStateResult.status === "success" &&
          viewStateResult.studentId === selectedStudent.studentId
        ) {
          autosaveBlockedStudents.current.delete(selectedStudent.studentId);
          setStudentWarning(selectedStudent.studentId);
          setSource({
            status: "success",
            source: value,
            initialViewState: viewStateResult.viewState,
            autosaveEnabled: true
          });
          return;
        }
        if (viewStateResult.status === "submission_changed") {
          autosaveBlockedStudents.current.add(selectedStudent.studentId);
          gradingMutationBlockedStudents.current.add(selectedStudent.studentId);
          cancelPendingForStudent(selectedStudent.studentId);
        }
        setStudentWarning(selectedStudent.studentId, viewStateFailureMessage(viewStateResult));
        setSource({
          status: "success",
          source: value,
          initialViewState: null,
          autosaveEnabled: false
        });
      })
      .catch(() => {
        if (sourceRequestGeneration.current !== generation) return;
        setSource({
          status: "failure",
          studentId: selectedStudent.studentId,
          message: "Student source could not be loaded."
        });
      });
  }, [
    cancelPendingForStudent,
    request.assignmentSlug,
    request.courseFolderId,
    request.courseFolderPath,
    request.termCode,
    result,
    selectedStudent,
    setStudentWarning
  ]);
  const availableCommentTags = useMemo(
    () =>
      commentLibrary.status === "success" ? listReusableCommentTags(commentLibrary.comments) : [],
    [commentLibrary]
  );
  const matchingComments = useMemo(
    () =>
      commentLibrary.status === "success"
        ? filterReusableComments(commentLibrary.comments, commentSearch, selectedCommentTags)
        : [],
    [commentLibrary, commentSearch, selectedCommentTags]
  );
  const updateLibraryComments = (
    update: (comments: readonly ReusableComment[]) => readonly ReusableComment[]
  ): void => {
    setCommentLibrary((current) =>
      current.status === "success"
        ? { status: "success", comments: update(current.comments) }
        : current
    );
  };
  const libraryMutationFailureMessage = (result: GradingCommentLibraryMutationResult): string => {
    if (result.status === "not_found") return "That reusable comment no longer exists.";
    if (result.status === "failure") return "The reusable comment could not be saved safely.";
    return "The shared comment library is unavailable for this faculty account.";
  };
  const publicationWarning = (
    result: Extract<GradingCommentLibraryMutationResult, { readonly status: "success" }>
  ): string | undefined =>
    result.publication.status === "failure"
      ? "Comment saved locally, but the shared course repository could not be published. Use Publish Course Changes to retry after resolving the repository issue."
      : undefined;
  const saveLibraryEditor = async (value: ReusableCommentEditorValue): Promise<void> => {
    const editor = libraryEditor;
    if (editor === undefined || libraryMutationPending) return;
    const promotion = editor.operation === "create" ? editor.promotion : undefined;
    if (
      editor.operation === "create" &&
      window.graiderUI.createGradingLibraryComment === undefined
    ) {
      setLibraryMutationMessage("The shared comment library is unavailable.");
      return;
    }
    if (editor.operation === "edit" && window.graiderUI.editGradingLibraryComment === undefined) {
      setLibraryMutationMessage("The shared comment library is unavailable.");
      return;
    }
    setLibraryMutationPending(true);
    setLibraryMutationMessage(undefined);
    try {
      const result =
        editor.operation === "create"
          ? await window.graiderUI.createGradingLibraryComment!({
              courseFolderId: request.courseFolderId,
              termCode: request.termCode,
              comment: value
            })
          : await window.graiderUI.editGradingLibraryComment!({
              courseFolderId: request.courseFolderId,
              termCode: request.termCode,
              commentId: editor.commentId,
              replacement: value
            });
      if (result.status !== "success" || !("comment" in result)) {
        setLibraryMutationMessage(libraryMutationFailureMessage(result));
      } else {
        updateLibraryComments((comments) =>
          editor.operation === "create"
            ? [...comments, result.comment]
            : comments.map((comment) =>
                comment.id === result.comment.id ? result.comment : comment
              )
        );
        setLibraryEditor(undefined);
        if (promotion !== undefined)
          setPromotionOffer((current) =>
            current !== undefined &&
            current.studentId === promotion.studentId &&
            current.appliedCommentId === promotion.appliedCommentId
              ? undefined
              : current
          );
        const warning = publicationWarning(result);
        if (warning === undefined)
          showToast(
            promotion === undefined
              ? editor.operation === "create"
                ? "Reusable comment created."
                : "Reusable comment updated."
              : "Comment saved to course library."
          );
        else setLibraryMutationMessage(warning);
      }
    } catch {
      setLibraryMutationMessage("The reusable comment could not be saved safely.");
    } finally {
      if (mounted.current) setLibraryMutationPending(false);
    }
  };
  const deleteLibraryComment = async (): Promise<void> => {
    const comment = libraryDeleteConfirmation;
    const remove = window.graiderUI.deleteGradingLibraryComment;
    if (comment === undefined || remove === undefined || libraryMutationPending) return;
    setLibraryMutationPending(true);
    setLibraryMutationMessage(undefined);
    try {
      const result = await remove({
        courseFolderId: request.courseFolderId,
        termCode: request.termCode,
        commentId: comment.id
      });
      if (result.status !== "success")
        setLibraryMutationMessage(libraryMutationFailureMessage(result));
      else {
        updateLibraryComments((comments) =>
          comments.filter((candidate) => candidate.id !== comment.id)
        );
        setLibraryDeleteConfirmation(undefined);
        const warning = publicationWarning(result);
        if (warning === undefined) showToast("Reusable comment deleted.");
        else setLibraryMutationMessage(warning);
      }
    } catch {
      setLibraryMutationMessage("The reusable comment could not be deleted safely.");
    } finally {
      if (mounted.current) setLibraryMutationPending(false);
    }
  };
  const sourceAnnotations = useMemo<readonly GradingSourceAnnotation[]>(() => {
    if (snapshot.status !== "success") return [];
    return snapshot.snapshot.appliedComments.flatMap((comment) => {
      if (comment.sourceLocation === undefined) return [];
      const rubricCategoryName = snapshot.snapshot.grade.categories.find(
        (category) => category.id === comment.rubricCategoryId
      )?.name;
      return [
        {
          id: comment.id,
          text: comment.text,
          deduction: comment.deduction,
          ...(rubricCategoryName === undefined ? {} : { rubricCategoryName }),
          sourceLocation: comment.sourceLocation
        }
      ];
    });
  }, [snapshot]);

  // Only one editor or confirmation panel may be open at a time (the sibling-panel
  // invariant): every panel-open path funnels through requestPanelOpen, which
  // closes every other panel first. Switching the selected student is gated the
  // same way through requestStudentSwitch, since the student-switch effect below
  // clears every panel just as silently. The comment and manual-adjustment editors
  // are the only panels that can hold unsaved typed input, so opening anything
  // else, or switching students, while one of them has unsaved changes is routed
  // through a discard prompt instead of silently overwriting or abandoning it.
  // For the comment editor, "unsaved changes" includes re-anchoring an edited
  // comment to different source lines (targetMode / sourceTarget), not just the
  // typed title, text, deduction, and rubric category.
  const commentEditorContentKey = (editor: CommentEditorState): string =>
    JSON.stringify([
      editor.title,
      editor.text,
      editor.deduction,
      editor.rubricCategoryId,
      editor.targetMode,
      editor.operation === "edit" ? editor.sourceTarget : undefined
    ]);

  const manualAdjustmentEditorContentKey = (editor: ManualAdjustmentEditorState): string =>
    JSON.stringify([editor.rubricCategoryId, editor.amount, editor.note]);

  // A save already in flight for this exact editor is not "unsaved" — the user
  // already committed to saving it, and runGradingMutation resolves it correctly
  // regardless of which student ends up selected by the time it completes.
  const hasUnsavedCommentDraft = (): boolean =>
    commentEditor !== undefined &&
    gradingMutationStudentId !== commentEditor.studentId &&
    commentEditorBaseline.current !== undefined &&
    commentEditorContentKey(commentEditor) !==
      commentEditorContentKey(commentEditorBaseline.current);

  const hasUnsavedManualAdjustmentDraft = (): boolean =>
    manualAdjustmentEditor !== undefined &&
    gradingMutationStudentId !== manualAdjustmentEditor.studentId &&
    manualAdjustmentEditorBaseline.current !== undefined &&
    manualAdjustmentEditorContentKey(manualAdjustmentEditor) !==
      manualAdjustmentEditorContentKey(manualAdjustmentEditorBaseline.current);

  const closeAllGradingPanels = (): void => {
    setCommentEditor(undefined);
    commentEditorBaseline.current = undefined;
    setDeleteConfirmation(undefined);
    setManualAdjustmentEditor(undefined);
    manualAdjustmentEditorBaseline.current = undefined;
    setDeleteManualAdjustmentConfirmation(undefined);
    setMarkCompleteConfirmation(undefined);
    setReportPublicationConfirmation(undefined);
    setWorkflowRepairConfirmation(undefined);
    setBulkWorkflowRepairConfirmation(false);
    setGradingMutationError(undefined);
  };

  // Shared by every action that must not silently clobber a dirty draft:
  // opening a different panel and switching the selected student both call
  // this, and only differ in what they do once they're clear to proceed.
  const withDraftGuard = (perform: () => void): void => {
    if (hasUnsavedCommentDraft()) {
      setDiscardDraftConfirmation({ kind: "comment", perform });
      return;
    }
    if (hasUnsavedManualAdjustmentDraft()) {
      setDiscardDraftConfirmation({ kind: "adjustment", perform });
      return;
    }
    perform();
  };

  const requestPanelOpen = (perform: () => void): void =>
    withDraftGuard(() => {
      closeAllGradingPanels();
      perform();
    });

  // Switching students already clears every panel via the effect below once
  // the selection changes, so this only needs to guard against a dirty draft —
  // it does not need to close panels itself the way requestPanelOpen does.
  const requestStudentSwitch = (perform: () => void): void => withDraftGuard(perform);

  const confirmDiscardDraft = (): void => {
    const pending = discardDraftConfirmation;
    if (pending === undefined) return;
    closeAllGradingPanels();
    pending.perform();
    setDiscardDraftConfirmation(undefined);
  };

  const cancelDiscardDraft = (): void => {
    setDiscardDraftConfirmation(undefined);
  };

  const openApplyEditor = (comment: ReusableComment): void => {
    if (!isReady(result) || selectedStudent === undefined) return;
    const defaultCategory =
      comment.defaultRubricCategoryId !== undefined &&
      result.rubric.some((category) => category.id === comment.defaultRubricCategoryId)
        ? comment.defaultRubricCategoryId
        : "";
    const nextEditor: CommentEditorState = {
      operation: "add",
      studentId: selectedStudent.studentId,
      reusableCommentId: comment.id,
      reusableCommentTitle: comment.title,
      title: comment.title,
      text: comment.text,
      deduction: String(Math.abs(comment.defaultDeduction)),
      rubricCategoryId: defaultCategory,
      targetMode: canonicalSourceTarget === undefined ? "general" : "source"
    };
    requestPanelOpen(() => {
      setCommentEditor(nextEditor);
      commentEditorBaseline.current = nextEditor;
    });
  };

  const openAddCommentEditor = (): void => {
    if (
      !isReady(result) ||
      selectedStudent === undefined ||
      canonicalSourceTarget === undefined ||
      selectedStudent.studentId !== currentStudentIdRef.current
    )
      return;
    const nextEditor: CommentEditorState = {
      operation: "add",
      studentId: selectedStudent.studentId,
      title: "",
      text: "",
      deduction: "0",
      rubricCategoryId: "",
      targetMode: "source"
    };
    requestPanelOpen(() => {
      setCommentEditor(nextEditor);
      commentEditorBaseline.current = nextEditor;
    });
  };

  const openEditEditor = (comment: Snapshot["appliedComments"][number]): void => {
    if (!isReady(result) || selectedStudent === undefined) return;
    const nextEditor: CommentEditorState = {
      operation: "edit",
      studentId: selectedStudent.studentId,
      commentId: comment.id,
      title: comment.title ?? "",
      hasPersistedTitle: comment.title !== undefined,
      text: comment.text,
      deduction: String(Math.abs(comment.deduction)),
      rubricCategoryId: comment.rubricCategoryId ?? "",
      targetMode: comment.sourceLocation === undefined ? "general" : "source",
      ...(comment.sourceLocation === undefined ? {} : { sourceTarget: comment.sourceLocation })
    };
    requestPanelOpen(() => {
      setCommentEditor(nextEditor);
      commentEditorBaseline.current = nextEditor;
    });
  };

  const openAddManualAdjustmentEditor = (): void => {
    if (!isReady(result) || selectedStudent === undefined || result.rubric.length === 0) return;
    const nextEditor: ManualAdjustmentEditorState = {
      operation: "add",
      studentId: selectedStudent.studentId,
      rubricCategoryId: "",
      amount: "",
      note: ""
    };
    requestPanelOpen(() => {
      setManualAdjustmentEditor(nextEditor);
      manualAdjustmentEditorBaseline.current = nextEditor;
    });
  };

  const openEditManualAdjustmentEditor = (
    adjustment: Snapshot["manualAdjustments"][number]
  ): void => {
    if (!isReady(result) || selectedStudent === undefined) return;
    const nextEditor: ManualAdjustmentEditorState = {
      operation: "edit",
      studentId: selectedStudent.studentId,
      adjustmentId: adjustment.id,
      rubricCategoryId: adjustment.rubricCategoryId,
      amount: String(adjustment.amount),
      note: adjustment.note ?? ""
    };
    requestPanelOpen(() => {
      setManualAdjustmentEditor(nextEditor);
      manualAdjustmentEditorBaseline.current = nextEditor;
    });
  };

  const openDeleteCommentConfirmation = (comment: Snapshot["appliedComments"][number]): void => {
    if (!isReady(result) || selectedStudent === undefined) return;
    const confirmation: DeleteCommentConfirmation = {
      studentId: selectedStudent.studentId,
      commentId: comment.id,
      text: comment.text,
      deduction: comment.deduction,
      ...(comment.sourceLocation === undefined ? {} : { sourceLocation: comment.sourceLocation })
    };
    requestPanelOpen(() => setDeleteConfirmation(confirmation));
  };

  const openDeleteManualAdjustmentConfirmation = (
    adjustment: Snapshot["manualAdjustments"][number]
  ): void => {
    if (!isReady(result) || selectedStudent === undefined) return;
    const confirmation: DeleteManualAdjustmentConfirmation = {
      studentId: selectedStudent.studentId,
      adjustmentId: adjustment.id,
      rubricCategoryId: adjustment.rubricCategoryId,
      amount: adjustment.amount,
      ...(adjustment.note === undefined ? {} : { note: adjustment.note })
    };
    requestPanelOpen(() => setDeleteManualAdjustmentConfirmation(confirmation));
  };

  const openMarkCompleteConfirmation = (studentId: string): void => {
    requestPanelOpen(() => setMarkCompleteConfirmation({ studentId }));
  };

  const openReportPublicationConfirmation = (
    studentId: string,
    operation: "publish" | "republish"
  ): void => {
    requestPanelOpen(() => {
      setReportPublicationNotice(undefined);
      setReportPublicationConfirmation({ studentId, operation });
    });
  };

  const openWorkflowRepairConfirmation = (): void => {
    if (workflowRepair.status !== "ready") return;
    const confirmation: WorkflowRepairConfirmation = {
      studentId: workflowRepair.studentId,
      repositoryFullName: workflowRepair.repositoryFullName
    };
    requestPanelOpen(() => setWorkflowRepairConfirmation(confirmation));
  };

  const openBulkWorkflowRepairConfirmation = (): void => {
    requestPanelOpen(() => setBulkWorkflowRepairConfirmation(true));
  };

  const runGradingMutation = async (
    studentId: string,
    mutate: () => Promise<
      | GradingStudentCommentResult
      | GradingStudentManualAdjustmentResult
      | MarkGradingStudentCompleteResult
    >,
    closeMutationEditor: () => void = () => {
      setCommentEditor(undefined);
      setDeleteConfirmation(undefined);
    },
    onMutationPersisted?: () => void
  ): Promise<boolean> => {
    if (studentId !== currentStudentIdRef.current || gradingMutationStudents.current.has(studentId))
      return false;
    if (gradingMutationBlockedStudents.current.has(studentId)) {
      setGradingMutationError(snapshotSubmissionChangedWarning);
      return false;
    }
    const loadSnapshot = window.graiderUI.loadGradingStudentSnapshot;
    if (loadSnapshot === undefined) {
      setGradingMutationError("Updating grading comments is unavailable.");
      return false;
    }
    gradingMutationStudents.current.add(studentId);
    setGradingMutationStudentId(studentId);
    setGradingMutationError(undefined);
    let commentWasSaved = false;
    try {
      await flushPendingViewState(studentId, true);
      if (gradingMutationBlockedStudents.current.has(studentId)) {
        if (currentStudentIdRef.current === studentId)
          setGradingMutationError(snapshotSubmissionChangedWarning);
        return false;
      }
      const mutationResult = await mutate();
      if (mutationResult.status !== "success") {
        if (mutationResult.status === "submission_changed") {
          gradingMutationBlockedStudents.current.add(studentId);
          autosaveBlockedStudents.current.add(studentId);
          cancelPendingForStudent(studentId);
        }
        if (currentStudentIdRef.current === studentId)
          setGradingMutationError(gradingMutationFailureMessage(mutationResult));
        return false;
      }
      commentWasSaved = true;
      onMutationPersisted?.();
      if (currentStudentIdRef.current === studentId) {
        closeMutationEditor();
      }
      const refreshed = await loadSnapshot({ ...request, studentId });
      if (refreshed.status !== "success" || refreshed.studentId !== studentId) {
        if (refreshed.status === "submission_changed") {
          gradingMutationBlockedStudents.current.add(studentId);
          autosaveBlockedStudents.current.add(studentId);
          cancelPendingForStudent(studentId);
        }
        if (currentStudentIdRef.current === studentId)
          setGradingMutationError(
            refreshed.status === "submission_changed"
              ? snapshotSubmissionChangedWarning
              : "The grading change was saved, but current grading details could not be reloaded safely."
          );
        return false;
      }
      setStudentStatusOverrides((current) => ({
        ...current,
        [studentId]: refreshed.gradingStatus
      }));
      if (currentStudentIdRef.current === studentId) {
        snapshotRequestGeneration.current += 1;
        setSnapshot({ status: "success", snapshot: refreshed });
        closeMutationEditor();
        setGradingMutationError(undefined);
      }
      return true;
    } catch {
      if (currentStudentIdRef.current === studentId)
        setGradingMutationError(
          commentWasSaved
            ? "The grading change was saved, but current grading details could not be reloaded safely."
            : "The grading state could not be updated safely."
        );
      return false;
    } finally {
      gradingMutationStudents.current.delete(studentId);
      setGradingMutationStudentId((current) => (current === studentId ? undefined : current));
      void flushPendingViewState(studentId);
    }
  };

  const saveCommentEditor = async (): Promise<void> => {
    if (
      !isReady(result) ||
      commentEditor === undefined ||
      commentEditor.studentId !== currentStudentIdRef.current
    )
      return;
    const deduction = Number(commentEditor.deduction);
    const title = commentEditor.title.trim();
    if (title === "" && (commentEditor.operation === "add" || commentEditor.hasPersistedTitle)) {
      setGradingMutationError("Comment title is required.");
      return;
    }
    if (commentEditor.text.trim() === "") {
      setGradingMutationError("Comment text is required.");
      return;
    }
    if (commentEditor.deduction.trim() === "" || !Number.isFinite(deduction)) {
      setGradingMutationError("Deduction must be a finite number.");
      return;
    }
    if (deduction < 0) {
      setGradingMutationError("Deduction must be zero or greater.");
      return;
    }
    if (
      commentEditor.rubricCategoryId !== "" &&
      !result.rubric.some((category) => category.id === commentEditor.rubricCategoryId)
    ) {
      setGradingMutationError("Select a configured rubric category or None.");
      return;
    }
    const sourceLocation =
      commentEditor.targetMode === "source"
        ? commentEditor.operation === "edit"
          ? commentEditor.sourceTarget
          : canonicalSourceTarget
        : undefined;
    if (commentEditor.targetMode === "source" && sourceLocation === undefined) {
      setGradingMutationError("Select a valid source line or range, or choose General.");
      return;
    }
    const studentId = commentEditor.studentId;
    const identity = { ...request, studentId };
    if (commentEditor.operation === "add") {
      const addComment = window.graiderUI.addGradingStudentComment;
      if (addComment === undefined) {
        setGradingMutationError("Applying grading comments is unavailable.");
        return;
      }
      const editor = commentEditor;
      const appliedCommentId = globalThis.crypto.randomUUID();
      const appliedComment = {
        id: appliedCommentId,
        ...(editor.reusableCommentId === undefined
          ? {}
          : { sourceCommentId: editor.reusableCommentId }),
        title,
        text: editor.text,
        deduction,
        ...(editor.rubricCategoryId === "" ? {} : { rubricCategoryId: editor.rubricCategoryId }),
        ...(sourceLocation === undefined ? {} : { sourceLocation })
      };
      const promotion: PromotionOffer | undefined =
        editor.reusableCommentId === undefined
          ? {
              studentId,
              appliedCommentId,
              value: {
                title,
                text: editor.text,
                // Applied comments submit a nonnegative deduction magnitude;
                // reusable defaults store the equivalent score adjustment.
                defaultDeduction: -deduction,
                ...(editor.rubricCategoryId === ""
                  ? {}
                  : { defaultRubricCategoryId: editor.rubricCategoryId }),
                tags: []
              }
            }
          : undefined;
      await runGradingMutation(
        studentId,
        () =>
          addComment({
            ...identity,
            comment: appliedComment
          }),
        undefined,
        () => {
          if (promotion !== undefined && currentStudentIdRef.current === studentId)
            setPromotionOffer(promotion);
        }
      );
      return;
    }
    const editComment = window.graiderUI.editGradingStudentComment;
    if (editComment === undefined) {
      setGradingMutationError("Editing grading comments is unavailable.");
      return;
    }
    const editor = commentEditor;
    await runGradingMutation(studentId, () =>
      editComment({
        ...identity,
        commentId: editor.commentId,
        replacement: {
          ...(title === "" ? {} : { title }),
          text: editor.text,
          deduction,
          ...(editor.rubricCategoryId === "" ? {} : { rubricCategoryId: editor.rubricCategoryId }),
          ...(sourceLocation === undefined ? {} : { sourceLocation })
        }
      })
    );
  };

  const confirmDeleteComment = async (): Promise<void> => {
    if (
      deleteConfirmation === undefined ||
      deleteConfirmation.studentId !== currentStudentIdRef.current
    )
      return;
    const deleteComment = window.graiderUI.deleteGradingStudentComment;
    if (deleteComment === undefined) {
      setGradingMutationError("Deleting grading comments is unavailable.");
      return;
    }
    const confirmation = deleteConfirmation;
    await runGradingMutation(confirmation.studentId, () =>
      deleteComment({
        ...request,
        studentId: confirmation.studentId,
        commentId: confirmation.commentId
      })
    );
  };

  const saveManualAdjustmentEditor = async (): Promise<void> => {
    if (
      !isReady(result) ||
      manualAdjustmentEditor === undefined ||
      manualAdjustmentEditor.studentId !== currentStudentIdRef.current
    )
      return;
    if (manualAdjustmentEditor.rubricCategoryId === "") {
      setGradingMutationError("Select a rubric category.");
      return;
    }
    if (
      !result.rubric.some((category) => category.id === manualAdjustmentEditor.rubricCategoryId)
    ) {
      setGradingMutationError("Select a configured rubric category.");
      return;
    }
    const amount = Number(manualAdjustmentEditor.amount);
    if (manualAdjustmentEditor.amount.trim() === "" || !Number.isFinite(amount)) {
      setGradingMutationError("Adjustment amount must be a finite number.");
      return;
    }
    const studentId = manualAdjustmentEditor.studentId;
    const identity = { ...request, studentId };
    const note = manualAdjustmentEditor.note.trim();
    if (manualAdjustmentEditor.operation === "add") {
      const addAdjustment = window.graiderUI.addGradingStudentManualAdjustment;
      if (addAdjustment === undefined) {
        setGradingMutationError("Adding manual adjustments is unavailable.");
        return;
      }
      const editor = manualAdjustmentEditor;
      await runGradingMutation(
        studentId,
        () =>
          addAdjustment({
            ...identity,
            adjustment: {
              id: globalThis.crypto.randomUUID(),
              rubricCategoryId: editor.rubricCategoryId,
              amount,
              ...(note === "" ? {} : { note })
            }
          }),
        () => {
          setManualAdjustmentEditor(undefined);
          setDeleteManualAdjustmentConfirmation(undefined);
        }
      );
      return;
    }
    const editAdjustment = window.graiderUI.editGradingStudentManualAdjustment;
    if (editAdjustment === undefined) {
      setGradingMutationError("Editing manual adjustments is unavailable.");
      return;
    }
    const editor = manualAdjustmentEditor;
    await runGradingMutation(
      studentId,
      () =>
        editAdjustment({
          ...identity,
          adjustmentId: editor.adjustmentId,
          replacement: {
            rubricCategoryId: editor.rubricCategoryId,
            amount,
            ...(note === "" ? {} : { note })
          }
        }),
      () => {
        setManualAdjustmentEditor(undefined);
        setDeleteManualAdjustmentConfirmation(undefined);
      }
    );
  };

  const confirmDeleteManualAdjustment = async (): Promise<void> => {
    if (
      deleteManualAdjustmentConfirmation === undefined ||
      deleteManualAdjustmentConfirmation.studentId !== currentStudentIdRef.current
    )
      return;
    const deleteAdjustment = window.graiderUI.deleteGradingStudentManualAdjustment;
    if (deleteAdjustment === undefined) {
      setGradingMutationError("Deleting manual adjustments is unavailable.");
      return;
    }
    const confirmation = deleteManualAdjustmentConfirmation;
    await runGradingMutation(
      confirmation.studentId,
      () =>
        deleteAdjustment({
          ...request,
          studentId: confirmation.studentId,
          adjustmentId: confirmation.adjustmentId
        }),
      () => {
        setManualAdjustmentEditor(undefined);
        setDeleteManualAdjustmentConfirmation(undefined);
      }
    );
  };

  const confirmMarkComplete = async (): Promise<boolean> => {
    if (
      markCompleteConfirmation === undefined ||
      markCompleteConfirmation.studentId !== currentStudentIdRef.current
    )
      return false;
    const markComplete = window.graiderUI.markGradingStudentComplete;
    if (markComplete === undefined) {
      setGradingMutationError("Marking grading complete is unavailable.");
      return false;
    }
    const confirmation = markCompleteConfirmation;
    return runGradingMutation(
      confirmation.studentId,
      () => markComplete({ ...request, studentId: confirmation.studentId }),
      () => setMarkCompleteConfirmation(undefined)
    );
  };

  const refreshSnapshotAfterPublication = async (
    studentId: string,
    publicationGeneration: number
  ): Promise<boolean> => {
    const loadSnapshot = window.graiderUI.loadGradingStudentSnapshot;
    if (loadSnapshot === undefined) return false;
    const snapshotGeneration = snapshotRequestGeneration.current + 1;
    snapshotRequestGeneration.current = snapshotGeneration;
    try {
      const refreshed = await loadSnapshot({ ...request, studentId });
      if (
        !mounted.current ||
        reportPublicationRequestGeneration.current !== publicationGeneration ||
        snapshotRequestGeneration.current !== snapshotGeneration ||
        currentStudentIdRef.current !== studentId
      )
        return false;
      if (refreshed.status !== "success" || refreshed.studentId !== studentId) {
        if (refreshed.status === "submission_changed") {
          gradingMutationBlockedStudents.current.add(studentId);
          autosaveBlockedStudents.current.add(studentId);
          cancelPendingForStudent(studentId);
        }
        return false;
      }
      gradingMutationBlockedStudents.current.delete(studentId);
      setStudentStatusOverrides((current) => ({
        ...current,
        [studentId]: refreshed.gradingStatus
      }));
      setSnapshot({ status: "success", snapshot: refreshed });
      return true;
    } catch {
      return false;
    }
  };

  const previewReport = async (studentId: string): Promise<void> => {
    const preview = window.graiderUI.previewGradingStudentReport;
    if (preview === undefined) {
      setReportPreview({
        status: "failure",
        studentId,
        message: "Previewing grading reports is unavailable."
      });
      return;
    }

    const previewGeneration = reportPreviewRequestGeneration.current + 1;
    reportPreviewRequestGeneration.current = previewGeneration;
    const isCurrentPreview = (): boolean =>
      mounted.current &&
      reportPreviewRequestGeneration.current === previewGeneration &&
      currentStudentIdRef.current === studentId;
    setReportPreview({ status: "loading", studentId });

    try {
      const previewResult = await preview({ ...request, studentId });
      if (!isCurrentPreview()) return;
      if ("studentId" in previewResult && previewResult.studentId !== studentId) {
        setReportPreview({
          status: "failure",
          studentId,
          message: "The report preview response could not be verified safely."
        });
        return;
      }
      if (previewResult.status === "success") {
        setReportPreview({
          status: "success",
          studentId,
          html: previewResult.html,
          warnings: previewResult.warnings
        });
        return;
      }
      setReportPreview({
        status: "failure",
        studentId,
        message: publicationFailureMessage(previewResult)
      });
    } catch {
      if (isCurrentPreview())
        setReportPreview({
          status: "failure",
          studentId,
          message: "The grading report could not be previewed safely."
        });
    }
  };

  const confirmPublishReport = async (): Promise<void> => {
    if (
      reportPublicationConfirmation === undefined ||
      reportPublicationConfirmation.studentId !== currentStudentIdRef.current
    ) {
      // Stale: this confirmation was for a student the faculty member has
      // since navigated away from. reportPublicationNotice only renders
      // when it matches the currently viewed student, so a notice here
      // would never be seen -- just close.
      setReportPublicationConfirmation(undefined);
      return;
    }
    const studentId = reportPublicationConfirmation.studentId;
    if (gradingMutationStudents.current.has(studentId)) {
      setReportPublicationNotice({
        studentId,
        tone: "warning",
        message: "Another change to this student is still running. Try again in a moment."
      });
      setReportPublicationConfirmation(undefined);
      return;
    }
    if (gradingMutationBlockedStudents.current.has(studentId)) {
      setReportPublicationNotice({
        studentId,
        tone: "warning",
        message: snapshotSubmissionChangedWarning
      });
      setReportPublicationConfirmation(undefined);
      return;
    }
    const publishReport = window.graiderUI.publishGradingStudentReport;
    if (publishReport === undefined) {
      setReportPublicationNotice({
        studentId,
        tone: "error",
        message: "Publishing grading reports is unavailable."
      });
      setReportPublicationConfirmation(undefined);
      return;
    }

    const publicationGeneration = reportPublicationRequestGeneration.current + 1;
    reportPublicationRequestGeneration.current = publicationGeneration;
    const isCurrentPublication = (): boolean =>
      mounted.current &&
      reportPublicationRequestGeneration.current === publicationGeneration &&
      currentStudentIdRef.current === studentId;
    gradingMutationStudents.current.add(studentId);
    setGradingMutationStudentId(studentId);
    setReportPublicationStudentId(studentId);
    setReportPublicationNotice(undefined);

    try {
      await flushPendingViewState(studentId, true);
      if (!isCurrentPublication()) return;
      if (gradingMutationBlockedStudents.current.has(studentId)) {
        setReportPublicationNotice({
          studentId,
          tone: "warning",
          message: snapshotSubmissionChangedWarning
        });
        return;
      }

      const publicationResult = await publishReport({ ...request, studentId });
      if (!isCurrentPublication()) return;
      if ("studentId" in publicationResult && publicationResult.studentId !== studentId) {
        setReportPublicationNotice({
          studentId,
          tone: "error",
          message: "The publication response could not be verified safely."
        });
        return;
      }

      if (publicationResult.status === "success") {
        const refreshed = await refreshSnapshotAfterPublication(studentId, publicationGeneration);
        if (!isCurrentPublication()) return;
        setReportPublicationNotice({
          studentId,
          tone: publicationResult.warnings.length === 0 ? "success" : "warning",
          message: refreshed
            ? `Published to ${publicationResult.reportPath}.`
            : `The report was published to ${publicationResult.reportPath}, but the current grading status could not be refreshed.`,
          ...(publicationResult.warnings.length === 0
            ? {}
            : { warnings: publicationResult.warnings.map(publicationWarningMessage) })
        });
        return;
      }

      if (publicationResult.status === "publication_state_record_failed") {
        await refreshSnapshotAfterPublication(studentId, publicationGeneration);
        if (!isCurrentPublication()) return;
        setReportPublicationNotice({
          studentId,
          tone: "warning",
          message:
            "The report was published to the student repository, but Graider could not record the Published status. You can retry publication safely.",
          ...(publicationResult.warnings.length === 0
            ? {}
            : { warnings: publicationResult.warnings.map(publicationWarningMessage) })
        });
        return;
      }

      if (publicationResult.status === "publication_stale") {
        await refreshSnapshotAfterPublication(studentId, publicationGeneration);
        if (!isCurrentPublication()) return;
        setReportPublicationNotice({
          studentId,
          tone: "warning",
          message: publicationResult.remoteReportPublished
            ? "Grading changed while publication was in progress. The remote report may contain an earlier grading version. Review the current grading and publish again."
            : "Grading changed while publication was in progress. Review the current grading and publish again."
        });
        return;
      }

      if (publicationResult.status === "submission_changed") {
        const remoteReportPublished =
          "remoteReportPublished" in publicationResult && publicationResult.remoteReportPublished;
        gradingMutationBlockedStudents.current.add(studentId);
        autosaveBlockedStudents.current.add(studentId);
        cancelPendingForStudent(studentId);
        await refreshSnapshotAfterPublication(studentId, publicationGeneration);
        if (!isCurrentPublication()) return;
        setReportPublicationNotice({
          studentId,
          tone: "warning",
          message: remoteReportPublished
            ? `${snapshotSubmissionChangedWarning} The remote report may contain feedback for the earlier submission, but current grading was not marked Published.`
            : `${snapshotSubmissionChangedWarning} The report was not published.`
        });
        return;
      }

      if (
        publicationResult.status === "grading_not_complete" ||
        publicationResult.status === "grading_state_missing"
      ) {
        await refreshSnapshotAfterPublication(studentId, publicationGeneration);
        if (!isCurrentPublication()) return;
      }
      setReportPublicationNotice({
        studentId,
        tone: "error",
        message: publicationFailureMessage(publicationResult)
      });
    } catch {
      if (isCurrentPublication())
        setReportPublicationNotice({
          studentId,
          tone: "error",
          message: "The grading report could not be published safely."
        });
    } finally {
      gradingMutationStudents.current.delete(studentId);
      setGradingMutationStudentId((current) => (current === studentId ? undefined : current));
      setReportPublicationStudentId((current) => (current === studentId ? undefined : current));
      if (reportPublicationRequestGeneration.current === publicationGeneration)
        setReportPublicationConfirmation(undefined);
      void flushPendingViewState(studentId);
    }
  };

  const openPublishReview = (): void => {
    requestPanelOpen(() => {
      void flushPendingViewState(currentStudentId);
      setPublishReviewResults(undefined);
      setPublishReviewRefreshFailedStudentIds([]);
      setPublishReviewSelectedIds(publishReviewReadyEntries.map((entry) => entry.studentId));
      setPublishReviewOpen(true);
    });
  };

  const cancelPublishReview = (): void => {
    if (publishReviewRunning) return;
    // Invalidates the in-flight detail-fetch generation so workers stop claiming
    // queued student ids instead of draining the whole batch for a closed screen.
    publishReviewDetailGeneration.current += 1;
    setPublishReviewDetails((current) => {
      const abandonedStudentIds = Object.entries(current)
        .filter(([, detail]) => detail.status === "loading")
        .map(([studentId]) => studentId);
      if (abandonedStudentIds.length === 0) return current;
      const next = { ...current };
      abandonedStudentIds.forEach((studentId) => delete next[studentId]);
      return next;
    });
    setPublishReviewOpen(false);
  };

  const togglePublishReviewSelection = (studentId: string, isSelected: boolean): void => {
    setPublishReviewSelectedIds((current) =>
      isSelected
        ? current.includes(studentId)
          ? current
          : [...current, studentId]
        : current.filter((candidate) => candidate !== studentId)
    );
  };

  const runPublishReview = async (): Promise<void> => {
    const studentIds = [...publishReviewSelectedIds];
    if (studentIds.length === 0 || publishReviewRunning) return;
    const publishReports = window.graiderUI.bulkPublishGradingStudentReports;
    if (publishReports === undefined) {
      setGradingMutationError("Bulk report publication is unavailable.");
      return;
    }
    const generation = bulkPublicationRequestGeneration.current + 1;
    bulkPublicationRequestGeneration.current = generation;
    const isCurrentPublishReview = (): boolean =>
      mounted.current && bulkPublicationRequestGeneration.current === generation;
    setPublishReviewRunning(true);
    setPublishReviewResults(undefined);
    setPublishReviewRefreshFailedStudentIds([]);
    setGradingMutationError(undefined);
    setReportPublicationConfirmation(undefined);
    studentIds.forEach((studentId) => gradingMutationStudents.current.add(studentId));
    setGradingMutationStudentId(studentIds[0]);
    const selectedStudentId = currentStudentIdRef.current;

    try {
      if (selectedStudentId !== undefined && studentIds.includes(selectedStudentId))
        await flushPendingViewState(selectedStudentId, true);
      if (isCurrentPublishReview()) {
        const publicationResult = await publishReports({
          courseFolderId: request.courseFolderId,
          courseFolderPath: request.courseFolderPath,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          studentIds
        });
        if (isCurrentPublishReview()) {
          const refreshFailedStudentIds: string[] = [];
          const loadSnapshot = window.graiderUI.loadGradingStudentSnapshot;
          for (const studentId of studentIds) {
            let refreshed = false;
            if (loadSnapshot !== undefined) {
              try {
                const value = await loadSnapshot({ ...request, studentId });
                if (
                  isCurrentPublishReview() &&
                  value.status === "success" &&
                  value.studentId === studentId
                ) {
                  setStudentStatusOverrides((current) => ({
                    ...current,
                    [studentId]: value.gradingStatus
                  }));
                  setPublishReviewDetails((current) => ({
                    ...current,
                    [studentId]: {
                      status: "success",
                      scoreLabel: scoreSummaryLabel(value.grade),
                      summaryLabel: reportContentSummaryLabel(value)
                    }
                  }));
                  if (currentStudentIdRef.current === studentId)
                    setSnapshot({ status: "success", snapshot: value });
                  refreshed = true;
                }
              } catch {
                refreshed = false;
              }
            }
            if (!refreshed) refreshFailedStudentIds.push(studentId);
          }
          if (isCurrentPublishReview()) {
            setPublishReviewResults(publicationResult.results);
            setPublishReviewRefreshFailedStudentIds(refreshFailedStudentIds);
          }
        }
      }
    } catch {
      if (isCurrentPublishReview())
        setGradingMutationError(
          "Bulk report publication could not be completed safely. Individual results are unavailable."
        );
    } finally {
      studentIds.forEach((studentId) => gradingMutationStudents.current.delete(studentId));
      setGradingMutationStudentId((current) =>
        current !== undefined && studentIds.includes(current) ? undefined : current
      );
      if (isCurrentPublishReview()) setPublishReviewRunning(false);
      if (selectedStudentId !== undefined) void flushPendingViewState(selectedStudentId);
    }
  };

  useEffect(() => {
    if (!publishReviewOpen) return;
    const loadSnapshot = window.graiderUI.loadGradingStudentSnapshot;
    if (loadSnapshot === undefined) return;
    const missingIds = publishReviewReadyEntries
      .map((entry) => entry.studentId)
      .filter((studentId) => publishReviewDetails[studentId] === undefined);
    if (missingIds.length === 0) return;
    const generation = publishReviewDetailGeneration.current + 1;
    publishReviewDetailGeneration.current = generation;
    setPublishReviewDetails((current) => {
      const next = { ...current };
      missingIds.forEach((studentId) => {
        next[studentId] = { status: "loading" };
      });
      return next;
    });

    const isCurrentFetch = (): boolean =>
      mounted.current && publishReviewDetailGeneration.current === generation;

    const fetchOne = async (studentId: string): Promise<void> => {
      try {
        const value = await loadSnapshot({ ...request, studentId });
        if (!isCurrentFetch()) return;
        setPublishReviewDetails((current) => ({
          ...current,
          [studentId]:
            value.status === "success"
              ? {
                  status: "success",
                  scoreLabel: scoreSummaryLabel(value.grade),
                  summaryLabel: reportContentSummaryLabel(value)
                }
              : { status: "unavailable" }
        }));
      } catch {
        if (!isCurrentFetch()) return;
        setPublishReviewDetails((current) => ({
          ...current,
          [studentId]: { status: "unavailable" }
        }));
      }
    };

    // Bounds concurrent git-backed snapshot fetches: each worker claims the next
    // queued student id only after its previous fetch resolves, so at most
    // PUBLISH_REVIEW_DETAIL_CONCURRENCY are in flight regardless of roster size.
    let nextQueueIndex = 0;
    const claimNextQueuedStudentId = (): string | undefined => {
      if (nextQueueIndex >= missingIds.length) return undefined;
      const studentId = missingIds[nextQueueIndex];
      nextQueueIndex += 1;
      return studentId;
    };
    const runDetailFetchWorker = async (): Promise<void> => {
      for (
        let studentId = claimNextQueuedStudentId();
        studentId !== undefined && isCurrentFetch();
        studentId = claimNextQueuedStudentId()
      ) {
        await fetchOne(studentId);
      }
    };
    const workerCount = Math.min(PUBLISH_REVIEW_DETAIL_CONCURRENCY, missingIds.length);
    for (let worker = 0; worker < workerCount; worker += 1) {
      void runDetailFetchWorker();
    }
  }, [publishReviewOpen, publishReviewReadyEntries, publishReviewDetails, request]);

  const currentEffectiveStatus =
    snapshot.status === "success"
      ? effectiveGradingStatus(
          studentStatusOverrides,
          snapshot.snapshot.studentId,
          snapshot.snapshot.gradingStatus
        )
      : undefined;
  const getStudentNavigationTarget = (
    entries: readonly GradingStudentListEntry[],
    direction: "next" | "previous"
  ): number | undefined => {
    if (entries.length === 0) return undefined;
    const currentPosition = entries.findIndex((entry) => entry.index === selected);
    if (currentPosition < 0)
      return direction === "next" ? entries[0]?.index : entries.at(-1)?.index;
    if (entries.length === 1) return undefined;
    const targetPosition =
      direction === "next"
        ? (currentPosition + 1) % entries.length
        : (currentPosition - 1 + entries.length) % entries.length;
    return entries[targetPosition]?.index;
  };
  const switchToStudent = (targetIndex: number | undefined): void => {
    if (targetIndex === undefined || targetIndex === selected) return;
    requestStudentSwitch(() => {
      void flushPendingViewState(currentStudentId);
      setSelected(targetIndex);
    });
  };
  const goToFilteredStudent = (direction: "next" | "previous"): void => {
    switchToStudent(getStudentNavigationTarget(filteredStudents, direction));
  };
  const goToNextRosterStudent = (): void => {
    switchToStudent(getStudentNavigationTarget(studentsWithStatus, "next"));
  };
  const goToNextStudentNeedingGrading = (): void => {
    switchToStudent(nextStudentNeedingGradingIndex);
  };
  const focusStudentFilter = (): void => {
    const container = filterPillsContainerRef.current;
    if (container === null) return;
    const activePill = container.querySelector<HTMLElement>('button[aria-pressed="true"]');
    (activePill ?? container.querySelector<HTMLElement>("button"))?.focus();
  };
  const handleAutomatedChecksShortcut = (): void => {
    if (evidencePanelPriorFocusRef.current !== null) {
      const target = evidencePanelPriorFocusRef.current;
      evidencePanelPriorFocusRef.current = null;
      target.focus();
      return;
    }
    const activeElement = document.activeElement;
    evidencePanelPriorFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : document.body;
    setEvidencePanelOpen(true);
    setEvidenceFocusRequest((current) => ({ target: "checks", token: (current?.token ?? 0) + 1 }));
  };
  const handleCommitHistoryShortcut = (): void => {
    setEvidencePanelOpen(true);
    setEvidenceFocusRequest((current) => ({ target: "history", token: (current?.token ?? 0) + 1 }));
  };
  const markCompleteAndAdvance = (): void => {
    if (
      markCompleteConfirmation !== undefined &&
      markCompleteConfirmation.studentId === currentStudentId
    ) {
      void confirmMarkComplete().then((succeeded) => {
        if (succeeded) goToNextStudentNeedingGrading();
      });
      return;
    }
    if (
      currentStudentId !== undefined &&
      (currentEffectiveStatus === "not_started" || currentEffectiveStatus === "in_progress") &&
      !publishReviewRunning &&
      gradingMutationStudentId === undefined &&
      !gradingMutationBlockedStudents.current.has(currentStudentId)
    ) {
      openMarkCompleteConfirmation(currentStudentId);
    }
  };
  const applyReusableCommentByPosition = (position: number): void => {
    if (
      currentStudentId === undefined ||
      gradingMutationStudentId !== undefined ||
      gradingMutationBlockedStudents.current.has(currentStudentId)
    )
      return;
    const comment = matchingComments[position - 1];
    if (comment === undefined) return;
    openApplyEditor(comment);
  };
  const closeTopmostPanel = (): void => {
    if (cheatSheetOpen) {
      setCheatSheetOpen(false);
      return;
    }
    if (publishReviewOpen) {
      cancelPublishReview();
      return;
    }
    if (commentEditor !== undefined) {
      setCommentEditor(undefined);
      setGradingMutationError(undefined);
      return;
    }
    if (deleteConfirmation !== undefined) {
      setDeleteConfirmation(undefined);
      setGradingMutationError(undefined);
      return;
    }
    if (manualAdjustmentEditor !== undefined) {
      setManualAdjustmentEditor(undefined);
      setGradingMutationError(undefined);
      return;
    }
    if (deleteManualAdjustmentConfirmation !== undefined) {
      setDeleteManualAdjustmentConfirmation(undefined);
      setGradingMutationError(undefined);
      return;
    }
    if (markCompleteConfirmation !== undefined) {
      setMarkCompleteConfirmation(undefined);
      setGradingMutationError(undefined);
      return;
    }
    if (reportPreview.status === "success") {
      setReportPreview({ status: "idle" });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isGradingShortcutSuppressedTarget(event.target)) return;
      const key = event.key;
      if (publishReviewOpen) {
        if (key === "Escape") {
          closeTopmostPanel();
          return;
        }
        if (key === "?") {
          event.preventDefault();
          setCheatSheetOpen(true);
        }
        return;
      }
      if (key === "j" || key === "J") {
        event.preventDefault();
        if (event.shiftKey) goToNextRosterStudent();
        else goToFilteredStudent("next");
        return;
      }
      if (key === "k" || key === "K") {
        event.preventDefault();
        goToFilteredStudent("previous");
        return;
      }
      if (key === "/") {
        event.preventDefault();
        focusStudentFilter();
        return;
      }
      if (key === "c" || key === "C") {
        event.preventDefault();
        openAddCommentEditor();
        return;
      }
      if (key === "m" || key === "M") {
        event.preventDefault();
        openAddManualAdjustmentEditor();
        return;
      }
      if (key === "h" || key === "H") {
        event.preventDefault();
        handleCommitHistoryShortcut();
        return;
      }
      if (key === "a" || key === "A") {
        event.preventDefault();
        handleAutomatedChecksShortcut();
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        markCompleteAndAdvance();
        return;
      }
      if (key === "p" || key === "P") {
        event.preventDefault();
        openPublishReview();
        return;
      }
      if (key === "Escape") {
        closeTopmostPanel();
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setCheatSheetOpen(true);
        return;
      }
      if (key >= "1" && key <= "9") {
        event.preventDefault();
        applyReusableCommentByPosition(Number(key));
      }
    };
    // Re-registered every render (cheap: one listener, infrequent event) so the
    // handler always closes over the latest state instead of a stale render's.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  });

  if (result === null)
    return (
      <main className="dashboard-shell">
        <p>Preparing grading workspace…</p>
      </main>
    );
  if (!isReady(result)) {
    const message: Record<string, string> = {
      faculty_identity_required: "Configure your local faculty MSOE username before grading.",
      no_assigned_sections: "Your faculty username is not assigned to sections for this term.",
      roster_error: "Roster data must be corrected before grading.",
      term_config_error: "Term configuration could not be prepared.",
      assignment_config_error: "Assignment configuration could not be prepared.",
      grading_state_error: `Grading state for ${result.studentId ?? "a student"} could not be read.`
    };
    return (
      <main className="dashboard-shell">
        <p>{message[result.status] ?? "Grading workspace could not be prepared."}</p>
      </main>
    );
  }
  const student = result.students[selected];
  const publishReviewOutcomeByStudentId: Readonly<Record<string, PublishReviewOutcome>> =
    Object.fromEntries(
      (publishReviewResults ?? []).map(({ studentId, result: publicationResult }) => [
        studentId,
        publishReviewOutcomeFromResult(publicationResult)
      ])
    );
  const publishReviewReadyRows: readonly PublishReviewReadyRow[] = publishReviewReadyEntries.map(
    (entry) => {
      const outcome = publishReviewOutcomeByStudentId[entry.studentId];
      return {
        studentId: entry.studentId,
        section: entry.section,
        detail: publishReviewDetails[entry.studentId] ?? { status: "loading" },
        ...(outcome === undefined ? {} : { outcome })
      };
    }
  );
  const publishReviewPublishedRows: readonly PublishReviewPublishedRow[] =
    publishReviewPublishedEntries.map((entry) => {
      const outcome = publishReviewOutcomeByStudentId[entry.studentId];
      return {
        studentId: entry.studentId,
        section: entry.section,
        ...(outcome === undefined ? {} : { outcome })
      };
    });
  const publishedProgressPercent =
    allStudentsCount === 0 ? 0 : (publishedCount / allStudentsCount) * 100;
  const gradedNotPublishedProgressPercent =
    allStudentsCount === 0
      ? 0
      : ((gradedOrPublishedCount - publishedCount) / allStudentsCount) * 100;
  const header = (
    <GradingProgressHeader
      assignmentTitle={result.assignment.title}
      termCode={result.assignment.termCode}
      assignmentSlug={result.assignment.slug}
      allStudentsCount={allStudentsCount}
      gradedOrPublishedCount={gradedOrPublishedCount}
      publishedCount={publishedCount}
      publishedProgressPercent={publishedProgressPercent}
      gradedNotPublishedProgressPercent={gradedNotPublishedProgressPercent}
      completeCount={completeStudentIds.length}
      publishReviewOpen={publishReviewOpen}
      onOpenPublishReview={openPublishReview}
      onOpenCheatSheet={() => setCheatSheetOpen(true)}
    />
  );

  const footer = <GradingFooterHintBar />;

  const cheatSheet = (
    <GradingKeyboardCheatSheetModal
      open={cheatSheetOpen}
      onClose={() => setCheatSheetOpen(false)}
    />
  );

  const discardDraftPrompt =
    discardDraftConfirmation === undefined ? null : (
      <ConfirmationWithPreviewModal
        isOpen
        title={`Discard the unsaved ${discardDraftConfirmation.kind}?`}
        summary={
          <p>
            You have unsaved changes in the {discardDraftConfirmation.kind} you were editing.
            Continuing will discard them. This cannot be undone.
          </p>
        }
        confirmLabel={`Discard ${discardDraftConfirmation.kind}`}
        successMessage={`Discarded the unsaved ${discardDraftConfirmation.kind}.`}
        onConfirm={() => confirmDiscardDraft()}
        onSuccess={(successMessage) => {
          setDiscardDraftConfirmation(undefined);
          showToast(successMessage);
        }}
        onCancel={cancelDiscardDraft}
      />
    );

  if (publishReviewOpen)
    return (
      <main className="dashboard-shell grading-workspace">
        {header}
        <GradingPublishReviewPanel
          readyRows={publishReviewReadyRows}
          publishedRows={publishReviewPublishedRows}
          notGradedCount={toGradeCount}
          selectedIds={publishReviewSelectedIds}
          onToggle={togglePublishReviewSelection}
          onCancel={cancelPublishReview}
          onPublish={() => void runPublishReview()}
          running={publishReviewRunning}
          refreshFailedStudentIds={publishReviewRefreshFailedStudentIds}
        />
        {footer}
        {cheatSheet}
        {discardDraftPrompt}
        <Toast message={toastMessage} />
      </main>
    );

  return (
    <main className="dashboard-shell grading-workspace">
      {header}
      <div className="grading-workspace__grid">
        <GradingStudentListPane
          totalStudentsCount={result.students.length}
          filteredStudents={filteredStudents}
          selectedIndex={selected}
          studentFilter={studentFilter}
          onFilterChange={setStudentFilter}
          filterPillsContainerRef={filterPillsContainerRef}
          toGradeCount={toGradeCount}
          gradedOnlyCount={gradedOnlyCount}
          publishedCount={publishedCount}
          allStudentsCount={allStudentsCount}
          emptyMessage={STUDENT_FILTER_EMPTY_MESSAGE[studentFilter]}
          statusLabel={label}
          onSelectStudent={(index) => {
            if (index === selected) return;
            requestStudentSwitch(() => {
              void flushPendingViewState(student?.studentId);
              setSelected(index);
            });
          }}
          onPrevious={() => goToFilteredStudent("previous")}
          onNext={() => goToFilteredStudent("next")}
          hasPrevious={getStudentNavigationTarget(filteredStudents, "previous") !== undefined}
          hasNext={getStudentNavigationTarget(filteredStudents, "next") !== undefined}
        />
        <GradingSubmissionViewerPane
          hasSelectedStudent={student !== undefined}
          viewStateWarning={
            student === undefined ? undefined : viewStateWarnings[student.studentId]
          }
          source={source}
          snapshotStudentId={
            snapshot.status === "success" ? snapshot.snapshot.studentId : undefined
          }
          sourceAnnotations={sourceAnnotations}
          canonicalSourceTarget={canonicalSourceTarget}
          gradingMutationStudentId={gradingMutationStudentId}
          isStudentMutationBlocked={(studentId) =>
            gradingMutationBlockedStudents.current.has(studentId)
          }
          onCanonicalSelectionChange={(studentId, target) => {
            if (currentStudentIdRef.current === studentId) setCanonicalSourceTarget(target);
          }}
          onScheduleViewStateSave={scheduleViewStateSave}
          onAddComment={openAddCommentEditor}
          sourceTargetLabel={sourceTargetLabel}
        />
        <aside className="grading-workspace__grading-pane">
          <h2>Grading</h2>
          {student === undefined || snapshot.status === "idle" ? (
            <p>Select a student to view grading details.</p>
          ) : (snapshot.status === "success" ? snapshot.snapshot.studentId : snapshot.studentId) !==
            student.studentId ? (
            <p aria-live="polite">Loading grading details for {student.studentId}…</p>
          ) : snapshot.status === "loading" ? (
            <p aria-live="polite">Loading grading details for {snapshot.studentId}…</p>
          ) : snapshot.status === "failure" ? (
            <div className="grading-panel-message" role="alert">
              <strong>Grading details unavailable for {snapshot.studentId}</strong>
              <p>{snapshot.message}</p>
            </div>
          ) : (
            <div className="grading-student-snapshot">
              <p>
                Status: <strong>{label(currentEffectiveStatus ?? "")}</strong>
              </p>
              {currentEffectiveStatus === "not_started" ||
              currentEffectiveStatus === "in_progress" ? (
                <div className="grading-complete-action">
                  <button
                    className="primary-action"
                    type="button"
                    disabled={
                      publishReviewRunning ||
                      gradingMutationStudentId !== undefined ||
                      gradingMutationBlockedStudents.current.has(snapshot.snapshot.studentId)
                    }
                    onClick={() => openMarkCompleteConfirmation(snapshot.snapshot.studentId)}
                  >
                    Mark Complete
                  </button>
                </div>
              ) : null}
              {currentEffectiveStatus === "complete" || currentEffectiveStatus === "published" ? (
                <div className="grading-publication-action">
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={
                      reportPreview.status === "loading" &&
                      reportPreview.studentId === snapshot.snapshot.studentId
                    }
                    onClick={() => void previewReport(snapshot.snapshot.studentId)}
                  >
                    {reportPreview.status === "loading" &&
                    reportPreview.studentId === snapshot.snapshot.studentId
                      ? "Preparing Preview…"
                      : "Preview Report"}
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={
                      gradingMutationStudentId !== undefined ||
                      gradingMutationBlockedStudents.current.has(snapshot.snapshot.studentId)
                    }
                    onClick={() =>
                      openReportPublicationConfirmation(
                        snapshot.snapshot.studentId,
                        currentEffectiveStatus === "published" ? "republish" : "publish"
                      )
                    }
                  >
                    {reportPublicationStudentId === snapshot.snapshot.studentId
                      ? "Publishing…"
                      : currentEffectiveStatus === "published"
                        ? "Republish this student's report"
                        : "Publish this student's report"}
                  </button>
                </div>
              ) : null}
              {reportPreview.status === "failure" &&
              reportPreview.studentId === snapshot.snapshot.studentId ? (
                <div
                  className="grading-publication-message grading-publication-message--error"
                  role="alert"
                >
                  <p>{reportPreview.message}</p>
                </div>
              ) : null}
              {reportPublicationNotice !== undefined &&
              reportPublicationNotice.studentId === snapshot.snapshot.studentId ? (
                <div
                  className={`grading-publication-message grading-publication-message--${reportPublicationNotice.tone}`}
                  role={reportPublicationNotice.tone === "error" ? "alert" : "status"}
                >
                  <p>{reportPublicationNotice.message}</p>
                  {reportPublicationNotice.warnings === undefined ? null : (
                    <ul>
                      {reportPublicationNotice.warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
              <ConfirmationWithPreviewModal
                isOpen={
                  reportPublicationConfirmation?.studentId === snapshot.snapshot.studentId &&
                  reportPublicationConfirmation.studentId === currentStudentId
                }
                title={
                  reportPublicationConfirmation?.operation === "republish"
                    ? "Republish this student's grading report?"
                    : "Publish this student's grading report?"
                }
                summary={
                  reportPublicationConfirmation?.operation === "republish" ? (
                    <p>
                      This will regenerate the completed grading report. The existing Graider report
                      may be updated in the student's repository.
                    </p>
                  ) : (
                    <p>This will write the completed grading report to the student's repository.</p>
                  )
                }
                confirmDisabled={publishReviewRunning || gradingMutationStudentId !== undefined}
                confirmLabel={
                  reportPublicationConfirmation?.operation === "republish"
                    ? "Confirm republish this student's report"
                    : "Confirm publish this student's report"
                }
                onConfirm={confirmPublishReport}
                // confirmPublishReport never rejects and already closes this
                // modal itself in a finally block, reporting every outcome
                // -- success, warning, and error alike -- through
                // reportPublicationNotice above, independent of this
                // component's success/error contract. A generic toast here
                // would be redundant on success and misleading on failure.
                onSuccess={() => undefined}
                onCancel={() => setReportPublicationConfirmation(undefined)}
              />
              {reportPreview.status === "success" &&
              reportPreview.studentId === snapshot.snapshot.studentId ? (
                <div className="confirmation-modal__backdrop">
                  <div
                    className="confirmation-modal grading-report-preview"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="grading-report-preview-heading"
                  >
                    <h2 id="grading-report-preview-heading">Report Preview</h2>
                    {reportPreview.warnings.length === 0 ? null : (
                      <div className="grading-report-preview__warnings" role="status">
                        <p>This report will be published with these warnings:</p>
                        <ul>
                          {reportPreview.warnings.map((warning) => (
                            <li key={warning}>{previewWarningMessage(warning)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <iframe
                      className="grading-report-preview__frame"
                      title="Grading report preview"
                      sandbox=""
                      srcDoc={reportPreview.html}
                    />
                    <div className="grading-apply-comment__actions">
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => setReportPreview({ status: "idle" })}
                      >
                        Close report preview
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {markCompleteConfirmation !== undefined &&
              markCompleteConfirmation.studentId === snapshot.snapshot.studentId ? (
                <div
                  className="grading-delete-comment-confirmation"
                  role="alertdialog"
                  aria-labelledby="mark-complete-heading"
                >
                  <h3 id="mark-complete-heading">
                    Mark {markCompleteConfirmation.studentId} grading complete?
                  </h3>
                  <p>
                    Grading feedback can still be edited afterward. This does not publish feedback.
                  </p>
                  <div className="grading-apply-comment__actions">
                    <button
                      className="primary-action"
                      type="button"
                      disabled={gradingMutationStudentId === markCompleteConfirmation.studentId}
                      onClick={() => void confirmMarkComplete()}
                    >
                      {gradingMutationStudentId === markCompleteConfirmation.studentId
                        ? "Marking Complete…"
                        : "Confirm Mark Complete"}
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={gradingMutationStudentId === markCompleteConfirmation.studentId}
                      onClick={() => {
                        setMarkCompleteConfirmation(undefined);
                        setGradingMutationError(undefined);
                      }}
                    >
                      Cancel marking complete
                    </button>
                  </div>
                </div>
              ) : null}
              <GradingScorePanel grade={snapshot.snapshot.grade} />
              <GradingAppliedCommentsPanel
                appliedComments={snapshot.snapshot.appliedComments}
                categories={snapshot.snapshot.grade.categories}
                studentId={snapshot.snapshot.studentId}
                gradingMutationStudentId={gradingMutationStudentId}
                isStudentMutationBlocked={(studentId) =>
                  gradingMutationBlockedStudents.current.has(studentId)
                }
                onEdit={openEditEditor}
                onRequestDelete={openDeleteCommentConfirmation}
                deleteConfirmation={deleteConfirmation}
                onConfirmDelete={() => void confirmDeleteComment()}
                onCancelDelete={() => {
                  setDeleteConfirmation(undefined);
                  setGradingMutationError(undefined);
                }}
                sourceLocationLabel={sourceLocationLabel}
              />
              <GradingManualAdjustmentsPanel
                manualAdjustments={snapshot.snapshot.manualAdjustments}
                categories={snapshot.snapshot.grade.categories}
                rubric={result.rubric}
                studentId={snapshot.snapshot.studentId}
                gradingMutationStudentId={gradingMutationStudentId}
                isStudentMutationBlocked={(studentId) =>
                  gradingMutationBlockedStudents.current.has(studentId)
                }
                onAdd={openAddManualAdjustmentEditor}
                onEdit={openEditManualAdjustmentEditor}
                onRequestDelete={openDeleteManualAdjustmentConfirmation}
                editor={manualAdjustmentEditor}
                onEditorChange={setManualAdjustmentEditor}
                onSubmitEditor={() => void saveManualAdjustmentEditor()}
                onCancelEditor={() => {
                  setManualAdjustmentEditor(undefined);
                  setGradingMutationError(undefined);
                }}
                deleteConfirmation={deleteManualAdjustmentConfirmation}
                onConfirmDelete={() => void confirmDeleteManualAdjustment()}
                onCancelDelete={() => {
                  setDeleteManualAdjustmentConfirmation(undefined);
                  setGradingMutationError(undefined);
                }}
                signedAmount={signedAmount}
              />
            </div>
          )}
          <GradingEvidencePanel
            state={evidence}
            commitHistory={commitHistory}
            onReload={(studentId) => void loadEvidence(studentId)}
            open={evidencePanelOpen}
            onOpenChange={setEvidencePanelOpen}
            focusRequest={evidenceFocusRequest}
          />
          <GradingWorkflowRepairPanel
            workflowRepair={workflowRepair}
            onOpenWorkflowRepairConfirmation={openWorkflowRepairConfirmation}
            workflowRepairNotice={workflowRepairNotice}
            studentId={student?.studentId}
            bulkWorkflowRepairState={bulkWorkflowRepairState}
            bulkRepairAvailable={window.graiderUI.repairGradingAssignmentWorkflows !== undefined}
            onOpenBulkWorkflowRepairConfirmation={openBulkWorkflowRepairConfirmation}
            bulkWorkflowRepairResult={bulkWorkflowRepairResult}
            bulkWorkflowRepairConfirmation={bulkWorkflowRepairConfirmation}
            onCancelBulkWorkflowRepairConfirmation={() => setBulkWorkflowRepairConfirmation(false)}
            onConfirmBulkWorkflowRepair={confirmBulkWorkflowRepair}
            workflowRepairConfirmation={workflowRepairConfirmation}
            onCancelWorkflowRepairConfirmation={() => setWorkflowRepairConfirmation(undefined)}
            onConfirmWorkflowRepair={confirmWorkflowRepair}
          />
          <section className="grading-comment-library" aria-labelledby="comment-library-heading">
            <h3 id="comment-library-heading">Comment library</h3>
            {libraryMutationMessage === undefined ? null : (
              <div className="grading-panel-message" role="status">
                {libraryMutationMessage}
              </div>
            )}
            {gradingMutationError === undefined ? null : (
              <div className="grading-panel-message" role="alert">
                {gradingMutationError}
              </div>
            )}
            {promotionOffer === undefined ||
            promotionOffer.studentId !== student?.studentId ? null : (
              <div className="grading-comment-promotion" role="status">
                <span>Comment applied.</span>
                <button
                  className="secondary-action"
                  onClick={() =>
                    setLibraryEditor({
                      operation: "create",
                      value: promotionOffer.value,
                      promotion: promotionOffer
                    })
                  }
                  type="button"
                >
                  Save to course library
                </button>
                <button
                  className="secondary-action"
                  onClick={() => setPromotionOffer(undefined)}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            )}
            {commentEditor !== undefined && commentEditor.studentId === student?.studentId ? (
              <GradingCommentEditorForm
                editor={commentEditor}
                onEditorChange={setCommentEditor}
                rubric={result.rubric}
                canonicalSourceTarget={canonicalSourceTarget}
                gradingMutationStudentId={gradingMutationStudentId}
                isStudentMutationBlocked={(studentId) =>
                  gradingMutationBlockedStudents.current.has(studentId)
                }
                onSubmit={() => void saveCommentEditor()}
                onCancel={() => {
                  setCommentEditor(undefined);
                  setGradingMutationError(undefined);
                }}
                sourceTargetLabel={sourceTargetLabel}
              />
            ) : null}
            <GradingCommentLibraryBrowser
              commentLibrary={commentLibrary}
              commentSearch={commentSearch}
              onSearchChange={setCommentSearch}
              availableCommentTags={availableCommentTags}
              selectedCommentTags={selectedCommentTags}
              onTagsChange={setSelectedCommentTags}
              matchingComments={matchingComments}
              studentId={student?.studentId}
              gradingMutationStudentId={gradingMutationStudentId}
              isStudentMutationBlocked={(studentId) =>
                gradingMutationBlockedStudents.current.has(studentId)
              }
              onApply={openApplyEditor}
              libraryMutationPending={libraryMutationPending}
              onNew={() => {
                setLibraryMutationMessage(undefined);
                setLibraryEditor({ operation: "create", value: emptyReusableCommentEditorValue() });
              }}
              onEdit={(comment) => {
                setLibraryMutationMessage(undefined);
                setLibraryEditor({
                  operation: "edit",
                  commentId: comment.id,
                  value: {
                    title: comment.title,
                    text: comment.text,
                    defaultDeduction: comment.defaultDeduction,
                    defaultRubricCategoryId: comment.defaultRubricCategoryId,
                    tags: comment.tags
                  }
                });
              }}
              onDelete={(comment) => {
                setLibraryMutationMessage(undefined);
                setLibraryDeleteConfirmation(comment);
              }}
            />
            {libraryEditor === undefined ? null : (
              <ReusableCommentEditor
                categories={result.rubric}
                initialValue={libraryEditor.value}
                onCancel={() => {
                  const promotion =
                    libraryEditor.operation === "create" ? libraryEditor.promotion : undefined;
                  if (promotion !== undefined)
                    setPromotionOffer((current) =>
                      current !== undefined &&
                      current.studentId === promotion.studentId &&
                      current.appliedCommentId === promotion.appliedCommentId
                        ? undefined
                        : current
                    );
                  setLibraryEditor(undefined);
                }}
                onSave={(value) => void saveLibraryEditor(value)}
                pending={libraryMutationPending}
                tagSuggestions={availableCommentTags}
              />
            )}
          </section>
        </aside>
      </div>
      {footer}
      {cheatSheet}
      {discardDraftPrompt}
      <ConfirmDialog
        confirmLabel="Delete reusable comment"
        diff={
          libraryDeleteConfirmation === undefined
            ? []
            : [
                {
                  id: libraryDeleteConfirmation.id,
                  type: "removed",
                  label: libraryDeleteConfirmation.title
                }
              ]
        }
        isConfirming={libraryMutationPending}
        isOpen={libraryDeleteConfirmation !== undefined}
        onCancel={() => setLibraryDeleteConfirmation(undefined)}
        onConfirm={() => void deleteLibraryComment()}
        summary="This deletes the reusable course-library entry. Comments already applied to students are unchanged."
        title="Delete reusable comment?"
      />
      <Toast message={toastMessage} />
    </main>
  );
};
