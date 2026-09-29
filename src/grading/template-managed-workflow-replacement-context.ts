import { loadGraiderConfig } from "../config/config-loader.js";
import type { ConfigLoadResult } from "../config/config-models.js";
import { getEffectiveAssignmentGrading } from "../config/effective-grading.js";
import {
  createGitHubClient,
  type GitHubClientFactoryOptions
} from "../github/github-client-factory.js";
import {
  isManualManagedGradingWorkflowEligible,
  manuallyInstallManagedGradingWorkflow,
  previewManualManagedGradingWorkflowInstallation,
  type ManualManagedGradingWorkflowInstallResult,
  type ManualManagedGradingWorkflowPreviewResult
} from "../workflows/manual-managed-grading-workflow.js";

export interface TemplateManagedWorkflowReplacementRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
}

export interface PreparedTemplateManagedWorkflowReplacement {
  readonly owner: string;
  readonly name: string;
  readonly branch: string;
  readonly grading: ReturnType<typeof getEffectiveAssignmentGrading>;
}

export type PrepareTemplateManagedWorkflowReplacementResult =
  | { readonly status: "success"; readonly value: PreparedTemplateManagedWorkflowReplacement }
  | {
      readonly status:
        | "assignment_config_error"
        | "grading_not_eligible"
        | "template_not_configured";
    };

export type TemplateManagedWorkflowReplacementResult =
  | { readonly status: "ready"; readonly preview: ManualManagedGradingWorkflowPreviewResult }
  | { readonly status: "success"; readonly result: ManualManagedGradingWorkflowInstallResult }
  | { readonly status: "repository_unavailable" | "github_operation_failed" };

interface Dependencies {
  readonly loadConfig: (request: {
    readonly cwd: string;
    readonly assignmentFile: string;
  }) => ConfigLoadResult;
  readonly createClient: (
    options: GitHubClientFactoryOptions
  ) => ReturnType<typeof createGitHubClient>;
  readonly preview: typeof previewManualManagedGradingWorkflowInstallation;
  readonly install: typeof manuallyInstallManagedGradingWorkflow;
}

const dependencies: Dependencies = {
  loadConfig: loadGraiderConfig,
  createClient: createGitHubClient,
  preview: previewManualManagedGradingWorkflowInstallation,
  install: manuallyInstallManagedGradingWorkflow
};

const assignmentFile = (termCode: string, assignmentSlug: string): string =>
  `terms/${termCode}/assignments/${assignmentSlug}/assignment.yml`;

export const prepareTemplateManagedWorkflowReplacement = (
  request: TemplateManagedWorkflowReplacementRequest,
  overrides: Partial<Dependencies> = {}
): PrepareTemplateManagedWorkflowReplacementResult => {
  const resolved = { ...dependencies, ...overrides };
  const loaded = resolved.loadConfig({
    cwd: request.courseFolderPath,
    assignmentFile: assignmentFile(request.termCode, request.assignmentSlug)
  });
  if (
    loaded.status === "failure" ||
    loaded.config.summary.termCode !== request.termCode ||
    loaded.config.summary.assignmentSlug !== request.assignmentSlug
  )
    return { status: "assignment_config_error" };
  const grading = getEffectiveAssignmentGrading(loaded.config);
  if (!isManualManagedGradingWorkflowEligible(grading)) return { status: "grading_not_eligible" };
  const configuredTemplate = loaded.config.assignment.template;
  if (
    configuredTemplate === undefined ||
    configuredTemplate.repository.trim() === "" ||
    configuredTemplate.branch.trim() === ""
  )
    return { status: "template_not_configured" };
  const [owner, name, ...rest] = configuredTemplate.repository.split("/");
  if (
    owner === undefined ||
    name === undefined ||
    rest.length > 0 ||
    owner.trim() === "" ||
    name.trim() === ""
  )
    return { status: "template_not_configured" };
  return { status: "success", value: { owner, name, branch: configuredTemplate.branch, grading } };
};

export const previewPreparedTemplateManagedWorkflowReplacement = async (
  prepared: PreparedTemplateManagedWorkflowReplacement,
  token: string,
  overrides: Partial<Dependencies> = {}
): Promise<TemplateManagedWorkflowReplacementResult> => {
  const resolved = { ...dependencies, ...overrides };
  const githubClient = resolved.createClient({ token });
  try {
    const repository = await githubClient.getRepository(prepared.owner, prepared.name);
    if (
      repository === null ||
      repository.owner !== prepared.owner ||
      repository.name !== prepared.name
    )
      return { status: "repository_unavailable" };
    return {
      status: "ready",
      preview: await resolved.preview({
        githubClient,
        repository: {
          owner: repository.owner,
          name: repository.name,
          defaultBranch: prepared.branch
        },
        grading: prepared.grading
      })
    };
  } catch {
    return { status: "github_operation_failed" };
  }
};

export const installPreparedTemplateManagedWorkflowReplacement = async (
  prepared: PreparedTemplateManagedWorkflowReplacement,
  token: string,
  confirmed: boolean,
  overrides: Partial<Dependencies> = {},
  expectedContentFingerprint?: string
): Promise<TemplateManagedWorkflowReplacementResult> => {
  const resolved = { ...dependencies, ...overrides };
  const githubClient = resolved.createClient({ token });
  try {
    const repository = await githubClient.getRepository(prepared.owner, prepared.name);
    if (
      repository === null ||
      repository.owner !== prepared.owner ||
      repository.name !== prepared.name
    )
      return { status: "repository_unavailable" };
    return {
      status: "success",
      result: await resolved.install({
        githubClient,
        repository: {
          owner: repository.owner,
          name: repository.name,
          defaultBranch: prepared.branch
        },
        grading: prepared.grading,
        confirmed,
        ...(expectedContentFingerprint === undefined ? {} : { expectedContentFingerprint })
      })
    };
  } catch {
    return { status: "github_operation_failed" };
  }
};

export const templateManagedWorkflowReplacementBackend = {
  prepareTemplateManagedWorkflowReplacement,
  previewPreparedTemplateManagedWorkflowReplacement,
  installPreparedTemplateManagedWorkflowReplacement
};
