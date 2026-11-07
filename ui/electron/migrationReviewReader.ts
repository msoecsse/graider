import { createHash } from "node:crypto";
import path from "node:path";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
import { provideGithubClient, type GithubClientProvider } from "./githubClientProvider.js";
import { createRemoteRepositoryReader, type CourseRepository } from "./githubRemoteRepositories.js";
import { loadManagedCatalog, managedCoursePath } from "./managedCourses.js";
import type { ManagedOperationInput } from "./githubOAuthSession.js";
import { loadMetadata, mapBounded } from "./remoteCourseDiscovery.js";

const MAX_FILES = 10_000;
const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid exact source response.");
  return value as Record<string, unknown>;
};
const safePath = (value: unknown): value is string =>
  typeof value === "string" &&
  !/[\\:\p{C}]/u.test(value) &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");

/** Read-only facade: no GitHub write methods or Git/cache synchronizers are passed to review. */
export const createMigrationReviewReader = (
  input: ManagedOperationInput,
  userData: string,
  username: string | null,
  backend: typeof Backend,
  provide: GithubClientProvider = provideGithubClient
) => {
  const client = provide(input.token);
  const repositories = createRemoteRepositoryReader(input.token, input.signal, provide);
  const observed = async (): Promise<{ repository: CourseRepository; sourceCommitSha: string }> => {
    if (!(await input.revalidateSession()))
      throw new Error("Current authenticated account is required.");
    const repository = await repositories.resolveId(input.course.repositoryId);
    if (
      !repository ||
      repository.disabled ||
      repository.id !== input.course.repositoryId ||
      repository.organizationId !== input.course.organizationId
    )
      throw new Error("Immutable repository or organization changed. Refresh courses.");
    const branch = await client.getRepositoryBranch(
      repository.owner,
      repository.name,
      repository.defaultBranch
    );
    if (!branch || branch.name !== repository.defaultBranch || !sha(branch.commitSha))
      throw new Error("Authoritative remote revision is unavailable.");
    if (!(await input.revalidateSession()))
      throw new Error("Current authenticated account is required.");
    return { repository, sourceCommitSha: branch.commitSha };
  };
  const response = async (request: Promise<{ status: number; data: unknown }>) => {
    const result = await request;
    if (result.status !== 200 || input.signal.aborted)
      throw new Error("Exact source could not be read from GitHub.");
    return object(result.data);
  };
  return {
    observe: observed,
    async inventory(
      analysis: Backend.CourseMigrationAnalysis,
      review: Backend.MigrationReviewResult
    ) {
      if (
        !client.getOrganizationScopeResponse ||
        !client.getOrganizationMembership ||
        !client.listManagedOrganizationTeamsPage ||
        !client.getManagedTeam ||
        !client.listManagedTeamMembersPage ||
        !client.getCourseRepositoryById ||
        !client.listCourseRepositoryTeamsPage
      )
        throw new Error("Legacy grader read capabilities are unavailable.");
      return backend.inventoryLegacyGraders(
        analysis,
        review,
        {
          getOrganizationScopeResponse: client.getOrganizationScopeResponse.bind(client),
          getOrganizationMembership: client.getOrganizationMembership.bind(client),
          listManagedOrganizationTeamsPage: client.listManagedOrganizationTeamsPage.bind(client),
          getManagedTeam: client.getManagedTeam.bind(client),
          listManagedTeamMembersPage: client.listManagedTeamMembersPage.bind(client),
          getCourseRepositoryById: client.getCourseRepositoryById.bind(client),
          listCourseRepositoryTeamsPage: client.listCourseRepositoryTeamsPage.bind(client)
        },
        input.signal
      );
    },
    async lookupLogin(login: string): Promise<{ githubUserId: number; githubLogin: string }> {
      const identity = await client.getUser(login);
      const parsed = backend.facultyIdentitySchema.safeParse({
        institutional_username: "verification",
        github_user_id: identity?.id,
        github_login: identity?.username,
        github_login_history: []
      });
      if (!parsed.success || input.signal.aborted || !(await input.revalidateSession()))
        throw new Error("GitHub identity could not be verified. Check the login and try again.");
      return { githubUserId: parsed.data.github_user_id, githubLogin: parsed.data.github_login };
    },
    async snapshot(): Promise<Backend.MigrationSnapshot> {
      const { repository, sourceCommitSha } = await observed();
      const signal = AbortSignal.any([input.signal, AbortSignal.timeout(TIMEOUT_MS)]);
      if (!client.getMigrationCommit || !client.getMigrationTree || !client.getMigrationBlob)
        throw new Error("Exact source reader is unavailable.");
      const commit = await response(
        client.getMigrationCommit(repository.owner, repository.name, sourceCommitSha, signal)
      );
      const treeSha = object(commit.tree).sha;
      if (commit.sha !== sourceCommitSha || !sha(treeSha))
        throw new Error("Exact source commit could not be verified.");
      const tree = await response(
        client.getMigrationTree(repository.owner, repository.name, treeSha, signal)
      );
      if (tree.sha !== treeSha) throw new Error("Exact source tree could not be verified.");
      if (tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > MAX_FILES)
        throw new Error("Complete repository inventory is unavailable.");
      const entries = tree.tree.map(object).filter((entry) => entry.type !== "tree");
      const sourceProblems: string[] = [];
      const paths = new Set<string>();
      let total = 0;
      const sourceBytesBase64: Record<string, string> = {};
      const files = await mapBounded(entries, async (entry): Promise<[string, string] | null> => {
        if (
          !safePath(entry.path) ||
          !sha(entry.sha) ||
          entry.type !== "blob" ||
          !["100644", "100755"].includes(String(entry.mode)) ||
          paths.has(entry.path)
        ) {
          sourceProblems.push(
            "Repository contains a non-regular, duplicate or unsafe source entry."
          );
          return null;
        }
        paths.add(entry.path);
        if (typeof entry.size !== "number" || entry.size < 0 || entry.size > MAX_BLOB_BYTES)
          throw new Error("Source file exceeds the review read limit.");
        const blob = await response(
          client.getMigrationBlob!(repository.owner, repository.name, entry.sha, signal)
        );
        if (
          blob.sha !== entry.sha ||
          blob.encoding !== "base64" ||
          typeof blob.content !== "string" ||
          blob.content.length > MAX_BLOB_BYTES * 2
        )
          throw new Error("Invalid exact source blob.");
        const bytes = Buffer.from(blob.content, "base64");
        const blobHash = createHash(entry.sha.length === 64 ? "sha256" : "sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex");
        if (blobHash !== entry.sha) throw new Error("Exact source blob checksum mismatch.");
        total += bytes.length;
        if (bytes.length !== entry.size || total > MAX_SNAPSHOT_BYTES)
          throw new Error("Source snapshot exceeds review limits or is incomplete.");
        if (
          entry.path.startsWith(".graider/grading/") ||
          entry.path.includes("/grading/") ||
          entry.path.includes("/reports/")
        )
          sourceBytesBase64[entry.path] = bytes.toString("base64");
        return [entry.path, bytes.toString("utf8")];
      });
      const known = loadManagedCatalog(userData, input.userId, { readOnly: true }).courses[
        String(repository.id)
      ];
      const sourceRoot = managedCoursePath(userData, input.userId, repository.id);
      const local = await backend.readLocalMigrationReviewEvidence(
        sourceRoot,
        path.join(path.dirname(sourceRoot), "runtime"),
        sourceCommitSha
      );
      const snapshot: Backend.MigrationSnapshot = {
        binding: {
          repositoryId: repository.id,
          sourceCommitSha,
          authenticatedGithubUserId: input.userId,
          organizationId: repository.organizationId,
          repositoryName: repository.name,
          organizationLogin: repository.owner,
          ...(known
            ? {
                historicalRepositoryId: known.repositoryId,
                historicalOrganizationId: known.organizationId
              }
            : {})
        },
        sourceFiles: Object.fromEntries(
          files
            .filter((entry): entry is [string, string] => entry !== null)
            .sort(([a], [b]) => a.localeCompare(b))
        ),
        sourceProblems,
        sourceBytesBase64,
        ...local
      };
      // Faculty authorization must remain independent of unrelated inventory errors.
      // A malformed assignment/roster must not bypass current term-faculty checks.
      const metadata = loadMetadata();
      if (
        metadata.inspectCourse(snapshot.sourceFiles["course.yml"] ?? "").status === "valid" &&
        (!username ||
          !Object.entries(snapshot.sourceFiles).some(([file, content]) => {
            const match = /^terms\/(\d{2}s[123])\/term\.yml$/.exec(file);
            return (
              match !== null &&
              metadata.inspectTermFaculty(content, match[1], username) === "authorized"
            );
          }))
      )
        throw new Error("Current faculty assignment no longer authorizes this course.");
      const fresh = await observed();
      if (
        fresh.sourceCommitSha !== sourceCommitSha ||
        fresh.repository.defaultBranch !== repository.defaultBranch
      )
        throw new Error("Course changed during analysis. Refresh analysis.");
      return snapshot;
    }
  };
};
