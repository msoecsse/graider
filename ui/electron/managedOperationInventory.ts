import { IPC_CHANNELS } from "./ipc.js";
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
