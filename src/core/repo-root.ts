import fs from "node:fs";
import path from "node:path";
import { createMissingRequiredFileDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

const COURSE_CONFIG_FILE_NAME = "course.yml";

export type RepositoryRootResult =
  | {
      found: true;
      repoRoot: string;
    }
  | {
      found: false;
      diagnostic: Diagnostic;
    };

const isFile = (filePath: string): boolean => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const findRepositoryRootFromDirectory = (
  currentDirectory: string,
  startDirectory: string
): RepositoryRootResult => {
  const courseConfigPath = path.join(currentDirectory, COURSE_CONFIG_FILE_NAME);

  if (isFile(courseConfigPath)) {
    return {
      found: true,
      repoRoot: currentDirectory
    };
  }

  const parentDirectory = path.dirname(currentDirectory);

  if (parentDirectory === currentDirectory) {
    return {
      found: false,
      diagnostic: createMissingRequiredFileDiagnostic(COURSE_CONFIG_FILE_NAME, startDirectory)
    };
  }

  return findRepositoryRootFromDirectory(parentDirectory, startDirectory);
};

export const findRepositoryRoot = (startDirectory: string): RepositoryRootResult => {
  const resolvedStartDirectory = path.resolve(startDirectory);

  return findRepositoryRootFromDirectory(resolvedStartDirectory, resolvedStartDirectory);
};
