import { checkAssignmentDetailGithubReadiness } from "../assignment-detail/assignment-detail-github-readiness.js";
import type { AssignmentDetailCheckStatus } from "../assignment-detail/assignment-detail-models.js";
import { loadGraiderConfig } from "../config/config-loader.js";
import type { LoadedGraiderConfig } from "../config/config-models.js";
import { DISABLED_GRADING_MODE } from "../config/config-schemas.js";
import type { CommandStatus } from "../core/command-result.js";
import {
  ASSIGNMENT_ARCHIVED_CODE,
  ASSIGNMENT_CLOSED_BLOCKS_CREATION_CODE,
  ASSIGNMENT_NOT_ACTIVE_CODE,
  MANIFEST_TRACKED_REPOSITORY_MISSING_CODE,
  STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE,
  TARGET_MATCHES_NO_STUDENTS_CODE,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import { loadManifest } from "../manifest/manifest-loader.js";
import type { Manifest, ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import { buildGroupApplyPreviewPlan } from "../groups/group-preview-planner.js";
import { generateRepositoryName } from "../planning/repo-name.js";
import { loadAssignmentRosters } from "../roster/roster-loader.js";
import {
  ROSTER_STATUS_ACTIVE,
  type RosterStatus,
  type RosterStudent
} from "../roster/roster-models.js";
import {
  ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION,
  type ApplyPreviewAction,
  type ApplyPreviewGrading,
  type ApplyPreviewPlanSummary,
  type ApplyPreviewRepositoryRow,
  type ApplyPreviewRepositoryStatus,
  type ApplyPreviewTemplate,
  type AssignmentApplyPreviewResult
} from "./apply-preview-models.js";

const COMMAND_NAME = "assignment apply-preview";
const EMPTY_COUNT = 0;
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const PARTIAL_SUCCESS_EXIT_CODE = 2;
const ACTIVE_ASSIGNMENT_STATUS = "active";
const CLOSED_ASSIGNMENT_STATUS = "closed";
const DRAFT_ASSIGNMENT_STATUS = "draft";
const ARCHIVED_ASSIGNMENT_STATUS = "archived";
const LEGACY_GRADING_MODE = "custom-workflow";
const NOT_CHECKED_STATUS: AssignmentDetailCheckStatus = "not_checked";
const NOT_REQUIRED_STATUS: AssignmentDetailCheckStatus = "not_required";
const UNKNOWN_REASON_TOKEN_REQUIRED = "token_required";
const UNKNOWN_REASON_REPOSITORY_STATUS_UNKNOWN = "student_repository_status_unknown";
const STUDENT_STATUS_REASON_PREFIX = "student_status";

export interface BuildAssignmentApplyPreviewInput {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly githubClient?: GitHubClient;
}

const resolveExitCode = (status: CommandStatus): 0 | 1 | 2 => {
  if (status === "success") {
    return SUCCESS_EXIT_CODE;
  }

  return status === "partial_success" ? PARTIAL_SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE;
};

export const createEmptyAssignmentApplyPreviewResult = (
  status: CommandStatus,
  diagnostics: Diagnostic[]
): AssignmentApplyPreviewResult => ({
  schemaVersion: ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION,
  commandName: COMMAND_NAME,
  status,
  exitCode: resolveExitCode(status),
  diagnostics,
  assignment: null,
  course: null,
  term: null,
  target: null,
  template: null,
  grading: null,
  plan: null,
  files: null,
  actions: null
});

const createGradingPreview = (config: LoadedGraiderConfig): ApplyPreviewGrading => {
  const grading = config.assignment.grading ?? config.course.grading;

  if (!grading.enabled) {
    return {
      enabled: false,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowStatus: NOT_REQUIRED_STATUS,
      workflowDispatch: NOT_REQUIRED_STATUS
    };
  }

  return {
    enabled: true,
    mode: grading.mode ?? LEGACY_GRADING_MODE,
    workflow: grading.workflow ?? null,
    artifact: grading.artifact ?? null,
    resultFile: grading.result_file ?? null,
    workflowStatus: NOT_CHECKED_STATUS,
    workflowDispatch: NOT_CHECKED_STATUS
  };
};

const createTemplatePreview = (config: LoadedGraiderConfig): ApplyPreviewTemplate => ({
  repository: config.assignment.template.repository,
  branch: config.assignment.template.branch,
  status: NOT_CHECKED_STATUS,
  repositoryStatus: NOT_CHECKED_STATUS,
  branchStatus: NOT_CHECKED_STATUS
});

const createTargetStudentsEmptyDiagnostic = (config: LoadedGraiderConfig): Diagnostic =>
  createConfigDiagnostic(
    TARGET_MATCHES_NO_STUDENTS_CODE,
    "Assignment apply preview found no target students.",
    {
      assignmentFile: config.summary.assignmentConfigPath,
      sections: config.assignment.sections
    }
  );

const createLifecycleDiagnostic = (
  code: string,
  message: string,
  config: LoadedGraiderConfig,
  student: RosterStudent
): Diagnostic =>
  createConfigDiagnostic(code, message, {
    assignmentFile: config.summary.assignmentConfigPath,
    assignmentStatus: config.assignment.assignment.status,
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section
  });

const createManifestTrackedMissingDiagnostic = (
  owner: string,
  repositoryName: string,
  student: RosterStudent
): Diagnostic =>
  createConfigDiagnostic(
    MANIFEST_TRACKED_REPOSITORY_MISSING_CODE,
    `Manifest tracks repository ${owner}/${repositoryName}, but it was not found.`,
    {
      owner,
      repositoryName,
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }
  );

const createRepositoryStatusUnknownDiagnostic = (
  error: unknown,
  owner: string,
  repositoryName: string,
  student: RosterStudent
): Diagnostic => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      error.diagnosticCode,
      `Could not check repository ${owner}/${repositoryName}: ${error.message}`,
      {
        owner,
        repositoryName,
        studentId: student.studentId,
        githubUsername: student.githubUsername,
        section: student.section,
        kind: error.kind,
        retryable: error.retryable,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds })
      }
    );
  }

  return createConfigDiagnostic(
    STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE,
    `Could not check repository ${owner}/${repositoryName}.`,
    {
      owner,
      repositoryName,
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }
  );
};

const createRow = (
  student: RosterStudent,
  repository: string,
  status: ApplyPreviewRepositoryStatus,
  reason: string,
  diagnostics: Diagnostic[] = []
): ApplyPreviewRepositoryRow => ({
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section,
  repository,
  status,
  reason,
  diagnostics
});

const findManifestRecord = (
  manifest: Manifest | undefined,
  student: RosterStudent
): ManifestRepositoryRecord | undefined =>
  manifest?.repositories.find((record) => record.studentId === student.studentId);

const getRepositoryNameDiagnostics = (
  config: LoadedGraiderConfig,
  student: RosterStudent
): {
  readonly repositoryName: string;
  readonly diagnostics: Diagnostic[];
} => {
  const result = generateRepositoryName({
    pattern: config.course.github.repo_name_pattern,
    termCode: config.summary.termCode,
    courseCode: config.course.course.code,
    assignmentSlug: config.summary.assignmentSlug,
    githubUsername: student.githubUsername
  });

  return {
    repositoryName: result.repositoryName ?? "",
    diagnostics: [...result.warnings, ...result.errors]
  };
};

const createLifecycleRow = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repositoryFullName: string
): ApplyPreviewRepositoryRow | undefined => {
  const assignmentStatus = config.assignment.assignment.status;

  if (assignmentStatus === DRAFT_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_NOT_ACTIVE_CODE,
        "Draft assignments cannot be applied.",
        config,
        student
      )
    ]);
  }

  if (assignmentStatus === CLOSED_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_CLOSED_BLOCKS_CREATION_CODE,
        "Closed assignments block new repository creation.",
        config,
        student
      )
    ]);
  }

  if (assignmentStatus === ARCHIVED_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_ARCHIVED_CODE,
        "Archived assignments cannot be applied.",
        config,
        student
      )
    ]);
  }

  return undefined;
};

const createDraftOrArchivedLifecycleRow = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repositoryFullName: string
): ApplyPreviewRepositoryRow | undefined => {
  const assignmentStatus = config.assignment.assignment.status;

  if (assignmentStatus === DRAFT_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_NOT_ACTIVE_CODE,
        "Draft assignments cannot be applied.",
        config,
        student
      )
    ]);
  }

  if (assignmentStatus === ARCHIVED_ASSIGNMENT_STATUS) {
    return createRow(student, repositoryFullName, "blocked", assignmentStatus, [
      createLifecycleDiagnostic(
        ASSIGNMENT_ARCHIVED_CODE,
        "Archived assignments cannot be applied.",
        config,
        student
      )
    ]);
  }

  return undefined;
};

const getSkippedStudentReason = (status: RosterStatus): string =>
  `${STUDENT_STATUS_REASON_PREFIX}_${status}`;

const previewRepositoryWithClient = async (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repositoryName: string,
  manifestRecord: ManifestRepositoryRecord | undefined,
  githubClient: GitHubClient
): Promise<ApplyPreviewRepositoryRow> => {
  const owner = config.course.github.organization;
  const repositoryFullName = `${owner}/${repositoryName}`;
  const blockingLifecycleRow = createDraftOrArchivedLifecycleRow(
    config,
    student,
    repositoryFullName
  );

  if (blockingLifecycleRow !== undefined) {
    return blockingLifecycleRow;
  }

  if (manifestRecord !== undefined) {
    try {
      const existingRepository = await githubClient.getRepository(owner, repositoryName);

      if (existingRepository === null) {
        return createRow(student, repositoryFullName, "blocked", "manifest_repository_missing", [
          createManifestTrackedMissingDiagnostic(owner, repositoryName, student)
        ]);
      }

      return createRow(student, repositoryFullName, "would_update", "manifest_tracked_repository");
    } catch (error) {
      return createRow(
        student,
        repositoryFullName,
        "unknown",
        UNKNOWN_REASON_REPOSITORY_STATUS_UNKNOWN,
        [createRepositoryStatusUnknownDiagnostic(error, owner, repositoryName, student)]
      );
    }
  }

  const lifecycleRow = createLifecycleRow(config, student, repositoryFullName);

  if (lifecycleRow !== undefined) {
    return lifecycleRow;
  }

  if (config.assignment.assignment.status !== ACTIVE_ASSIGNMENT_STATUS) {
    return createRow(
      student,
      repositoryFullName,
      "would_skip",
      config.assignment.assignment.status
    );
  }

  try {
    const existingRepository = await githubClient.getRepository(owner, repositoryName);

    return existingRepository === null
      ? createRow(student, repositoryFullName, "would_create", "student_repository_missing")
      : createRow(student, repositoryFullName, "would_update", "student_repository_exists");
  } catch (error) {
    return createRow(
      student,
      repositoryFullName,
      "unknown",
      UNKNOWN_REASON_REPOSITORY_STATUS_UNKNOWN,
      [createRepositoryStatusUnknownDiagnostic(error, owner, repositoryName, student)]
    );
  }
};

const previewRepositoryWithoutClient = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repositoryName: string,
  manifestRecord: ManifestRepositoryRecord | undefined
): ApplyPreviewRepositoryRow => {
  const repositoryFullName = `${config.course.github.organization}/${repositoryName}`;
  const blockingLifecycleRow = createDraftOrArchivedLifecycleRow(
    config,
    student,
    repositoryFullName
  );
  const lifecycleRow =
    blockingLifecycleRow ??
    (manifestRecord === undefined
      ? createLifecycleRow(config, student, repositoryFullName)
      : undefined);

  return (
    lifecycleRow ?? createRow(student, repositoryFullName, "unknown", UNKNOWN_REASON_TOKEN_REQUIRED)
  );
};

const previewStudentRepository = async (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  manifest: Manifest | undefined,
  githubClient: GitHubClient | undefined
): Promise<ApplyPreviewRepositoryRow> => {
  const generatedName = getRepositoryNameDiagnostics(config, student);
  const owner = config.course.github.organization;
  const manifestRecord = findManifestRecord(manifest, student);
  const repositoryName = manifestRecord?.repository.name ?? generatedName.repositoryName;
  const repositoryFullName = `${owner}/${repositoryName}`;

  if (student.status !== ROSTER_STATUS_ACTIVE) {
    return createRow(
      student,
      repositoryFullName,
      "would_skip",
      getSkippedStudentReason(student.status)
    );
  }

  if (generatedName.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return createRow(student, repositoryFullName, "blocked", "invalid_repository_name", [
      ...generatedName.diagnostics
    ]);
  }

  if (githubClient === undefined) {
    return previewRepositoryWithoutClient(config, student, repositoryName, manifestRecord);
  }

  return previewRepositoryWithClient(config, student, repositoryName, manifestRecord, githubClient);
};

const createPlanSummary = (
  repositories: readonly ApplyPreviewRepositoryRow[]
): ApplyPreviewPlanSummary => ({
  wouldCreateRepositories: repositories.filter((row) => row.status === "would_create").length,
  wouldUpdateRepositories: repositories.filter((row) => row.status === "would_update").length,
  wouldSkipRepositories: repositories.filter((row) => row.status === "would_skip").length,
  blockedRepositories: repositories.filter((row) => row.status === "blocked").length,
  unknownRepositories: repositories.filter((row) => row.status === "unknown").length
});

const collectRowDiagnostics = (repositories: readonly ApplyPreviewRepositoryRow[]): Diagnostic[] =>
  repositories.flatMap((row) => row.diagnostics);

const hasErrorDiagnostics = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error");

const createApplyAction = (
  config: LoadedGraiderConfig,
  diagnostics: readonly Diagnostic[],
  summary: ApplyPreviewPlanSummary
): ApplyPreviewAction => {
  const assignmentStatus = config.assignment.assignment.status;
  const lifecycleAllowsApply =
    assignmentStatus === ACTIVE_ASSIGNMENT_STATUS || assignmentStatus === CLOSED_ASSIGNMENT_STATUS;
  const blocked =
    hasErrorDiagnostics(diagnostics) ||
    summary.blockedRepositories > EMPTY_COUNT ||
    summary.unknownRepositories > EMPTY_COUNT ||
    !lifecycleAllowsApply;

  return {
    available: !blocked,
    implemented: false,
    previewOnly: true,
    ...(blocked ? { reason: "preview_has_blockers" } : {})
  };
};

const createStatus = (diagnostics: readonly Diagnostic[]): CommandStatus =>
  hasErrorDiagnostics(diagnostics) ? "partial_success" : "success";

const createTemplateSource = (template: ApplyPreviewTemplate): string =>
  `${template.repository}@${template.branch}`;

export const buildAssignmentApplyPreview = async ({
  cwd,
  assignmentFile,
  githubClient
}: BuildAssignmentApplyPreviewInput): Promise<AssignmentApplyPreviewResult> => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });

  if (configResult.status === "failure") {
    return createEmptyAssignmentApplyPreviewResult("failure", configResult.diagnostics);
  }

  const { config } = configResult;
  const rosterResult = loadAssignmentRosters(config);

  if (rosterResult.errors.length > EMPTY_COUNT) {
    return createEmptyAssignmentApplyPreviewResult("failure", [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...rosterResult.errors
    ]);
  }

  if (rosterResult.students.length === EMPTY_COUNT) {
    return createEmptyAssignmentApplyPreviewResult("failure", [
      ...configResult.diagnostics,
      createTargetStudentsEmptyDiagnostic(config)
    ]);
  }

  if (config.assignment.repository_mode === "group") {
    const groupPlan = buildGroupApplyPreviewPlan(config, rosterResult.students);
    const localTemplate = createTemplatePreview(config);
    const localGrading = createGradingPreview(config);
    const readiness = await checkAssignmentDetailGithubReadiness({
      config,
      template: localTemplate,
      grading: localGrading,
      ...(githubClient === undefined ? {} : { githubClient })
    });
    const diagnostics = [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...groupPlan.warnings,
      ...groupPlan.errors,
      ...readiness.diagnostics,
      createWarningDiagnostic(
        "group_repository_apply_not_implemented",
        "Group repository Apply Preview is available. Group repository creation is not implemented yet.",
        { assignmentFile: config.summary.assignmentConfigPath }
      )
    ];
    const status = groupPlan.errors.length === EMPTY_COUNT ? createStatus(diagnostics) : "failure";
    const summary: ApplyPreviewPlanSummary = {
      wouldCreateRepositories: groupPlan.targets.length,
      wouldUpdateRepositories: EMPTY_COUNT,
      wouldSkipRepositories: EMPTY_COUNT,
      blockedRepositories:
        groupPlan.errors.length === EMPTY_COUNT ? EMPTY_COUNT : groupPlan.targets.length,
      unknownRepositories: EMPTY_COUNT
    };
    return {
      schemaVersion: ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION,
      commandName: COMMAND_NAME,
      status,
      exitCode: resolveExitCode(status),
      diagnostics,
      repositoryMode: "group",
      applySupported: false,
      assignment: {
        slug: config.assignment.assignment.slug,
        title: config.assignment.assignment.title,
        file: config.summary.assignmentConfigPath,
        status: config.assignment.assignment.status
      },
      course: { slug: config.course.course.code, title: config.course.course.title },
      term: { slug: config.term.term.code, title: config.term.term.display_name },
      target: {
        sections: config.assignment.sections,
        sectionCount: config.assignment.sections.length,
        studentCount: rosterResult.summary.studentCount
      },
      template: readiness.template,
      grading: readiness.grading,
      plan: { summary, repositories: [], groupTargets: groupPlan.targets },
      files: {
        assignmentFile: config.summary.assignmentConfigPath,
        workflowFile: readiness.grading.workflow,
        templateSource: createTemplateSource(readiness.template)
      },
      actions: {
        apply: {
          available: false,
          implemented: false,
          previewOnly: true,
          reason: "group_repository_apply_not_implemented"
        }
      }
    };
  }

  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  const manifestResult = loadManifest(manifestPath.absolutePath);
  const manifest = manifestResult.status === "loaded" ? manifestResult.manifest : undefined;
  const localTemplate = createTemplatePreview(config);
  const localGrading = createGradingPreview(config);
  const readiness = await checkAssignmentDetailGithubReadiness({
    config,
    template: localTemplate,
    grading: localGrading,
    ...(githubClient === undefined ? {} : { githubClient })
  });
  const repositoryRows = await Promise.all(
    rosterResult.students.map((student) =>
      previewStudentRepository(config, student, manifest, githubClient)
    )
  );
  const summary = createPlanSummary(repositoryRows);
  const diagnostics = [
    ...configResult.diagnostics,
    ...rosterResult.warnings,
    ...manifestResult.warnings,
    ...manifestResult.errors,
    ...readiness.diagnostics,
    ...collectRowDiagnostics(repositoryRows)
  ];
  const status = createStatus(diagnostics);
  const action = createApplyAction(config, diagnostics, summary);

  return {
    schemaVersion: ASSIGNMENT_APPLY_PREVIEW_SCHEMA_VERSION,
    commandName: COMMAND_NAME,
    status,
    exitCode: resolveExitCode(status),
    diagnostics,
    assignment: {
      slug: config.assignment.assignment.slug,
      title: config.assignment.assignment.title,
      file: config.summary.assignmentConfigPath,
      status: config.assignment.assignment.status
    },
    course: {
      slug: config.course.course.code,
      title: config.course.course.title
    },
    term: {
      slug: config.term.term.code,
      title: config.term.term.display_name
    },
    target: {
      sections: config.assignment.sections,
      sectionCount: config.assignment.sections.length,
      studentCount: rosterResult.summary.studentCount
    },
    template: readiness.template,
    grading: readiness.grading,
    plan: {
      summary,
      repositories: repositoryRows
    },
    files: {
      assignmentFile: config.summary.assignmentConfigPath,
      workflowFile: readiness.grading.workflow,
      templateSource: createTemplateSource(readiness.template)
    },
    actions: {
      apply: action
    }
  };
};
