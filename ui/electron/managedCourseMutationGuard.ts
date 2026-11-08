import { canonicalFilesystemRoot, sameFilesystemRoot } from "./canonicalFilesystemRoot.js";
import { publishManagedCourseTransaction } from "./managedCourseTransaction.js";
import fs from "node:fs";
import path from "node:path";
import type { GithubOAuthSession } from "./githubOAuthSession.js";
import type { CourseFolderRecord } from "./ipc.js";
import {
  getProductionGitWorkspaceFactory,
  createAuthenticatedProductionGitWorkspace,
  type AuthenticatedGitWorkspaceContext,
  type GitWorkspaceSynchronizer,
  type GitWorkspaceWriter,
  type GitWorkspaceFactory
} from "./gitWorkspaceReader.js";
import { inspectChangedFiles } from "./coursePublishService.js";
import { loadMetadata, parseGithubOrigin } from "./remoteCourseDiscovery.js";
import { readRemoteCourseAccess } from "./remoteCourseAccess.js";
import { createRemoteRepositoryReader } from "./githubRemoteRepositories.js";
import {
  MANAGED_COURSE_ROOT,
  managedCoursePath,
  validateManagedStorage,
  revalidateManagedRepository,
  synchronizationFailure,
  loadManagedCatalog,
  saveEntry,
  safeDirectories
} from "./managedCourses.js";
import type { ManagedOperationInput } from "./githubOAuthSession.js";
import {
  canReviewManagedCache,
  type ManagedSynchronizationState,
  type RemoteCourse
} from "./remoteCourseTypes.js";
import type {
  CourseMutationBlock,
  CourseMutationMode,
  VerifiedCourseMutationContext
} from "./managedCourseMutationTypes.js";
export type {
  CourseMutationMode,
  VerifiedCourseMutationContext
} from "./managedCourseMutationTypes.js";
import {
  performManagedV2Operation,
  type ManagedOperationRequest
} from "./managedOperationBridge.js";

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

/** Read-only source semantics shared by mutations and source updates. */
export const validateOperationalCourseSource = async (request: {
  readonly root: string;
  readonly course: RemoteCourse;
  readonly authoritativeCommit: string;
  readonly mode: CourseMutationMode;
  readonly factory: GitWorkspaceFactory;
  readonly isAuthoritativeAncestor?: (head: string, target: string) => Promise<boolean>;
  readonly resolveOrigin: (
    owner: string,
    name: string
  ) => Promise<{
    id: number;
    organizationId: number;
    defaultBranch?: string;
    disabled?: boolean;
  } | null>;
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
  if (!sameFilesystemRoot(workspace.root, root)) unsafe();
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
  if (
    repo?.disabled ||
    (repo?.defaultBranch !== undefined && repo.defaultBranch !== course.defaultBranch)
  )
    unsafe();
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
  const clean = !changed.length && !state.workingTree.untrackedPaths.length;
  if ((mode === "source_update" || mode === "cutover") && !clean) unsafe();
  if (
    (mode === "source_update" || mode === "cutover") &&
    state.upstream.kind === "configured" &&
    (state.upstream.relation === "ahead" || state.upstream.relation === "diverged")
  )
    unsafe();
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
    const behind =
      clean &&
      state.upstream.kind === "configured" &&
      state.upstream.relation !== "ahead" &&
      state.upstream.relation !== "diverged" &&
      (await (request.isAuthoritativeAncestor ?? workspace.isAncestor.bind(workspace))(
        head,
        authoritativeCommit
      ).catch(() => false));
    if (behind && mode === "source_update") return head;
    if (behind)
      blockMutation(
        "operational_source_updateable",
        "Course source is out of date. The registered course folder is clean and can be safely fast-forwarded to the latest course revision.",
        "update_source",
        course.repositoryId
      );
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
  readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
}
export class ManagedCourseMutationGuard {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly deps: Dependencies) {}
  transaction<T>(
    context: VerifiedCourseMutationContext,
    input: ManagedOperationInput,
    expectedRevision: unknown,
    allows: (file: string) => boolean,
    mutate: (root: string) => Promise<T>,
    changed: () => void
  ): Promise<T> {
    const login = this.deps.session.getState().identity?.login ?? `faculty-${context.userId}`;
    return publishManagedCourseTransaction({
      userData: this.deps.userData,
      context,
      input,
      expectedRevision,
      revalidateRepository: async () => {
        try {
          await context.revalidate?.();
          const repo = await revalidateManagedRepository({
            ...input,
            userData: this.deps.userData,
            username: this.deps.username(),
            reader: createRemoteRepositoryReader(input.token, input.signal),
            authenticate: () =>
              (this.deps.authenticate ?? createAuthenticatedProductionGitWorkspace)(input.token)
          });
          if (repo.defaultBranch !== input.course.defaultBranch)
            blockMutation(
              "operational_source_unsafe",
              "Course default branch changed. Refresh course state before retrying."
            );
        } catch (error) {
          if (error instanceof CourseMutationBlocked) throw error;
          requireSynchronizedCommit(input.course, synchronizationFailure(error));
          throw error;
        }
      },
      allows,
      mutate,
      changed,
      authenticate: this.deps.authenticate,
      factory: this.deps.factory,
      author: { name: login, email: `${context.userId}+${login}@users.noreply.github.com` }
    });
  }
  /** Compatibility selector, never a filesystem path or persisted registry record. */
  remoteSelectors(): CourseFolderRecord[] {
    const state = this.deps.session.getState();
    const userId = state.identity?.id;
    if (!userId || state.courseDiscovery.userId !== userId) return [];
    return state.courseDiscovery.courses
      .filter(
        (course) =>
          course.authorization === "authorized" &&
          (course.schemaVersion === 2 || course.localFolderIds.length === 0)
      )
      .map((course) => {
        const id = `managed-course:${userId}:${course.repositoryId}`;
        return {
          id,
          path: id,
          displayAlias: course.title,
          lastOpenedAt: "",
          lastRefreshedAt: null,
          lastDashboardStatus: null
        };
      });
  }
  private remoteSelector(folderId: unknown): CourseFolderRecord | undefined {
    return this.remoteSelectors().find((item) => item.id === folderId);
  }
  isManaged(folderId: unknown): boolean {
    if (this.remoteSelector(folderId)) return true;
    const state = this.deps.session.getState();
    const id = state.identity?.id;
    const catalog = id ? loadManagedCatalog(this.deps.userData, id) : null;
    return (
      !!catalog &&
      Object.values(catalog.courses).some(
        (entry) =>
          entry.operationalSource === "managed" &&
          state.courseDiscovery.courses.some(
            (course) =>
              course.repositoryId === entry.repositoryId &&
              (entry.operationalFolderIds?.includes(String(folderId)) ||
                course.localFolderIds.includes(String(folderId)))
          )
      )
    );
  }

  /** A persisted binding prevents signed-out/lost-access reads from reverting to the legacy source. */
  private hasManagedBinding(folderId: unknown): boolean {
    const root = path.join(this.deps.userData, MANAGED_COURSE_ROOT);
    if (!fs.existsSync(root)) return false;
    for (const id of fs.readdirSync(root).filter((name) => /^[1-9][0-9]*$/u.test(name))) {
      const catalog = loadManagedCatalog(this.deps.userData, Number(id));
      if (
        Object.values(catalog.courses).some(
          (entry) =>
            entry.operationalSource === "managed" &&
            entry.operationalFolderIds?.includes(String(folderId))
        )
      )
        return true;
    }
    return false;
  }
  async read<T>(
    folderId: unknown,
    suppliedPath: unknown,
    operation: (
      context?: VerifiedCourseMutationContext,
      input?: ManagedOperationInput
    ) => Promise<T>,
    managedRequest?: ManagedOperationRequest
  ): Promise<T> {
    const remote = this.remoteSelector(folderId);
    const folder = remote ?? this.deps.folders().find((item) => item.id === folderId);
    if (!folder || (suppliedPath !== undefined && suppliedPath !== folder.path))
      blockMutation(
        "operational_source_mismatch",
        "A matching registered course identity is required."
      );
    if (
      this.deps.session
        .getState()
        .courseDiscovery.diagnostics.some((item) => item.localFolderIds?.includes(String(folderId)))
    )
      blockMutation(
        "remote_only_mutation_unavailable",
        "Authoritative course access is unavailable. Refresh courses or update Graider before opening this folder."
      );
    if (this.isManaged(folderId))
      return this.run(folderId, suppliedPath, "read", operation, managedRequest);
    if (this.hasManagedBinding(folderId))
      blockMutation(
        "authorization_required",
        "Authorize the account that manages this course before opening it.",
        "authorization"
      );
    const managedRoot = path.join(this.deps.userData, MANAGED_COURSE_ROOT);
    const source = fs.existsSync(folder!.path)
      ? canonicalFilesystemRoot(folder!.path)
      : path.resolve(folder!.path);
    const storage = fs.existsSync(managedRoot) ? canonicalFilesystemRoot(managedRoot) : managedRoot;
    const relative = path.relative(storage, source);
    if (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
    )
      blockMutation(
        "remote_only_mutation_unavailable",
        "Managed repositories cannot be selected through a legacy path."
      );
    const state = this.deps.session.getState();
    const known = state.courseDiscovery.courses.find((course) =>
      course.localFolderIds.includes(folder!.id)
    );
    // Known v2 sources always enter the managed bridge, including uncut legacy folders.
    if (known?.schemaVersion === 2)
      return this.run(folderId, suppliedPath, "read", operation, managedRequest);
    if (known && state.identity && state.courseDiscovery.userId === state.identity.id)
      return this.deps.session.withReadOnlyCourse(
        known.repositoryId,
        state.identity.id,
        async (input) => {
          const reader = createRemoteRepositoryReader(input.token, input.signal);
          const repo = await reader.resolveId(known.repositoryId);
          if (
            !repo ||
            repo.id !== known.repositoryId ||
            repo.organizationId !== known.organizationId ||
            repo.disabled
          )
            blockMutation(
              "operational_source_mismatch",
              "Course repository identity changed. Refresh course access."
            );
          const access = await readRemoteCourseAccess(
            reader,
            repo!,
            input.userId,
            this.deps.username()
          );
          if (
            access.status !== "valid" ||
            loadMetadata().inspectOperationCourse(access.content).status !== "valid" ||
            access.authorization !== "authorized" ||
            !(await input.revalidateSession())
          )
            blockMutation(
              "remote_only_mutation_unavailable",
              "This course is unavailable through a legacy folder. Refresh courses and open Course details."
            );
          return operation();
        }
      );
    let local: ReturnType<ReturnType<typeof loadMetadata>["inspectOperationCourse"]>;
    try {
      local = loadMetadata().inspectOperationCourse(
        fs.readFileSync(path.join(folder!.path, "course.yml"), "utf8")
      );
    } catch {
      return blockMutation(
        "operation_unavailable",
        "Course metadata is unavailable. Refresh courses before opening this folder."
      );
    }
    if (local.status !== "valid")
      blockMutation(
        "operation_unavailable",
        "This folder requires fresh authoritative managed-course access. Refresh courses and open Course details."
      );
    const factory = this.deps.factory ?? getProductionGitWorkspaceFactory();
    const repository = await factory.inspect(folder!.path);
    if (repository.kind === "not_repository") return operation(); // Standalone Schema 1 preparation.
    if (repository.kind !== "repository" || !sameFilesystemRoot(repository.root, folder!.path))
      blockMutation(
        "operational_source_unsafe",
        "The registered course repository requires attention."
      );
    if (!state.identity || state.busy)
      blockMutation(
        "authorization_required",
        "Sign in and refresh authoritative course access before opening this repository.",
        "authorization"
      );
    return this.deps.session.withAuthenticatedAccount(async (account) => {
      const workspace = await factory.open(folder!.path);
      const locator = parseGithubOrigin(await workspace.remoteUrl("origin"));
      if (!locator)
        blockMutation(
          "operational_source_mismatch",
          "A verified GitHub course origin is required."
        );
      const reader = createRemoteRepositoryReader(account.token, account.signal);
      const remote = await reader.resolve(locator!.owner, locator!.name);
      if (!remote || remote.disabled)
        blockMutation(
          "course_access_lost",
          "The course repository is unavailable.",
          "authorization"
        );
      const access = await readRemoteCourseAccess(
        reader,
        remote!,
        account.userId,
        this.deps.username()
      );
      if (
        access.status !== "valid" ||
        access.schemaVersion !== 1 ||
        access.authorization !== "authorized" ||
        access.incomplete ||
        (await workspace.resolveHead()) !== access.revision ||
        !(await account.revalidateSession())
      )
        blockMutation(
          "operation_unavailable",
          "Current Schema 1 course access could not be established. Refresh courses and use the managed entry for Schema 2."
        );
      return operation();
    });
  }
  async cutover(folderId: unknown): Promise<void> {
    if (this.remoteSelector(folderId))
      throw new Error("Managed-only courses already use the managed source.");
    await this.run(folderId, undefined, "cutover", async (context, input) => {
      const entry = loadManagedCatalog(this.deps.userData, context.userId).courses[
        String(context.repositoryId)
      ];
      if (!entry || entry.organizationId !== input.course.organizationId)
        throw new Error("Managed catalog is unavailable.");
      saveEntry(this.deps.userData, {
        ...entry,
        operationalSource: "managed",
        operationalFolderIds: [...input.course.localFolderIds]
      });
    });
  }
  /** Trusted registry ID only; never resumes the mutation that prompted this operation. */
  updateSource(folderId: unknown, beforeWrite: () => void = () => {}): Promise<void> {
    if (this.remoteSelector(folderId))
      throw new Error("This course has no legacy source to update.");
    const faculty = this.deps.username();
    return this.run(folderId, undefined, "source_update", async (context, input) => {
      const factory = this.deps.factory ?? getProductionGitWorkspaceFactory();
      const oracle = await factory.open(
        managedCoursePath(this.deps.userData, input.userId, input.course.repositoryId)
      );
      const auth = (this.deps.authenticate ?? createAuthenticatedProductionGitWorkspace)(
        input.token
      );
      // The authenticated bundled backend exposes the synchronizer in addition to publication.
      const workspace = (await auth.factory.open(context.courseFolderPath)) as GitWorkspaceWriter &
        GitWorkspaceSynchronizer;
      const validate = () =>
        validateOperationalCourseSource({
          root: context.courseFolderPath,
          course: input.course,
          authoritativeCommit: context.authoritativeCommit,
          mode: "source_update",
          factory,
          isAuthoritativeAncestor: (head, target) => oracle.isAncestor(head, target),
          resolveOrigin: (owner, name) =>
            createRemoteRepositoryReader(input.token, input.signal).resolve(owner, name)
        });
      const active = async () => {
        if (input.signal.aborted || !(await input.revalidateSession()))
          blockMutation(
            "authorization_required",
            "Account authorization changed. Refresh course access.",
            "authorization"
          );
        if (
          !faculty ||
          this.deps.username() !== faculty ||
          !this.deps
            .folders()
            .some(
              (item) => item.id === context.courseFolderId && item.path === context.courseFolderPath
            )
        )
          blockMutation(
            "operational_source_mismatch",
            "Faculty identity or course registration changed. Refresh courses."
          );
      };
      await active();
      await validate();
      await workspace.fetchOrigin({ authentication: auth.authentication });
      const head = await validate();
      await active();
      // Reuse managed metadata/faculty verification after the network wait as well.
      try {
        const latest = await revalidateManagedRepository({
          ...input,
          userData: this.deps.userData,
          username: faculty,
          reader: createRemoteRepositoryReader(input.token, input.signal),
          authenticate: () => auth
        });
        if (latest.defaultBranch !== input.course.defaultBranch)
          blockMutation(
            "operational_source_unsafe",
            "The course default branch changed. Review the registered source before retrying."
          );
      } catch (error) {
        if (error instanceof CourseMutationBlocked) throw error;
        requireSynchronizedCommit(input.course, synchronizationFailure(error));
        throw error;
      }
      await active();
      // From this point every existing editor must reload, even if a final verification fails.
      beforeWrite();
      if (head !== context.authoritativeCommit)
        await workspace.fastForwardToCommit({
          expectedHead: head,
          expectedBranch: input.course.defaultBranch,
          targetCommit: context.authoritativeCommit,
          signal: input.signal
        });
      await active();
      if (
        (await validate()) !== context.authoritativeCommit ||
        (await oracle.resolveHead()) !== context.authoritativeCommit
      )
        blockMutation(
          "operational_source_stale",
          "Course state changed during update. Refresh the view and retry source synchronization.",
          "refresh_view",
          input.course.repositoryId
        );
      if (input.signal.aborted)
        blockMutation(
          "authorization_required",
          "Account authorization changed. Refresh course access.",
          "authorization"
        );
    });
  }
  async run<T>(
    folderId: unknown,
    suppliedPath: unknown,
    mode: CourseMutationMode,
    operation: (context: VerifiedCourseMutationContext, input: ManagedOperationInput) => Promise<T>,
    managedRequest?: ManagedOperationRequest
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
    const remote = this.remoteSelector(folderId);
    const folder = remote ?? this.deps.folders().find((item) => item.id === folderId);
    const storageRoot = path.join(this.deps.userData, MANAGED_COURSE_ROOT);
    if (
      folder &&
      fs.existsSync(storageRoot) &&
      fs.lstatSync(storageRoot).isSymbolicLink() &&
      sameFilesystemRoot(storageRoot, folder.path)
    )
      blockMutation(
        "remote_only_mutation_unavailable",
        "Managed repositories cannot be registered as legacy sources."
      );
    const persisted = loadManagedCatalog(this.deps.userData, userId!).courses;
    const binding = Object.values(persisted).find(
      (entry) =>
        entry.operationalSource === "managed" &&
        entry.operationalFolderIds?.includes(String(folderId))
    );
    const courses = state.courseDiscovery.courses.filter((item) =>
      remote
        ? remote.id === `managed-course:${userId}:${item.repositoryId}`
        : binding
          ? item.repositoryId === binding.repositoryId
          : item.localFolderIds.includes(String(folderId))
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
        if (
          !remote &&
          !this.deps.folders().some((item) => item.id === folder.id && item.path === folder.path)
        )
          blockMutation(
            "operational_source_mismatch",
            "Course registration changed. Retry after refreshing courses."
          );
        return session.withSynchronizedCourse(course.repositoryId, userId!, async (input, sync) => {
          if (
            !remote &&
            !input.course.localFolderIds.includes(folder.id) &&
            binding?.repositoryId !== input.course.repositoryId
          )
            blockMutation(
              "operational_source_mismatch",
              "Course registration no longer matches authorized discovery."
            );
          const authoritativeCommit = requireSynchronizedCommit(input.course, sync);
          // Inspect declared operation support on the freshly synchronized source;
          // discovery schema, parser support and local usernames cannot enable an adapter.
          const operational = loadMetadata().inspectManagedOperationCourse(
            fs.readFileSync(
              path.join(
                managedCoursePath(this.deps.userData, input.userId, input.course.repositoryId),
                "course.yml"
              ),
              "utf8"
            )
          );
          if (operational.status !== "valid")
            blockMutation(
              "remote_only_mutation_unavailable",
              "This client cannot operate the authoritative course schema. Update Graider or refresh Course details to inspect available metadata."
            );
          if (operational.status !== "valid") throw new Error("Unsupported course schema.");
          const operationUsername = operational.schemaVersion === 1 ? this.deps.username() : null;
          const source = managedCoursePath(this.deps.userData, input.userId, course.repositoryId);
          const revalidate = async (expectedRevision = authoritativeCommit) => {
            if (operational.schemaVersion === 1 && operationUsername !== this.deps.username())
              blockMutation(
                "faculty_identity_required",
                "Faculty identity changed. Reload the course before writing.",
                "faculty_settings"
              );
            const reader = createRemoteRepositoryReader(input.token, input.signal);
            const repo = await reader.resolveId(input.course.repositoryId);
            if (repo && repo.organizationId !== input.course.organizationId)
              blockMutation(
                "organization_migration_required",
                "Course organization changed. Migration/reconciliation is required."
              );
            if (
              !repo ||
              repo.disabled ||
              repo.defaultBranch !== input.course.defaultBranch ||
              input.signal.aborted ||
              !(await input.revalidateSession())
            )
              blockMutation(
                "course_access_lost",
                "Current course identity or account authorization changed.",
                "authorization"
              );
            const access = await readRemoteCourseAccess(
              reader,
              repo!,
              input.userId,
              operationUsername
            );
            if (access.status === "valid" && access.revision !== expectedRevision) {
              await input.resynchronize?.();
              blockMutation(
                "remote_version_conflict",
                "The authoritative course changed. Refresh the view before retrying.",
                "refresh_view"
              );
            }
            if (
              access.status !== "valid" ||
              access.authorization !== "authorized" ||
              access.incomplete ||
              access.revision !== expectedRevision ||
              access.schemaVersion !== operational.schemaVersion ||
              access.content !== fs.readFileSync(path.join(source, "course.yml"), "utf8") ||
              Object.entries(access.termContents).some(
                ([code, bytes]) =>
                  bytes !== fs.readFileSync(path.join(source, "terms", code, "term.yml"), "utf8")
              ) ||
              !(await input.revalidateSession())
            )
              blockMutation(
                "operational_source_stale",
                "Authoritative schema, revision or faculty authority changed. Refresh courses.",
                "refresh_view"
              );
          };
          if (operational.schemaVersion === 2) {
            if (!managedRequest || mode === "source_update" || mode === "cutover")
              blockMutation(
                "operation_unavailable",
                "Schema 2 requires an explicit supported managed operation. Use Course details; legacy source updates and cutover are unavailable."
              );
            const context: VerifiedCourseMutationContext = {
              managed: true,
              sessionGeneration: generation,
              legacyFolderPath: folder.path,
              userId: input.userId,
              repositoryId: course.repositoryId,
              authoritativeCommit,
              operationalCommit: authoritativeCommit,
              courseFolderId: folder.id,
              courseFolderPath: source,
              mode
            };
            return (await performManagedV2Operation(managedRequest!, {
              userData: this.deps.userData,
              context,
              input: {
                ...input,
                course: { ...input.course, schemaVersion: operational.schemaVersion }
              },
              revalidate,
              changed: () => managedRequest?.onChanged?.(context),
              factory: this.deps.factory,
              authenticate: this.deps.authenticate
            })) as T;
          }
          if (!this.deps.username())
            blockMutation(
              "faculty_identity_required",
              "Configure your MSOE username before making course changes.",
              "faculty_settings",
              course.repositoryId
            );
          const managedRoot = path.join(this.deps.userData, MANAGED_COURSE_ROOT);
          if (
            fs.existsSync(managedRoot) &&
            fs.lstatSync(managedRoot).isSymbolicLink() &&
            sameFilesystemRoot(managedRoot, folder.path)
          )
            blockMutation(
              "remote_only_mutation_unavailable",
              "Managed repositories cannot be registered as legacy sources."
            );
          const managed =
            !!remote ||
            loadManagedCatalog(this.deps.userData, input.userId).courses[
              String(course.repositoryId)
            ]?.operationalSource === "managed";
          const useManaged = managed && mode !== "source_update";
          const relative = path.relative(
            fs.existsSync(managedRoot) ? canonicalFilesystemRoot(managedRoot) : managedRoot,
            useManaged ? folder.path : canonicalFilesystemRoot(folder.path)
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
          const operationalCommit = useManaged
            ? authoritativeCommit
            : await validateOperationalCourseSource({
                root: folder.path,
                course: input.course,
                authoritativeCommit,
                mode,
                factory: this.deps.factory ?? getProductionGitWorkspaceFactory(),
                isAuthoritativeAncestor: async (head, target) => {
                  const oracle = await (
                    this.deps.factory ?? getProductionGitWorkspaceFactory()
                  ).open(
                    managedCoursePath(this.deps.userData, input.userId, input.course.repositoryId)
                  );
                  return oracle.isAncestor(head, target);
                },
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
            !remote &&
            !this.deps.folders().some((item) => item.id === folder.id && item.path === folder.path)
          )
            blockMutation(
              "operational_source_mismatch",
              "Course registration changed during validation. Retry after refreshing courses."
            );
          if (useManaged) {
            const source = managedCoursePath(this.deps.userData, input.userId, course.repositoryId);
            const runtime = path.join(path.dirname(source), "runtime");
            safeDirectories(this.deps.userData, runtime, true);
            loadMetadata().registerCourseRuntimeRoot(source, runtime);
            const entry = loadManagedCatalog(this.deps.userData, input.userId).courses[
              String(course.repositoryId)
            ];
            if (!remote && entry && !entry.operationalFolderIds?.includes(folder.id))
              saveEntry(this.deps.userData, {
                ...entry,
                operationalFolderIds: [...(entry.operationalFolderIds ?? []), folder.id]
              });
          }
          await revalidate();
          operationStarted = true;
          return operation(
            {
              revalidate,
              managed: useManaged,
              legacyFolderPath: folder.path,
              sessionGeneration: generation,
              userId: input.userId,
              repositoryId: course.repositoryId,
              authoritativeCommit,
              operationalCommit,
              courseFolderId: folder.id,
              courseFolderPath: useManaged
                ? managedCoursePath(this.deps.userData, input.userId, course.repositoryId)
                : folder.path,
              mode
            },
            input
          );
        });
      })
      .catch((error) => {
        if (error instanceof CourseMutationBlocked) {
          if (error.result.action === "update_source")
            throw new CourseMutationBlocked({ ...error.result, courseFolderId: folder.id });
          throw error;
        }
        if (operationStarted) throw error;
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
