import type { EffectiveAssignmentGrading } from "../config/effective-grading.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import {
  JAVA_JUNIT_CHECKSTYLE_PRESET,
  renderJavaJunitCheckstyleWorkflow
} from "./java-junit-checkstyle-workflow.js";
import {
  GRAIDER_MANAGED_WORKFLOW_PATH,
  planManagedWorkflowDeployment
} from "./managed-workflow-policy.js";

export const MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE = "Configure Graider grading workflow";

export type ManagedGradingWorkflowDeploymentResult =
  | { readonly status: "created" }
  | { readonly status: "noop" }
  | { readonly status: "updated" }
  | { readonly status: "conflict_unmanaged" }
  | { readonly status: "conflict_unsupported_version" };

export class WorkflowDeploymentPermissionError extends Error {
  constructor() {
    super("GitHub denied permission to create or update the managed grading workflow.");
    this.name = "WorkflowDeploymentPermissionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const isManagedGradingWorkflowEligible = (
  grading:
    | {
        readonly enabled?: boolean | undefined;
        readonly mode?: string | undefined;
        readonly preset?: string | undefined;
      }
    | undefined
): boolean =>
  grading?.enabled === true &&
  grading.mode === "preset" &&
  grading.preset === JAVA_JUNIT_CHECKSTYLE_PRESET;

export const ensureManagedGradingWorkflow = async (input: {
  readonly githubClient: GitHubClient;
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly grading: EffectiveAssignmentGrading;
}): Promise<ManagedGradingWorkflowDeploymentResult> => {
  const canonicalContent = renderJavaJunitCheckstyleWorkflow({ grading: input.grading });
  const existingContent = await input.githubClient.getRepositoryFileContent(
    input.owner,
    input.repo,
    GRAIDER_MANAGED_WORKFLOW_PATH,
    input.defaultBranch
  );
  const plan = planManagedWorkflowDeployment(existingContent, canonicalContent);

  if (plan.action === "noop") return { status: "noop" };
  if (plan.action === "conflict_unmanaged") return { status: "conflict_unmanaged" };
  if (plan.action === "conflict_unsupported_version")
    return { status: "conflict_unsupported_version" };

  try {
    await input.githubClient.writeRepositoryFile({
      owner: input.owner,
      repo: input.repo,
      path: GRAIDER_MANAGED_WORKFLOW_PATH,
      content: canonicalContent,
      message: MANAGED_GRADING_WORKFLOW_COMMIT_MESSAGE
    });
  } catch (error: unknown) {
    if (error instanceof GitHubClientError && error.kind === "permission_denied") {
      throw new WorkflowDeploymentPermissionError();
    }

    throw error;
  }

  return plan.action === "create" ? { status: "created" } : { status: "updated" };
};
