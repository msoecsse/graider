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
import type { Manifest, ManifestRepositoryRecord } from "../manifest/manifest-models.js";
import type { RosterStudent } from "../roster/roster-models.js";

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

const findManifestRecord = (
  manifest: Manifest,
  student: RosterStudent
): ManifestRepositoryRecord | undefined =>
  manifest.repositories.find(
    (record) => record.studentId === student.studentId && record.section === student.section
  );

const normalizeGitHubError = (
  error: unknown,
  student: RosterStudent,
  repository?: ManifestRepositoryRecord
): Diagnostic =>
  error instanceof GitHubClientError
    ? createConfigDiagnostic(
        DiagnosticCode.WorkflowDispatchFailed,
        "Workflow dispatch failed for a selected student repository.",
        {
          studentId: student.studentId,
          githubUsername: student.githubUsername,
          section: student.section,
          repositoryName: repository?.repository.name,
          underlyingDiagnosticCode: error.diagnosticCode,
          kind: error.kind
        }
      )
    : createConfigDiagnostic(
        DiagnosticCode.WorkflowDispatchFailed,
        "Unexpected workflow dispatch failure.",
        {
          studentId: student.studentId,
          githubUsername: student.githubUsername,
          section: student.section,
          repositoryName: repository?.repository.name
        }
      );

const createStudentRepositoryMissingDiagnostic = (student: RosterStudent): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.StudentRepositoryMissing,
    "Selected student does not have a manifest-tracked repository.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section
    }
  );

const createWorkflowMissingDiagnostic = (
  student: RosterStudent,
  repository: ManifestRepositoryRecord,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.GradingWorkflowMissing,
    "Configured grading workflow was not found.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repositoryName: repository.repository.name,
      workflowPath
    }
  );

const createWorkflowDispatchMissingDiagnostic = (
  student: RosterStudent,
  repository: ManifestRepositoryRecord,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.WorkflowDispatchMissing,
    "Configured grading workflow does not support manual dispatch.",
    {
      studentId: student.studentId,
      githubUsername: student.githubUsername,
      section: student.section,
      repositoryName: repository.repository.name,
      workflowPath
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

const dispatchForStudent = async (
  input: GradeExecutionInput,
  state: GradeExecutionState,
  student: RosterStudent,
  workflowPath: string
): Promise<GradeExecutionState> => {
  const repository = findManifestRecord(input.manifest, student);

  if (repository === undefined) {
    return recordFailure(state, createStudentRepositoryMissingDiagnostic(student));
  }

  try {
    const workflow = await runGitHubOperation(input, () =>
      input.githubClient.getWorkflow(
        repository.repository.owner,
        repository.repository.name,
        workflowPath
      )
    );

    if (workflow === null) {
      return recordFailure(
        state,
        createWorkflowMissingDiagnostic(student, repository, workflowPath)
      );
    }

    if (!workflow.supportsDispatch) {
      return recordFailure(
        state,
        createWorkflowDispatchMissingDiagnostic(student, repository, workflowPath)
      );
    }

    await runGitHubOperation(input, () =>
      input.githubClient.dispatchWorkflow({
        owner: repository.repository.owner,
        repo: repository.repository.name,
        workflowPath,
        ref: input.config.assignment.template.branch
      })
    );

    return recordSuccess(state);
  } catch (error: unknown) {
    return recordFailure(state, normalizeGitHubError(error, student, repository));
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
  let state: GradeExecutionState = {
    summary: createInitialSummary(input.targetStudents.length),
    warnings: [],
    errors: []
  };

  if (!grading.enabled) {
    return {
      summary: {
        ...state.summary,
        skipped: input.targetStudents.length,
        warnings: SUCCESS_INCREMENT
      },
      warnings: [createGradingNotConfiguredWarning()],
      errors: []
    };
  }

  if (workflowPath === undefined) {
    return {
      summary: {
        ...state.summary,
        skipped: input.targetStudents.length,
        errors: SUCCESS_INCREMENT
      },
      warnings: [],
      errors: [
        createConfigDiagnostic(
          DiagnosticCode.GradingNotConfigured,
          "Grading workflow is not configured for this assignment."
        )
      ]
    };
  }

  for (const student of input.targetStudents) {
    state = {
      ...state,
      summary: {
        ...state.summary,
        dispatchAttempted: state.summary.dispatchAttempted + SUCCESS_INCREMENT
      }
    };
    state = await dispatchForStudent(input, state, student, workflowPath);
  }

  return state;
};
