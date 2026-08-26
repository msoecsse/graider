import type { LoadedGraiderConfig, RawCourseConfig } from "../config/config-models.js";
import { DISABLED_GRADING_MODE } from "../config/config-schemas.js";
import { loadGraiderConfig } from "../config/config-loader.js";
import type { CommandStatus } from "../core/command-result.js";
import {
  ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE,
  GITHUB_TOKEN_REQUIRED_CODE,
  GRADING_NOT_CONFIGURED_CODE,
  GRADING_WORKFLOW_MISSING_CODE,
  STUDENT_REPOSITORY_MISSING_CODE,
  STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE,
  TARGET_MATCHES_NO_STUDENTS_CODE,
  WORKFLOW_DISPATCH_MISSING_CODE,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import { loadManifest } from "../manifest/manifest-loader.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import { loadAssignmentRosters } from "../roster/roster-loader.js";
import { ROSTER_STATUS_ACTIVE, type RosterStudent } from "../roster/roster-models.js";
import { getWorkflowDispatchIdentifier } from "../workflows/workflow-paths.js";
import {
  findGradingTargetForStudent,
  normalizeGradingTargets,
  type GradingRepositoryTarget,
  type NormalizedGradingTargets
} from "../execution/grading-targets.js";
import {
  ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION,
  type AssignmentGradePreviewResult,
  type GradePreviewAction,
  type GradePreviewGrading,
  type GradePreviewPlanSummary,
  type GradePreviewRepositoryRow,
  type GradePreviewRepositoryStatus,
  type GradePreviewWorkflowDispatchStatus
} from "./grade-preview-models.js";

const COMMAND_NAME = "assignment grade-preview";
const EMPTY_COUNT = 0;
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const PARTIAL_SUCCESS_EXIT_CODE = 2;
const LEGACY_GRADING_MODE = "custom-workflow";
const TOKEN_REQUIRED_REASON = "token_required";
const WORKFLOW_DISPATCH_AVAILABLE_REASON = "workflow_dispatch_available";
const STUDENT_STATUS_REASON_PREFIX = "student_status";
const ACTIVE_ASSIGNMENT_STATUSES = ["active", "closed"] as const;

export interface BuildAssignmentGradePreviewInput {
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

export const createEmptyAssignmentGradePreviewResult = (
  status: CommandStatus,
  diagnostics: Diagnostic[]
): AssignmentGradePreviewResult => ({
  schemaVersion: ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION,
  commandName: COMMAND_NAME,
  status,
  exitCode: resolveExitCode(status),
  diagnostics,
  assignment: null,
  course: null,
  term: null,
  target: null,
  grading: null,
  plan: null,
  files: null,
  actions: null
});

const getEffectiveGrading = (config: LoadedGraiderConfig): RawCourseConfig["grading"] =>
  config.assignment.grading === undefined ? config.course.grading : config.assignment.grading;

const createGradingNotConfiguredWarning = (): Diagnostic =>
  createWarningDiagnostic(
    GRADING_NOT_CONFIGURED_CODE,
    "Automated grading is not configured for this assignment."
  );

const createTokenRequiredDiagnostic = (): Diagnostic =>
  createConfigDiagnostic(
    GITHUB_TOKEN_REQUIRED_CODE,
    "GitHub token required to check student repository workflow dispatch readiness."
  );

const createTargetStudentsEmptyDiagnostic = (config: LoadedGraiderConfig): Diagnostic =>
  createConfigDiagnostic(
    TARGET_MATCHES_NO_STUDENTS_CODE,
    "Assignment grade preview found no target students.",
    {
      assignmentFile: config.summary.assignmentConfigPath,
      sections: config.assignment.sections
    }
  );

const createAssignmentStatusBlocksGradeDiagnostic = (
  config: LoadedGraiderConfig,
  student: RosterStudent
): Diagnostic =>
  createConfigDiagnostic(
    ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE,
    `Assignment status ${config.assignment.assignment.status} does not allow grade.`,
    {
      assignmentStatus: config.assignment.assignment.status,
      assignmentFile: config.summary.assignmentConfigPath,
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }
  );

const createStudentRepositoryMissingDiagnostic = (student: RosterStudent): Diagnostic =>
  createConfigDiagnostic(
    STUDENT_REPOSITORY_MISSING_CODE,
    "Selected student does not have a manifest-tracked repository.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }
  );

const createManifestTrackedRepositoryMissingDiagnostic = (
  student: RosterStudent,
  repository: GradingRepositoryTarget
): Diagnostic =>
  createConfigDiagnostic(
    STUDENT_REPOSITORY_MISSING_CODE,
    "Manifest-tracked student repository was not found.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName
    }
  );

const createWorkflowMissingDiagnostic = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    GRADING_WORKFLOW_MISSING_CODE,
    "Configured grading workflow was not found.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName,
      workflowPath
    }
  );

const createWorkflowDispatchMissingDiagnostic = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    WORKFLOW_DISPATCH_MISSING_CODE,
    "Configured grading workflow does not support manual dispatch.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName,
      workflowPath
    }
  );

const createRepositoryStatusUnknownDiagnostic = (
  error: unknown,
  student: RosterStudent,
  repository: GradingRepositoryTarget
): Diagnostic => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      error.diagnosticCode,
      `Could not check repository ${repository.fullName}: ${error.message}`,
      {
        studentId: student.studentId,
        githubUsername: student.githubUsername,
        section: student.section,
        repository: repository.fullName,
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
    `Could not check repository ${repository.fullName}.`,
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName
    }
  );
};

const createGradingPreview = (
  config: LoadedGraiderConfig,
  workflowDispatch: GradePreviewWorkflowDispatchStatus
): GradePreviewGrading => {
  const grading = getEffectiveGrading(config);
  const resolvedFrom =
    config.summary.gradingSource === "assignment" ? "assignment_override" : "course_default";

  if (!grading.enabled) {
    return {
      enabled: false,
      resolvedFrom,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
      workflowDispatch: "not_required",
      workflowRef: null
    };
  }

  return {
    enabled: true,
    resolvedFrom,
    mode: grading.mode ?? LEGACY_GRADING_MODE,
    workflow: grading.workflow ?? null,
    artifact: grading.artifact ?? null,
    resultFile: grading.result_file ?? null,
    workflowDispatch,
    workflowRef: config.assignment.template.branch
  };
};

const findManifestRecord = (
  targets: NormalizedGradingTargets | undefined,
  student: RosterStudent
): GradingRepositoryTarget | undefined =>
  targets === undefined ? undefined : findGradingTargetForStudent(targets, student);

const createRow = (
  student: RosterStudent,
  repository: string | null,
  status: GradePreviewRepositoryStatus,
  reason: string,
  workflow: string | null,
  ref: string | null,
  diagnostics: Diagnostic[] = []
): GradePreviewRepositoryRow => ({
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section,
  repository,
  status,
  reason,
  workflow,
  ref,
  diagnostics
});

const createSkippedStudentRow = (
  student: RosterStudent,
  repository: GradingRepositoryTarget | undefined
): GradePreviewRepositoryRow =>
  createRow(
    student,
    repository?.fullName ?? null,
    "would_skip",
    `${STUDENT_STATUS_REASON_PREFIX}_${student.status}`,
    null,
    null
  );

const createBlockedLifecycleRow = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repository: GradingRepositoryTarget | undefined,
  workflowPath: string | null
): GradePreviewRepositoryRow =>
  createRow(
    student,
    repository?.fullName ?? null,
    "blocked",
    config.assignment.assignment.status,
    workflowPath,
    config.assignment.template.branch,
    [createAssignmentStatusBlocksGradeDiagnostic(config, student)]
  );

const createGradingDisabledRow = (
  student: RosterStudent,
  repository: GradingRepositoryTarget | undefined
): GradePreviewRepositoryRow =>
  createRow(
    student,
    repository?.fullName ?? null,
    "would_skip",
    GRADING_NOT_CONFIGURED_CODE,
    null,
    null
  );

const createMissingManifestRow = (
  student: RosterStudent,
  workflowPath: string | null,
  ref: string | null
): GradePreviewRepositoryRow =>
  createRow(student, null, "blocked", STUDENT_REPOSITORY_MISSING_CODE, workflowPath, ref, [
    createStudentRepositoryMissingDiagnostic(student)
  ]);

const previewDispatchableRepository = async (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  githubClient: GitHubClient,
  workflowPath: string,
  ref: string
): Promise<GradePreviewRepositoryRow> => {
  try {
    const existingRepository = await githubClient.getRepository(
      repository.owner,
      repository.repositoryName
    );

    if (existingRepository === null) {
      return createRow(
        student,
        repository.fullName,
        "blocked",
        STUDENT_REPOSITORY_MISSING_CODE,
        workflowPath,
        ref,
        [createManifestTrackedRepositoryMissingDiagnostic(student, repository)]
      );
    }

    const workflow = await githubClient.getWorkflow(
      repository.owner,
      repository.repositoryName,
      getWorkflowDispatchIdentifier(workflowPath)
    );

    if (workflow === null) {
      return createRow(
        student,
        repository.fullName,
        "blocked",
        GRADING_WORKFLOW_MISSING_CODE,
        workflowPath,
        ref,
        [createWorkflowMissingDiagnostic(student, repository, workflowPath)]
      );
    }

    if (!workflow.supportsDispatch) {
      return createRow(
        student,
        repository.fullName,
        "blocked",
        WORKFLOW_DISPATCH_MISSING_CODE,
        workflowPath,
        ref,
        [createWorkflowDispatchMissingDiagnostic(student, repository, workflowPath)]
      );
    }

    return createRow(
      student,
      repository.fullName,
      "would_dispatch",
      WORKFLOW_DISPATCH_AVAILABLE_REASON,
      workflowPath,
      ref
    );
  } catch (error) {
    return createRow(
      student,
      repository.fullName,
      "unknown",
      STUDENT_REPOSITORY_STATUS_UNKNOWN_CODE,
      workflowPath,
      ref,
      [createRepositoryStatusUnknownDiagnostic(error, student, repository)]
    );
  }
};

const previewStudentRepository = async (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  targets: NormalizedGradingTargets | undefined,
  githubClient: GitHubClient | undefined
): Promise<GradePreviewRepositoryRow> => {
  const grading = getEffectiveGrading(config);
  const workflowPath = grading.workflow ?? null;
  const workflowRef = grading.enabled ? config.assignment.template.branch : null;
  const repository = findManifestRecord(targets, student);

  if (student.status !== ROSTER_STATUS_ACTIVE) {
    return createSkippedStudentRow(student, repository);
  }

  if (!grading.enabled || workflowPath === null) {
    return createGradingDisabledRow(student, repository);
  }

  if (
    !ACTIVE_ASSIGNMENT_STATUSES.some((status) => status === config.assignment.assignment.status)
  ) {
    return createBlockedLifecycleRow(config, student, repository, workflowPath);
  }

  if (repository === undefined) {
    return createMissingManifestRow(student, workflowPath, workflowRef);
  }

  if (githubClient === undefined) {
    return createRow(
      student,
      repository.fullName,
      "token_required",
      TOKEN_REQUIRED_REASON,
      workflowPath,
      workflowRef
    );
  }

  return previewDispatchableRepository(
    student,
    repository,
    githubClient,
    workflowPath,
    config.assignment.template.branch
  );
};

const createPlanSummary = (
  repositories: readonly GradePreviewRepositoryRow[]
): GradePreviewPlanSummary => ({
  wouldDispatch: repositories.filter((row) => row.status === "would_dispatch").length,
  wouldSkip: repositories.filter((row) => row.status === "would_skip").length,
  blocked: repositories.filter((row) => row.status === "blocked").length,
  unknown: repositories.filter((row) => row.status === "unknown" || row.status === "token_required")
    .length
});

const collectRowDiagnostics = (repositories: readonly GradePreviewRepositoryRow[]): Diagnostic[] =>
  repositories.flatMap((row) => row.diagnostics);

const hasErrorDiagnostics = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error");

const hasTokenRequiredRows = (repositories: readonly GradePreviewRepositoryRow[]): boolean =>
  repositories.some((row) => row.status === "token_required");

const createStatus = (diagnostics: readonly Diagnostic[]): CommandStatus =>
  hasErrorDiagnostics(diagnostics) ? "partial_success" : "success";

const createGradeAction = (
  diagnostics: readonly Diagnostic[],
  summary: GradePreviewPlanSummary
): GradePreviewAction => {
  const blocked =
    hasErrorDiagnostics(diagnostics) ||
    summary.blocked > EMPTY_COUNT ||
    summary.unknown > EMPTY_COUNT ||
    summary.wouldDispatch === EMPTY_COUNT;

  return {
    available: !blocked,
    implemented: false,
    previewOnly: true,
    ...(blocked ? { reason: "preview_has_blockers" } : {})
  };
};

const createWorkflowDispatchStatus = (
  grading: RawCourseConfig["grading"],
  repositories: readonly GradePreviewRepositoryRow[]
): GradePreviewWorkflowDispatchStatus => {
  if (!grading.enabled) {
    return "not_required";
  }

  if (repositories.some((row) => row.status === "token_required" || row.status === "unknown")) {
    return "not_checked";
  }

  if (
    repositories.some(
      (row) =>
        row.reason === GRADING_WORKFLOW_MISSING_CODE ||
        row.reason === WORKFLOW_DISPATCH_MISSING_CODE
    )
  ) {
    return "missing";
  }

  return repositories.some((row) => row.status === "would_dispatch") ? "available" : "not_checked";
};

export const buildAssignmentGradePreview = async ({
  cwd,
  assignmentFile,
  githubClient
}: BuildAssignmentGradePreviewInput): Promise<AssignmentGradePreviewResult> => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });

  if (configResult.status === "failure") {
    return createEmptyAssignmentGradePreviewResult("failure", configResult.diagnostics);
  }

  const { config } = configResult;
  const rosterResult = loadAssignmentRosters(config);

  if (rosterResult.errors.length > EMPTY_COUNT) {
    return createEmptyAssignmentGradePreviewResult("failure", [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...rosterResult.errors
    ]);
  }

  if (rosterResult.students.length === EMPTY_COUNT) {
    return createEmptyAssignmentGradePreviewResult("failure", [
      ...configResult.diagnostics,
      createTargetStudentsEmptyDiagnostic(config)
    ]);
  }

  const manifestPath = createManifestPath(
    config.summary.repoRoot,
    config.summary.termCode,
    config.summary.assignmentSlug
  );
  const grading = getEffectiveGrading(config);
  const manifestResult = loadManifest(manifestPath.absolutePath, { required: grading.enabled });
  const manifest = manifestResult.status === "loaded" ? manifestResult.manifest : undefined;
  const normalizedTargets =
    manifest === undefined
      ? undefined
      : normalizeGradingTargets(manifest, config.course.github.organization);
  const repositoryRows =
    normalizedTargets?.repositoryMode === "group"
      ? await Promise.all(
          normalizedTargets.targets.flatMap((target) => {
            const student = rosterResult.students.find((candidate) =>
              target.studentIds.some((studentId) => studentId === candidate.studentId)
            );
            return student === undefined
              ? []
              : [
                  previewStudentRepository(config, student, normalizedTargets, githubClient).then(
                    (row) => ({
                      ...row,
                      targetId: target.targetId,
                      ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
                      studentIds: target.studentIds,
                      githubUsernames: target.githubUsernames
                    })
                  )
                ];
          })
        )
      : await Promise.all(
          rosterResult.students.map((student) =>
            previewStudentRepository(config, student, normalizedTargets, githubClient)
          )
        );
  const summary = createPlanSummary(repositoryRows);
  const rowDiagnostics = collectRowDiagnostics(repositoryRows);
  const diagnostics = [
    ...configResult.diagnostics,
    ...rosterResult.warnings,
    ...manifestResult.warnings,
    ...manifestResult.errors,
    ...(!grading.enabled ? [createGradingNotConfiguredWarning()] : []),
    ...(hasTokenRequiredRows(repositoryRows) ? [createTokenRequiredDiagnostic()] : []),
    ...rowDiagnostics
  ];
  const status = createStatus(diagnostics);

  return {
    schemaVersion: ASSIGNMENT_GRADE_PREVIEW_SCHEMA_VERSION,
    commandName: COMMAND_NAME,
    status,
    exitCode: resolveExitCode(status),
    diagnostics,
    ...(normalizedTargets?.repositoryMode === "group" ? { repositoryMode: "group" as const } : {}),
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
      studentCount: rosterResult.summary.studentCount,
      activeStudentCount: rosterResult.summary.activeStudentCount
    },
    grading: createGradingPreview(config, createWorkflowDispatchStatus(grading, repositoryRows)),
    plan: {
      summary,
      repositories: repositoryRows
    },
    files: {
      assignmentFile: config.summary.assignmentConfigPath,
      manifestFile: manifestPath.relativePath,
      workflowFile: grading.workflow ?? null
    },
    actions: {
      grade: createGradeAction(diagnostics, summary)
    }
  };
};
