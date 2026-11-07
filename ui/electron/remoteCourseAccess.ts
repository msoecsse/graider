import type { CourseRepository, RemoteRepositoryReader } from "./githubRemoteRepositories.js";
import { loadMetadata } from "./remoteCourseDiscovery.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";

/** Exact remote metadata observation, never a managed-cache authorization assertion. */
export const readRemoteCourseAccess = async (
  reader: RemoteRepositoryReader,
  repo: CourseRepository,
  userId: number,
  username: string | null,
  metadata = loadMetadata()
) => {
  const revision = await reader.revision(repo);
  const content = await reader.file(repo, "course.yml", revision);
  if (content === null) return { status: "missing_metadata" as const, revision };
  const course = metadata.inspectCourse(content ?? "");
  if (course.status !== "valid") return { ...course, revision };
  // Schema 1 identity-required discovery preserves its existing no-term-read behavior.
  let enumerationFailed = false;
  const codes =
    course.schemaVersion === 1 && username === null
      ? []
      : await reader.terms(repo, revision).catch((error: unknown) => {
          if (error instanceof GithubOAuthError && error.code === "invalid_credential") throw error;
          enumerationFailed = true;
          return [];
        });
  const terms: Record<string, string | null> = {};
  for (const code of codes) {
    try {
      terms[code] = await reader.file(repo, `terms/${code}/term.yml`, revision);
    } catch (error) {
      if (error instanceof GithubOAuthError && error.code === "invalid_credential") throw error;
      terms[code] = null;
    }
  }
  const access = metadata.inspectAccess(content!, terms, {
    userId,
    username,
    repositoryId: repo.id,
    organizationId: repo.organizationId,
    organizationLogin: repo.owner
  });
  if ((await reader.revision(repo)) !== revision)
    throw new Error("Authoritative course changed during metadata validation.");
  if (enumerationFailed && course.schemaVersion !== 1)
    return { status: "invalid_metadata" as const, revision };
  return access.status === "valid"
    ? {
        ...access,
        ...(enumerationFailed ? { incomplete: true, authorization: "unavailable" as const } : {}),
        course,
        content: content!,
        termContents: terms,
        revision
      }
    : { ...access, revision };
};
