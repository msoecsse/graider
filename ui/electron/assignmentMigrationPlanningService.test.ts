import fs from "node:fs";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAssignmentMigrationPlanningService } from "./assignmentMigrationPlanningService.js";
import {
  createMigrationReviewService,
  loadMigrationReviewBackend,
  type MigrationReviewSessionRequest
} from "./migrationReviewService.js";
import {
  migrationSnapshotFixture,
  reviewedSubmissionFixture,
  REVIEW_SELECTOR,
  REVIEW_USER,
  REVIEW_OTHER_USER,
  REVIEW_ORG,
  REVIEW_NEW_SHA
} from "./migrationReviewFixtures.js";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";

const OWNER = 1;
const setup = () => {
  const backend = loadMigrationReviewBackend();
  const snapshot = migrationSnapshotFixture();
  let userId = REVIEW_USER;
  let generation = 1;
  const mutations = {
    commit: vi.fn(),
    push: vi.fn(),
    team: vi.fn(),
    permission: vi.fn(),
    invitation: vi.fn(),
    journal: vi.fn()
  };
  const reader = {
    snapshot: vi.fn(async () => structuredClone(snapshot)),
    observe: vi.fn(async () => ({
      repository: {
        id: snapshot.binding.repositoryId,
        organizationId: REVIEW_ORG,
        defaultBranch: "main"
      },
      sourceCommitSha: snapshot.binding.sourceCommitSha
    })),
    lookupLogin: vi.fn(async (login: string) => ({ githubUserId: REVIEW_USER, githubLogin: login }))
  };
  const reviewService = createMigrationReviewService({
    backend: loadMigrationReviewBackend,
    withCourse: async (selector, operation) => {
      expect(selector).toBe(REVIEW_SELECTOR);
      return operation({ userId, generation, institutionalUsername: "prof", reader, ...mutations });
    }
  });
  const getCompleted = vi.spyOn(reviewService, "getCompleted");
  const planner = vi.fn(backend.planAssignmentMigration);
  const planning = createAssignmentMigrationPlanningService({
    reviewService,
    backend: () => ({ planAssignmentMigration: planner })
  });
  const bound = (view: Backend.MigrationReviewSessionView): MigrationReviewSessionRequest => ({
    sessionId: view.sessionId,
    source: backend.migrationReviewSource(view.analysis)
  });
  const load = async () => {
    const response = await reviewService.load(OWNER, { selector: REVIEW_SELECTOR });
    if (!response.view) throw new Error("Missing review view");
    return response.view;
  };
  const complete = (view: Backend.MigrationReviewSessionView) =>
    reviewService.complete(OWNER, { ...bound(view), submission: reviewedSubmissionFixture(view) });
  return {
    backend,
    snapshot,
    reader,
    reviewService,
    getCompleted,
    planner,
    planning,
    bound,
    load,
    complete,
    mutations,
    account: (id = REVIEW_USER) => {
      userId = id;
      generation += 1;
    }
  };
};

describe("trusted main-only assignment migration planning", () => {
  it("passes exact retained analysis/review and returns the planner result unchanged", async () => {
    const f = setup();
    const view = await f.load();
    const review = await f.complete(view);
    const request = f.bound(view);
    const plan = await f.planning.getPlan(OWNER, request);
    expect(f.getCompleted).toHaveBeenCalledExactlyOnceWith(OWNER, request);
    const retained = await f.getCompleted.mock.results[0]?.value;
    expect(f.planner.mock.calls[0]?.[0]).toBe(retained?.analysis);
    expect(f.planner.mock.calls[0]?.[0]).toBe(view.analysis);
    expect(f.planner.mock.calls[0]?.[1]).toBe(review);
    expect(plan).toBe(f.planner.mock.results[0]?.value);
    expect(plan).toMatchObject({ status: "ready", publicationReady: false });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan?.assignments[0]?.sections)).toBe(true);
  });
  it("uses the existing generated backend by default", async () => {
    const f = setup();
    const view = await f.load();
    await f.complete(view);
    const service = createAssignmentMigrationPlanningService({ reviewService: f.reviewService });
    expect(await service.getPlan(OWNER, f.bound(view))).toMatchObject({
      status: "ready",
      publicationReady: false
    });
  });
  it("preserves technical Needs attention from the real planner", async () => {
    const f = setup();
    f.snapshot.sourceFiles = {
      ...f.snapshot.sourceFiles,
      "terms/27s1/assignments/lab04/assignment.yml":
        "schema_version: 1\nassignment: {slug: lab04, title: Lab, type: individual, status: closed}\nsections: ['001']\nmetadata: {faculty_owner: prof}\n"
    };
    const view = await f.load();
    const result = await f.reviewService.complete(OWNER, {
      ...f.bound(view),
      submission: {
        ...reviewedSubmissionFixture(view),
        acknowledgements: [{ kind: "legacy_closed", termCode: "27s1", assignmentSlug: "lab04" }]
      }
    });
    expect(result.status).toBe("complete");
    expect(await f.planning.getPlan(OWNER, f.bound(view))).toMatchObject({
      status: "needs_attention",
      publicationReady: false
    });
  });
  it.each(["blocked", "not_applicable"] as const)(
    "preserves planner %s without relabeling as null",
    async (status) => {
      const f = setup();
      const view = await f.load();
      const review = await f.complete(view);
      const plan = f.backend.freezeMigrationReview({
        ...f.backend.planAssignmentMigration(view.analysis, review),
        status
      });
      f.planner.mockReturnValue(plan);
      expect(await f.planning.getPlan(OWNER, f.bound(view))).toBe(plan);
    }
  );
  it.each(["unsubmitted", "incomplete", "blocked"] as const)(
    "returns null for %s completion and never invokes planner",
    async (status) => {
      const f = setup();
      const view = await f.load();
      if (status !== "unsubmitted") {
        const submission =
          status === "incomplete"
            ? f.backend.emptyMigrationReviewSubmission(view)
            : { ...reviewedSubmissionFixture(view), fallbackAdministratorUsername: "unknown" };
        expect(
          (await f.reviewService.complete(OWNER, { ...f.bound(view), submission })).status
        ).toBe(status);
      }
      expect(await f.planning.getPlan(OWNER, f.bound(view))).toBeNull();
      expect(f.planner).not.toHaveBeenCalled();
    }
  );
  it("re-observes source on every call and cannot return a cached plan after source advances", async () => {
    const f = setup();
    const view = await f.load();
    await f.complete(view);
    const request = f.bound(view);
    const first = await f.planning.getPlan(OWNER, request);
    const second = await f.planning.getPlan(OWNER, request);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    f.planner.mockClear();
    f.reader.observe.mockClear();
    f.snapshot.binding.sourceCommitSha = REVIEW_NEW_SHA;
    expect(await f.planning.getPlan(OWNER, request)).toBeNull();
    expect(f.reader.observe).toHaveBeenCalledOnce();
    expect(f.planner).not.toHaveBeenCalled();
  });
  it.each(["refresh", "replacement", "verify", "close", "account", "generation"] as const)(
    "cannot reuse completion after %s",
    async (change) => {
      const f = setup();
      const view = await f.load();
      await f.complete(view);
      expect(await f.planning.getPlan(OWNER, f.bound(view))).not.toBeNull();
      f.planner.mockClear();
      if (change === "refresh") await f.reviewService.refresh(OWNER, f.bound(view));
      if (change === "replacement") await f.load();
      if (change === "verify")
        await f.reviewService.verify(OWNER, {
          ...f.bound(view),
          institutionalUsername: "prof",
          githubLogin: "faculty-renamed",
          addFaculty: false
        });
      if (change === "close") f.reviewService.close(OWNER);
      if (change === "account") f.account(REVIEW_OTHER_USER);
      if (change === "generation") f.account();
      await expect(f.planning.getPlan(OWNER, f.bound(view))).rejects.toThrow();
      expect(f.planner).not.toHaveBeenCalled();
    }
  );
  it("freshly refreshed review needs completion again", async () => {
    const f = setup();
    const old = await f.load();
    await f.complete(old);
    const response = await f.reviewService.refresh(OWNER, f.bound(old));
    if (!response.view) throw new Error("Missing refreshed view");
    expect(await f.planning.getPlan(OWNER, f.bound(response.view))).toBeNull();
    await f.complete(response.view);
    expect(await f.planning.getPlan(OWNER, f.bound(response.view))).not.toBeNull();
  });
  it("cannot reuse a plan after a completed review is replaced by incomplete decisions", async () => {
    const f = setup();
    const view = await f.load();
    await f.complete(view);
    expect(await f.planning.getPlan(OWNER, f.bound(view))).not.toBeNull();
    f.planner.mockClear();
    await f.reviewService.complete(OWNER, {
      ...f.bound(view),
      submission: f.backend.emptyMigrationReviewSubmission(view)
    });
    expect(await f.planning.getPlan(OWNER, f.bound(view))).toBeNull();
    expect(f.planner).not.toHaveBeenCalled();
  });
  it("cannot obtain another owner's retained review", async () => {
    const f = setup();
    const view = await f.load();
    await f.complete(view);
    await expect(f.planning.getPlan(OWNER + 1, f.bound(view))).rejects.toThrow();
    expect(f.planner).not.toHaveBeenCalled();
  });
  it("exposes only owner + existing session request and a single main-only operation", () => {
    const f = setup();
    expectTypeOf<Parameters<typeof f.planning.getPlan>>().toEqualTypeOf<
      [number, MigrationReviewSessionRequest]
    >();
    expectTypeOf<keyof MigrationReviewSessionRequest>().toEqualTypeOf<"sessionId" | "source">();
    expect(Object.keys(f.planning)).toEqual(["getPlan"]);
  });
  it("propagates boundary/planner failures without relabeling as unavailable", async () => {
    const f = setup();
    const view = await f.load();
    await f.complete(view);
    f.planner.mockImplementation(() => {
      throw new Error("planner failure");
    });
    await expect(f.planning.getPlan(OWNER, f.bound(view))).rejects.toThrow("planner failure");
  });
  it("performs no filesystem or external mutations and does not rebuild analysis", async () => {
    const f = setup();
    const view = await f.load();
    await f.complete(view);
    const before = structuredClone(f.snapshot);
    f.reader.snapshot.mockClear();
    f.reader.lookupLogin.mockClear();
    const spies = [
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "mkdirSync"),
      vi.spyOn(fs, "renameSync"),
      vi.spyOn(fs, "unlinkSync"),
      vi.spyOn(fs, "copyFileSync")
    ];
    try {
      await f.planning.getPlan(OWNER, f.bound(view));
      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
      Object.values(f.mutations).forEach((mutation) => expect(mutation).not.toHaveBeenCalled());
      expect(f.reader.snapshot).not.toHaveBeenCalled();
      expect(f.reader.lookupLogin).not.toHaveBeenCalled();
      expect(f.snapshot).toEqual(before);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
