import { IPC_CHANNELS } from "./ipc.js";
/** Closed inventory of operations whose course authorization can be checked entirely locally.
 * Evidence observes student Actions under its own authenticated reader; it must never
 * synchronize or exclusively lock the course cache. It cannot authorize writes.
 */
export const LOCAL_COURSE_READ_CHANNELS: readonly string[] = Object.freeze([
  IPC_CHANNELS.refreshCourseDisplay,
  IPC_CHANNELS.getCoursePublishStatus,
  IPC_CHANNELS.loadAssignmentSetupTerms,
  IPC_CHANNELS.getAssignmentForEdit,
  IPC_CHANNELS.getAssignmentGroupConfig,
  IPC_CHANNELS.getStudentRepositoryAccessPageStatus,
  IPC_CHANNELS.loadRosterTerms,
  IPC_CHANNELS.getRosterForSection,
  IPC_CHANNELS.getRosterSectionSummaries,
  IPC_CHANNELS.loadGradingCommentLibrary,
  IPC_CHANNELS.getAssignmentDetail,
  IPC_CHANNELS.getAssignmentGradingLifecycle,
  IPC_CHANNELS.loadGradingStudentDocument,
  IPC_CHANNELS.loadGradingStudentViewState,
  IPC_CHANNELS.loadGradingStudentCommitHistory,
  IPC_CHANNELS.loadGradingStudentEvidence
]);
export const MANAGED_V2_LOCAL_READ_CHANNELS: readonly string[] = Object.freeze([
  IPC_CHANNELS.loadRosterTerms,
  IPC_CHANNELS.getRosterForSection,
  IPC_CHANNELS.getRosterSectionSummaries,
  IPC_CHANNELS.loadGradingCommentLibrary
]);
/** Existing explicit remote observations/preparations retain their stronger guard. */
export const SYNCHRONIZED_COURSE_READ_CHANNELS: readonly string[] = Object.freeze([
  IPC_CHANNELS.refreshCourseFolder,
  IPC_CHANNELS.previewCourseSetup,
  IPC_CHANNELS.previewAssignmentSetup,
  IPC_CHANNELS.previewAssignmentEdit,
  IPC_CHANNELS.previewRosterSave,
  IPC_CHANNELS.getTemplateWorkflow,
  IPC_CHANNELS.previewTemplateWorkflowSave,
  IPC_CHANNELS.chooseReviewImport,
  IPC_CHANNELS.previewGradingStudentReport,
  IPC_CHANNELS.getAssignmentApplyPreview,
  IPC_CHANNELS.getAssignmentGradePreview,
  IPC_CHANNELS.getAssignmentGradeStatus,
  IPC_CHANNELS.getFacultyReport
]);
/** Schema 1 grading state stays local. No course/student Git writes or remote observations. */
export const LOCAL_GRADING_READ_CHANNELS: readonly string[] = Object.freeze([
  IPC_CHANNELS.loadGradingStudentSource,
  IPC_CHANNELS.loadGradingStudentSnapshot
]);
/** Pull uses this local course lease plus its own OAuth and student Git boundary. */
export const LOCAL_GRADING_MUTATION_CHANNELS: readonly string[] = Object.freeze([
  IPC_CHANNELS.pullLatestGradingStudentChanges,
  IPC_CHANNELS.prepareGradingWorkspace,
  IPC_CHANNELS.saveGradingStudentViewState,
  IPC_CHANNELS.clearGradingStudentViewState,
  IPC_CHANNELS.markGradingStudentComplete,
  IPC_CHANNELS.addGradingStudentComment,
  IPC_CHANNELS.editGradingStudentComment,
  IPC_CHANNELS.deleteGradingStudentComment,
  IPC_CHANNELS.addGradingStudentManualAdjustment,
  IPC_CHANNELS.editGradingStudentManualAdjustment,
  IPC_CHANNELS.deleteGradingStudentManualAdjustment
]);
type ManagedOperationFamily =
  keyof typeof import("../dist-electron/managedOperationBackend.cjs").MANAGED_OPERATION_SUPPORT;

/** Main-owned channel classification. Unknown operations never inherit v2 support. */
export const managedOperationFamily = (channel: string): ManagedOperationFamily => {
  const families: ReadonlyArray<readonly [ManagedOperationFamily, readonly string[]]> = [
    ["course-lifecycle", [IPC_CHANNELS.changeManagedCourseLifecycle]],
    ["term-lifecycle", [IPC_CHANNELS.changeManagedTermLifecycle]],
    [
      "roster-read",
      [
        IPC_CHANNELS.loadRosterTerms,
        IPC_CHANNELS.getRosterForSection,
        IPC_CHANNELS.getRosterSectionSummaries
      ]
    ],
    ["comments-read", [IPC_CHANNELS.loadGradingCommentLibrary]],
    [
      "roster-write",
      [
        IPC_CHANNELS.saveRoster,
        IPC_CHANNELS.removeRoster,
        IPC_CHANNELS.removeSection,
        IPC_CHANNELS.previewRosterSave
      ]
    ],
    [
      "comments-write",
      [
        IPC_CHANNELS.createGradingLibraryComment,
        IPC_CHANNELS.editGradingLibraryComment,
        IPC_CHANNELS.deleteGradingLibraryComment
      ]
    ],
    [
      "assignment",
      [
        IPC_CHANNELS.loadAssignmentSetupTerms,
        IPC_CHANNELS.saveAssignmentSetup,
        IPC_CHANNELS.previewAssignmentSetup,
        IPC_CHANNELS.getAssignmentForEdit,
        IPC_CHANNELS.previewAssignmentEdit,
        IPC_CHANNELS.saveAssignmentEdit,
        IPC_CHANNELS.deleteAssignment,
        IPC_CHANNELS.getAssignmentGroupConfig,
        IPC_CHANNELS.saveAssignmentGroupConfig
      ]
    ],
    ["apply", [IPC_CHANNELS.applyAssignment, IPC_CHANNELS.getAssignmentApplyPreview]],
    [
      "repositories",
      [
        IPC_CHANNELS.downloadAssignmentRepositories,
        IPC_CHANNELS.pullLatestGradingStudentChanges,
        IPC_CHANNELS.loadGradingStudentSource,
        IPC_CHANNELS.loadGradingStudentSnapshot,
        IPC_CHANNELS.loadGradingStudentCommitHistory
      ]
    ],
    [
      "workflows",
      [
        IPC_CHANNELS.gradeAssignment,
        IPC_CHANNELS.getAssignmentGradePreview,
        IPC_CHANNELS.getAssignmentGradeStatus,
        IPC_CHANNELS.repairGradingStudentWorkflow,
        IPC_CHANNELS.repairGradingAssignmentWorkflows
      ]
    ],
    [
      "templates",
      [
        IPC_CHANNELS.getTemplateWorkflow,
        IPC_CHANNELS.previewTemplateWorkflowSave,
        IPC_CHANNELS.saveTemplateWorkflow,
        IPC_CHANNELS.replaceTemplateManagedWorkflow,
        IPC_CHANNELS.prepareAssignmentTemplateSync,
        IPC_CHANNELS.executeAssignmentTemplateSync
      ]
    ],
    [
      "reports",
      [
        IPC_CHANNELS.getFacultyReport,
        IPC_CHANNELS.previewGradingStudentReport,
        IPC_CHANNELS.publishGradingStudentReport,
        IPC_CHANNELS.bulkPublishGradingStudentReports
      ]
    ],
    [
      "access-pages",
      [IPC_CHANNELS.saveStudentAccessPagesConfig, IPC_CHANNELS.publishStudentRepositoryAccessPage]
    ],
    ["course-configuration", [IPC_CHANNELS.saveCourseSetup, IPC_CHANNELS.previewCourseSetup]],
    ["publication", [IPC_CHANNELS.publishCourseChanges, IPC_CHANNELS.getCoursePublishStatus]]
  ];
  return families.find(([, channels]) => channels.includes(channel))?.[0] ?? "grading";
};

/** Local/runtime writes are mutations even when no course-admin commit is produced. */
export const COURSE_RUNTIME_MUTATION_CHANNELS: readonly string[] = Object.freeze([
  IPC_CHANNELS.downloadAssignmentRepositories,
  IPC_CHANNELS.prepareGradingWorkspace,
  IPC_CHANNELS.applyReviewImport,
  IPC_CHANNELS.saveGradingStudentViewState,
  IPC_CHANNELS.clearGradingStudentViewState,
  IPC_CHANNELS.pullLatestGradingStudentChanges,
  IPC_CHANNELS.markGradingStudentComplete,
  IPC_CHANNELS.addGradingStudentComment,
  IPC_CHANNELS.editGradingStudentComment,
  IPC_CHANNELS.deleteGradingStudentComment,
  IPC_CHANNELS.addGradingStudentManualAdjustment,
  IPC_CHANNELS.editGradingStudentManualAdjustment,
  IPC_CHANNELS.deleteGradingStudentManualAdjustment
]);
