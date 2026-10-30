import fs from "node:fs";
import path from "node:path";
import type { GithubOAuthSession } from "./githubOAuthSession.js";
import type { CourseFolderRecord } from "./ipc.js";
import {
  getProductionGitWorkspaceFactory,
  type GitWorkspaceFactory
} from "./gitWorkspaceReader.js";
import { inspectChangedFiles } from "./coursePublishService.js";
import { parseGithubOrigin } from "./remoteCourseDiscovery.js";
import { createRemoteRepositoryReader } from "./githubRemoteRepositories.js";
import { MANAGED_COURSE_ROOT, validateManagedStorage } from "./managedCourses.js";
import {
  canReviewManagedCache,
  type ManagedSynchronizationState,
  type RemoteCourse
} from "./remoteCourseTypes.js";
import type { CourseMutationBlock } from "./managedCourseMutationTypes.js";

export type CourseMutationMode = "new_mutation" | "publication_retry";
export interface VerifiedCourseMutationContext {
  readonly userId: number;
  readonly repositoryId: number;
  readonly authoritativeCommit: string;
  readonly operationalCommit: string;
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly mode: CourseMutationMode;
}
export class CourseMutationBlocked extends Error {
  constructor(readonly result: CourseMutationBlock) {
    super(result.message);
  }
}
export const blockMutation = (
  reason: CourseMutationBlock["reason"],
  message: string,
  action: CourseMutationBlock["action"] = "attention",
  repositoryId?: number
): never => {
  throw new CourseMutationBlocked({
    status: "blocked",
    reason,
    message,
    action,
    repositoryId,
    retryable: action === "retry"
  });
};
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu;
export const requireSynchronizedCommit = (
  course: RemoteCourse,
  sync: ManagedSynchronizationState
): string => {
  const id = course.repositoryId;
  if (sync.reason === "organization_transfer")
    blockMutation(
      "organization_migration_required",
      "Course organization changed. Migration is required.",
      "attention",
      id
    );
  if (
    sync.reason === "authorization_lost" ||
    sync.reason === "authentication_failed" ||
    sync.reason === "remote_unavailable"
  )
    blockMutation(
      "course_access_lost",
      "Current course authorization could not be verified. Refresh course access.",
      "authorization",
      id
    );
  if (sync.status === "needs_attention") {
    const review = canReviewManagedCache({ ...course, synchronization: sync });
    blockMutation(
      review ? "managed_cache_review_required" : "managed_cache_manual_review_required",
      review
        ? "Review the managed cache, then retry this action."
        : "The managed cache requires manual attention before course changes.",
      review ? "review_cache" : "attention",
      id
    );
  }
  if (sync.status !== "up_to_date" && sync.status !== "updated")
    blockMutation(
      sync.reason === "local_storage_failure"
        ? "local_storage_failure"
        : "synchronization_retry_required",
      "Unable to check the latest course state. Retry this action.",
      "retry",
      id
    );
  if (!sync.currentCommit || !SHA.test(sync.currentCommit))
    return blockMutation(
      "operational_source_unsafe",
      "Authoritative course revision could not be established.",
      "attention",
      id
    );
  return sync.currentCommit;
};

/** Read-only source semantics shared by every mutation class. Never fetches or updates legacy. */
export const validateOperationalCourseSource = async (request: {
  readonly root: string;
  readonly course: RemoteCourse;
  readonly authoritativeCommit: string;
  readonly mode: CourseMutationMode;
  readonly factory: GitWorkspaceFactory;
  readonly resolveOrigin: (
    owner: string,
    name: string
  ) => Promise<{ id: number; organizationId: number } | null>;
}): Promise<string> => {
  const { root, course, authoritativeCommit, mode, factory } = request;
  const unsafe = () =>
    blockMutation(
      "operational_source_unsafe",
      "The registered operational course source requires attention before changes.",
      "attention",
      course.repositoryId
    );
  // Reuse the self-contained Git-storage checks, anchored at the legacy directory's parent.
  if (validateManagedStorage(path.dirname(root), root).length) unsafe();
  const workspace = await factory.open(root);
  if (fs.realpathSync(workspace.root) !== fs.realpathSync(root)) unsafe();
  const locator = parseGithubOrigin(await workspace.remoteUrl("origin"));
  if (!locator) unsafe();
  const repo = locator ? await request.resolveOrigin(locator.owner, locator.name) : null;
  if (!repo || repo.id !== course.repositoryId || repo.organizationId !== course.organizationId)
    blockMutation(
      "operational_source_mismatch",
      "The registered course origin does not match the authorized course repository and organization.",
      "attention",
      course.repositoryId
    );
  const state = await workspace.inspect({ readOnly: true });
  if (
    state.head.kind !== "attached" ||
    state.head.branch !== course.defaultBranch ||
    state.upstream.kind !== "configured" ||
    state.upstream.remote !== "origin" ||
    state.upstream.branch !== `origin/${course.defaultBranch}` ||
    state.workingTree.conflicts.length
  )
    unsafe();
  if (state.head.kind !== "attached") return unsafe();
  const changed = [...state.workingTree.trackedChanges, ...state.workingTree.stagedChanges];
  const pending =
    inspectChangedFiles([
      ...changed.flatMap((item) => [item.path, ...(item.originalPath ? [item.originalPath] : [])]),
      ...state.workingTree.untrackedPaths
    ]).allowed.length > 0;
  if (mode === "new_mutation" && pending)
    blockMutation(
      "operational_source_unsafe",
      "Previous course changes have not been published. Publish or resolve them before making another change.",
      "attention",
      course.repositoryId
    );
  const head = state.head.commit;
  if (head !== authoritativeCommit) {
    const safelyAhead =
      mode === "publication_retry" && (await workspace.isAncestor(authoritativeCommit, head));
    if (!safelyAhead)
      blockMutation(
        "operational_source_stale",
        "The registered operational course source is not based on the latest authoritative course state. Update or resolve it before retrying. Graider has preserved the local source.",
        "attention",
        course.repositoryId
      );
  }
  return head;
};

interface Dependencies {
  readonly userData: string;
  readonly session: GithubOAuthSession;
  readonly folders: () => readonly CourseFolderRecord[];
  readonly username: () => string | null;
  readonly factory?: GitWorkspaceFactory;
}
export class ManagedCourseMutationGuard {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly deps: Dependencies) {}
  async run<T>(
    folderId: unknown,
    suppliedPath: unknown,
    mode: CourseMutationMode,
    operation: (context: VerifiedCourseMutationContext) => Promise<T>
  ): Promise<T> {
    const session = this.deps.session;
    const state = session.getState();
    const generation = session.mutationGeneration;
    const userId = state.identity?.id;
    if (!userId || state.busy || state.courseDiscovery.userId !== userId)
      blockMutation(
        "authorization_required",
        "Sign in and authorize course access before making changes.",
        "authorization"
      );
    const folder = this.deps.folders().find((item) => item.id === folderId);
    const courses = state.courseDiscovery.courses.filter((item) =>
      item.localFolderIds.includes(String(folderId))
    );
    if (!folder)
      blockMutation(
        "remote_only_mutation_unavailable",
        "This course is available through Graider's managed cache, but managed-course editing is not enabled yet."
      );
    if (
      !folder ||
      courses.length !== 1 ||
      (suppliedPath !== undefined && suppliedPath !== folder.path)
    )
      return blockMutation(
        "operational_source_mismatch",
        "The registered folder cannot be confidently mapped to an authorized course. Refresh courses and inspect its registration."
      );
    const course = courses[0];
    if (!this.deps.username())
      blockMutation(
        "faculty_identity_required",
        "Configure your MSOE username before making course changes.",
        "faculty_settings",
        course.repositoryId
      );
    const key = `${userId}:${course.repositoryId}`;
    const previous = this.pending.get(key) ?? Promise.resolve();
    let operationStarted = false;
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (session.mutationGeneration !== generation || session.getState().identity?.id !== userId)
          blockMutation(
            "authorization_required",
            "Account changed. Retry this action after authorizing course access.",
            "authorization"
          );
        if (!this.deps.folders().some((item) => item.id === folder.id && item.path === folder.path))
          blockMutation(
            "operational_source_mismatch",
            "Course registration changed. Retry after refreshing courses."
          );
        return session.withSynchronizedCourse(course.repositoryId, userId!, async (input, sync) => {
          if (!input.course.localFolderIds.includes(folder.id))
            blockMutation(
              "operational_source_mismatch",
              "Course registration no longer matches authorized discovery."
            );
          const authoritativeCommit = requireSynchronizedCommit(input.course, sync);
          const managedRoot = path.join(this.deps.userData, MANAGED_COURSE_ROOT);
          const relative = path.relative(
            fs.existsSync(managedRoot) ? fs.realpathSync(managedRoot) : managedRoot,
            fs.realpathSync(folder.path)
          );
          if (
            relative === "" ||
            (!relative.startsWith(`..${path.sep}`) &&
              relative !== ".." &&
              !path.isAbsolute(relative))
          )
            blockMutation(
              "remote_only_mutation_unavailable",
              "Managed-course editing is not enabled yet. Use a verified registered legacy source."
            );
          const operationalCommit = await validateOperationalCourseSource({
            root: folder.path,
            course: input.course,
            authoritativeCommit,
            mode,
            factory: this.deps.factory ?? getProductionGitWorkspaceFactory(),
            resolveOrigin: (owner, name) =>
              createRemoteRepositoryReader(input.token, input.signal).resolve(owner, name)
          });
          if (!(await input.revalidateSession()))
            blockMutation(
              "authorization_required",
              "Account authorization changed. Retry this action.",
              "authorization"
            );
          if (
            !this.deps.folders().some((item) => item.id === folder.id && item.path === folder.path)
          )
            blockMutation(
              "operational_source_mismatch",
              "Course registration changed during validation. Retry after refreshing courses."
            );
          operationStarted = true;
          return operation({
            userId: input.userId,
            repositoryId: course.repositoryId,
            authoritativeCommit,
            operationalCommit,
            courseFolderId: folder.id,
            courseFolderPath: folder.path,
            mode
          });
        });
      })
      .catch((error) => {
        if (operationStarted || error instanceof CourseMutationBlocked) throw error;
        return blockMutation(
          "operational_source_unsafe",
          "Current course readiness could not be proven. Check course access, local storage, and source safety, then retry.",
          "retry",
          course.repositoryId
        );
      });
    this.pending.set(key, next);
    try {
      return await next;
    } finally {
      if (this.pending.get(key) === next) this.pending.delete(key);
    }
  }
}
