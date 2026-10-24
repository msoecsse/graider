import fs from "node:fs";
import path from "node:path";
import type { CourseFolderRecord } from "./ipc.js";
import type { GithubOrganization } from "./githubOAuthTypes.js";
import {
  REPOSITORY_FAILURE_MESSAGES,
  type CourseRepository,
  type RemoteRepositoryReader
} from "./githubRemoteRepositories.js";
import type {
  CourseAuthorization,
  CourseDiscoveryDiagnostic,
  RemoteCourse,
  RemoteCourseDiscovery
} from "./remoteCourseTypes.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";
import {
  getProductionGitWorkspaceFactory,
  type GitWorkspaceInspectionFactory
} from "./gitWorkspaceReader.js";
import type * as Metadata from "../dist-electron/remoteCourseMetadataBackend.cjs";

export const DISCOVERY_CONCURRENCY = 4;
const loadMetadata = (): typeof Metadata =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "remoteCourseMetadataBackend.cjs"
    )
  ) as typeof Metadata;
/** Fixed worker pool: metadata requests never scale with student repository count. */
export const mapBounded = async <T, R>(
  values: readonly T[],
  read: (value: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(DISCOVERY_CONCURRENCY, values.length) }, async () => {
      let index = next++;
      while (index < values.length) {
        results[index] = await read(values[index]);
        index = next++;
      }
    })
  );
  return results;
};
export const parseGithubOrigin = (
  origin: string | null
): { owner: string; name: string } | null => {
  const match = origin?.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i
  );
  return match && match[2] !== "." && match[2] !== ".."
    ? { owner: match[1], name: match[2] }
    : null;
};
export interface LocalCourseOrigin {
  readonly folderId: string;
  readonly configuredCourse?: { organization: string; code: string } | null;
  readonly origin: { owner: string; name: string } | null;
}
export const inspectLocalCourseOrigins = async (
  folders: readonly CourseFolderRecord[],
  factory: GitWorkspaceInspectionFactory = getProductionGitWorkspaceFactory()
): Promise<LocalCourseOrigin[]> =>
  mapBounded(folders, async (folder) => {
    let configuredCourse: LocalCourseOrigin["configuredCourse"] = null;
    try {
      const course = loadMetadata().inspectCourse(
        fs.readFileSync(path.join(folder.path, "course.yml"), "utf8")
      );
      if (course.status === "valid")
        configuredCourse = { organization: course.organization, code: course.code };
    } catch {
      /* An unreadable local config cannot establish a bridge. */
    }
    try {
      const workspace = await factory.open(folder.path);
      // An enclosing repository must not accidentally claim a nested registered folder.
      return {
        folderId: folder.id,
        configuredCourse,
        origin:
          path.resolve(workspace.root) === path.resolve(folder.path)
            ? parseGithubOrigin(await workspace.remoteUrl("origin"))
            : null
      };
    } catch {
      return { folderId: folder.id, configuredCourse, origin: null };
    }
  });
interface Request {
  readonly userId: number;
  readonly organizations: readonly GithubOrganization[];
  readonly username: string | null;
  readonly locals: readonly LocalCourseOrigin[];
  readonly reader: RemoteRepositoryReader;
  readonly metadata?: typeof Metadata;
}
const diagnostic = (
  organizationId: number,
  error: unknown,
  repositoryId?: number
): CourseDiscoveryDiagnostic => {
  const code =
    error instanceof GithubOAuthError && Object.hasOwn(REPOSITORY_FAILURE_MESSAGES, error.code)
      ? (error.code as keyof typeof REPOSITORY_FAILURE_MESSAGES)
      : "error";
  return {
    organizationId,
    ...(repositoryId === undefined ? {} : { repositoryId }),
    status: code,
    message: REPOSITORY_FAILURE_MESSAGES[code]
  };
};
const nameHint = (repo: CourseRepository): boolean =>
  repo.name.toLowerCase() === repo.owner.toLowerCase() ||
  /^(?:[a-z]{2,8}[-_]?\d{3,4}|course[-_]admin|graider[-_]course)$/i.test(repo.name) ||
  /[-_](?:course[-_]admin|graider|admin)$/i.test(repo.name);

/** Consumes only the Phase 2.2 access model and a read-only adapter facade. */
export const discoverRemoteCourses = async (request: Request): Promise<RemoteCourseDiscovery> => {
  const { reader, locals } = request;
  const metadata = request.metadata ?? loadMetadata();
  const diagnostics: CourseDiscoveryDiagnostic[] = [];
  const courses = new Map<number, RemoteCourse>();
  const resolvedOrigins = new Map<string, Promise<CourseRepository | null>>();
  const resolveOrigin = (owner: string, name: string): Promise<CourseRepository | null> => {
    const key = `${owner}/${name}`.toLowerCase();
    let result = resolvedOrigins.get(key);
    if (!result) {
      result = reader.resolve(owner, name);
      resolvedOrigins.set(key, result);
    }
    return result;
  };
  // Organizations are sequential; the candidate worker pool is the global request bound.
  for (const org of request.organizations) {
    if (org.accessStatus === "accessible" && org.membershipState === "active") {
      try {
        const listed = (await reader.list(org.login)).filter(
          (repo) =>
            repo.organizationId === org.organizationId &&
            repo.owner.toLowerCase() === org.login.toLowerCase()
        );
        const repos = new Map(listed.map((repo) => [repo.id, repo]));
        const localIds = new Map<string, number>();
        const knownIds = new Set<number>();
        // Resolve old locators through GitHub for immutable-ID reconciliation after renames.
        for (const local of locals.filter(
          (value) => value.origin?.owner.toLowerCase() === org.login.toLowerCase()
        )) {
          if (local.origin) {
            try {
              const resolved = await resolveOrigin(local.origin.owner, local.origin.name);
              if (resolved && resolved.organizationId === org.organizationId) {
                repos.set(resolved.id, resolved);
                knownIds.add(resolved.id);
                localIds.set(local.folderId, resolved.id);
              } else if (resolved) {
                diagnostics.push({
                  organizationId: org.organizationId,
                  status: "migration_required",
                  message:
                    "A registered course repository moved organizations. Manual reconciliation is required."
                });
              }
            } catch (error) {
              diagnostics.push(diagnostic(org.organizationId, error));
            }
          }
        }
        const searchIds = new Set<number>();
        try {
          const search = await reader.search(org.login);
          for (const id of search.ids) searchIds.add(id);
          if (search.incomplete)
            diagnostics.push({
              organizationId: org.organizationId,
              status: "search_incomplete",
              message:
                "Legacy course search was incomplete. Topic, naming and local-origin candidates were still checked."
            });
        } catch (error) {
          diagnostics.push(diagnostic(org.organizationId, error));
        }
        const candidates = [...repos.values()]
          .filter(
            (repo) =>
              repo.topics.includes("graider-course") ||
              nameHint(repo) ||
              knownIds.has(repo.id) ||
              searchIds.has(repo.id)
          )
          .sort(
            (a, b) =>
              Number(b.topics.includes("graider-course")) -
              Number(a.topics.includes("graider-course"))
          );
        const valid = (
          await mapBounded(candidates, async (repo): Promise<RemoteCourse | null> => {
            try {
              if (repo.disabled)
                throw new GithubOAuthError(
                  "repository_inaccessible",
                  "Candidate course repository is disabled."
                );
              const content = await reader.file(repo, "course.yml");
              if (content === null) {
                diagnostics.push({
                  organizationId: org.organizationId,
                  repositoryId: repo.id,
                  status: "missing_metadata",
                  message: "A course discovery hint did not contain root course.yml."
                });
                return null;
              }
              const course = metadata.inspectCourse(content);
              if (course.status !== "valid") {
                diagnostics.push({
                  organizationId: org.organizationId,
                  repositoryId: repo.id,
                  status: course.status,
                  message:
                    course.status === "unsupported_schema"
                      ? "course.yml uses an unsupported schema version."
                      : "course.yml failed Graider course validation."
                });
                return null;
              }
              if (course.organization.toLowerCase() !== org.login.toLowerCase()) {
                diagnostics.push({
                  organizationId: org.organizationId,
                  repositoryId: repo.id,
                  status: "migration_required",
                  message:
                    "Configured organization does not match repository. Manual reconciliation is required."
                });
                return null;
              }
              // v1 course.repository is a logical string, not an owner/name or immutable remote identity.
              let authorization: CourseAuthorization = "faculty_identity_required";
              const attention: string[] = repo.archived
                ? ["GitHub repository is archived and read-only."]
                : [];
              if (request.username !== null) {
                authorization = "not_authorized";
                let incomplete = false;
                try {
                  const termCodes = await reader.terms(repo);
                  for (const termCode of termCodes) {
                    const term = await reader.file(repo, `terms/${termCode}/term.yml`);
                    const result =
                      term === null
                        ? "invalid_metadata"
                        : metadata.inspectTermFaculty(term, termCode, request.username);
                    if (result === "authorized") authorization = "authorized";
                    if (result === "invalid_metadata") incomplete = true;
                  }
                } catch (error) {
                  incomplete = true;
                  diagnostics.push(diagnostic(org.organizationId, error, repo.id));
                }
                if (incomplete) {
                  attention.push(
                    "Some term faculty metadata could not be validated. Refresh after repair or reconnection."
                  );
                  if (authorization !== "authorized") authorization = "unavailable";
                }
              } else attention.push("Set your MSOE username to verify course access.");
              const matched = locals
                .filter((local) => localIds.get(local.folderId) === repo.id)
                .map((local) => local.folderId);
              const related = locals.filter(
                (local) =>
                  !matched.includes(local.folderId) &&
                  local.configuredCourse?.organization.toLowerCase() === org.login.toLowerCase() &&
                  local.configuredCourse.code === course.code
              );
              const localStatus =
                matched.length > 0
                  ? "registered_local"
                  : related.some((local) => local.origin !== null)
                    ? "local_origin_mismatch"
                    : related.length > 0
                      ? "local_unverified"
                      : "remote_only";
              if (localStatus === "local_origin_mismatch" || localStatus === "local_unverified")
                attention.push(
                  "A local registration with matching course metadata has an unverified or different Git origin. Inspect its remote before local setup."
                );
              return {
                repositoryId: repo.id,
                nodeId: repo.nodeId,
                organizationId: org.organizationId,
                organizationLogin: repo.owner,
                name: repo.name,
                fullName: repo.fullName,
                url: repo.url,
                defaultBranch: repo.defaultBranch,
                visibility: repo.visibility,
                archived: repo.archived,
                code: course.code,
                title: course.title,
                schemaVersion: course.schemaVersion,
                discoveryHints: [
                  ...(repo.topics.includes("graider-course") ? ["topic"] : []),
                  ...(nameHint(repo) ? ["legacy_name"] : []),
                  ...(knownIds.has(repo.id) ? ["local_origin"] : []),
                  ...(searchIds.has(repo.id) ? ["code_search"] : [])
                ],
                authorization,
                localStatus,
                localFolderIds: matched,
                diagnostics: attention
              };
            } catch (error) {
              diagnostics.push(diagnostic(org.organizationId, error, repo.id));
              return null;
            }
          })
        ).filter((course): course is RemoteCourse => course !== null);
        // Ambiguity is based on valid course metadata, regardless of faculty assignment.
        if (valid.length > 1)
          diagnostics.push({
            organizationId: org.organizationId,
            status: "ambiguous",
            message:
              "Multiple valid Graider course repositories found in organization. No course was selected."
          });
        else for (const course of valid) courses.set(course.repositoryId, course);
      } catch (error) {
        diagnostics.push(diagnostic(org.organizationId, error));
      }
    }
  }
  if (diagnostics.some((item) => item.status === "invalid_credential"))
    throw new GithubOAuthError(
      "invalid_credential",
      "Your GitHub sign-in has expired or been revoked. Sign in again."
    );
  return {
    status: diagnostics.length > 0 ? "partial_failure" : "ready",
    userId: request.userId,
    discoveredAt: new Date().toISOString(),
    courses: [...courses.values()],
    diagnostics
  };
};
