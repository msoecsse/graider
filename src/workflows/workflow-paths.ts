import path from "node:path";

const TERMS_DIRECTORY = "terms";
const GENERATED_WORKFLOWS_DIRECTORY = "generated-workflows";
const WORKFLOW_FILE_NAME = "grade.yml";
const GITHUB_WORKFLOWS_DIRECTORY = ".github/workflows";
const WORKFLOW_PATH_SEPARATOR = "/";
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;

export interface WorkflowPath {
  readonly absolutePath: string;
  readonly relativePath: string;
}

export const createGeneratedWorkflowPath = (
  repoRoot: string,
  termCode: string,
  assignmentSlug: string
): WorkflowPath => {
  const relativePath = [
    TERMS_DIRECTORY,
    termCode,
    GENERATED_WORKFLOWS_DIRECTORY,
    assignmentSlug,
    WORKFLOW_FILE_NAME
  ].join("/");

  return {
    absolutePath: path.join(repoRoot, relativePath),
    relativePath
  };
};

export const normalizeWorkflowPath = (workflowPath: string): string =>
  workflowPath.replace(WINDOWS_PATH_SEPARATOR_PATTERN, WORKFLOW_PATH_SEPARATOR);

export const getWorkflowRepositoryPath = (configuredWorkflow: string): string => {
  const normalizedWorkflow = normalizeWorkflowPath(configuredWorkflow);

  return normalizedWorkflow.includes(WORKFLOW_PATH_SEPARATOR)
    ? normalizedWorkflow
    : [GITHUB_WORKFLOWS_DIRECTORY, normalizedWorkflow].join(WORKFLOW_PATH_SEPARATOR);
};

export const getWorkflowDispatchIdentifier = (configuredWorkflow: string): string =>
  path.posix.basename(normalizeWorkflowPath(configuredWorkflow));

const uniqueWorkflowPaths = (paths: readonly string[]): string[] => [...new Set(paths)];

export const createLocalWorkflowPathCandidates = (configuredWorkflow: string): string[] =>
  uniqueWorkflowPaths([
    normalizeWorkflowPath(configuredWorkflow),
    getWorkflowRepositoryPath(configuredWorkflow)
  ]);

export const createRepositoryWorkflowPathCandidates = (configuredWorkflow: string): string[] =>
  uniqueWorkflowPaths([
    getWorkflowRepositoryPath(configuredWorkflow),
    normalizeWorkflowPath(configuredWorkflow)
  ]);
