import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createMigrationReviewProgressStore,
  type MigrationReviewProgressStore
} from "./migrationReviewProgress.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMigrationReviewService,
  loadMigrationReviewBackend,
  type MigrationReviewTrustedContext
} from "./migrationReviewService.js";
import {
  migrationSnapshotFixture,
  reviewedSubmissionFixture,
  REVIEW_SELECTOR,
  REVIEW_USER,
  REVIEW_REPO,
  REVIEW_ORG,
  REVIEW_OTHER_USER,
  REVIEW_NEW_SHA,
  courseV2Fixture,
  unsupportedCourseFixture
} from "./migrationReviewFixtures.js";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";

const setup = (resolved = true, progress?: MigrationReviewProgressStore) => {
  let snapshot = migrationSnapshotFixture(resolved);
  let generation = 1;
  let userId = REVIEW_USER;
  const writes = {
    commit: vi.fn(),
    push: vi.fn(),
    team: vi.fn(),
    permission: vi.fn(),
    invitation: vi.fn(),
    branch: vi.fn(),
    journal: vi.fn()
  };
  const observe = vi.fn(async () => ({
    repository: {
      id: snapshot.binding.repositoryId,
      organizationId: snapshot.binding.organizationId ?? REVIEW_ORG,
      defaultBranch: "main"
    },
    sourceCommitSha: snapshot.binding.sourceCommitSha
  }));
  const lookupLogin = vi.fn(async (login: string) => ({
    githubUserId: login === "added" ? REVIEW_OTHER_USER : REVIEW_USER,
    githubLogin: login
  }));
  const inventory = vi.fn(
    async (analysis: Backend.CourseMigrationAnalysis): Promise<Backend.LegacyGraderInventory> => ({
      kind: "schema-v1-legacy-grader-inventory",
      status: "ready",
      publicationReady: false,
      source: { ...analysis.source, reportId: analysis.reportId },
      runtimeCoverage: "unavailable",
      evidence: [],
      repositoryEvidence: [],
      repositories: [],
      findings: [],
      candidate: {
        classification: "legacy_candidate",
        organizationId: REVIEW_ORG,
        organizationLogin: "example-org",
        slug: "graders",
        teamId: 900,
        membershipComplete: true,
        members: [{ id: REVIEW_OTHER_USER, login: "added" }]
      }
    })
  );
  const reader = {
    inventory,
    snapshot: vi.fn(async () => structuredClone(snapshot)),
    observe,
    lookupLogin
  };
  const service = createMigrationReviewService({
    backend: loadMigrationReviewBackend,
    progress,
    withCourse: async (selector, operation) => {
      if (selector !== REVIEW_SELECTOR) throw new Error("Wrong selector.");
      return operation({
        userId,
        institutionalUsername: "prof",
        generation,
        reader,
        ...writes
      } as MigrationReviewTrustedContext);
    }
  });
  const bound = (view: Backend.MigrationReviewSessionView) => ({
    sessionId: view.sessionId,
    source: loadMigrationReviewBackend().migrationReviewSource(view.analysis)
  });
  const load = async () => {
    const response = await service.load(1, { selector: REVIEW_SELECTOR });
    if (!response.view) throw new Error(response.message ?? "Missing view.");
    return response.view;
  };
  return {
    service,
    reader,
    writes,
    load,
    bound,
    snapshot: () => snapshot,
    change: (value: Backend.MigrationSnapshot) => {
      snapshot = value;
    },
    account: (id: number) => {
      userId = id;
      generation += 1;
    }
  };
};

describe("main-process migration review sessions", () => {
  it("accepts exact binding and retains immutable result, never renderer IDs as authority", async () => {
    const f = setup();
    const view = await f.load();
    const result = await f.service.complete(1, {
      ...f.bound(view),
      submission: reviewedSubmissionFixture(view)
    });
    expect(result.status).toBe("complete");
    expect(result.source.repositoryId).toBe(REVIEW_REPO);
    expect(Object.isFrozen(result.facultyDirectory)).toBe(true);
    expect(result.publicationReady).toBe(false);
  });
  it.each(["repositoryId", "sourceCommitSha", "reportId", "authenticatedGithubUserId"] as const)(
    "rejects wrong outer %s",
    async (key) => {
      const f = setup();
      const view = await f.load();
      const binding = f.bound(view);
      await expect(
        f.service.complete(1, {
          ...binding,
          source: { ...binding.source, [key]: key.endsWith("Id") ? 1 : "wrong" },
          submission: reviewedSubmissionFixture(view)
        })
      ).rejects.toThrow();
    }
  );
  it("cannot use another renderer's review session", async () => {
    const f = setup();
    const view = await f.load();
    await expect(
      f.service.complete(2, { ...f.bound(view), submission: reviewedSubmissionFixture(view) })
    ).rejects.toThrow();
  });
  it("rejects account switches even if renderer returns the old account assertion", async () => {
    const f = setup();
    const view = await f.load();
    f.account(REVIEW_OTHER_USER);
    await expect(
      f.service.complete(1, { ...f.bound(view), submission: reviewedSubmissionFixture(view) })
    ).rejects.toThrow(/account/);
  });
  it("revalidates remote revision and latches stale until refresh", async () => {
    const f = setup();
    const view = await f.load();
    const before = f.snapshot();
    f.change({ ...before, binding: { ...before.binding, sourceCommitSha: REVIEW_NEW_SHA } });
    const result = await f.service.complete(1, {
      ...f.bound(view),
      submission: reviewedSubmissionFixture(view)
    });
    expect(result.status).toBe("stale");
    f.change(before);
    expect(
      (
        await f.service.complete(1, {
          ...f.bound(view),
          submission: reviewedSubmissionFixture(view)
        })
      ).status
    ).toBe("stale");
  });
  it("refresh replaces the session and analysis, making old decisions unusable", async () => {
    const f = setup();
    const old = await f.load();
    f.change({
      ...f.snapshot(),
      binding: { ...f.snapshot().binding, sourceCommitSha: REVIEW_NEW_SHA }
    });
    const fresh = await f.service.refresh(1, f.bound(old));
    expect(fresh.view?.analysis.source.sourceCommitSha).toBe(REVIEW_NEW_SHA);
    expect(fresh.view?.analysis.reportId).not.toBe(old.analysis.reportId);
    await expect(
      f.service.complete(1, { ...f.bound(old), submission: reviewedSubmissionFixture(old) })
    ).rejects.toThrow();
  });
  it("fails closed on immutable repository transfer or identity mismatch", async () => {
    const f = setup();
    const view = await f.load();
    f.reader.observe.mockResolvedValue({
      repository: { id: REVIEW_REPO, organizationId: REVIEW_ORG + 1, defaultBranch: "main" },
      sourceCommitSha: f.snapshot().binding.sourceCommitSha
    });
    await expect(
      f.service.complete(1, { ...f.bound(view), submission: reviewedSubmissionFixture(view) })
    ).rejects.toThrow(/organization/);
  });
  it("verification looks up a login, recomputes analyzer owner/section proposals at the same SHA", async () => {
    const f = setup(false);
    const original = await f.load();
    expect(original.analysis.unresolvedIdentities).toEqual(["prof"]);
    const response = await f.service.verify(1, {
      ...f.bound(original),
      institutionalUsername: "prof",
      githubLogin: "faculty-now",
      addFaculty: false
    });
    expect(f.reader.lookupLogin).toHaveBeenCalledWith("faculty-now");
    expect(response.view?.analysis.source.sourceCommitSha).toBe(
      original.analysis.source.sourceCommitSha
    );
    expect(response.view?.analysis.reportId).not.toBe(original.analysis.reportId);
    expect(response.view?.analysis.assignments[0]?.owner.value).toEqual([REVIEW_USER]);
    expect(response.view?.analysis.terms[0]?.sections[0]?.proposedCurrentFacultyIds.value).toEqual([
      REVIEW_USER
    ]);
    await expect(
      f.service.complete(1, {
        ...f.bound(original),
        submission: reviewedSubmissionFixture(original)
      })
    ).rejects.toThrow();
  });
  it("does not trust typed numeric IDs, suggestions or unknown verification fields", async () => {
    const f = setup(false);
    const view = await f.load();
    const response = await f.service.verify(1, {
      ...f.bound(view),
      institutionalUsername: "prof",
      githubLogin: "faculty-now",
      addFaculty: false,
      ...{ githubUserId: REVIEW_USER }
    });
    expect(response.status).toBe("blocked");
    expect(f.reader.lookupLogin).not.toHaveBeenCalled();
    expect(view.analysis.faculty[0]?.resolution.value).toBeNull();
  });
  it("same-ID rename retains previous verified login history", async () => {
    const f = setup();
    const view = await f.load();
    const response = await f.service.verify(1, {
      ...f.bound(view),
      institutionalUsername: "prof",
      githubLogin: "faculty-renamed",
      addFaculty: false
    });
    expect(response.view?.analysis.provisionalFacultyDirectory.value[0]).toMatchObject({
      github_user_id: REVIEW_USER,
      github_login: "faculty-renamed",
      github_login_history: ["faculty-now", "faculty-old"]
    });
  });
  it("conflicting trusted immutable IDs are blocked", async () => {
    const f = setup();
    const view = await f.load();
    const response = await f.service.verify(1, {
      ...f.bound(view),
      institutionalUsername: "prof",
      githubLogin: "added",
      addFaculty: false
    });
    expect(response.view?.analysis.status).toBe("blocked");
  });
  it("requires explicit Add faculty and verified identity before added fallback selection", async () => {
    const f = setup();
    let view = await f.load();
    const unadded = await f.service.verify(1, {
      ...f.bound(view),
      institutionalUsername: "recovery",
      githubLogin: "added",
      addFaculty: false
    });
    expect(unadded.status).toBe("blocked");
    const response = await f.service.verify(1, {
      ...f.bound(view),
      institutionalUsername: "recovery",
      githubLogin: "added",
      addFaculty: true
    });
    if (!response.view) throw new Error("Missing refreshed view.");
    view = response.view;
    expect(
      view.verifiedFaculty.find((entry) => entry.identity.institutional_username === "recovery")
        ?.origin
    ).toBe("explicit_addition");
    const result = await f.service.complete(1, {
      ...f.bound(view),
      submission: { ...reviewedSubmissionFixture(view), fallbackAdministratorUsername: "recovery" }
    });
    expect(result.status).toBe("complete");
    expect(result.fallbackAdministratorGithubUserId).toBe(REVIEW_OTHER_USER);
  });
  it("added case/ID collisions cannot complete", async () => {
    const f = setup();
    const original = await f.load();
    const response = await f.service.verify(1, {
      ...f.bound(original),
      institutionalUsername: "PROF",
      githubLogin: "added",
      addFaculty: true
    });
    if (!response.view) throw new Error("Missing view.");
    expect(
      (
        await f.service.complete(1, {
          ...f.bound(response.view),
          submission: reviewedSubmissionFixture(response.view)
        })
      ).status
    ).toBe("blocked");
  });
  it("not applicable and unsupported source are not enabled by review", async () => {
    const f = setup();
    f.change({ ...f.snapshot(), sourceFiles: { "course.yml": courseV2Fixture() } });
    expect((await f.service.load(1, { selector: REVIEW_SELECTOR })).status).toBe("not_applicable");
    f.change({ ...f.snapshot(), sourceFiles: { "course.yml": unsupportedCourseFixture() } });
    const view = await f.load();
    expect(
      (
        await f.service.complete(1, {
          ...f.bound(view),
          submission: reviewedSubmissionFixture(view)
        })
      ).status
    ).toBe("blocked");
  });
  it("retains a main-process handoff for 9.3 and invalidates it on refresh/staleness", async () => {
    const f = setup();
    const view = await f.load();
    expect(await f.service.getCompleted(1, f.bound(view))).toBeNull();
    await f.service.complete(1, { ...f.bound(view), submission: reviewedSubmissionFixture(view) });
    const handoff = await f.service.getCompleted(1, f.bound(view));
    expect(handoff?.review.status).toBe("complete");
    expect(handoff?.analysis.reportId).toBe(handoff?.review.source.reportId);
    expect(Object.isFrozen(handoff)).toBe(true);
    f.change({
      ...f.snapshot(),
      binding: { ...f.snapshot().binding, sourceCommitSha: REVIEW_NEW_SHA }
    });
    expect(await f.service.getCompleted(1, f.bound(view))).toBeNull();
  });
  it("zero config, filesystem, Git, provider, branch and journal writes throughout review", async () => {
    const f = setup(false);
    const view = await f.load();
    const before = structuredClone(f.snapshot());
    const spies = [
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "mkdirSync"),
      vi.spyOn(fs, "copyFileSync"),
      vi.spyOn(fs, "renameSync"),
      vi.spyOn(fs, "unlinkSync")
    ];
    try {
      const response = await f.service.verify(1, {
        ...f.bound(view),
        institutionalUsername: "prof",
        githubLogin: "faculty-now",
        addFaculty: false
      });
      if (!response.view) throw new Error("Missing view.");
      await f.service.complete(1, {
        ...f.bound(response.view),
        submission: reviewedSubmissionFixture(response.view)
      });
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      for (const write of Object.values(f.writes)) expect(write).not.toHaveBeenCalled();
      expect(f.snapshot()).toEqual(before);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});

describe("trusted grader access handoff", () => {
  const prepare = async () => {
    const f = setup();
    const view = await f.load();
    const bound = f.bound(view);
    await f.service.complete(1, { ...bound, submission: reviewedSubmissionFixture(view) });
    const context = await f.service.loadGrader(1, bound);
    const submission = {
      inventoryId: context.inventoryId,
      decisions: [
        { githubUserId: REVIEW_OTHER_USER, disposition: "no_access" as const, sections: [] }
      ]
    };
    return { ...f, view, bound, context, submission };
  };
  it("requires trusted completion and binds decisions to exact retained inventory", async () => {
    const f = setup();
    const view = await f.load();
    await expect(f.service.loadGrader(1, f.bound(view))).rejects.toThrow();
    const ready = await prepare();
    expect(
      (await ready.service.completeGrader(1, { ...ready.bound, submission: ready.submission }))
        .status
    ).toBe("complete");
    expect((await ready.service.getCompletedGrader(1, ready.bound))?.publicationReady).toBe(false);
    const next = await ready.service.loadGrader(1, ready.bound);
    expect(next.inventoryId).not.toBe(ready.context.inventoryId);
    expect(await ready.service.getCompletedGrader(1, ready.bound)).toBeNull();
    expect(
      (await ready.service.completeGrader(1, { ...ready.bound, submission: ready.submission }))
        .status
    ).toBe("blocked");
    Object.values(ready.writes).forEach((write) => expect(write).not.toHaveBeenCalled());
  });
  it.each(["source", "account", "refresh", "verify", "close", "replace"])(
    "invalidates grader decisions after %s",
    async (change) => {
      const f = await prepare();
      await f.service.completeGrader(1, { ...f.bound, submission: f.submission });
      if (change === "source")
        f.change({
          ...f.snapshot(),
          binding: { ...f.snapshot().binding, sourceCommitSha: REVIEW_NEW_SHA }
        });
      if (change === "account") f.account(REVIEW_OTHER_USER);
      if (change === "refresh") await f.service.refresh(1, f.bound);
      if (change === "verify")
        await f.service.verify(1, {
          ...f.bound,
          institutionalUsername: "newprof",
          githubLogin: "added",
          addFaculty: true
        });
      if (change === "close") f.service.close(1);
      if (change === "replace") await f.load();
      const result = await f.service.getCompletedGrader(1, f.bound).catch(() => null);
      expect(result).toBeNull();
    }
  );
  it("requires explicit institutional verification before grader assignment", async () => {
    const f = await prepare();
    const verified = await f.service.verify(1, {
      ...f.bound,
      institutionalUsername: "newprof",
      githubLogin: "added",
      addFaculty: true
    });
    expect(verified.view).not.toBeNull();
    const view = verified.view!;
    const bound = {
      sessionId: view.sessionId,
      source: loadMigrationReviewBackend().migrationReviewSource(view.analysis)
    };
    expect(await f.service.getCompletedGrader(1, bound)).toBeNull();
    await f.service.complete(1, { ...bound, submission: reviewedSubmissionFixture(view) });
    const context = await f.service.loadGrader(1, bound);
    const result = await f.service.completeGrader(1, {
      ...bound,
      submission: {
        inventoryId: context.inventoryId,
        decisions: [
          {
            githubUserId: REVIEW_OTHER_USER,
            disposition: "assign",
            sections: [{ termCode: "27s1", sectionId: "001" }]
          }
        ]
      }
    });
    expect(result.status).toBe("complete");
    expect(result.terms[0]?.sections[0]?.currentFacultyGithubUserIds).toEqual([
      REVIEW_USER,
      REVIEW_OTHER_USER
    ]);
    expect(f.reader.lookupLogin).toHaveBeenCalledWith("added");
  });
});

const progressRoots: string[] = [];
afterEach(() =>
  progressRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
);
const progressFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-autosave-"));
  progressRoots.push(root);
  return createMigrationReviewProgressStore(root);
};
describe("durable review decisions and exact acknowledgement", () => {
  it("restores decisions after closure/restart with new receipts but no live approval", async () => {
    const progress = progressFixture();
    const f = setup(true, progress);
    const view = await f.load();
    const submission = reviewedSubmissionFixture(view);
    await f.service.save(1, { ...f.bound(view), submission });
    f.service.close(1);
    const next = setup(true, progress);
    const response = await next.service.load(1, { selector: REVIEW_SELECTOR });
    expect(response.savedSubmission?.fallbackAdministratorUsername).toBe("prof");
    expect(response.savedSubmission?.facultyMappings).not.toEqual(submission.facultyMappings);
    expect(next.reader.lookupLogin).toHaveBeenCalledWith("faculty-now");
    expect(await next.service.getCompleted(1, next.bound(response.view!))).toBeNull();
    await expect(next.service.getAcknowledgement(1, next.bound(response.view!))).rejects.toThrow();
    Object.values(next.writes).forEach((write) => expect(write).not.toHaveBeenCalled());
  });
  it("serializes already received autosaves through window destruction and preserves the latest decision", async () => {
    const progress = progressFixture();
    const f = setup(true, progress);
    const view = await f.load();
    const request = { ...f.bound(view), submission: reviewedSubmissionFixture(view) };
    const first = f.service.save(1, {
      ...request,
      submission: { ...request.submission, fallbackAdministratorUsername: null }
    });
    const second = f.service.save(1, request);
    f.service.close(1);
    const results = await Promise.allSettled([first, second]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(progress.read(REVIEW_USER, REVIEW_REPO)?.submission.fallbackAdministratorUsername).toBe(
      "prof"
    );
    await expect(f.service.getCompleted(1, f.bound(view))).rejects.toThrow();
  });
  it("ignores delayed navigation cleanup for an already replaced review", async () => {
    const f = setup();
    const old = await f.load();
    const current = await f.load();
    f.service.close(1, f.bound(old));
    expect(
      (
        await f.service.complete(1, {
          ...f.bound(current),
          submission: reviewedSubmissionFixture(current)
        })
      ).status
    ).toBe("complete");
  });
  it("restores exact grader choices after restart only against a new current inventory, without completing it", async () => {
    const progress = progressFixture();
    const f = setup(true, progress);
    const view = await f.load();
    await f.service.complete(1, { ...f.bound(view), submission: reviewedSubmissionFixture(view) });
    const inventory = await f.service.loadGrader(1, f.bound(view));
    const decisions = [
      { githubUserId: REVIEW_OTHER_USER, disposition: "no_access" as const, sections: [] }
    ];
    await f.service.saveGrader(1, {
      ...f.bound(view),
      submission: { inventoryId: inventory.inventoryId, decisions }
    });
    f.service.close(1);
    const next = setup(true, progress);
    const restored = await next.service.load(1, { selector: REVIEW_SELECTOR });
    await next.service.complete(1, {
      ...next.bound(restored.view!),
      submission: restored.savedSubmission!
    });
    const fresh = await next.service.loadGrader(1, next.bound(restored.view!));
    expect(fresh.inventoryId).not.toBe(inventory.inventoryId);
    expect(fresh.savedDecisions).toEqual(decisions);
    expect(await next.service.getCompletedGrader(1, next.bound(restored.view!))).toBeNull();
    await expect(next.service.getAcknowledgement(1, next.bound(restored.view!))).rejects.toThrow();
  });
  it("reverifies explicit identities before restoring unresolved-source decisions", async () => {
    const progress = progressFixture();
    const f = setup(false, progress);
    const initial = await f.load();
    const verified = await f.service.verify(1, {
      ...f.bound(initial),
      institutionalUsername: "prof",
      githubLogin: "faculty-now",
      addFaculty: false
    });
    await f.service.save(1, {
      ...f.bound(verified.view!),
      submission: reviewedSubmissionFixture(verified.view!)
    });
    const next = setup(false, progress);
    const restored = await next.service.load(1, { selector: REVIEW_SELECTOR });
    expect(restored.savedSubmission?.fallbackAdministratorUsername).toBe("prof");
    expect(restored.view?.analysis.reportId).toBe(verified.view?.analysis.reportId);
    expect(next.reader.lookupLogin).toHaveBeenCalledWith("faculty-now");
  });
  it("does not promote recomputed disk identity history into trusted evidence", async () => {
    const progress = progressFixture();
    const f = setup(false, progress);
    const view = await f.load();
    const verified = await f.service.verify(1, {
      ...f.bound(view),
      institutionalUsername: "prof",
      githubLogin: "faculty-now",
      addFaculty: false
    });
    await f.service.save(1, {
      ...f.bound(verified.view!),
      submission: reviewedSubmissionFixture(verified.view!)
    });
    const saved = progress.read(REVIEW_USER, REVIEW_REPO)!;
    const identities = saved.identities.map((identity) => ({
      ...identity,
      github_login_history: ["invented-history"]
    }));
    const forgedAnalysis = loadMigrationReviewBackend().analyzeSchemaV1Migration({
      ...f.snapshot(),
      trustedIdentities: [
        {
          institutionalUsername: "prof",
          githubUserId: REVIEW_USER,
          githubLogin: "faculty-now",
          githubLoginHistory: ["invented-history"],
          provenance: "trusted-identity-evidence",
          reference: "explicit-review-github-lookup"
        }
      ]
    });
    progress.write({
      ...saved,
      identities,
      choices: identities,
      submission: {
        ...saved.submission,
        source: { ...saved.submission.source, reportId: forgedAnalysis.reportId }
      }
    });
    const next = setup(false, progress);
    const restored = await next.service.load(1, { selector: REVIEW_SELECTOR });
    expect(restored.savedSubmission).toBeUndefined();
    expect(restored.view?.verifiedFaculty).toEqual([]);
    expect(await next.service.getCompleted(1, next.bound(restored.view!))).toBeNull();
  });
  it("discards decisions when source or verified identity changes", async () => {
    const progress = progressFixture();
    const f = setup(true, progress);
    const view = await f.load();
    await f.service.save(1, { ...f.bound(view), submission: reviewedSubmissionFixture(view) });
    f.change({
      ...f.snapshot(),
      binding: { ...f.snapshot().binding, sourceCommitSha: REVIEW_NEW_SHA }
    });
    expect(
      (await f.service.load(1, { selector: REVIEW_SELECTOR })).savedSubmission
    ).toBeUndefined();
    const next = setup(true, progress);
    next.reader.lookupLogin.mockResolvedValue({
      githubUserId: REVIEW_OTHER_USER,
      githubLogin: "faculty-now"
    });
    expect(
      (await next.service.load(1, { selector: REVIEW_SELECTOR })).savedSubmission
    ).toBeUndefined();
  });
  it("rejects stale/foreign receipts and cannot save renderer authority", async () => {
    const f = setup(true, progressFixture());
    const view = await f.load();
    const request = { ...f.bound(view), submission: reviewedSubmissionFixture(view) };
    await expect(f.service.save(2, request)).rejects.toThrow();
    await expect(
      f.service.save(1, {
        ...request,
        submission: { ...request.submission, ...{ publicationReady: true } }
      })
    ).rejects.toThrow();
    f.account(REVIEW_OTHER_USER);
    await expect(f.service.save(1, request)).rejects.toThrow();
  });
  it("retains explicit acknowledgement only for exact completed reviews and current account", async () => {
    const f = setup();
    const view = await f.load();
    const bound = f.bound(view);
    await expect(f.service.acknowledge(1, bound)).rejects.toThrow();
    await f.service.complete(1, { ...bound, submission: reviewedSubmissionFixture(view) });
    const context = await f.service.loadGrader(1, bound);
    await f.service.completeGrader(1, {
      ...bound,
      submission: {
        inventoryId: context.inventoryId,
        decisions: [{ githubUserId: REVIEW_OTHER_USER, disposition: "no_access", sections: [] }]
      }
    });
    await f.service.acknowledge(1, bound);
    const ack = await f.service.getAcknowledgement(1, bound);
    await ack.revalidate();
    await f.service.complete(1, { ...bound, submission: reviewedSubmissionFixture(view) });
    await expect(ack.revalidate()).rejects.toThrow();
    await expect(f.service.getAcknowledgement(1, bound)).rejects.toThrow();
  });
});
