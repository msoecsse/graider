import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  Attention,
  accountRoot,
  assertActive,
  catalogEntry,
  classify,
  identityComponent,
  managedCoursePath,
  performSynchronization,
  revalidateManagedRepository,
  safeDirectories,
  saveEntry,
  serializeManagedOperation,
  state,
  synchronizationFailure,
  validateClone,
  validateManagedStorage
} from "./managedCourses.js";
import { parseGithubOrigin } from "./remoteCourseDiscovery.js";
import { createRelativeGitPath } from "./gitWorkspaceReader.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";
import type { ManagedSynchronizationRequest } from "./managedCourses.js";
import type { CourseRepository } from "./githubRemoteRepositories.js";
import type {
  ManagedReconciliationEvidence,
  ManagedReconciliationState,
  ManagedSynchronizationState
} from "./remoteCourseTypes.js";

export const LOCAL_COMMIT_REVIEW_LIMIT = 10;
export const RECOVERY_SCHEMA_VERSION = 1;
const FINGERPRINT_BUFFER_BYTES = 64 * 1024;
const PRIVATE_FILE_MODE = 0o600;
const SHORT_COMMIT_LENGTH = 12;
const MAX_SUBJECT_LENGTH = 300;
const RECOVERY_ROOT = ".recovery";
const RECONCILE_ROOT = ".reconcile";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const STALE_PLAN_MESSAGE =
  "Managed cache changed since review. Review it again before restoring.";
const ELIGIBLE_REASONS = new Set<ManagedSynchronizationState["reason"]>([
  "local_changes",
  "local_ahead",
  "diverged",
  "detached_head",
  "upstream_missing",
  "default_branch_changed",
  "interrupted_operation",
  "wrong_repository"
]);
export interface ReconciliationRequest extends ManagedSynchronizationRequest {
  readonly sessionGeneration: number;
  readonly onReconciliationProgress: (state: ManagedReconciliationState) => void;
}
interface Review {
  readonly repo: CourseRepository;
  readonly evidence: ManagedReconciliationEvidence;
  readonly reason: ManagedSynchronizationState["reason"];
  readonly fingerprint: string;
}
interface Plan extends Review {
  readonly userId: number;
  readonly generation: number;
  readonly repositoryId: number;
}
export type RecoveryCompletion =
  | "preparing"
  | "preserved"
  | "replacement_active"
  | "completed"
  | "rollback_restored"
  | "manual_review_required";
export interface RecoveryManifest {
  readonly schemaVersion: typeof RECOVERY_SCHEMA_VERSION;
  readonly recoveryId: string;
  readonly createdAt: string;
  readonly userId: number;
  readonly repositoryId: number;
  readonly organizationId: number;
  readonly organizationLogin: string;
  readonly name: string;
  readonly fullName: string;
  readonly reason: ManagedSynchronizationState["reason"];
  readonly originalStatus: "needs_attention";
  readonly changedPathCounts: Readonly<
    Record<ManagedReconciliationEvidence["files"][number]["category"], number>
  >;
  readonly evidence: ManagedReconciliationEvidence;
  readonly replacementCommit: string | null;
  readonly completion: RecoveryCompletion;
}
const safeText = (value: string): string => value.replace(/[\u0000-\u001f\u007f]/gu, " ");
const recoveryDirectory = (
  userData: string,
  userId: number,
  repositoryId: number,
  recoveryId: string
): string => {
  if (!UUID_PATTERN.test(recoveryId)) throw new Attention("Invalid recovery identity.");
  return path.join(
    accountRoot(userData, userId),
    RECOVERY_ROOT,
    identityComponent(repositoryId),
    recoveryId
  );
};
/** Hash every regular file, including ignored files, index, objects, reflogs and operation state.
 * Status inspection precedes hashing. No Git process runs during the fingerprint walk.
 */
export const fingerprintManagedCache = (
  userData: string,
  root: string,
  projection: unknown
): string => {
  validateManagedStorage(userData, root);
  const hash = createHash("sha256").update(JSON.stringify(projection));
  const walk = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      hash.update(JSON.stringify([path.relative(root, file), stat.mode, stat.dev, stat.ino]));
      if (stat.isDirectory()) walk(file);
      else {
        if (!stat.isFile() || stat.nlink !== 1) throw new Attention("Manual review required.");
        const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          const opened = fs.fstatSync(fd);
          if (opened.dev !== stat.dev || opened.ino !== stat.ino)
            throw new Error(STALE_PLAN_MESSAGE);
          const buffer = Buffer.alloc(FINGERPRINT_BUFFER_BYTES);
          let bytes = fs.readSync(fd, buffer);
          for (; bytes > 0; bytes = fs.readSync(fd, buffer)) hash.update(buffer.subarray(0, bytes));
          const after = fs.fstatSync(fd);
          if (
            opened.size !== after.size ||
            opened.mtimeMs !== after.mtimeMs ||
            opened.ctimeMs !== after.ctimeMs
          )
            throw new Error(STALE_PLAN_MESSAGE);
        } finally {
          fs.closeSync(fd);
        }
      }
    }
  };
  walk(root);
  return hash.digest("hex");
};
const inspectReview = async (request: ReconciliationRequest): Promise<Review> => {
  const repo = await revalidateManagedRepository(request);
  const root = managedCoursePath(request.userData, request.userId, repo.id);
  const operations = validateManagedStorage(request.userData, root);
  const workspace = await request.authenticate().factory.open(root);
  if (fs.realpathSync(workspace.root) !== fs.realpathSync(root))
    throw new Attention("Manual review required: invalid worktree root.");
  const locator = parseGithubOrigin(await workspace.remoteUrl("origin"));
  if (!locator)
    throw new Attention("Manual review required: repository identity cannot be established.");
  const actual = await request.reader.resolve(locator.owner, locator.name);
  if (!actual)
    throw new GithubOAuthError(
      "repository_inaccessible",
      "Repository identity is unavailable. Refresh courses and retry."
    );
  if (actual.id === repo.id && actual.organizationId !== repo.organizationId)
    throw new Attention("Organization migration/reconciliation required.", "organization_transfer");
  const observed = await workspace.inspect({ readOnly: true });
  const reason =
    actual.id !== repo.id
      ? "wrong_repository"
      : operations.length
        ? "interrupted_operation"
        : classify(observed, repo.defaultBranch)?.reason;
  if (!ELIGIBLE_REASONS.has(reason))
    throw new Attention(
      "This cache does not require local reconciliation.",
      reason ?? "unsafe_repository"
    );
  const files: ManagedReconciliationEvidence["files"][number][] = [];
  const add = (
    category: ManagedReconciliationEvidence["files"][number]["category"],
    value: string,
    original?: string
  ): void => {
    const normalized = createRelativeGitPath(value);
    const originalPath = original ? createRelativeGitPath(original) : null;
    if (
      !normalized ||
      normalized.split("/").some((part) => part.toLowerCase() === ".git") ||
      (original && !originalPath)
    )
      throw new Attention("Manual review required: unexpected changed path.");
    files.push({ category, path: normalized, ...(originalPath ? { originalPath } : {}) });
  };
  for (const file of observed.workingTree.trackedChanges) {
    const category =
      file.kind === "added"
        ? "Added"
        : file.kind === "deleted"
          ? "Deleted"
          : file.kind === "renamed"
            ? "Renamed"
            : "Modified";
    add(category, file.path, file.originalPath);
  }
  for (const file of observed.workingTree.stagedChanges) {
    add("Staged", file.path, file.originalPath);
    if (file.kind === "added" || file.kind === "deleted" || file.kind === "renamed")
      add(
        file.kind === "added" ? "Added" : file.kind === "deleted" ? "Deleted" : "Renamed",
        file.path,
        file.originalPath
      );
  }
  for (const file of observed.workingTree.untrackedPaths) add("Untracked", file);
  for (const file of observed.workingTree.conflicts) add("Conflict", file.path);
  const local =
    observed.head.kind !== "unborn" && workspace.localOnlyCommits
      ? await workspace.localOnlyCommits(LOCAL_COMMIT_REVIEW_LIMIT)
      : null;
  const evidence: ManagedReconciliationEvidence = {
    head: {
      kind: observed.head.kind,
      branch: observed.head.kind === "detached" ? null : observed.head.branch,
      commit: observed.head.kind === "unborn" ? null : observed.head.commit
    },
    upstream:
      observed.upstream.kind === "missing"
        ? { kind: "missing" }
        : {
            kind: "configured",
            branch: safeText(observed.upstream.branch),
            remote:
              observed.upstream.remote && /^[A-Za-z0-9._-]+$/u.test(observed.upstream.remote)
                ? observed.upstream.remote
                : null,
            ahead: observed.upstream.ahead,
            behind: observed.upstream.behind,
            relation: observed.upstream.relation
          },
    files: files.sort((a, b) => `${a.path}:${a.category}`.localeCompare(`${b.path}:${b.category}`)),
    localCommits: {
      count: local?.count ?? null,
      commits: (local?.commits ?? []).slice(0, LOCAL_COMMIT_REVIEW_LIMIT).map((commit) => ({
        id: commit.id.slice(0, SHORT_COMMIT_LENGTH),
        subject: safeText(commit.subject).slice(0, MAX_SUBJECT_LENGTH),
        committedAt: commit.committedAt
      }))
    },
    operations,
    defaultBranch: repo.defaultBranch
  };
  assertActive(request);
  return {
    repo,
    reason,
    evidence,
    fingerprint: fingerprintManagedCache(request.userData, root, {
      repositoryId: repo.id,
      userId: request.userId,
      reason,
      evidence
    })
  };
};
const result = (
  request: ReconciliationRequest,
  status: ManagedReconciliationState["status"],
  extra: Partial<ManagedReconciliationState> = {}
): ManagedReconciliationState => ({
  repositoryId: request.course.repositoryId,
  status,
  eligible: false,
  diagnostic: null,
  retryable: false,
  ...extra
});
const failure = (request: ReconciliationRequest, error: unknown): ManagedReconciliationState => {
  if (error instanceof Error && error.message === STALE_PLAN_MESSAGE)
    return result(request, "stale_plan", { diagnostic: STALE_PLAN_MESSAGE });
  const problem = synchronizationFailure(error);
  return result(
    request,
    problem.reason === "unsafe_repository" ? "manual_review_required" : "failed",
    {
      reason: problem.reason,
      diagnostic:
        problem.reason === "unsafe_repository"
          ? "Manual review required. The complete Git storage cannot be safely preserved automatically."
          : problem.diagnostic,
      retryable: problem.retryable
    }
  );
};
const writeManifest = (request: ReconciliationRequest, manifest: RecoveryManifest): void => {
  const directory = recoveryDirectory(
    request.userData,
    request.userId,
    manifest.repositoryId,
    manifest.recoveryId
  );
  safeDirectories(request.userData, directory);
  const file = path.join(directory, "manifest.json");
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).nlink !== 1))
    throw new Attention("Recovery manifest storage is unsafe.", "local_storage_failure");
  const temporary = path.join(directory, `manifest-${randomUUID()}.tmp`);
  // Only a constructed, whitelisted record is written; no errors, paths, URLs or request objects.
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2), {
    flag: "wx",
    mode: PRIVATE_FILE_MODE
  });
  fs.renameSync(temporary, file);
};
/** Each recovery owns its manifest; there is no second index to commit transactionally. */
export const resolvePreservedCopy = (
  userData: string,
  userId: number,
  repositoryId: number,
  recoveryId: string
): string => {
  const directory = recoveryDirectory(userData, userId, repositoryId, recoveryId);
  safeDirectories(userData, directory);
  const file = path.join(directory, "manifest.json");
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new Attention("Invalid recovery record.");
  const record = JSON.parse(fs.readFileSync(file, "utf8")) as RecoveryManifest;
  const expectedFields = [
    "schemaVersion",
    "recoveryId",
    "createdAt",
    "userId",
    "repositoryId",
    "organizationId",
    "organizationLogin",
    "name",
    "fullName",
    "reason",
    "originalStatus",
    "changedPathCounts",
    "evidence",
    "replacementCommit",
    "completion"
  ].sort();
  if (
    JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedFields) ||
    !Number.isSafeInteger(record.organizationId) ||
    record.organizationId <= 0 ||
    ![record.organizationLogin, record.name, record.fullName, record.createdAt].every(
      (value) => typeof value === "string"
    ) ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    !ELIGIBLE_REASONS.has(record.reason) ||
    record.originalStatus !== "needs_attention" ||
    !record.changedPathCounts ||
    !Object.values(record.changedPathCounts).every(
      (count) => Number.isSafeInteger(count) && count >= 0
    ) ||
    !record.evidence ||
    !Array.isArray(record.evidence.files) ||
    !Array.isArray(record.evidence.operations) ||
    (record.replacementCommit !== null && !/^[0-9a-f]{40,64}$/u.test(record.replacementCommit))
  )
    throw new Attention("Invalid recovery manifest.");
  if (
    record.schemaVersion !== RECOVERY_SCHEMA_VERSION ||
    record.userId !== userId ||
    record.repositoryId !== repositoryId ||
    record.recoveryId !== recoveryId ||
    ![
      "preparing",
      "preparing",
      "preserved",
      "replacement_active",
      "completed",
      "manual_review_required"
    ].includes(record.completion)
  )
    throw new Attention("Recovery ownership could not be verified.");
  const repo = path.join(directory, "repo");
  validateManagedStorage(userData, repo);
  return repo;
};
export const latestPreservedCopy = (
  userData: string,
  userId: number,
  repositoryId: number
): string | undefined => {
  const root = path.join(
    accountRoot(userData, userId),
    RECOVERY_ROOT,
    identityComponent(repositoryId)
  );
  let latest: string | undefined;
  let timestamp = "";
  try {
    safeDirectories(userData, root);
    for (const recoveryId of fs.readdirSync(root)) {
      try {
        resolvePreservedCopy(userData, userId, repositoryId, recoveryId);
        const record = JSON.parse(
          fs.readFileSync(path.join(root, recoveryId, "manifest.json"), "utf8")
        ) as RecoveryManifest;
        if (typeof record.createdAt === "string" && record.createdAt > timestamp) {
          latest = recoveryId;
          timestamp = record.createdAt;
        }
      } catch {
        /* Invalid records never authorize reveal or course discovery. */
      }
    }
  } catch {
    /* Recovery is optional; never treated as an active cache. */
  }
  return latest;
};
/** An incomplete persisted transaction must never be relabeled as a completed recovery. */
export const preservedRecoveryState = (
  userData: string,
  userId: number,
  repositoryId: number,
  recoveryId: string
): ManagedReconciliationState => {
  resolvePreservedCopy(userData, userId, repositoryId, recoveryId);
  const record = JSON.parse(
    fs.readFileSync(
      path.join(recoveryDirectory(userData, userId, repositoryId, recoveryId), "manifest.json"),
      "utf8"
    )
  ) as RecoveryManifest;
  const completed = record.completion === "completed";
  return {
    repositoryId,
    recoveryId,
    status: completed ? "completed" : "manual_review_required",
    eligible: false,
    retryable: false,
    diagnostic: completed
      ? "Previous local cache preserved."
      : "A previous recovery transaction needs manual review. Preserved local evidence remains available."
  };
};
export class ManagedReconciliationService {
  private readonly plans = new Map<string, Plan>();
  async plan(request: ReconciliationRequest): Promise<ManagedReconciliationState> {
    return serializeManagedOperation(request, async () => {
      request.onReconciliationProgress(result(request, "planning"));
      try {
        const review = await inspectReview(request);
        for (const [id, previous] of this.plans) {
          if (
            previous.userId === request.userId &&
            previous.repositoryId === request.course.repositoryId
          )
            this.plans.delete(id);
        }
        const planId = randomUUID();
        this.plans.set(planId, {
          ...review,
          userId: request.userId,
          repositoryId: request.course.repositoryId,
          generation: request.sessionGeneration
        });
        return result(request, "review_required", {
          planId,
          eligible: true,
          reason: review.reason,
          evidence: review.evidence,
          diagnostic:
            review.reason === "wrong_repository"
              ? "This managed location contains a different Git repository."
              : (request.course.synchronization?.diagnostic ??
                "The managed cache needs review before restoring from GitHub.")
        });
      } catch (error) {
        return failure(request, error);
      }
    });
  }
  discard(planId: string, userId: number): void {
    if (this.plans.get(planId)?.userId === userId) this.plans.delete(planId);
  }
  async apply(
    request: ReconciliationRequest,
    planId: string,
    confirmed: boolean
  ): Promise<ManagedReconciliationState> {
    return serializeManagedOperation(request, async () => {
      const plan = this.plans.get(planId);
      this.plans.delete(planId);
      if (
        !confirmed ||
        !plan ||
        plan.userId !== request.userId ||
        plan.repositoryId !== request.course.repositoryId ||
        plan.generation !== request.sessionGeneration
      )
        return result(request, "stale_plan", { diagnostic: STALE_PLAN_MESSAGE });
      let temporary: string | undefined;
      let owned: fs.Stats | undefined;
      let manifest: RecoveryManifest | undefined;
      let preserved = false;
      let promoted = false;
      const active = managedCoursePath(request.userData, request.userId, plan.repositoryId);
      const recoveryId = randomUUID();
      const recovery = recoveryDirectory(
        request.userData,
        request.userId,
        plan.repositoryId,
        recoveryId
      );
      const preservedRepo = path.join(recovery, "repo");
      const progress = (status: ManagedReconciliationState["status"]): void => {
        request.onReconciliationProgress(result(request, status, { planId, recoveryId }));
      };
      try {
        progress("preparing");
        const reviewed = await inspectReview(request);
        if (
          reviewed.fingerprint !== plan.fingerprint ||
          reviewed.repo.defaultBranch !== plan.repo.defaultBranch
        )
          throw new Error(STALE_PLAN_MESSAGE);
        const context = request.authenticate();
        const tempRoot = path.join(accountRoot(request.userData, request.userId), RECONCILE_ROOT);
        safeDirectories(request.userData, tempRoot, true);
        temporary = fs.mkdtempSync(path.join(tempRoot, "replacement-"));
        owned = fs.lstatSync(temporary);
        const fresh = path.join(temporary, "repo");
        progress("cloning_replacement");
        await context.factory.clone({
          remote: `${reviewed.repo.url}.git`,
          destination: fresh,
          checkout: "default",
          authentication: context.authentication
        });
        progress("validating");
        await validateClone(request, reviewed.repo, fresh, context);
        const freshState = await (await context.factory.open(fresh)).inspect();
        if (
          freshState.head.kind !== "attached" ||
          freshState.upstream.kind !== "configured" ||
          freshState.upstream.remote !== "origin" ||
          freshState.upstream.branch !== `origin/${reviewed.repo.defaultBranch}` ||
          freshState.upstream.relation !== "current"
        )
          throw new Attention("Replacement HEAD is invalid.");
        const latest = await revalidateManagedRepository(request);
        if (
          latest.defaultBranch !== reviewed.repo.defaultBranch ||
          latest.organizationId !== reviewed.repo.organizationId ||
          latest.owner !== reviewed.repo.owner
        )
          throw new Error(STALE_PLAN_MESSAGE);
        await validateClone(request, latest, fresh, context);
        const freshFingerprint = fingerprintManagedCache(request.userData, fresh, freshState.head);
        const current = await inspectReview(request);
        if (
          current.fingerprint !== plan.fingerprint ||
          current.repo.defaultBranch !== reviewed.repo.defaultBranch
        )
          throw new Error(STALE_PLAN_MESSAGE);
        assertActive(request);
        if (!(await request.revalidateSession())) throw new Error(STALE_PLAN_MESSAGE);
        // Last local check, directory validation and renames have no await between them.
        if (
          fingerprintManagedCache(request.userData, active, {
            repositoryId: plan.repositoryId,
            userId: request.userId,
            reason: current.reason,
            evidence: current.evidence
          }) !== plan.fingerprint
        )
          throw new Error(STALE_PLAN_MESSAGE);
        if (fingerprintManagedCache(request.userData, fresh, freshState.head) !== freshFingerprint)
          throw new Error(STALE_PLAN_MESSAGE);
        safeDirectories(request.userData, path.dirname(recovery), true);
        fs.mkdirSync(recovery);
        manifest = {
          schemaVersion: RECOVERY_SCHEMA_VERSION,
          recoveryId,
          createdAt: new Date().toISOString(),
          userId: request.userId,
          repositoryId: plan.repositoryId,
          organizationId: latest.organizationId,
          organizationLogin: latest.owner,
          name: latest.name,
          fullName: latest.fullName,
          reason: plan.reason,
          originalStatus: "needs_attention",
          changedPathCounts: Object.fromEntries(
            (
              [
                "Modified",
                "Added",
                "Deleted",
                "Renamed",
                "Staged",
                "Untracked",
                "Conflict"
              ] as const
            ).map((category) => [
              category,
              plan.evidence.files.filter((file) => file.category === category).length
            ])
          ) as RecoveryManifest["changedPathCounts"],
          evidence: plan.evidence,
          replacementCommit: freshState.head.commit,
          completion: "preparing"
        };
        writeManifest(request, manifest);
        progress("preserving_existing");
        safeDirectories(request.userData, active);
        safeDirectories(request.userData, recovery);
        fs.renameSync(active, preservedRepo);
        preserved = true;
        // Cancellation boundary: finish promotion or rollback once the old cache has moved.
        if (
          fingerprintManagedCache(request.userData, preservedRepo, {
            repositoryId: plan.repositoryId,
            userId: request.userId,
            reason: current.reason,
            evidence: current.evidence
          }) !== plan.fingerprint
        )
          throw new Error(STALE_PLAN_MESSAGE);
        manifest = { ...manifest, completion: "preserved" };
        writeManifest(request, manifest);
        progress("activating_replacement");
        safeDirectories(request.userData, path.dirname(active));
        safeDirectories(request.userData, fresh);
        if (fs.existsSync(active)) throw new Error("promotion_destination_changed");
        fs.renameSync(fresh, active);
        promoted = true;
        manifest = { ...manifest, completion: "replacement_active" };
        writeManifest(request, manifest);
        resolvePreservedCopy(request.userData, request.userId, plan.repositoryId, recoveryId);
        progress("validating");
        // A remote validation failure keeps the authoritative replacement active and old evidence preserved.
        saveEntry(
          request.userData,
          catalogEntry(
            request.userData,
            request.userId,
            plan.repositoryId,
            latest,
            state("ready"),
            new Date().toISOString()
          )
        );
        const synchronization = await performSynchronization(request);
        request.onProgress(synchronization);
        if (!["up_to_date", "updated"].includes(synchronization.status))
          return result(request, "failed", {
            recoveryId,
            reason: synchronization.reason,
            diagnostic: synchronization.diagnostic,
            retryable: synchronization.retryable
          });
        manifest = { ...manifest, completion: "completed" };
        writeManifest(request, manifest);
        return result(request, "completed", {
          recoveryId,
          diagnostic: "Previous local cache preserved."
        });
      } catch (error) {
        let rollbackFailed = false;
        if (preserved && !promoted) {
          try {
            safeDirectories(request.userData, preservedRepo);
            safeDirectories(request.userData, path.dirname(active));
            if (fs.existsSync(active)) throw new Error("rollback_destination_changed");
            fs.renameSync(preservedRepo, active);
            preserved = false;
            if (manifest) {
              manifest = { ...manifest, completion: "rollback_restored" };
              writeManifest(request, manifest);
            }
          } catch {
            rollbackFailed = true;
          }
        }
        if (rollbackFailed || promoted) {
          if (manifest) {
            try {
              writeManifest(request, { ...manifest, completion: "manual_review_required" });
            } catch {
              /* Never remove preserved evidence after a persistence failure. */
            }
          }
          const problem: ManagedSynchronizationState = {
            status: "needs_attention",
            reason: "local_storage_failure",
            retryable: false,
            diagnostic:
              "Local recovery needs manual review. Preserved evidence was retained; check local storage before using this course."
          };
          request.onProgress(problem);
          return result(request, "manual_review_required", {
            recoveryId,
            reason: problem.reason,
            diagnostic: problem.diagnostic
          });
        }
        return failure(request, error);
      } finally {
        if (temporary && owned) {
          try {
            safeDirectories(request.userData, temporary);
            const actual = fs.lstatSync(temporary);
            if (
              actual.dev === owned.dev &&
              actual.ino === owned.ino &&
              path.dirname(temporary) ===
                path.join(accountRoot(request.userData, request.userId), RECONCILE_ROOT)
            ) {
              // Prove no link or external storage is traversed before deleting our disposable clone.
              const walk = (directory: string): void => {
                for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                  const target = path.join(directory, entry.name);
                  const stat = fs.lstatSync(target);
                  if (
                    stat.isSymbolicLink() ||
                    (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))
                  )
                    throw new Error("unsafe_temporary");
                  if (stat.isDirectory()) walk(target);
                }
              };
              walk(temporary);
              fs.rmSync(temporary, { recursive: true });
            }
          } catch {
            /* Unknown or replaced temporary state is retained for manual review. */
          }
        }
      }
    });
  }
}
