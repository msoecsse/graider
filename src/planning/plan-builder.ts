import {
  createSourceFingerprint,
  getSourceFingerprintPaths
} from "../config/source-fingerprint.js";
import type { LoadedGraiderConfig } from "../config/config-models.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError, createGitHubDiagnostic } from "../github/github-errors.js";
import type { Manifest, ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import type { RosterStudent, RosterSummary } from "../roster/roster-models.js";
import { ROSTER_STATUS_ACTIVE } from "../roster/roster-models.js";
import type { PlanOperation, PlanOperationType } from "./operation-models.js";
import { comparePlanOperations, createOperationId } from "./operation-ordering.js";
import { PLAN_SCHEMA_VERSION, type Plan, type PlanSummary } from "./plan-models.js";
import { generateRepositoryName } from "./repo-name.js";

const EMPTY_COUNT = 0;
const NO_REPOSITORY_NAME = "";
const ACTIVE_ASSIGNMENT_STATUS = "active";
const DRAFT_ASSIGNMENT_STATUS = "draft";
const CLOSED_ASSIGNMENT_STATUS = "closed";
const ARCHIVED_ASSIGNMENT_STATUS = "archived";
const STUDENT_STATUS_REASON_PREFIX = "student_status";
const GRADING_DISABLED_REASON = "grading_disabled";

export interface BuildPlanInput {
  config: LoadedGraiderConfig;
  students: RosterStudent[];
  rosterSummary: RosterSummary;
  githubClient: GitHubClient;
  createdAt: string;
  manifest?: Manifest;
}

const createUnexpectedGitHubDiagnostic = (): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.GithubApiError,
    "Unexpected GitHub client failure during planning."
  );

const normalizeGitHubError = (error: unknown): Diagnostic =>
  error instanceof GitHubClientError
    ? createGitHubDiagnostic(error)
    : createUnexpectedGitHubDiagnostic();

const createOperation = (
  student: RosterStudent,
  type: PlanOperationType,
  status: PlanOperation["status"],
  input: {
    requires?: string[];
    repositoryName?: string;
    reason?: string;
    warnings?: Diagnostic[];
    errors?: Diagnostic[];
  } = {}
): PlanOperation => ({
  id: createOperationId(student.section, student.studentId, type),
  type,
  status,
  requires: input.requires ?? [],
  student_id: student.studentId,
  github_username: student.githubUsername,
  section: student.section,
  ...(input.repositoryName === undefined ? {} : { repository_name: input.repositoryName }),
  ...(input.reason === undefined ? {} : { reason: input.reason }),
  warnings: input.warnings ?? [],
  errors: input.errors ?? []
});

const createCollisionDiagnostic = (organization: string, repositoryName: string): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.RepoNameCollision,
    `Repository ${organization}/${repositoryName} already exists and is not manifest-tracked.`,
    {
      organization,
      repositoryName
    }
  );

const createManifestTrackedMissingDiagnostic = (
  organization: string,
  repositoryName: string,
  student: RosterStudent
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.ManifestTrackedRepositoryMissing,
    `Manifest-tracked repository ${organization}/${repositoryName} was not found on GitHub.`,
    {
      organization,
      repositoryName,
      student_id: student.studentId,
      github_username: student.githubUsername,
      section: student.section
    }
  );

const createLifecycleDiagnostic = (
  code: string,
  message: string,
  assignmentStatus: string,
  student: RosterStudent
): Diagnostic =>
  createConfigDiagnostic(code, message, {
    assignmentStatus,
    student_id: student.studentId,
    github_username: student.githubUsername,
    section: student.section
  });

const createPlanBlockedDiagnostic = (blockedOperationCount: number): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.PlanContainsBlockedOperations,
    "Plan contains blocked operations.",
    {
      blockedOperationCount
    }
  );

const generateStudentRepositoryName = (
  config: LoadedGraiderConfig,
  student: RosterStudent
): {
  repositoryName: string;
  warnings: Diagnostic[];
  errors: Diagnostic[];
} => {
  const result = generateRepositoryName({
    pattern: config.course.github.repo_name_pattern,
    termCode: config.summary.termCode,
    courseCode: config.course.course.code,
    assignmentSlug: config.summary.assignmentSlug,
    githubUsername: student.githubUsername
  });

  return {
    repositoryName: result.repositoryName ?? NO_REPOSITORY_NAME,
    warnings: result.warnings,
    errors: result.errors
  };
};

const createLifecycleBlockedOperation = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  diagnostic: Diagnostic,
  repositoryName: string
): PlanOperation =>
  createOperation(student, "create_repository_from_template", "blocked", {
    repositoryName,
    reason: config.assignment.assignment.status,
    errors: [diagnostic]
  });

const buildSkippedStudentOperation = (student: RosterStudent): PlanOperation =>
  createOperation(student, "create_repository_from_template", "skipped", {
    reason: `${STUDENT_STATUS_REASON_PREFIX}_${student.status}`
  });

const buildLifecycleOperations = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repositoryName: string
): PlanOperation[] => {
  const assignmentStatus = config.assignment.assignment.status;

  if (assignmentStatus === DRAFT_ASSIGNMENT_STATUS) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic(
          DiagnosticCode.AssignmentNotActive,
          "Draft assignments cannot be applied.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }

  if (assignmentStatus === CLOSED_ASSIGNMENT_STATUS) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic(
          DiagnosticCode.AssignmentClosedBlocksCreation,
          "Closed assignments block new repository creation.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }

  if (assignmentStatus === ARCHIVED_ASSIGNMENT_STATUS) {
    return [
      createLifecycleBlockedOperation(
        config,
        student,
        createLifecycleDiagnostic(
          DiagnosticCode.AssignmentArchived,
          "Archived assignments cannot be planned for provisioning.",
          assignmentStatus,
          student
        ),
        repositoryName
      )
    ];
  }

  return [];
};

const buildPlannedProvisioningOperations = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repositoryName: string
): PlanOperation[] => {
  const createRepositoryId = createOperationId(
    student.section,
    student.studentId,
    "create_repository_from_template"
  );
  const enableActionsId = createOperationId(student.section, student.studentId, "enable_actions");
  const verifyWorkflowId = createOperationId(
    student.section,
    student.studentId,
    "verify_grading_workflow"
  );
  const sharedInput = {
    repositoryName,
    requires: [createRepositoryId]
  };

  return [
    createOperation(student, "create_repository_from_template", "planned", {
      repositoryName
    }),
    createOperation(student, "add_student_collaborator", "planned", sharedInput),
    createOperation(student, "add_faculty_team_permission", "planned", sharedInput),
    createOperation(student, "add_grader_team_permission", "planned", sharedInput),
    createOperation(student, "enable_actions", "planned", sharedInput),
    ...(config.summary.gradingEnabled
      ? [
          createOperation(student, "verify_grading_workflow", "planned", {
            repositoryName,
            requires: [enableActionsId]
          }),
          createOperation(student, "verify_workflow_dispatch", "planned", {
            repositoryName,
            requires: [verifyWorkflowId]
          })
        ]
      : [
          createOperation(student, "verify_grading_workflow", "skipped", {
            repositoryName,
            requires: [enableActionsId],
            reason: GRADING_DISABLED_REASON
          }),
          createOperation(student, "verify_workflow_dispatch", "skipped", {
            repositoryName,
            requires: [verifyWorkflowId],
            reason: GRADING_DISABLED_REASON
          })
        ])
  ];
};

const buildTrackedRepositoryOperations = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repositoryName: string
): PlanOperation[] => {
  const createRepositoryId = createOperationId(
    student.section,
    student.studentId,
    "create_repository_from_template"
  );
  const enableActionsId = createOperationId(student.section, student.studentId, "enable_actions");
  const verifyWorkflowId = createOperationId(
    student.section,
    student.studentId,
    "verify_grading_workflow"
  );
  const sharedInput = {
    repositoryName,
    requires: [createRepositoryId]
  };

  return [
    createOperation(student, "create_repository_from_template", "noop", {
      repositoryName,
      reason: "manifest_tracked_repository"
    }),
    createOperation(student, "add_student_collaborator", "planned", sharedInput),
    createOperation(student, "add_faculty_team_permission", "planned", sharedInput),
    createOperation(student, "add_grader_team_permission", "planned", sharedInput),
    createOperation(student, "enable_actions", "planned", sharedInput),
    ...(config.summary.gradingEnabled
      ? [
          createOperation(student, "verify_grading_workflow", "planned", {
            repositoryName,
            requires: [enableActionsId]
          }),
          createOperation(student, "verify_workflow_dispatch", "planned", {
            repositoryName,
            requires: [verifyWorkflowId]
          })
        ]
      : [
          createOperation(student, "verify_grading_workflow", "skipped", {
            repositoryName,
            requires: [enableActionsId],
            reason: GRADING_DISABLED_REASON
          }),
          createOperation(student, "verify_workflow_dispatch", "skipped", {
            repositoryName,
            requires: [verifyWorkflowId],
            reason: GRADING_DISABLED_REASON
          })
        ])
  ];
};

const findManifestRecord = (
  manifest: Manifest | undefined,
  student: RosterStudent
): ManifestRepositoryRecord | undefined =>
  manifest?.repositories.find((record) => record.studentId === student.studentId);

const buildActiveStudentOperations = async (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  githubClient: GitHubClient,
  manifest: Manifest | undefined
): Promise<PlanOperation[]> => {
  const repositoryNameResult = generateStudentRepositoryName(config, student);

  if (repositoryNameResult.errors.length > EMPTY_COUNT) {
    return [
      createOperation(student, "create_repository_from_template", "blocked", {
        errors: repositoryNameResult.errors,
        warnings: repositoryNameResult.warnings
      })
    ];
  }

  const manifestRecord = findManifestRecord(manifest, student);
  const repositoryName = manifestRecord?.repository.name ?? repositoryNameResult.repositoryName;

  if (
    config.assignment.assignment.status === DRAFT_ASSIGNMENT_STATUS ||
    config.assignment.assignment.status === ARCHIVED_ASSIGNMENT_STATUS
  ) {
    return buildLifecycleOperations(config, student, repositoryName);
  }

  if (manifestRecord !== undefined) {
    try {
      const existingRepository = await githubClient.getRepository(
        config.course.github.organization,
        manifestRecord.repository.name
      );

      if (existingRepository === null) {
        return [
          createOperation(student, "create_repository_from_template", "blocked", {
            repositoryName: manifestRecord.repository.name,
            errors: [
              createManifestTrackedMissingDiagnostic(
                config.course.github.organization,
                manifestRecord.repository.name,
                student
              )
            ]
          })
        ];
      }

      return buildTrackedRepositoryOperations(config, student, manifestRecord.repository.name);
    } catch (error: unknown) {
      return [
        createOperation(student, "create_repository_from_template", "blocked", {
          repositoryName: manifestRecord.repository.name,
          errors: [normalizeGitHubError(error)]
        })
      ];
    }
  }

  const lifecycleOperations = buildLifecycleOperations(config, student, repositoryName);

  if (lifecycleOperations.length > EMPTY_COUNT) {
    return lifecycleOperations;
  }

  if (config.assignment.assignment.status !== ACTIVE_ASSIGNMENT_STATUS) {
    return [];
  }

  try {
    const existingRepository = await githubClient.getRepository(
      config.course.github.organization,
      repositoryNameResult.repositoryName
    );

    if (existingRepository !== null) {
      return [
        createOperation(student, "create_repository_from_template", "blocked", {
          repositoryName,
          errors: [createCollisionDiagnostic(config.course.github.organization, repositoryName)]
        })
      ];
    }

    return buildPlannedProvisioningOperations(config, student, repositoryName);
  } catch (error: unknown) {
    return [
      createOperation(student, "create_repository_from_template", "blocked", {
        repositoryName,
        errors: [normalizeGitHubError(error)]
      })
    ];
  }
};

const buildStudentOperations = async (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  githubClient: GitHubClient,
  manifest: Manifest | undefined
): Promise<PlanOperation[]> =>
  student.status === ROSTER_STATUS_ACTIVE
    ? buildActiveStudentOperations(config, student, githubClient, manifest)
    : [buildSkippedStudentOperation(student)];

const createPlanSummary = (
  rosterSummary: RosterSummary,
  operations: readonly PlanOperation[]
): PlanSummary => ({
  total_students: rosterSummary.studentCount,
  active_students: rosterSummary.activeStudentCount,
  dropped_students: rosterSummary.droppedStudentCount,
  hold_students: rosterSummary.holdStudentCount,
  planned_operations: operations.filter((operation) => operation.status === "planned").length,
  noop_operations: operations.filter((operation) => operation.status === "noop").length,
  skipped_operations: operations.filter((operation) => operation.status === "skipped").length,
  blocked_operations: operations.filter((operation) => operation.status === "blocked").length
});

const collectOperationDiagnostics = (operations: readonly PlanOperation[]): Diagnostic[] =>
  operations.flatMap((operation) => operation.errors);

export const buildPlan = async ({
  config,
  students,
  rosterSummary,
  githubClient,
  createdAt,
  manifest
}: BuildPlanInput): Promise<Plan> => {
  const sourceFingerprint = createSourceFingerprint({
    repoRoot: config.summary.repoRoot,
    sourceFilePaths: getSourceFingerprintPaths({
      courseConfigPath: config.summary.courseConfigPath,
      termConfigPath: config.summary.termConfigPath,
      assignmentConfigPath: config.summary.assignmentConfigPath,
      rosterFiles: rosterSummary.rosterFiles
    })
  });
  const operationGroups: PlanOperation[][] = [];

  for (const student of students) {
    operationGroups.push(
      ...[await buildStudentOperations(config, student, githubClient, manifest)]
    );
  }

  const operations = operationGroups.flat().sort(comparePlanOperations);
  const summary = createPlanSummary(rosterSummary, operations);
  const blockedPlanErrors =
    summary.blocked_operations > EMPTY_COUNT
      ? [createPlanBlockedDiagnostic(summary.blocked_operations)]
      : [];

  return {
    schema_version: PLAN_SCHEMA_VERSION,
    created_at: createdAt,
    assignment: {
      term_code: config.summary.termCode,
      course_code: config.course.course.code,
      assignment_slug: config.summary.assignmentSlug,
      assignment_title: config.assignment.assignment.title
    },
    source: {
      source_files: sourceFingerprint.sourceFiles,
      input_fingerprint: sourceFingerprint.inputFingerprint
    },
    summary,
    operations,
    warnings: sourceFingerprint.warnings,
    errors: [
      ...sourceFingerprint.errors,
      ...collectOperationDiagnostics(operations),
      ...blockedPlanErrors
    ]
  };
};
