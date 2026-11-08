import type {
  MigrationReviewService,
  MigrationReviewLoadRequest
} from "./migrationReviewService.js";
import type {
  createMigrationPublicationService,
  MigrationPublicationOutcome
} from "./migrationPublicationService.js";
import type { createMigrationReconciliationService } from "./migrationReconciliationService.js";

import type {
  MigrationExecutionRequest,
  MigrationRecoveryRequest,
  MigrationHistory,
  MigrationStage,
  MigrationExecutionState
} from "./migrationExecutionTypes.js";
interface Dependencies {
  readonly review: Pick<MigrationReviewService, "retain" | "acknowledge">;
  readonly publication: Pick<
    ReturnType<typeof createMigrationPublicationService>,
    "publish" | "recover" | "hasIntent"
  >;
  readonly reconciliation: Pick<
    ReturnType<typeof createMigrationReconciliationService>,
    "inspect" | "reconcile"
  >;
  readonly authorize: (
    selector: string
  ) => Promise<{ readonly userId: number; readonly repositoryId: number }>;
  readonly currentUser: () => number | null;
  readonly selectors?: () => readonly string[];
}
interface Operation {
  state: MigrationExecutionState;
  readonly controller: AbortController;
  running: boolean;
  settled?: Promise<void>;
}
const initial = (selector: string): MigrationExecutionState => ({
  selector,
  active: false,
  cancellable: false,
  phase: "preparing",
  stages: [],
  outcome: "idle",
  published: false,
  action: "",
  refreshRequired: false,
  blockers: []
});
/** Owns execution independently of any window. DTOs express intent; every authority stays in main. */
export const createMigrationExecutionService = (deps: Dependencies) => {
  const operations = new Map<string, Operation>();
  const hasIntent = (userId: number, repositoryId: number): boolean => {
    try {
      return deps.publication.hasIntent(userId, repositoryId);
    } catch {
      return true;
    } // A damaged intent must be observed, never treated as absent.
  };
  const snapshot = (op: Operation) => structuredClone(op.state);
  const stage = (op: Operation, phase: MigrationStage, cancellable = false): void => {
    const prior = op.state.stages
      .filter((entry) => entry.phase !== phase)
      .map((entry) => ({ ...entry, status: "complete" as const }));
    op.state = {
      ...op.state,
      active: true,
      phase,
      cancellable,
      outcome: "running",
      stages: [...prior, { phase, status: "running" }]
    };
  };
  const finish = (op: Operation, changes: Partial<MigrationExecutionState>): void => {
    op.state = {
      ...op.state,
      active: false,
      cancellable: false,
      ...changes,
      stages: op.state.stages.map((entry) => ({
        ...entry,
        status:
          entry.phase === "publishing"
            ? changes.published === true
              ? "complete"
              : "needs_attention"
            : entry.phase === "synchronizing" && op.state.refreshRequired
              ? "needs_attention"
              : changes.outcome === "ready"
                ? "complete"
                : entry.status === "running"
                  ? "needs_attention"
                  : entry.status
      }))
    };
  };
  const reserve = (selector: string): Operation => {
    const op = { state: initial(selector), controller: new AbortController(), running: true };
    stage(op, "preparing", true);
    operations.set(selector, op);
    return op;
  };
  const reconcile = async (
    op: Operation,
    userId: number,
    repositoryId: number,
    freshPlan?: true
  ) => {
    stage(op, "reconciling");
    const result = await deps.reconciliation.reconcile(
      userId,
      repositoryId,
      freshPlan ? { freshPlan } : undefined
    );
    finish(op, {
      published: true,
      outcome: result.status,
      action:
        result.status === "ready"
          ? "The course is Ready. Supported Schema 2 operations are available."
          : `Schema 2 is authoritative. Review recovery details and retry reconciliation using fresh state. ${result.attention.join(", ")}`
    });
  };
  const outcome = async (
    op: Operation,
    result: MigrationPublicationOutcome,
    userId: number,
    repositoryId: number,
    reconcileAfter: boolean
  ) => {
    if (result.status === "published") {
      op.state = { ...op.state, published: true, refreshRequired: result.refreshRequired };
      if (reconcileAfter) await reconcile(op, userId, repositoryId);
      else {
        let ready = false;
        try {
          ready =
            (await deps.reconciliation.inspect(userId, repositoryId)).currentAccess === "ready";
        } catch {
          /* Publication proof survives unavailable current access verification. */
        }
        finish(op, {
          published: true,
          outcome: ready ? "ready" : "needs_attention",
          action: ready
            ? "Schema 2 publication and current operational access are verified."
            : "Schema 2 publication is verified. Open Migration History to verify current readiness or explicitly retry reconciliation."
        });
      }
    } else if (result.status === "outcome_unknown") {
      finish(op, {
        active: true,
        published: null,
        outcome: "outcome_unknown",
        action: result.action
      });
    } else
      finish(op, {
        published: false,
        outcome: "not_published",
        action:
          result.status === "cancelled"
            ? "Cancelled before publication. Schema 1 remains authoritative; reopen the saved review before retrying."
            : result.action,
        blockers:
          result.status === "blocked" && result.readiness
            ? [...result.readiness.blockers, ...result.readiness.productionEnablement.blockers]
            : []
      });
  };
  const run = (op: Operation, work: () => Promise<void>, release?: () => void): void => {
    op.settled = work()
      .catch(() => {
        finish(
          op,
          op.state.published === true
            ? {
                published: true,
                outcome: "needs_attention",
                action:
                  "Published — Needs attention. Refresh course access and open Migration History for safe recovery."
              }
            : {
                published: null,
                active: true,
                outcome: "outcome_unknown",
                action: "Reconnect and verify the authoritative outcome before retrying."
              }
        );
      })
      .finally(() => {
        op.running = false;
        release?.();
      });
  };
  const recover = async (request: MigrationReviewLoadRequest): Promise<MigrationExecutionState> => {
    const { userId, repositoryId } = await deps.authorize(request.selector);
    const existing = operations.get(request.selector);
    if (existing?.running || existing?.state.published === true) return snapshot(existing);
    if (!hasIntent(userId, repositoryId))
      throw new Error(
        "No pending publication intent. Check the current course or open Migration History."
      );
    const op = reserve(request.selector);
    stage(op, "recovering");
    run(op, async () =>
      outcome(op, await deps.publication.recover(userId, repositoryId), userId, repositoryId, false)
    );
    return snapshot(op);
  };
  return {
    async start(
      owner: number,
      request: MigrationExecutionRequest
    ): Promise<MigrationExecutionState> {
      const selector = `managed-course:${request.source.authenticatedGithubUserId}:${request.source.repositoryId}`;
      const identity = await deps.authorize(selector);
      if (request.confirmed !== true) throw new Error("Explicit confirmation is required.");
      const existing = operations.get(selector);
      if (existing?.state.active || existing?.running || existing?.state.published === true)
        return snapshot(existing);
      if (hasIntent(identity.userId, identity.repositoryId) && !existing)
        return recover({ selector });
      if (
        [...operations.values()].some(
          (op) =>
            op.state.active && op.state.selector.startsWith(`managed-course:${identity.userId}:`)
        )
      )
        throw new Error("Another migration is active.");
      const op = reserve(selector);
      let release: (() => void) | undefined;
      try {
        release = deps.review.retain(owner);
        await deps.review.acknowledge(owner, {
          sessionId: request.sessionId,
          source: request.source
        });
      } catch {
        release?.();
        op.running = false;
        finish(op, {
          outcome: "not_published",
          published: false,
          action:
            "Current account, source or completed reviews changed. Reopen review and confirm again."
        });
        return snapshot(op);
      }
      run(
        op,
        async () => {
          const result = await deps.publication.publish(
            owner,
            { sessionId: request.sessionId, source: request.source },
            op.controller.signal,
            (phase, cancellable) => stage(op, phase, cancellable)
          );
          await outcome(op, result, identity.userId, identity.repositoryId, true);
        },
        release
      );
      return snapshot(op);
    },
    async status(request: MigrationReviewLoadRequest): Promise<MigrationExecutionState> {
      const { userId, repositoryId } = await deps.authorize(request.selector);
      const existing = operations.get(request.selector);
      if (existing) return snapshot(existing);
      return hasIntent(userId, repositoryId) ? recover(request) : initial(request.selector);
    },
    async active(): Promise<MigrationExecutionState | null> {
      const userId = deps.currentUser();
      if (userId === null) return null;
      const prefix = `managed-course:${userId}:`;
      const current = [...operations.values()].find(
        (op) => op.state.selector.startsWith(prefix) && op.state.active
      );
      if (current) {
        await deps.authorize(current.state.selector);
        return snapshot(current);
      }
      for (const selector of deps.selectors?.() ?? []) {
        const repositoryId = Number(selector.split(":").at(-1));
        if (
          selector.startsWith(prefix) &&
          !operations.has(selector) &&
          hasIntent(userId, repositoryId)
        ) {
          await recover({ selector });
          const recovered = operations.get(selector);
          await recovered?.settled;
          if (recovered?.state.active) return snapshot(recovered);
        }
      }
      return null;
    },
    async cancel(request: MigrationReviewLoadRequest): Promise<MigrationExecutionState> {
      await deps.authorize(request.selector);
      const op = operations.get(request.selector);
      if (op?.state.cancellable && op.running) op.controller.abort();
      return op ? snapshot(op) : initial(request.selector);
    },
    recover,
    async history(request: MigrationReviewLoadRequest): Promise<MigrationHistory> {
      const { userId, repositoryId } = await deps.authorize(request.selector);
      return deps.reconciliation.inspect(userId, repositoryId);
    },
    async retry(request: MigrationRecoveryRequest): Promise<MigrationExecutionState> {
      const { userId, repositoryId } = await deps.authorize(request.selector);
      const existing = operations.get(request.selector);
      if (existing?.state.active || existing?.running) return snapshot(existing);
      // Fresh authorized history, never a renderer-returned plan or saved Ready flag.
      const history = await deps.reconciliation.inspect(userId, repositoryId);
      const current = operations.get(request.selector);
      if (current?.state.active || current?.running) return snapshot(current);
      if (history.executionState === "fresh_plan_required" && request.freshPlan !== true)
        throw new Error("Explicit fresh-plan recovery is required.");
      const op = reserve(request.selector);
      run(op, () => reconcile(op, userId, repositoryId, request.freshPlan));
      return snapshot(op);
    }
  };
};
export type MigrationExecutionService = ReturnType<typeof createMigrationExecutionService>;
