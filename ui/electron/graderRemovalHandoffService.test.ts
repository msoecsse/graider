import fs from "node:fs";
import { parse } from "yaml";
import { describe, expect, it, vi } from "vitest";
import { createGraderRemovalHandoffService } from "./graderRemovalHandoffService.js";
import {
  createMigrationReviewService,
  loadMigrationReviewBackend
} from "./migrationReviewService.js";
import {
  migrationSnapshotFixture,
  reviewedSubmissionFixture,
  graderContextFixture,
  REVIEW_SELECTOR,
  REVIEW_USER,
  REVIEW_OTHER_USER,
  REVIEW_ORG,
  REVIEW_NEW_SHA
} from "./migrationReviewFixtures.js";

const OWNER = 1;
const PUBLICATION_TIMEOUT_MS = 30_000;
const SHA_LENGTH = 40;
const setup = () => {
  const backend = loadMigrationReviewBackend();
  const snapshot = migrationSnapshotFixture();
  let userId = REVIEW_USER;
  let generation = 1;
  let institutionalUsername: string | null = "prof";
  const mutations = { commit: vi.fn(), push: vi.fn(), checkpoint: vi.fn(), github: vi.fn() };
  const reader = {
    snapshot: vi.fn(async () => structuredClone(snapshot)),
    observe: vi.fn(async () => ({
      repository: {
        id: snapshot.binding.repositoryId,
        organizationId: snapshot.binding.organizationId ?? REVIEW_ORG,
        defaultBranch: "main"
      },
      sourceCommitSha: snapshot.binding.sourceCommitSha
    })),
    lookupLogin: vi.fn(async (githubLogin: string) => ({ githubUserId: REVIEW_USER, githubLogin })),
    inventory: vi.fn(async (analysis, _review) =>
      backend.freezeMigrationReview({
        ...graderContextFixture().inventory,
        source: { ...analysis.source, reportId: analysis.reportId },
        evidence: analysis.grader.evidence
      })
    )
  } satisfies import("./migrationReviewService.js").MigrationReviewReader;
  const reviewService = createMigrationReviewService({
    backend: loadMigrationReviewBackend,
    withCourse: async (_selector, operation) =>
      operation({ userId, generation, institutionalUsername, reader, ...mutations })
  });
  const planner = vi.fn(backend.planGraderRemoval);
  const service = createGraderRemovalHandoffService({
    reviewService,
    backend: () => ({ ...backend, planGraderRemoval: planner })
  });
  const prepare = async () => {
    const { view } = await reviewService.load(OWNER, { selector: REVIEW_SELECTOR });
    if (!view) throw new Error("Missing view");
    const request = {
      sessionId: view.sessionId,
      source: backend.migrationReviewSource(view.analysis)
    };
    const review = await reviewService.complete(OWNER, {
      ...request,
      submission: reviewedSubmissionFixture(view)
    });
    const context = await reviewService.loadGrader(OWNER, request);
    const access = await reviewService.completeGrader(OWNER, {
      ...request,
      submission: {
        inventoryId: context.inventoryId,
        decisions: [
          { githubUserId: REVIEW_USER, disposition: "existing_sufficient", sections: [] },
          { githubUserId: REVIEW_OTHER_USER, disposition: "no_access", sections: [] }
        ]
      }
    });
    return { view, request, review, context, access };
  };
  return {
    backend,
    snapshot,
    reader,
    reviewService,
    planner,
    service,
    prepare,
    mutations,
    account: (id = REVIEW_USER) => {
      userId = id;
      generation += 1;
    },
    deauthorize: () => {
      institutionalUsername = null;
    }
  };
};

const publicationSetup = async () => {
  const f = setup();
  const p = await f.prepare();
  const course = f.backend.rawCourseConfigV2Schema.parse(
    parse(fs.readFileSync("../tests/fixtures/config/schema-v2-course.yml", "utf8"))
  );
  course.faculty_directory = p.access.facultyDirectory.map((f) => ({
    ...f,
    github_login_history: [...f.github_login_history]
  }));
  course.fallback_administrator.github_user_id = REVIEW_USER;
  const term = f.backend.rawTermConfigV2Schema.parse(
    parse(fs.readFileSync("../tests/fixtures/config/schema-v2-term.yml", "utf8"))
  );
  term.coordinators = { current: [{ github_user_id: REVIEW_USER }], former: [] };
  term.sections = term.sections.map((s) => ({
    ...s,
    faculty: { current: [{ github_user_id: REVIEW_USER }], former: [] }
  }));
  const published: import("../dist-electron/migrationReviewBackend.cjs").PublishedGraderContext = {
    courseRepositoryId: p.request.source.repositoryId,
    organizationId: REVIEW_ORG,
    authenticatedUserId: REVIEW_USER,
    sessionId: p.request.sessionId,
    authorized: true,
    publishedRevision: REVIEW_NEW_SHA,
    course,
    terms: [term],
    targets: []
  };
  const readPublished = vi.fn(
    async (): Promise<typeof published | null> => structuredClone(published)
  );
  const client =
    {} as import("../dist-electron/migrationReviewBackend.cjs").GitHubCoursePermissionClient &
      import("../dist-electron/migrationReviewBackend.cjs").GitHubManagedTeamClient;
  const factory = vi.fn();
  const reconciliation = vi.fn();
  class Reconciler extends f.backend.LegacyGraderReconciler {
    constructor(...args: ConstructorParameters<typeof f.backend.LegacyGraderReconciler>) {
      super(...args);
      factory(...args);
    }
    override async reconcile(signal = AbortSignal.timeout(PUBLICATION_TIMEOUT_MS)) {
      const args = factory.mock.lastCall!;
      await args[3].readPublished(signal);
      reconciliation();
      return { status: "complete" as const, targets: [], manualCleanupTeamIds: [] };
    }
  }
  const service = createGraderRemovalHandoffService({
    reviewService: f.reviewService,
    backend: () => ({ ...f.backend, LegacyGraderReconciler: Reconciler }),
    publication: {
      readPublished,
      client,
      organizationAccess: { inspect: vi.fn() },
      creationJournal: { has: vi.fn(), add: vi.fn(), delete: vi.fn() }
    }
  });
  const handoff = await service.getHandoff(OWNER, p.request);
  return { ...f, ...p, published, readPublished, factory, reconciliation, handoff: handoff! };
};

describe("trusted grader-removal handoff", () => {
  it("uses exact retained objects, returns the exact plan, and never reloads inventory", async () => {
    const f = setup();
    const p = await f.prepare();
    const handoff = await f.service.getHandoff(OWNER, p.request);
    const args = f.planner.mock.calls[0]!;
    expect(args[0]).toBe(p.view.analysis);
    expect(args[1]).toBe(p.review);
    expect(args[2]).toEqual(f.backend.planAssignmentMigration(p.view.analysis, p.review));
    expect(args[3]).toBe(p.context.inventory);
    expect(args[4]).toBe(p.access);
    expect(handoff?.plan).toBe(f.planner.mock.results[0]?.value);
    expect(f.reader.inventory).toHaveBeenCalledOnce();
    expect(handoff?.plan.publicationReady).toBe(false);
  });
  it.each(["ready", "needs_attention", "blocked", "not_applicable"] as const)(
    "propagates %s unchanged",
    async (status) => {
      const f = setup();
      const p = await f.prepare();
      const plan = f.backend.freezeMigrationReview({
        ...f.backend.planGraderRemoval(
          p.view.analysis,
          p.review,
          f.backend.planAssignmentMigration(p.view.analysis, p.review),
          p.context.inventory,
          p.access
        ),
        status
      });
      f.planner.mockReturnValue(plan);
      expect((await f.service.getHandoff(OWNER, p.request))?.plan).toBe(plan);
    }
  );
  it.each([
    "source",
    "account",
    "generation",
    "verify",
    "refresh",
    "close",
    "replacement",
    "inventory",
    "access",
    "review",
    "repository",
    "organization",
    "authorization"
  ] as const)("invalidates retained authority on %s", async (change) => {
    const f = setup();
    const p = await f.prepare();
    const retained = await f.reviewService.getCompletedGraderHandoff(OWNER, p.request);
    expect(retained).not.toBeNull();
    if (change === "source") f.snapshot.binding.sourceCommitSha = REVIEW_NEW_SHA;
    if (change === "account") f.account(REVIEW_OTHER_USER);
    if (change === "generation") f.account();
    if (change === "authorization") f.deauthorize();
    if (change === "repository") f.snapshot.binding.repositoryId += 1;
    if (change === "organization") f.snapshot.binding.organizationId = REVIEW_ORG + 1;
    if (change === "verify")
      await f.reviewService.verify(OWNER, {
        ...p.request,
        institutionalUsername: "prof",
        githubLogin: "renamed",
        addFaculty: false
      });
    if (change === "refresh") await f.reviewService.refresh(OWNER, p.request);
    if (change === "close") f.reviewService.close(OWNER);
    if (change === "replacement") await f.reviewService.load(OWNER, { selector: REVIEW_SELECTOR });
    if (change === "inventory") await f.reviewService.loadGrader(OWNER, p.request);
    if (change === "access")
      await f.reviewService.completeGrader(OWNER, {
        ...p.request,
        submission: { inventoryId: p.context.inventoryId, decisions: [] }
      });
    if (change === "review")
      await f.reviewService.complete(OWNER, {
        ...p.request,
        submission: f.backend.emptyMigrationReviewSubmission(p.view)
      });
    await expect(retained!.revalidate()).rejects.toThrow();
    f.planner.mockClear();
    const result = await f.service.getHandoff(OWNER, p.request).catch(() => null);
    expect(result).toBeNull();
    expect(f.planner).not.toHaveBeenCalled();
  });
  it.each(["analysis", "review", "inventory", "plan", "access"])(
    "rejects renderer-supplied %s",
    async (key) => {
      const f = setup();
      const p = await f.prepare();
      await expect(f.service.getHandoff(OWNER, { ...p.request, [key]: {} })).rejects.toThrow();
      expect(f.planner).not.toHaveBeenCalled();
    }
  );
  it("rejects another owner and mismatched source assertions", async () => {
    const f = setup();
    const p = await f.prepare();
    await expect(f.service.getHandoff(OWNER + 1, p.request)).rejects.toThrow();
    await expect(
      f.service.getHandoff(OWNER, {
        ...p.request,
        source: { ...p.request.source, reportId: "other" }
      })
    ).rejects.toThrow();
  });
  it("needs both completed reviews", async () => {
    const f = setup();
    const p = await f.prepare();
    await f.reviewService.loadGrader(OWNER, p.request);
    expect(await f.service.getHandoff(OWNER, p.request)).toBeNull();
    expect(f.planner).not.toHaveBeenCalled();
  });
  it("provides no reconciliation before independently proven publication and performs no mutations", async () => {
    const f = setup();
    const p = await f.prepare();
    const write = vi.spyOn(fs, "writeFileSync");
    try {
      const handoff = await f.service.getHandoff(OWNER, p.request);
      await expect(handoff!.reconcile()).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
      Object.values(f.mutations).forEach((m) => expect(m).not.toHaveBeenCalled());
    } finally {
      write.mockRestore();
    }
  });
  it("admits the exact proven publication, passes the retained plan, and reads proof at every checkpoint/run", async () => {
    const f = await publicationSetup();
    f.snapshot.binding.sourceCommitSha = REVIEW_NEW_SHA;
    expect(await f.handoff.reconcile()).toMatchObject({ status: "complete" });
    expect(f.factory.mock.calls[0]?.[2]).toBe(f.handoff.plan);
    expect(f.readPublished).toHaveBeenCalledTimes(2);
    expect(f.readPublished.mock.calls[0]).toEqual([OWNER, f.request, expect.any(AbortSignal)]);
    f.readPublished.mockResolvedValue(null);
    await expect(f.handoff.reconcile()).rejects.toThrow();
    expect(f.factory).toHaveBeenCalledOnce();
    expect(f.reconciliation).toHaveBeenCalledOnce();
  });
  it.each([
    "unpublished",
    "stale",
    "repository",
    "organization",
    "account",
    "session",
    "authorization",
    "schema",
    "revision",
    "source_revision"
  ] as const)("withholds reconciliation for %s publication", async (change) => {
    const f = await publicationSetup();
    f.snapshot.binding.sourceCommitSha = REVIEW_NEW_SHA;
    if (change === "unpublished") f.readPublished.mockResolvedValue(null);
    if (change === "stale") f.published.publishedRevision = "c".repeat(SHA_LENGTH);
    if (change === "repository") f.published.courseRepositoryId += 1;
    if (change === "organization") f.published.organizationId += 1;
    if (change === "account") f.published.authenticatedUserId = REVIEW_OTHER_USER;
    if (change === "session") f.published.sessionId = "replaced";
    if (change === "authorization") f.published.authorized = false;
    if (change === "schema") Object.assign(f.published.course, { schema_version: 1 });
    if (change === "revision") f.published.publishedRevision = "invalid";
    if (change === "source_revision")
      f.published.publishedRevision = f.request.source.sourceCommitSha;
    await expect(f.handoff.reconcile()).rejects.toThrow();
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.reconciliation).not.toHaveBeenCalled();
  });
  it.each([
    "account",
    "generation",
    "verify",
    "close",
    "replacement",
    "inventory",
    "repository",
    "organization"
  ] as const)("publication cannot revive %s invalidation", async (change) => {
    const f = await publicationSetup();
    if (change === "account") f.account(REVIEW_OTHER_USER);
    if (change === "generation") f.account();
    if (change === "verify")
      await f.reviewService.verify(OWNER, {
        ...f.request,
        institutionalUsername: "prof",
        githubLogin: "renamed",
        addFaculty: false
      });
    if (change === "close") f.reviewService.close(OWNER);
    if (change === "replacement") await f.reviewService.load(OWNER, { selector: REVIEW_SELECTOR });
    if (change === "inventory") await f.reviewService.loadGrader(OWNER, f.request);
    if (change === "repository") f.snapshot.binding.repositoryId += 1;
    if (change === "organization") f.snapshot.binding.organizationId = REVIEW_ORG + 1;
    f.snapshot.binding.sourceCommitSha = REVIEW_NEW_SHA;
    await expect(f.handoff.reconcile()).rejects.toThrow();
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("rechecks publication inside the reconciler before allowing execution", async () => {
    const f = await publicationSetup();
    f.snapshot.binding.sourceCommitSha = REVIEW_NEW_SHA;
    f.readPublished.mockResolvedValueOnce(structuredClone(f.published)).mockResolvedValue(null);
    await expect(f.handoff.reconcile()).rejects.toThrow();
    expect(f.factory).toHaveBeenCalledOnce();
    expect(f.reconciliation).not.toHaveBeenCalled();
  });
  it("rejects replacement while authoritative observation is in flight", async () => {
    const f = setup();
    const p = await f.prepare();
    f.reader.observe.mockImplementationOnce(async () => {
      f.reviewService.close(OWNER);
      return {
        repository: {
          id: p.request.source.repositoryId,
          organizationId: REVIEW_ORG,
          defaultBranch: "main"
        },
        sourceCommitSha: p.request.source.sourceCommitSha
      };
    });
    await expect(f.service.getHandoff(OWNER, p.request)).rejects.toThrow();
    expect(f.planner).not.toHaveBeenCalled();
  });
  it("does not read publication or construct a reconciler while handing off a plan", async () => {
    const f = await publicationSetup();
    expect(f.readPublished).not.toHaveBeenCalled();
    expect(f.factory).not.toHaveBeenCalled();
    expect(f.reconciliation).not.toHaveBeenCalled();
    Object.values(f.mutations).forEach((m) => expect(m).not.toHaveBeenCalled());
  });
  it("cannot substitute an equal clone for the retained completed analysis", async () => {
    const f = setup();
    const p = await f.prepare();
    const getCompleted = vi.fn(async () => ({
      analysis: structuredClone(p.view.analysis),
      review: p.review
    }));
    const service = createGraderRemovalHandoffService({
      reviewService: { ...f.reviewService, getCompleted }
    });
    await expect(service.getHandoff(OWNER, p.request)).rejects.toThrow("replaced");
  });
  it("uses the generated backend by default and regenerates plans with fresh checks", async () => {
    const f = setup();
    const p = await f.prepare();
    const service = createGraderRemovalHandoffService({ reviewService: f.reviewService });
    const first = await service.getHandoff(OWNER, p.request);
    f.reader.observe.mockClear();
    const second = await service.getHandoff(OWNER, p.request);
    expect(second?.plan).toEqual(first?.plan);
    expect(second?.plan).not.toBe(first?.plan);
    expect(f.reader.observe).toHaveBeenCalled();
    f.snapshot.binding.sourceCommitSha = REVIEW_NEW_SHA;
    expect(await service.getHandoff(OWNER, p.request)).toBeNull();
  });
  it("returns no handoff without a completed migration review", async () => {
    const f = setup();
    const { view } = await f.reviewService.load(OWNER, { selector: REVIEW_SELECTOR });
    if (!view) throw new Error("Missing view");
    const request = {
      sessionId: view.sessionId,
      source: f.backend.migrationReviewSource(view.analysis)
    };
    expect(await f.service.getHandoff(OWNER, request)).toBeNull();
    expect(f.reader.inventory).not.toHaveBeenCalled();
    expect(f.planner).not.toHaveBeenCalled();
  });
});
