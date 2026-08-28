import { parseTemplateRepository } from "../config/github-config-validation.js";
import type { LoadedGraiderConfig } from "../config/config-models.js";
import {
  ASSIGNMENT_DETAIL_GITHUB_AUTH_FAILED_CODE,
  ASSIGNMENT_DETAIL_GITHUB_PERMISSION_DENIED_CODE,
  ASSIGNMENT_DETAIL_GITHUB_RATE_LIMITED_CODE,
  ASSIGNMENT_DETAIL_GITHUB_REQUEST_FAILED_CODE,
  ASSIGNMENT_DETAIL_GRADING_WORKFLOW_MISSING_CODE,
  ASSIGNMENT_DETAIL_TEMPLATE_BRANCH_MISSING_CODE,
  ASSIGNMENT_DETAIL_TEMPLATE_REPOSITORY_MISSING_CODE,
  ASSIGNMENT_DETAIL_WORKFLOW_DISPATCH_MISSING_CODE,
  GITHUB_TOKEN_REQUIRED_CODE,
  createConfigDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import { parseYaml } from "../io/stable-yaml.js";
import { hasWorkflowDispatchTrigger } from "../workflows/workflow-dispatch-validation.js";
import type {
  AssignmentDetailCheckStatus,
  AssignmentDetailGrading,
  AssignmentDetailTemplate
} from "./assignment-detail-models.js";

const STATUS_AVAILABLE: AssignmentDetailCheckStatus = "available";
const STATUS_MISSING: AssignmentDetailCheckStatus = "missing";
const STATUS_INACCESSIBLE: AssignmentDetailCheckStatus = "inaccessible";
const STATUS_BRANCH_MISSING: AssignmentDetailCheckStatus = "branch_missing";
const STATUS_TOKEN_REQUIRED: AssignmentDetailCheckStatus = "token_required";
const STATUS_NOT_CHECKED: AssignmentDetailCheckStatus = "not_checked";
const STATUS_NOT_REQUIRED: AssignmentDetailCheckStatus = "not_required";
const STATUS_ERROR: AssignmentDetailCheckStatus = "error";

export interface AssignmentDetailGithubReadinessInput {
  readonly config: LoadedGraiderConfig;
  readonly template: AssignmentDetailTemplate;
  readonly grading: AssignmentDetailGrading;
  readonly githubClient?: GitHubClient;
}

export interface AssignmentDetailGithubReadinessResult {
  readonly template: AssignmentDetailTemplate;
  readonly grading: AssignmentDetailGrading;
  readonly diagnostics: Diagnostic[];
}

const createTokenRequiredDiagnostic = (config: LoadedGraiderConfig): Diagnostic =>
  createConfigDiagnostic(
    GITHUB_TOKEN_REQUIRED_CODE,
    "GRAIDER_GITHUB_TOKEN is required to check assignment GitHub readiness.",
    {
      assignmentFile: config.summary.assignmentConfigPath,
      templateRepository: config.assignment.template.repository,
      templateBranch: config.assignment.template.branch,
      ...(config.assignment.grading?.workflow === undefined
        ? {}
        : { workflow: config.assignment.grading.workflow })
    }
  );

const mapGitHubErrorCode = (error: GitHubClientError): string => {
  if (error.kind === "auth_missing" || error.kind === "auth_failed") {
    return ASSIGNMENT_DETAIL_GITHUB_AUTH_FAILED_CODE;
  }

  if (error.kind === "permission_denied") {
    return ASSIGNMENT_DETAIL_GITHUB_PERMISSION_DENIED_CODE;
  }

  if (error.kind === "rate_limited") {
    return ASSIGNMENT_DETAIL_GITHUB_RATE_LIMITED_CODE;
  }

  return ASSIGNMENT_DETAIL_GITHUB_REQUEST_FAILED_CODE;
};

const mapGitHubErrorStatus = (error: GitHubClientError): AssignmentDetailCheckStatus => {
  if (
    error.kind === "auth_missing" ||
    error.kind === "auth_failed" ||
    error.kind === "permission_denied"
  ) {
    return STATUS_INACCESSIBLE;
  }

  return STATUS_ERROR;
};

const createGitHubDiagnostic = (
  error: unknown,
  message: string,
  context: Record<string, unknown>
): Diagnostic => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(mapGitHubErrorCode(error), `${message}: ${error.message}`, {
      ...context,
      kind: error.kind,
      retryable: error.retryable,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds })
    });
  }

  return createConfigDiagnostic(ASSIGNMENT_DETAIL_GITHUB_REQUEST_FAILED_CODE, message, context);
};

const createTemplateRepositoryMissingDiagnostic = (config: LoadedGraiderConfig): Diagnostic =>
  createConfigDiagnostic(
    ASSIGNMENT_DETAIL_TEMPLATE_REPOSITORY_MISSING_CODE,
    `Template repository ${config.assignment.template.repository} was not found.`,
    {
      assignmentFile: config.summary.assignmentConfigPath,
      templateRepository: config.assignment.template.repository
    }
  );

const createTemplateBranchMissingDiagnostic = (config: LoadedGraiderConfig): Diagnostic =>
  createConfigDiagnostic(
    ASSIGNMENT_DETAIL_TEMPLATE_BRANCH_MISSING_CODE,
    `Template branch ${config.assignment.template.branch} was not found.`,
    {
      assignmentFile: config.summary.assignmentConfigPath,
      templateRepository: config.assignment.template.repository,
      templateBranch: config.assignment.template.branch
    }
  );

const createGradingWorkflowMissingDiagnostic = (
  config: LoadedGraiderConfig,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    ASSIGNMENT_DETAIL_GRADING_WORKFLOW_MISSING_CODE,
    `Configured grading workflow ${workflowPath} was not found in the template repository.`,
    {
      assignmentFile: config.summary.assignmentConfigPath,
      templateRepository: config.assignment.template.repository,
      templateBranch: config.assignment.template.branch,
      workflow: workflowPath,
      checkedPath: workflowPath
    }
  );

const createWorkflowDispatchMissingDiagnostic = (
  config: LoadedGraiderConfig,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    ASSIGNMENT_DETAIL_WORKFLOW_DISPATCH_MISSING_CODE,
    `Configured grading workflow ${workflowPath} does not define workflow_dispatch.`,
    {
      assignmentFile: config.summary.assignmentConfigPath,
      templateRepository: config.assignment.template.repository,
      templateBranch: config.assignment.template.branch,
      workflow: workflowPath,
      checkedPath: workflowPath
    }
  );

const createTokenRequiredResult = (
  config: LoadedGraiderConfig,
  template: AssignmentDetailTemplate,
  grading: AssignmentDetailGrading
): AssignmentDetailGithubReadinessResult => ({
  template: {
    ...template,
    status: STATUS_TOKEN_REQUIRED,
    repositoryStatus: STATUS_TOKEN_REQUIRED,
    branchStatus: STATUS_TOKEN_REQUIRED
  },
  grading: {
    ...grading,
    workflowStatus: grading.enabled ? STATUS_TOKEN_REQUIRED : STATUS_NOT_REQUIRED,
    workflowDispatch: grading.enabled ? STATUS_TOKEN_REQUIRED : STATUS_NOT_REQUIRED
  },
  diagnostics: [createTokenRequiredDiagnostic(config)]
});

const withTemplateStatus = (
  template: AssignmentDetailTemplate,
  repositoryStatus: AssignmentDetailCheckStatus,
  branchStatus: AssignmentDetailCheckStatus
): AssignmentDetailTemplate => ({
  ...template,
  repositoryStatus,
  branchStatus,
  status:
    repositoryStatus === STATUS_AVAILABLE
      ? branchStatus === STATUS_AVAILABLE
        ? STATUS_AVAILABLE
        : branchStatus
      : repositoryStatus
});

const withWorkflowStatus = (
  grading: AssignmentDetailGrading,
  workflowStatus: AssignmentDetailCheckStatus,
  workflowDispatch: AssignmentDetailCheckStatus
): AssignmentDetailGrading => ({
  ...grading,
  workflowStatus,
  workflowDispatch
});

const inspectWorkflowDispatch = (
  config: LoadedGraiderConfig,
  workflowPath: string,
  workflowContent: string
): {
  readonly dispatchStatus: AssignmentDetailCheckStatus;
  readonly diagnostics: Diagnostic[];
} => {
  const parseResult = parseYaml(workflowContent, workflowPath);

  if (parseResult.status === "failure") {
    return {
      dispatchStatus: STATUS_ERROR,
      diagnostics: [
        {
          ...parseResult.diagnostic,
          context: {
            ...(parseResult.diagnostic.context ?? {}),
            assignmentFile: config.summary.assignmentConfigPath,
            templateRepository: config.assignment.template.repository,
            templateBranch: config.assignment.template.branch,
            workflow: workflowPath
          }
        }
      ]
    };
  }

  if (!hasWorkflowDispatchTrigger(parseResult.value)) {
    return {
      dispatchStatus: STATUS_MISSING,
      diagnostics: [createWorkflowDispatchMissingDiagnostic(config, workflowPath)]
    };
  }

  return {
    dispatchStatus: STATUS_AVAILABLE,
    diagnostics: []
  };
};

const checkWorkflow = async (
  config: LoadedGraiderConfig,
  grading: AssignmentDetailGrading,
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  branch: string
): Promise<{
  readonly grading: AssignmentDetailGrading;
  readonly diagnostics: Diagnostic[];
}> => {
  if (!grading.enabled || grading.workflow === null) {
    return {
      grading: withWorkflowStatus(grading, STATUS_NOT_REQUIRED, STATUS_NOT_REQUIRED),
      diagnostics: []
    };
  }

  try {
    const workflowContent = await githubClient.getRepositoryFileContent(
      owner,
      repo,
      grading.workflow,
      branch
    );

    if (workflowContent === null) {
      return {
        grading: withWorkflowStatus(grading, STATUS_MISSING, STATUS_NOT_CHECKED),
        diagnostics: [createGradingWorkflowMissingDiagnostic(config, grading.workflow)]
      };
    }

    const dispatchResult = inspectWorkflowDispatch(config, grading.workflow, workflowContent);

    return {
      grading: withWorkflowStatus(grading, STATUS_AVAILABLE, dispatchResult.dispatchStatus),
      diagnostics: dispatchResult.diagnostics
    };
  } catch (error) {
    const status = error instanceof GitHubClientError ? mapGitHubErrorStatus(error) : STATUS_ERROR;

    return {
      grading: withWorkflowStatus(grading, status, status),
      diagnostics: [
        createGitHubDiagnostic(error, `Could not check grading workflow ${grading.workflow}.`, {
          assignmentFile: config.summary.assignmentConfigPath,
          templateRepository: config.assignment.template.repository,
          templateBranch: config.assignment.template.branch,
          workflow: grading.workflow,
          checkedPath: grading.workflow
        })
      ]
    };
  }
};

export const checkAssignmentDetailGithubReadiness = async ({
  config,
  template,
  grading,
  githubClient
}: AssignmentDetailGithubReadinessInput): Promise<AssignmentDetailGithubReadinessResult> => {
  if (config.assignment.template.repository === "" && config.assignment.template.branch === "") {
    return {
      template: withTemplateStatus(template, STATUS_NOT_REQUIRED, STATUS_NOT_REQUIRED),
      grading: withWorkflowStatus(grading, STATUS_NOT_REQUIRED, STATUS_NOT_REQUIRED),
      diagnostics: []
    };
  }

  if (githubClient === undefined) {
    return createTokenRequiredResult(config, template, grading);
  }

  const parsedRepository = parseTemplateRepository(
    config.course.github.organization,
    config.assignment.template.repository
  );

  if (parsedRepository.status === "failure") {
    return {
      template: withTemplateStatus(template, STATUS_ERROR, STATUS_ERROR),
      grading: withWorkflowStatus(grading, STATUS_ERROR, STATUS_ERROR),
      diagnostics: [parsedRepository.diagnostic]
    };
  }

  const { owner, repo } = parsedRepository.repository;

  try {
    const templateRepository = await githubClient.getTemplateRepository(owner, repo);

    if (templateRepository === null) {
      return {
        template: withTemplateStatus(template, STATUS_MISSING, STATUS_NOT_CHECKED),
        grading: withWorkflowStatus(
          grading,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED
        ),
        diagnostics: [createTemplateRepositoryMissingDiagnostic(config)]
      };
    }

    if (
      !templateRepository.branches.some((branch) => branch === config.assignment.template.branch)
    ) {
      return {
        template: withTemplateStatus(template, STATUS_AVAILABLE, STATUS_BRANCH_MISSING),
        grading: withWorkflowStatus(
          grading,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED,
          grading.enabled ? STATUS_NOT_CHECKED : STATUS_NOT_REQUIRED
        ),
        diagnostics: [createTemplateBranchMissingDiagnostic(config)]
      };
    }

    const workflowResult = await checkWorkflow(
      config,
      grading,
      githubClient,
      owner,
      repo,
      config.assignment.template.branch
    );

    return {
      template: withTemplateStatus(template, STATUS_AVAILABLE, STATUS_AVAILABLE),
      grading: workflowResult.grading,
      diagnostics: workflowResult.diagnostics
    };
  } catch (error) {
    const status = error instanceof GitHubClientError ? mapGitHubErrorStatus(error) : STATUS_ERROR;

    return {
      template: withTemplateStatus(template, status, status),
      grading: withWorkflowStatus(
        grading,
        grading.enabled ? status : STATUS_NOT_REQUIRED,
        grading.enabled ? status : STATUS_NOT_REQUIRED
      ),
      diagnostics: [
        createGitHubDiagnostic(error, "Could not check template repository readiness.", {
          assignmentFile: config.summary.assignmentConfigPath,
          templateRepository: config.assignment.template.repository,
          templateBranch: config.assignment.template.branch
        })
      ]
    };
  }
};
