import { expect, it, vi } from "vitest";
import { createMigrationExecutionService } from "./migrationExecutionService.js";
import { migrationViewFixture } from "./migrationReviewFixtures.js";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";
import type {
  MigrationPublicationOutcome,
  MigrationPublicationPhase
} from "./migrationPublicationService.js";
const fixture = () => {
  const view = migrationViewFixture();
  const request = {
    sessionId: view.sessionId,
    source: loadMigrationReviewBackend().migrationReviewSource(view.analysis),
    confirmed: true as const
  };
  let finish: (outcome: MigrationPublicationOutcome) => void = () => {};
  let progress: (phase: MigrationPublicationPhase, cancellable: boolean) => void = () => {};
  let signal: AbortSignal | undefined;
  let authorized = true;
  const release = vi.fn();
  const review = { retain: vi.fn(() => release), acknowledge: vi.fn(async () => {}) };
  const publication = {
    hasIntent: vi.fn(() => false),
    recover: vi.fn(),
    publish: vi.fn(async (_owner, _bound, cancellation, onPhase) => {
      signal = cancellation;
      progress = onPhase;
      return new Promise<MigrationPublicationOutcome>((resolve) => {
        finish = resolve;
      });
    })
  };
  const reconciliation = {
    inspect: vi.fn(),
    reconcile: vi.fn(async () => ({
      published: true as const,
      status: "needs_attention" as const,
      studentFacingReady: false,
      attention: ["pending_invitation"]
    }))
  };
  const service = createMigrationExecutionService({
    review,
    publication,
    reconciliation,
    authorize: async () => {
      if (!authorized) throw new Error("Account changed");
      return {
        userId: request.source.authenticatedGithubUserId,
        repositoryId: request.source.repositoryId
      };
    },
    selectors: () => [view.selector],
    currentUser: () => (authorized ? request.source.authenticatedGithubUserId : null)
  });
  return {
    service,
    view,
    request,
    review,
    publication,
    reconciliation,
    release,
    finish: (outcome: MigrationPublicationOutcome) => finish(outcome),
    phase: (value: MigrationPublicationPhase, cancellable: boolean) => progress(value, cancellable),
    signal: () => signal,
    invalidate: () => {
      authorized = false;
    }
  };
};
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};
it("retains main authority, deduplicates submissions and follows the real publication cancellation boundary", async () => {
  const f = fixture();
  await f.service.start(17, f.request);
  await settle();
  await f.service.start(17, f.request);
  expect(f.publication.publish).toHaveBeenCalledTimes(1);
  expect(f.review.acknowledge).toHaveBeenCalledTimes(1);
  expect(f.review.retain).toHaveBeenCalledWith(17);
  f.phase("publishing", false);
  expect((await f.service.status({ selector: f.view.selector })).cancellable).toBe(false);
  await f.service.cancel({ selector: f.view.selector });
  expect(f.signal()?.aborted).toBe(false);
  f.finish({ status: "published", commit: "a".repeat(40), refreshRequired: true });
  await settle();
  expect(await f.service.status({ selector: f.view.selector })).toMatchObject({
    active: false,
    outcome: "needs_attention",
    published: true,
    refreshRequired: true
  });
  expect(f.reconciliation.reconcile).toHaveBeenCalledTimes(1);
  expect(f.release).toHaveBeenCalledTimes(1);
  await f.service.start(17, f.request);
  expect(f.publication.publish).toHaveBeenCalledTimes(1);
});
it("explicit preparation cancellation and account invalidation never grant stale status access", async () => {
  const f = fixture();
  await f.service.start(17, f.request);
  await settle();
  await f.service.cancel({ selector: f.view.selector });
  expect(f.signal()?.aborted).toBe(true);
  f.finish({ status: "cancelled" });
  await settle();
  expect(await f.service.status({ selector: f.view.selector })).toMatchObject({
    outcome: "not_published",
    active: false
  });
  f.invalidate();
  await expect(f.service.status({ selector: f.view.selector })).rejects.toThrow();
  expect(await f.service.active()).toBeNull();
});
it("recovery retries reconciliation with fresh backend state, without calling publication", async () => {
  const f = fixture();
  f.reconciliation.inspect.mockResolvedValue({ executionState: "fresh_plan_required" });
  await f.service.retry({ selector: f.view.selector, freshPlan: true });
  await settle();
  expect(f.reconciliation.reconcile).toHaveBeenCalledWith(
    f.request.source.authenticatedGithubUserId,
    f.request.source.repositoryId,
    { freshPlan: true }
  );
  expect(f.publication.publish).not.toHaveBeenCalled();
});
it("rejected publication stays Schema 1; ambiguous publication stays blocking until explicit observation", async () => {
  const f = fixture();
  await f.service.start(17, f.request);
  await settle();
  f.finish({ status: "outcome_unknown", action: "Reconnect and verify publication." });
  await settle();
  expect(await f.service.status({ selector: f.view.selector })).toMatchObject({
    active: true,
    outcome: "outcome_unknown",
    cancellable: false
  });
  expect(f.reconciliation.reconcile).not.toHaveBeenCalled();
});

it("reopening a previously Ready course verifies fresh access without repeating migration or showing another blocking result", async () => {
  const f = fixture();
  f.publication.hasIntent.mockReturnValue(true);
  f.publication.recover.mockResolvedValue({
    status: "published",
    commit: "a".repeat(40),
    refreshRequired: false
  });
  f.reconciliation.inspect.mockResolvedValue({ currentAccess: "ready" });
  expect(await f.service.active()).toBeNull();
  expect(await f.service.status({ selector: f.view.selector })).toMatchObject({
    published: true,
    outcome: "ready",
    active: false
  });
  expect(f.publication.publish).not.toHaveBeenCalled();
  expect(f.reconciliation.reconcile).not.toHaveBeenCalled();
});
