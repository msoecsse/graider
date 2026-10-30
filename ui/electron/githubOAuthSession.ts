import { mapBounded } from "./remoteCourseDiscovery.js";
import { MANAGED_BOOTSTRAP_CONCURRENCY } from "./managedCourses.js";
import type {
  RemoteCourse,
  ManagedCourseState,
  ManagedSynchronizationState,
  ManagedReconciliationState
} from "./remoteCourseTypes.js";
import { emptyCourseDiscovery } from "./remoteCourseTypes.js";
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

const RANDOM_BYTE_COUNT = 32;
export const createOAuthProof = () => {
  const verifier = randomBytes(RANDOM_BYTE_COUNT).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(RANDOM_BYTE_COUNT).toString("base64url")
  };
};
export interface ManagedOperationInput {
  readonly token: string;
  readonly userId: number;
  readonly course: RemoteCourse;
  readonly signal: AbortSignal;
  readonly revalidateSession: () => Promise<boolean>;
}
interface Dependencies {
  readonly store: GithubOAuthCredentialStore;
  readonly secret: () => string | undefined;
  readonly openBrowser: (url: string) => Promise<unknown>;
  readonly network: ReturnType<typeof createGithubOAuthNetwork>;
  readonly discoverCourses?: (
    token: string,
    userId: number,
    organizations: readonly GithubOrganization[],
    signal: AbortSignal
  ) => Promise<RemoteCourseDiscovery>;
  readonly bootstrapCourse?: (input: ManagedOperationInput) => Promise<ManagedCourseState>;
  readonly synchronizeCourse?: (
    input: ManagedOperationInput & {
      readonly onProgress: (state: ManagedSynchronizationState) => void;
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
  private active: AbortController | null = null;
  private restored: Promise<void> | null = null;
  private stopped = false;
  private accountGeneration = 0;
  get mutationGeneration(): number {
    return this.accountGeneration;
  }
  private readonly reconciliations = new Map<number, AbortController>();
  private invalidateReconciliations(): void {
    this.accountGeneration += 1;
    for (const controller of this.reconciliations.values()) controller.abort();
    this.reconciliations.clear();
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
      const result = await this.deps.reconcileCourse({
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
          !controller.signal.aborted &&
          (await this.deps.network.identity(token, controller.signal)).id === userId &&
          (await this.deps.network.repositoryCapability(token, controller.signal)) &&
          (await this.deps.network.organizationCapability(token, controller.signal)) &&
          current(),
        onProgress: (synchronization) =>
          update({
            synchronization,
            ...(synchronization.metadata ?? {}),
            ...(synchronization.status === "up_to_date" || synchronization.status === "updated"
              ? { bootstrap: { status: "ready", diagnostic: null, retryable: false } }
              : {})
          }),
        onReconciliationProgress: (reconciliation) => update({ reconciliation })
      });
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
      revalidateSession: async () =>
        current() &&
        (await this.deps.network.identity(token, controller.signal)).id === expectedUserId &&
        (await this.deps.network.repositoryCapability(token, controller.signal)) &&
        (await this.deps.network.organizationCapability(token, controller.signal)) &&
        current()
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
    const synchronization = await this.deps.synchronizeCourse({
      ...input,
      onProgress: updateSynchronization
    });
    updateSynchronization(synchronization);
    if (!current()) throw new Error("Account changed. Retry the operation.");
    return operation(input, synchronization);
  }
  private discovery: AbortController | null = null;
  constructor(private readonly deps: Dependencies) {}
  getState(): GithubOAuthState {
    return { ...this.state, busy: this.active !== null };
  }
  restore(): Promise<void> {
    this.restored ??= this.restoreStored();
    return this.restored;
  }
  private async restoreStored(): Promise<void> {
    const controller = new AbortController();
    this.active = controller;
    try {
      const token = await this.deps.store.load();
      if (token && !controller.signal.aborted) {
        const identity = await this.deps.network.identity(token, controller.signal);
        if (!controller.signal.aborted) {
          this.token = token;
          this.state = {
            ...signedOut(),
            status: "signed_in",
            identity,
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
              "Saved GitHub sign-in could not be verified. Your credential is preserved. Check your connection or secure storage, then retry."
          };
        }
      }
    } finally {
      this.active = null;
      if (this.token) void this.refreshOrganizations();
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
      const identity = await this.deps.network.identity(token, controller.signal);
      if (controller.signal.aborted)
        throw new GithubOAuthError("canceled", "GitHub sign-in canceled.");
      const organizationPermission = await this.deps.network.organizationCapability(
        token,
        controller.signal
      );
      const repositoryPermission = await this.deps.network.repositoryCapability(
        token,
        controller.signal
      );
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
      this.invalidateReconciliations();
      this.token = token;
      this.discovery?.abort();
      this.state = {
        ...signedOut(),
        status: "signed_in",
        identity,
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
      this.active = null;
      if (this.token) void this.refreshOrganizations();
    }
    return this.getState();
  }
  cancel(): GithubOAuthState {
    this.active?.abort();
    return this.getState();
  }
  async signOut(): Promise<GithubOAuthState> {
    if (!this.active) {
      this.active = new AbortController();
      this.discovery?.abort();
      this.invalidateReconciliations();
      this.token = null;
      this.state = signedOut();
      try {
        await this.deps.store.delete();
      } catch {
        this.state = {
          ...signedOut(),
          status: "unavailable",
          message:
            "Sign-out could not remove the saved credential. Please retry before closing Graider."
        };
      } finally {
        this.active = null;
      }
    }
    return this.getState();
  }
  async manageAuthorization(): Promise<GithubOAuthState> {
    // Fixed trusted destination; renderer cannot supply URLs.
    await this.deps.openBrowser("https://github.com/settings/applications");
    return this.getState();
  }
  async refreshOrganizations(): Promise<GithubOAuthState> {
    const token = this.token;
    const userId = this.state.identity?.id;
    if (!token || !userId || this.stopped || this.active) return this.getState();
    this.discovery?.abort();
    const controller = new AbortController();
    this.discovery = controller;
    const current = (): boolean =>
      !controller.signal.aborted && this.token === token && this.state.identity?.id === userId;
    this.state = {
      ...this.state,
      organizationDiscovery: { ...this.state.organizationDiscovery, status: "loading" },
      courseDiscovery: { ...emptyCourseDiscovery(), status: "loading", userId }
    };
    try {
      const capable = await this.deps.network.organizationCapability(token, controller.signal);
      const repositoryCapable = await this.deps.network.repositoryCapability(
        token,
        controller.signal
      );
      if (current()) {
        this.state = {
          ...this.state,
          organizationPermission: capable ? "available" : "required",
          repositoryPermission: repositoryCapable ? "available" : "required",
          courseDiscovery: {
            ...emptyCourseDiscovery(),
            userId,
            status: repositoryCapable ? "loading" : "authorization_required"
          }
        };
        if (capable) {
          const result = await this.deps.network.discoverOrganizations(token, controller.signal);
          if (current()) this.state = { ...this.state, organizationDiscovery: result };
          if (current() && repositoryCapable && this.deps.discoverCourses) {
            try {
              const courses = await this.deps.discoverCourses(
                token,
                userId,
                result.organizations,
                controller.signal
              );
              if (current()) {
                this.state = {
                  ...this.state,
                  courseDiscovery: {
                    ...courses,
                    courses: courses.courses.map((course) => ({
                      ...course,
                      synchronization:
                        course.authorization === "authorized"
                          ? { status: "queued", diagnostic: null, retryable: false }
                          : undefined,
                      bootstrap: {
                        status:
                          course.authorization === "authorized" ? "queued" : "not_bootstrapped",
                        diagnostic: null,
                        retryable: false
                      }
                    }))
                  }
                };
                if (this.deps.bootstrapCourse) {
                  const bootstrap = this.deps.bootstrapCourse;
                  const pending = courses.courses.filter(
                    (course) => course.authorization === "authorized"
                  );
                  const update = (
                    repositoryId: number,
                    bootstrapState: ManagedCourseState
                  ): void => {
                    if (current())
                      this.state = {
                        ...this.state,
                        courseDiscovery: {
                          ...this.state.courseDiscovery,
                          courses: this.state.courseDiscovery.courses.map((course) =>
                            course.repositoryId === repositoryId
                              ? { ...course, bootstrap: bootstrapState }
                              : course
                          )
                        }
                      };
                  };
                  await mapBounded(
                    pending,
                    async (course) => {
                      if (current()) {
                        update(course.repositoryId, {
                          status: "bootstrapping",
                          diagnostic: null,
                          retryable: false
                        });
                        const input: ManagedOperationInput = {
                          token,
                          userId,
                          course,
                          signal: controller.signal,
                          revalidateSession: async () =>
                            current() &&
                            (await this.deps.network.identity(token, controller.signal)).id ===
                              userId &&
                            (await this.deps.network.organizationCapability(
                              token,
                              controller.signal
                            )) &&
                            (await this.deps.network.repositoryCapability(
                              token,
                              controller.signal
                            )) &&
                            current()
                        };
                        const result = await bootstrap(input);
                        update(course.repositoryId, result);
                        if (current() && result.status !== "ready")
                          this.state = {
                            ...this.state,
                            courseDiscovery: {
                              ...this.state.courseDiscovery,
                              courses: this.state.courseDiscovery.courses.map((candidate) =>
                                candidate.repositoryId === course.repositoryId
                                  ? {
                                      ...candidate,
                                      synchronization: {
                                        status:
                                          result.status === "needs_attention"
                                            ? "needs_attention"
                                            : "failed",
                                        diagnostic: result.diagnostic,
                                        reason: result.reason,
                                        retryable: result.retryable
                                      }
                                    }
                                  : candidate
                              )
                            }
                          };
                        if (current() && result.status === "ready" && this.deps.synchronizeCourse) {
                          const onProgress = (
                            synchronization: ManagedSynchronizationState
                          ): void => {
                            if (current())
                              this.state = {
                                ...this.state,
                                courseDiscovery: {
                                  ...this.state.courseDiscovery,
                                  courses: this.state.courseDiscovery.courses.map((candidate) =>
                                    candidate.repositoryId === course.repositoryId
                                      ? {
                                          ...candidate,
                                          synchronization,
                                          ...(synchronization.metadata ?? {}),
                                          authorization:
                                            synchronization.reason === "authorization_lost"
                                              ? "unavailable"
                                              : candidate.authorization
                                        }
                                      : candidate
                                  )
                                }
                              };
                          };
                          try {
                            const synchronized = await this.deps.synchronizeCourse({
                              ...input,
                              onProgress
                            });
                            // A Git rejection alone cannot revoke the global OAuth session.
                            if (current() && synchronized.reason === "authentication_failed") {
                              try {
                                await this.deps.network.identity(token, controller.signal);
                              } catch (error) {
                                if (
                                  error instanceof GithubOAuthError &&
                                  error.code === "invalid_credential"
                                )
                                  throw error;
                              }
                            }
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
                    ...emptyCourseDiscovery(),
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
      if (current()) {
        if (error instanceof GithubOAuthError && error.code === "invalid_credential") {
          this.active = controller;
          this.token = null;
          this.state = { ...signedOut(), message: safeMessage(error) };
          try {
            await this.deps.store.delete();
          } catch {
            this.state = {
              ...this.state,
              status: "unavailable",
              message:
                "The invalid saved credential could not be removed. Choose Sign out to retry."
            };
          }
        } else {
          const insufficient =
            error instanceof GithubOAuthError && error.code === "insufficient_scope";
          this.state = {
            ...this.state,
            courseDiscovery: {
              ...emptyCourseDiscovery(),
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
      }
    } finally {
      if (current() && this.state.courseDiscovery.status === "loading")
        this.state = {
          ...this.state,
          courseDiscovery: { ...this.state.courseDiscovery, status: "ready" }
        };
      if (this.discovery === controller) this.discovery = null;
      if (this.active === controller) this.active = null;
    }
    return this.getState();
  }
  shutdown(): void {
    this.stopped = true;
    this.invalidateReconciliations();
    this.discovery?.abort();
    this.active?.abort();
  }
}
