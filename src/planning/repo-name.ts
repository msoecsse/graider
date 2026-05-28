import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/gu;
const REPOSITORY_NAME_PATTERN = /^[a-z0-9-]+$/u;
const HYPHEN = "-";
const CONSECUTIVE_HYPHENS = "--";
const EMPTY_LENGTH = 0;

enum RepositoryNameLimit {
  MaxLength = 100
}

const getMaxRepositoryNameLength = (): number => RepositoryNameLimit.MaxLength;

const REQUIRED_PLACEHOLDERS = ["term", "course", "assignment", "github_username"] as const;
const LEGACY_STUDENT_PLACEHOLDER = "student";
const GITHUB_USERNAME_PLACEHOLDER = "github_username";

type RequiredPlaceholder = (typeof REQUIRED_PLACEHOLDERS)[number];
type SupportedPlaceholder = RequiredPlaceholder | typeof LEGACY_STUDENT_PLACEHOLDER;

export interface RepositoryNameInput {
  pattern: string;
  termCode: string;
  courseCode: string;
  assignmentSlug: string;
  githubUsername: string;
}

export interface RepositoryNameResult {
  repositoryName?: string;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

interface RepositoryNameValidationResult {
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

const createRepositoryNameError = (name: string, reason: string): Diagnostic =>
  createConfigDiagnostic(
    DiagnosticCode.InvalidRepositoryName,
    `Invalid repository name ${name}: ${reason}.`,
    {
      repositoryName: name,
      reason
    }
  );

const isKnownPlaceholder = (placeholder: string): placeholder is SupportedPlaceholder =>
  REQUIRED_PLACEHOLDERS.some((requiredPlaceholder) => requiredPlaceholder === placeholder) ||
  placeholder === LEGACY_STUDENT_PLACEHOLDER;

const extractPlaceholders = (pattern: string): string[] =>
  Array.from(pattern.matchAll(PLACEHOLDER_PATTERN), (match) => match[1] ?? "");

const normalizePlaceholders = (placeholders: readonly string[]): string[] =>
  placeholders.map((placeholder) =>
    placeholder === LEGACY_STUDENT_PLACEHOLDER ? GITHUB_USERNAME_PLACEHOLDER : placeholder
  );

const getUnknownPlaceholderErrors = (placeholders: readonly string[]): Diagnostic[] =>
  placeholders
    .filter((placeholder) => !isKnownPlaceholder(placeholder))
    .map((placeholder) =>
      createConfigDiagnostic(
        DiagnosticCode.RepoNamePatternUnknownPlaceholder,
        `Unknown repository name pattern placeholder ${placeholder}.`,
        {
          placeholder
        }
      )
    );

const getMissingPlaceholderErrors = (placeholders: readonly string[]): Diagnostic[] => {
  const normalizedPlaceholders = normalizePlaceholders(placeholders);

  return REQUIRED_PLACEHOLDERS.filter(
    (requiredPlaceholder) => !normalizedPlaceholders.includes(requiredPlaceholder)
  ).map((placeholder) =>
    createConfigDiagnostic(
      DiagnosticCode.RepoNamePatternMissingPlaceholder,
      `Repository name pattern is missing required placeholder ${placeholder}.`,
      {
        placeholder
      }
    )
  );
};

const getPlaceholderValues = (
  input: RepositoryNameInput
): Record<SupportedPlaceholder, string> => ({
  term: input.termCode.toLowerCase(),
  course: input.courseCode.toLowerCase(),
  assignment: input.assignmentSlug.toLowerCase(),
  github_username: input.githubUsername.toLowerCase(),
  student: input.githubUsername.toLowerCase()
});

const replacePlaceholders = (input: RepositoryNameInput): string => {
  const values = getPlaceholderValues(input);

  return input.pattern.replace(PLACEHOLDER_PATTERN, (_, placeholder: string): string =>
    isKnownPlaceholder(placeholder) ? values[placeholder] : `{${placeholder}}`
  );
};

export const validateRepositoryName = (repositoryName: string): RepositoryNameValidationResult => {
  const errors = [
    ...(repositoryName.length === EMPTY_LENGTH
      ? [createRepositoryNameError(repositoryName, "repository name must not be empty")]
      : []),
    ...(repositoryName.length > getMaxRepositoryNameLength()
      ? [
          createRepositoryNameError(
            repositoryName,
            `repository name must be at most ${String(getMaxRepositoryNameLength())} characters`
          )
        ]
      : []),
    ...(repositoryName !== repositoryName.toLowerCase()
      ? [createRepositoryNameError(repositoryName, "repository name must be lowercase")]
      : []),
    ...(REPOSITORY_NAME_PATTERN.test(repositoryName)
      ? []
      : [
          createRepositoryNameError(
            repositoryName,
            "repository name may contain only lowercase letters, digits, and hyphens"
          )
        ]),
    ...(repositoryName.startsWith(HYPHEN)
      ? [createRepositoryNameError(repositoryName, "repository name must not start with a hyphen")]
      : []),
    ...(repositoryName.endsWith(HYPHEN)
      ? [createRepositoryNameError(repositoryName, "repository name must not end with a hyphen")]
      : []),
    ...(repositoryName.includes(CONSECUTIVE_HYPHENS)
      ? [
          createRepositoryNameError(
            repositoryName,
            "repository name must not contain consecutive hyphens"
          )
        ]
      : [])
  ];

  return {
    warnings: [],
    errors
  };
};

export const generateRepositoryName = (input: RepositoryNameInput): RepositoryNameResult => {
  const placeholders = extractPlaceholders(input.pattern);
  const patternErrors = [
    ...getUnknownPlaceholderErrors(placeholders),
    ...getMissingPlaceholderErrors(placeholders)
  ];

  if (patternErrors.length > EMPTY_LENGTH) {
    return {
      warnings: [],
      errors: patternErrors
    };
  }

  const repositoryName = replacePlaceholders(input).toLowerCase();
  const validationResult = validateRepositoryName(repositoryName);

  if (validationResult.errors.length > EMPTY_LENGTH) {
    return validationResult;
  }

  return {
    repositoryName,
    warnings: [],
    errors: []
  };
};
