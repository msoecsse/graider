import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  MigrationReviewProgressStore,
  MigrationReviewProgress
} from "./migrationReviewTypes.js";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
export type {
  CourseMigrationAnalysis,
  MigrationReviewSubmission,
  MigrationReviewResult,
  MigrationReviewSessionView,
  MigrationReviewSource,
  MigrationReviewAcknowledgement,
  MigrationReviewTermDecision,
  VerifiedMigrationFaculty
} from "../dist-electron/migrationReviewBackend.cjs";

export interface MigrationReviewLoadRequest {
  readonly selector: string;
}
export interface MigrationReviewSessionRequest {
  readonly sessionId: string;
  readonly source: Backend.MigrationReviewSource;
}
export interface MigrationReviewVerifyRequest extends MigrationReviewSessionRequest {
  readonly institutionalUsername: string;
  readonly githubLogin: string;
  readonly addFaculty: boolean;
}
export interface MigrationReviewCompleteRequest extends MigrationReviewSessionRequest {
  readonly submission: Backend.MigrationReviewSubmission;
}
export interface MigrationReviewReader {
  snapshot(): Promise<Backend.MigrationSnapshot>;
  inventory?(
    analysis: Backend.CourseMigrationAnalysis,
    review: Backend.MigrationReviewResult
  ): Promise<Backend.LegacyGraderInventory>;
  observe(): Promise<{
    repository: { id: number; organizationId: number; defaultBranch: string };
    sourceCommitSha: string;
  }>;
  lookupLogin(login: string): Promise<{ githubUserId: number; githubLogin: string }>;
}
export interface MigrationReviewTrustedContext {
  readonly userId: number;
  readonly institutionalUsername: string | null;
  readonly generation: number;
  readonly reader: MigrationReviewReader;
}
export interface MigrationReviewServiceDependencies {
  readonly backend: () => typeof Backend;
  readonly withCourse: <T>(
    selector: string,
    operation: (context: MigrationReviewTrustedContext) => Promise<T>
  ) => Promise<T>;
  readonly receipt?: () => string;
  readonly progress?: MigrationReviewProgressStore;
}
interface ReviewSession {
  readonly selector: string;
  readonly userId: number;
  readonly generation: number;
  readonly source: Backend.MigrationSnapshot;
  readonly choices: Map<string, Backend.TrustedFacultyIdentityEvidence>;
  view: Backend.MigrationReviewSessionView;
  busy: boolean;
  stale: boolean;
  completedResult: Backend.MigrationReviewResult | null;
  graderContext?: Backend.GraderAccessContext;
  graderResult?: Backend.GraderAccessReview;
  decisions?: Backend.MigrationReviewSubmission;
  savedGrader?: MigrationReviewProgress["grader"];
  acknowledgement?: {
    readonly review: Backend.MigrationReviewResult;
    readonly access: Backend.GraderAccessReview;
  };
}
export interface MigrationReviewResponse {
  readonly status: "ready" | "blocked" | "stale" | "not_applicable";
  readonly view: Backend.MigrationReviewSessionView | null;
  readonly message: string | null;
  readonly savedSubmission?: Backend.MigrationReviewSubmission;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).every((key) => fields.includes(key));
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
const validSource = (value: unknown): value is Backend.MigrationReviewSource =>
  object(value) &&
  exact(value, ["repositoryId", "sourceCommitSha", "reportId", "authenticatedGithubUserId"]) &&
  Number.isSafeInteger(value.repositoryId) &&
  Number(value.repositoryId) > 0 &&
  Number.isSafeInteger(value.authenticatedGithubUserId) &&
  Number(value.authenticatedGithubUserId) > 0 &&
  text(value.sourceCommitSha) &&
  text(value.reportId);
export const isMigrationReviewLoadRequest = (value: unknown): value is MigrationReviewLoadRequest =>
  object(value) &&
  exact(value, ["selector"]) &&
  typeof value.selector === "string" &&
  /^managed-course:[1-9][0-9]*:[1-9][0-9]*$/.test(value.selector);
const validSession = (
  value: unknown,
  fields: readonly string[]
): value is Record<string, unknown> & MigrationReviewSessionRequest =>
  object(value) &&
  exact(value, ["sessionId", "source", ...fields]) &&
  text(value.sessionId) &&
  validSource(value.source);
export const isMigrationReviewSessionRequest = (
  value: unknown
): value is MigrationReviewSessionRequest => validSession(value, []);
export const isMigrationReviewVerifyRequest = (
  value: unknown
): value is MigrationReviewVerifyRequest =>
  validSession(value, ["institutionalUsername", "githubLogin", "addFaculty"]) &&
  text(value.institutionalUsername) &&
  /^[^\s\p{C}]+$/u.test(value.institutionalUsername) &&
  text(value.githubLogin) &&
  /^[A-Za-z0-9-]+$/.test(value.githubLogin) &&
  typeof value.addFaculty === "boolean";
export const isMigrationReviewCompleteRequest = (
  value: unknown
): value is MigrationReviewCompleteRequest =>
  validSession(value, ["submission"]) && object(value.submission);
const sameSource = (a: Backend.MigrationReviewSource, b: Backend.MigrationReviewSource) =>
  a.repositoryId === b.repositoryId &&
  a.sourceCommitSha === b.sourceCommitSha &&
  a.reportId === b.reportId &&
  a.authenticatedGithubUserId === b.authenticatedGithubUserId;
export const loadMigrationReviewBackend = (): typeof Backend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "migrationReviewBackend.cjs"
    )
  );

/** Session-local only. Renderer assertions are compared with retained context, never adopted. */
export const createMigrationReviewService = (deps: MigrationReviewServiceDependencies) => {
  const sessions = new Map<number, ReviewSession>();
  const checkpointReviewIds = new WeakMap<Backend.MigrationReviewResult, string>();
  const loads = new Map<number, symbol>();
  const retainedOwners = new Set<number>();
  const closingOwners = new Set<number>();
  const autosaves = new Map<number, Promise<void>>();
  const disposeClosed = (owner: number): void => {
    if (closingOwners.has(owner) && !retainedOwners.has(owner) && !autosaves.has(owner)) {
      closingOwners.delete(owner);
      sessions.delete(owner);
      loads.delete(owner);
    }
  };
  const queueAutosave = (owner: number, operation: () => Promise<void>): Promise<void> => {
    if (!sessions.has(owner) || closingOwners.has(owner))
      return Promise.reject(new Error("Review is closed."));
    const previous = autosaves.get(owner) ?? Promise.resolve();
    const queued = previous
      .catch(() => {})
      .then(operation)
      .finally(() => {
        if (autosaves.get(owner) === queued) autosaves.delete(owner);
        disposeClosed(owner);
      });
    autosaves.set(owner, queued);
    return queued;
  };
  const token = deps.receipt ?? randomUUID;
  const backend = () => deps.backend();
  const response = (
    status: MigrationReviewResponse["status"],
    view: Backend.MigrationReviewSessionView | null,
    message: string | null,
    savedSubmission?: Backend.MigrationReviewSubmission
  ): MigrationReviewResponse =>
    backend().freezeMigrationReview({
      status,
      view,
      message,
      ...(savedSubmission ? { savedSubmission } : {})
    });
  const buildView = (
    session: Omit<ReviewSession, "view" | "busy" | "stale" | "completedResult">
  ): Backend.MigrationReviewSessionView => {
    const evidence = [...(session.source.trustedIdentities ?? []), ...session.choices.values()];
    const analysis = backend().analyzeSchemaV1Migration({
      ...session.source,
      trustedIdentities: evidence
    });
    const verifiedFaculty: Backend.VerifiedMigrationFaculty[] =
      analysis.provisionalFacultyDirectory.value.map((identity) => ({
        identity,
        verificationId: token(),
        origin: session.choices.has(identity.institutional_username)
          ? "explicit_review"
          : "analysis"
      }));
    for (const [username, selected] of session.choices)
      if (!analysis.faculty.some((identity) => identity.institutionalUsername === username)) {
        const parsed = backend().facultyIdentitySchema.safeParse({
          institutional_username: username,
          github_user_id: selected.githubUserId,
          github_login: selected.githubLogin,
          github_login_history: selected.githubLoginHistory ?? []
        });
        if (parsed.success)
          verifiedFaculty.push({
            identity: parsed.data,
            verificationId: token(),
            origin: "explicit_addition"
          });
      }
    verifiedFaculty.sort((a, b) =>
      a.identity.institutional_username.localeCompare(b.identity.institutional_username)
    );
    return backend().freezeMigrationReview({
      sessionId: token(),
      selector: session.selector,
      analysis,
      verifiedFaculty
    });
  };
  const owned = (owner: number, request: MigrationReviewSessionRequest): ReviewSession => {
    const session = sessions.get(owner);
    if (
      !session ||
      session.view.sessionId !== request.sessionId ||
      !sameSource(backend().migrationReviewSource(session.view.analysis), request.source)
    )
      throw new Error("Review session or analysis binding changed. Refresh analysis.");
    return session;
  };
  const clearGrader = (session: ReviewSession): void => {
    delete session.acknowledgement;
    delete session.graderContext;
    delete session.graderResult;
  };
  const current = async (
    session: ReviewSession,
    context: MigrationReviewTrustedContext,
    expectedRevision = session.source.binding.sourceCommitSha
  ): Promise<"current" | "stale"> => {
    if (context.userId !== session.userId || context.generation !== session.generation) {
      clearGrader(session);
      session.completedResult = null;
      session.stale = true;
      throw new Error("Authenticated account changed. Refresh analysis.");
    }
    if (
      session.view.analysis.validatedMigrationFacts &&
      (!context.institutionalUsername ||
        !session.view.analysis.terms.some((term) =>
          term.sections.some((section) =>
            section.facultyIdentities.includes(context.institutionalUsername ?? "")
          )
        ))
    )
      throw new Error("Current faculty authorization changed. Refresh courses.");
    if (session.stale) return "stale";
    const observed = await context.reader.observe();
    if (
      observed.repository.id !== session.source.binding.repositoryId ||
      observed.repository.organizationId !== session.source.binding.organizationId
    ) {
      session.stale = true;
      session.completedResult = null;
      throw new Error("Immutable repository or organization changed. Refresh courses.");
    }
    session.stale = observed.sourceCommitSha !== expectedRevision;
    if (session.stale) clearGrader(session);
    return session.stale ? "stale" : "current";
  };
  const persist = (session: ReviewSession): void => {
    if (deps.progress && session.source.binding.organizationId)
      deps.progress.write({
        version: 1,
        organizationId: session.source.binding.organizationId,
        reviewIdentity: session.view.sessionId,
        submission: session.decisions ?? backend().emptyMigrationReviewSubmission(session.view),
        identities: session.view.verifiedFaculty.map((entry) => entry.identity),
        choices: [...session.choices].map(([username, identity]) => ({
          institutional_username: username,
          github_user_id: identity.githubUserId,
          github_login: identity.githubLogin,
          github_login_history: identity.githubLoginHistory ?? []
        })),
        grader: session.savedGrader ?? null
      });
  };
  const restore = async (
    session: ReviewSession,
    context: MigrationReviewTrustedContext
  ): Promise<boolean> => {
    const saved = deps.progress?.read(context.userId, session.source.binding.repositoryId);
    if (
      !saved ||
      saved.organizationId !== session.source.binding.organizationId ||
      saved.submission.source.sourceCommitSha !== session.source.binding.sourceCommitSha
    )
      return false;
    // Disk records are hints. Fresh lookups must prove every immutable identity again.
    try {
      for (const identity of saved.identities) {
        const observed = await context.reader.lookupLogin(identity.github_login);
        if (
          observed.githubUserId !== identity.github_user_id ||
          observed.githubLogin !== identity.github_login
        )
          return false;
      }
      for (const identity of saved.choices) {
        if (
          !saved.identities.some(
            (verified) =>
              verified.institutional_username === identity.institutional_username &&
              verified.github_user_id === identity.github_user_id &&
              verified.github_login === identity.github_login
          )
        )
          return false;
        // Re-derive historical observations from the trusted source. Disk history is not evidence.
        const history = [
          ...new Set(
            (session.source.trustedIdentities ?? [])
              .filter(
                (entry) =>
                  entry.institutionalUsername === identity.institutional_username &&
                  entry.githubUserId === identity.github_user_id
              )
              .flatMap((entry) => [entry.githubLogin, ...(entry.githubLoginHistory ?? [])])
          )
        ]
          .filter((login) => login !== identity.github_login)
          .sort();
        session.choices.set(identity.institutional_username, {
          institutionalUsername: identity.institutional_username,
          githubUserId: identity.github_user_id,
          githubLogin: identity.github_login,
          githubLoginHistory: history,
          provenance: "trusted-identity-evidence",
          reference: "explicit-review-github-lookup"
        });
      }
      const fresh = buildView(session);
      if (
        !sameSource(backend().migrationReviewSource(fresh.analysis), saved.submission.source) ||
        backend().migrationFingerprint(fresh.verifiedFaculty.map((entry) => entry.identity)) !==
          backend().migrationFingerprint(saved.identities)
      ) {
        session.choices.clear();
        return false;
      }
      const restoredDecisions = backend().freezeMigrationReview({
        ...saved.submission,
        source: backend().migrationReviewSource(fresh.analysis),
        facultyMappings: backend().emptyMigrationReviewSubmission(fresh).facultyMappings
      });
      const checked = backend().validateMigrationReview(fresh, restoredDecisions);
      if (
        checked.errors.length ||
        checked.status === "stale" ||
        checked.status === "not_applicable"
      ) {
        session.choices.clear();
        return false;
      }
      session.view = fresh;
      session.decisions = restoredDecisions;
      session.savedGrader = saved.grader;
      return true;
    } catch {
      session.choices.clear();
      return false;
    }
  };
  const load = async (
    owner: number,
    request: MigrationReviewLoadRequest
  ): Promise<MigrationReviewResponse> => {
    if (!isMigrationReviewLoadRequest(request))
      return response("blocked", null, "Select an authorized managed course.");
    const attempt = Symbol();
    loads.set(owner, attempt);
    sessions.delete(owner);
    try {
      return await deps.withCourse(request.selector, async (context) => {
        const source = await context.reader.snapshot();
        const selector = `managed-course:${context.userId}:${source.binding.repositoryId}`;
        if (
          selector !== request.selector ||
          source.binding.authenticatedGithubUserId !== context.userId
        )
          throw new Error("Invalid trusted course identity.");
        const retained = {
          selector,
          userId: context.userId,
          generation: context.generation,
          source: structuredClone(source),
          choices: new Map<string, Backend.TrustedFacultyIdentityEvidence>()
        };
        const session: ReviewSession = {
          ...retained,
          view: buildView(retained),
          busy: false,
          stale: false,
          completedResult: null
        };
        const restored = await restore(session, context);
        if ((await current(session, context)) === "stale")
          return response("stale", null, "Course changed during analysis. Refresh analysis.");
        if (loads.get(owner) !== attempt) throw new Error("Review session was replaced.");
        sessions.set(owner, session);
        return response(
          session.view.analysis.status === "not_applicable" ? "not_applicable" : "ready",
          session.view,
          restored
            ? "Saved decisions restored after fresh validation. Complete both reviews again before final confirmation."
            : "Review decisions are saved on this computer. Changed or unavailable evidence requires a new review.",
          session.decisions
        );
      });
    } catch {
      return response(
        "blocked",
        null,
        "Course review is unavailable. Check your account and course authorization, then refresh analysis."
      );
    }
  };
  return {
    load,
    retain(owner: number): () => void {
      if (!sessions.has(owner) || retainedOwners.has(owner))
        throw new Error("Review cannot be retained.");
      retainedOwners.add(owner);
      return () => {
        retainedOwners.delete(owner);
        disposeClosed(owner);
      };
    },
    close(owner: number, request?: MigrationReviewSessionRequest): void {
      const session = sessions.get(owner);
      // A delayed navigation cleanup must not dispose a replacement review.
      const matches =
        request === undefined ||
        (isMigrationReviewSessionRequest(request) &&
          session?.view.sessionId === request.sessionId &&
          sameSource(backend().migrationReviewSource(session.view.analysis), request.source));
      if (matches) {
        closingOwners.add(owner);
        disposeClosed(owner);
      }
    },
    async refresh(
      owner: number,
      request: MigrationReviewSessionRequest
    ): Promise<MigrationReviewResponse> {
      if (!isMigrationReviewSessionRequest(request))
        return response("blocked", null, "Invalid review request.");
      try {
        const session = owned(owner, request);
        return load(owner, { selector: session.selector });
      } catch {
        return response("blocked", null, "Review session changed. Reopen migration review.");
      }
    },
    async verify(
      owner: number,
      request: MigrationReviewVerifyRequest
    ): Promise<MigrationReviewResponse> {
      if (!isMigrationReviewVerifyRequest(request))
        return response(
          "blocked",
          null,
          "Enter an institutional username and GitHub login; numeric identity assertions are not accepted."
        );
      let session: ReviewSession | undefined;
      try {
        session = owned(owner, request);
        if (session.busy) throw new Error("Review operation is already running.");
        session.busy = true;
        clearGrader(session);
        const retained = session;
        return await deps.withCourse(session.selector, async (context) => {
          if ((await current(retained, context)) === "stale")
            return response(
              "stale",
              retained.view,
              "Course changed. Refresh analysis and review the new source."
            );
          const exists = retained.view.analysis.faculty.some(
            (entry) => entry.institutionalUsername === request.institutionalUsername
          );
          if (
            !exists &&
            !request.addFaculty &&
            !retained.choices.has(request.institutionalUsername)
          )
            throw new Error("Explicit Add faculty is required.");
          const identity = await context.reader.lookupLogin(request.githubLogin);
          if (
            !backend().facultyIdentitySchema.safeParse({
              institutional_username: request.institutionalUsername,
              github_user_id: identity.githubUserId,
              github_login: identity.githubLogin,
              github_login_history: []
            }).success
          )
            throw new Error("Invalid verified GitHub identity.");
          const previous = retained.choices.get(request.institutionalUsername);
          const trusted =
            retained.source.trustedIdentities?.filter(
              (entry) =>
                entry.institutionalUsername === request.institutionalUsername &&
                entry.githubUserId === identity.githubUserId
            ) ?? [];
          const history = [
            ...new Set([
              ...(previous?.githubUserId === identity.githubUserId
                ? [previous.githubLogin, ...(previous.githubLoginHistory ?? [])]
                : []),
              ...trusted.flatMap((entry) => [
                entry.githubLogin,
                ...(entry.githubLoginHistory ?? [])
              ])
            ])
          ]
            .filter((login) => login !== identity.githubLogin)
            .sort();
          if ((await current(retained, context)) === "stale")
            return response(
              "stale",
              retained.view,
              "Course changed during verification. Refresh analysis."
            );
          if (sessions.get(owner) !== retained) throw new Error("Review session was replaced.");
          retained.choices.set(request.institutionalUsername, {
            institutionalUsername: request.institutionalUsername,
            ...identity,
            githubLoginHistory: history,
            provenance: "trusted-identity-evidence",
            reference: "explicit-review-github-lookup"
          });
          clearGrader(retained);
          retained.view = buildView(retained);
          retained.completedResult = null;
          retained.decisions = backend().emptyMigrationReviewSubmission(retained.view);
          retained.savedGrader = null;
          persist(retained);
          return response(
            "ready",
            retained.view,
            "GitHub identity verified. Review selections were reset for the refreshed analysis."
          );
        });
      } catch {
        return response(
          "blocked",
          session?.view ?? null,
          "Identity could not be verified against this review. Check the login, account and analysis binding."
        );
      } finally {
        if (session) session.busy = false;
      }
    },
    async loadGrader(owner: number, request: MigrationReviewSessionRequest) {
      if (!isMigrationReviewSessionRequest(request)) throw new Error("Invalid review binding.");
      const session = owned(owner, request);
      if (session.busy) throw new Error("Review operation is already running.");
      session.busy = true;
      clearGrader(session);
      try {
        return await deps.withCourse(session.selector, async (context) => {
          if (
            (await current(session, context)) !== "current" ||
            !session.completedResult ||
            !context.reader.inventory
          )
            throw new Error("Complete migration review before loading grader access.");
          const review = session.completedResult;
          const inventory = await context.reader.inventory(session.view.analysis, review);
          if (
            (await current(session, context)) !== "current" ||
            sessions.get(owner) !== session ||
            session.completedResult !== review
          )
            throw new Error("Review changed during inventory. Reload review.");
          const retained = backend().freezeMigrationReview({
            inventoryId: token(),
            inventory,
            review
          });
          session.graderContext = retained;
          const saved = session.savedGrader;
          const reusable =
            saved?.fingerprint === backend().migrationFingerprint({ inventory, review }) &&
            backend().reviewGraderAccess(retained, {
              inventoryId: retained.inventoryId,
              decisions: saved.submission.decisions
            }).errors.length === 0;
          return backend().freezeMigrationReview({
            ...retained,
            savedDecisions: reusable && saved ? saved.submission.decisions : []
          });
        });
      } finally {
        session.busy = false;
      }
    },
    async completeGrader(owner: number, request: GraderAccessCompleteRequest) {
      if (!isGraderAccessCompleteRequest(request)) throw new Error("Invalid grader decisions.");
      const session = owned(owner, request);
      if (session.busy) throw new Error("Review operation is already running.");
      session.busy = true;
      delete session.acknowledgement;
      delete session.graderResult;
      try {
        return await deps.withCourse(session.selector, async (context) => {
          if (
            (await current(session, context)) !== "current" ||
            sessions.get(owner) !== session ||
            !session.graderContext
          )
            throw new Error("Grader review changed. Reload review.");
          const result = backend().reviewGraderAccess(session.graderContext, request.submission);
          session.savedGrader = {
            fingerprint: backend().migrationFingerprint({
              inventory: session.graderContext.inventory,
              review: session.graderContext.review
            }),
            submission: structuredClone(request.submission)
          };
          persist(session);
          if (result.status === "complete") session.graderResult = result;
          return result;
        });
      } catch (error) {
        clearGrader(session);
        throw error;
      } finally {
        session.busy = false;
      }
    },
    /** Main-only exact retained handoff; no renderer artifact can become authority. */
    async getCompletedGraderHandoff(owner: number, request: MigrationReviewSessionRequest) {
      if (!isMigrationReviewSessionRequest(request)) throw new Error("Invalid review binding.");
      const session = owned(owner, request);
      const analysis = session.view.analysis;
      const review = session.completedResult;
      const context = session.graderContext;
      const access = session.graderResult;
      if (!review || !context || !access || context.review !== review) return null;
      const retained = (): void => {
        if (
          sessions.get(owner) !== session ||
          session.busy ||
          session.view.analysis !== analysis ||
          session.completedResult !== review ||
          session.graderContext !== context ||
          session.graderResult !== access
        )
          throw new Error("Grader handoff was replaced. Reopen review.");
      };
      /** Main-only: a different revision is allowed solely after independent publication proof.
       * This checks retained authority, never proves publication or caches it.
       */
      const revalidate = async (publishedRevision?: string): Promise<void> => {
        retained();
        try {
          await deps.withCourse(session.selector, async (trusted) => {
            if ((await current(session, trusted, publishedRevision)) !== "current")
              throw new Error("Grader handoff source changed. Reopen review.");
            retained();
          });
        } catch (error) {
          clearGrader(session);
          throw error;
        }
      };
      await revalidate();
      return { analysis, review, inventory: context.inventory, access, revalidate };
    },
    /** Main-only exact retained handoff; no renderer artifact can become authority. */
    async getCompletedGrader(owner: number, request: MigrationReviewSessionRequest) {
      const session = owned(owner, request);
      try {
        return await deps.withCourse(session.selector, async (context) => {
          if (
            (await current(session, context)) !== "current" ||
            sessions.get(owner) !== session ||
            !session.completedResult
          )
            return null;
          return session.graderResult ?? null;
        });
      } catch (error) {
        clearGrader(session);
        throw error;
      }
    },
    /** Main-only prepublication checkpoint handoff. Completion identity changes even on identical re-review. */
    async getCheckpointHandoff(owner: number, request: MigrationReviewSessionRequest) {
      if (!isMigrationReviewSessionRequest(request)) throw new Error("Invalid review binding.");
      const session = owned(owner, request);
      const analysis = session.view.analysis;
      const review = session.completedResult;
      if (!review || review.status !== "complete") return null;
      let reviewId = checkpointReviewIds.get(review);
      if (!reviewId) {
        reviewId = token();
        checkpointReviewIds.set(review, reviewId);
      }
      const retained = (): void => {
        if (
          sessions.get(owner) !== session ||
          session.busy ||
          session.view.analysis !== analysis ||
          session.completedResult !== review
        )
          throw new Error("Migration review was replaced. Reopen review.");
      };
      const revalidate = async (): Promise<void> => {
        retained();
        await deps.withCourse(session.selector, async (trusted) => {
          if ((await current(session, trusted)) !== "current")
            throw new Error("Migration source changed. Reopen review.");
          retained();
        });
      };
      await revalidate();
      return Object.freeze({
        analysis,
        review,
        reviewId,
        generation: session.generation,
        snapshot: backend().freezeMigrationReview(
          structuredClone({
            ...session.source,
            trustedIdentities: [
              ...(session.source.trustedIdentities ?? []),
              ...session.choices.values()
            ]
          })
        ),
        revalidate
      });
    },
    /** Main-process handoff for 9.3. Never accept a renderer-returned completed artifact. */
    async getCompleted(owner: number, request: MigrationReviewSessionRequest) {
      const session = owned(owner, request);
      return deps.withCourse(session.selector, async (context) => {
        if ((await current(session, context)) !== "current" || !session.completedResult)
          return null;
        if (sessions.get(owner) !== session) throw new Error("Review session was replaced.");
        return backend().freezeMigrationReview({
          analysis: session.view.analysis,
          review: session.completedResult
        });
      });
    },
    save(owner: number, submitted: MigrationReviewCompleteRequest): Promise<void> {
      const request = structuredClone(submitted);
      return queueAutosave(owner, async () => {
        if (
          !isMigrationReviewCompleteRequest(request) ||
          !backend().migrationReviewSubmissionSchema.safeParse(request.submission).success
        )
          throw new Error("Invalid review decisions.");
        const session = owned(owner, request);
        if (session.busy) throw new Error("Review operation is already running.");
        session.busy = true;
        clearGrader(session);
        session.completedResult = null;
        try {
          await deps.withCourse(session.selector, async (context) => {
            if (
              (await current(session, context)) !== "current" ||
              sessions.get(owner) !== session ||
              !sameSource(request.submission.source, request.source)
            )
              throw new Error("Review changed. Refresh analysis.");
            const mappings = backend().emptyMigrationReviewSubmission(session.view).facultyMappings;
            if (
              backend().migrationFingerprint(request.submission.facultyMappings) !==
              backend().migrationFingerprint(mappings)
            )
              throw new Error("Identity receipts changed.");
            session.decisions = backend().freezeMigrationReview(
              structuredClone(request.submission)
            );
            session.savedGrader = null;
            persist(session);
          });
        } finally {
          session.busy = false;
        }
      });
    },
    saveGrader(owner: number, submitted: GraderAccessCompleteRequest): Promise<void> {
      const request = structuredClone(submitted);
      return queueAutosave(owner, async () => {
        if (!isGraderAccessCompleteRequest(request)) throw new Error("Invalid grader decisions.");
        const session = owned(owner, request);
        if (session.busy) throw new Error("Review operation is already running.");
        session.busy = true;
        delete session.acknowledgement;
        delete session.graderResult;
        try {
          await deps.withCourse(session.selector, async (context) => {
            if (
              (await current(session, context)) !== "current" ||
              sessions.get(owner) !== session ||
              !session.graderContext ||
              request.submission.inventoryId !== session.graderContext.inventoryId
            )
              throw new Error("Grader inventory changed.");
            session.savedGrader = {
              fingerprint: backend().migrationFingerprint({
                inventory: session.graderContext.inventory,
                review: session.graderContext.review
              }),
              submission: structuredClone(request.submission)
            };
            persist(session);
          });
        } finally {
          session.busy = false;
        }
      });
    },
    /** Main-only acknowledgement issued by the single explicit Upgrade course action. */
    async acknowledge(owner: number, request: MigrationReviewSessionRequest): Promise<void> {
      const session = owned(owner, request);
      const handoff = await this.getCheckpointHandoff(owner, request);
      const grader = await this.getCompletedGraderHandoff(owner, request);
      if (!handoff || !grader)
        throw new Error("Complete both current reviews before confirmation.");
      await handoff.revalidate();
      await grader.revalidate();
      session.acknowledgement = { review: handoff.review, access: grader.access };
    },
    async getAcknowledgement(owner: number, request: MigrationReviewSessionRequest) {
      const session = owned(owner, request);
      const ack = session.acknowledgement;
      if (!ack) throw new Error("Explicit authorized acknowledgement is required.");
      const handoff = await this.getCheckpointHandoff(owner, request);
      const grader = await this.getCompletedGraderHandoff(owner, request);
      const revalidate = async (): Promise<void> => {
        if (
          !handoff ||
          !grader ||
          session.acknowledgement !== ack ||
          ack.review !== handoff.review ||
          ack.access !== grader.access
        )
          throw new Error("Acknowledgement changed. Confirm the current review again.");
        await handoff.revalidate();
        await grader.revalidate();
        if (session.acknowledgement !== ack) throw new Error("Acknowledgement was invalidated.");
      };
      await revalidate();
      return { revalidate };
    },
    async complete(
      owner: number,
      request: MigrationReviewCompleteRequest
    ): Promise<Backend.MigrationReviewResult> {
      if (!isMigrationReviewCompleteRequest(request))
        throw new Error("Invalid review completion request.");
      const session = owned(owner, request);
      if (session.busy) throw new Error("Review operation is already running.");
      session.busy = true;
      clearGrader(session);
      try {
        return await deps.withCourse(session.selector, async (context) => {
          const result = backend().validateMigrationReview(session.view, request.submission);
          const freshness = await current(session, context);
          if (sessions.get(owner) !== session) throw new Error("Review session was replaced.");
          if (freshness === "stale") {
            session.completedResult = null;
            return backend().freezeMigrationReview({
              ...structuredClone(result),
              status: "stale" as const,
              errors: [
                {
                  key: "source",
                  message: "The authoritative course changed. Refresh analysis and review again."
                }
              ]
            });
          }
          const parsed = backend().migrationReviewSubmissionSchema.safeParse(request.submission);
          if (
            parsed.success &&
            sameSource(parsed.data.source, backend().migrationReviewSource(session.view.analysis))
          ) {
            session.decisions = backend().freezeMigrationReview(parsed.data);
            persist(session);
          }
          session.completedResult = result.status === "complete" ? result : null;
          return result;
        });
      } finally {
        session.busy = false;
      }
    }
  };
};
export type MigrationReviewService = ReturnType<typeof createMigrationReviewService>;

export interface MigrationReviewApi {
  load(request: MigrationReviewLoadRequest): Promise<MigrationReviewResponse>;
  refresh(request: MigrationReviewSessionRequest): Promise<MigrationReviewResponse>;
  verify(request: MigrationReviewVerifyRequest): Promise<MigrationReviewResponse>;
  complete(request: MigrationReviewCompleteRequest): Promise<Backend.MigrationReviewResult>;
  loadGrader(request: MigrationReviewSessionRequest): Promise<
    Backend.GraderAccessContext & {
      readonly savedDecisions?: Backend.GraderAccessSubmission["decisions"];
    }
  >;
  completeGrader(request: GraderAccessCompleteRequest): Promise<Backend.GraderAccessReview>;
  save(request: MigrationReviewCompleteRequest): Promise<void>;
  saveGrader(request: GraderAccessCompleteRequest): Promise<void>;
  close(request?: MigrationReviewSessionRequest): Promise<void>;
}

export interface GraderAccessCompleteRequest extends MigrationReviewSessionRequest {
  readonly submission: Backend.GraderAccessSubmission;
}
export const isGraderAccessCompleteRequest = (
  value: unknown
): value is GraderAccessCompleteRequest =>
  validSession(value, ["submission"]) &&
  loadMigrationReviewBackend().graderAccessSubmissionSchema.safeParse(value.submission).success;
