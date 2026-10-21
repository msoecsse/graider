import type { GitHubClient } from "./github-client.js";
import type { GitHubRepository } from "./github-models.js";

/** A failed create response is inconclusive; only an exact usable observation can replace it. */
export const reconcileRepositoryCreation = async (
  githubClient: GitHubClient,
  owner: string,
  name: string,
  create: () => Promise<GitHubRepository>
): Promise<GitHubRepository> => {
  try {
    return await create();
  } catch (creationError: unknown) {
    try {
      const repository = await githubClient.getRepository(owner, name);
      if (
        repository !== null &&
        repository.owner.toLowerCase() === owner.toLowerCase() &&
        repository.name.toLowerCase() === name.toLowerCase() &&
        repository.fullName.toLowerCase() === `${owner}/${name}`.toLowerCase() &&
        repository.private &&
        !repository.archived &&
        repository.id > 0 &&
        repository.defaultBranch.length > 0 &&
        repository.htmlUrl.length > 0
      )
        return repository;
    } catch {
      // An unsuccessful observation cannot disprove the original failure.
    }
    throw creationError;
  }
};
