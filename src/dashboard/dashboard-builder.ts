import fs from "node:fs";
import path from "node:path";
import type {
  RawAssignmentConfig,
  RawCourseConfig,
  RawTermConfig
} from "../config/config-models.js";
import { parseTemplateRepository } from "../config/github-config-validation.js";
import { loadAssignmentConfig } from "../config/load-assignment-config.js";
import { loadCourseConfig } from "../config/load-course-config.js";
import { loadTermConfig } from "../config/load-term-config.js";
import {
  validateAssignmentConfig,
  validateCourseConfig,
  validateTermConfig
} from "../config/config-validation.js";
import { findRepositoryRoot } from "../core/repo-root.js";
import {
  DASHBOARD_GITHUB_AUTH_FAILED_CODE,
  DASHBOARD_GITHUB_PERMISSION_DENIED_CODE,
  DASHBOARD_GITHUB_RATE_LIMITED_CODE,
  DASHBOARD_GITHUB_REQUEST_FAILED_CODE,
  DASHBOARD_GRADING_WORKFLOW_MISSING_CODE,
  DASHBOARD_TEMPLATE_BRANCH_MISSING_CODE,
  DASHBOARD_TEMPLATE_REPOSITORY_MISSING_CODE,
  DASHBOARD_TERM_NOT_FOUND_CODE,
  DASHBOARD_WORKFLOW_DISPATCH_MISSING_CODE,
  createConfigDiagnostic
} from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import type { GitHubTemplateRepository } from "../github/github-models.js";
import { parseCsv } from "../io/csv.js";
import { readTextFile } from "../io/file-system.js";
import { parseYaml } from "../io/stable-yaml.js";
import { createManifestPath } from "../manifest/manifest-paths.js";
import { ROSTER_STATUS_ACTIVE, type RosterStudent } from "../roster/roster-models.js";
import {
  normalizeGithubUsername,
  normalizeRosterStatus,
  normalizeStudentId
} from "../roster/roster-normalization.js";
import {
  GITHUB_USERNAME_COLUMN,
  REQUIRED_ROSTER_COLUMNS,
  SECTION_COLUMN,
  STATUS_COLUMN,
  STUDENT_ID_COLUMN,
  createMissingRequiredValueDiagnostic,
  isRosterStatus,
  validateGithubUsername,
  validateRequiredColumns,
  validateRosterDuplicates,
  validateRosterSection,
  validateRosterStatus
} from "../roster/roster-validation.js";
import type {
  DashboardApplyState,
  DashboardAssignmentGithubStatus,
  DashboardAssignmentSummary,
  DashboardCard,
  DashboardGithubStatus,
  DashboardResult,
  DashboardRosterSummary,
  DashboardStatus,
  DashboardSummary
} from "./dashboard-models.js";
import { hasWorkflowDispatchTrigger } from "../workflows/workflow-dispatch-validation.js";
import { DASHBOARD_SCHEMA_VERSION } from "./dashboard-models.js";

const COMMAND_NAME = "dashboard";
const COURSE_CONFIG_PATH = "course.yml";
const TERMS_DIRECTORY = "terms";
const TERM_CONFIG_FILE_NAME = "term.yml";
const ASSIGNMENTS_DIRECTORY = "assignments";
const ASSIGNMENT_CONFIG_FILE_NAME = "assignment.yml";
const COURSE_PATH = ".";
const EMPTY_COUNT = 0;
const DEFAULT_RECENT_ASSIGNMENT_LIMIT = 5;
const FIRST_SORT_BEFORE_SECOND = -1;
const FIRST_SORT_AFTER_SECOND = 1;
const SORT_EQUAL = 0;
const DATE_PARSE_FAILED = Number.NaN;
const MISSING_COLUMN_INDEX = -1;
const STATUS_ACTIVE = "active";
const STATUS_COMPLETED = "completed";
const STATUS_INACTIVE = "inactive";
const STATUS_UNKNOWN = "unknown";
const LEGACY_GRADING_MODE = "custom-workflow";
const APPLY_STATE_APPLIED: DashboardApplyState = "applied";
const APPLY_STATE_NOT_APPLIED: DashboardApplyState = "not_applied";
const APPLY_STATE_UNKNOWN: DashboardApplyState = "unknown";
const GITHUB_STATUS_AVAILABLE: DashboardGithubStatus = "available";
const GITHUB_STATUS_MISSING: DashboardGithubStatus = "missing";
const GITHUB_STATUS_NOT_REQUIRED: DashboardGithubStatus = "not_required";
const GITHUB_STATUS_NOT_CHECKED: DashboardGithubStatus = "not_checked";
const GITHUB_STATUS_ERROR: DashboardGithubStatus = "error";
const RECENT_ASSIGNMENT_STATUS_WEIGHT: Record<string, number> = {
  [STATUS_ACTIVE]: 0,
  [STATUS_COMPLETED]: 1,
  [STATUS_UNKNOWN]: 2
};

export interface BuildDashboardInput {
  readonly cwd: string;
  readonly githubClient: GitHubClient;
  readonly term?: string;
}

interface LoadedCourse {
  readonly repoRoot: string;
  readonly config: RawCourseConfig;
  readonly diagnostics: Diagnostic[];
}

interface LoadedTerm {
  readonly termSlug: string;
  readonly termConfigPath: string;
  readonly config?: RawTermConfig;
  readonly diagnostics: Diagnostic[];
}

interface LoadedAssignmentSummary {
  readonly summary: DashboardAssignmentSummary;
  readonly config?: RawAssignmentConfig;
}

interface DashboardGithubCheckCache {
  readonly templateRepositories: Map<string, Promise<GitHubTemplateRepository | null>>;
  readonly workflowFiles: Map<string, Promise<string | null>>;
}

interface RosterColumnIndexes {
  readonly studentId: number;
  readonly githubUsername: number;
  readonly section: number;
  readonly status: number;
}

const emptySummary = (): DashboardSummary => ({
  cardCount: EMPTY_COUNT,
  courseCount: EMPTY_COUNT,
  termCount: EMPTY_COUNT,
  assignmentCount: EMPTY_COUNT,
  needsAttentionCount: EMPTY_COUNT
});

export const createDashboardResult = (
  status: DashboardStatus,
  diagnostics: Diagnostic[],
  cards: DashboardCard[]
): DashboardResult => {
  const summary = createSummary(cards);

  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    commandName: COMMAND_NAME,
    status,
    exitCode: status === "success" ? 0 : status === "partial_success" ? 2 : 1,
    diagnostics,
    summary,
    cards
  };
};

export const createEmptyDashboardResult = (
  status: DashboardStatus,
  diagnostics: Diagnostic[]
): DashboardResult => ({
  schemaVersion: DASHBOARD_SCHEMA_VERSION,
  commandName: COMMAND_NAME,
  status,
  exitCode: status === "success" ? 0 : status === "partial_success" ? 2 : 1,
  diagnostics,
  summary: emptySummary(),
  cards: []
});

const createSummary = (cards: readonly DashboardCard[]): DashboardSummary => ({
  cardCount: cards.length,
  courseCount: cards.length > EMPTY_COUNT ? 1 : EMPTY_COUNT,
  termCount: cards.length,
  assignmentCount: cards.reduce((count, card) => count + card.assignmentCount, EMPTY_COUNT),
  needsAttentionCount: cards.filter((card) => card.needsAttention).length
});

const diagnosticRequiresAttention = (diagnostic: Diagnostic): boolean =>
  diagnostic.severity === "error";

const getAttentionCount = (diagnostics: readonly Diagnostic[]): number =>
  diagnostics.filter(diagnosticRequiresAttention).length;

const listDirectoryNames = (directoryPath: string): string[] => {
  try {
    return fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
};

const isFile = (filePath: string): boolean => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const loadCourse = (cwd: string): LoadedCourse | { diagnostics: Diagnostic[] } => {
  const rootResult = findRepositoryRoot(cwd);

  if (!rootResult.found) {
    return {
      diagnostics: [rootResult.diagnostic]
    };
  }

  const loadResult = loadCourseConfig(path.join(rootResult.repoRoot, COURSE_CONFIG_PATH));

  if (loadResult.status === "failure") {
    return {
      diagnostics: loadResult.diagnostics
    };
  }

  return {
    repoRoot: rootResult.repoRoot,
    config: loadResult.value,
    diagnostics: validateCourseConfig(COURSE_CONFIG_PATH, loadResult.value)
  };
};

const createTermNotFoundDiagnostic = (termSlug: string): Diagnostic =>
  createConfigDiagnostic(
    DASHBOARD_TERM_NOT_FOUND_CODE,
    `The requested term ${termSlug} was not found.`,
    { termSlug }
  );

const createGitHubCheckCache = (): DashboardGithubCheckCache => ({
  templateRepositories: new Map(),
  workflowFiles: new Map()
});

const createRepositoryCacheKey = (owner: string, repo: string): string =>
  `${owner.toLowerCase()}/${repo.toLowerCase()}`;

const createWorkflowCacheKey = (
  owner: string,
  repo: string,
  branch: string,
  workflowPath: string
): string => `${createRepositoryCacheKey(owner, repo)}:${branch}:${workflowPath}`;

const getCachedTemplateRepository = (
  cache: DashboardGithubCheckCache,
  githubClient: GitHubClient,
  owner: string,
  repo: string
): Promise<GitHubTemplateRepository | null> => {
  const key = createRepositoryCacheKey(owner, repo);
  const cached = cache.templateRepositories.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const request = githubClient.getTemplateRepository(owner, repo);

  cache.templateRepositories.set(key, request);

  return request;
};

const getCachedWorkflowFileContent = (
  cache: DashboardGithubCheckCache,
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
  workflowPath: string
): Promise<string | null> => {
  const key = createWorkflowCacheKey(owner, repo, branch, workflowPath);
  const cached = cache.workflowFiles.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const request = githubClient.getRepositoryFileContent(owner, repo, workflowPath, branch);

  cache.workflowFiles.set(key, request);

  return request;
};

const createAssignmentDiagnosticContext = (
  assignment: DashboardAssignmentSummary
): Record<string, unknown> => ({
  assignmentSlug: assignment.slug,
  assignmentFile: assignment.assignmentFile,
  ...(assignment.templateRepository === undefined
    ? {}
    : { templateRepository: assignment.templateRepository }),
  ...(assignment.templateBranch === undefined ? {} : { templateBranch: assignment.templateBranch }),
  ...(assignment.workflow === undefined ? {} : { workflow: assignment.workflow })
});

const addDiagnosticContext = (
  diagnostic: Diagnostic,
  context: Record<string, unknown>
): Diagnostic => ({
  ...diagnostic,
  context: {
    ...(diagnostic.context ?? {}),
    ...context
  }
});

const mapDashboardGithubErrorCode = (error: GitHubClientError): string => {
  if (error.kind === "auth_missing" || error.kind === "auth_failed") {
    return DASHBOARD_GITHUB_AUTH_FAILED_CODE;
  }

  if (error.kind === "permission_denied") {
    return DASHBOARD_GITHUB_PERMISSION_DENIED_CODE;
  }

  if (error.kind === "rate_limited") {
    return DASHBOARD_GITHUB_RATE_LIMITED_CODE;
  }

  return DASHBOARD_GITHUB_REQUEST_FAILED_CODE;
};

const createDashboardGithubRequestDiagnostic = (
  error: unknown,
  message: string,
  context: Record<string, unknown>
): Diagnostic => {
  if (error instanceof GitHubClientError) {
    return createConfigDiagnostic(
      mapDashboardGithubErrorCode(error),
      `${message}: ${error.message}`,
      {
        ...context,
        kind: error.kind,
        retryable: error.retryable,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds })
      }
    );
  }

  return createConfigDiagnostic(DASHBOARD_GITHUB_REQUEST_FAILED_CODE, message, context);
};

const createTemplateRepositoryMissingDiagnostic = (
  assignment: DashboardAssignmentSummary
): Diagnostic =>
  createConfigDiagnostic(
    DASHBOARD_TEMPLATE_REPOSITORY_MISSING_CODE,
    `Template repository ${assignment.templateRepository ?? ""} was not found.`,
    createAssignmentDiagnosticContext(assignment)
  );

const createTemplateBranchMissingDiagnostic = (
  assignment: DashboardAssignmentSummary
): Diagnostic =>
  createConfigDiagnostic(
    DASHBOARD_TEMPLATE_BRANCH_MISSING_CODE,
    `Template branch ${assignment.templateBranch ?? ""} was not found.`,
    createAssignmentDiagnosticContext(assignment)
  );

const createGradingWorkflowMissingDiagnostic = (
  assignment: DashboardAssignmentSummary,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    DASHBOARD_GRADING_WORKFLOW_MISSING_CODE,
    `Configured grading workflow ${workflowPath} was not found in the template repository.`,
    {
      ...createAssignmentDiagnosticContext(assignment),
      checkedPath: workflowPath
    }
  );

const createWorkflowDispatchMissingDiagnostic = (
  assignment: DashboardAssignmentSummary,
  workflowPath: string
): Diagnostic =>
  createConfigDiagnostic(
    DASHBOARD_WORKFLOW_DISPATCH_MISSING_CODE,
    `Configured grading workflow ${workflowPath} does not define workflow_dispatch.`,
    {
      ...createAssignmentDiagnosticContext(assignment),
      checkedPath: workflowPath
    }
  );

const createDefaultGithubStatus = (gradingEnabled: boolean): DashboardAssignmentGithubStatus => ({
  templateRepository: GITHUB_STATUS_NOT_CHECKED,
  templateBranch: GITHUB_STATUS_NOT_CHECKED,
  gradingWorkflow: gradingEnabled ? GITHUB_STATUS_NOT_CHECKED : GITHUB_STATUS_NOT_REQUIRED,
  workflowDispatch: gradingEnabled ? GITHUB_STATUS_NOT_CHECKED : GITHUB_STATUS_NOT_REQUIRED
});

const hasTemplateBranch = (templateRepository: GitHubTemplateRepository, branch: string): boolean =>
  templateRepository.branches.some((availableBranch) => availableBranch === branch);

const discoverTermSlugs = (repoRoot: string, requestedTerm: string | undefined): string[] => {
  const termSlugs = listDirectoryNames(path.join(repoRoot, TERMS_DIRECTORY));

  return requestedTerm === undefined
    ? termSlugs
    : termSlugs.filter((termSlug) => termSlug === requestedTerm);
};

const loadTerm = (repoRoot: string, termSlug: string): LoadedTerm => {
  const termConfigPath = [TERMS_DIRECTORY, termSlug, TERM_CONFIG_FILE_NAME].join("/");
  const loadResult = loadTermConfig(path.join(repoRoot, termConfigPath));

  if (loadResult.status === "failure") {
    return {
      termSlug,
      termConfigPath,
      diagnostics: loadResult.diagnostics
    };
  }

  return {
    termSlug,
    termConfigPath,
    config: loadResult.value,
    diagnostics: validateTermConfig(termConfigPath, loadResult.value, termSlug)
  };
};

const mapAssignmentStatus = (status: string): string => {
  if (status === "active") {
    return STATUS_ACTIVE;
  }

  if (status === "closed") {
    return STATUS_COMPLETED;
  }

  return STATUS_INACTIVE;
};

const shouldIncludeAssignment = (assignment: DashboardAssignmentSummary): boolean =>
  assignment.status === STATUS_ACTIVE ||
  assignment.status === STATUS_COMPLETED ||
  assignment.status === STATUS_UNKNOWN;

const parseTime = (value: string | undefined): number =>
  value === undefined ? DATE_PARSE_FAILED : Date.parse(value);

const compareMaybeDescendingTime = (
  left: string | undefined,
  right: string | undefined
): number => {
  const leftTime = parseTime(left);
  const rightTime = parseTime(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (leftValid && rightValid && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  if (leftValid !== rightValid) {
    return leftValid ? FIRST_SORT_BEFORE_SECOND : FIRST_SORT_AFTER_SECOND;
  }

  return SORT_EQUAL;
};

const getStatusWeight = (status: string): number =>
  RECENT_ASSIGNMENT_STATUS_WEIGHT[status] ??
  RECENT_ASSIGNMENT_STATUS_WEIGHT[STATUS_UNKNOWN] ??
  SORT_EQUAL;

const compareRecentAssignments = (
  left: DashboardAssignmentSummary,
  right: DashboardAssignmentSummary
): number => {
  const statusComparison = getStatusWeight(left.status) - getStatusWeight(right.status);

  if (statusComparison !== SORT_EQUAL) {
    return statusComparison;
  }

  const timeComparison = compareMaybeDescendingTime(left.dueAt, right.dueAt);

  if (timeComparison !== SORT_EQUAL) {
    return timeComparison;
  }

  const titleComparison = left.title.localeCompare(right.title);

  return titleComparison === SORT_EQUAL ? left.slug.localeCompare(right.slug) : titleComparison;
};

const getEffectiveGrading = (
  courseConfig: RawCourseConfig,
  assignmentConfig: RawAssignmentConfig
): RawCourseConfig["grading"] => assignmentConfig.grading ?? courseConfig.grading;

const getAssignmentApplyState = (
  repoRoot: string,
  termSlug: string,
  assignmentSlug: string
): DashboardApplyState => {
  const manifestPath = createManifestPath(repoRoot, termSlug, assignmentSlug);

  return isFile(manifestPath.absolutePath) ? APPLY_STATE_APPLIED : APPLY_STATE_NOT_APPLIED;
};

const createAssignmentSummary = (
  repoRoot: string,
  courseConfig: RawCourseConfig,
  assignmentConfig: RawAssignmentConfig,
  assignmentFile: string,
  expectedSlug: string,
  diagnostics: Diagnostic[]
): DashboardAssignmentSummary => {
  const grading = getEffectiveGrading(courseConfig, assignmentConfig);
  const assignmentStatus = mapAssignmentStatus(assignmentConfig.assignment.status);

  return {
    slug: assignmentConfig.assignment.slug,
    title: assignmentConfig.assignment.title,
    status: assignmentStatus,
    gradingEnabled: grading.enabled,
    assignmentFile,
    applyState: getAssignmentApplyState(repoRoot, assignmentFile.split("/")[1] ?? "", expectedSlug),
    needsAttention: getAttentionCount(diagnostics) > EMPTY_COUNT,
    diagnostics,
    ...(grading.enabled
      ? { gradingMode: grading.mode ?? LEGACY_GRADING_MODE }
      : grading.mode === undefined
        ? {}
        : { gradingMode: grading.mode }),
    ...(courseConfig.reports.student_publish === undefined
      ? {}
      : { studentPublishEnabled: courseConfig.reports.student_publish.enabled }),
    dueAt: assignmentConfig.deadline.due_at,
    points: assignmentConfig.metadata.points,
    sections: assignmentConfig.sections,
    templateRepository: assignmentConfig.template.repository,
    templateBranch: assignmentConfig.template.branch,
    ...(grading.workflow === undefined ? {} : { workflow: grading.workflow })
  };
};

const createBrokenAssignmentSummary = (
  assignmentSlug: string,
  assignmentFile: string,
  diagnostics: Diagnostic[]
): DashboardAssignmentSummary => ({
  slug: assignmentSlug,
  title: assignmentSlug,
  status: STATUS_UNKNOWN,
  gradingEnabled: false,
  assignmentFile,
  applyState: APPLY_STATE_UNKNOWN,
  needsAttention: true,
  diagnostics
});

const withAssignmentGithubResult = (
  assignment: DashboardAssignmentSummary,
  diagnostics: readonly Diagnostic[],
  github: DashboardAssignmentGithubStatus
): DashboardAssignmentSummary => ({
  ...assignment,
  diagnostics: [...diagnostics],
  needsAttention: getAttentionCount(diagnostics) > EMPTY_COUNT,
  github
});

const inspectWorkflowDispatch = (
  assignment: DashboardAssignmentSummary,
  workflowPath: string,
  workflowContent: string
): {
  readonly status: DashboardGithubStatus;
  readonly diagnostics: Diagnostic[];
} => {
  const parseResult = parseYaml(workflowContent, workflowPath);

  if (parseResult.status === "failure") {
    return {
      status: GITHUB_STATUS_ERROR,
      diagnostics: [
        addDiagnosticContext(parseResult.diagnostic, createAssignmentDiagnosticContext(assignment))
      ]
    };
  }

  if (!hasWorkflowDispatchTrigger(parseResult.value)) {
    return {
      status: GITHUB_STATUS_MISSING,
      diagnostics: [createWorkflowDispatchMissingDiagnostic(assignment, workflowPath)]
    };
  }

  return {
    status: GITHUB_STATUS_AVAILABLE,
    diagnostics: []
  };
};

const checkWorkflowReadiness = async (
  cache: DashboardGithubCheckCache,
  githubClient: GitHubClient,
  assignment: DashboardAssignmentSummary,
  owner: string,
  repo: string,
  branch: string,
  currentGithub: DashboardAssignmentGithubStatus,
  diagnostics: readonly Diagnostic[]
): Promise<DashboardAssignmentSummary> => {
  const workflowPath = assignment.workflow;

  if (!assignment.gradingEnabled || workflowPath === undefined) {
    return withAssignmentGithubResult(assignment, diagnostics, {
      ...currentGithub,
      gradingWorkflow: assignment.gradingEnabled
        ? GITHUB_STATUS_NOT_CHECKED
        : GITHUB_STATUS_NOT_REQUIRED,
      workflowDispatch: assignment.gradingEnabled
        ? GITHUB_STATUS_NOT_CHECKED
        : GITHUB_STATUS_NOT_REQUIRED
    });
  }

  try {
    const workflowContent = await getCachedWorkflowFileContent(
      cache,
      githubClient,
      owner,
      repo,
      branch,
      workflowPath
    );

    if (workflowContent === null) {
      const workflowDiagnostics = [
        ...diagnostics,
        createGradingWorkflowMissingDiagnostic(assignment, workflowPath)
      ];

      return withAssignmentGithubResult(assignment, workflowDiagnostics, {
        ...currentGithub,
        gradingWorkflow: GITHUB_STATUS_MISSING,
        workflowDispatch: GITHUB_STATUS_NOT_CHECKED
      });
    }

    const dispatchResult = inspectWorkflowDispatch(assignment, workflowPath, workflowContent);
    const workflowDiagnostics = [...diagnostics, ...dispatchResult.diagnostics];

    return withAssignmentGithubResult(assignment, workflowDiagnostics, {
      ...currentGithub,
      gradingWorkflow: GITHUB_STATUS_AVAILABLE,
      workflowDispatch: dispatchResult.status
    });
  } catch (error) {
    const workflowDiagnostics = [
      ...diagnostics,
      createDashboardGithubRequestDiagnostic(
        error,
        `Could not check grading workflow ${workflowPath}.`,
        {
          ...createAssignmentDiagnosticContext(assignment),
          checkedPath: workflowPath
        }
      )
    ];

    return withAssignmentGithubResult(assignment, workflowDiagnostics, {
      ...currentGithub,
      gradingWorkflow: GITHUB_STATUS_ERROR,
      workflowDispatch: GITHUB_STATUS_ERROR
    });
  }
};

const checkAssignmentGithubReadiness = async (
  cache: DashboardGithubCheckCache,
  githubClient: GitHubClient,
  courseConfig: RawCourseConfig,
  loadedAssignment: LoadedAssignmentSummary
): Promise<LoadedAssignmentSummary> => {
  const assignment = loadedAssignment.summary;
  const github = createDefaultGithubStatus(assignment.gradingEnabled);

  if (loadedAssignment.config === undefined) {
    return {
      ...loadedAssignment,
      summary: withAssignmentGithubResult(assignment, assignment.diagnostics, github)
    };
  }

  const repositoryResult = parseTemplateRepository(
    courseConfig.github.organization,
    loadedAssignment.config.template.repository
  );

  if (repositoryResult.status === "failure") {
    const diagnostics = [
      ...assignment.diagnostics,
      addDiagnosticContext(
        repositoryResult.diagnostic,
        createAssignmentDiagnosticContext(assignment)
      )
    ];

    return {
      ...loadedAssignment,
      summary: withAssignmentGithubResult(assignment, diagnostics, {
        ...github,
        templateRepository: GITHUB_STATUS_ERROR,
        templateBranch: GITHUB_STATUS_ERROR
      })
    };
  }

  const { owner, repo } = repositoryResult.repository;
  const branch = loadedAssignment.config.template.branch;

  try {
    const templateRepository = await getCachedTemplateRepository(cache, githubClient, owner, repo);

    if (templateRepository === null) {
      const diagnostics = [
        ...assignment.diagnostics,
        createTemplateRepositoryMissingDiagnostic(assignment)
      ];

      return {
        ...loadedAssignment,
        summary: withAssignmentGithubResult(assignment, diagnostics, {
          ...github,
          templateRepository: GITHUB_STATUS_MISSING
        })
      };
    }

    if (!hasTemplateBranch(templateRepository, branch)) {
      const diagnostics = [
        ...assignment.diagnostics,
        createTemplateBranchMissingDiagnostic(assignment)
      ];

      return {
        ...loadedAssignment,
        summary: withAssignmentGithubResult(assignment, diagnostics, {
          ...github,
          templateRepository: GITHUB_STATUS_AVAILABLE,
          templateBranch: GITHUB_STATUS_MISSING
        })
      };
    }

    return {
      ...loadedAssignment,
      summary: await checkWorkflowReadiness(
        cache,
        githubClient,
        assignment,
        owner,
        repo,
        branch,
        {
          ...github,
          templateRepository: GITHUB_STATUS_AVAILABLE,
          templateBranch: GITHUB_STATUS_AVAILABLE
        },
        assignment.diagnostics
      )
    };
  } catch (error) {
    const diagnostics = [
      ...assignment.diagnostics,
      createDashboardGithubRequestDiagnostic(error, "Could not check template repository.", {
        ...createAssignmentDiagnosticContext(assignment)
      })
    ];

    return {
      ...loadedAssignment,
      summary: withAssignmentGithubResult(assignment, diagnostics, {
        ...github,
        templateRepository: GITHUB_STATUS_ERROR,
        templateBranch: GITHUB_STATUS_ERROR
      })
    };
  }
};

const loadAssignmentSummary = (
  repoRoot: string,
  courseConfig: RawCourseConfig,
  termSlug: string,
  assignmentSlug: string
): LoadedAssignmentSummary => {
  const assignmentFile = [
    TERMS_DIRECTORY,
    termSlug,
    ASSIGNMENTS_DIRECTORY,
    assignmentSlug,
    ASSIGNMENT_CONFIG_FILE_NAME
  ].join("/");
  const loadResult = loadAssignmentConfig(path.join(repoRoot, assignmentFile));

  if (loadResult.status === "failure") {
    return {
      summary: createBrokenAssignmentSummary(assignmentSlug, assignmentFile, loadResult.diagnostics)
    };
  }

  const diagnostics = validateAssignmentConfig(assignmentFile, loadResult.value, assignmentSlug);

  return {
    config: loadResult.value,
    summary: createAssignmentSummary(
      repoRoot,
      courseConfig,
      loadResult.value,
      assignmentFile,
      assignmentSlug,
      diagnostics
    )
  };
};

const loadAssignmentSummaries = (
  repoRoot: string,
  courseConfig: RawCourseConfig,
  termSlug: string
): LoadedAssignmentSummary[] => {
  const assignmentsDirectory = path.join(
    repoRoot,
    TERMS_DIRECTORY,
    termSlug,
    ASSIGNMENTS_DIRECTORY
  );

  return listDirectoryNames(assignmentsDirectory).map((assignmentSlug) =>
    loadAssignmentSummary(repoRoot, courseConfig, termSlug, assignmentSlug)
  );
};

const createEmptyRosterSummary = (sectionCount: number): DashboardRosterSummary => ({
  sectionCount,
  activeStudentCount: EMPTY_COUNT,
  totalStudentCount: EMPTY_COUNT
});

const getColumnIndexes = (headers: readonly string[]): RosterColumnIndexes => ({
  studentId: headers.indexOf(STUDENT_ID_COLUMN),
  githubUsername: headers.indexOf(GITHUB_USERNAME_COLUMN),
  section: headers.indexOf(SECTION_COLUMN),
  status: headers.indexOf(STATUS_COLUMN)
});

const getValue = (values: readonly string[], index: number): string =>
  index === MISSING_COLUMN_INDEX ? "" : (values[index] ?? "").trim();

const createRosterContext = (
  rosterPath: string,
  rowNumber: number,
  expectedSection: string
): Record<string, unknown> => ({
  rosterPath,
  rowNumber,
  expectedSection
});

const loadRosterStudents = (
  repoRoot: string,
  rosterPath: string,
  expectedSection: string
): {
  readonly students: RosterStudent[];
  readonly diagnostics: Diagnostic[];
} => {
  const fileResult = readTextFile(path.join(repoRoot, rosterPath));

  if (fileResult.status === "failure") {
    return {
      students: [],
      diagnostics: [fileResult.diagnostic]
    };
  }

  const document = parseCsv(fileResult.content);
  const missingColumnErrors = validateRequiredColumns(rosterPath, document.headers);

  if (missingColumnErrors.length > EMPTY_COUNT) {
    return {
      students: [],
      diagnostics: missingColumnErrors
    };
  }

  const indexes = getColumnIndexes(document.headers);
  const students: RosterStudent[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const row of document.rows) {
    const rawStudentId = getValue(row.values, indexes.studentId);
    const rawGithubUsername = getValue(row.values, indexes.githubUsername);
    const rawSection = getValue(row.values, indexes.section);
    const rawStatus = getValue(row.values, indexes.status);
    const valueByColumn = {
      [STUDENT_ID_COLUMN]: rawStudentId,
      [GITHUB_USERNAME_COLUMN]: rawGithubUsername,
      [SECTION_COLUMN]: rawSection,
      [STATUS_COLUMN]: rawStatus
    };
    const missingValueErrors = REQUIRED_ROSTER_COLUMNS.flatMap((column) =>
      valueByColumn[column].length === EMPTY_COUNT
        ? [createMissingRequiredValueDiagnostic(rosterPath, row.rowNumber, column)]
        : []
    );

    if (missingValueErrors.length > EMPTY_COUNT) {
      diagnostics.push(...missingValueErrors);
    } else {
      const rowContext = createRosterContext(rosterPath, row.rowNumber, expectedSection);
      const normalizedStudentId = normalizeStudentId(rawStudentId, rowContext);
      const normalizedGithubUsername = normalizeGithubUsername(rawGithubUsername, rowContext);
      const normalizedStatus = normalizeRosterStatus(rawStatus, rowContext);
      const rowDiagnostics = [
        normalizedStudentId.warning,
        normalizedGithubUsername.warning,
        normalizedStatus.warning,
        ...validateRosterStatus(rosterPath, row.rowNumber, normalizedStatus.value),
        ...validateRosterSection(rosterPath, row.rowNumber, expectedSection, rawSection),
        ...validateGithubUsername(rosterPath, row.rowNumber, normalizedGithubUsername.value)
      ].filter((diagnostic): diagnostic is Diagnostic => diagnostic !== undefined);
      const rowErrors = rowDiagnostics.filter(diagnosticRequiresAttention);

      diagnostics.push(...rowDiagnostics);

      if (rowErrors.length === EMPTY_COUNT && isRosterStatus(normalizedStatus.value)) {
        students.push({
          studentId: normalizedStudentId.value,
          githubUsername: normalizedGithubUsername.value,
          section: rawSection,
          status: normalizedStatus.value,
          rosterPath,
          rowNumber: row.rowNumber
        });
      }
    }
  }

  return {
    students,
    diagnostics
  };
};

const loadRosterSummary = (
  repoRoot: string,
  termSlug: string,
  termConfig: RawTermConfig | undefined
): {
  readonly roster: DashboardRosterSummary;
  readonly diagnostics: Diagnostic[];
} => {
  if (termConfig === undefined) {
    return {
      roster: createEmptyRosterSummary(EMPTY_COUNT),
      diagnostics: []
    };
  }

  const loadedRosters = termConfig.sections.map((section) =>
    loadRosterStudents(repoRoot, [TERMS_DIRECTORY, termSlug, section.roster].join("/"), section.id)
  );
  const students = loadedRosters.flatMap((roster) => roster.students);
  const diagnostics = [
    ...loadedRosters.flatMap((roster) => roster.diagnostics),
    ...validateRosterDuplicates(students)
  ];

  return {
    roster: {
      sectionCount: termConfig.sections.length,
      activeStudentCount: students.filter((student) => student.status === ROSTER_STATUS_ACTIVE)
        .length,
      totalStudentCount: students.length
    },
    diagnostics
  };
};

const getTermTitle = (term: LoadedTerm): string => term.config?.term.display_name ?? term.termSlug;

const getCardStatus = (assignments: readonly DashboardAssignmentSummary[]): string => {
  if (assignments.some((assignment) => assignment.status === STATUS_ACTIVE)) {
    return STATUS_ACTIVE;
  }

  if (assignments.some((assignment) => assignment.status === STATUS_COMPLETED)) {
    return STATUS_COMPLETED;
  }

  return STATUS_INACTIVE;
};

const buildCard = async (
  repoRoot: string,
  githubClient: GitHubClient,
  githubCache: DashboardGithubCheckCache,
  courseConfig: RawCourseConfig,
  courseDiagnostics: readonly Diagnostic[],
  term: LoadedTerm
): Promise<DashboardCard> => {
  const loadedAssignments = loadAssignmentSummaries(repoRoot, courseConfig, term.termSlug);
  const checkedAssignments = await Promise.all(
    loadedAssignments.map((loadedAssignment) =>
      checkAssignmentGithubReadiness(githubCache, githubClient, courseConfig, loadedAssignment)
    )
  );
  const assignments = checkedAssignments.map((loadedAssignment) => loadedAssignment.summary);
  const sortedAssignments = [...assignments].sort(compareRecentAssignments);
  const recentAssignments = assignments
    .filter(shouldIncludeAssignment)
    .sort(compareRecentAssignments)
    .slice(EMPTY_COUNT, DEFAULT_RECENT_ASSIGNMENT_LIMIT);
  const rosterResult = loadRosterSummary(repoRoot, term.termSlug, term.config);
  const assignmentDiagnostics = assignments.flatMap((assignment) => assignment.diagnostics);
  const diagnostics = [
    ...courseDiagnostics,
    ...term.diagnostics,
    ...rosterResult.diagnostics,
    ...assignmentDiagnostics
  ];
  const attentionCount = getAttentionCount(diagnostics);
  const courseSlug = courseConfig.course.code;

  return {
    kind: "course-term",
    displayName: `${term.termSlug}-${courseSlug}`,
    courseSlug,
    courseTitle: courseConfig.course.title,
    coursePath: COURSE_PATH,
    termSlug: term.termSlug,
    termTitle: getTermTitle(term),
    status: getCardStatus(assignments),
    needsAttention: attentionCount > EMPTY_COUNT,
    attentionCount,
    roster: rosterResult.roster,
    assignmentCount: assignments.length,
    assignments: sortedAssignments,
    recentAssignments,
    diagnostics
  };
};

const determineStatus = (
  diagnostics: readonly Diagnostic[],
  cards: readonly DashboardCard[]
): DashboardStatus => {
  const hasErrors = diagnostics.some(diagnosticRequiresAttention);

  if (cards.length === EMPTY_COUNT && hasErrors) {
    return "failure";
  }

  return hasErrors ? "partial_success" : "success";
};

export const buildDashboard = async ({
  cwd,
  githubClient,
  term
}: BuildDashboardInput): Promise<DashboardResult> => {
  const courseResult = loadCourse(cwd);

  if (!("config" in courseResult)) {
    return createEmptyDashboardResult("failure", courseResult.diagnostics);
  }

  const discoveredTermSlugs = discoverTermSlugs(courseResult.repoRoot, term);

  if (term !== undefined && discoveredTermSlugs.length === EMPTY_COUNT) {
    return createEmptyDashboardResult("failure", [createTermNotFoundDiagnostic(term)]);
  }

  const terms = discoveredTermSlugs.map((termSlug) => loadTerm(courseResult.repoRoot, termSlug));
  const githubCache = createGitHubCheckCache();
  const cards = await Promise.all(
    terms.map((loadedTerm) =>
      buildCard(
        courseResult.repoRoot,
        githubClient,
        githubCache,
        courseResult.config,
        courseResult.diagnostics,
        loadedTerm
      )
    )
  );
  const diagnostics = cards.flatMap((card) => card.diagnostics);
  const status = determineStatus(diagnostics, cards);

  return createDashboardResult(status, diagnostics, cards);
};
