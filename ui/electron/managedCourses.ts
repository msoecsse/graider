import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadMetadata, parseGithubOrigin } from "./remoteCourseDiscovery.js";
import type {
  RemoteCourse,
  ManagedCourseState,
  ManagedCourseInspection,
  ManagedSynchronizationState
} from "./remoteCourseTypes.js";
import type { CourseRepository, RemoteRepositoryReader } from "./githubRemoteRepositories.js";
import { REPOSITORY_FAILURE_MESSAGES } from "./githubRemoteRepositories.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";
import type {
  GitWorkspaceInspector,
  GitWorkspaceSynchronizer,
  GitRepositoryState,
  GitAuthenticationContextRef
} from "./gitWorkspaceReader.js";

export const MANAGED_COURSE_ROOT = "managed-courses";
export const MANAGED_BOOTSTRAP_CONCURRENCY = 2;
export const BOOTSTRAP_DIRECTORY_PREFIX = "course-bootstrap-";
export const MANAGED_CATALOG_SCHEMA = 1;
const CATALOG_FILE_MODE = 0o600;
const CATALOG_FILE = "catalog.json";
const TEMP_ROOT = ".bootstrap";
const WORKTREE_DIRECTORY = "repo";
const UNEXPECTED_GIT_STATE = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "rebase-merge",
  "rebase-apply",
  "sequencer",
  "BISECT_LOG",
  "commondir",
  "gitdir",
  "objects/info/alternates"
] as const;
const DISK_FAILURE_CODES = new Set(["ENOSPC", "EACCES", "EPERM", "EROFS"]);
const TERM_PATTERN = /^\d{2}s[123]$/;

export const identityComponent = (id: number): string => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Attention("Invalid managed course identity.");
  return String(id);
};
export const managedCoursePath = (userData: string, userId: number, repositoryId: number): string =>
  path.join(
    userData,
    MANAGED_COURSE_ROOT,
    identityComponent(userId),
    identityComponent(repositoryId),
    WORKTREE_DIRECTORY
  );

class Attention extends Error {
  constructor(
    message: string,
    readonly reason: ManagedSynchronizationState["reason"] = "unsafe_repository"
  ) {
    super(message);
  }
}
/** Every existing component below userData must be a real directory, never a symlink. */
const safeDirectories = (userData: string, directory: string, create = false): void => {
  const relative = path.relative(path.resolve(userData), path.resolve(directory));
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Attention("Managed storage path is unsafe.");
  let current = path.resolve(userData);
  for (const part of ["", ...relative.split(path.sep).filter(Boolean)]) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Attention("Managed storage contains an unexpected link.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!fs.existsSync(current) && create) fs.mkdirSync(current);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Attention("Managed storage contains an unexpected directory or link.");
    }
  }
};
/** Reject dangling links too, before Git or metadata readers traverse the cache. */
const rejectLinks = (directory: string): void => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink())
      throw new Attention("Managed cache contains a symbolic link. Review is required.");
    if (stat.isDirectory()) rejectLinks(target);
  }
};
export interface ManagedCatalogEntry {
  readonly userId: number;
  readonly repositoryId: number;
  readonly managedPath: string;
  readonly organizationId: number;
  readonly organizationLogin: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly bootstrap: ManagedCourseState;
  readonly lastValidatedAt: string | null;
}
interface Catalog {
  readonly schemaVersion: typeof MANAGED_CATALOG_SCHEMA;
  readonly userId: number;
  readonly courses: Record<string, ManagedCatalogEntry>;
}
const accountRoot = (userData: string, userId: number): string =>
  path.join(userData, MANAGED_COURSE_ROOT, identityComponent(userId));
/** Catalog is a hint. Paths are always reconstructed from IDs, never taken from JSON. */
export const loadManagedCatalog = (userData: string, userId: number): Catalog => {
  const root = accountRoot(userData, userId);
  safeDirectories(userData, root, true);
  const file = path.join(root, CATALOG_FILE);
  if (!fs.existsSync(file)) return { schemaVersion: MANAGED_CATALOG_SCHEMA, userId, courses: {} };
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
    throw new Attention("Managed catalog requires review.");
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as Catalog;
    if (
      value.schemaVersion !== MANAGED_CATALOG_SCHEMA ||
      value.userId !== userId ||
      !value.courses ||
      typeof value.courses !== "object" ||
      Array.isArray(value.courses)
    )
      throw new Error();
    const courses: Record<string, ManagedCatalogEntry> = {};
    for (const [key, entry] of Object.entries(value.courses)) {
      if (
        key !== identityComponent(entry.repositoryId) ||
        entry.userId !== userId ||
        entry.managedPath !== managedCoursePath(userData, userId, entry.repositoryId)
      )
        throw new Error();
      if (
        !Number.isSafeInteger(entry.organizationId) ||
        entry.organizationId <= 0 ||
        ![entry.organizationLogin, entry.name, entry.fullName, entry.defaultBranch].every(
          (field) => typeof field === "string"
        ) ||
        !entry.bootstrap ||
        ![
          "not_bootstrapped",
          "queued",
          "bootstrapping",
          "ready",
          "failed",
          "needs_attention"
        ].includes(entry.bootstrap.status) ||
        (entry.lastValidatedAt !== null &&
          (typeof entry.lastValidatedAt !== "string" ||
            Number.isNaN(Date.parse(entry.lastValidatedAt))))
      )
        throw new Error();
      // Explicit whitelist prevents unknown fields (including credentials) from being reserialized.
      courses[key] = catalogEntry(
        userData,
        userId,
        entry.repositoryId,
        entry,
        state(entry.bootstrap.status),
        entry.lastValidatedAt
      );
    }
    return { schemaVersion: MANAGED_CATALOG_SCHEMA, userId, courses };
  } catch {
    throw new Attention("Managed catalog is invalid. Review is required before course setup.");
  }
};
const state = (
  status: ManagedCourseState["status"],
  diagnostic: string | null = null
): ManagedCourseState => ({ status, diagnostic, retryable: status === "failed" });
const catalogEntry = (
  userData: string,
  userId: number,
  repositoryId: number,
  repo: {
    organizationId: number;
    organizationLogin?: string;
    owner?: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  },
  bootstrap: ManagedCourseState,
  lastValidatedAt: string | null
): ManagedCatalogEntry => ({
  userId,
  repositoryId,
  managedPath: managedCoursePath(userData, userId, repositoryId),
  organizationId: repo.organizationId,
  organizationLogin: repo.owner ?? repo.organizationLogin ?? "",
  name: repo.name,
  fullName: repo.fullName,
  defaultBranch: repo.defaultBranch,
  bootstrap,
  lastValidatedAt
});
const saveEntry = (userData: string, entry: ManagedCatalogEntry): void => {
  const catalog = loadManagedCatalog(userData, entry.userId);
  const root = accountRoot(userData, entry.userId);
  const file = path.join(root, CATALOG_FILE);
  const temporary = path.join(root, `catalog-${randomUUID()}.tmp`);
  fs.writeFileSync(
    temporary,
    JSON.stringify(
      { ...catalog, courses: { ...catalog.courses, [entry.repositoryId]: entry } },
      null,
      2
    ),
    { flag: "wx", mode: CATALOG_FILE_MODE }
  );
  fs.renameSync(temporary, file);
};
/** Bootstrap receives only clone/open inspection capability, never a Git writer. */
export interface BootstrapGitContext {
  readonly authentication: GitAuthenticationContextRef;
  readonly factory: {
    open(root: string): Promise<GitWorkspaceInspector>;
    clone(request: {
      remote: string;
      destination: string;
      checkout: "default";
      authentication: GitAuthenticationContextRef;
    }): Promise<unknown>;
  };
}
export interface ManagedBootstrapRequest {
  readonly userData: string;
  readonly userId: number;
  readonly course: RemoteCourse;
  readonly username: string | null;
  readonly reader: RemoteRepositoryReader;
  readonly signal: AbortSignal;
  /** Main-process session closure checks identity and capabilities afresh. */
  readonly revalidateSession: () => Promise<boolean>;
  readonly authenticate: () => BootstrapGitContext;
  /** Existing caches are structurally checked here, then classified by synchronization. */
  readonly prepareSynchronization?: boolean;
}
const assertActive = (request: ManagedBootstrapRequest): void => {
  if (request.signal.aborted) throw new Error("stale_session");
};
const validateMetadata = async (
  request: ManagedBootstrapRequest,
  repo: CourseRepository,
  localPath?: string
): Promise<{ readonly code: string; readonly title: string }> => {
  const metadata = loadMetadata();
  const readLocal = (file: string): string => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Attention(
          "Checked-out course metadata is missing. Refresh courses after repair.",
          "invalid_remote_metadata"
        );
      throw error;
    }
  };
  const content = localPath
    ? readLocal(path.join(localPath, "course.yml"))
    : await request.reader.file(repo, "course.yml");
  if (localPath && content !== (await request.reader.file(repo, "course.yml")))
    throw new Attention(
      "Course metadata changed during synchronization. Refresh courses and retry.",
      "invalid_remote_metadata"
    );
  const course = content === null ? null : metadata.inspectCourse(content);
  if (!course || course.status !== "valid")
    throw new Attention(
      "Course metadata is missing or invalid. Refresh courses after repair.",
      "invalid_remote_metadata"
    );
  if (course.organization.toLowerCase() !== repo.owner.toLowerCase())
    throw new Attention(
      "Organization binding changed. Migration/reconciliation is required.",
      "organization_transfer"
    );
  const terms = localPath
    ? fs.readdirSync(path.join(localPath, "terms")).filter((term) => TERM_PATTERN.test(term))
    : await request.reader.terms(repo);
  if (
    localPath &&
    JSON.stringify([...terms].sort()) !== JSON.stringify((await request.reader.terms(repo)).sort())
  )
    throw new Attention(
      "Term metadata changed during synchronization. Refresh courses and retry.",
      "invalid_remote_metadata"
    );
  let authorized = false;
  for (const term of terms) {
    const termContent = localPath
      ? readLocal(path.join(localPath, "terms", term, "term.yml"))
      : await request.reader.file(repo, `terms/${term}/term.yml`);
    if (localPath && termContent !== (await request.reader.file(repo, `terms/${term}/term.yml`)))
      throw new Attention(
        "Faculty metadata changed during synchronization. Refresh courses and retry.",
        "invalid_remote_metadata"
      );
    const faculty =
      termContent !== null && request.username
        ? metadata.inspectTermFaculty(termContent, term, request.username)
        : "invalid_metadata";
    if (faculty === "invalid_metadata")
      throw new Attention(
        "Term metadata is missing or invalid. Refresh courses after repair.",
        "invalid_remote_metadata"
      );
    if (faculty === "authorized") authorized = true;
  }
  if (!authorized)
    throw new Attention(
      "Current faculty authorization could not be verified. Refresh courses after checking faculty settings.",
      "authorization_lost"
    );
  return { code: course.code, title: course.title };
};
const revalidateManagedRepository = async (
  request: ManagedBootstrapRequest
): Promise<CourseRepository> => {
  if (
    request.course.authorization !== "authorized" ||
    !request.username ||
    !(await request.revalidateSession())
  )
    throw new Attention(
      "Current course authorization could not be verified. Refresh courses.",
      "authorization_lost"
    );
  assertActive(request);
  const catalog = loadManagedCatalog(request.userData, request.userId);
  const repo = await request.reader.resolveId(request.course.repositoryId);
  if (!repo || repo.id !== request.course.repositoryId || repo.disabled)
    throw new GithubOAuthError(
      "repository_inaccessible",
      REPOSITORY_FAILURE_MESSAGES.repository_inaccessible
    );
  const known = catalog.courses[String(repo.id)];
  if (
    (known && known.organizationId !== repo.organizationId) ||
    repo.organizationId !== request.course.organizationId
  )
    throw new Attention("Organization migration/reconciliation required.", "organization_transfer");
  await validateMetadata(request, repo);
  assertActive(request);
  return repo;
};
const validateStructure = async (
  request: ManagedBootstrapRequest,
  repo: CourseRepository,
  localPath: string,
  context: BootstrapGitContext
): Promise<GitWorkspaceInspector> => {
  safeDirectories(request.userData, localPath);
  rejectLinks(localPath);
  const gitDirectory = path.join(localPath, ".git");
  if (
    !fs.existsSync(gitDirectory) ||
    !fs.lstatSync(gitDirectory).isDirectory() ||
    UNEXPECTED_GIT_STATE.some((name) => fs.existsSync(path.join(gitDirectory, name)))
  )
    throw new Attention(
      "Managed cache has an unexpected Git operation or external Git directory. Review is required."
    );
  const workspace = await context.factory.open(localPath);
  if (fs.realpathSync(workspace.root) !== fs.realpathSync(localPath))
    throw new Attention("Managed destination is not a course Git worktree.");
  const locator = parseGithubOrigin(await workspace.remoteUrl("origin"));
  if (!locator)
    throw new Attention("Managed origin is missing or is not a credential-free GitHub locator.");
  const resolved = await request.reader.resolve(locator.owner, locator.name);
  if (!resolved || resolved.id !== repo.id)
    throw new Attention("Managed origin identifies a different repository. Review is required.");
  if (resolved.organizationId !== repo.organizationId)
    throw new Attention(
      "Organization transfer requires migration/reconciliation.",
      "organization_transfer"
    );
  return workspace;
};
const validateClone = async (
  request: ManagedBootstrapRequest,
  repo: CourseRepository,
  localPath: string,
  context: BootstrapGitContext
): Promise<void> => {
  const workspace = await validateStructure(request, repo, localPath, context);
  const inspection = await workspace.inspect();
  const tree = inspection.workingTree;
  if (
    inspection.head.kind !== "attached" ||
    inspection.head.branch !== repo.defaultBranch ||
    !inspection.head.commit ||
    tree.trackedChanges.length ||
    tree.stagedChanges.length ||
    tree.conflicts.length ||
    tree.untrackedPaths.length
  )
    throw new Attention(
      "Managed cache has changes or an unexpected HEAD. Review is required; no files were reset."
    );
  await validateMetadata(request, repo, localPath);
};
const failure = (error: unknown): ManagedCourseState => {
  if (error instanceof Attention) return state("needs_attention", error.message);
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOSPC")
    return state(
      "failed",
      "Course setup ran out of disk space. Free space and retry course setup."
    );
  if (code === "EACCES" || code === "EPERM" || code === "EROFS")
    return state(
      "failed",
      "Course storage is not writable. Check local permissions and retry course setup."
    );
  if (error instanceof GithubOAuthError && Object.hasOwn(REPOSITORY_FAILURE_MESSAGES, error.code))
    return state(
      "failed",
      REPOSITORY_FAILURE_MESSAGES[error.code as keyof typeof REPOSITORY_FAILURE_MESSAGES]
    );
  if ((error as { kind?: string })?.kind === "authentication_failed")
    return state(
      "failed",
      "GitHub Git transport authentication was rejected. Refresh course authorization and retry setup. Your sign-in is preserved."
    );
  return state(
    "failed",
    "Course setup could not finish. Check connection and local storage, then retry course setup. Your sign-in is preserved."
  );
};
/** Initial bootstrap/reuse ONLY: no fetch, pull, reset, registry writes or remote writes. */
const performBootstrap = async (request: ManagedBootstrapRequest): Promise<ManagedCourseState> => {
  let temporary: string | null = null;
  let temporaryIdentity: { dev: number; ino: number } | null = null;
  try {
    let repo = await revalidateManagedRepository(request);
    const finalPath = managedCoursePath(request.userData, request.userId, repo.id);
    const parent = path.dirname(finalPath);
    safeDirectories(request.userData, parent, true);
    const context = request.authenticate();
    if (fs.existsSync(finalPath) || fs.readdirSync(parent).length > 0) {
      try {
        if (request.prepareSynchronization)
          await validateStructure(request, repo, finalPath, context);
        else await validateClone(request, repo, finalPath, context);
      } catch (error) {
        if (
          error instanceof GithubOAuthError ||
          DISK_FAILURE_CODES.has((error as NodeJS.ErrnoException)?.code ?? "")
        )
          throw error;
        throw error instanceof Attention
          ? error
          : new Attention(
              "Existing managed destination is invalid or contains unexpected files. No contents were removed."
            );
      }
    } else {
      if (!(await request.revalidateSession()))
        throw new Attention("Course setup authorization is stale. Refresh courses.");
      assertActive(request);
      const currentLocator = await request.reader.resolveId(request.course.repositoryId);
      if (!currentLocator || currentLocator.id !== repo.id || currentLocator.disabled)
        throw new Error("repository_unavailable");
      if (currentLocator.organizationId !== repo.organizationId)
        throw new Attention(
          "Organization transfer requires migration/reconciliation.",
          "organization_transfer"
        );
      repo = currentLocator;
      const temporaryRoot = path.join(accountRoot(request.userData, request.userId), TEMP_ROOT);
      safeDirectories(request.userData, temporaryRoot, true);
      temporary = fs.mkdtempSync(path.join(temporaryRoot, BOOTSTRAP_DIRECTORY_PREFIX));
      const created = fs.lstatSync(temporary);
      temporaryIdentity = { dev: created.dev, ino: created.ino };
      const worktree = path.join(temporary, WORKTREE_DIRECTORY);
      // Locator comes only from freshly normalized GitHub data, never from the renderer.
      await context.factory.clone({
        remote: `${repo.url}.git`,
        destination: worktree,
        checkout: "default",
        authentication: context.authentication
      });
      await validateClone(request, repo, worktree, context);
      assertActive(request);
      if (!(await request.revalidateSession())) throw new Error("stale_session");
      safeDirectories(request.userData, parent);
      if (fs.readdirSync(parent).length > 0)
        throw new Attention("Managed destination changed during setup. Review is required.");
      fs.renameSync(worktree, finalPath);
    }
    assertActive(request);
    const ready = state("ready");
    saveEntry(
      request.userData,
      catalogEntry(request.userData, request.userId, repo.id, repo, ready, new Date().toISOString())
    );
    return ready;
  } catch (error) {
    const result = failure(error);
    // Persistence failure never masks the course diagnostic or changes OAuth session state.
    try {
      assertActive(request);
      const previous = loadManagedCatalog(request.userData, request.userId).courses[
        String(request.course.repositoryId)
      ];
      saveEntry(
        request.userData,
        previous
          ? { ...previous, bootstrap: result }
          : catalogEntry(
              request.userData,
              request.userId,
              request.course.repositoryId,
              request.course,
              result,
              null
            )
      );
    } catch {
      /* Preserve invalid catalog for review. */
    }
    return result;
  } finally {
    if (temporary) {
      try {
        const root = path.join(accountRoot(request.userData, request.userId), TEMP_ROOT);
        safeDirectories(request.userData, temporary);
        if (
          temporaryIdentity?.dev === fs.lstatSync(temporary).dev &&
          temporaryIdentity.ino === fs.lstatSync(temporary).ino &&
          path.dirname(temporary) === root &&
          path.basename(temporary).startsWith(BOOTSTRAP_DIRECTORY_PREFIX)
        )
          fs.rmSync(temporary, { recursive: true });
      } catch {
        /* Retain the artifact if ownership/path safety cannot be established. */
      }
    }
  }
};

/** Read-only view: trusted IDs resolve paths; managed caches never enter the legacy registry. */
export const inspectManagedCourse = (
  userData: string,
  userId: number,
  course: RemoteCourse
): ManagedCourseInspection => {
  if (
    course.authorization !== "authorized" ||
    course.bootstrap?.status !== "ready" ||
    course.synchronization?.status === "needs_attention" ||
    course.synchronization?.reason === "authorization_lost"
  )
    throw new Error("Course cache is not ready.");
  const localPath = managedCoursePath(userData, userId, course.repositoryId);
  safeDirectories(userData, localPath);
  rejectLinks(localPath);
  const metadata = loadMetadata().inspectCourse(
    fs.readFileSync(path.join(localPath, "course.yml"), "utf8")
  );
  if (metadata.status !== "valid") throw new Error("Course metadata is invalid.");
  const terms = fs
    .readdirSync(path.join(localPath, "terms"))
    .filter((term) => TERM_PATTERN.test(term));
  const assignments: ManagedCourseInspection["assignments"][number][] = [];
  for (const term of terms) {
    const directory = path.join(localPath, "terms", term, "assignments");
    if (fs.existsSync(directory)) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name)) {
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
  }
  return {
    repositoryId: course.repositoryId,
    code: metadata.code,
    title: metadata.title,
    terms,
    assignments
  };
};

// Shared scheduler also bounds overlapping refreshes/account switches. Same destination is serialized.
let activeBootstraps = 0;
const waitingBootstraps: Array<() => void> = [];
const destinationLocks = new Map<string, Promise<unknown>>();
const serializeManagedOperation = async <T>(
  request: ManagedBootstrapRequest,
  perform: () => Promise<T>
): Promise<T> => {
  const key = `${request.userId}:${request.course.repositoryId}`;
  const previous = destinationLocks.get(key) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      if (activeBootstraps >= MANAGED_BOOTSTRAP_CONCURRENCY)
        await new Promise<void>((resolve) => waitingBootstraps.push(resolve));
      else activeBootstraps += 1;
      try {
        assertActive(request);
        return await perform();
      } finally {
        const next = waitingBootstraps.shift();
        if (next) next();
        else activeBootstraps -= 1;
      }
    });
  destinationLocks.set(key, operation);
  try {
    return await operation;
  } finally {
    if (destinationLocks.get(key) === operation) destinationLocks.delete(key);
  }
};

export const bootstrapManagedCourse = (
  request: ManagedBootstrapRequest
): Promise<ManagedCourseState> =>
  serializeManagedOperation(request, () => performBootstrap(request));

// The shared scheduler bounds all clone/fetch work as well as serializing each destination.
export const MANAGED_SYNCHRONIZATION_CONCURRENCY = MANAGED_BOOTSTRAP_CONCURRENCY;
export interface ManagedSynchronizationRequest extends Omit<
  ManagedBootstrapRequest,
  "authenticate"
> {
  readonly authenticate: () => {
    readonly authentication: GitAuthenticationContextRef;
    readonly factory: {
      open(root: string): Promise<GitWorkspaceSynchronizer>;
      clone: BootstrapGitContext["factory"]["clone"];
    };
  };
  readonly onProgress: (state: ManagedSynchronizationState) => void;
}
const attention = (
  reason: ManagedSynchronizationState["reason"],
  diagnostic: string
): ManagedSynchronizationState => ({
  status: "needs_attention",
  reason,
  diagnostic,
  retryable: false
});
const classify = (
  inspection: GitRepositoryState,
  defaultBranch: string
): ManagedSynchronizationState | null => {
  const tree = inspection.workingTree;
  if (
    tree.trackedChanges.length ||
    tree.stagedChanges.length ||
    tree.conflicts.length ||
    tree.untrackedPaths.length
  )
    return attention(
      "local_changes",
      "Managed cache has local changes. No files were overwritten."
    );
  if (inspection.head.kind !== "attached")
    return attention("detached_head", "Managed cache HEAD is not attached to its default branch.");
  if (inspection.head.branch !== defaultBranch)
    return attention(
      "default_branch_changed",
      "Repository default branch changed. Reconciliation is required."
    );
  const upstream = inspection.upstream;
  if (
    upstream.kind !== "configured" ||
    upstream.remote !== "origin" ||
    upstream.branch !== `origin/${defaultBranch}`
  )
    return attention("upstream_missing", "Managed cache is missing its expected origin upstream.");
  if (upstream.relation === "ahead")
    return attention("local_ahead", "Managed cache contains local commits.");
  if (upstream.relation === "diverged")
    return attention("diverged", "Managed cache has diverged from GitHub.");
  return null;
};
const synchronizationFailure = (error: unknown): ManagedSynchronizationState => {
  if (error instanceof Attention) return attention(error.reason, error.message);
  const code = (error as NodeJS.ErrnoException)?.code;
  const kind = (error as { kind?: string })?.kind;
  if (DISK_FAILURE_CODES.has(code ?? "") || code === "ENOENT" || kind === "repository_unavailable")
    return {
      status: "failed",
      reason: "local_storage_failure",
      diagnostic: "Course storage is unavailable or not writable. Check local storage and retry.",
      retryable: true
    };
  if (error instanceof GithubOAuthError) {
    const reason =
      error.code === "rate_limited"
        ? "rate_limited"
        : error.code === "network_unavailable"
          ? "network_failure"
          : error.code === "invalid_credential"
            ? "authentication_failed"
            : "remote_unavailable";
    return {
      status: "failed",
      reason,
      diagnostic: Object.hasOwn(REPOSITORY_FAILURE_MESSAGES, error.code)
        ? REPOSITORY_FAILURE_MESSAGES[error.code as keyof typeof REPOSITORY_FAILURE_MESSAGES]
        : "Remote course access is unavailable. Refresh courses.",
      retryable: true
    };
  }
  return {
    status: "failed",
    reason: kind === "authentication_failed" ? "authentication_failed" : "network_failure",
    diagnostic:
      "Course update could not finish. Check your connection and retry synchronization. Your sign-in and cache are preserved.",
    retryable: true
  };
};
const performSynchronization = async (
  request: ManagedSynchronizationRequest
): Promise<ManagedSynchronizationState> => {
  let observed: GitRepositoryState | null = null;
  let before: string | undefined;
  const progress = (status: ManagedSynchronizationState["status"]): void => {
    assertActive(request);
    request.onProgress({ status, diagnostic: null, retryable: false });
  };
  try {
    progress("checking");
    const repo = await revalidateManagedRepository(request);
    const localPath = managedCoursePath(request.userData, request.userId, repo.id);
    const context = request.authenticate();
    await validateStructure(request, repo, localPath, context);
    const workspace = await context.factory.open(localPath);
    observed = await workspace.inspect();
    before = observed.head.kind === "unborn" ? undefined : observed.head.commit;
    progress("fetching");
    await workspace.fetchOrigin({ authentication: context.authentication });
    assertActive(request);
    await validateStructure(request, repo, localPath, context);
    observed = await workspace.inspect();
    const problem = classify(observed, repo.defaultBranch);
    if (problem)
      return {
        ...problem,
        localCommit: before,
        ...(observed.upstream.kind === "configured"
          ? { ahead: observed.upstream.ahead, behind: observed.upstream.behind }
          : {})
      };
    let updated = false;
    if (
      observed.upstream.kind === "configured" &&
      observed.upstream.relation === "behind" &&
      observed.head.kind === "attached"
    ) {
      const currentRepo = await revalidateManagedRepository(request);
      if (currentRepo.defaultBranch !== repo.defaultBranch)
        throw new Attention(
          "Repository default branch changed. Reconciliation is required.",
          "default_branch_changed"
        );
      await validateStructure(request, currentRepo, localPath, context);
      progress("updating");
      try {
        await workspace.fastForwardUpstream({
          expectedHead: observed.head.commit,
          expectedBranch: repo.defaultBranch,
          signal: request.signal
        });
      } catch (error) {
        const failed = synchronizationFailure(error);
        if (failed.reason === "local_storage_failure") return failed;
        observed = await workspace.inspect();
        return (
          classify(observed, repo.defaultBranch) ??
          attention(
            "unsafe_repository",
            "Managed cache changed during update. Refresh courses to re-inspect."
          )
        );
      }
      updated = true;
    }
    await validateStructure(request, repo, localPath, context);
    observed = await workspace.inspect();
    const afterProblem = classify(observed, repo.defaultBranch);
    if (afterProblem) return afterProblem;
    if (observed.upstream.kind !== "configured" || observed.upstream.relation !== "current")
      return attention(
        "unsafe_repository",
        "Managed cache changed during synchronization. Refresh courses to re-inspect."
      );
    // Remote authoritative changes are never rolled back, even when this validation fails.
    const metadata = await validateMetadata(request, repo, localPath);
    const validatedHead = observed.head;
    const latest = await revalidateManagedRepository(request);
    if (latest.defaultBranch !== repo.defaultBranch)
      throw new Attention(
        "Repository default branch changed. Reconciliation is required.",
        "default_branch_changed"
      );
    if (!(await request.revalidateSession()))
      throw new Attention("Course authorization changed. Refresh courses.", "authorization_lost");
    assertActive(request);
    await validateStructure(request, latest, localPath, context);
    observed = await workspace.inspect();
    const finalProblem = classify(observed, latest.defaultBranch);
    if (finalProblem) return finalProblem;
    if (
      observed.head.kind !== "attached" ||
      validatedHead.kind !== "attached" ||
      observed.head.commit !== validatedHead.commit ||
      observed.upstream.kind !== "configured" ||
      observed.upstream.relation !== "current"
    )
      return attention(
        "unsafe_repository",
        "Managed cache changed during validation. Refresh courses to re-inspect."
      );
    assertActive(request);
    const timestamp = new Date().toISOString();
    saveEntry(
      request.userData,
      catalogEntry(request.userData, request.userId, repo.id, latest, state("ready"), timestamp)
    );
    return {
      status: updated ? "updated" : "up_to_date",
      diagnostic: null,
      retryable: false,
      localCommit: before,
      currentCommit: observed.head.commit,
      ahead: 0,
      behind: 0,
      lastSuccessfulAt: timestamp,
      metadata
    };
  } catch (error) {
    return { ...synchronizationFailure(error), localCommit: before };
  }
};
export const synchronizeManagedCourse = (
  request: ManagedSynchronizationRequest
): Promise<ManagedSynchronizationState> =>
  serializeManagedOperation(request, () => performSynchronization(request));
