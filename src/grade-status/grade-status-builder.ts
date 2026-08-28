import type { LoadedGraiderConfig, RawCourseConfig } from "../config/config-models.js";
import { DISABLED_GRADING_MODE } from "../config/config-schemas.js";
import { loadGraiderConfig } from "../config/config-loader.js";
import type { CommandStatus } from "../core/command-result.js";
import {
  ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE,
  GITHUB_TOKEN_REQUIRED_CODE,
  GRADING_NOT_CONFIGURED_CODE,
  GRADING_WORKFLOW_RUN_FAILED_CODE,
  GRADING_WORKFLOW_RUN_IN_PROGRESS_CODE,
  GRADING_WORKFLOW_RUN_MISSING_CODE,
  GRADING_WORKFLOW_STATUS_UNKNOWN_CODE,
  STUDENT_FILTER_NO_MATCHES_CODE,
  STUDENT_FILTER_UNKNOWN_STUDENT_CODE,
  STUDENT_REPOSITORY_MISSING_CODE,
  TARGET_MATCHES_NO_STUDENTS_CODE,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import type { GitHubWorkflowRun, GitHubWorkflowRunConclusion } from "../github/github-models.js";
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
  ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION,
  type AssignmentGradeStatusResult,
  type GradeStatusActions,
  type GradeStatusGrading,
  type GradeStatusRepositoryConclusion,
  type GradeStatusRepositoryRow,
  type GradeStatusRepositoryStatus,
  type GradeStatusSummary
} from "./grade-status-models.js";

const COMMAND_NAME = "assignment grade-status";
const EMPTY_COUNT = 0;
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const PARTIAL_SUCCESS_EXIT_CODE = 2;
const LEGACY_GRADING_MODE = "custom-workflow";
const TOKEN_REQUIRED_REASON = "token_required";
const LATEST_WORKFLOW_RUN_SELECTION = "latest_configured_workflow_run";
const NO_RUN_SELECTION = "no_configured_workflow_run";
const ACTIVE_ASSIGNMENT_STATUSES = ["active", "closed"] as const;
const GITHUB_HOST = "github.com";
const ACTIONS_RUN_PATH_SEGMENT_COUNT = 5;

export interface BuildAssignmentGradeStatusInput {
  readonly cwd: string;
  readonly assignmentFile: string;
  readonly githubClient?: GitHubClient;
  readonly studentIds?: readonly string[];
}

const resolveExitCode = (status: CommandStatus): 0 | 1 | 2 => {
  if (status === "success") {
    return SUCCESS_EXIT_CODE;
  }

  return status === "partial_success" ? PARTIAL_SUCCESS_EXIT_CODE : FAILURE_EXIT_CODE;
};

export const createEmptyAssignmentGradeStatusResult = (
  status: CommandStatus,
  diagnostics: Diagnostic[]
): AssignmentGradeStatusResult => ({
  schemaVersion: ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION,
  commandName: COMMAND_NAME,
  status,
  exitCode: resolveExitCode(status),
  diagnostics,
  assignment: null,
  course: null,
  term: null,
  target: null,
  grading: null,
  summary: null,
  targets: [],
  repositories: [],
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
    "GitHub token required to check student repository grading workflow run status."
  );

const createTargetStudentsEmptyDiagnostic = (config: LoadedGraiderConfig): Diagnostic =>
  createConfigDiagnostic(
    TARGET_MATCHES_NO_STUDENTS_CODE,
    "Assignment grade status found no target students.",
    {
      assignmentFile: config.summary.assignmentConfigPath,
      sections: config.assignment.sections
    }
  );

const createStudentFilterUnknownDiagnostic = (
  config: LoadedGraiderConfig,
  studentId: string
): Diagnostic =>
  createConfigDiagnostic(
    STUDENT_FILTER_UNKNOWN_STUDENT_CODE,
    "Student filter did not match an active target student.",
    {
      assignmentFile: config.summary.assignmentConfigPath,
      studentId
    }
  );

const createStudentFilterNoMatchesDiagnostic = (
  config: LoadedGraiderConfig,
  studentIds: readonly string[]
): Diagnostic =>
  createConfigDiagnostic(
    STUDENT_FILTER_NO_MATCHES_CODE,
    "Student filter did not match any active target students.",
    {
      assignmentFile: config.summary.assignmentConfigPath,
      studentIds
    }
  );

const createAssignmentStatusBlocksGradeDiagnostic = (
  config: LoadedGraiderConfig,
  student: RosterStudent
): Diagnostic =>
  createConfigDiagnostic(
    ASSIGNMENT_STATUS_BLOCKS_GRADE_CODE,
    `Assignment status ${config.assignment.assignment.status} does not allow grade status.`,
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

const createWorkflowRunMissingDiagnostic = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    GRADING_WORKFLOW_RUN_MISSING_CODE,
    "No grading workflow run was found for the configured workflow.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName,
      workflowPath
    }
  );

const createWorkflowStatusUnknownDiagnostic = (
  error: unknown,
  student: RosterStudent,
  repository: GradingRepositoryTarget
): Diagnostic => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      error.diagnosticCode,
      `Could not check grading workflow run status for ${repository.fullName}.`,
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
    GRADING_WORKFLOW_STATUS_UNKNOWN_CODE,
    `Could not check grading workflow run status for ${repository.fullName}.`,
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName
    }
  );
};

const createWorkflowRunInProgressDiagnostic = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  run: GitHubWorkflowRun,
  workflowPath: string
): Diagnostic =>
  createWarningDiagnostic(
    GRADING_WORKFLOW_RUN_IN_PROGRESS_CODE,
    "Grading workflow run is not complete yet.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName,
      workflowPath,
      runId: run.id,
      status: run.status
    }
  );

const createWorkflowRunFailedDiagnostic = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  run: GitHubWorkflowRun,
  workflowPath: string,
  conclusion: GradeStatusRepositoryConclusion
): Diagnostic =>
  createConfigDiagnostic(
    GRADING_WORKFLOW_RUN_FAILED_CODE,
    "Grading workflow run completed with a non-success conclusion.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repository: repository.fullName,
      workflowPath,
      runId: run.id,
      conclusion
    }
  );

const createGradingStatus = (config: LoadedGraiderConfig): GradeStatusGrading => {
  const grading = getEffectiveGrading(config);
  const resolvedFrom =
    config.summary.gradingSource === "assignment"
      ? "assignment_override"
      : config.summary.gradingSource === "course"
        ? "course_default"
        : "none";

  if (!grading.enabled) {
    return {
      enabled: false,
      resolvedFrom,
      mode: grading.mode ?? DISABLED_GRADING_MODE,
      workflow: null,
      artifact: null,
      resultFile: null,
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
    workflowRef: config.assignment.template.branch
  };
};

const findManifestRecord = (
  targets: NormalizedGradingTargets | undefined,
  student: RosterStudent
): GradingRepositoryTarget | undefined =>
  targets === undefined ? undefined : findGradingTargetForStudent(targets, student);

const normalizeConclusion = (
  conclusion: GitHubWorkflowRunConclusion
): GradeStatusRepositoryConclusion => {
  if (conclusion === null) {
    return "unknown";
  }

  return conclusion;
};

const getRunTimestamp = (run: GitHubWorkflowRun): string => run.startedAt ?? run.createdAt;

const sortRunsNewestFirst = (runs: readonly GitHubWorkflowRun[]): GitHubWorkflowRun[] =>
  [...runs].sort((left, right) => getRunTimestamp(right).localeCompare(getRunTimestamp(left)));

const selectLatestWorkflowRun = (runs: readonly GitHubWorkflowRun[]): GitHubWorkflowRun | null =>
  sortRunsNewestFirst(runs)[0] ?? null;

const createFallbackRunUrl = (
  repository: GradingRepositoryTarget,
  run: GitHubWorkflowRun
): string => `https://${GITHUB_HOST}/${repository.fullName}/actions/runs/${String(run.id)}`;

const isMatchingRunUrl = (
  urlValue: string,
  repository: GradingRepositoryTarget,
  runId: number
): boolean => {
  try {
    const url = new URL(urlValue);
    const pathParts = url.pathname.split("/").filter((part) => part.length > 0);
    const [owner, repo, actions, runs, pathRunId] = pathParts;

    return (
      url.protocol === "https:" &&
      url.hostname === GITHUB_HOST &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      pathParts.length === ACTIONS_RUN_PATH_SEGMENT_COUNT &&
      owner === repository.owner &&
      repo === repository.repositoryName &&
      actions === "actions" &&
      runs === "runs" &&
      pathRunId === String(runId)
    );
  } catch {
    return false;
  }
};

const createRunUrl = (repository: GradingRepositoryTarget, run: GitHubWorkflowRun): string =>
  run.runUrl !== undefined && isMatchingRunUrl(run.runUrl, repository, run.id)
    ? run.runUrl
    : createFallbackRunUrl(repository, run);

const createRow = (
  student: RosterStudent,
  repository: string | null,
  status: GradeStatusRepositoryStatus,
  reason: string,
  workflow: string | null,
  ref: string | null,
  diagnostics: Diagnostic[] = [],
  run: GitHubWorkflowRun | null = null,
  repositoryRecord: GradingRepositoryTarget | null = null
): GradeStatusRepositoryRow => {
  const conclusion = run === null ? "unknown" : normalizeConclusion(run.conclusion);
  const failedConclusion =
    conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out";
  const needsAttention =
    status === "missing" ||
    status === "unknown" ||
    status === "blocked" ||
    status === "token_required" ||
    failedConclusion;

  return {
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    ...(repositoryRecord === null ? {} : { targetId: repositoryRecord.targetId }),
    ...(repositoryRecord?.groupId === undefined ? {} : { groupId: repositoryRecord.groupId }),
    ...(repositoryRecord === null ? {} : { studentIds: repositoryRecord.studentIds }),
    repository,
    workflow,
    ref,
    runId: run?.id ?? null,
    runUrl: run === null || repositoryRecord === null ? null : createRunUrl(repositoryRecord, run),
    status,
    conclusion,
    startedAt: run?.startedAt ?? run?.createdAt ?? null,
    completedAt: status === "completed" ? (run?.completedAt ?? run?.updatedAt ?? null) : null,
    selectionStrategy: run === null ? NO_RUN_SELECTION : LATEST_WORKFLOW_RUN_SELECTION,
    reason,
    needsAttention,
    diagnostics
  };
};

const createGradingDisabledRow = (
  student: RosterStudent,
  repository: GradingRepositoryTarget | undefined
): GradeStatusRepositoryRow =>
  createRow(
    student,
    repository?.fullName ?? null,
    "blocked",
    GRADING_NOT_CONFIGURED_CODE,
    null,
    null
  );

const createBlockedLifecycleRow = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repository: GradingRepositoryTarget | undefined,
  workflowPath: string | null
): GradeStatusRepositoryRow =>
  createRow(
    student,
    repository?.fullName ?? null,
    "blocked",
    config.assignment.assignment.status,
    workflowPath,
    config.assignment.template.branch,
    [createAssignmentStatusBlocksGradeDiagnostic(config, student)]
  );

const createMissingManifestRow = (
  student: RosterStudent,
  workflowPath: string | null,
  ref: string | null
): GradeStatusRepositoryRow =>
  createRow(student, null, "blocked", STUDENT_REPOSITORY_MISSING_CODE, workflowPath, ref, [
    createStudentRepositoryMissingDiagnostic(student)
  ]);

const createTokenRequiredRow = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  workflowPath: string,
  ref: string
): GradeStatusRepositoryRow =>
  createRow(
    student,
    repository.fullName,
    "token_required",
    TOKEN_REQUIRED_REASON,
    workflowPath,
    ref
  );

const mapRunStatus = (run: GitHubWorkflowRun): GradeStatusRepositoryStatus => {
  if (run.status === "in_progress") {
    return "in_progress";
  }

  return run.status;
};

const createRunRow = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  workflowPath: string,
  ref: string,
  run: GitHubWorkflowRun
): GradeStatusRepositoryRow => {
  const status = mapRunStatus(run);
  const conclusion = normalizeConclusion(run.conclusion);
  const reason = status === "completed" ? conclusion : status;
  const failedConclusion =
    conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out";
  const diagnostics =
    status === "queued" || status === "in_progress"
      ? [createWorkflowRunInProgressDiagnostic(student, repository, run, workflowPath)]
      : failedConclusion
        ? [createWorkflowRunFailedDiagnostic(student, repository, run, workflowPath, conclusion)]
        : [];

  return createRow(
    student,
    repository.fullName,
    status,
    reason,
    workflowPath,
    ref,
    diagnostics,
    run,
    repository
  );
};

const createMissingRunRow = (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  workflowPath: string,
  ref: string
): GradeStatusRepositoryRow =>
  createRow(
    student,
    repository.fullName,
    "missing",
    GRADING_WORKFLOW_RUN_MISSING_CODE,
    workflowPath,
    ref,
    [createWorkflowRunMissingDiagnostic(student, repository, workflowPath)]
  );

const createUnknownRunRow = (
  error: unknown,
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  workflowPath: string,
  ref: string
): GradeStatusRepositoryRow =>
  createRow(
    student,
    repository.fullName,
    "unknown",
    GRADING_WORKFLOW_STATUS_UNKNOWN_CODE,
    workflowPath,
    ref,
    [createWorkflowStatusUnknownDiagnostic(error, student, repository)]
  );

const getRepositoryWorkflowStatus = async (
  student: RosterStudent,
  repository: GradingRepositoryTarget,
  githubClient: GitHubClient,
  workflowPath: string,
  ref: string
): Promise<GradeStatusRepositoryRow> => {
  try {
    const runs = await githubClient.listWorkflowRuns({
      owner: repository.owner,
      repo: repository.repositoryName,
      workflowPath: getWorkflowDispatchIdentifier(workflowPath)
    });
    const run = selectLatestWorkflowRun(runs);

    return run === null
      ? createMissingRunRow(student, repository, workflowPath, ref)
      : createRunRow(student, repository, workflowPath, ref, run);
  } catch (error: unknown) {
    return createUnknownRunRow(error, student, repository, workflowPath, ref);
  }
};

const createRepositoryStatusRowUncached = async (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  targets: NormalizedGradingTargets | undefined,
  githubClient: GitHubClient | undefined
): Promise<GradeStatusRepositoryRow> => {
  const grading = getEffectiveGrading(config);
  const workflowPath = grading.workflow ?? null;
  const workflowRef = grading.enabled ? config.assignment.template.branch : null;
  const repository = findManifestRecord(targets, student);

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
    return createTokenRequiredRow(
      student,
      repository,
      workflowPath,
      config.assignment.template.branch
    );
  }

  return getRepositoryWorkflowStatus(
    student,
    repository,
    githubClient,
    workflowPath,
    config.assignment.template.branch
  );
};

const createRepositoryStatusRow = async (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  targets: NormalizedGradingTargets | undefined,
  githubClient: GitHubClient | undefined,
  statusCache: Map<string, Promise<GradeStatusRepositoryRow>>
): Promise<GradeStatusRepositoryRow> => {
  const repository = findManifestRecord(targets, student);

  if (repository === undefined) {
    return createRepositoryStatusRowUncached(config, student, targets, githubClient);
  }

  const cached = statusCache.get(repository.targetId);
  const sourceRow =
    cached ??
    (() => {
      const created = createRepositoryStatusRowUncached(config, student, targets, githubClient);
      statusCache.set(repository.targetId, created);
      return created;
    })();

  const row = await sourceRow;
  return {
    ...row,
    studentId: student.studentId,
    githubUsername: student.githubUsername,
    section: student.section,
    targetId: repository.targetId,
    ...(repository.groupId === undefined ? {} : { groupId: repository.groupId }),
    studentIds: repository.studentIds
  };
};

const countRows = (
  repositories: readonly GradeStatusRepositoryRow[],
  predicate: (row: GradeStatusRepositoryRow) => boolean
): number => repositories.filter(predicate).length;

const createSummary = (repositories: readonly GradeStatusRepositoryRow[]): GradeStatusSummary => {
  const queued = countRows(repositories, (row) => row.status === "queued");
  const inProgress = countRows(repositories, (row) => row.status === "in_progress");
  const completed = countRows(repositories, (row) => row.status === "completed");
  const missing = countRows(repositories, (row) => row.status === "missing");
  const unknown = countRows(
    repositories,
    (row) => row.status === "unknown" || row.status === "token_required"
  );
  const blocked = countRows(repositories, (row) => row.status === "blocked");
  const readyForReport =
    repositories.length > EMPTY_COUNT &&
    repositories.every((row) => row.status === "completed" && row.conclusion !== "unknown");

  return {
    totalRepositories: repositories.length,
    queued,
    inProgress,
    completed,
    successful: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "success"
    ),
    failed: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "failure"
    ),
    cancelled: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "cancelled"
    ),
    timedOut: countRows(
      repositories,
      (row) => row.status === "completed" && row.conclusion === "timed_out"
    ),
    missing,
    unknown,
    blocked,
    needsAttention: countRows(repositories, (row) => row.needsAttention),
    readyForReport
  };
};

const createSections = (
  config: LoadedGraiderConfig,
  students: readonly RosterStudent[],
  filtered: boolean
): string[] => {
  if (!filtered) {
    return config.assignment.sections;
  }

  return students.reduce<string[]>(
    (sections, student) =>
      sections.some((section) => section === student.section)
        ? sections
        : [...sections, student.section],
    []
  );
};

const createZeroSummary = (): GradeStatusSummary => createSummary([]);

const findUnknownStudentIds = (
  activeStudents: readonly RosterStudent[],
  studentIds: readonly string[]
): string[] =>
  studentIds.filter(
    (studentId) => !activeStudents.some((student) => student.studentId === studentId)
  );

const filterActiveStudents = (
  activeStudents: readonly RosterStudent[],
  studentIds: readonly string[] | undefined
): RosterStudent[] =>
  studentIds === undefined
    ? [...activeStudents]
    : activeStudents.filter((student) =>
        studentIds.some((studentId) => studentId === student.studentId)
      );

const collectRowDiagnostics = (repositories: readonly GradeStatusRepositoryRow[]): Diagnostic[] =>
  repositories.flatMap((row) => row.diagnostics);

const hasErrorDiagnostics = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === "error");

const hasTokenRequiredRows = (repositories: readonly GradeStatusRepositoryRow[]): boolean =>
  repositories.some((row) => row.status === "token_required");

const createStatus = (diagnostics: readonly Diagnostic[]): CommandStatus =>
  hasErrorDiagnostics(diagnostics) ? "partial_success" : "success";

const createActions = (summary: GradeStatusSummary): GradeStatusActions => ({
  refreshStatus: {
    available: true,
    implemented: true
  },
  generateReport: {
    available: summary.readyForReport,
    implemented: false,
    ...(summary.readyForReport ? {} : { reason: "not_all_runs_complete" })
  }
});

export const buildAssignmentGradeStatus = async ({
  cwd,
  assignmentFile,
  githubClient,
  studentIds
}: BuildAssignmentGradeStatusInput): Promise<AssignmentGradeStatusResult> => {
  const configResult = loadGraiderConfig({ cwd, assignmentFile });

  if (configResult.status === "failure") {
    return createEmptyAssignmentGradeStatusResult("failure", configResult.diagnostics);
  }

  const { config } = configResult;
  const rosterResult = loadAssignmentRosters(config);

  if (rosterResult.errors.length > EMPTY_COUNT) {
    return createEmptyAssignmentGradeStatusResult("failure", [
      ...configResult.diagnostics,
      ...rosterResult.warnings,
      ...rosterResult.errors
    ]);
  }

  if (rosterResult.students.length === EMPTY_COUNT) {
    return createEmptyAssignmentGradeStatusResult("failure", [
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
  const activeStudents = rosterResult.students.filter(
    (student) => student.status === ROSTER_STATUS_ACTIVE
  );

  if (activeStudents.length === EMPTY_COUNT) {
    return createEmptyAssignmentGradeStatusResult("failure", [
      ...configResult.diagnostics,
      createTargetStudentsEmptyDiagnostic(config)
    ]);
  }

  const filtered = studentIds !== undefined;
  const requestedStudentIds = studentIds ?? [];
  const selectedStudents = filterActiveStudents(activeStudents, studentIds);
  const unknownStudentIds = filtered
    ? findUnknownStudentIds(activeStudents, requestedStudentIds)
    : [];
  const filterDiagnostics = [
    ...unknownStudentIds.map((studentId) =>
      createStudentFilterUnknownDiagnostic(config, studentId)
    ),
    ...(filtered && selectedStudents.length === EMPTY_COUNT
      ? [createStudentFilterNoMatchesDiagnostic(config, requestedStudentIds)]
      : [])
  ];
  const statusCache = new Map<string, Promise<GradeStatusRepositoryRow>>();
  const repositoryRows = await Promise.all(
    selectedStudents.map((student) =>
      createRepositoryStatusRow(config, student, normalizedTargets, githubClient, statusCache)
    )
  );
  const targetRows = Array.from(
    new Map(
      repositoryRows.map((row) => [row.targetId ?? `${row.studentId}:${row.section}`, row])
    ).values()
  );
  const summary = createSummary(targetRows);
  const diagnostics = [
    ...configResult.diagnostics,
    ...rosterResult.warnings,
    ...filterDiagnostics,
    ...manifestResult.warnings,
    ...manifestResult.errors,
    ...(!grading.enabled ? [createGradingNotConfiguredWarning()] : []),
    ...(hasTokenRequiredRows(repositoryRows) ? [createTokenRequiredDiagnostic()] : []),
    ...collectRowDiagnostics(targetRows)
  ];
  const status: CommandStatus =
    filtered && selectedStudents.length === EMPTY_COUNT ? "failure" : createStatus(diagnostics);
  const targetStudentCount = filtered ? selectedStudents.length : rosterResult.summary.studentCount;
  const targetActiveStudentCount = filtered
    ? selectedStudents.length
    : rosterResult.summary.activeStudentCount;
  const targetSections = createSections(config, selectedStudents, filtered);

  return {
    schemaVersion: ASSIGNMENT_GRADE_STATUS_SCHEMA_VERSION,
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
      sections: targetSections,
      sectionCount: targetSections.length,
      studentCount: targetStudentCount,
      activeStudentCount: targetActiveStudentCount
    },
    grading: createGradingStatus(config),
    summary: filtered && selectedStudents.length === EMPTY_COUNT ? createZeroSummary() : summary,
    targets: targetRows,
    repositories: repositoryRows,
    actions: createActions(summary)
  };
};
