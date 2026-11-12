import { measureStartup } from "./gradingPerformance.js";
import { loadDashboardDisplay, saveDashboardDisplay } from "./dashboardDisplayCache.js";
import { loadCourseSnapshot, saveCourseSnapshot } from "./courseDiscoverySnapshot.js";
import { createGithubOrganizationNetwork } from "./githubOrganizations.js";
import { inspectLocalManagedCourse } from "./managedCourseLocalRead.js";
import { courseContextRevision } from "./managedCourseMutationTypes.js";
import { createMigrationReviewProgressStore } from "./migrationReviewProgress.js";
import { createMigrationPublicationService } from "./migrationPublicationService.js";
import { createMigrationReconciliationService } from "./migrationReconciliationService.js";
import { createMigrationExecutionService } from "./migrationExecutionService.js";
import { registerMigrationExecutionIpc } from "./migrationExecutionIpc.js";
import {
  createMigrationReviewService,
  loadMigrationReviewBackend
} from "./migrationReviewService.js";
import { createMigrationReviewReader } from "./migrationReviewReader.js";
import { registerMigrationReviewIpc } from "./migrationReviewIpc.js";
import { projectManagedCourseResult } from "./managedCourseResultProjection.js";
import type { CourseFolderRecord } from "./ipc.js";
import {
  managedCourseOperation,
  courseOperationDocument
} from "./managedCourseOperationContext.js";
import { createCourseMutationIpc } from "./courseMutationIpc.js";
import { ManagedCourseMutationGuard } from "./managedCourseMutationGuard.js";
import {
  ManagedReconciliationService,
  latestPreservedCopy,
  resolvePreservedCopy,
  preservedRecoveryState
} from "./managedReconciliation.js";
import {
  createAuthenticatedProductionGitWorkspace,
  getProductionGitWorkspaceFactory
} from "./gitWorkspaceReader.js";
import {
  bootstrapManagedCourse,
  synchronizeManagedCourse,
  performSynchronization,
  loadManagedCatalog
} from "./managedCourses.js";
import { createRemoteRepositoryReader } from "./githubRemoteRepositories.js";
import { discoverRemoteCourses, inspectLocalCourseOrigins } from "./remoteCourseDiscovery.js";
import {
  createReviewImportService,
  loadReviewImportBackend,
  isImportApplyRequest
} from "./reviewImportService.js";
import path from "node:path";
import fs from "node:fs";
import { GithubOAuthSession } from "./githubOAuthSession.js";
import { RemoteCourseSetupService } from "./remoteCourseSetupService.js";
import { standaloneSetupHasRepository } from "./legacyCourseCompatibility.js";
import { createGithubOAuthCredentialStore } from "./githubOAuthCredentialStore.js";
import { createGithubOAuthNetwork } from "./githubOAuthNetwork.js";
import { readGithubOAuthSecret } from "./githubOAuthConfiguration.js";
import { GITHUB_OAUTH_CHANNELS } from "./githubOAuthTypes.js";
import {
  loadGradingStudentDocument,
  isGradingStudentDocumentRequest
} from "./gradingStudentDocumentService.js";
import { createGradingStudentRepositoryUpdateService } from "./gradingStudentRepositoryUpdateService.js";
import { BrowserWindow, app, dialog, ipcMain, shell, safeStorage } from "electron";
import { registerExternalNavigation } from "./externalNavigation.js";
import { applyAssignmentWithStudentRepositoryAccessPage } from "./assignmentApplyWithAccessPageService.js";
import { gradeAssignment } from "./assignmentGradeRunner.js";
import { getAssignmentApplyPreview } from "./assignmentApplyPreviewRunner.js";
import { getAssignmentGradePreview } from "./assignmentGradePreviewRunner.js";
import { getAssignmentGradeStatus } from "./assignmentGradeStatusRunner.js";
import { createNodeProcessRunner, type ProcessRunner } from "./commandRunner.js";
import { getAssignmentDetail } from "./assignmentDetailRunner.js";
import { runAssignmentRepositoryDownload } from "./assignmentRepositoryDownloadRunner.js";
import { prepareGradingWorkspace } from "./gradingWorkspaceService.js";
import { getAssignmentGradingLifecycle } from "./assignmentGradingLifecycleService.js";
import { loadGradingStudentSource } from "./gradingStudentSourceService.js";
import {
  clearGradingStudentViewState,
  loadGradingStudentViewState,
  saveGradingStudentViewState
} from "./gradingStudentViewStateService.js";
import { loadGradingStudentSnapshot } from "./gradingStudentSnapshotService.js";
import { loadGradingStudentEvidence } from "./gradingStudentEvidenceService.js";
import { repairGradingStudentWorkflow } from "./gradingStudentWorkflowRepairService.js";
import { repairGradingWorkflowsForAssignment } from "./gradingBulkWorkflowRepairService.js";
import { loadGradingStudentCommitHistory } from "./gradingStudentCommitHistoryService.js";
import { markGradingStudentComplete } from "./gradingStudentCompleteService.js";
import {
  previewGradingStudentReport,
  publishGradingStudentReport
} from "./gradingStudentReportPublicationService.js";
import { createGradingBulkReportPublicationService } from "./gradingBulkReportPublicationService.js";
import { isBulkPublishGradingStudentReportsRequest } from "./gradingBulkReportPublicationRequestValidation.js";
import {
  addGradingStudentComment,
  deleteGradingStudentComment,
  editGradingStudentComment
} from "./gradingStudentCommentService.js";
import {
  addGradingStudentManualAdjustment,
  deleteGradingStudentManualAdjustment,
  editGradingStudentManualAdjustment
} from "./gradingStudentManualAdjustmentService.js";
import {
  createGradingLibraryComment,
  deleteGradingLibraryComment,
  editGradingLibraryComment,
  loadGradingCommentLibrary
} from "./gradingCommentLibraryService.js";
import {
  isCreateGradingLibraryCommentRequest,
  isDeleteGradingLibraryCommentRequest,
  isEditGradingLibraryCommentRequest,
  isLoadGradingCommentLibraryRequest
} from "./gradingCommentLibraryRequestValidation.js";
import {
  isAddGradingStudentCommentRequest,
  isAddGradingStudentManualAdjustmentRequest,
  isDeleteGradingStudentCommentRequest,
  isDeleteGradingStudentManualAdjustmentRequest,
  isEditGradingStudentCommentRequest,
  isEditGradingStudentManualAdjustmentRequest,
  isGradingStudentViewStateRequest,
  isLoadGradingStudentSourceRequest,
  isLoadGradingStudentCommitHistoryRequest,
  isLoadGradingStudentEvidenceRequest,
  isGradingStudentWorkflowRepairRequest,
  isGradingBulkWorkflowRepairRequest,
  isMarkGradingStudentCompleteRequest,
  isPublishGradingStudentReportRequest,
  isSaveGradingStudentViewStateRequest
} from "./gradingStudentViewStateRequestValidation.js";
import { isPrepareGradingWorkspaceRequest } from "./gradingWorkspaceRequestValidation.js";
import { isAssignmentGradingLifecycleRequest } from "./assignmentGradingLifecycleRequestValidation.js";
import {
  getLocalRepositoryLocatorPath,
  recordSuccessfulDownloadLocators
} from "./localRepositoryLocator.js";
import { registerAssignmentTemplateSyncIpc } from "./assignmentTemplateSyncIpc.js";
import { assignmentTemplateSyncService } from "./assignmentTemplateSyncService.js";
import { saveStudentAccessPagesConfig } from "./studentAccessPagesConfigService.js";
import { getCoursePublishStatus, publishCourseChanges } from "./coursePublishService.js";
import { publishSuccessfulCourseMutation } from "./courseMutationPublicationService.js";
import { getAssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import { getFacultyReport } from "./facultyReportRunner.js";
import { previewCourseSetup, saveCourseSetup } from "./courseSetupService.js";
import {
  getLocalSettingsPath,
  loadLocalSettings,
  saveCurrentFacultyMsoeUsername
} from "./localSettings.js";
import { selectNativeDirectory } from "./nativeDirectoryChooser.js";
import {
  loadAssignmentSetupTerms,
  previewAssignmentSetup,
  saveAssignmentSetup
} from "./assignmentSetupService.js";
import {
  getAssignmentForEdit,
  previewAssignmentEdit,
  saveAssignmentEdit
} from "./assignmentEditService.js";
import { deleteAssignment } from "./assignmentDeleteService.js";
import {
  getAssignmentGroupConfig,
  saveAssignmentGroupConfig
} from "./assignmentGroupConfigService.js";
import {
  generateStudentRepositoryAccessPage,
  getStudentRepositoryAccessPageStatus
} from "./studentRepositoryAccessPageService.js";
import { getStudentRepositoryAccessPagePublishStatus } from "./studentRepositoryAccessPagePublishStatusService.js";
import { publishStudentRepositoryAccessPage } from "./studentRepositoryAccessPagePublishService.js";
import {
  getRosterForSection,
  loadRosterTerms,
  previewRosterSave,
  saveRoster,
  removeRoster,
  removeSection
} from "./rosterManagerService.js";
import { getRosterSectionSummaries } from "./rosterSectionSummaryService.js";
import { createRosterSaveDependencies } from "./rosterProvenanceService.js";
import {
  refreshStudentRepositoryPages,
  removeRosterWithStudentRepositoryAccessPageRefresh,
  removeSectionWithStudentRepositoryAccessPageRefresh,
  saveRosterWithStudentRepositoryAccessPageRefresh
} from "./rosterStudentRepositoryAccessPageService.js";
import {
  isRosterRemoveRequest,
  isRosterSaveRequest,
  isRosterSectionRequest,
  isRosterSectionSummariesRequest
} from "./rosterRequestValidation.js";
import { checkGitHubAuth } from "./githubAuthChecker.js";
import { validateTemplateRepository } from "./templateRepositoryValidationService.js";
import {
  getTemplateWorkflow,
  previewTemplateWorkflowSave,
  saveTemplateWorkflow
} from "./templateWorkflowService.js";
import { replaceTemplateManagedWorkflow } from "./templateManagedWorkflowReplacementService.js";
import {
  addValidatedCourseFolderToRegistry,
  getCourseRegistryPath,
  listCourseFolders,
  removeCourseFolderFromRegistry,
  setStudentAccessPagesRepositoryFolder
} from "./courseRegistry.js";
import { refreshCourseFolder, refreshDashboard } from "./dashboardRunner.js";
import { getPreloadPath, getRendererDevServerUrl, getRendererEntry } from "./rendererPaths.js";
import {
  IPC_CHANNELS,
  type AppInfo,
  type AssignmentApplyRequest,
  type AssignmentApplyPreviewRequest,
  type AssignmentDetailRequest,
  type AssignmentGradeRequest,
  type AssignmentGradePreviewRequest,
  type AssignmentGradeStatusRequest,
  type FacultyReportRequest,
  type CourseSetupRequest,
  type AssignmentSetupRequest,
  type AssignmentSetupTermsRequest,
  type AssignmentEditRequest,
  type AssignmentDeleteRequest,
  type AssignmentGroupConfigRequest,
  type AssignmentGroupConfigSaveRequest,
  type StudentRepositoryAccessPageRequest,
  type TemplateWorkflowRequest,
  type TemplateWorkflowSaveRequest,
  type TemplateManagedWorkflowReplacementRequest,
  type StudentAccessPagesConfigRequest,
  type AssignmentRepositoryDownloadRequest
} from "./ipc.js";

const DEFAULT_WINDOW_WIDTH = 1180;
const DEFAULT_WINDOW_HEIGHT = 760;
const MIN_WINDOW_WIDTH = 860;
const MIN_WINDOW_HEIGHT = 620;
const DEBUG_ENV_NAME = "GRAIDER_UI_DEBUG";
const DEBUG_ENABLED_VALUE = "1";

export const getAppInfo = (): AppInfo => ({
  name: app.getName(),
  version: app.getVersion()
});

const isDebugEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env[DEBUG_ENV_NAME]?.trim() === DEBUG_ENABLED_VALUE;

const logDebugDiagnostic = (message: string): void => {
  if (isDebugEnabled()) {
    console.error(`[graider-ui] ${message}`);
  }
};

const logRendererDiagnostic = (message: string): void => {
  console.error(`[graider-ui] ${message}`);
};

const registerRendererDiagnostics = (window: BrowserWindow): void => {
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      logRendererDiagnostic(
        `Renderer failed to load: code=${String(errorCode)} description=${errorDescription} mainFrame=${String(isMainFrame)} url=${validatedUrl}`
      );
    }
  );

  window.webContents.on("render-process-gone", (_event, details) => {
    logRendererDiagnostic(
      `Renderer process exited: reason=${details.reason} exitCode=${String(details.exitCode)}`
    );
  });

  window.on("unresponsive", () => {
    logRendererDiagnostic("Renderer window became unresponsive.");
  });
};

const loadRenderer = (window: BrowserWindow): void => {
  const devServerUrl = getRendererDevServerUrl();
  const loadPromise =
    devServerUrl === undefined ? window.loadFile(getRendererEntry()) : window.loadURL(devServerUrl);

  loadPromise.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logRendererDiagnostic(`Renderer load failed: ${message}`);
  });
};

const isAssignmentDetailRequest = (value: unknown): value is AssignmentDetailRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as unknown as Record<string, unknown>;

  return (
    typeof request.courseFolderId === "string" &&
    typeof request.courseFolderPath === "string" &&
    typeof request.assignmentFile === "string"
  );
};
const isAssignmentApplyPreviewRequest = (value: unknown): value is AssignmentApplyPreviewRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentGradePreviewRequest = (value: unknown): value is AssignmentGradePreviewRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentGradeStatusRequest = (value: unknown): value is AssignmentGradeStatusRequest => {
  if (!isAssignmentDetailRequest(value)) {
    return false;
  }

  const request = value as unknown as Record<string, unknown>;
  const studentIds = request.studentIds;

  return (
    studentIds === undefined ||
    (Array.isArray(studentIds) && studentIds.every((studentId) => typeof studentId === "string"))
  );
};

const isFacultyReportRequest = (value: unknown): value is FacultyReportRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentApplyRequest = (value: unknown): value is AssignmentApplyRequest =>
  isAssignmentDetailRequest(value);
const isAssignmentRepositoryDownloadRequest = (
  value: unknown
): value is AssignmentRepositoryDownloadRequest =>
  isAssignmentDetailRequest(value) &&
  typeof (value as unknown as Record<string, unknown>).destination === "string";

const isAssignmentGradeRequest = (value: unknown): value is AssignmentGradeRequest =>
  isAssignmentDetailRequest(value);

const isCourseSetupRequest = (value: unknown): value is CourseSetupRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  const rosterUploads = request.rosterUploads;
  return (
    typeof request.courseFolderPath === "string" &&
    typeof request.courseTitle === "string" &&
    typeof request.courseCode === "string" &&
    typeof request.githubOrganization === "string" &&
    (request.gradingEnabled === undefined || typeof request.gradingEnabled === "boolean") &&
    typeof request.termCode === "string" &&
    Array.isArray(request.sections) &&
    request.sections.every(
      (section) =>
        typeof section === "object" &&
        section !== null &&
        !Array.isArray(section) &&
        typeof (section as Record<string, unknown>).id === "string" &&
        Array.isArray((section as Record<string, unknown>).faculty) &&
        ((section as Record<string, unknown>).faculty as unknown[]).every(
          (username) => typeof username === "string"
        )
    ) &&
    Array.isArray(rosterUploads) &&
    rosterUploads.every(
      (upload) =>
        typeof upload === "object" &&
        upload !== null &&
        !Array.isArray(upload) &&
        typeof (upload as Record<string, unknown>).sectionId === "string" &&
        typeof (upload as Record<string, unknown>).content === "string"
    ) &&
    typeof request.confirmed === "boolean" &&
    typeof request.replaceExisting === "boolean"
  );
};

const isAssignmentSetupTermsRequest = (value: unknown): value is AssignmentSetupTermsRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return typeof request.courseFolderId === "string" && typeof request.courseFolderPath === "string";
};

const isAssignmentSetupRequest = (value: unknown): value is AssignmentSetupRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    typeof request.assignmentTitle === "string" &&
    typeof request.assignmentSlug === "string" &&
    typeof request.termCode === "string" &&
    Array.isArray(request.sectionIds) &&
    request.sectionIds.every((sectionId) => typeof sectionId === "string") &&
    typeof request.templateRepository === "string" &&
    typeof request.templateBranch === "string" &&
    typeof request.dueAt === "string" &&
    typeof request.gradingEnabled === "boolean" &&
    (typeof request.points === "number" || request.points === null) &&
    typeof request.facultyOwner === "string" &&
    typeof request.lmsAssignmentId === "string" &&
    typeof request.gradingCategory === "string" &&
    Array.isArray(request.requiredFiles) &&
    request.requiredFiles.every((file) => typeof file === "string") &&
    Array.isArray(request.rubric) &&
    request.rubric.every(
      (category) =>
        typeof category === "object" &&
        category !== null &&
        typeof (category as Record<string, unknown>).id === "string" &&
        typeof (category as Record<string, unknown>).name === "string" &&
        typeof (category as Record<string, unknown>).points === "number"
    ) &&
    typeof request.confirmed === "boolean" &&
    typeof request.replaceExisting === "boolean"
  );
};

const isAssignmentEditRequest = (value: unknown): value is AssignmentEditRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    typeof request.assignmentFile === "string" &&
    typeof request.assignmentTitle === "string" &&
    Array.isArray(request.sectionIds) &&
    request.sectionIds.every((section) => typeof section === "string") &&
    typeof request.templateRepository === "string" &&
    typeof request.templateBranch === "string" &&
    typeof request.dueAt === "string" &&
    typeof request.latePolicy === "string" &&
    typeof request.assignmentStatus === "string" &&
    typeof request.gradingEnabled === "boolean" &&
    (typeof request.points === "number" || request.points === null) &&
    typeof request.facultyOwner === "string" &&
    typeof request.lmsAssignmentId === "string" &&
    typeof request.gradingCategory === "string" &&
    (typeof request.gradingMode === "string" || request.gradingMode === null) &&
    (typeof request.gradingPreset === "string" || request.gradingPreset === null) &&
    Array.isArray(request.requiredFiles) &&
    request.requiredFiles.every((file) => typeof file === "string") &&
    Array.isArray(request.rubric) &&
    request.rubric.every(
      (category) =>
        typeof category === "object" &&
        category !== null &&
        typeof (category as Record<string, unknown>).id === "string" &&
        typeof (category as Record<string, unknown>).name === "string" &&
        typeof (category as Record<string, unknown>).points === "number"
    ) &&
    typeof request.originalContent === "string" &&
    typeof request.confirmed === "boolean"
  );
};

const isAssignmentDeleteRequest = (value: unknown): value is AssignmentDeleteRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return typeof request.assignmentFile === "string" && typeof request.confirmed === "boolean";
};

const isAssignmentGroupConfigRequest = (value: unknown): value is AssignmentGroupConfigRequest =>
  isAssignmentDetailRequest(value);

const isAssignmentGroupConfigSaveRequest = (
  value: unknown
): value is AssignmentGroupConfigSaveRequest => {
  if (!isAssignmentGroupConfigRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    (request.repositoryMode === "individual" || request.repositoryMode === "group") &&
    typeof request.groupsCsv === "string"
  );
};

const isStudentRepositoryAccessPageRequest = (
  value: unknown
): value is StudentRepositoryAccessPageRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  return typeof (value as unknown as Record<string, unknown>).assignmentFile === "string";
};

const isStudentAccessPagesConfigRequest = (
  value: unknown
): value is StudentAccessPagesConfigRequest => {
  if (!isAssignmentSetupTermsRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    typeof request.repository === "string" &&
    typeof request.baseUrl === "string" &&
    typeof request.branch === "string"
  );
};

const isTemplateWorkflowRequest = (value: unknown): value is TemplateWorkflowRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    (typeof request.templateRepository === "string" || request.templateRepository === null) &&
    (typeof request.templateBranch === "string" || request.templateBranch === null) &&
    (typeof request.workflowPath === "string" || request.workflowPath === null) &&
    typeof request.gradingEnabled === "boolean"
  );
};

const isTemplateWorkflowSaveRequest = (value: unknown): value is TemplateWorkflowSaveRequest => {
  if (!isTemplateWorkflowRequest(value)) return false;
  const request = value as unknown as Record<string, unknown>;
  return (
    (typeof request.assignmentSlug === "string" || request.assignmentSlug === null) &&
    typeof request.content === "string" &&
    (typeof request.loadedSha === "string" || request.loadedSha === null) &&
    typeof request.confirmed === "boolean"
  );
};

const isTemplateManagedWorkflowReplacementRequest = (
  value: unknown
): value is TemplateManagedWorkflowReplacementRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    (Object.keys(request).length === 5 || Object.keys(request).length === 6) &&
    typeof request.courseFolderId === "string" &&
    typeof request.courseFolderPath === "string" &&
    typeof request.termCode === "string" &&
    typeof request.assignmentSlug === "string" &&
    typeof request.confirmed === "boolean" &&
    (request.previewFingerprint === undefined || typeof request.previewFingerprint === "string")
  );
};

let oauthSession: GithubOAuthSession | undefined;
let courseMutationGuard: ManagedCourseMutationGuard | undefined;
let invalidateManagedCourseViews: (
  userId: number,
  repositoryId: number,
  commit: string,
  excludeId?: number
) => void = () => {};

export const registerIpcHandlers = (): void => {
  const courseIpc = createCourseMutationIpc(
    ipcMain,
    () => courseMutationGuard,
    (setupPath) => {
      const folder = [
        ...listCourseFolders(getCourseRegistryPath(app.getPath("userData"))),
        ...(courseMutationGuard?.remoteSelectors() ?? [])
      ].find((item) => item.path === setupPath);
      return {
        folderId: folder?.id,
        isNew:
          !folder &&
          typeof setupPath === "string" &&
          !fs.existsSync(path.join(setupPath, "course.yml")) &&
          !standaloneSetupHasRepository(setupPath)
      };
    },
    () => BrowserWindow.getAllWindows().map((window) => window.webContents)
  );
  invalidateManagedCourseViews = courseIpc.invalidateRevision;
  courseIpc.handle(IPC_CHANNELS.changeManagedCourseLifecycle, () => {
    throw new Error("Course lifecycle actions require an authoritative Schema 2 managed course.");
  });
  courseIpc.handle(IPC_CHANNELS.changeManagedTermLifecycle, () => {
    throw new Error(
      "Term lifecycle requires authoritative Schema 2 metadata and trusted operation evidence."
    );
  });
  const approvedCourseSetupRoots = new Set<string>();
  const baseProcessRunner = createNodeProcessRunner({
    graiderCli: app.isPackaged
      ? {
          mode: "bundled",
          appPath: app.getAppPath(),
          execPath: process.execPath
        }
      : {
          mode: "external"
        }
  });
  const processRunner: ProcessRunner = async (request) => {
    const operation = managedCourseOperation.getStore();
    if (
      operation &&
      request.command === "graider" &&
      request.args.some((argument) =>
        ["apply", "grade", "download-repositories", "report", "generate"].includes(argument)
      )
    )
      await operation.revalidate?.();
    return baseProcessRunner(
      operation?.managed && !operation.transaction
        ? {
            ...request,
            env: {
              ...(request.env ?? process.env),
              GRAIDER_MANAGED_COURSE_SOURCE: operation.courseFolderPath,
              GRAIDER_MANAGED_COURSE_RUNTIME: path.join(
                path.dirname(operation.courseFolderPath),
                "runtime"
              )
            }
          }
        : request
    );
  };
  const isRegisteredAssignmentSetupCourse = (request: AssignmentSetupTermsRequest): boolean =>
    (managedCourseOperation.getStore()?.courseFolderId === request.courseFolderId &&
      managedCourseOperation.getStore()?.courseFolderPath === request.courseFolderPath) ||
    listCourseFolders(getCourseRegistryPath(app.getPath("userData"))).some(
      (courseFolder) =>
        courseFolder.id === request.courseFolderId && courseFolder.path === request.courseFolderPath
    );
  const withRegisteredPagesFolder = (
    request: StudentRepositoryAccessPageRequest
  ): StudentRepositoryAccessPageRequest => {
    return {
      ...request,
      pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId)
    };
  };
  const getRegisteredPagesRepositoryFolderPath = (courseFolderId: string): string | null =>
    listCourseFolders(getCourseRegistryPath(app.getPath("userData"))).find(
      (courseFolder) => courseFolder.id === courseFolderId
    )?.pagesRepositoryFolderPath ?? null;
  const getRegisteredCourseFolderPath = (courseFolderId: unknown): string | null => {
    if (typeof courseFolderId !== "string") return null;
    const context = managedCourseOperation.getStore();
    if (context?.courseFolderId === courseFolderId) return context.courseFolderPath;
    return (
      listCourseFolders(getCourseRegistryPath(app.getPath("userData"))).find(
        (courseFolder) => courseFolder.id === courseFolderId
      )?.path ?? null
    );
  };

  const publishAuthenticatedCourseChanges = async (courseFolderPath: string) =>
    managedCourseOperation.getStore()?.transaction
      ? { status: "success" as const, diagnostics: [], commitMessage: null }
      : publishCourseChanges(courseFolderPath, { runner: processRunner, env: process.env });
  const withCourseSourceFor =
    (channel: string) =>
    async (
      folder: CourseFolderRecord,
      perform: (
        source: CourseFolderRecord,
        sourceToken?: string
      ) => Promise<Omit<import("./ipc.js").CourseFolderDashboardResult, "refreshedAt">>
    ) =>
      courseMutationGuard
        ? courseMutationGuard.read(
            folder.id,
            folder.path,
            async (context, input) => {
              const readingAccount = oauthSession?.getState().identity?.id;
              const readingGeneration = oauthSession?.mutationGeneration;
              const result = context?.managed
                ? await managedCourseOperation.run(context, () =>
                    perform({ ...folder, path: context.courseFolderPath }, input?.token)
                  )
                : await perform(folder);
              const projected = context?.managed
                ? projectManagedCourseResult(result, context.courseFolderPath, folder.path)
                : result;
              if (result.status === "success") {
                const state = oauthSession?.getState();
                if (
                  state?.identity &&
                  state.identity.id === readingAccount &&
                  readingGeneration === oauthSession?.mutationGeneration &&
                  state.courseDiscovery.userId === state.identity.id
                )
                  saveDashboardDisplay(
                    app.getPath("userData"),
                    state.identity.id,
                    state.courseDiscovery.courses,
                    {
                      ...projected,
                      courseFolderPath: folder.path,
                      refreshedAt: new Date().toISOString()
                    }
                  );
              }
              return {
                ...projected,
                courseFolderPath: folder.path,
                ...(context?.managed ? { courseReadRevision: courseContextRevision(context) } : {})
              };
            },
            { channel, fields: {} }
          )
        : perform(folder);

  const withCourseSource = withCourseSourceFor(IPC_CHANNELS.refreshCourseFolder);

  courseIpc.handle(IPC_CHANNELS.loadDashboardDisplay, (_event, courseSlug: unknown) =>
    measureStartup("cached_dashboard_display_ready", async () => {
      await oauthSession?.restore();
      const state = oauthSession?.getState();
      const display = {
        userId: state?.identity?.id ?? null,
        status: "success" as const,
        results:
          state?.status === "signed_in" && state.identity
            ? loadDashboardDisplay(
                app.getPath("userData"),
                state.identity.id,
                state.courseDiscovery.courses
              )
            : []
      };
      const preferred = display.results.find((result) =>
        result.dashboard?.cards.some(
          (card) =>
            typeof card === "object" &&
            card !== null &&
            "courseSlug" in card &&
            card.courseSlug === courseSlug
        )
      );
      oauthSession?.startCourseUpdates(preferred?.courseFolderId);
      return display;
    })
  );
  const displayReads = new Map<string, Promise<import("./ipc.js").CourseFolderDashboardResult>>();
  courseIpc.handle(IPC_CHANNELS.refreshCourseDisplay, async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Course folder id is required.");
    const key = JSON.stringify([oauthSession?.mutationGeneration, id]);
    const pending = displayReads.get(key);
    if (pending) return pending;
    const work = (async () => {
      await oauthSession?.waitForCourseStartup(id);
      return refreshCourseFolder(getCourseRegistryPath(app.getPath("userData")), id, {
        remoteSources: courseMutationGuard?.remoteSelectors(),
        withCourseSource: withCourseSourceFor(IPC_CHANNELS.refreshCourseDisplay),
        runner: processRunner,
        env: process.env
      });
    })();
    displayReads.set(key, work);
    try {
      return await work;
    } finally {
      if (displayReads.get(key) === work) displayReads.delete(key);
    }
  });

  courseIpc.handle(IPC_CHANNELS.getAppInfo, () => getAppInfo());
  courseIpc.handle(IPC_CHANNELS.getLocalSettings, () =>
    loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
  );
  courseIpc.handle(IPC_CHANNELS.saveLocalSettings, (_event, username: unknown) => {
    if (typeof username !== "string") throw new Error("Faculty MSOE username is required.");
    return saveCurrentFacultyMsoeUsername(getLocalSettingsPath(app.getPath("userData")), username);
  });
  courseIpc.handle(IPC_CHANNELS.getCoursePublishStatus, async (_event, courseFolderId: unknown) => {
    const courseFolderPath = getRegisteredCourseFolderPath(courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return await getCoursePublishStatus(courseFolderPath);
  });
  courseIpc.handle(IPC_CHANNELS.publishCourseChanges, async (_event, courseFolderId: unknown) => {
    const courseFolderPath = getRegisteredCourseFolderPath(courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return await publishAuthenticatedCourseChanges(courseFolderPath);
  });

  courseIpc.handle(
    IPC_CHANNELS.checkGitHubAuth,
    async () =>
      await checkGitHubAuth({
        runner: processRunner,
        env: process.env
      })
  );

  courseIpc.handle(IPC_CHANNELS.listCourseFolders, () => [
    ...listCourseFolders(getCourseRegistryPath(app.getPath("userData"))),
    ...(courseMutationGuard?.remoteSelectors() ?? [])
  ]);

  courseIpc.handle(IPC_CHANNELS.removeCourseFolder, (_event, id: unknown) => {
    if (typeof id !== "string") {
      throw new Error("Course folder id is required.");
    }

    removeCourseFolderFromRegistry(getCourseRegistryPath(app.getPath("userData")), id);
  });

  courseIpc.handle(IPC_CHANNELS.selectCourseFolder, async () => {
    const selectedFolder = await selectNativeDirectory({
      properties: ["openDirectory"],
      settingsPath: getLocalSettingsPath(app.getPath("userData")),
      showOpenDialog: (options) => dialog.showOpenDialog(options)
    });

    if (selectedFolder === null) {
      return {
        canceled: true,
        courseFolder: null
      };
    }

    const selectionResult = addValidatedCourseFolderToRegistry(
      getCourseRegistryPath(app.getPath("userData")),
      selectedFolder
    );

    logDebugDiagnostic(
      `Course folder selection: selectedPath=${selectedFolder} validation=${
        selectionResult.courseFolder === null ? selectionResult.error?.code : "success"
      } registeredPath=${selectionResult.courseFolder?.path ?? ""}`
    );

    return selectionResult;
  });

  courseIpc.handle(
    IPC_CHANNELS.selectStudentAccessPagesRepositoryFolder,
    async (_event, courseFolderId: unknown) => {
      if (typeof courseFolderId !== "string") throw new Error("Course folder id is required.");
      const folderPath = await selectNativeDirectory({
        properties: ["openDirectory"],
        settingsPath: getLocalSettingsPath(app.getPath("userData")),
        showOpenDialog: (options) => dialog.showOpenDialog(options)
      });
      if (folderPath === null) return { canceled: true, folderPath: null };
      const registered = setStudentAccessPagesRepositoryFolder(
        getCourseRegistryPath(app.getPath("userData")),
        courseFolderId,
        folderPath
      );
      return registered === null
        ? {
            canceled: false,
            folderPath: null,
            error: {
              code: "pages_folder_invalid",
              message: "Selected Pages repository folder must exist and be a directory.",
              folderPath
            }
          }
        : { canceled: false, folderPath: registered.pagesRepositoryFolderPath ?? null };
    }
  );
  courseIpc.handle(IPC_CHANNELS.selectRepositoryDownloadFolder, async () => {
    const folderPath = await selectNativeDirectory({
      properties: ["openDirectory", "createDirectory"],
      settingsPath: getLocalSettingsPath(app.getPath("userData")),
      showOpenDialog: (options) => dialog.showOpenDialog(options)
    });
    return { canceled: folderPath === null, folderPath };
  });

  courseIpc.handle(IPC_CHANNELS.selectCourseSetupFolder, async () => {
    const selectedFolder = await selectNativeDirectory({
      properties: ["openDirectory", "createDirectory"],
      settingsPath: getLocalSettingsPath(app.getPath("userData")),
      showOpenDialog: (options) => dialog.showOpenDialog(options)
    });
    if (selectedFolder !== null) approvedCourseSetupRoots.add(selectedFolder);
    return { canceled: selectedFolder === null, courseFolderPath: selectedFolder };
  });

  courseIpc.handle(IPC_CHANNELS.previewCourseSetup, (_event, request: unknown) => {
    if (
      !isCourseSetupRequest(request) ||
      (!approvedCourseSetupRoots.has(request.courseFolderPath) &&
        !managedCourseOperation.getStore()?.managed)
    )
      throw new Error("Approved course setup request is required.");
    return previewCourseSetup(request);
  });

  courseIpc.handle(IPC_CHANNELS.saveCourseSetup, (_event, request: unknown) => {
    if (
      !isCourseSetupRequest(request) ||
      (!approvedCourseSetupRoots.has(request.courseFolderPath) &&
        !managedCourseOperation.getStore()?.managed)
    )
      throw new Error("Approved course setup request is required.");
    const result = saveCourseSetup(request);
    if (result.status === "success" && !managedCourseOperation.getStore()?.managed)
      addValidatedCourseFolderToRegistry(
        getCourseRegistryPath(app.getPath("userData")),
        request.courseFolderPath
      );
    return result;
  });
  courseIpc.handle(IPC_CHANNELS.saveStudentAccessPagesConfig, (_event, request: unknown) => {
    if (!isStudentAccessPagesConfigRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for Student Access Pages settings.");
    const result = saveStudentAccessPagesConfig(request);
    return managedCourseOperation.getStore()?.transaction && result.status === "success"
      ? { ...result, diagnostics: [] }
      : result;
  });

  courseIpc.handle(IPC_CHANNELS.loadAssignmentSetupTerms, (_event, request: unknown) => {
    if (!isAssignmentSetupTermsRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    return loadAssignmentSetupTerms(request.courseFolderPath);
  });

  courseIpc.handle(IPC_CHANNELS.previewAssignmentSetup, async (_event, request: unknown) => {
    if (!isAssignmentSetupRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    const preview = previewAssignmentSetup(request);
    if (preview.status !== "ready") return preview;
    if (request.templateRepository.trim() === "") return preview;
    const validation = await validateTemplateRepository(
      request.templateRepository,
      request.templateBranch,
      {
        env: process.env,
        runner: processRunner
      }
    );
    const resolvedRequest = {
      ...request,
      templateRepository: validation.repository ?? request.templateRepository,
      templateBranch: validation.branch ?? request.templateBranch
    };
    return validation.valid
      ? {
          ...previewAssignmentSetup(resolvedRequest),
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        }
      : {
          ...preview,
          status: "invalid" as const,
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        };
  });

  courseIpc.handle(IPC_CHANNELS.saveAssignmentSetup, async (_event, request: unknown) => {
    if (!isAssignmentSetupRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for assignment setup.");
    }
    const localPreview = previewAssignmentSetup(request);
    if (localPreview.status !== "ready")
      return {
        status: "failure" as const,
        writtenFiles: [],
        diagnostics: localPreview.diagnostics
      };
    // Mirrors the previewAssignmentSetup handler above (PR10-1a): a blank
    // template repository is a valid "no template" choice, not a value to
    // validate against GitHub. Without this, normalizeTemplateRepository("")
    // returns null and validateTemplateRepository reports "Template
    // repository value must be in owner/repo form..." for every save of an
    // assignment with no template -- a real, misleading save failure for the
    // single most common case (PR10-1b).
    if (request.templateRepository.trim() === "")
      return await publishSuccessfulCourseMutation(
        request.courseFolderPath,
        saveAssignmentSetup(request),
        publishAuthenticatedCourseChanges
      );
    const validation = await validateTemplateRepository(
      request.templateRepository,
      request.templateBranch,
      { env: process.env, runner: processRunner }
    );
    if (!validation.valid)
      return { status: "failure" as const, writtenFiles: [], diagnostics: validation.diagnostics };
    return await publishSuccessfulCourseMutation(
      request.courseFolderPath,
      saveAssignmentSetup({
        ...request,
        templateRepository: validation.repository ?? request.templateRepository,
        templateBranch: validation.branch ?? request.templateBranch
      }),
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(IPC_CHANNELS.getAssignmentForEdit, (_event, request: unknown) => {
    if (
      !isAssignmentSetupTermsRequest(request) ||
      typeof (request as unknown as Record<string, unknown>).assignmentFile !== "string" ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("Invalid assignment edit request.");
    return getAssignmentForEdit(
      request.courseFolderPath,
      (request as unknown as Record<string, unknown>).assignmentFile as string
    );
  });
  courseIpc.handle(IPC_CHANNELS.previewAssignmentEdit, async (_event, request: unknown) => {
    if (!isAssignmentEditRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment edit request.");
    const preview = previewAssignmentEdit(request);
    const original = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile).model;
    const changed =
      original !== null &&
      (original.templateRepository !== request.templateRepository ||
        original.templateBranch !== request.templateBranch);
    if (preview.status !== "ready" || !changed || request.templateRepository.trim() === "")
      return preview;
    const validation = await validateTemplateRepository(
      request.templateRepository,
      request.templateBranch,
      { env: process.env, runner: processRunner }
    );
    return validation.valid
      ? {
          ...previewAssignmentEdit({
            ...request,
            templateRepository: validation.repository ?? request.templateRepository,
            templateBranch: validation.branch ?? request.templateBranch
          }),
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        }
      : {
          ...preview,
          status: "invalid" as const,
          diagnostics: [...preview.diagnostics, ...validation.diagnostics]
        };
  });
  courseIpc.handle(IPC_CHANNELS.saveAssignmentEdit, async (_event, request: unknown) => {
    if (!isAssignmentEditRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment edit request.");
    const original = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile).model;
    const changed =
      original !== null &&
      (original.templateRepository !== request.templateRepository ||
        original.templateBranch !== request.templateBranch);
    if (changed && request.templateRepository.trim() !== "") {
      const validation = await validateTemplateRepository(
        request.templateRepository,
        request.templateBranch,
        { env: process.env, runner: processRunner }
      );
      if (!validation.valid)
        return {
          status: "failure" as const,
          path: request.assignmentFile,
          diagnostics: validation.diagnostics
        };
      return await publishSuccessfulCourseMutation(
        request.courseFolderPath,
        saveAssignmentEdit({
          ...request,
          templateRepository: validation.repository ?? request.templateRepository,
          templateBranch: validation.branch ?? request.templateBranch
        }),
        publishAuthenticatedCourseChanges
      );
    }
    return await publishSuccessfulCourseMutation(
      request.courseFolderPath,
      saveAssignmentEdit(request),
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(IPC_CHANNELS.deleteAssignment, async (_event, request: unknown) => {
    if (!isAssignmentDeleteRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment delete request.");
    return await publishSuccessfulCourseMutation(
      request.courseFolderPath,
      deleteAssignment(request),
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(IPC_CHANNELS.getAssignmentGroupConfig, (_event, request: unknown) => {
    if (!isAssignmentGroupConfigRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment group settings request.");
    return getAssignmentGroupConfig(request);
  });
  courseIpc.handle(IPC_CHANNELS.saveAssignmentGroupConfig, async (_event, request: unknown) => {
    if (!isAssignmentGroupConfigSaveRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("Invalid assignment group settings request.");
    return await publishSuccessfulCourseMutation(
      request.courseFolderPath,
      saveAssignmentGroupConfig(request),
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(
    IPC_CHANNELS.getStudentRepositoryAccessPageStatus,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await getStudentRepositoryAccessPageStatus(accessRequest, mappings);
    }
  );
  courseIpc.handle(
    IPC_CHANNELS.generateStudentRepositoryAccessPage,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await generateStudentRepositoryAccessPage(accessRequest, mappings);
    }
  );
  courseIpc.handle(
    IPC_CHANNELS.getStudentRepositoryAccessPagePublishStatus,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page publish status request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await getStudentRepositoryAccessPagePublishStatus(accessRequest, mappings);
    }
  );
  courseIpc.handle(
    IPC_CHANNELS.publishStudentRepositoryAccessPage,
    async (_event, request: unknown) => {
      if (
        !isStudentRepositoryAccessPageRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("Invalid student repository access page publish request.");
      const accessRequest = withRegisteredPagesFolder(request);
      const mappings = await getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: processRunner
      });
      return await publishStudentRepositoryAccessPage(accessRequest, mappings, {
        runner: processRunner,
        env: process.env
      });
    }
  );

  courseIpc.handle(IPC_CHANNELS.loadRosterTerms, (_event, request: unknown) => {
    if (!isAssignmentSetupTermsRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return loadRosterTerms(request.courseFolderPath);
  });

  courseIpc.handle(IPC_CHANNELS.getRosterForSection, (_event, request: unknown) => {
    if (!isRosterSectionRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return getRosterForSection(request);
  });

  courseIpc.handle(IPC_CHANNELS.getRosterSectionSummaries, (_event, request: unknown) => {
    if (!isRosterSectionSummariesRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return getRosterSectionSummaries(request);
  });

  courseIpc.handle(IPC_CHANNELS.previewRosterSave, (_event, request: unknown) => {
    if (!isRosterSaveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    return previewRosterSave(request);
  });

  courseIpc.handle(IPC_CHANNELS.saveRoster, async (_event, request: unknown) => {
    if (!isRosterSaveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    const managed = managedCourseOperation.getStore();
    if (managed?.transaction) {
      const result = saveRoster(
        request,
        createRosterSaveDependencies(getLocalSettingsPath(app.getPath("userData")))
      );
      if (result.status === "success")
        managed.afterPublication?.push(() =>
          refreshStudentRepositoryPages(
            { ...request, courseFolderPath: managed.authoritativePath! },
            {
              runner: processRunner,
              env: process.env,
              pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(
                request.courseFolderId
              )
            }
          )
        );
      return result;
    }
    return await publishSuccessfulCourseMutation(
      request.courseFolderPath,
      await saveRosterWithStudentRepositoryAccessPageRefresh(request, {
        runner: processRunner,
        env: process.env,
        pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId),
        saveDependencies: createRosterSaveDependencies(
          getLocalSettingsPath(app.getPath("userData"))
        )
      }),
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(IPC_CHANNELS.removeRoster, async (_event, request: unknown) => {
    if (!isRosterRemoveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    const managed = managedCourseOperation.getStore();
    if (managed?.transaction) {
      const result = removeRoster(request);
      if (result.status === "success")
        managed.afterPublication?.push(() =>
          refreshStudentRepositoryPages(
            { ...request, courseFolderPath: managed.authoritativePath! },
            {
              runner: processRunner,
              env: process.env,
              pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(
                request.courseFolderId
              )
            }
          )
        );
      return result;
    }
    return await publishSuccessfulCourseMutation(
      request.courseFolderPath,
      await removeRosterWithStudentRepositoryAccessPageRefresh(request, {
        runner: processRunner,
        env: process.env,
        pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId)
      }),
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(IPC_CHANNELS.removeSection, async (_event, request: unknown) => {
    if (!isRosterRemoveRequest(request) || !isRegisteredAssignmentSetupCourse(request)) {
      throw new Error("A registered course folder is required for roster management.");
    }
    const managed = managedCourseOperation.getStore();
    if (managed?.transaction) {
      const result = removeSection(request);
      if (result.status === "success")
        managed.afterPublication?.push(() =>
          refreshStudentRepositoryPages(
            { ...request, courseFolderPath: managed.authoritativePath! },
            {
              runner: processRunner,
              env: process.env,
              pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(
                request.courseFolderId
              )
            }
          )
        );
      return result;
    }
    return await publishSuccessfulCourseMutation(
      request.courseFolderPath,
      await removeSectionWithStudentRepositoryAccessPageRefresh(request, {
        runner: processRunner,
        env: process.env,
        pagesRepositoryFolderPath: getRegisteredPagesRepositoryFolderPath(request.courseFolderId)
      }),
      publishAuthenticatedCourseChanges
    );
  });

  courseIpc.handle(IPC_CHANNELS.getTemplateWorkflow, async (_event, request: unknown) => {
    if (
      !isTemplateWorkflowRequest(request) ||
      typeof request.courseFolderId !== "string" ||
      typeof request.courseFolderPath !== "string"
    )
      throw new Error("Template workflow request is required.");
    return await getTemplateWorkflow(request, { env: process.env, runner: processRunner });
  });

  courseIpc.handle(IPC_CHANNELS.previewTemplateWorkflowSave, async (_event, request: unknown) => {
    if (
      !isTemplateWorkflowSaveRequest(request) ||
      typeof request.courseFolderId !== "string" ||
      typeof request.courseFolderPath !== "string"
    )
      throw new Error("Template workflow save request is required.");
    return await previewTemplateWorkflowSave(request, { env: process.env, runner: processRunner });
  });

  courseIpc.handle(IPC_CHANNELS.saveTemplateWorkflow, async (_event, request: unknown) => {
    if (
      !isTemplateWorkflowSaveRequest(request) ||
      typeof request.courseFolderId !== "string" ||
      typeof request.courseFolderPath !== "string"
    )
      throw new Error("Template workflow save request is required.");
    return await saveTemplateWorkflow(request, { env: process.env, runner: processRunner });
  });
  courseIpc.handle(
    IPC_CHANNELS.replaceTemplateManagedWorkflow,
    async (_event, request: unknown) => {
      if (
        !isTemplateManagedWorkflowReplacementRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error(
          "A registered course folder is required for managed template workflow replacement."
        );
      return await replaceTemplateManagedWorkflow(request);
    }
  );

  courseIpc.handle(IPC_CHANNELS.refreshCourseFolder, async (_event, id: unknown) => {
    if (typeof id !== "string") {
      throw new Error("Course folder id is required.");
    }

    await oauthSession?.waitForCourseStartup(id);
    return await refreshCourseFolder(getCourseRegistryPath(app.getPath("userData")), id, {
      remoteSources: courseMutationGuard?.remoteSelectors(),
      withCourseSource,
      runner: processRunner,
      env: process.env
    });
  });

  courseIpc.handle(IPC_CHANNELS.refreshDashboard, async () => {
    const state = oauthSession?.getState();
    for (const course of state?.courseDiscovery.courses ?? []) {
      if (course.freshness !== "current")
        await oauthSession
          ?.waitForCourseStartup(`managed-course:${state?.identity?.id}:${course.repositoryId}`)
          .catch(() => {});
    }
    return await refreshDashboard(getCourseRegistryPath(app.getPath("userData")), {
      remoteSources: courseMutationGuard?.remoteSelectors(),
      withCourseSource,
      runner: processRunner,
      env: process.env
    });
  });

  courseIpc.handle(IPC_CHANNELS.getAssignmentDetail, async (_event, request: unknown) => {
    if (!isAssignmentDetailRequest(request)) {
      throw new Error("Assignment detail request is required.");
    }

    return await getAssignmentDetail(request, {
      runner: processRunner,
      env: process.env
    });
  });
  const reviewImports = createReviewImportService({
    backend: loadReviewImportBackend,
    synchronize: async (request, proof, revalidate) => {
      if (!oauthSession) return { status: "github_auth_unavailable" };
      return oauthSession
        .withAuthenticatedAccount(async (account) =>
          createGradingStudentRepositoryUpdateService({
            authenticate: async () => createAuthenticatedProductionGitWorkspace(account.token),
            reviewImport: proof,
            revalidate: async () => {
              if (!(await account.revalidateSession())) throw new Error("GitHub session changed.");
              await revalidate();
            }
          })(request)
        )
        .catch(() => ({
          status: "github_auth_unavailable",
          message:
            "Your GitHub session is unavailable or changed. Sign in again, then reopen Import Reviews."
        }));
    },
    showOpenDialog: (options) => dialog.showOpenDialog(options)
  });
  const reviewImportOwners = new WeakSet<Electron.WebContents>();
  courseIpc.handle(IPC_CHANNELS.chooseReviewImport, (event, request: unknown) => {
    if (!isPrepareGradingWorkspaceRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered assignment is required for review import.");
    if (!reviewImportOwners.has(event.sender)) {
      reviewImportOwners.add(event.sender);
      const ownerId = event.sender.id;
      event.sender.once("destroyed", () => reviewImports.close(ownerId));
    }
    return reviewImports.choose(
      { ...request, userDataPath: app.getPath("userData") },
      event.sender.id
    );
  });
  courseIpc.handle(IPC_CHANNELS.applyReviewImport, (event, request: unknown) => {
    if (!isImportApplyRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A current review plan and explicit selections are required.");
    return reviewImports.apply(
      { ...request, userDataPath: app.getPath("userData") },
      event.sender.id
    );
  });
  courseIpc.handle(IPC_CHANNELS.closeReviewImport, (event) => reviewImports.close(event.sender.id));
  courseIpc.handle(IPC_CHANNELS.prepareGradingWorkspace, (_event, request: unknown) => {
    if (!isPrepareGradingWorkspaceRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading preparation.");
    return prepareGradingWorkspace({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.getAssignmentGradingLifecycle, (_event, request: unknown) => {
    if (
      !isAssignmentGradingLifecycleRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for the grading lifecycle summary.");
    return getAssignmentGradingLifecycle({
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug
    });
  });
  courseIpc.handle(IPC_CHANNELS.loadGradingStudentDocument, (_event, request: unknown) => {
    if (!isGradingStudentDocumentRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course and repository document are required.");
    return loadGradingStudentDocument({ ...request, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.loadGradingStudentSource, (_event, request: unknown) => {
    if (!isLoadGradingStudentSourceRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading source loading.");
    return loadGradingStudentSource({
      courseFolderId: request.courseFolderId,
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.loadGradingStudentViewState, (_event, request: unknown) => {
    if (!isGradingStudentViewStateRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading view-state loading.");
    return loadGradingStudentViewState({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.saveGradingStudentViewState, (_event, request: unknown) => {
    if (
      !isSaveGradingStudentViewStateRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for grading view-state saving.");
    return saveGradingStudentViewState({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.clearGradingStudentViewState, (_event, request: unknown) => {
    if (!isGradingStudentViewStateRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading view-state clearing.");
    return clearGradingStudentViewState({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.loadGradingStudentSnapshot, (_event, request: unknown) => {
    if (!isGradingStudentViewStateRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for grading snapshot loading.");
    return loadGradingStudentSnapshot({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.pullLatestGradingStudentChanges, (_event, request: unknown) => {
    if (!isLoadGradingStudentSourceRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for student repository updates.");
    if (!oauthSession) return { status: "github_auth_unavailable" };
    return oauthSession
      .withAuthenticatedAccount(async (account) =>
        createGradingStudentRepositoryUpdateService({
          authenticate: async () => createAuthenticatedProductionGitWorkspace(account.token),
          revalidate: async () => {
            if (!(await account.revalidateSession())) throw new Error("GitHub session changed.");
          }
        })({ ...request, userDataPath: app.getPath("userData") })
      )
      .catch(() => ({
        status: "github_auth_unavailable",
        message: "Your GitHub session is unavailable or changed. Sign in again, then retry."
      }));
  });
  courseIpc.handle(IPC_CHANNELS.loadGradingStudentEvidence, (_event, request: unknown) => {
    if (
      !isLoadGradingStudentEvidenceRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for grading evidence loading.");
    return loadGradingStudentEvidence({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.repairGradingStudentWorkflow, (_event, request: unknown) => {
    if (
      !isGradingStudentWorkflowRepairRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for grading workflow repair.");
    return repairGradingStudentWorkflow({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.repairGradingAssignmentWorkflows, (_event, request: unknown) => {
    if (!isGradingBulkWorkflowRepairRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder is required for bulk grading workflow repair.");
    return repairGradingWorkflowsForAssignment({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.previewGradingStudentReport, (_event, request: unknown) => {
    if (
      !isPublishGradingStudentReportRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for report preview.");
    return previewGradingStudentReport({ ...request, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.loadGradingStudentCommitHistory, (_event, request: unknown) => {
    if (
      !isLoadGradingStudentCommitHistoryRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for grading commit-history loading.");
    return loadGradingStudentCommitHistory({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.markGradingStudentComplete, (_event, request: unknown) => {
    if (
      !isMarkGradingStudentCompleteRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for marking grading complete.");
    return markGradingStudentComplete({ ...request, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.publishGradingStudentReport, (_event, request: unknown) => {
    if (
      !isPublishGradingStudentReportRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for publishing a grading report.");
    return publishGradingStudentReport({ ...request, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.bulkPublishGradingStudentReports, (event, request: unknown) => {
    if (
      !isBulkPublishGradingStudentReportsRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder is required for publishing grading reports.");
    const { runId, ...identity } = request;
    return createGradingBulkReportPublicationService({
      onProgress: (progress) => {
        if (runId !== undefined && !event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.gradingBulkReportPublicationProgress, {
            runId,
            courseFolderId: identity.courseFolderId,
            termCode: identity.termCode,
            assignmentSlug: identity.assignmentSlug,
            progress
          });
        }
      }
    })({ ...identity, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.addGradingStudentComment, (_event, request: unknown) => {
    if (!isAddGradingStudentCommentRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder and a valid grading comment are required.");
    return addGradingStudentComment({ ...request, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.editGradingStudentComment, (_event, request: unknown) => {
    if (!isEditGradingStudentCommentRequest(request) || !isRegisteredAssignmentSetupCourse(request))
      throw new Error("A registered course folder and a valid grading comment are required.");
    return editGradingStudentComment({ ...request, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.deleteGradingStudentComment, (_event, request: unknown) => {
    if (
      !isDeleteGradingStudentCommentRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder and a valid grading comment are required.");
    return deleteGradingStudentComment({ ...request, userDataPath: app.getPath("userData") });
  });
  courseIpc.handle(IPC_CHANNELS.addGradingStudentManualAdjustment, (_event, request: unknown) => {
    if (
      !isAddGradingStudentManualAdjustmentRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder and a valid manual adjustment are required.");
    return addGradingStudentManualAdjustment({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.editGradingStudentManualAdjustment, (_event, request: unknown) => {
    if (
      !isEditGradingStudentManualAdjustmentRequest(request) ||
      !isRegisteredAssignmentSetupCourse(request)
    )
      throw new Error("A registered course folder and a valid manual adjustment are required.");
    return editGradingStudentManualAdjustment({
      ...request,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(
    IPC_CHANNELS.deleteGradingStudentManualAdjustment,
    (_event, request: unknown) => {
      if (
        !isDeleteGradingStudentManualAdjustmentRequest(request) ||
        !isRegisteredAssignmentSetupCourse(request)
      )
        throw new Error("A registered course folder and a valid manual adjustment are required.");
      return deleteGradingStudentManualAdjustment({
        ...request,
        userDataPath: app.getPath("userData")
      });
    }
  );
  courseIpc.handle(IPC_CHANNELS.loadGradingCommentLibrary, (_event, request: unknown) => {
    if (!isLoadGradingCommentLibraryRequest(request))
      throw new Error(
        "A registered course and valid term are required for comment-library loading."
      );
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return loadGradingCommentLibrary({
      courseFolderPath,
      termCode: request.termCode,
      userDataPath: app.getPath("userData")
    });
  });
  courseIpc.handle(IPC_CHANNELS.createGradingLibraryComment, (_event, request: unknown) => {
    if (!isCreateGradingLibraryCommentRequest(request))
      throw new Error("A registered course and valid reusable comment are required.");
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return createGradingLibraryComment(
      {
        courseFolderPath,
        termCode: request.termCode,
        userDataPath: app.getPath("userData"),
        comment: request.comment
      },
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(IPC_CHANNELS.editGradingLibraryComment, (_event, request: unknown) => {
    if (!isEditGradingLibraryCommentRequest(request))
      throw new Error("A registered course and valid reusable comment are required.");
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return editGradingLibraryComment(
      {
        courseFolderPath,
        termCode: request.termCode,
        userDataPath: app.getPath("userData"),
        commentId: request.commentId,
        replacement: request.replacement
      },
      publishAuthenticatedCourseChanges
    );
  });
  courseIpc.handle(IPC_CHANNELS.deleteGradingLibraryComment, (_event, request: unknown) => {
    if (!isDeleteGradingLibraryCommentRequest(request))
      throw new Error("A registered course and reusable comment ID are required.");
    const courseFolderPath = getRegisteredCourseFolderPath(request.courseFolderId);
    if (courseFolderPath === null) throw new Error("A registered course folder is required.");
    return deleteGradingLibraryComment(
      {
        courseFolderPath,
        termCode: request.termCode,
        userDataPath: app.getPath("userData"),
        commentId: request.commentId
      },
      publishAuthenticatedCourseChanges
    );
  });

  registerAssignmentTemplateSyncIpc(
    courseIpc,
    assignmentTemplateSyncService,
    isRegisteredAssignmentSetupCourse
  );

  courseIpc.handle(IPC_CHANNELS.getAssignmentApplyPreview, async (_event, request: unknown) => {
    if (!isAssignmentApplyPreviewRequest(request)) {
      throw new Error("Assignment apply preview request is required.");
    }

    return await getAssignmentApplyPreview(request, {
      runner: processRunner,
      env: process.env
    });
  });

  courseIpc.handle(IPC_CHANNELS.getAssignmentGradePreview, async (_event, request: unknown) => {
    if (!isAssignmentGradePreviewRequest(request)) {
      throw new Error("Assignment grade preview request is required.");
    }

    return await getAssignmentGradePreview(request, {
      runner: processRunner,
      env: process.env
    });
  });

  courseIpc.handle(IPC_CHANNELS.getAssignmentGradeStatus, async (_event, request: unknown) => {
    if (!isAssignmentGradeStatusRequest(request)) {
      throw new Error("Assignment grade status request is required.");
    }

    return await getAssignmentGradeStatus(request, {
      runner: processRunner,
      env: process.env
    });
  });

  courseIpc.handle(IPC_CHANNELS.getFacultyReport, async (_event, request: unknown) => {
    if (!isFacultyReportRequest(request)) {
      throw new Error("Faculty report request is required.");
    }

    return await getFacultyReport(request, {
      runner: processRunner,
      env: process.env
    });
  });

  courseIpc.handle(IPC_CHANNELS.applyAssignment, async (event, request: unknown) => {
    if (!isAssignmentApplyRequest(request)) {
      throw new Error("Assignment apply request is required.");
    }

    return await applyAssignmentWithStudentRepositoryAccessPage(request, {
      runner: processRunner,
      env: process.env,
      onProgress: (progress) => {
        event.sender.send(IPC_CHANNELS.assignmentApplyProgress, {
          courseFolderId: request.courseFolderId,
          assignmentFile: request.assignmentFile,
          progress
        });
      },
      pagesRepositoryFolderPath:
        withRegisteredPagesFolder(request).pagesRepositoryFolderPath ?? null
    });
  });
  courseIpc.handle(
    IPC_CHANNELS.downloadAssignmentRepositories,
    async (_event, request: unknown) => {
      if (!isAssignmentRepositoryDownloadRequest(request))
        throw new Error("Assignment download request is required.");
      const parsed = await runAssignmentRepositoryDownload(request, { runner: processRunner });
      try {
        const match = request.assignmentFile
          .replaceAll("\\", "/")
          .match(
            /^terms\/(\d{2}s[123])\/assignments\/([A-Za-z0-9][A-Za-z0-9._-]*)\/assignment\.yml$/u
          );
        if (match !== null)
          recordSuccessfulDownloadLocators(
            getLocalRepositoryLocatorPath(app.getPath("userData")),
            {
              courseFolderId: request.courseFolderId,
              termCode: match[1] ?? "",
              assignmentSlug: match[2] ?? ""
            },
            parsed.targets ?? []
          );
        return parsed as unknown;
      } catch {
        throw new Error("Repository download returned invalid JSON.");
      }
    }
  );

  courseIpc.handle(IPC_CHANNELS.gradeAssignment, async (_event, request: unknown) => {
    if (!isAssignmentGradeRequest(request)) {
      throw new Error("Assignment grade request is required.");
    }

    return await gradeAssignment(request, {
      runner: processRunner,
      env: process.env
    });
  });
};

export const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Graider",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  registerExternalNavigation(window, shell);
  registerRendererDiagnostics(window);

  if (isDebugEnabled()) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  loadRenderer(window);

  return window;
};

registerIpcHandlers();

app.whenReady().then(async () => {
  const reconciliation = new ManagedReconciliationService();
  const facultyAuth = new GithubOAuthSession({
    findRegisteredCourse: async (folderId, { token, userId, signal }) => {
      const folder = listCourseFolders(getCourseRegistryPath(app.getPath("userData"))).find(
        (entry) => entry.id === folderId
      );
      if (!folder) return null;
      const locals = await inspectLocalCourseOrigins([folder]);
      const origin = locals[0]?.origin;
      if (!origin) {
        const local = await getProductionGitWorkspaceFactory().inspect(folder.path);
        if (local.kind !== "not_repository")
          throw new Error(
            "The selected registered course Git origin could not be verified. Check its source before opening it."
          );
        return null;
      }
      const org = await createGithubOrganizationNetwork().verifyOrganization(
        token,
        origin.owner,
        signal
      );
      const result = await discoverRemoteCourses({
        targeted: true,
        userId,
        organizations: [org],
        locals,
        username: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
          .currentFacultyMsoeUsername,
        reader: createRemoteRepositoryReader(token, signal)
      });
      const found = result.courses.find((entry) => entry.localFolderIds.includes(folderId)) ?? null;
      if (!found)
        throw new Error(
          "The selected registered course metadata or faculty access could not be verified. Check course access and retry."
        );
      const prior = Object.values(
        loadManagedCatalog(app.getPath("userData"), userId, { readOnly: true }).courses
      ).find(
        (entry) =>
          entry.organizationLogin.toLowerCase() === origin.owner.toLowerCase() &&
          entry.name.toLowerCase() === origin.name.toLowerCase()
      );
      if (
        found &&
        prior &&
        (found.repositoryId !== prior.repositoryId || found.organizationId !== prior.organizationId)
      )
        throw new Error("Registered course repository identity changed. Refresh course access.");
      return found;
    },
    loadSnapshot: (userId) => loadCourseSnapshot(app.getPath("userData"), userId),
    saveSnapshot: (userId, courses) => saveCourseSnapshot(app.getPath("userData"), userId, courses),
    verifyCourse: async ({ token, userId, course, signal }) => {
      const org = await createGithubOrganizationNetwork().verifyOrganization(
        token,
        course.organizationLogin,
        signal
      );
      if (org.organizationId !== course.organizationId)
        throw new Error("Organization identity changed.");
      const registered = listCourseFolders(getCourseRegistryPath(app.getPath("userData")));
      const result = await discoverRemoteCourses({
        targeted: true,
        userId,
        organizations: [org],
        username: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
          .currentFacultyMsoeUsername,
        managedRegistrations: [
          {
            repositoryId: course.repositoryId,
            organizationId: course.organizationId,
            folderIds: course.localFolderIds.filter((id) =>
              registered.some((folder) => folder.id === id)
            )
          }
        ],
        locals: [],
        reader: createRemoteRepositoryReader(token, signal)
      });
      const verified = result.courses.find((entry) => entry.repositoryId === course.repositoryId);
      if (!verified) throw new Error("Course authorization unavailable.");
      return verified;
    },
    store: createGithubOAuthCredentialStore(
      path.join(app.getPath("userData"), "github-oauth.credential"),
      safeStorage
    ),
    secret: readGithubOAuthSecret,
    openBrowser: (url) => shell.openExternal(url),
    network: createGithubOAuthNetwork(),
    bootstrapCourse: async ({ token, userId, course, signal, revalidateSession }) =>
      bootstrapManagedCourse({
        userData: app.getPath("userData"),
        prepareSynchronization: true,
        userId,
        course,
        signal,
        revalidateSession,
        username: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
          .currentFacultyMsoeUsername,
        reader: createRemoteRepositoryReader(token, signal),
        authenticate: () => createAuthenticatedProductionGitWorkspace(token)
      }),
    synchronizeCourse: async ({
      token,
      userId,
      course,
      signal,
      revalidateSession,
      onProgress,
      alreadySerialized,
      requireFacultyAuthorization
    }) =>
      (alreadySerialized ? performSynchronization : synchronizeManagedCourse)({
        requireFacultyAuthorization,
        userData: app.getPath("userData"),
        userId,
        course,
        signal,
        revalidateSession,
        onProgress,
        username: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
          .currentFacultyMsoeUsername,
        reader: createRemoteRepositoryReader(token, signal),
        authenticate: () => createAuthenticatedProductionGitWorkspace(token)
      }).then((synchronization) => {
        if (synchronization.currentCommit)
          invalidateManagedCourseViews(
            userId,
            course.repositoryId,
            synchronization.currentCommit,
            courseOperationDocument.getStore()
          );
        return synchronization;
      }),
    reconcileCourse: async ({
      token,
      userId,
      course,
      signal,
      revalidateSession,
      action,
      planId,
      confirmed,
      sessionGeneration,
      onProgress,
      onReconciliationProgress
    }) => {
      const request = {
        userData: app.getPath("userData"),
        userId,
        course,
        signal,
        revalidateSession,
        sessionGeneration,
        onProgress: (
          synchronization: import("./remoteCourseTypes.js").ManagedSynchronizationState
        ) => {
          onProgress(synchronization);
          if (synchronization.currentCommit)
            invalidateManagedCourseViews(
              userId,
              course.repositoryId,
              synchronization.currentCommit,
              courseOperationDocument.getStore()
            );
        },
        onReconciliationProgress,
        username: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
          .currentFacultyMsoeUsername,
        reader: createRemoteRepositoryReader(token, signal),
        authenticate: () => createAuthenticatedProductionGitWorkspace(token)
      };
      return action === "plan"
        ? reconciliation.plan(request)
        : reconciliation.apply(request, planId ?? "", confirmed === true);
    },
    discoverCourses: async (token, userId, organizations, signal, onProgress) => {
      const registered = listCourseFolders(getCourseRegistryPath(app.getPath("userData")));
      const managedRegistrations = Object.values(
        loadManagedCatalog(app.getPath("userData"), userId).courses
      )
        .filter((entry) => entry.operationalSource === "managed")
        .map((entry) => ({
          repositoryId: entry.repositoryId,
          organizationId: entry.organizationId,
          folderIds: (entry.operationalFolderIds ?? []).filter((id) =>
            registered.some((folder) => folder.id === id)
          )
        }));
      const managedIds = new Set(managedRegistrations.flatMap((entry) => entry.folderIds));
      const discovered = await discoverRemoteCourses({
        onProgress,
        userId,
        organizations,
        username: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
          .currentFacultyMsoeUsername,
        managedRegistrations,
        locals: await inspectLocalCourseOrigins(
          registered.filter((folder) => !managedIds.has(folder.id))
        ),
        reader: createRemoteRepositoryReader(token, signal)
      });
      return {
        ...discovered,
        courses: discovered.courses.map((course) => {
          const recoveryId = latestPreservedCopy(
            app.getPath("userData"),
            userId,
            course.repositoryId
          );
          return recoveryId
            ? {
                ...course,
                reconciliation: preservedRecoveryState(
                  app.getPath("userData"),
                  userId,
                  course.repositoryId,
                  recoveryId
                )
              }
            : course;
        })
      };
    }
  });
  const migrationReview = createMigrationReviewService({
    progress: createMigrationReviewProgressStore(app.getPath("userData")),
    backend: loadMigrationReviewBackend,
    withCourse: async (selector, operation) => {
      const match = /^managed-course:([1-9][0-9]*):([1-9][0-9]*)$/.exec(selector);
      if (!match) throw new Error("A managed course selector is required.");
      const userId = Number(match[1]);
      const repositoryId = Number(match[2]);
      if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(repositoryId))
        throw new Error("Invalid managed identity.");
      const generation = facultyAuth.mutationGeneration;
      return facultyAuth.withReadOnlyCourse(repositoryId, userId, async (input) =>
        operation({
          userId: input.userId,
          institutionalUsername: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
            .currentFacultyMsoeUsername,
          generation,
          reader: createMigrationReviewReader(
            input,
            app.getPath("userData"),
            loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
              .currentFacultyMsoeUsername,
            loadMigrationReviewBackend()
          )
        })
      );
    }
  });
  registerMigrationReviewIpc(ipcMain, migrationReview);
  const migrationPublication = createMigrationPublicationService({
    userData: app.getPath("userData"),
    reviewService: migrationReview,
    session: facultyAuth
  });
  const migrationReconciliation = createMigrationReconciliationService({
    userData: app.getPath("userData"),
    session: facultyAuth
  });
  registerMigrationExecutionIpc(
    ipcMain,
    createMigrationExecutionService({
      review: migrationReview,
      publication: migrationPublication,
      reconciliation: migrationReconciliation,
      currentUser: () => facultyAuth.getState().identity?.id ?? null,
      selectors: () => {
        const state = facultyAuth.getState();
        return state.courseDiscovery.courses
          .filter((course) => course.authorization === "authorized")
          .map((course) => `managed-course:${state.identity?.id}:${course.repositoryId}`);
      },
      authorize: async (selector) => {
        const match = /^managed-course:([1-9][0-9]*):([1-9][0-9]*)$/.exec(selector);
        if (!match) throw new Error("Select an authorized managed course.");
        const userId = Number(match[1]);
        const repositoryId = Number(match[2]);
        if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(repositoryId))
          throw new Error("Invalid course identity.");
        const state = facultyAuth.getState();
        if (
          state.identity?.id !== userId ||
          state.courseDiscovery.userId !== userId ||
          !state.courseDiscovery.courses.some(
            (course) =>
              course.repositoryId === repositoryId && course.authorization === "authorized"
          )
        )
          throw new Error("Current authorized account/course is required.");
        return { userId, repositoryId };
      }
    })
  );
  courseMutationGuard = new ManagedCourseMutationGuard({
    userData: app.getPath("userData"),
    session: facultyAuth,
    folders: () => listCourseFolders(getCourseRegistryPath(app.getPath("userData"))),
    username: () =>
      loadLocalSettings(getLocalSettingsPath(app.getPath("userData"))).currentFacultyMsoeUsername
  });
  const remoteSetup = new RemoteCourseSetupService({
    userData: app.getPath("userData"),
    session: facultyAuth
  });
  ipcMain.handle(IPC_CHANNELS.closeRemoteCourseSetup, (event) => {
    remoteSetup.close(event.sender.id);
  });
  ipcMain.handle(IPC_CHANNELS.previewRemoteCourseSetup, async (event, request: unknown) => {
    event.sender.once("destroyed", () => remoteSetup.close(event.sender.id));
    return remoteSetup.preview(event.sender.id, request);
  });
  ipcMain.handle(
    IPC_CHANNELS.createRemoteCourse,
    async (event, previewId: unknown, confirmed: unknown) => {
      const result = await remoteSetup.create(event.sender.id, previewId, confirmed);
      await facultyAuth.refreshOrganizations();
      return result;
    }
  );
  ipcMain.handle("graider-ui:managed-course:inspect", async (_event, repositoryId: unknown) => {
    const state = facultyAuth.getState();
    const course = state.courseDiscovery.courses.find(
      (candidate) => candidate.repositoryId === repositoryId
    );
    if (!state.identity || state.courseDiscovery.userId !== state.identity.id || !course)
      throw new Error("Authorized course identity is required.");
    try {
      return await facultyAuth.withLocalCourse(course.repositoryId, state.identity.id, (input) =>
        inspectLocalManagedCourse({
          input,
          userData: app.getPath("userData"),
          username: loadLocalSettings(getLocalSettingsPath(app.getPath("userData")))
            .currentFacultyMsoeUsername
        })
      );
    } catch {
      throw new Error("Cached course details are unavailable. Refresh courses.");
    }
  });
  const ownedCourse = (repositoryId: unknown) => {
    const state = facultyAuth.getState();
    if (
      !Number.isSafeInteger(repositoryId) ||
      typeof repositoryId !== "number" ||
      repositoryId <= 0 ||
      !state.identity ||
      state.courseDiscovery.userId !== state.identity.id ||
      !state.courseDiscovery.courses.some((course) => course.repositoryId === repositoryId)
    )
      throw new Error("Current account course identity is required.");
    return { userId: state.identity.id, repositoryId };
  };
  ipcMain.handle(
    "graider-ui:managed-course:plan-reconciliation",
    (_event, repositoryId: unknown, ...extra: unknown[]) => {
      const owned = ownedCourse(repositoryId);
      if (extra.length) throw new Error("Only course identity is accepted.");
      return facultyAuth.reconcileCourse(owned.repositoryId, "plan");
    }
  );
  ipcMain.handle(
    "graider-ui:managed-course:apply-reconciliation",
    (_event, repositoryId: unknown, planId: unknown, confirmed: unknown, ...extra: unknown[]) => {
      const owned = ownedCourse(repositoryId);
      if (typeof planId !== "string" || confirmed !== true || extra.length)
        throw new Error("Reviewed plan and explicit confirmation are required.");
      return facultyAuth.reconcileCourse(owned.repositoryId, "apply", planId, true);
    }
  );
  ipcMain.handle(
    "graider-ui:managed-course:cancel-reconciliation",
    (_event, repositoryId: unknown, planId: unknown, ...extra: unknown[]) => {
      const owned = ownedCourse(repositoryId);
      if ((planId !== undefined && typeof planId !== "string") || extra.length)
        throw new Error("Invalid plan identity.");
      facultyAuth.cancelReconciliation(owned.repositoryId);
      if (typeof planId === "string") reconciliation.discard(planId, owned.userId);
    }
  );
  ipcMain.handle(
    "graider-ui:managed-course:reveal-recovery",
    (_event, repositoryId: unknown, recoveryId: unknown, ...extra: unknown[]) => {
      const owned = ownedCourse(repositoryId);
      if (typeof recoveryId !== "string" || extra.length)
        throw new Error("Recovery identity is required.");
      const preserved = resolvePreservedCopy(
        app.getPath("userData"),
        owned.userId,
        owned.repositoryId,
        recoveryId
      );
      shell.showItemInFolder(preserved);
    }
  );
  oauthSession = facultyAuth;
  const restoration = facultyAuth.restore();
  const operations = {
    get: async () => {
      await restoration;
      return facultyAuth.getState();
    },
    signIn: async () => {
      await restoration;
      return facultyAuth.signIn();
    },
    signOut: async () => {
      await restoration;
      return facultyAuth.signOut();
    },
    switchAccount: async () => {
      await restoration;
      return facultyAuth.signIn(true);
    },
    refreshOrganizations: async () => {
      await restoration;
      return facultyAuth.refreshOrganizations();
    },
    manageAuthorization: async () => facultyAuth.manageAuthorization(),
    cancel: async () => facultyAuth.cancel()
  };
  for (const operation of Object.keys(operations) as (keyof typeof operations)[]) {
    ipcMain.handle(GITHUB_OAUTH_CHANNELS[operation], (_event, ...args: unknown[]) => {
      if (args.length !== 0) throw new Error("This account operation accepts no arguments.");
      return operations[operation]();
    });
  }
  app.on("before-quit", () => facultyAuth.shutdown());
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
