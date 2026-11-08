import type { GitHubClient } from "../github/github-client.js";
import { loadCourseConfig, parseCourseConfig } from "../config/load-course-config.js";
import { validateCourseConfig } from "../config/config-validation.js";
import path from "node:path";

/** Production CLI safety boundary. Local Schema 1 is never compatibility evidence for the remote. */
interface LegacyCourseRequest {
  readonly root: string;
  readonly client: GitHubClient;
  readonly remoteUrl: string;
  readonly localRevision: string;
}
export const assertAuthoritativeLegacyCourse = async (
  request: LegacyCourseRequest
): Promise<{
  readonly userId: number;
  readonly repositoryId: number;
  readonly revision: string;
}> => {
  const refuse = (): never => {
    throw new Error(
      "Course mutation unavailable: synchronize authoritative Schema 1 metadata or use a supported managed Schema 2 operation. No operation was started."
    );
  };
  const local = loadCourseConfig(path.join(request.root, "course.yml"));
  if (local.status !== "success" || local.value.schema_version !== 1) return refuse();
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/u.exec(
      request.remoteUrl
    );
  const owner = match?.[1];
  const name = match?.[2];
  if (
    !owner ||
    !name ||
    owner.toLowerCase() !== local.value.github.organization.toLowerCase() ||
    name.toLowerCase() !== local.value.course.repository.toLowerCase()
  )
    return refuse();
  const identity = await request.client.getAuthenticatedUser();
  const repository = await request.client.getRepository(owner, name);
  if (
    typeof identity.id !== "number" ||
    !Number.isSafeInteger(identity.id) ||
    !repository ||
    repository.archived
  )
    return refuse();
  const revision = await request.client.getDefaultBranchCommitSha(owner, name);
  if (!revision || revision !== request.localRevision) return refuse();
  const bytes = await request.client.getRepositoryFileContent(owner, name, "course.yml", revision);
  if (bytes === null) return refuse();
  const authoritative = parseCourseConfig(bytes, "authoritative course.yml");
  if (
    authoritative.status !== "success" ||
    authoritative.value.schema_version !== 1 ||
    validateCourseConfig("authoritative course.yml", authoritative.value).length ||
    authoritative.value.github.organization.toLowerCase() !== owner.toLowerCase() ||
    authoritative.value.course.repository.toLowerCase() !== name.toLowerCase()
  )
    refuse();
  if (
    (await request.client.getDefaultBranchCommitSha(owner, name)) !== revision ||
    (await request.client.getAuthenticatedUser()).id !== identity.id
  )
    refuse();
  return { userId: identity.id, repositoryId: repository.id, revision };
};

let productionBoundary: (() => Promise<void>) | undefined;
/** Installed only by the CLI after fresh remote validation, never from serialized support assertions. */
export const beginAuthoritativeLegacyCliMutation = async (
  request: LegacyCourseRequest
): Promise<void> => {
  productionBoundary = undefined;
  const binding = await assertAuthoritativeLegacyCourse(request);
  productionBoundary = async () => {
    const fresh = await assertAuthoritativeLegacyCourse(request);
    if (
      fresh.userId !== binding.userId ||
      fresh.repositoryId !== binding.repositoryId ||
      fresh.revision !== binding.revision
    )
      throw new Error("Course account, repository or revision changed. Refresh before mutation.");
  };
};
export const endAuthoritativeLegacyCliMutation = (): void => {
  productionBoundary = undefined;
};

export const GITHUB_MUTATION_METHODS: readonly (keyof GitHubClient)[] = Object.freeze([
  "createRepositoryFromTemplate",
  "createRepository",
  "addCollaborator",
  "removeCollaborator",
  "addTeamPermission",
  "enableActions",
  "conditionalWriteRepositoryFile",
  "dispatchWorkflow",
  "archiveRepository",
  "writeRepositoryFile",
  "createPullRequest",
  "deleteRepositoryBranch",
  "createOrganizationInvitation",
  "createManagedTeam",
  "setManagedTeamMembership",
  "setCourseRepositoryTeamPermission",
  "setCourseFallbackPermission",
  "createManagedBranchRule",
  "tightenManagedBranchRule",
  "setCourseRepositoryTopic"
]);
/** Every production GitHub write re-observes the exact source and account, including after planning awaits. */
export const guardProductionLegacyClient = (client: GitHubClient): GitHubClient => {
  const boundary = productionBoundary;
  if (!boundary) return client;
  return new Proxy(client, {
    get(target, key) {
      const method = target[key as keyof GitHubClient];
      if (typeof method !== "function") return method;
      return GITHUB_MUTATION_METHODS.includes(key as keyof GitHubClient)
        ? async (...args: unknown[]) => {
            await boundary();
            const result: unknown = await Reflect.apply(method, target, args);
            return result;
          }
        : method.bind(target);
    }
  });
};
