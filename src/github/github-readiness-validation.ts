import type {
  RawAssignmentConfig,
  RawCourseConfig,
  RawTermConfig
} from "../config/config-models.js";
import { parseTemplateRepository } from "../config/github-config-validation.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { RosterStudent } from "../roster/roster-models.js";
import type { GitHubClient } from "./github-client.js";
import { GitHubClientError, createGitHubDiagnostic } from "./github-errors.js";
import type { GitHubTemplateRepository } from "./github-models.js";

const README_FILE = "README.md";
const EMPTY_COUNT = 0;

export interface GitHubReadinessValidationInput {
  courseConfig: RawCourseConfig;
  termConfig: RawTermConfig;
  assignmentConfig: RawAssignmentConfig;
  students: RosterStudent[];
  githubClient: GitHubClient;
}

export interface GitHubReadinessValidationResult {
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

interface TemplateRepositoryReference {
  owner: string;
  repo: string;
  fullName: string;
  branch: string;
  organization: string;
}

const createUnexpectedGitHubDiagnostic = (): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.GithubApiError,
    "Unexpected GitHub client failure during readiness validation."
  );

const normalizeGitHubError = (error: unknown): Diagnostic =>
  error instanceof GitHubClientError
    ? createGitHubDiagnostic(error)
    : createUnexpectedGitHubDiagnostic();

const validateAuthentication = async (githubClient: GitHubClient): Promise<Diagnostic[]> => {
  try {
    await githubClient.getAuthenticatedUser();

    return [];
  } catch (error: unknown) {
    return [normalizeGitHubError(error)];
  }
};

const createTemplateOutsideOrgDiagnostic = (reference: TemplateRepositoryReference): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.TemplateRepositoryOutsideOrg,
    `Template repository ${reference.fullName} must belong to GitHub organization ${reference.organization}.`,
    {
      repository: reference.fullName,
      organization: reference.organization
    }
  );

const createTemplateMissingDiagnostic = (reference: TemplateRepositoryReference): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.TemplateRepositoryMissing,
    `Template repository ${reference.fullName} was not found.`,
    {
      repository: reference.fullName,
      organization: reference.organization
    }
  );

const createTemplateNotTemplateDiagnostic = (reference: TemplateRepositoryReference): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.TemplateRepositoryNotTemplate,
    `Template repository ${reference.fullName} is not marked as a template.`,
    {
      repository: reference.fullName
    }
  );

const createTemplateBranchMissingDiagnostic = (
  reference: TemplateRepositoryReference
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.TemplateBranchMissing,
    `Template repository ${reference.fullName} does not contain branch ${reference.branch}.`,
    {
      repository: reference.fullName,
      templateBranch: reference.branch
    }
  );

const createTemplateBranchNotDefaultDiagnostic = (
  reference: TemplateRepositoryReference,
  templateRepository: GitHubTemplateRepository
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.TemplateBranchNotDefault,
    `Template branch ${reference.branch} must be the default branch for ${reference.fullName}.`,
    {
      repository: reference.fullName,
      templateBranch: reference.branch,
      expectedDefaultBranch: reference.branch,
      actualDefaultBranch: templateRepository.defaultBranch
    }
  );

const createTemplateReadmeMissingDiagnostic = (
  reference: TemplateRepositoryReference
): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.TemplateReadmeMissing,
    `Template repository ${reference.fullName} must contain ${README_FILE}.`,
    {
      repository: reference.fullName,
      requiredFile: README_FILE
    }
  );

const validateTemplateRepositoryFields = (
  reference: TemplateRepositoryReference,
  templateRepository: GitHubTemplateRepository
): Diagnostic[] => [
  ...(templateRepository.isTemplate ? [] : [createTemplateNotTemplateDiagnostic(reference)]),
  ...(templateRepository.branches.includes(reference.branch)
    ? []
    : [createTemplateBranchMissingDiagnostic(reference)]),
  ...(templateRepository.defaultBranch === reference.branch
    ? []
    : [createTemplateBranchNotDefaultDiagnostic(reference, templateRepository)]),
  ...(templateRepository.files.includes(README_FILE)
    ? []
    : [createTemplateReadmeMissingDiagnostic(reference)])
];

const validateTemplateRepository = async (
  courseConfig: RawCourseConfig,
  assignmentConfig: RawAssignmentConfig,
  githubClient: GitHubClient
): Promise<Diagnostic[]> => {
  const parsedRepository = parseTemplateRepository(
    courseConfig.github.organization,
    assignmentConfig.template.repository
  );

  if (parsedRepository.status === "failure") {
    return [parsedRepository.diagnostic];
  }

  const reference = {
    ...parsedRepository.repository,
    branch: assignmentConfig.template.branch,
    organization: courseConfig.github.organization
  };

  if (reference.owner !== reference.organization) {
    return [createTemplateOutsideOrgDiagnostic(reference)];
  }

  try {
    const templateRepository = await githubClient.getTemplateRepository(
      reference.owner,
      reference.repo
    );

    if (templateRepository === null) {
      return [createTemplateMissingDiagnostic(reference)];
    }

    if (templateRepository.owner !== reference.organization) {
      return [createTemplateOutsideOrgDiagnostic(reference)];
    }

    return validateTemplateRepositoryFields(reference, templateRepository);
  } catch (error: unknown) {
    return [normalizeGitHubError(error)];
  }
};

const createTeamMissingDiagnostic = (
  code: string,
  label: string,
  organization: string,
  teamSlug: string
): Diagnostic =>
  createConfigDiagnostic(code, `${label} team ${teamSlug} was not found in ${organization}.`, {
    organization,
    teamSlug
  });

const validateTeam = async (
  githubClient: GitHubClient,
  organization: string,
  teamSlug: string,
  code: string,
  label: string
): Promise<Diagnostic[]> => {
  try {
    const team = await githubClient.getTeam(organization, teamSlug);

    return team === null ? [createTeamMissingDiagnostic(code, label, organization, teamSlug)] : [];
  } catch (error: unknown) {
    return [normalizeGitHubError(error)];
  }
};

const validateTeams = async (
  courseConfig: RawCourseConfig,
  githubClient: GitHubClient
): Promise<Diagnostic[]> => {
  const organization = courseConfig.github.organization;
  const facultyTeamErrors = await validateTeam(
    githubClient,
    organization,
    courseConfig.github.faculty_team,
    DiagnosticCode.FacultyTeamMissing,
    "Faculty"
  );
  const graderTeamErrors = await validateTeam(
    githubClient,
    organization,
    courseConfig.github.grader_team,
    DiagnosticCode.GraderTeamMissing,
    "Grader"
  );

  return [...facultyTeamErrors, ...graderTeamErrors];
};

const createMissingUserDiagnostic = (student: RosterStudent): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.GithubUserMissing,
    `GitHub user ${student.githubUsername} was not found for student ${student.studentId}.`,
    {
      student_id: student.studentId,
      github_username: student.githubUsername,
      section: student.section,
      status: student.status,
      rosterPath: student.rosterPath,
      rowNumber: student.rowNumber
    }
  );

const validateGithubUser = async (
  githubClient: GitHubClient,
  student: RosterStudent
): Promise<Diagnostic[]> => {
  try {
    const user = await githubClient.getUser(student.githubUsername);

    return user === null ? [createMissingUserDiagnostic(student)] : [];
  } catch (error: unknown) {
    return [normalizeGitHubError(error)];
  }
};

const validateGithubUsers = async (
  githubClient: GitHubClient,
  students: readonly RosterStudent[]
): Promise<Diagnostic[]> => {
  const diagnostics: Diagnostic[] = [];

  for (const student of students) {
    diagnostics.push(...(await validateGithubUser(githubClient, student)));
  }

  return diagnostics;
};

export const validateGitHubReadiness = async ({
  courseConfig,
  assignmentConfig,
  students,
  githubClient
}: GitHubReadinessValidationInput): Promise<GitHubReadinessValidationResult> => {
  const authenticationErrors = await validateAuthentication(githubClient);

  if (authenticationErrors.length > EMPTY_COUNT) {
    return {
      warnings: [],
      errors: authenticationErrors
    };
  }

  const errors = [
    ...(await validateTemplateRepository(courseConfig, assignmentConfig, githubClient)),
    ...(await validateTeams(courseConfig, githubClient)),
    ...(await validateGithubUsers(githubClient, students))
  ];

  return {
    warnings: [],
    errors
  };
};
