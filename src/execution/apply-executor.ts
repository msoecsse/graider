import type { LoadedGraiderConfig } from "../config/config-models.js";
import { parseTemplateRepository } from "../config/github-config-validation.js";
import type { Clock } from "../core/clock.js";
import {
  DiagnosticCode,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError, createGitHubDiagnostic } from "../github/github-errors.js";
import type { GitHubPermission, GitHubRepository } from "../github/github-models.js";
import { type RetryOptions, withGitHubRetry } from "../github/github-retry.js";
import type { Manifest, ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import { writeManifest } from "../manifest/manifest-renderer.js";
import {
  createEmptyManifest,
  updateActionsState,
  updatePermissionState,
  upsertRepositoryRecord
} from "../manifest/manifest-updater.js";
import type { PlanOperation } from "../planning/operation-models.js";
import type { Plan } from "../planning/plan-models.js";
import type { RosterStudent } from "../roster/roster-models.js";

const EMPTY_COUNT = 0;
const PRIVATE_REPOSITORY = true;
const DEFAULT_ACTIONS_ENABLED = true;
const STUDENT_PERMISSION: Exclude<GitHubPermission, "none"> = "push";
const FACULTY_PERMISSION: Exclude<GitHubPermission, "none"> = "admin";
const GRADER_PERMISSION: Exclude<GitHubPermission, "none"> = "maintain";
const CREATE_REPOSITORY_OPERATION = "createRepositoryFromTemplate";

const PERMISSION_RANK = {
  none: 0,
  pull: 1,
  triage: 2,
  push: 3,
  maintain: 4,
  admin: 5
} as const satisfies Record<GitHubPermission, number>;

export interface ApplyExecutionInput {
  config: LoadedGraiderConfig;
  plan: Plan;
  manifest?: Manifest;
  manifestPath: string;
  students: RosterStudent[];
  githubClient: GitHubClient;
  clock: Clock;
  retryOptions?: Partial<RetryOptions>;
}

export interface ApplySummary {
  created: number;
  existing: number;
  verified: number;
  noop: number;
  skipped: number;
  blocked: number;
  failed: number;
  warnings: number;
  errors: number;
}

export interface ApplyExecutionResult {
  manifest: Manifest;
  summary: ApplySummary;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

interface ApplyState {
  manifest: Manifest;
  summary: ApplySummary;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const createEmptySummary = (): ApplySummary => ({
  created: EMPTY_COUNT,
  existing: EMPTY_COUNT,
  verified: EMPTY_COUNT,
  noop: EMPTY_COUNT,
  skipped: EMPTY_COUNT,
  blocked: EMPTY_COUNT,
  failed: EMPTY_COUNT,
  warnings: EMPTY_COUNT,
  errors: EMPTY_COUNT
});

const normalizeGitHubError = (error: unknown): Diagnostic =>
  error instanceof GitHubClientError
    ? createGitHubDiagnostic(error)
    : createConfigDiagnostic(
        DiagnosticCode.GithubApiError,
        "Unexpected GitHub client failure during apply."
      );

const runGitHubOperation = async <T>(
  input: ApplyExecutionInput,
  operation: () => Promise<T>
): Promise<T> => withGitHubRetry(operation, input.retryOptions);

const createWorkflowMissingDiagnostic = (operation: PlanOperation): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.GradingWorkflowMissing,
    `Grading workflow was not found for ${operation.repository_name ?? "repository"}.`,
    {
      repositoryName: operation.repository_name,
      student_id: operation.student_id,
      github_username: operation.github_username,
      section: operation.section
    }
  );

const createWorkflowDispatchDiagnostic = (operation: PlanOperation): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.WorkflowDispatchUnsupported,
    `Workflow dispatch is not supported for ${operation.repository_name ?? "repository"}.`,
    {
      repositoryName: operation.repository_name,
      student_id: operation.student_id,
      github_username: operation.github_username,
      section: operation.section
    }
  );

const createPermissionWarning = (
  operation: PlanOperation,
  currentPermission: GitHubPermission,
  expectedPermission: Exclude<GitHubPermission, "none">
): Diagnostic =>
  createWarningDiagnostic(
    DiagnosticCode.PermissionNotDowngraded,
    `Existing permission ${currentPermission} is higher than requested ${expectedPermission}; leaving it unchanged.`,
    {
      repositoryName: operation.repository_name,
      student_id: operation.student_id,
      github_username: operation.github_username,
      section: operation.section,
      currentPermission,
      expectedPermission
    }
  );

const createUnexpectedCollaboratorWarning = (
  operation: PlanOperation,
  username: string,
  permission: GitHubPermission
): Diagnostic =>
  createWarningDiagnostic(
    DiagnosticCode.UnexpectedCollaboratorPreserved,
    `Unexpected collaborator ${username} is present and was left unchanged.`,
    {
      repositoryName: operation.repository_name,
      student_id: operation.student_id,
      github_username: operation.github_username,
      section: operation.section,
      unexpectedUsername: username,
      permission
    }
  );

const createRepositoryCreationNotObservedDiagnostic = (
  operation: PlanOperation,
  owner: string,
  repositoryName: string
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.GithubApiError,
    `Repository creation did not produce an observable repository for ${owner}/${repositoryName}.`,
    {
      operation: CREATE_REPOSITORY_OPERATION,
      owner,
      repositoryName,
      student_id: operation.student_id,
      github_username: operation.github_username,
      section: operation.section
    }
  );

const findStudent = (
  students: readonly RosterStudent[],
  operation: PlanOperation
): RosterStudent | undefined =>
  students.find((student) => student.studentId === operation.student_id);

const findManifestRecord = (
  manifest: Manifest,
  operation: PlanOperation
): ManifestRepositoryRecord | undefined =>
  manifest.repositories.find((record) => record.studentId === operation.student_id);

const createManifestRecord = (
  config: LoadedGraiderConfig,
  student: RosterStudent,
  repository: GitHubRepository,
  observedAt: string,
  templateCommitSha?: string
): ManifestRepositoryRecord => ({
  studentId: student.studentId,
  githubUsername: student.githubUsername,
  section: student.section,
  rosterStatus: student.status,
  repository: {
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    id: repository.id,
    htmlUrl: repository.htmlUrl,
    createdFromTemplate: true,
    templateRepository: config.assignment.template.repository,
    ...(templateCommitSha === undefined ? {} : { templateCommitSha }),
    createdAt: observedAt,
    lastObservedAt: observedAt
  },
  permissions: {},
  actions: {
    enabled: false
  },
  lifecycle: {
    repositoryArchived: false,
    studentAccessRemoved: false,
    status: "created",
    lastChangedAt: observedAt
  },
  warnings: [],
  errors: []
});

const createInitialManifest = async (
  config: LoadedGraiderConfig,
  plan: Plan,
  githubClient: GitHubClient
): Promise<Manifest> => {
  const parsedTemplate = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );
  const templateRepository =
    parsedTemplate.status === "success"
      ? await githubClient
          .getTemplateRepository(parsedTemplate.repository.owner, parsedTemplate.repository.repo)
          .catch(() => null)
      : null;

  return createEmptyManifest({
    assignment: {
      termCode: config.summary.termCode,
      courseCode: config.course.course.code,
      assignmentSlug: config.summary.assignmentSlug,
      assignmentTitle: config.assignment.assignment.title
    },
    source: {
      sourceFiles: plan.source.source_files,
      inputFingerprint: plan.source.input_fingerprint
    },
    template: {
      repository: config.assignment.template.repository,
      branch: config.assignment.template.branch,
      ...(templateRepository?.latestCommitSha === undefined
        ? {}
        : { commitSha: templateRepository.latestCommitSha })
    }
  });
};

const persistManifest = (state: ApplyState, manifestPath: string): ApplyState => {
  const writeResult = writeManifest(manifestPath, state.manifest);

  if (writeResult.status === "failure" && writeResult.diagnostic !== undefined) {
    return recordError(state, writeResult.diagnostic);
  }

  return state;
};

const recordWarning = (state: ApplyState, diagnostic: Diagnostic): ApplyState => ({
  ...state,
  warnings: [...state.warnings, diagnostic],
  summary: {
    ...state.summary,
    warnings: state.summary.warnings + 1
  }
});

const recordError = (state: ApplyState, diagnostic: Diagnostic): ApplyState => ({
  ...state,
  errors: [...state.errors, diagnostic],
  summary: {
    ...state.summary,
    failed: state.summary.failed + 1,
    errors: state.summary.errors + 1
  }
});

const incrementSummary = (state: ApplyState, key: keyof ApplySummary): ApplyState => ({
  ...state,
  summary: {
    ...state.summary,
    [key]: state.summary[key] + 1
  }
});

const hasAtLeastPermission = (
  currentPermission: GitHubPermission,
  expectedPermission: Exclude<GitHubPermission, "none">
): boolean => PERMISSION_RANK[currentPermission] >= PERMISSION_RANK[expectedPermission];

const hasHigherPermission = (
  currentPermission: GitHubPermission,
  expectedPermission: Exclude<GitHubPermission, "none">
): boolean => PERMISSION_RANK[currentPermission] > PERMISSION_RANK[expectedPermission];

const executeCreateRepository = async (
  input: ApplyExecutionInput,
  state: ApplyState,
  operation: PlanOperation,
  observedAt: string
): Promise<ApplyState> => {
  const student = findStudent(input.students, operation);

  if (student === undefined || operation.repository_name === undefined) {
    return state;
  }

  const repositoryName = operation.repository_name;

  try {
    const parsedTemplate = parseTemplateRepository(
      input.config.course.github.organization,
      input.config.assignment.template.repository
    );

    if (parsedTemplate.status === "failure") {
      return recordError(state, parsedTemplate.diagnostic);
    }

    await runGitHubOperation(input, () =>
      input.githubClient.createRepositoryFromTemplate({
        templateOwner: parsedTemplate.repository.owner,
        templateRepo: parsedTemplate.repository.repo,
        owner: input.config.course.github.organization,
        name: repositoryName,
        private: PRIVATE_REPOSITORY
      })
    );
    const repository = await runGitHubOperation(input, () =>
      input.githubClient.getRepository(input.config.course.github.organization, repositoryName)
    );

    if (repository === null) {
      return recordError(
        state,
        createRepositoryCreationNotObservedDiagnostic(
          operation,
          input.config.course.github.organization,
          repositoryName
        )
      );
    }

    const manifest = upsertRepositoryRecord(
      state.manifest,
      createManifestRecord(
        input.config,
        student,
        repository,
        observedAt,
        state.manifest.template.commitSha
      )
    );

    return persistManifest(
      incrementSummary(
        {
          ...state,
          manifest
        },
        "created"
      ),
      input.manifestPath
    );
  } catch (error: unknown) {
    return recordError(state, normalizeGitHubError(error));
  }
};

const executeStudentCollaborator = async (
  input: ApplyExecutionInput,
  state: ApplyState,
  operation: PlanOperation,
  observedAt: string
): Promise<ApplyState> => {
  if (operation.repository_name === undefined || operation.github_username === undefined) {
    return state;
  }

  const repositoryName = operation.repository_name;
  const githubUsername = operation.github_username;

  if (findManifestRecord(state.manifest, operation) === undefined) {
    return incrementSummary(state, "skipped");
  }

  try {
    const currentPermission = await runGitHubOperation(input, () =>
      input.githubClient.getCollaboratorPermission(
        input.config.course.github.organization,
        repositoryName,
        githubUsername
      )
    );
    let nextState = state;

    if (hasAtLeastPermission(currentPermission.permission, STUDENT_PERMISSION)) {
      nextState = incrementSummary(nextState, "noop");

      if (hasHigherPermission(currentPermission.permission, STUDENT_PERMISSION)) {
        nextState = recordWarning(
          nextState,
          createPermissionWarning(operation, currentPermission.permission, STUDENT_PERMISSION)
        );
      }
    } else {
      await runGitHubOperation(input, () =>
        input.githubClient.addCollaborator({
          owner: input.config.course.github.organization,
          repo: repositoryName,
          username: githubUsername,
          permission: STUDENT_PERMISSION
        })
      );
      nextState = incrementSummary(nextState, "verified");
    }

    const collaborators = await runGitHubOperation(input, () =>
      input.githubClient.listCollaboratorPermissions(
        input.config.course.github.organization,
        repositoryName
      )
    );

    for (const collaborator of collaborators) {
      if (collaborator.username !== githubUsername) {
        nextState = recordWarning(
          nextState,
          createUnexpectedCollaboratorWarning(
            operation,
            collaborator.username,
            collaborator.permission
          )
        );
      }
    }

    return persistManifest(
      {
        ...nextState,
        manifest: updatePermissionState(nextState.manifest, {
          studentId: operation.student_id ?? "",
          permissions: {
            student: {
              username: githubUsername,
              permission:
                currentPermission.permission === "none"
                  ? STUDENT_PERMISSION
                  : currentPermission.permission,
              pendingInvite: currentPermission.pendingInvite,
              lastObservedAt: observedAt,
              lastAppliedAt: observedAt
            }
          }
        })
      },
      input.manifestPath
    );
  } catch (error: unknown) {
    return recordError(state, normalizeGitHubError(error));
  }
};

const executeTeamPermission = async (
  input: ApplyExecutionInput,
  state: ApplyState,
  operation: PlanOperation,
  teamSlug: string,
  expectedPermission: Exclude<GitHubPermission, "none">,
  observedAt: string
): Promise<ApplyState> => {
  if (operation.repository_name === undefined) {
    return state;
  }

  const repositoryName = operation.repository_name;

  if (findManifestRecord(state.manifest, operation) === undefined) {
    return incrementSummary(state, "skipped");
  }

  try {
    const currentPermission = await runGitHubOperation(input, () =>
      input.githubClient.getTeamPermission(
        input.config.course.github.organization,
        repositoryName,
        teamSlug
      )
    );
    let nextState = state;

    if (hasAtLeastPermission(currentPermission.permission, expectedPermission)) {
      nextState = incrementSummary(nextState, "noop");

      if (hasHigherPermission(currentPermission.permission, expectedPermission)) {
        nextState = recordWarning(
          nextState,
          createPermissionWarning(operation, currentPermission.permission, expectedPermission)
        );
      }
    } else {
      await runGitHubOperation(input, () =>
        input.githubClient.addTeamPermission({
          owner: input.config.course.github.organization,
          repo: repositoryName,
          teamSlug,
          permission: expectedPermission
        })
      );
      nextState = incrementSummary(nextState, "verified");
    }

    return persistManifest(
      {
        ...nextState,
        manifest: updatePermissionState(nextState.manifest, {
          studentId: operation.student_id ?? "",
          permissions:
            operation.type === "add_faculty_team_permission"
              ? {
                  facultyTeam: {
                    teamSlug,
                    permission:
                      currentPermission.permission === "none"
                        ? expectedPermission
                        : currentPermission.permission,
                    lastObservedAt: observedAt,
                    lastAppliedAt: observedAt
                  }
                }
              : {
                  graderTeam: {
                    teamSlug,
                    permission:
                      currentPermission.permission === "none"
                        ? expectedPermission
                        : currentPermission.permission,
                    lastObservedAt: observedAt,
                    lastAppliedAt: observedAt
                  }
                }
        })
      },
      input.manifestPath
    );
  } catch (error: unknown) {
    return recordError(state, normalizeGitHubError(error));
  }
};

const executeEnableActions = async (
  input: ApplyExecutionInput,
  state: ApplyState,
  operation: PlanOperation,
  observedAt: string
): Promise<ApplyState> => {
  if (operation.repository_name === undefined) {
    return state;
  }

  const repositoryName = operation.repository_name;

  if (findManifestRecord(state.manifest, operation) === undefined) {
    return incrementSummary(state, "skipped");
  }

  try {
    const actionsState = await runGitHubOperation(input, () =>
      input.githubClient.getActionsState(input.config.course.github.organization, repositoryName)
    );
    let nextState = state;

    if (actionsState === "enabled") {
      nextState = incrementSummary(nextState, "noop");
    } else {
      await runGitHubOperation(input, () =>
        input.githubClient.enableActions(input.config.course.github.organization, repositoryName)
      );
      nextState = incrementSummary(nextState, "verified");
    }

    return persistManifest(
      {
        ...nextState,
        manifest: updateActionsState(nextState.manifest, {
          studentId: operation.student_id ?? "",
          actions: {
            enabled: DEFAULT_ACTIONS_ENABLED,
            lastObservedAt: observedAt
          }
        })
      },
      input.manifestPath
    );
  } catch (error: unknown) {
    return recordError(state, normalizeGitHubError(error));
  }
};

const executeVerifyWorkflow = async (
  input: ApplyExecutionInput,
  state: ApplyState,
  operation: PlanOperation,
  observedAt: string
): Promise<ApplyState> => {
  if (
    operation.repository_name === undefined ||
    input.config.course.grading.workflow === undefined
  ) {
    return state;
  }

  const repositoryName = operation.repository_name;
  const workflowPath = input.config.course.grading.workflow;

  if (findManifestRecord(state.manifest, operation) === undefined) {
    return incrementSummary(state, "skipped");
  }

  try {
    const workflow = await runGitHubOperation(input, () =>
      input.githubClient.getWorkflow(
        input.config.course.github.organization,
        repositoryName,
        workflowPath
      )
    );

    if (workflow === null) {
      const diagnostic = createWorkflowMissingDiagnostic(operation);

      return persistManifest(
        recordError(
          {
            ...state,
            manifest: updateActionsState(state.manifest, {
              studentId: operation.student_id ?? "",
              actions: {
                gradingWorkflowPath: workflowPath,
                gradingWorkflowFound: false,
                lastObservedAt: observedAt
              }
            })
          },
          diagnostic
        ),
        input.manifestPath
      );
    }

    return persistManifest(
      incrementSummary(
        {
          ...state,
          manifest: updateActionsState(state.manifest, {
            studentId: operation.student_id ?? "",
            actions: {
              gradingWorkflowPath: workflow.path,
              gradingWorkflowFound: true,
              lastObservedAt: observedAt
            }
          })
        },
        "verified"
      ),
      input.manifestPath
    );
  } catch (error: unknown) {
    return recordError(state, normalizeGitHubError(error));
  }
};

const executeVerifyDispatch = async (
  input: ApplyExecutionInput,
  state: ApplyState,
  operation: PlanOperation,
  observedAt: string
): Promise<ApplyState> => {
  if (
    operation.repository_name === undefined ||
    input.config.course.grading.workflow === undefined
  ) {
    return state;
  }

  const repositoryName = operation.repository_name;
  const workflowPath = input.config.course.grading.workflow;

  if (findManifestRecord(state.manifest, operation) === undefined) {
    return incrementSummary(state, "skipped");
  }

  try {
    const workflow = await runGitHubOperation(input, () =>
      input.githubClient.getWorkflow(
        input.config.course.github.organization,
        repositoryName,
        workflowPath
      )
    );

    if (workflow === null || !workflow.supportsDispatch) {
      const diagnostic = createWorkflowDispatchDiagnostic(operation);

      return persistManifest(
        recordError(
          {
            ...state,
            manifest: updateActionsState(state.manifest, {
              studentId: operation.student_id ?? "",
              actions: {
                workflowDispatchSupported: false,
                lastObservedAt: observedAt
              }
            })
          },
          diagnostic
        ),
        input.manifestPath
      );
    }

    return persistManifest(
      incrementSummary(
        {
          ...state,
          manifest: updateActionsState(state.manifest, {
            studentId: operation.student_id ?? "",
            actions: {
              workflowDispatchSupported: true,
              lastObservedAt: observedAt
            }
          })
        },
        "verified"
      ),
      input.manifestPath
    );
  } catch (error: unknown) {
    return recordError(state, normalizeGitHubError(error));
  }
};

const executeOperation = async (
  input: ApplyExecutionInput,
  state: ApplyState,
  operation: PlanOperation,
  observedAt: string
): Promise<ApplyState> => {
  if (operation.status === "skipped") {
    return incrementSummary(state, "skipped");
  }

  if (operation.status === "noop") {
    return incrementSummary(state, "existing");
  }

  if (operation.status !== "planned") {
    return state;
  }

  if (operation.type === "create_repository_from_template") {
    return executeCreateRepository(input, state, operation, observedAt);
  }

  if (operation.type === "add_student_collaborator") {
    return executeStudentCollaborator(input, state, operation, observedAt);
  }

  if (operation.type === "add_faculty_team_permission") {
    return executeTeamPermission(
      input,
      state,
      operation,
      input.config.course.github.faculty_team,
      FACULTY_PERMISSION,
      observedAt
    );
  }

  if (operation.type === "add_grader_team_permission") {
    return executeTeamPermission(
      input,
      state,
      operation,
      input.config.course.github.grader_team,
      GRADER_PERMISSION,
      observedAt
    );
  }

  if (operation.type === "enable_actions") {
    return executeEnableActions(input, state, operation, observedAt);
  }

  if (operation.type === "verify_grading_workflow") {
    return executeVerifyWorkflow(input, state, operation, observedAt);
  }

  return executeVerifyDispatch(input, state, operation, observedAt);
};

export const executeApplyPlan = async (
  input: ApplyExecutionInput
): Promise<ApplyExecutionResult> => {
  const initialManifest =
    input.manifest ?? (await createInitialManifest(input.config, input.plan, input.githubClient));
  let state: ApplyState = {
    manifest: initialManifest,
    summary: createEmptySummary(),
    warnings: [],
    errors: []
  };
  const observedAt = input.clock.now().toISOString();

  for (const operation of input.plan.operations) {
    state = await executeOperation(input, state, operation, observedAt);
  }

  return state;
};
