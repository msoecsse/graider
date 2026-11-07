import path from "node:path";
import { randomUUID } from "node:crypto";
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
}
export interface MigrationReviewResponse {
  readonly status: "ready" | "blocked" | "stale" | "not_applicable";
  readonly view: Backend.MigrationReviewSessionView | null;
  readonly message: string | null;
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
  const loads = new Map<number, symbol>();
  const token = deps.receipt ?? randomUUID;
  const backend = () => deps.backend();
  const response = (
    status: MigrationReviewResponse["status"],
    view: Backend.MigrationReviewSessionView | null,
    message: string | null
  ): MigrationReviewResponse => backend().freezeMigrationReview({ status, view, message });
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
    delete session.graderContext;
    delete session.graderResult;
  };
  const current = async (
    session: ReviewSession,
    context: MigrationReviewTrustedContext
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
    session.stale = observed.sourceCommitSha !== session.source.binding.sourceCommitSha;
    if (session.stale) clearGrader(session);
    return session.stale ? "stale" : "current";
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
        if ((await current(session, context)) === "stale")
          return response("stale", null, "Course changed during analysis. Refresh analysis.");
        if (loads.get(owner) !== attempt) throw new Error("Review session was replaced.");
        sessions.set(owner, session);
        return response(
          session.view.analysis.status === "not_applicable" ? "not_applicable" : "ready",
          session.view,
          null
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
    close(owner: number): void {
      sessions.delete(owner);
      loads.delete(owner);
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
          return retained;
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
  loadGrader(request: MigrationReviewSessionRequest): Promise<Backend.GraderAccessContext>;
  completeGrader(request: GraderAccessCompleteRequest): Promise<Backend.GraderAccessReview>;
  close(): Promise<void>;
}

export interface GraderAccessCompleteRequest extends MigrationReviewSessionRequest {
  readonly submission: Backend.GraderAccessSubmission;
}
export const isGraderAccessCompleteRequest = (
  value: unknown
): value is GraderAccessCompleteRequest =>
  validSession(value, ["submission"]) &&
  loadMigrationReviewBackend().graderAccessSubmissionSchema.safeParse(value.submission).success;
