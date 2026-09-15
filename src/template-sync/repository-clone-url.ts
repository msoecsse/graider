import { parseTemplateRepository } from "../config/github-config-validation.js";
import type { ManifestRepositoryIdentity } from "../manifest/manifest-models.js";

export type RepositoryCloneUrlResult =
  | { status: "success"; cloneUrl: string }
  | { status: "failure"; message: string };

const toCloneUrl = (owner: string, repo: string): string => `git@github.com:${owner}/${repo}.git`;

export const resolveTemplateCloneUrl = (
  configuredOrganization: string,
  templateRepository: string
): RepositoryCloneUrlResult => {
  const parsed = parseTemplateRepository(configuredOrganization, templateRepository);
  return parsed.status === "success"
    ? { status: "success", cloneUrl: toCloneUrl(parsed.repository.owner, parsed.repository.repo) }
    : { status: "failure", message: parsed.diagnostic.message };
};

export const resolveStudentCloneUrl = (
  repository: Pick<ManifestRepositoryIdentity, "owner" | "name">
): RepositoryCloneUrlResult =>
  repository.owner.trim().length === 0 || repository.name.trim().length === 0
    ? { status: "failure", message: "Student repository owner and name are required." }
    : { status: "success", cloneUrl: toCloneUrl(repository.owner, repository.name) };
