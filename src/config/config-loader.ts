import path from "node:path";
import {
  type ConfigLoadRequest,
  type ConfigLoadResult,
  type GradingSource,
  type LoadedGraiderConfigSummary,
  type RawAssignmentConfig,
  type RawCourseConfig,
  type RawTermConfig
} from "./config-models.js";
import { loadAssignmentConfig } from "./load-assignment-config.js";
import { loadCourseConfig } from "./load-course-config.js";
import { loadTermConfig } from "./load-term-config.js";
import {
  validateAssignmentConfig,
  validateCourseConfig,
  validateTermConfig
} from "./config-validation.js";
import { resolveAssignmentPath, toRepositoryRelativePath } from "../core/paths.js";
import { findRepositoryRoot } from "../core/repo-root.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

const COURSE_CONFIG_PATH = "course.yml";
const TERMS_DIRECTORY = "terms";
const TERM_CONFIG_FILE_NAME = "term.yml";
const TERM_CODE_SEGMENT_INDEX = 1;
const ASSIGNMENT_SLUG_SEGMENT_INDEX = 3;

interface AssignmentPathParts {
  termCode: string;
  assignmentSlug: string;
  assignmentConfigPath: string;
  termConfigPath: string;
}

type ConfigFilesLoadResult =
  | {
      status: "success";
      course: RawCourseConfig;
      term: RawTermConfig;
      assignment: RawAssignmentConfig;
    }
  | {
      status: "failure";
      diagnostics: Diagnostic[];
    };

const getAssignmentPathParts = (assignmentRelativePath: string): AssignmentPathParts => {
  const segments = assignmentRelativePath.split("/");
  const termCode = segments[TERM_CODE_SEGMENT_INDEX] ?? "";
  const assignmentSlug = segments[ASSIGNMENT_SLUG_SEGMENT_INDEX] ?? "";

  return {
    termCode,
    assignmentSlug,
    assignmentConfigPath: assignmentRelativePath,
    termConfigPath: `${TERMS_DIRECTORY}/${termCode}/${TERM_CONFIG_FILE_NAME}`
  };
};

const createFailure = (diagnostics: Diagnostic[]): ConfigLoadResult => ({
  status: "failure",
  diagnostics
});

const createConfigFilesFailure = (diagnostics: Diagnostic[]): ConfigFilesLoadResult => ({
  status: "failure",
  diagnostics
});

const loadAllConfigFiles = (
  repoRoot: string,
  parts: AssignmentPathParts
): ConfigFilesLoadResult => {
  const courseResult = loadCourseConfig(path.join(repoRoot, COURSE_CONFIG_PATH));

  if (courseResult.status === "failure") {
    return createConfigFilesFailure(courseResult.diagnostics);
  }

  const termResult = loadTermConfig(path.join(repoRoot, parts.termConfigPath));

  if (termResult.status === "failure") {
    return createConfigFilesFailure(termResult.diagnostics);
  }

  const assignmentResult = loadAssignmentConfig(path.join(repoRoot, parts.assignmentConfigPath));

  if (assignmentResult.status === "failure") {
    return createConfigFilesFailure(assignmentResult.diagnostics);
  }

  return {
    status: "success",
    course: courseResult.value,
    term: termResult.value,
    assignment: assignmentResult.value
  };
};

const getGradingEnabled = (
  course: RawCourseConfig,
  assignment: RawAssignmentConfig
): {
  gradingEnabled: boolean;
  gradingSource: GradingSource;
} =>
  assignment.grading === undefined
    ? {
        gradingEnabled: course.grading.enabled,
        gradingSource: "course"
      }
    : {
        gradingEnabled: assignment.grading.enabled,
        gradingSource: "assignment"
      };

const createSummary = (
  repoRoot: string,
  parts: AssignmentPathParts,
  course: RawCourseConfig,
  assignment: RawAssignmentConfig
): LoadedGraiderConfigSummary => ({
  repoRoot,
  courseConfigPath: COURSE_CONFIG_PATH,
  termConfigPath: parts.termConfigPath,
  assignmentConfigPath: parts.assignmentConfigPath,
  assignmentRelativePath: parts.assignmentConfigPath,
  termCode: parts.termCode,
  assignmentSlug: parts.assignmentSlug,
  ...getGradingEnabled(course, assignment)
});

export const loadGraiderConfig = (request: ConfigLoadRequest): ConfigLoadResult => {
  const repositoryRootResult = findRepositoryRoot(request.cwd);

  if (!repositoryRootResult.found) {
    return createFailure([repositoryRootResult.diagnostic]);
  }

  const assignmentPath = resolveAssignmentPath(request.cwd, request.assignmentFile);
  const assignmentRelativePath = toRepositoryRelativePath(
    repositoryRootResult.repoRoot,
    assignmentPath
  );
  const parts = getAssignmentPathParts(assignmentRelativePath);
  const loadResult = loadAllConfigFiles(repositoryRootResult.repoRoot, parts);

  if (loadResult.status === "failure") {
    return createFailure(loadResult.diagnostics);
  }

  const diagnostics = [
    ...validateCourseConfig(COURSE_CONFIG_PATH, loadResult.course),
    ...validateTermConfig(parts.termConfigPath, loadResult.term, parts.termCode),
    ...validateAssignmentConfig(
      parts.assignmentConfigPath,
      loadResult.assignment,
      parts.assignmentSlug
    )
  ];

  if (diagnostics.length > 0) {
    return createFailure(diagnostics);
  }

  return {
    status: "success",
    config: {
      course: loadResult.course,
      term: loadResult.term,
      assignment: loadResult.assignment,
      summary: createSummary(
        repositoryRootResult.repoRoot,
        parts,
        loadResult.course,
        loadResult.assignment
      )
    },
    diagnostics: []
  };
};
