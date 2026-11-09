import { measureGradingPhase } from "./gradingPerformance.js";
import fs from "node:fs";
import path from "node:path";
import { sameFilesystemRoot } from "./canonicalFilesystemRoot.js";
import { loadManagedCatalog, managedCoursePath, validateManagedStorage } from "./managedCourses.js";
import { loadMetadata, parseGithubOrigin } from "./remoteCourseDiscovery.js";
import {
  getProductionGitWorkspaceFactory,
  type GitWorkspaceFactory
} from "./gitWorkspaceReader.js";
import type { LocalCourseReadInput } from "./githubOAuthSession.js";

/** Only these path/credential-free diagnostics may cross the local-read boundary. */
export class LocalCourseReadUnavailable extends Error {}

/** Validate local bytes, identity and revision without acquiring any remote capability. */
const inspectLocalCourseEvidence = async (request: {
  readonly userData: string;
  readonly input: LocalCourseReadInput;
  readonly username: string | null;
  readonly factory?: GitWorkspaceFactory;
}) => {
  const { userData, input, username } = request;
  input.assertCurrent();
  const { course, userId } = input;
  const root = managedCoursePath(userData, userId, course.repositoryId);
  const entry = loadManagedCatalog(userData, userId, { readOnly: true }).courses[
    String(course.repositoryId)
  ];
  if (
    !entry ||
    entry.organizationId !== course.organizationId ||
    entry.defaultBranch !== course.defaultBranch ||
    entry.bootstrap.status !== "ready" ||
    !entry.lastValidatedAt
  )
    throw new LocalCourseReadUnavailable(
      "A previously verified managed-course registration is required. Refresh courses."
    );
  if (validateManagedStorage(userData, root).length)
    throw new LocalCourseReadUnavailable(
      "The managed cache has an interrupted Git operation. Review the cache."
    );
  // A local object read must never trigger Git's promisor/lazy-fetch transport.
  if (
    /^\s*(?:partialclone|promisor)\s*=/imu.test(
      fs.readFileSync(path.join(root, ".git", "config"), "utf8")
    )
  )
    throw new LocalCourseReadUnavailable(
      "A complete local managed cache is required. Review the cache."
    );
  const workspace = await (request.factory ?? getProductionGitWorkspaceFactory()).open(root);
  if (!sameFilesystemRoot(workspace.root, root))
    throw new LocalCourseReadUnavailable("Managed cache root changed.");
  const origin = parseGithubOrigin(await workspace.remoteUrl("origin"));
  if (
    !origin ||
    ![
      `${entry.organizationLogin}/${entry.name}`,
      `${course.organizationLogin}/${course.name}`
    ].some((locator) => locator.toLowerCase() === `${origin.owner}/${origin.name}`.toLowerCase())
  )
    throw new LocalCourseReadUnavailable(
      "Managed cache origin does not match its trusted registration."
    );
  const state = await workspace.inspect({ readOnly: true });
  if (
    state.head.kind !== "attached" ||
    state.head.branch !== course.defaultBranch ||
    state.upstream.kind !== "configured" ||
    state.upstream.remote !== "origin" ||
    state.upstream.branch !== `origin/${course.defaultBranch}` ||
    state.upstream.relation === "ahead" ||
    state.upstream.relation === "diverged" ||
    state.workingTree.trackedChanges.length ||
    state.workingTree.stagedChanges.length ||
    state.workingTree.untrackedPaths.length ||
    state.workingTree.conflicts.length
  )
    throw new LocalCourseReadUnavailable("Managed cache HEAD or working tree requires review.");
  const metadata = loadMetadata();
  const content = fs.readFileSync(path.join(root, "course.yml"), "utf8");
  const operational = metadata.inspectManagedOperationCourse(content);
  if (operational.status !== "valid" || operational.schemaVersion !== course.schemaVersion)
    throw new LocalCourseReadUnavailable("A supported managed course schema is required.");
  const termContents: Record<string, string> = {};
  const termsRoot = path.join(root, "terms");
  if (fs.existsSync(termsRoot))
    for (const code of fs.readdirSync(termsRoot)) {
      if (/^\d{2}s[123]$/u.test(code))
        termContents[code] = fs.readFileSync(path.join(termsRoot, code, "term.yml"), "utf8");
    }
  // Status can hide skip-worktree/assume-unchanged metadata. Authorize only bytes
  // present in this exact local commit, including every term used by role policy.
  if (!workspace.readRevisionFile)
    throw new LocalCourseReadUnavailable(
      "Local committed metadata inspection is required. Update Graider."
    );
  for (const [file, bytes] of Object.entries({
    "course.yml": content,
    ...Object.fromEntries(
      Object.entries(termContents).map(([code, value]) => [`terms/${code}/term.yml`, value])
    )
  })) {
    if ((await workspace.readRevisionFile(state.head.commit, file)) !== bytes)
      throw new LocalCourseReadUnavailable(
        "Cached authorization metadata differs from its local commit. Review the cache."
      );
  }
  const access = metadata.inspectAccess(content, termContents, {
    userId,
    username,
    repositoryId: course.repositoryId,
    organizationId: course.organizationId,
    organizationLogin:
      operational.organization.toLowerCase() === entry.organizationLogin.toLowerCase()
        ? entry.organizationLogin
        : course.organizationLogin
  });
  if (access.status !== "valid" || access.authorization !== "authorized" || access.incomplete)
    throw new LocalCourseReadUnavailable(
      "Local course role evidence is unavailable for this account."
    );
  input.assertCurrent();
  return { root, commit: state.head.commit, metadata: operational, access };
};
export const validateLocalManagedCourse = (
  ...args: Parameters<typeof inspectLocalCourseEvidence>
) => measureGradingPhase("cache_validation", () => inspectLocalCourseEvidence(...args));

export const inspectLocalManagedCourse = async (
  request: Parameters<typeof validateLocalManagedCourse>[0]
) => {
  const local = await validateLocalManagedCourse(request);
  const terms = local.access.terms.map((term) => term.code);
  const assignments: import("./remoteCourseTypes.js").ManagedCourseInspection["assignments"][number][] =
    [];
  for (const term of terms) {
    const directory = path.join(local.root, "terms", term, "assignments");
    if (fs.existsSync(directory))
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(entry.name)) {
          const file = path.join(directory, entry.name, "assignment.yml");
          if (fs.existsSync(file)) {
            const assignment = loadMetadata().inspectAssignment(
              fs.readFileSync(file, "utf8"),
              entry.name
            );
            if (assignment) assignments.push({ term, ...assignment });
          }
        }
      }
  }
  const { course, userId } = request.input;
  const operations =
    local.metadata.schemaVersion === 2
      ? await loadMetadata()
          .inspectManagedOperationCapabilities(local.root, {
            organization: course.organizationLogin,
            organizationId: course.organizationId,
            repositoryId: course.repositoryId,
            userId
          })
          .catch(() => ({
            archiveAllowed: false,
            unarchiveAllowed: false,
            lifecycleReason: "lifecycle-evidence-unavailable"
          }))
      : undefined;
  request.input.assertCurrent();
  const after = await validateLocalManagedCourse(request);
  if (after.commit !== local.commit)
    throw new Error("The local cache changed. Reopen Course details.");
  return {
    repositoryId: course.repositoryId,
    revision: local.commit,
    revisionSource: "local_cache" as const,
    code: local.metadata.code,
    title: local.metadata.title,
    terms,
    assignments,
    ...(operations ? { operations } : {})
  };
};
