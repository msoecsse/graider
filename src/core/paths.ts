import path from "node:path";

const WINDOWS_SEPARATOR_PATTERN = /\\/g;
const PARENT_DIRECTORY_REFERENCE = "..";
const OUTSIDE_REPOSITORY_ROOT_MESSAGE = "Path is outside the repository root.";

export const resolveAssignmentPath = (cwd: string, assignmentPath: string): string =>
  path.resolve(cwd, assignmentPath);

export const toForwardSlashPath = (pathValue: string): string =>
  pathValue.replace(WINDOWS_SEPARATOR_PATTERN, "/");

export const toRepositoryRelativePath = (repoRoot: string, absolutePath: string): string => {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(absolutePath);
  const relativePath = path.relative(resolvedRepoRoot, resolvedPath);

  if (
    relativePath === PARENT_DIRECTORY_REFERENCE ||
    relativePath.startsWith(`${PARENT_DIRECTORY_REFERENCE}${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(OUTSIDE_REPOSITORY_ROOT_MESSAGE);
  }

  return toForwardSlashPath(relativePath);
};
