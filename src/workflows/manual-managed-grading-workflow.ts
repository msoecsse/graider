import type { EffectiveAssignmentGrading } from "../config/effective-grading.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError, createGitHubDiagnostic } from "../github/github-errors.js";
import {
  JAVA_JUNIT_CHECKSTYLE_PRESET,
  renderJavaJunitCheckstyleWorkflow
} from "./java-junit-checkstyle-workflow.js";
import { MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE } from "./managed-workflow-deployment.js";
import {
  GRAIDER_MANAGED_WORKFLOW_PATH,
  classifyManagedWorkflow
} from "./managed-workflow-policy.js";

export interface ManualManagedGradingWorkflowRepositoryTarget {
  readonly owner: string;
  readonly name: string;
  readonly defaultBranch: string;
}

/**
 * Eligibility intentionally differs from Apply's strict managed-workflow policy:
 * Graider's current and legacy assignment wizard emits the default workflow without
 * explicit mode/preset fields.
 */
export const isManualManagedGradingWorkflowEligible = (
  grading:
    | {
        readonly enabled?: boolean | undefined;
        readonly mode?: string | undefined;
        readonly preset?: string | undefined;
        readonly workflow?: string | undefined;
      }
    | undefined
): boolean =>
  grading?.enabled === true &&
  ((grading.mode === "preset" && grading.preset === JAVA_JUNIT_CHECKSTYLE_PRESET) ||
    (grading.mode === undefined &&
      grading.preset === undefined &&
      grading.workflow === GRAIDER_MANAGED_WORKFLOW_PATH));

export interface ManualManagedGradingWorkflowInput {
  readonly githubClient: GitHubClient;
  readonly repository: ManualManagedGradingWorkflowRepositoryTarget;
  readonly grading: EffectiveAssignmentGrading;
  readonly submissionCommitSha: string;
  readonly confirmed: boolean;
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;

export type ManualManagedGradingWorkflowStatus =
  | "created"
  | "replaced_managed"
  | "replaced_unmanaged"
  | "replaced_unsupported"
  | "already_current"
  | "read_failed"
  | "write_failed"
  | "not_attempted";

export type ManualManagedGradingWorkflowDispatchStatus = "dispatched" | "failed" | "not_attempted";

export interface ManualManagedGradingWorkflowResult {
  readonly repository: {
    readonly owner: string;
    readonly name: string;
    readonly fullName: string;
    readonly defaultBranch: string;
  };
  readonly workflow: {
    readonly status: ManualManagedGradingWorkflowStatus;
    readonly commitSha?: string;
  };
  readonly dispatch: {
    readonly status: ManualManagedGradingWorkflowDispatchStatus;
  };
  readonly diagnostics: readonly Diagnostic[];
}

const repositoryIdentity = (repository: ManualManagedGradingWorkflowRepositoryTarget) => ({
  owner: repository.owner,
  name: repository.name,
  fullName: `${repository.owner}/${repository.name}`,
  defaultBranch: repository.defaultBranch
});

const createUnexpectedGitHubDiagnostic = (operation: string): Diagnostic =>
  createConfigDiagnostic(DiagnosticCode.GithubApiError, "Unexpected GitHub operation failure.", {
    operation
  });

const normalizeGitHubError = (error: unknown, operation: string): Diagnostic =>
  error instanceof GitHubClientError
    ? createGitHubDiagnostic(error)
    : createUnexpectedGitHubDiagnostic(operation);

const createConfirmationRequiredDiagnostic = (): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.ConfirmationRequired,
    "Replacing the managed grading workflow requires explicit confirmation."
  );

const createIneligibleGradingDiagnostic = (): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.WorkflowGenerationRequiresPresetMode,
    "Manual workflow replacement requires enabled Graider-managed grading."
  );

const createDispatchFailureDiagnostic = (error: unknown): Diagnostic => {
  const diagnostic = normalizeGitHubError(error, "dispatch_workflow");

  return createConfigDiagnostic(
    DiagnosticCode.WorkflowDispatchFailed,
    "The canonical Graider grading workflow was installed, but dispatch failed.",
    { underlyingDiagnosticCode: diagnostic.code }
  );
};

const workflowStatusForClassification = (
  classification: ReturnType<typeof classifyManagedWorkflow>["classification"]
): Extract<
  ManualManagedGradingWorkflowStatus,
  "created" | "replaced_managed" | "replaced_unmanaged" | "replaced_unsupported" | "already_current"
> => {
  switch (classification) {
    case "absent":
      return "created";
    case "identical":
      return "already_current";
    case "managed_outdated":
      return "replaced_managed";
    case "unmanaged_conflict":
      return "replaced_unmanaged";
    case "managed_version_unsupported":
      return "replaced_unsupported";
  }
};

/**
 * Manually replaces Graider's managed workflow in one explicit repository and dispatches it.
 * This intentionally differs from Apply: confirmation authorizes replacement of unmanaged and
 * unsupported workflow content.
 */
export const manuallyInstallAndDispatchManagedGradingWorkflow = async (
  input: ManualManagedGradingWorkflowInput
): Promise<ManualManagedGradingWorkflowResult> => {
  const repository = repositoryIdentity(input.repository);

  if (!isManualManagedGradingWorkflowEligible(input.grading)) {
    return {
      repository,
      workflow: { status: "not_attempted" },
      dispatch: { status: "not_attempted" },
      diagnostics: [createIneligibleGradingDiagnostic()]
    };
  }

  if (!COMMIT_SHA_PATTERN.test(input.submissionCommitSha)) {
    return {
      repository,
      workflow: { status: "not_attempted" },
      dispatch: { status: "not_attempted" },
      diagnostics: [
        createConfigDiagnostic(
          DiagnosticCode.InvalidGradingConfig,
          "The canonical submission commit SHA is invalid."
        )
      ]
    };
  }

  if (!input.confirmed) {
    return {
      repository,
      workflow: { status: "not_attempted" },
      dispatch: { status: "not_attempted" },
      diagnostics: [createConfirmationRequiredDiagnostic()]
    };
  }

  const canonicalContent = renderJavaJunitCheckstyleWorkflow({ grading: input.grading });
  let existingContent: string | null;
  try {
    existingContent = await input.githubClient.getRepositoryFileContent(
      input.repository.owner,
      input.repository.name,
      GRAIDER_MANAGED_WORKFLOW_PATH,
      input.repository.defaultBranch
    );
  } catch (error: unknown) {
    return {
      repository,
      workflow: { status: "read_failed" },
      dispatch: { status: "not_attempted" },
      diagnostics: [normalizeGitHubError(error, "read_workflow")]
    };
  }

  const status = workflowStatusForClassification(
    classifyManagedWorkflow(existingContent, canonicalContent).classification
  );
  let commitSha: string | undefined;

  if (status !== "already_current") {
    try {
      const write = await input.githubClient.writeRepositoryFile({
        owner: input.repository.owner,
        repo: input.repository.name,
        path: GRAIDER_MANAGED_WORKFLOW_PATH,
        content: canonicalContent,
        message: MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE,
        branch: input.repository.defaultBranch
      });
      commitSha = write.commitSha;
    } catch (error: unknown) {
      return {
        repository,
        workflow: { status: "write_failed" },
        dispatch: { status: "not_attempted" },
        diagnostics: [normalizeGitHubError(error, "write_workflow")]
      };
    }
  }

  try {
    await input.githubClient.dispatchWorkflow({
      owner: input.repository.owner,
      repo: input.repository.name,
      workflowPath: GRAIDER_MANAGED_WORKFLOW_PATH,
      ref: input.repository.defaultBranch,
      inputs: { submission_sha: input.submissionCommitSha }
    });
  } catch (error: unknown) {
    return {
      repository,
      workflow: { status, ...(commitSha === undefined ? {} : { commitSha }) },
      dispatch: { status: "failed" },
      diagnostics: [createDispatchFailureDiagnostic(error)]
    };
  }

  return {
    repository,
    workflow: { status, ...(commitSha === undefined ? {} : { commitSha }) },
    dispatch: { status: "dispatched" },
    diagnostics: []
  };
};
