import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

const TEMPLATE_REPOSITORY_SEGMENTS = 2;

export interface ParsedTemplateRepository {
  owner: string;
  repo: string;
  fullName: string;
}

export type TemplateRepositoryParseResult =
  | {
      status: "success";
      repository: ParsedTemplateRepository;
    }
  | {
      status: "failure";
      diagnostic: Diagnostic;
    };

const hasBlankSegment = (segments: readonly string[]): boolean =>
  segments.some((segment) => segment.trim().length === 0);

export const parseTemplateRepository = (
  configuredOrganization: string,
  repository: string
): TemplateRepositoryParseResult => {
  const segments = repository.split("/");

  if (segments.length === TEMPLATE_REPOSITORY_SEGMENTS && !hasBlankSegment(segments)) {
    const [owner, repo] = segments as [string, string];

    return {
      status: "success",
      repository: {
        owner,
        repo,
        fullName: `${owner}/${repo}`
      }
    };
  }

  return {
    status: "failure",
    diagnostic: createConfigDiagnostic(
      DiagnosticCode.InvalidTemplateRepository,
      `Template repository ${repository} must be specified as owner/repo.`,
      {
        repository,
        organization: configuredOrganization
      }
    )
  };
};
