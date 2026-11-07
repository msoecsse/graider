import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadMetadata } from "./remoteCourseDiscovery.js";
import { inspectChangedFiles } from "./coursePublishService.js";
import {
  accountRoot,
  safeDirectories,
  validateManagedStorage,
  loadManagedCatalog,
  saveEntry
} from "./managedCourses.js";
import {
  createAuthenticatedProductionGitWorkspace,
  getProductionGitWorkspaceFactory,
  createRelativeGitPath,
  type AuthenticatedGitWorkspaceContext,
  type GitWorkspaceSynchronizer,
  type GitWorkspaceWriter,
  type GitWorkspaceFactory
} from "./gitWorkspaceReader.js";
import { blockMutation, type VerifiedCourseMutationContext } from "./managedCourseMutationGuard.js";
import type { ManagedOperationInput } from "./githubOAuthSession.js";

const TRANSACTION_CLEANUP_RETRIES = 5;
const TRANSACTION_CLEANUP_DELAY_MS = 100;

// Git status omits ignored files. Include them in transaction validation so a generated
// ignored config cannot be reported as published, and hidden side effects cannot escape review.
const snapshot = (root: string): Map<string, string> => {
  const files = new Map<string, string>();
  const visit = (directory: string, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!prefix && entry.name === ".git") continue;
      const relative = `${prefix}${entry.name}`,
        absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, `${relative}/`);
      else if (entry.isFile())
        files.set(relative, createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"));
      else throw new Error("Unsafe transaction file.");
    }
  };
  visit(root);
  return files;
};

export interface ManagedTransactionRequest<T> {
  readonly userData: string;
  readonly context: VerifiedCourseMutationContext;
  readonly input: ManagedOperationInput;
  readonly expectedRevision: unknown;
  readonly revalidateRepository?: () => Promise<void>;
  readonly author: { readonly name: string; readonly email: string };
  readonly allows: (file: string) => boolean;
  /** Internal backend policy only. Production callers retain the operational v1 default. */
  readonly validateMetadata?: (root: string, organization: string) => void;
  /** Trusted internal path policy for v2 lifecycle/checkpoint transactions; v1 defaults remain unchanged. */
  readonly validateChangedPaths?: (paths: readonly string[]) => void;
  readonly mutate: (transactionPath: string) => Promise<T>;
  readonly changed: () => void;
  readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
  readonly factory?: GitWorkspaceFactory;
  /** Main-only migration policy. Existing callers keep their validation/transaction semantics. */
  readonly publication?: {
    readonly beforeStage: (root: string) => Promise<void>;
    readonly beforePush: (root: string, commit: string) => Promise<void>;
    readonly verifyAcceptance: true;
  };
}
export const requireReadRevision = (
  expected: unknown,
  context: VerifiedCourseMutationContext
): void => {
  if (expected !== context.authoritativeCommit)
    blockMutation(
      "remote_version_conflict",
      "The course changed remotely. Your form has been preserved. Refresh the view before saving again.",
      "refresh_view",
      context.repositoryId
    );
};

/** Runs inside the existing user/repository lease. The active cache is never edited. */
export const publishManagedCourseTransaction = async <T>(
  request: ManagedTransactionRequest<T>
): Promise<T> => {
  const { context, input } = request;
  requireReadRevision(request.expectedRevision, context);
  const auth = (request.authenticate ?? createAuthenticatedProductionGitWorkspace)(input.token);
  const factory = request.factory ?? getProductionGitWorkspaceFactory();
  const temporaryRoot = path.join(accountRoot(request.userData, input.userId), ".transactions");
  safeDirectories(request.userData, temporaryRoot, true);
  const temporary = fs.mkdtempSync(path.join(temporaryRoot, "course-"));
  const identity = fs.lstatSync(temporary);
  const root = path.join(temporary, "repo");
  let mutationResult: T | undefined;
  const changed = () => {
    try {
      request.changed();
    } catch {
      /* A closed renderer cannot change publication outcome. */
    }
  };
  let refreshedCommit: string | undefined;
  let published: string | undefined;
  let attempted = false;
  let transactionCommit: string | undefined;
  const active = async () => {
    if (input.signal.aborted || !(await input.revalidateSession()))
      blockMutation(
        "authorization_required",
        "Account authorization changed. Refresh course access.",
        "authorization"
      );
  };
  const refresh = async (afterPublication = false): Promise<boolean> => {
    try {
      const sync = await input.resynchronize?.(afterPublication);
      if (sync?.currentCommit && sync.currentCommit !== context.authoritativeCommit) changed();
      let ready =
        (sync?.status === "updated" || sync?.status === "up_to_date") && !!sync.currentCommit;
      if (ready && request.publication && published) {
        const cache = await factory.open(context.courseFolderPath);
        ready =
          (await cache.resolveHead()) === sync!.currentCommit &&
          (await cache.isAncestor(published, sync!.currentCommit!));
      }
      if (ready) refreshedCommit = sync!.currentCommit;
      return ready;
    } catch {
      return false;
    }
  };
  const remember = (
    status: "published" | "refresh_required" | "outcome_unknown",
    commit: string
  ) => {
    const entry = loadManagedCatalog(request.userData, input.userId).courses[
      String(context.repositoryId)
    ];
    if (entry) saveEntry(request.userData, { ...entry, lastPublication: { status, commit } });
  };
  const stale = (): never =>
    blockMutation(
      "remote_version_conflict",
      "Another machine changed the course. No transaction was published. Refresh the view to use the current course.",
      "refresh_view",
      context.repositoryId
    );
  try {
    await active();
    // Only the authorized, normalized GitHub locator can select this temporary repository.
    await auth.factory.clone({
      remote: `${input.course.url}.git`,
      destination: root,
      checkout: "default",
      authentication: auth.authentication
    });
    const workspace = (await auth.factory.open(root)) as GitWorkspaceWriter &
      GitWorkspaceSynchronizer;
    const reader = await factory.open(root);
    const initial = await workspace.inspect();
    if (
      validateManagedStorage(request.userData, root).length ||
      initial.head.kind !== "attached" ||
      initial.head.branch !== input.course.defaultBranch ||
      initial.head.commit !== context.authoritativeCommit
    ) {
      await refresh();
      changed();
      stale();
    }
    if (
      initial.workingTree.trackedChanges.length ||
      initial.workingTree.stagedChanges.length ||
      initial.workingTree.untrackedPaths.length ||
      initial.workingTree.conflicts.length
    )
      throw new Error("Unsafe transaction repository.");
    await active();
    const beforeFiles = snapshot(root);
    const result = await request.mutate(root);
    mutationResult = result;
    if (
      !result ||
      typeof result !== "object" ||
      !("status" in result) ||
      result.status !== "success"
    )
      return result;
    if (validateManagedStorage(request.userData, root).length)
      throw new Error("Unsafe transaction storage.");
    (request.validateMetadata ?? loadMetadata().validateTransaction)(
      root,
      input.course.organizationLogin
    );
    const state = await workspace.inspect();
    if (
      state.head.kind !== "attached" ||
      state.head.commit !== context.authoritativeCommit ||
      state.head.branch !== input.course.defaultBranch ||
      state.workingTree.conflicts.length
    )
      throw new Error("Transaction base changed.");
    const afterFiles = snapshot(root);
    const filesystemChanges = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].filter(
      (file) => beforeFiles.get(file) !== afterFiles.get(file)
    );
    const treeChanges = [...state.workingTree.trackedChanges, ...state.workingTree.stagedChanges];
    const paths = [
      ...new Set([
        ...treeChanges.flatMap((item) => [
          item.path,
          ...(item.originalPath ? [item.originalPath] : [])
        ]),
        ...state.workingTree.untrackedPaths,
        ...filesystemChanges
      ])
    ];
    if (request.validateChangedPaths) request.validateChangedPaths(paths);
    else if (inspectChangedFiles(paths).unrelated.length)
      throw new Error("Unexpected files in course transaction.");
    if (paths.some((file) => !request.allows(file)))
      throw new Error("Unexpected files in course transaction.");
    if (!paths.length) return result;
    await request.publication?.beforeStage(root);
    const stage = paths.map(createRelativeGitPath);
    if (stage.some((file) => file === null)) throw new Error("Unsafe transaction path.");
    await workspace.stage(stage.filter((file) => file !== null));
    const staged = await workspace.inspect();
    if (
      staged.workingTree.stagedChanges.some(
        (item) =>
          !paths.includes(item.path) || (item.originalPath && !paths.includes(item.originalPath))
      )
    )
      throw new Error("Unrelated staged files.");
    transactionCommit = await workspace.commit({
      message: "Publish Graider course changes",
      author: request.author
    });
    await active();
    // Recheck immutable repository/organization and pre-write remote authorization.
    await request.revalidateRepository?.();
    // Authenticated freshness check, followed by a non-force push. No merge/rebase/retry.
    await workspace.fetchOrigin({ authentication: auth.authentication });
    if (
      (await reader.resolveRevision(`refs/remotes/origin/${input.course.defaultBranch}`)) !==
      context.authoritativeCommit
    ) {
      await refresh();
      changed();
      stale();
    }
    await active();
    await request.publication?.beforePush(root, transactionCommit);
    if (request.publication && (await reader.resolveHead()) !== transactionCommit)
      throw new Error("Validated migration commit changed before push.");
    attempted = true;
    try {
      if (!workspace.pushBranch) throw new Error("Course publication capability is unavailable.");
      await workspace.pushBranch({
        remote: "origin",
        branch: input.course.defaultBranch,
        authentication: auth.authentication
      });
      if (request.publication?.verifyAcceptance) {
        await workspace.fetchOrigin({ authentication: auth.authentication });
        const remote = await reader.resolveRevision(
          `refs/remotes/origin/${input.course.defaultBranch}`
        );
        if (remote !== transactionCommit && !(await reader.isAncestor(transactionCommit, remote)))
          throw new Error("Remote acceptance was not independently verified.");
      }
      published = transactionCommit;
    } catch {
      // A transport failure can occur after the server accepted a push. Establish outcome first.
      try {
        await workspace.fetchOrigin({ authentication: auth.authentication });
        const remote = await reader.resolveRevision(
          `refs/remotes/origin/${input.course.defaultBranch}`
        );
        if (remote === transactionCommit || (await reader.isAncestor(transactionCommit, remote)))
          published = transactionCommit;
        else {
          await refresh();
          changed();
          if (remote !== context.authoritativeCommit) stale();
          blockMutation(
            "publication_failed",
            "Course publication failed. No course changes were published; the managed cache is preserved.",
            "retry",
            context.repositoryId
          );
        }
      } catch (error) {
        if (error && typeof error === "object" && "result" in error) throw error;
        try {
          remember("outcome_unknown", transactionCommit);
        } catch {
          /* Preserve outcome below. */
        }
        await refresh(true);
        changed();
        const containsPublication =
          refreshedCommit &&
          (await (await factory.open(context.courseFolderPath))
            .isAncestor(transactionCommit, refreshedCommit)
            .catch(() => false));
        if (containsPublication) published = transactionCommit;
        else
          blockMutation(
            "publication_outcome_unknown",
            "GitHub did not confirm publication. Refresh course access and inspect the course before retrying; the remote mutation will not be retried automatically.",
            "attention",
            context.repositoryId
          );
      }
    }
    let refreshed = false;
    try {
      remember("published", published!);
    } catch {
      /* Remote commit remains authoritative. */
    }
    refreshed = await refresh(true);
    try {
      remember(refreshed ? "published" : "refresh_required", published!);
    } catch {
      refreshed = false;
    }
    changed();
    return {
      ...result,
      ...(!refreshed
        ? {
            diagnostics: [
              ...((result as { diagnostics?: unknown[] }).diagnostics ?? []),
              {
                message:
                  "Published remotely. Local course refresh needs attention. Do not repeat this mutation; refresh courses."
              }
            ]
          }
        : {}),
      courseReadRevision: published,
      publication: {
        status: "success",
        commit: published,
        refreshRequired: !refreshed,
        diagnostics: [
          {
            message: refreshed
              ? "Course changes published."
              : "Published remotely. Local course refresh needs attention. Do not repeat this mutation; refresh courses."
          }
        ]
      }
    };
  } catch (error) {
    if (published) {
      await refresh(true);
      changed();
      // Never report a remote success as a failure or attempt to undo it.
      return {
        ...mutationResult,
        status: "success",
        courseReadRevision: published,
        publication: {
          status: "success",
          commit: published,
          refreshRequired: true,
          diagnostics: [
            {
              message:
                "Published remotely. Local course refresh needs attention. Do not repeat this mutation."
            }
          ]
        }
      } as T;
    }
    if (error && typeof error === "object" && "result" in error) throw error;
    await refresh();
    return blockMutation(
      attempted ? "publication_outcome_unknown" : "publication_failed",
      attempted
        ? "Publication outcome requires attention. Refresh courses before retrying."
        : "Course changes could not be validated or published. No course changes were published.",
      "attention",
      context.repositoryId
    );
  } finally {
    // Only this service's newly created, still-owned transaction directory is disposable.
    try {
      safeDirectories(request.userData, temporary);
      const current = fs.lstatSync(temporary);
      if (
        current.dev === identity.dev &&
        current.ino === identity.ino &&
        path.dirname(temporary) === temporaryRoot
      )
        fs.rmSync(temporary, {
          recursive: true,
          maxRetries: TRANSACTION_CLEANUP_RETRIES,
          retryDelay: TRANSACTION_CLEANUP_DELAY_MS
        });
    } catch {
      /* Retain evidence when ownership cannot be established. */
    }
  }
};

/** Read-only authoritative-outcome observation using the same isolated bundled-Git
 * infrastructure as publication. It never stages, commits, pushes or edits a cache.
 */
export const observeManagedCoursePublication = async (request: {
  readonly userData: string;
  readonly input: ManagedOperationInput;
  readonly verifyCommit: (root: string, remoteCommit: string) => Promise<boolean>;
  readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
  readonly factory?: GitWorkspaceFactory;
}): Promise<{ readonly accepted: boolean; readonly remoteCommit: string }> => {
  const { input } = request;
  const temporaryRoot = path.join(accountRoot(request.userData, input.userId), ".transactions");
  safeDirectories(request.userData, temporaryRoot, true);
  const temporary = fs.mkdtempSync(path.join(temporaryRoot, "course-"));
  const identity = fs.lstatSync(temporary);
  try {
    const root = path.join(temporary, "repo");
    const auth = (request.authenticate ?? createAuthenticatedProductionGitWorkspace)(input.token);
    await auth.factory.clone({
      remote: `${input.course.url}.git`,
      destination: root,
      checkout: "default",
      authentication: auth.authentication
    });
    if (validateManagedStorage(request.userData, root).length)
      throw new Error("Unsafe recovery workspace.");
    const reader = await (request.factory ?? getProductionGitWorkspaceFactory()).open(root);
    const remoteCommit = await reader.resolveRevision(
      `refs/remotes/origin/${input.course.defaultBranch}`
    );
    const accepted = await request.verifyCommit(root, remoteCommit);
    return { accepted, remoteCommit };
  } finally {
    safeDirectories(request.userData, temporary);
    const current = fs.lstatSync(temporary);
    if (
      current.dev === identity.dev &&
      current.ino === identity.ino &&
      path.dirname(temporary) === temporaryRoot
    )
      fs.rmSync(temporary, {
        recursive: true,
        maxRetries: TRANSACTION_CLEANUP_RETRIES,
        retryDelay: TRANSACTION_CLEANUP_DELAY_MS
      });
  }
};
