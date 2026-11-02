import path from "node:path";
import type * as Backend from "../dist-electron/termActivationBackend.cjs";
import {
  publishManagedCourseTransaction,
  type ManagedTransactionRequest
} from "./managedCourseTransaction.js";

const loadBackend = (): typeof Backend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "termActivationBackend.cjs"
    )
  );
type Plan = ReturnType<typeof Backend.prepareTermActivation>["plan"];
type Reconciliation = Awaited<ReturnType<typeof Backend.reconcileTermActivation>>;
interface PublishedActivation {
  readonly status: "success";
  readonly plan: Plan;
  readonly publication?: {
    readonly status: "success";
    readonly commit: string;
    readonly refreshRequired: boolean;
  };
}
export interface TermActivationRequest extends Omit<
  ManagedTransactionRequest<PublishedActivation>,
  "allows" | "mutate" | "validateMetadata"
> {
  readonly targetTermCode: string;
  readonly revalidateRepository: () => Promise<void>;
  readonly reconciliation: Omit<
    Parameters<typeof Backend.reconcileTermActivation>[0],
    | "course"
    | "terms"
    | "activeTermCode"
    | "courseRepositoryId"
    | "organizationId"
    | "authenticatedUserId"
  >;
  /** Internal dependency injection; never accepted from IPC or other untrusted input. */
  readonly reconcile?: typeof Backend.reconcileTermActivation;
}
export interface TermActivationResult {
  readonly status: "activated_reconciled" | "activated_needs_reconciliation";
  readonly plan: Plan;
  readonly commit: string;
  readonly refreshRequired: boolean;
  readonly studentFacingReady: boolean;
  readonly reconciliation: Reconciliation | null;
  readonly reason?: "reconciliation_failed" | "authoritative_revision_changed";
}

/**
 * Future v2 backend adapter only; no IPC/production caller. Must run inside the existing
 * account/course lease after trusted exact-revision synchronization. v1 inputs are refused.
 * Publication uses Phase 2's clone/stage/commit/push/race/lost-response semantics unchanged.
 */
export const activateManagedTerm = async (
  request: TermActivationRequest
): Promise<TermActivationResult> => {
  if (
    request.input.course.schemaVersion !== 2 ||
    request.context.userId !== request.input.userId ||
    request.context.repositoryId !== request.input.course.repositoryId
  )
    throw new Error("Activation requires a trusted v2 course/session context.");
  const backend = loadBackend();
  const reconciliation = {
    ...request.reconciliation,
    studentTargets: structuredClone(request.reconciliation.studentTargets)
  };
  let prepared: ReturnType<typeof backend.prepareTermActivation> | undefined;
  const result = await publishManagedCourseTransaction<PublishedActivation>({
    ...request,
    allows: (file) =>
      prepared?.plan.changedTermCodes.some((code) => file === `terms/${code}/term.yml`) ?? false,
    validateMetadata: (root, organization) => {
      backend.readActivationMetadata(root, organization);
    },
    mutate: async (root) => {
      prepared = backend.prepareTermActivation(
        root,
        request.input.course.organizationLogin,
        request.targetTermCode,
        request.input.userId
      );
      return { status: "success", plan: prepared.plan };
    }
  });
  if (!result.publication || !prepared)
    throw new Error("Activation publication was not confirmed.");
  // This line is reached only after remote acceptance is established. Never undo a published activation.
  const base = {
    plan: result.plan,
    commit: result.publication.commit,
    refreshRequired: result.publication.refreshRequired
  };
  const isCurrent = async () => {
    await request.revalidateRepository();
    const fresh = await request.input.resynchronize?.(true);
    return (
      !request.input.signal.aborted &&
      (await request.input.revalidateSession()) &&
      !!fresh &&
      (fresh.status === "updated" || fresh.status === "up_to_date") &&
      fresh.currentCommit === base.commit
    );
  };
  try {
    if (!(await isCurrent())) {
      return Object.freeze({
        ...base,
        status: "activated_needs_reconciliation",
        studentFacingReady: false,
        reconciliation: null,
        reason: "authoritative_revision_changed"
      });
    }
    const observed = await (request.reconcile ?? backend.reconcileTermActivation)(
      {
        ...reconciliation,
        course: prepared.course,
        terms: prepared.plan.after.map((term) => backend.rawTermConfigV2Schema.parse(term)),
        activeTermCode: prepared.plan.targetTermCode,
        courseRepositoryId: request.context.repositoryId,
        organizationId: request.input.course.organizationId,
        authenticatedUserId: request.input.userId
      },
      request.input.signal
    );
    if (!(await isCurrent())) {
      return Object.freeze({
        ...base,
        status: "activated_needs_reconciliation",
        studentFacingReady: false,
        reconciliation: observed,
        reason: "authoritative_revision_changed"
      });
    }
    const ready = observed.status === "reconciled" && observed.studentFacingReady;
    return Object.freeze({
      ...base,
      status: ready ? "activated_reconciled" : "activated_needs_reconciliation",
      studentFacingReady: ready,
      reconciliation: observed
    });
  } catch {
    return Object.freeze({
      ...base,
      status: "activated_needs_reconciliation",
      studentFacingReady: false,
      reconciliation: null,
      reason: "reconciliation_failed"
    });
  }
};
