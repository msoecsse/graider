import type { LoadedGraiderConfig } from "../config/config-models.js";
import {
  DiagnosticCode,
  createConfigDiagnostic,
  createWarningDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import { type RetryOptions, withGitHubRetry } from "../github/github-retry.js";
import type { Manifest } from "../manifest/manifest-models.js";
import type { RosterStudent } from "../roster/roster-models.js";
import { getWorkflowDispatchIdentifier } from "../workflows/workflow-paths.js";
import {
  normalizeGradingTargets,
  selectGradingTargets,
  type GradingRepositoryTarget
} from "./grading-targets.js";

const EMPTY_COUNT = 0;
const SUCCESS_INCREMENT = 1;
const FAILED_INCREMENT = 1;

export interface GradeExecutionInput {
  config: LoadedGraiderConfig;
  manifest: Manifest;
  targetStudents: RosterStudent[];
  githubClient: GitHubClient;
  retryOptions?: Partial<RetryOptions>;
}

export interface GradeExecutionSummary {
  targetsSelected: number;
  dispatchAttempted: number;
  dispatchSucceeded: number;
  dispatchFailed: number;
  skipped: number;
  warnings: number;
  errors: number;
}

export interface GradeExecutionResult {
  summary: GradeExecutionSummary;
  warnings: Diagnostic[];
  errors: Diagnostic[];
  targets: GradeExecutionTargetResult[];
}

export interface GradeExecutionTargetResult {
  readonly targetId: string;
  readonly groupId?: string;
  readonly repositoryName: string;
  readonly studentIds: readonly string[];
  readonly githubUsernames: readonly string[];
  readonly status: "dispatched" | "failed";
  readonly diagnostics: readonly Diagnostic[];
}

interface GradeExecutionState {
  summary: GradeExecutionSummary;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const createInitialSummary = (targetsSelected: number): GradeExecutionSummary => ({
  targetsSelected,
  dispatchAttempted: EMPTY_COUNT,
  dispatchSucceeded: EMPTY_COUNT,
  dispatchFailed: EMPTY_COUNT,
  skipped: EMPTY_COUNT,
  warnings: EMPTY_COUNT,
  errors: EMPTY_COUNT
});

const getEffectiveGrading = (config: LoadedGraiderConfig) =>
  config.assignment.grading === undefined ? config.course.grading : config.assignment.grading;

const normalizeGitHubError = (error: unknown, target: GradingRepositoryTarget): Diagnostic =>
  error instanceof GitHubClientError
    ? createConfigDiagnostic(
        DiagnosticCode.WorkflowDispatchFailed,
        "Workflow dispatch failed for a selected repository target.",
        {
          targetId: target.targetId,
          ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
          repositoryName: target.repositoryName,
          underlyingDiagnosticCode: error.diagnosticCode,
          kind: error.kind
        }
      )
    : createConfigDiagnostic(
        DiagnosticCode.WorkflowDispatchFailed,
        "Unexpected workflow dispatch failure.",
        {
          targetId: target.targetId,
          ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
          repositoryName: target.repositoryName
        }
      );

const createWorkflowMissingDiagnostic = (
  target: GradingRepositoryTarget,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.GradingWorkflowMissing,
    "Configured grading workflow was not found.",
    {
      targetId: target.targetId,
      ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
      repositoryName: target.repositoryName,
      workflowPath
    }
  );

const createWorkflowDispatchMissingDiagnostic = (
  target: GradingRepositoryTarget,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.WorkflowDispatchMissing,
    "Configured grading workflow does not support manual dispatch.",
    {
      targetId: target.targetId,
      ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
      repositoryName: target.repositoryName,
      workflowPath
    }
  );

const createStudentRepositoryMissingDiagnostic = (student: RosterStudent): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.StudentRepositoryMissing,
    "Selected student does not have a manifest-tracked repository target.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }
  );

const createGradingNotConfiguredWarning = (): Diagnostic =>
  createWarningDiagnostic(
    DiagnosticCode.GradingNotConfigured,
    "Automated grading is not configured for this assignment."
  );

const runGitHubOperation = async <T>(
  input: GradeExecutionInput,
  operation: () => Promise<T>
): Promise<T> => withGitHubRetry(operation, input.retryOptions);

const recordFailure = (
  state: GradeExecutionState,
  diagnostic: Diagnostic
): GradeExecutionState => ({
  summary: {
    ...state.summary,
    dispatchFailed: state.summary.dispatchFailed + FAILED_INCREMENT,
    errors: state.summary.errors + FAILED_INCREMENT
  },
  warnings: state.warnings,
  errors: [...state.errors, diagnostic]
});

const recordSuccess = (state: GradeExecutionState): GradeExecutionState => ({
  summary: {
    ...state.summary,
    dispatchSucceeded: state.summary.dispatchSucceeded + SUCCESS_INCREMENT
  },
  warnings: state.warnings,
  errors: state.errors
});

const dispatchForTarget = async (
  input: GradeExecutionInput,
  state: GradeExecutionState,
  target: GradingRepositoryTarget,
  configuredWorkflowPath: string
): Promise<GradeExecutionState> => {
  const workflowDispatchIdentifier = getWorkflowDispatchIdentifier(configuredWorkflowPath);

  try {
    const workflow = await runGitHubOperation(input, () =>
      input.githubClient.getWorkflow(
        target.owner,
        target.repositoryName,
        workflowDispatchIdentifier
      )
    );

    if (workflow === null) {
      return recordFailure(state, createWorkflowMissingDiagnostic(target, configuredWorkflowPath));
    }

    if (!workflow.supportsDispatch) {
      return recordFailure(
        state,
        createWorkflowDispatchMissingDiagnostic(target, configuredWorkflowPath)
      );
    }

    await runGitHubOperation(input, () =>
      input.githubClient.dispatchWorkflow({
        owner: target.owner,
        repo: target.repositoryName,
        workflowPath: workflowDispatchIdentifier,
        ref: input.config.assignment.template.branch
      })
    );

    return recordSuccess(state);
  } catch (error: unknown) {
    return recordFailure(state, normalizeGitHubError(error, target));
  }
};

export const getGradeGitHubDiagnostics = (errors: readonly Diagnostic[]): Diagnostic[] =>
  errors.flatMap((error) => {
    const underlyingDiagnosticCode = error.context?.underlyingDiagnosticCode;

    return typeof underlyingDiagnosticCode === "string"
      ? [
          {
            code: underlyingDiagnosticCode,
            severity: "error" as const,
            message: error.message,
            ...(error.context === undefined ? {} : { context: error.context })
          }
        ]
      : [];
  });

export const executeGrade = async (input: GradeExecutionInput): Promise<GradeExecutionResult> => {
  const grading = getEffectiveGrading(input.config);
  const workflowPath = grading.workflow;
  const normalizedTargets = normalizeGradingTargets(
    input.manifest,
    input.config.course.github.organization
  );
  const targets = selectGradingTargets(normalizedTargets, input.targetStudents);
  const selectedStudentIds = new Set(input.targetStudents.map((student) => student.studentId));
  const targetStudentIds = new Set(targets.flatMap((target) => target.studentIds));
  const missingStudents = input.targetStudents.filter(
    (student) =>
      selectedStudentIds.has(student.studentId) && !targetStudentIds.has(student.studentId)
  );
  let state: GradeExecutionState = {
    summary: {
      ...createInitialSummary(
        normalizedTargets.repositoryMode === "group" ? targets.length : input.targetStudents.length
      ),
      dispatchFailed: missingStudents.length,
      errors: missingStudents.length
    },
    warnings: [],
    errors: [
      ...normalizedTargets.diagnostics,
      ...missingStudents.map(createStudentRepositoryMissingDiagnostic)
    ]
  };

  if (!grading.enabled) {
    return {
      summary: {
        ...state.summary,
        skipped: targets.length,
        warnings: SUCCESS_INCREMENT
      },
      warnings: [createGradingNotConfiguredWarning()],
      errors: [],
      targets: []
    };
  }

  if (workflowPath === undefined) {
    return {
      summary: {
        ...state.summary,
        skipped: targets.length,
        errors: SUCCESS_INCREMENT
      },
      warnings: [],
      errors: [
        createConfigDiagnostic(
          DiagnosticCode.GradingNotConfigured,
          "Grading workflow is not configured for this assignment."
        )
      ],
      targets: []
    };
  }

  const targetResults: GradeExecutionTargetResult[] = [];
  for (const target of targets) {
    state = {
      ...state,
      summary: {
        ...state.summary,
        dispatchAttempted: state.summary.dispatchAttempted + SUCCESS_INCREMENT
      }
    };
    const priorErrorCount = state.errors.length;
    state = await dispatchForTarget(input, state, target, workflowPath);
    const diagnostics = state.errors.slice(priorErrorCount);
    targetResults.push({
      targetId: target.targetId,
      ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
      repositoryName: target.repositoryName,
      studentIds: target.studentIds,
      githubUsernames: target.githubUsernames,
      status: diagnostics.length === 0 ? "dispatched" : "failed",
      diagnostics
    });
  }

  return { ...state, targets: targetResults };
};
