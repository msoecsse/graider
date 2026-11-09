import {
  measureGradingPhase,
  measureGradingPhaseSync,
  measureStartup
} from "./gradingPerformance.js";
import { withGithubAccountVerification } from "./githubAccountVerification.js";
import type { VerifiedGithubAccount } from "./githubOrganizations.js";
import { mapBounded } from "./remoteCourseDiscovery.js";
import {
  MANAGED_BOOTSTRAP_CONCURRENCY,
  serializeManagedOperation,
  withManagedLocalOperation
} from "./managedCourses.js";
import type {
  RemoteCourse,
  ManagedCourseState,
  ManagedSynchronizationState,
  ManagedReconciliationState
} from "./remoteCourseTypes.js";
import { emptyCourseDiscovery, isTransientCourseDiagnostic } from "./remoteCourseTypes.js";
import type { RemoteCourseDiscovery } from "./remoteCourseTypes.js";
import type { GithubOrganization } from "./githubOAuthTypes.js";
import { createHash, randomBytes } from "node:crypto";
import { GithubOAuthError, startOAuthCallback } from "./githubOAuthCallback.js";
import {
  GITHUB_OAUTH_CLIENT_ID,
  GITHUB_OAUTH_SCOPES,
  createGithubOAuthNetwork
} from "./githubOAuthNetwork.js";
import type { GithubOAuthCredentialStore } from "./githubOAuthCredentialStore.js";
import type { GithubOAuthState } from "./githubOAuthTypes.js";

interface VerifiedSession extends VerifiedGithubAccount {
  readonly credential: string;
  generation: number;
  valid: boolean;
  confirmation?: Promise<void>;
  controller: AbortController;
}

const RANDOM_BYTE_COUNT = 32;
const COURSE_AUTHORIZATION_TIMEOUT_MS = 60_000;
export const createOAuthProof = () => {
  const verifier = randomBytes(RANDOM_BYTE_COUNT).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(RANDOM_BYTE_COUNT).toString("base64url")
  };
};
export interface ManagedOperationInput {
  readonly resynchronize?: (afterPublication?: boolean) => Promise<ManagedSynchronizationState>;
  readonly token: string;
  readonly userId: number;
  readonly course: RemoteCourse;
  readonly signal: AbortSignal;
  readonly revalidateSession: () => Promise<boolean>;
}
/** Main-only local authorization lease. No credential or remote revalidation capability. */
export interface LocalCourseReadInput {
  readonly userId: number;
  readonly course: RemoteCourse;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}
export interface AuthenticatedAccountOperation {
  readonly token: string;
  readonly userId: number;
  readonly signal: AbortSignal;
  readonly revalidateSession: () => Promise<boolean>;
}
interface Dependencies {
  readonly findRegisteredCourse?: (
    folderId: string,
    account: AuthenticatedAccountOperation
  ) => Promise<RemoteCourse | null>;
  readonly loadSnapshot?: (userId: number) => readonly RemoteCourse[];
  readonly saveSnapshot?: (userId: number, courses: readonly RemoteCourse[]) => void;
  readonly verifyCourse?: (input: ManagedOperationInput) => Promise<RemoteCourse>;
  readonly store: GithubOAuthCredentialStore;
  readonly secret: () => string | undefined;
  readonly openBrowser: (url: string) => Promise<unknown>;
  readonly network: Omit<ReturnType<typeof createGithubOAuthNetwork>, "verifyOrganization">;
  readonly discoverCourses?: (
    token: string,
    userId: number,
    organizations: readonly GithubOrganization[],
    signal: AbortSignal,
    onProgress?: (courses: readonly RemoteCourse[]) => void
  ) => Promise<RemoteCourseDiscovery>;
  readonly bootstrapCourse?: (input: ManagedOperationInput) => Promise<ManagedCourseState>;
  readonly synchronizeCourse?: (
    input: ManagedOperationInput & {
      readonly onProgress: (state: ManagedSynchronizationState) => void;
      readonly alreadySerialized?: boolean;
      readonly requireFacultyAuthorization?: boolean;
    }
  ) => Promise<ManagedSynchronizationState>;
  readonly reconcileCourse?: (
    input: ManagedOperationInput & {
      readonly sessionGeneration: number;
      readonly action: "plan" | "apply";
      readonly planId?: string;
      readonly confirmed?: boolean;
      readonly onProgress: (state: ManagedSynchronizationState) => void;
      readonly onReconciliationProgress: (state: ManagedReconciliationState) => void;
    }
  ) => Promise<ManagedReconciliationState>;
  readonly callback?: typeof startOAuthCallback;
}
const signedOut = (): GithubOAuthState => ({
  status: "signed_out",
  identity: null,
  busy: false,
  persistence: "unknown",
  message: null,
  repositoryPermission: "unknown",
  courseDiscovery: emptyCourseDiscovery(),
  organizationPermission: "unknown",
  organizationDiscovery: { status: "idle", organizations: [], message: null, stale: false }
});
const safeMessage = (error: unknown): string =>
  error instanceof GithubOAuthError
    ? error.message
    : "GitHub sign-in could not be completed. Try again.";
export class GithubOAuthSession {
  private state = signedOut();
  private token: string | null = null;
  private authorization: VerifiedSession | null = null;
  private establishAccount(token: string, account: VerifiedGithubAccount): void {
    if (this.authorization) this.authorization.valid = false;
    this.invalidateReconciliations();
    this.token = token;
    this.authorization = {
      ...account,
      credential: token,
      generation: this.accountGeneration,
      valid: true,
      controller: new AbortController()
    };
  }
  private verified(
    token: string,
    userId: number,
    generation: number,
    signal: AbortSignal,
    requireCapabilities = true
  ): boolean {
    const snapshot = this.authorization;
    return (
      !!snapshot &&
      snapshot.valid &&
      !this.stopped &&
      !signal.aborted &&
      this.state.status === "signed_in" &&
      generation === this.accountGeneration &&
      snapshot.generation === generation &&
      snapshot.credential === token &&
      this.token === token &&
      snapshot.identity.id === userId &&
      this.state.identity?.id === userId &&
      snapshot.identity.login === this.state.identity.login &&
      (!requireCapabilities || (snapshot.repositoryCapability && snapshot.organizationCapability))
    );
  }
  private withVerifiedAccount<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    const snapshot = this.authorization;
    const generation = this.accountGeneration;
    return withGithubAccountVerification(
      {
        credential: snapshot?.credential ?? "",
        account: async (requestSignal) => {
          if (
            !snapshot ||
            requestSignal?.aborted ||
            this.active ||
            !this.verified(snapshot.credential, snapshot.identity.id, generation, signal, false)
          )
            throw new Error("Account authorization changed.");
          return {
            identity: { ...snapshot.identity },
            scopes: [...snapshot.scopes],
            organizationCapability: snapshot.organizationCapability,
            repositoryCapability: snapshot.repositoryCapability
          };
        },
        confirmRejection: () =>
          signal.aborted ? Promise.resolve() : this.confirmCredential(snapshot)
      },
      operation
    );
  }
  private async confirmCredential(snapshot: VerifiedSession | null): Promise<void> {
    if (!snapshot || snapshot !== this.authorization || !snapshot.valid) return;
    // Retain the settled promise too: one exceptional confirmation per established session,
    // shared by all course readers and Git failures, with no automatic retry loop.
    snapshot.confirmation ??= this.confirmStoredCredential(snapshot);
    await snapshot.confirmation;
  }
  private async confirmStoredCredential(snapshot: VerifiedSession): Promise<void> {
    const generation = this.accountGeneration;
    const current = () =>
      this.authorization === snapshot &&
      snapshot.valid &&
      !this.stopped &&
      this.active === null &&
      generation === this.accountGeneration;
    try {
      const account = await this.deps.network.verifyAccount(
        snapshot.credential,
        snapshot.controller.signal
      );
      if (current()) {
        if (
          account.identity.id !== snapshot.identity.id ||
          account.identity.login !== snapshot.identity.login
        ) {
          snapshot.valid = false;
          this.invalidateReconciliations();
          this.discovery?.abort();
          this.authorization = null;
          this.token = null;
          this.state = {
            ...signedOut(),
            status: "unavailable",
            message: "GitHub account identity changed. Your credential is preserved. Sign in again."
          };
        }
        // Newly supplied scope evidence can restrict the current session, never expand it.
        else if (!account.organizationCapability || !account.repositoryCapability) {
          snapshot.valid = false;
          this.authorization = {
            ...snapshot,
            valid: true,
            scopes: snapshot.scopes.filter((scope) => account.scopes.includes(scope)),
            organizationCapability:
              snapshot.organizationCapability && account.organizationCapability,
            repositoryCapability: snapshot.repositoryCapability && account.repositoryCapability
          };
          this.invalidateReconciliations();
          this.discovery?.abort();
          this.state = {
            ...this.state,
            courseDiscovery: {
              ...emptyCourseDiscovery(),
              userId: snapshot.identity.id,
              status: "authorization_required"
            },
            organizationPermission: this.authorization.organizationCapability
              ? "available"
              : "required",
            repositoryPermission: this.authorization.repositoryCapability ? "available" : "required"
          };
        }
      }
    } catch (error) {
      if (current() && error instanceof GithubOAuthError && error.code === "invalid_credential") {
        snapshot.valid = false;
        this.invalidateReconciliations();
        this.discovery?.abort();
        this.token = null;
        this.authorization = null;
        this.state = { ...signedOut(), message: safeMessage(error) };
        const cleanup = new AbortController();
        this.active = cleanup;
        try {
          await this.deps.store.delete();
        } catch {
          this.state = {
            ...this.state,
            status: "unavailable",
            message: "The invalid saved credential could not be removed. Choose Sign out to retry."
          };
        } finally {
          if (this.active === cleanup) this.active = null;
        }
        throw error;
      }
      // 403, SSO, missing evidence and temporary failures never revoke the credential.
    }
  }
  private active: AbortController | null = null;
  private restored: Promise<void> | null = null;
  private authenticationCompletion: Promise<void> | null = null;
  private stopped = false;
  private accountGeneration = 0;
  get mutationGeneration(): number {
    return this.accountGeneration;
  }
  async withLocalCourse<T>(
    repositoryId: number,
    expectedUserId: number,
    operation: (input: LocalCourseReadInput) => Promise<T>
  ): Promise<T> {
    const generation = this.accountGeneration;
    const controller = new AbortController();
    const course = this.state.courseDiscovery.courses.find(
      (candidate) => candidate.repositoryId === repositoryId
    );
    const assertCurrent = () => {
      const current = this.state.courseDiscovery.courses.find(
        (candidate) => candidate.repositoryId === repositoryId
      );
      if (
        !this.token ||
        !this.verified(this.token, expectedUserId, generation, controller.signal, false) ||
        this.stopped ||
        this.active !== null ||
        controller.signal.aborted ||
        this.state.status !== "signed_in" ||
        generation !== this.accountGeneration ||
        this.state.identity?.id !== expectedUserId ||
        this.state.courseDiscovery.userId !== expectedUserId ||
        !course ||
        !current ||
        current.authorization !== "authorized" ||
        current.organizationId !== course.organizationId ||
        current.schemaVersion !== course.schemaVersion ||
        current.defaultBranch !== course.defaultBranch ||
        [
          "authorization_lost",
          "authentication_failed",
          "remote_unavailable",
          "organization_transfer"
        ].includes(current.synchronization?.reason ?? "") ||
        this.state.courseDiscovery.diagnostics.some(
          (item) => item.repositoryId === repositoryId && !isTransientCourseDiagnostic(item)
        )
      )
        throw new Error(
          "Current account and previously verified course authorization are required. Refresh course access."
        );
    };
    assertCurrent();
    this.courseOperations.add(controller);
    try {
      return await withManagedLocalOperation(
        { userId: expectedUserId, course: course!, signal: controller.signal },
        async () => {
          assertCurrent();
          const result = await operation({
            userId: expectedUserId,
            course: course!,
            signal: controller.signal,
            assertCurrent
          });
          assertCurrent();
          return result;
        }
      );
    } finally {
      this.courseOperations.delete(controller);
    }
  }
  /** Main-only bootstrap boundary, before a new course can exist in discovery. */
  async withAuthenticatedAccount<T>(
    operation: (input: AuthenticatedAccountOperation) => Promise<T>
  ): Promise<T> {
    const token = this.token;
    const userId = this.state.identity?.id;
    const generation = this.accountGeneration;
    if (!token || !userId || this.active || this.stopped)
      throw new Error("Sign in and authorize course access before setup.");
    const controller = new AbortController();
    const current = () =>
      this.verified(token, userId, generation, controller.signal) &&
      !this.stopped &&
      !this.active &&
      !controller.signal.aborted &&
      generation === this.accountGeneration &&
      token === this.token &&
      this.state.identity?.id === userId;
    const input: AuthenticatedAccountOperation = {
      token,
      userId,
      signal: controller.signal,
      revalidateSession: async () => current()
    };
    this.courseOperations.add(controller);
    try {
      if (!(await input.revalidateSession())) throw new Error("Account authorization changed.");
      const result = await this.withVerifiedAccount(controller.signal, () => operation(input));
      if (!current())
        throw new Error("Account authorization changed. Refresh course setup status.");
      return result;
    } finally {
      this.courseOperations.delete(controller);
    }
  }
  private readonly reconciliations = new Map<number, AbortController>();
  private readonly courseOperations = new Set<AbortController>();
  private invalidateReconciliations(): void {
    this.accountGeneration += 1;
    if (this.authorization) {
      this.authorization.generation = this.accountGeneration;
      this.authorization.controller.abort();
      this.authorization.controller = new AbortController();
    }
    for (const controller of this.courseOperations) controller.abort();
    for (const controller of this.reconciliations.values()) controller.abort();
    this.reconciliations.clear();
    this.targeted.clear();
    this.registrations.clear();
  }
  cancelReconciliation(repositoryId: number): void {
    this.reconciliations.get(repositoryId)?.abort();
  }
  async reconcileCourse(
    repositoryId: number,
    action: "plan" | "apply",
    planId?: string,
    confirmed?: boolean
  ): Promise<ManagedReconciliationState> {
    const token = this.token;
    const userId = this.state.identity?.id;
    const course = this.state.courseDiscovery.courses.find(
      (item) => item.repositoryId === repositoryId
    );
    if (
      !token ||
      !userId ||
      !course ||
      this.state.courseDiscovery.userId !== userId ||
      !this.deps.reconcileCourse ||
      this.reconciliations.has(repositoryId)
    )
      throw new Error("Current authorized course is required.");
    const generation = this.accountGeneration;
    const controller = new AbortController();
    if (this.active || !this.verified(token, userId, generation, controller.signal))
      throw new Error("Current account authorization is required.");
    this.reconciliations.set(repositoryId, controller);
    const current = (): boolean =>
      !this.stopped &&
      generation === this.accountGeneration &&
      token === this.token &&
      this.state.identity?.id === userId;
    const update = (change: Partial<RemoteCourse>): void => {
      if (current())
        this.state = {
          ...this.state,
          courseDiscovery: {
            ...this.state.courseDiscovery,
            courses: this.state.courseDiscovery.courses.map((item) =>
              item.repositoryId === repositoryId ? { ...item, ...change } : item
            )
          }
        };
    };
    try {
      const result = await this.withVerifiedAccount(controller.signal, () =>
        this.deps.reconcileCourse!({
          token,
          userId,
          course,
          action,
          planId,
          confirmed,
          signal: controller.signal,
          sessionGeneration: generation,
          revalidateSession: async () =>
            current() &&
            this.active === null &&
            this.verified(token, userId, generation, controller.signal),
          onProgress: (synchronization) =>
            update({
              synchronization,
              ...(synchronization.metadata ?? {}),
              ...(synchronization.status === "up_to_date" || synchronization.status === "updated"
                ? { bootstrap: { status: "ready", diagnostic: null, retryable: false } }
                : {})
            }),
          onReconciliationProgress: (reconciliation) => update({ reconciliation })
        })
      );
      update({ reconciliation: result });
      if (!current()) throw new Error("Account changed. Review the cache again.");
      return result;
    } finally {
      if (this.reconciliations.get(repositoryId) === controller)
        this.reconciliations.delete(repositoryId);
    }
  }
  /** Main-process only: one target synchronization, then a non-reusable operation context. */
  async withSynchronizedCourse<T>(
    repositoryId: number,
    expectedUserId: number,
    operation: (
      input: ManagedOperationInput,
      synchronization: ManagedSynchronizationState
    ) => Promise<T>
  ): Promise<T> {
    const token = this.token;
    const generation = this.accountGeneration;
    const course = this.state.courseDiscovery.courses.find(
      (item) => item.repositoryId === repositoryId
    );
    if (
      !token ||
      !course ||
      this.state.identity?.id !== expectedUserId ||
      this.state.courseDiscovery.userId !== expectedUserId ||
      !this.deps.synchronizeCourse ||
      this.active !== null
    )
      throw new Error("Current authorized course is required.");
    const controller = new AbortController();
    const current = () =>
      this.verified(token, expectedUserId, generation, controller.signal) &&
      !this.stopped &&
      this.active === null &&
      generation === this.accountGeneration &&
      token === this.token &&
      this.state.identity?.id === expectedUserId;
    const input: ManagedOperationInput = {
      token,
      userId: expectedUserId,
      course,
      signal: controller.signal,
      revalidateSession: async () => current()
    };
    const updateSynchronization = (synchronization: ManagedSynchronizationState): void => {
      if (current())
        this.state = {
          ...this.state,
          courseDiscovery: {
            ...this.state.courseDiscovery,
            courses: this.state.courseDiscovery.courses.map((item) =>
              item.repositoryId === repositoryId
                ? { ...item, synchronization, ...(synchronization.metadata ?? {}) }
                : item
            )
          }
        };
    };
    const synchronize = async (afterPublication = false) => {
      if (!current()) throw new Error("Account authorization changed.");
      const result = await this.deps.synchronizeCourse!({
        ...input,
        alreadySerialized: true,
        requireFacultyAuthorization: !afterPublication,
        onProgress: updateSynchronization
      });
      if (!current()) throw new Error("Account authorization changed.");
      if (result.reason === "authentication_failed")
        await this.confirmCredential(this.authorization);
      if (!current()) throw new Error("Account authorization changed.");
      updateSynchronization(result);
      return result;
    };
    this.courseOperations.add(controller);
    try {
      return await this.withVerifiedAccount(controller.signal, () =>
        serializeManagedOperation(input, async () => {
          if (!current()) throw new Error("Account changed. Retry the operation.");
          const synchronization = await synchronize();
          if (!current()) throw new Error("Account changed. Retry the operation.");
          const result = await operation({ ...input, resynchronize: synchronize }, synchronization);
          if (!current()) throw new Error("Account changed. Retry the operation.");
          return result;
        })
      );
    } finally {
      this.courseOperations.delete(controller);
    }
  }

  /** Same account/discovery/capability boundary as synchronized operations, without cache writes. */
  async withReadOnlyCourse<T>(
    repositoryId: number,
    expectedUserId: number,
    operation: (input: ManagedOperationInput) => Promise<T>
  ): Promise<T> {
    const token = this.token;
    const generation = this.accountGeneration;
    const course = this.state.courseDiscovery.courses.find(
      (item) => item.repositoryId === repositoryId
    );
    if (
      !token ||
      !course ||
      course.authorization !== "authorized" ||
      this.state.identity?.id !== expectedUserId ||
      this.state.courseDiscovery.userId !== expectedUserId ||
      this.active !== null ||
      this.stopped
    )
      throw new Error("Current authorized course is required.");
    const controller = new AbortController();
    const current = () =>
      this.verified(token, expectedUserId, generation, controller.signal) &&
      !this.stopped &&
      !controller.signal.aborted &&
      this.active === null &&
      generation === this.accountGeneration &&
      token === this.token &&
      this.state.identity?.id === expectedUserId &&
      this.state.courseDiscovery.userId === expectedUserId &&
      this.state.courseDiscovery.courses.some(
        (item) => item.repositoryId === repositoryId && item.authorization === "authorized"
      );
    const input: ManagedOperationInput = {
      token,
      userId: expectedUserId,
      course,
      signal: controller.signal,
      revalidateSession: async () => current()
    };
    this.courseOperations.add(controller);
    try {
      if (!(await input.revalidateSession()))
        throw new Error("Course account authorization changed.");
      const result = await this.withVerifiedAccount(controller.signal, () => operation(input));
      if (!current()) throw new Error("Course account authorization changed.");
      return result;
    } finally {
      this.courseOperations.delete(controller);
    }
  }

  private discovery: AbortController | null = null;
  private courseDiscoveryCompletion: Promise<void> | null = null;
  /** Join existing startup work; never refresh or resume an operation under another account. */
  async waitForCourseStartup(folderId?: unknown): Promise<void> {
    const identity = this.state.identity?.id;
    const generation = this.accountGeneration;
    await this.authenticationCompletion;
    if (!this.deps.verifyCourse) await this.courseDiscoveryCompletion;
    else if (typeof folderId === "string") {
      let verified: RemoteCourse | undefined;
      let course = this.state.courseDiscovery.courses.find(
        (entry) =>
          entry.localFolderIds.includes(folderId) ||
          folderId === `managed-course:${this.state.identity?.id}:${entry.repositoryId}`
      );
      if (
        !course &&
        this.state.identity &&
        this.authorization?.repositoryCapability &&
        this.authorization.organizationCapability &&
        this.deps.findRegisteredCourse
      ) {
        const found = await this.findRegisteredCourse(folderId);
        course = this.state.courseDiscovery.courses.find(
          (entry) =>
            entry.localFolderIds.includes(folderId) || entry.repositoryId === found?.repositoryId
        );
        if (found && !course) {
          verified = found;
          course = { ...found, authorization: "unavailable", freshness: "cached" };
          this.state = {
            ...this.state,
            courseDiscovery: {
              ...this.state.courseDiscovery,
              userId: this.state.identity!.id,
              courses: [...this.state.courseDiscovery.courses, course]
            }
          };
        }
      }
      if (course && course.freshness !== "current")
        await this.authorizeKnownCourse(course, verified);
      else if (course) measureGradingPhaseSync("authorization_cache_hit", () => undefined);
    }
    if (identity && (identity !== this.state.identity?.id || generation !== this.accountGeneration))
      throw new Error("Account changed while course access was loading. Reopen the course.");
  }
  private readonly registrations = new Map<string, Promise<RemoteCourse | null>>();
  private async findRegisteredCourse(folderId: string): Promise<RemoteCourse | null> {
    const pending = this.registrations.get(folderId);
    if (pending) return pending;
    const work = this.withAuthenticatedAccount(async (account) => {
      const signal = AbortSignal.any([
        account.signal,
        AbortSignal.timeout(COURSE_AUTHORIZATION_TIMEOUT_MS)
      ]);
      const found = await this.deps.findRegisteredCourse!(folderId, {
        ...account,
        signal,
        revalidateSession: async () => !signal.aborted && account.revalidateSession()
      });
      if (signal.aborted)
        throw new Error("Registered course verification timed out or was canceled.");
      return found;
    });
    this.registrations.set(folderId, work);
    try {
      return await work;
    } finally {
      if (this.registrations.get(folderId) === work) this.registrations.delete(folderId);
    }
  }
  private readonly targeted = new Map<number, Promise<void>>();
  private loadKnownCourses(): void {
    const userId = this.state.identity?.id;
    if (userId && this.deps.loadSnapshot && this.state.courseDiscovery.userId !== userId)
      this.state = {
        ...this.state,
        courseDiscovery: {
          ...emptyCourseDiscovery(),
          userId,
          courses: measureGradingPhaseSync("cached_courses", () => this.deps.loadSnapshot!(userId))
        }
      };
  }
  private async authorizeKnownCourse(
    course: RemoteCourse,
    alreadyVerified?: RemoteCourse
  ): Promise<void> {
    const pending = this.targeted.get(course.repositoryId);
    if (pending) return pending;
    const work = measureStartup("selected_course", () =>
      this.withAuthenticatedAccount(async (session) => {
        const signal = AbortSignal.any([
          session.signal,
          AbortSignal.timeout(COURSE_AUTHORIZATION_TIMEOUT_MS)
        ]);
        let expected = course;
        const courseCurrent = () =>
          this.state.courseDiscovery.courses.find(
            (entry) => entry.repositoryId === course.repositoryId
          ) === expected;
        const account = {
          ...session,
          signal,
          revalidateSession: async () =>
            !signal.aborted && courseCurrent() && session.revalidateSession()
        };
        const generation = this.accountGeneration;
        const update = (next: RemoteCourse): void => {
          if (generation === this.accountGeneration && !account.signal.aborted && courseCurrent()) {
            expected = next;
            this.state = {
              ...this.state,
              courseDiscovery: {
                ...this.state.courseDiscovery,
                courses: this.state.courseDiscovery.courses.map((entry) =>
                  entry.repositoryId === course.repositoryId ? next : entry
                )
              }
            };
          }
        };
        update({ ...course, freshness: "verifying", authorization: "unavailable" });
        try {
          const verified =
            alreadyVerified ?? (await this.deps.verifyCourse!({ ...account, course }));
          if (!(await account.revalidateSession()))
            throw new Error("Account authorization changed.");
          if (
            verified.repositoryId !== course.repositoryId ||
            verified.organizationId !== course.organizationId ||
            verified.schemaVersion !== course.schemaVersion ||
            verified.authorization !== "authorized"
          )
            throw new Error(
              "Course identity or faculty authorization changed. Refresh course access."
            );
          // Target readiness uses the existing guarded bootstrap/synchronization implementations.
          const input = { ...account, course: verified };
          const bootstrap = this.deps.bootstrapCourse
            ? await measureGradingPhase("bootstrap", () => this.deps.bootstrapCourse!(input))
            : undefined;
          const synchronization =
            bootstrap?.status === "ready"
              ? await this.deps.synchronizeCourse?.({ ...input, onProgress: () => {} })
              : undefined;
          update({ ...verified, bootstrap, synchronization, freshness: "current" });
          if (
            (await account.revalidateSession()) &&
            generation === this.accountGeneration &&
            this.state.courseDiscovery.userId === account.userId &&
            courseCurrent()
          ) {
            try {
              this.deps.saveSnapshot?.(account.userId, this.state.courseDiscovery.courses);
            } catch {
              /* The verified session remains usable when display persistence is unavailable. */
            }
          }
        } catch {
          update({ ...course, authorization: "unavailable", freshness: "needs_attention" });
          throw new Error(
            `Course ${course.code} access could not be verified. Check course authorization and retry.`
          );
        }
      })
    );
    this.targeted.set(course.repositoryId, work);
    try {
      await work;
    } finally {
      if (this.targeted.get(course.repositoryId) === work)
        this.targeted.delete(course.repositoryId);
    }
  }
  constructor(private readonly deps: Dependencies) {}
  getState(): GithubOAuthState {
    return { ...this.state, busy: this.active !== null };
  }
  restore(): Promise<void> {
    this.restored ??= measureStartup("oauth_restore", () => this.restoreStored());
    return this.restored;
  }
  private async restoreStored(): Promise<void> {
    if (this.active || this.token || this.stopped) return;
    const controller = new AbortController();
    this.active = controller;
    let complete!: () => void;
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    this.authenticationCompletion = completion;
    try {
      const token = await measureGradingPhase("credential_restore", () => this.deps.store.load());
      if (token && !controller.signal.aborted) {
        const account = await measureGradingPhase("account_verification", () =>
          this.deps.network.verifyAccount(token, controller.signal)
        );
        if (!controller.signal.aborted) {
          this.establishAccount(token, account);
          this.state = {
            ...signedOut(),
            status: "signed_in",
            identity: account.identity,
            repositoryPermission: account.repositoryCapability ? "available" : "required",
            organizationPermission: account.organizationCapability ? "available" : "required",
            busy: false,
            persistence: "secure",
            message: null
          };
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof GithubOAuthError && error.code === "invalid_credential") {
          try {
            await this.deps.store.delete();
            this.state = { ...signedOut(), message: safeMessage(error) };
          } catch {
            this.state = {
              ...signedOut(),
              status: "unavailable",
              message:
                "Your GitHub sign-in has expired or been revoked. The saved credential could not be removed; choose Sign out to retry removal."
            };
          }
        } else {
          this.state = {
            ...signedOut(),
            status: "unavailable",
            message:
              error instanceof GithubOAuthError && error.code === "authorization_evidence_missing"
                ? `${safeMessage(error)} Your saved credential is preserved.`
                : "Saved GitHub sign-in could not be verified. Your credential is preserved. Check your connection or secure storage, then retry."
          };
        }
      }
    } finally {
      if (this.active === controller) this.active = null;
      if (this.authenticationCompletion === completion) this.authenticationCompletion = null;
      this.loadKnownCourses();
      complete();
      if (this.token && !this.active && !this.stopped) void this.refreshOrganizations();
    }
  }
  async signIn(switchAccount = false): Promise<GithubOAuthState> {
    if (this.active || this.stopped) return this.getState();
    if (switchAccount) this.invalidateReconciliations();
    this.discovery?.abort();
    if (this.state.organizationDiscovery.status === "loading")
      this.state = {
        ...this.state,
        organizationDiscovery: { ...this.state.organizationDiscovery, status: "idle" }
      };
    const controller = new AbortController();
    this.active = controller;
    let complete!: () => void;
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    this.authenticationCompletion = completion;
    let callback: Awaited<ReturnType<typeof startOAuthCallback>> | undefined;
    try {
      const secret = this.deps.secret()?.trim();
      if (!secret)
        throw new GithubOAuthError(
          "configuration",
          "GitHub sign-in is not configured in this build. Contact your Graider administrator."
        );
      const proof = createOAuthProof();
      callback = await (this.deps.callback ?? startOAuthCallback)(proof.state, controller.signal);
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: GITHUB_OAUTH_CLIENT_ID,
        redirect_uri: callback.redirectUri,
        scope: GITHUB_OAUTH_SCOPES.join(" "),
        state: proof.state,
        code_challenge: proof.challenge,
        code_challenge_method: "S256",
        ...(switchAccount ? { prompt: "select_account" } : {})
      }).toString();
      try {
        await Promise.race([this.deps.openBrowser(url.toString()), callback.code]);
      } catch (error) {
        if (error instanceof GithubOAuthError) throw error;
        throw new GithubOAuthError(
          "browser",
          "Unable to open your default browser. Try signing in again."
        );
      }
      const code = await callback.code;
      const token = await this.deps.network.exchange(
        { code, redirectUri: callback.redirectUri, verifier: proof.verifier, secret },
        controller.signal
      );
      const account = await measureGradingPhase("account_verification", () =>
        this.deps.network.verifyAccount(token, controller.signal)
      );
      if (controller.signal.aborted)
        throw new GithubOAuthError("canceled", "GitHub sign-in canceled.");
      const organizationPermission = account.organizationCapability;
      const repositoryPermission = account.repositoryCapability;
      if (this.state.identity && (!organizationPermission || !repositoryPermission))
        throw new GithubOAuthError(
          "insufficient_scope",
          "Course authorization was not granted. Your previous GitHub session was retained."
        );
      if (controller.signal.aborted)
        throw new GithubOAuthError("canceled", "GitHub sign-in canceled.");
      let persistence: GithubOAuthState["persistence"] = "secure";
      let message: string | null = null;
      try {
        await this.deps.store.save(token);
      } catch {
        // A switch must preserve the old identity and credential if replacement cannot commit.
        if (this.state.identity !== null || this.state.status === "unavailable")
          throw new GithubOAuthError(
            "storage",
            "Secure account replacement failed. Your previous GitHub account was retained."
          );
        persistence = "memory";
        message = "Secure persistence is unavailable. Sign in again after restarting Graider.";
      }
      if (controller.signal.aborted || this.stopped) {
        // The store write may finish after cancellation. Restore the previous association
        // before ending the transaction; never publish the canceled account's authority.
        if (persistence === "secure") {
          if (this.token) await this.deps.store.save(this.token);
          else await this.deps.store.delete();
        }
        throw new GithubOAuthError("canceled", "GitHub sign-in canceled.");
      }
      this.establishAccount(token, account);
      this.discovery?.abort();
      this.state = {
        ...signedOut(),
        status: "signed_in",
        identity: account.identity,
        busy: false,
        persistence,
        message,
        repositoryPermission: repositoryPermission ? "available" : "required",
        organizationPermission: organizationPermission ? "available" : "required"
      };
    } catch (error) {
      this.state = {
        ...this.state,
        message: controller.signal.aborted ? "GitHub sign-in canceled." : safeMessage(error)
      };
    } finally {
      callback?.cancel();
      if (this.active === controller) this.active = null;
      if (this.authenticationCompletion === completion) this.authenticationCompletion = null;
      this.loadKnownCourses();
      complete();
      if (this.token && !this.active && !this.stopped) void this.refreshOrganizations();
    }
    return this.getState();
  }
  cancel(): GithubOAuthState {
    this.active?.abort();
    return this.getState();
  }
  async signOut(): Promise<GithubOAuthState> {
    const pendingAuthentication = this.authenticationCompletion;
    this.active?.abort();
    const cleanup = new AbortController();
    this.active = cleanup;
    this.discovery?.abort();
    this.invalidateReconciliations();
    this.token = null;
    if (this.authorization) this.authorization.valid = false;
    this.authorization = null;
    this.state = signedOut();
    try {
      // A late replacement write must finish/roll back before final credential removal.
      await pendingAuthentication;
      await this.deps.store.delete();
    } catch {
      this.state = {
        ...signedOut(),
        status: "unavailable",
        message:
          "Sign-out could not remove the saved credential. Please retry before closing Graider."
      };
    } finally {
      if (this.active === cleanup) this.active = null;
    }
    return this.getState();
  }
  async manageAuthorization(): Promise<GithubOAuthState> {
    // Fixed trusted destination; renderer cannot supply URLs.
    await this.deps.openBrowser("https://github.com/settings/applications");
    return this.getState();
  }
  refreshOrganizations(): Promise<GithubOAuthState> {
    return measureStartup("background_discovery", () => this.runDiscovery());
  }
  private async runDiscovery(): Promise<GithubOAuthState> {
    const token = this.token;
    const userId = this.state.identity?.id;
    if (!token || !userId || this.stopped || this.active) return this.getState();
    const snapshot = this.authorization;
    const generation = this.accountGeneration;
    if (this.discovery && !this.discovery.signal.aborted) {
      await this.courseDiscoveryCompletion;
      return this.getState();
    }
    const beforeScan = new Map(
      this.state.courseDiscovery.courses.map((course) => [course.repositoryId, course])
    );
    const controller = new AbortController();
    this.discovery = controller;
    let completeDiscovery!: () => void;
    const completion = new Promise<void>((resolve) => {
      completeDiscovery = resolve;
    });
    this.courseDiscoveryCompletion = completion;
    const current = (): boolean =>
      this.verified(token, userId, generation, controller.signal, false) && this.active === null;
    this.state = {
      ...this.state,
      organizationDiscovery: { ...this.state.organizationDiscovery, status: "loading" },
      courseDiscovery: { ...this.state.courseDiscovery, status: "loading", userId }
    };
    try {
      const capable = snapshot?.organizationCapability === true;
      const repositoryCapable = snapshot?.repositoryCapability === true;
      if (current()) {
        this.state = {
          ...this.state,
          organizationPermission: capable ? "available" : "required",
          repositoryPermission: repositoryCapable ? "available" : "required",
          courseDiscovery: {
            ...this.state.courseDiscovery,
            userId,
            status: repositoryCapable ? "loading" : "authorization_required"
          }
        };
        if (capable) {
          const result = await this.withVerifiedAccount(controller.signal, () =>
            measureGradingPhase("organization_discovery", () =>
              this.deps.network.discoverOrganizations(token, controller.signal)
            )
          );
          if (current())
            this.state = {
              ...this.state,
              organizationDiscovery: result,
              courseDiscovery: {
                ...this.state.courseDiscovery,
                courses: this.state.courseDiscovery.courses.map((course) => {
                  const org = result.organizations.find(
                    (entry) => entry.organizationId === course.organizationId
                  );
                  const revoked =
                    (!org && result.status === "ready" && !result.stale) ||
                    (org &&
                      (org.membershipState !== "active" ||
                        [
                          "authorization_required",
                          "forbidden",
                          "oauth_approval_required",
                          "sso_required",
                          "insufficient_scope"
                        ].includes(org.accessStatus)));
                  return revoked
                    ? { ...course, authorization: "unavailable", freshness: "needs_attention" }
                    : course;
                })
              }
            };
          if (current() && repositoryCapable && this.deps.discoverCourses) {
            try {
              const courses = await this.withVerifiedAccount(controller.signal, () =>
                this.deps.discoverCourses!(
                  token,
                  userId,
                  result.organizations,
                  controller.signal,
                  (incoming) => {
                    if (current())
                      this.state = {
                        ...this.state,
                        courseDiscovery: {
                          ...this.state.courseDiscovery,
                          courses: [
                            ...this.state.courseDiscovery.courses,
                            ...incoming
                              .filter(
                                (course) =>
                                  !this.state.courseDiscovery.courses.some(
                                    (entry) => entry.repositoryId === course.repositoryId
                                  )
                              )
                              .map(
                                (course): RemoteCourse => ({
                                  ...course,
                                  authorization: "unavailable",
                                  freshness: "verifying"
                                })
                              )
                          ]
                        }
                      };
                  }
                )
              );
              if (current()) {
                this.state = {
                  ...this.state,
                  courseDiscovery: {
                    ...courses,
                    courses: [
                      ...new Map([
                        ...this.state.courseDiscovery.courses.map(
                          (course) =>
                            [
                              course.repositoryId,
                              courses.diagnostics.some(
                                (item) =>
                                  item.repositoryId === course.repositoryId &&
                                  ![
                                    "network_unavailable",
                                    "rate_limited",
                                    "error",
                                    "unavailable"
                                  ].includes(item.status)
                              )
                                ? {
                                    ...course,
                                    authorization: "unavailable" as const,
                                    freshness: "needs_attention" as const
                                  }
                                : course
                            ] as const
                        ),
                        ...courses.courses.map((course) => {
                          const latest = this.state.courseDiscovery.courses.find(
                            (entry) => entry.repositoryId === course.repositoryId
                          );
                          const preserved =
                            latest &&
                            latest !== beforeScan.get(course.repositoryId) &&
                            (latest.freshness === "current" || latest.freshness === "verifying") &&
                            course.authorization === "authorized" &&
                            latest.organizationId === course.organizationId &&
                            latest.schemaVersion === course.schemaVersion &&
                            latest.defaultBranch === course.defaultBranch;
                          return [
                            course.repositoryId,
                            preserved
                              ? latest
                              : ({
                                  ...course,
                                  freshness:
                                    course.authorization === "authorized"
                                      ? ("current" as const)
                                      : ("needs_attention" as const),
                                  synchronization:
                                    course.authorization === "authorized"
                                      ? { status: "queued", diagnostic: null, retryable: false }
                                      : undefined,
                                  bootstrap: {
                                    status:
                                      course.authorization === "authorized"
                                        ? "queued"
                                        : "not_bootstrapped",
                                    diagnostic: null,
                                    retryable: false
                                  }
                                } satisfies RemoteCourse)
                          ] as const;
                        })
                      ]).values()
                    ]
                  }
                };
                try {
                  this.deps.saveSnapshot?.(userId, this.state.courseDiscovery.courses);
                } catch {
                  /* Display cache failure never grants authority. */
                }
                completeDiscovery();
                if (this.deps.bootstrapCourse) {
                  const bootstrap = this.deps.bootstrapCourse;
                  const pending = courses.courses.filter(
                    (course) =>
                      course.authorization === "authorized" &&
                      this.state.courseDiscovery.courses.find(
                        (entry) => entry.repositoryId === course.repositoryId
                      )?.bootstrap?.status === "queued"
                  );
                  const expected = new Map(
                    this.state.courseDiscovery.courses.map((course) => [
                      course.repositoryId,
                      course
                    ])
                  );
                  const courseCurrent = (repositoryId: number): boolean =>
                    current() &&
                    this.state.courseDiscovery.courses.find(
                      (course) => course.repositoryId === repositoryId
                    ) === expected.get(repositoryId);
                  const update = (repositoryId: number, change: Partial<RemoteCourse>): void => {
                    if (courseCurrent(repositoryId)) {
                      const next = { ...expected.get(repositoryId)!, ...change };
                      expected.set(repositoryId, next);
                      this.state = {
                        ...this.state,
                        courseDiscovery: {
                          ...this.state.courseDiscovery,
                          courses: this.state.courseDiscovery.courses.map((course) =>
                            course.repositoryId === repositoryId ? next : course
                          )
                        }
                      };
                    }
                  };
                  await mapBounded(
                    pending,
                    async (course) => {
                      if (courseCurrent(course.repositoryId)) {
                        update(course.repositoryId, {
                          bootstrap: { status: "bootstrapping", diagnostic: null, retryable: false }
                        });
                        const input: ManagedOperationInput = {
                          token,
                          userId,
                          course,
                          signal: controller.signal,
                          revalidateSession: async () =>
                            courseCurrent(course.repositoryId) &&
                            this.verified(token, userId, generation, controller.signal)
                        };
                        const result = await this.withVerifiedAccount(controller.signal, () =>
                          measureGradingPhase("bootstrap", () => bootstrap(input))
                        );
                        update(course.repositoryId, { bootstrap: result });
                        if (result.status !== "ready")
                          update(course.repositoryId, {
                            synchronization: {
                              status:
                                result.status === "needs_attention" ? "needs_attention" : "failed",
                              diagnostic: result.diagnostic,
                              reason: result.reason,
                              retryable: result.retryable
                            }
                          });
                        if (
                          courseCurrent(course.repositoryId) &&
                          result.status === "ready" &&
                          this.deps.synchronizeCourse
                        ) {
                          const onProgress = (
                            synchronization: ManagedSynchronizationState
                          ): void => {
                            update(course.repositoryId, {
                              synchronization,
                              ...(synchronization.metadata ?? {}),
                              ...(synchronization.reason === "authorization_lost"
                                ? {
                                    authorization: "unavailable" as const,
                                    freshness: "needs_attention" as const
                                  }
                                : {})
                            });
                          };
                          try {
                            const synchronized = await this.withVerifiedAccount(
                              controller.signal,
                              () => this.deps.synchronizeCourse!({ ...input, onProgress })
                            );
                            if (current() && synchronized.reason === "authentication_failed")
                              await this.confirmCredential(snapshot);
                            onProgress(synchronized);
                          } catch (error) {
                            if (
                              error instanceof GithubOAuthError &&
                              error.code === "invalid_credential"
                            )
                              throw error;
                            onProgress({
                              status: "failed",
                              reason: "network_failure",
                              diagnostic:
                                "Course update could not finish. Retry synchronization. Your sign-in is preserved.",
                              retryable: true
                            });
                          }
                        }
                      }
                    },
                    MANAGED_BOOTSTRAP_CONCURRENCY
                  );
                }
              }
            } catch (error) {
              if (error instanceof GithubOAuthError && error.code === "invalid_credential")
                throw error;
              if (current())
                this.state = {
                  ...this.state,
                  courseDiscovery: {
                    ...this.state.courseDiscovery,
                    userId,
                    status: "error",
                    diagnostics: [
                      {
                        organizationId: null,
                        status: "unavailable",
                        message: "Course discovery temporarily unavailable. Refresh courses."
                      }
                    ]
                  }
                };
            }
          }
        } else {
          this.state = {
            ...this.state,
            courseDiscovery: {
              ...emptyCourseDiscovery(),
              userId,
              status: "authorization_required"
            },
            organizationDiscovery: {
              status: "authorization_required",
              organizations: [],
              message: "Authorize organization access to discover your GitHub organizations.",
              stale: false
            }
          };
        }
      }
    } catch (error) {
      if (error instanceof GithubOAuthError && error.code === "invalid_credential") {
        try {
          await this.confirmCredential(snapshot);
        } catch {
          /* Confirmed rejection already cleared the session. */
        }
      }
      if (current()) {
        const insufficient =
          error instanceof GithubOAuthError && error.code === "insufficient_scope";
        this.state = {
          ...this.state,
          courseDiscovery: {
            ...this.state.courseDiscovery,
            userId,
            status: "error",
            diagnostics: [
              {
                organizationId: null,
                status: "unavailable",
                message: "Course discovery temporarily unavailable. Refresh courses."
              }
            ]
          },
          organizationPermission: insufficient ? "required" : this.state.organizationPermission,
          organizationDiscovery: {
            ...this.state.organizationDiscovery,
            status: insufficient ? "authorization_required" : "error",
            message: safeMessage(error),
            stale: this.state.organizationDiscovery.organizations.length > 0
          }
        };
      }
    } finally {
      if (current() && this.state.courseDiscovery.status === "loading")
        this.state = {
          ...this.state,
          courseDiscovery: { ...this.state.courseDiscovery, status: "ready" }
        };
      completeDiscovery();
      if (this.courseDiscoveryCompletion === completion) this.courseDiscoveryCompletion = null;
      if (this.discovery === controller) this.discovery = null;
      if (this.active === controller) this.active = null;
    }
    return this.getState();
  }
  shutdown(): void {
    this.stopped = true;
    if (this.authorization) this.authorization.valid = false;
    this.invalidateReconciliations();
    this.discovery?.abort();
    this.active?.abort();
  }
}
