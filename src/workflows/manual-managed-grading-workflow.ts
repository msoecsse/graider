import type { EffectiveAssignmentGrading } from "../config/effective-grading.js";
import { createHash } from "node:crypto";
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

/**
 * The destructive, explicitly-confirmed half of manual workflow repair.  Keep
 * this separate from dispatch so templates and student repositories share the
 * same canonical renderer, eligibility gate, path, and classifier.
 */
export interface ManualManagedGradingWorkflowInstallInput {
  readonly githubClient: GitHubClient;
  readonly repository: ManualManagedGradingWorkflowRepositoryTarget;
  readonly grading: EffectiveAssignmentGrading;
  readonly confirmed: boolean;
  /** A preview fingerprint guards the destructive write against stale content. */
  readonly expectedContentFingerprint?: string;
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
  | "stale"
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

export interface ManualManagedGradingWorkflowInstallResult {
  readonly repository: ManualManagedGradingWorkflowResult["repository"];
  readonly workflow: ManualManagedGradingWorkflowResult["workflow"];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ManualManagedGradingWorkflowPreviewResult {
  readonly repository: ManualManagedGradingWorkflowResult["repository"];
  readonly classification:
    | "missing"
    | "current"
    | "outdated"
    | "unmanaged"
    | "unsupported"
    | "read_failed"
    | "not_eligible";
  readonly action: "create" | "no_change" | "replace" | "unavailable";
  readonly contentFingerprint?: string;
  readonly diagnostics: readonly Diagnostic[];
}

const repositoryIdentity = (repository: ManualManagedGradingWorkflowRepositoryTarget) => ({
  owner: repository.owner,
  name: repository.name,
  fullName: `${repository.owner}/${repository.name}`,
  defaultBranch: repository.defaultBranch
});

const contentFingerprint = (content: string | null): string =>
  createHash("sha256")
    .update(content ?? "<missing>", "utf8")
    .digest("hex");

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

const previewForClassification = (
  classification: ReturnType<typeof classifyManagedWorkflow>["classification"]
): Pick<ManualManagedGradingWorkflowPreviewResult, "classification" | "action"> => {
  switch (classification) {
    case "absent":
      return { classification: "missing", action: "create" };
    case "identical":
      return { classification: "current", action: "no_change" };
    case "managed_outdated":
      return { classification: "outdated", action: "replace" };
    case "unmanaged_conflict":
      return { classification: "unmanaged", action: "replace" };
    case "managed_version_unsupported":
      return { classification: "unsupported", action: "replace" };
  }
};

/** Read-only canonical workflow inspection for destructive-operation previews. */
export const previewManualManagedGradingWorkflowInstallation = async (
  input: Omit<ManualManagedGradingWorkflowInstallInput, "confirmed">
): Promise<ManualManagedGradingWorkflowPreviewResult> => {
  const repository = repositoryIdentity(input.repository);
  if (!isManualManagedGradingWorkflowEligible(input.grading))
    return {
      repository,
      classification: "not_eligible",
      action: "unavailable",
      diagnostics: [createIneligibleGradingDiagnostic()]
    };
  const canonicalContent = renderJavaJunitCheckstyleWorkflow({ grading: input.grading });
  try {
    const existingContent = await input.githubClient.getRepositoryFileContent(
      input.repository.owner,
      input.repository.name,
      GRAIDER_MANAGED_WORKFLOW_PATH,
      input.repository.defaultBranch
    );
    return {
      repository,
      ...previewForClassification(
        classifyManagedWorkflow(existingContent, canonicalContent).classification
      ),
      contentFingerprint: contentFingerprint(existingContent),
      diagnostics: []
    };
  } catch (error: unknown) {
    return {
      repository,
      classification: "read_failed",
      action: "unavailable",
      diagnostics: [normalizeGitHubError(error, "read_workflow")]
    };
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

  const installation = await manuallyInstallManagedGradingWorkflow(input);
  if (
    installation.workflow.status === "not_attempted" ||
    installation.workflow.status === "read_failed" ||
    installation.workflow.status === "write_failed" ||
    installation.workflow.status === "stale"
  )
    return { ...installation, dispatch: { status: "not_attempted" } };

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
      ...installation,
      dispatch: { status: "failed" },
      diagnostics: [createDispatchFailureDiagnostic(error)]
    };
  }

  return { ...installation, dispatch: { status: "dispatched" } };
};

/**
 * Explicitly installs the current canonical Graider workflow and never
 * dispatches it. Normal Apply deliberately does not call this operation.
 */
export const manuallyInstallManagedGradingWorkflow = async (
  input: ManualManagedGradingWorkflowInstallInput
): Promise<ManualManagedGradingWorkflowInstallResult> => {
  const repository = repositoryIdentity(input.repository);

  if (!isManualManagedGradingWorkflowEligible(input.grading)) {
    return {
      repository,
      workflow: { status: "not_attempted" },
      diagnostics: [createIneligibleGradingDiagnostic()]
    };
  }

  if (!input.confirmed) {
    return {
      repository,
      workflow: { status: "not_attempted" },
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
      diagnostics: [normalizeGitHubError(error, "read_workflow")]
    };
  }

  if (
    input.expectedContentFingerprint !== undefined &&
    input.expectedContentFingerprint !== contentFingerprint(existingContent)
  )
    return {
      repository,
      workflow: { status: "stale" },
      diagnostics: [
        createConfigDiagnostic(
          DiagnosticCode.InvalidGradingConfig,
          "The grading workflow changed after preview. Reload the preview before replacing it."
        )
      ]
    };

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
        diagnostics: [normalizeGitHubError(error, "write_workflow")]
      };
    }
  }
  return {
    repository,
    workflow: { status, ...(commitSha === undefined ? {} : { commitSha }) },
    diagnostics: []
  };
};
