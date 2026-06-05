import path from "node:path";

const TERMS_DIRECTORY = "terms";
const GENERATED_WORKFLOWS_DIRECTORY = "generated-workflows";
const WORKFLOW_FILE_NAME = "grade.yml";

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
