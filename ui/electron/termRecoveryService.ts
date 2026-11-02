import path from "node:path";
import type * as Backend from "../dist-electron/termActivationBackend.cjs";
import {
  publishManagedCourseTransaction,
  type ManagedTransactionRequest
} from "./managedCourseTransaction.js";
import {
  getProductionGitWorkspaceFactory,
  type GitWorkspaceFactory
} from "./gitWorkspaceReader.js";

const loadBackend = (): typeof Backend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "termActivationBackend.cjs"
    )
  );
type EvidenceContext = Parameters<typeof Backend.prepareDraftDeletion>[2];
type RecoveryPlan = ReturnType<typeof Backend.prepareDraftDeletion>["plan"];
type Reconciliation = Awaited<ReturnType<typeof Backend.reconcileCourseTermLifecycle>>;
interface Attention {
  readonly status: "needs_attention";
  readonly reason: string;
}
interface RecoveryRequired {
  readonly status: "recovery_required";
  readonly activationId: string;
}
interface Publication {
  readonly status: "success";
  readonly commit: string;
  readonly refreshRequired: boolean;
}
interface PublishedRecovery {
  readonly status: "success";
  readonly plan: RecoveryPlan;
  readonly publication?: Publication;
}
type EvidenceReader = (context: EvidenceContext, signal: AbortSignal) => Promise<unknown>;
interface RecoveryRequestBase extends Omit<
  ManagedTransactionRequest<PublishedRecovery | Attention | RecoveryRequired>,
  "allows" | "mutate" | "validateMetadata" | "validateChangedPaths"
> {
  readonly targetTermCode: string;
  readonly revalidateRepository: () => Promise<void>;
  readonly reconciliation: Omit<
    Parameters<typeof Backend.reconcileCourseTermLifecycle>[0],
    | "course"
    | "terms"
    | "activeTermCode"
    | "courseRepositoryId"
    | "organizationId"
    | "authenticatedUserId"
    | "retiredDraftTerms"
  >;
  /** Internal trusted test seam only, never an IPC parameter. */
  readonly reconcile?: typeof Backend.reconcileCourseTermLifecycle;
}
export type TermRecoveryRequest = RecoveryRequestBase &
  (
    | { readonly operation: "delete-draft"; readonly inspectActivity: EvidenceReader }
    | {
        readonly operation: "safe-rollback";
        readonly activationId: string;
        readonly inspectActivity: EvidenceReader;
      }
    | {
        readonly operation: "accept-current" | "restore-predecessor";
        readonly activationId: string;
      }
  );
export interface CommittedTermRecovery {
  readonly status:
    | "deleted_reconciled"
    | "deleted_needs_reconciliation"
    | "recovered_reconciled"
    | "recovered_needs_reconciliation";
  readonly plan: RecoveryPlan;
  readonly commit: string;
  readonly refreshRequired: boolean;
  readonly studentFacingReady: boolean;
  readonly reconciliation: Reconciliation | null;
  readonly reason?: "reconciliation_failed" | "authoritative_revision_changed";
}
export type TermRecoveryResult = CommittedTermRecovery | Attention | RecoveryRequired;

const requireV2 = (request: Pick<RecoveryRequestBase, "input" | "context">): void => {
  if (
    request.input.course.schemaVersion !== 2 ||
    request.context.userId !== request.input.userId ||
    request.context.repositoryId !== request.input.course.repositoryId
  )
    throw new Error("Lifecycle recovery requires a trusted v2 course/session context.");
};
const evidenceContext = (
  request: Pick<RecoveryRequestBase, "input" | "context" | "targetTermCode">
): EvidenceContext =>
  Object.freeze({
    courseRepositoryId: request.context.repositoryId,
    revision: request.context.authoritativeCommit,
    termCode: request.targetTermCode,
    authenticatedGithubUserId: request.input.userId
  });
const isCurrent = async (
  request: Pick<RecoveryRequestBase, "input" | "revalidateRepository">,
  commit: string
) => {
  await request.revalidateRepository();
  const state = await request.input.resynchronize?.(true);
  return (
    !request.input.signal.aborted &&
    (await request.input.revalidateSession()) &&
    !!state &&
    (state.status === "up_to_date" || state.status === "updated") &&
    state.currentCommit === commit
  );
};
const requireCheckpointAncestry = async (
  root: string,
  sourceRevision: string,
  revision: string,
  factory?: GitWorkspaceFactory
): Promise<void> => {
  if (
    !(await (
      await (factory ?? getProductionGitWorkspaceFactory()).open(root)
    ).isAncestor(sourceRevision, revision))
  )
    throw new Error("Recovery checkpoint is not anchored in this course history.");
};

/**
 * Future v2 only. Invoke inside the SAME existing per-account/course serialization lease as
 * activation and first activity; the lease spans publication, freshness checks and reconciliation.
 * Exact-revision/non-force publication also arbitrates other machines. No rollback of accepted Git.
 */
export const recoverManagedTerm = async (
  request: TermRecoveryRequest
): Promise<TermRecoveryResult> => {
  requireV2(request);
  const backend = loadBackend();
  const context = evidenceContext(request);
  const reconciliation = {
    ...request.reconciliation,
    studentTargets: structuredClone(request.reconciliation.studentTargets)
  };
  let prepared: ReturnType<typeof backend.prepareDraftDeletion> | undefined;
  const result = await publishManagedCourseTransaction<
    PublishedRecovery | Attention | RecoveryRequired
  >({
    ...request,
    allows: (file) => prepared?.changedPaths.includes(file) ?? false,
    validateChangedPaths: (paths) => {
      if (paths.some((file) => !prepared?.changedPaths.includes(file)))
        throw new Error("Unexpected recovery paths.");
    },
    validateMetadata: (root, organization) => {
      backend.readActivationMetadata(root, organization);
    },
    mutate: async (root) => {
      try {
        let evidence: unknown;
        if (request.operation !== "delete-draft") {
          const checkpoint = backend.inspectTermRecoveryCheckpoint(
            root,
            request.input.course.organizationLogin,
            context
          );
          await requireCheckpointAncestry(
            root,
            checkpoint.activated_from_revision,
            context.revision,
            request.factory
          );
        }
        if (request.operation === "delete-draft" || request.operation === "safe-rollback") {
          const checkpoint =
            request.operation === "safe-rollback"
              ? backend.inspectTermRecoveryCheckpoint(
                  root,
                  request.input.course.organizationLogin,
                  context
                )
              : null;
          if (checkpoint?.state !== "recovery_required") {
            backend.assertNoKnownStudentTargets(context.termCode, reconciliation.studentTargets);
            try {
              evidence = await request.inspectActivity(context, request.input.signal);
            } catch {
              return Object.freeze({
                status: "needs_attention" as const,
                reason: "activity_unknown"
              });
            }
          }
        }
        if (request.operation === "delete-draft")
          prepared = backend.prepareDraftDeletion(
            root,
            request.input.course.organizationLogin,
            context,
            evidence
          );
        else {
          const value = backend.prepareActivationRecovery(
            root,
            request.input.course.organizationLogin,
            context,
            request.activationId,
            request.operation,
            evidence
          );
          if ("status" in value) return value;
          prepared = value;
        }
        return { status: "success" as const, plan: prepared.plan };
      } catch (error) {
        if (error instanceof backend.TermRecoveryNeedsAttention) {
          if (request.operation === "safe-rollback" && error.reason === "activity_present")
            return Object.freeze({
              status: "recovery_required" as const,
              activationId: request.activationId
            });
          return Object.freeze({ status: "needs_attention" as const, reason: error.reason });
        }
        throw error;
      }
    }
  });
  if (result.status !== "success") return result;
  if (!prepared || !result.publication) throw new Error("Recovery publication was not confirmed.");
  const base = {
    plan: result.plan,
    commit: result.publication.commit,
    refreshRequired: result.publication.refreshRequired
  };
  const incomplete = (
    reason: CommittedTermRecovery["reason"],
    observed: Reconciliation | null = null
  ): CommittedTermRecovery =>
    Object.freeze({
      ...base,
      status:
        request.operation === "delete-draft"
          ? "deleted_needs_reconciliation"
          : "recovered_needs_reconciliation",
      studentFacingReady: false,
      reconciliation: observed,
      ...(reason ? { reason } : {})
    });
  try {
    if (!(await isCurrent(request, base.commit)))
      return incomplete("authoritative_revision_changed");
    const terms = prepared.plan.after.map((term) => backend.rawTermConfigV2Schema.parse(term));
    const observed = await (request.reconcile ?? backend.reconcileCourseTermLifecycle)(
      {
        ...reconciliation,
        course: prepared.course,
        terms,
        activeTermCode: terms.find((term) => term.term.status === "active")?.term.code ?? null,
        courseRepositoryId: context.courseRepositoryId,
        organizationId: request.input.course.organizationId,
        authenticatedUserId: context.authenticatedGithubUserId,
        retiredDraftTerms: prepared.retiredDraftTerms
      },
      request.input.signal
    );
    if (!(await isCurrent(request, base.commit)))
      return incomplete("authoritative_revision_changed", observed);
    if (observed.status !== "reconciled") return incomplete(undefined, observed);
    return Object.freeze({
      ...base,
      status: request.operation === "delete-draft" ? "deleted_reconciled" : "recovered_reconciled",
      studentFacingReady:
        observed.studentFacingReady && terms.some((term) => term.term.status === "active"),
      reconciliation: observed
    });
  } catch {
    return incomplete("reconciliation_failed");
  }
};

type Marker = ReturnType<typeof Backend.prepareStudentActivityMarker>;
interface PublishedMarker {
  readonly status: "success";
  readonly marker: Marker;
  readonly publication?: Publication;
}
export interface StudentActivityMarkerRequest extends Omit<
  ManagedTransactionRequest<PublishedMarker | Attention>,
  "allows" | "mutate" | "validateMetadata" | "validateChangedPaths"
> {
  readonly targetTermCode: string;
  readonly activationId: string;
  readonly category: Parameters<typeof Backend.prepareStudentActivityMarker>[4];
  readonly revalidateRepository: () => Promise<void>;
}
export type StudentActivityMarkerResult =
  | Attention
  | {
      readonly status: "activity_marked";
      readonly commit: string;
      readonly checkpoint: Marker["checkpoint"];
      readonly alreadyMarked: boolean;
    };

/** Necessary write-ahead barrier only; caller must separately authorize the operation and scope. */
export const markManagedStudentActivity = async (
  request: StudentActivityMarkerRequest
): Promise<StudentActivityMarkerResult> => {
  requireV2(request);
  const backend = loadBackend();
  let prepared: Marker | undefined;
  const result = await publishManagedCourseTransaction<PublishedMarker | Attention>({
    ...request,
    allows: (file) => prepared?.changedPaths.includes(file) ?? false,
    validateChangedPaths: (paths) => {
      if (paths.some((file) => !prepared?.changedPaths.includes(file)))
        throw new Error("Unexpected activity marker paths.");
    },
    validateMetadata: (root, organization) => {
      backend.readActivationMetadata(root, organization);
    },
    mutate: async (root) => {
      try {
        const checkpoint = backend.inspectTermRecoveryCheckpoint(
          root,
          request.input.course.organizationLogin,
          evidenceContext(request)
        );
        await requireCheckpointAncestry(
          root,
          checkpoint.activated_from_revision,
          request.context.authoritativeCommit,
          request.factory
        );
        prepared = backend.prepareStudentActivityMarker(
          root,
          request.input.course.organizationLogin,
          evidenceContext(request),
          request.activationId,
          request.category
        );
        return { status: "success", marker: prepared };
      } catch (error) {
        if (error instanceof backend.TermRecoveryNeedsAttention)
          return Object.freeze({ status: "needs_attention", reason: error.reason });
        throw error;
      }
    }
  });
  if (result.status !== "success") return result;
  const commit = result.publication?.commit ?? request.context.authoritativeCommit;
  try {
    if (!(await isCurrent(request, commit)))
      return Object.freeze({ status: "needs_attention", reason: "authoritative_revision_changed" });
    return Object.freeze({
      status: "activity_marked",
      commit,
      checkpoint: result.marker.checkpoint,
      alreadyMarked: result.marker.changedPaths.length === 0
    });
  } catch {
    return Object.freeze({ status: "needs_attention", reason: "activity_marker_unconfirmed" });
  }
};

/** Hold the caller's existing course lease through BOTH this marker and the already-authorized operation. */
export const runAfterManagedActivityMarker = async <T>(
  request: StudentActivityMarkerRequest,
  performAuthorizedOperation: () => Promise<T>
) => {
  const marker = await markManagedStudentActivity(request);
  if (marker.status !== "activity_marked")
    return Object.freeze({ status: "activity_blocked" as const, marker });
  const result = await performAuthorizedOperation();
  return Object.freeze({ status: "activity_executed" as const, marker, result });
};
