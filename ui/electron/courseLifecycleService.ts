import path from "node:path";
import type * as Backend from "../dist-electron/termActivationBackend.cjs";
import {
  publishManagedCourseTransaction,
  type ManagedTransactionRequest
} from "./managedCourseTransaction.js";

type Prepared = ReturnType<typeof Backend.prepareCourseLifecycleChange>;
interface PublishedChange {
  readonly status: "success";
  readonly prepared: Extract<Prepared, { status: "success" }>;
  readonly publication?: { readonly commit: string; readonly refreshRequired: boolean };
}
interface Attention {
  readonly status: "needs_attention";
  readonly reason: string;
  readonly beforeStatus?: "unarchived" | "archived";
  readonly afterStatus?: "unarchived" | "archived";
  readonly authorizationBasis?: string;
}
export interface CourseLifecycleRequest extends Omit<
  ManagedTransactionRequest<PublishedChange | Attention>,
  "allows" | "mutate" | "validateMetadata" | "validateChangedPaths"
> {
  readonly targetStatus: "unarchived" | "archived";
  /** Existing trust hook; future Phase 9 composition must also reject required/in-progress/incomplete migration. */
  readonly revalidateRepository: () => Promise<void>;
}
export type CourseLifecycleResult =
  | Attention
  | {
      readonly status: "up_to_date" | "archived" | "unarchived";
      readonly beforeStatus: "unarchived" | "archived";
      readonly afterStatus: "unarchived" | "archived";
      readonly authorizationBasis: string;
      readonly revision: string;
      readonly refreshRequired: boolean;
    };

/** Future v2 only. Holds the caller's existing course lease; never reconciles GitHub on archive/unarchive. */
export const changeManagedCourseLifecycle = async (
  request: CourseLifecycleRequest
): Promise<CourseLifecycleResult> => {
  if (
    request.input.course.schemaVersion !== 2 ||
    request.input.userId !== request.context.userId ||
    request.input.course.repositoryId !== request.context.repositoryId
  )
    throw new Error("Course lifecycle requires a trusted v2 course/session context.");
  const backend: typeof Backend = require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "termActivationBackend.cjs"
    )
  );
  const result = await publishManagedCourseTransaction<PublishedChange | Attention>({
    ...request,
    allows: (file) => file === "course.yml",
    validateChangedPaths: (paths) => {
      if (paths.some((file) => file !== "course.yml"))
        throw new Error("Unexpected course lifecycle paths.");
    },
    validateMetadata: (root, organization) => {
      backend.readActivationMetadata(root, organization);
    },
    mutate: async (root) => {
      try {
        const prepared = backend.prepareCourseLifecycleChange(
          root,
          request.input.course.organizationLogin,
          request.context.repositoryId,
          request.input.userId,
          request.targetStatus
        );
        return prepared.status === "needs_attention" ? prepared : { status: "success", prepared };
      } catch (error) {
        return Object.freeze({
          status: "needs_attention",
          reason:
            error instanceof backend.TermRecoveryNeedsAttention
              ? error.reason
              : "invalid-course-state"
        });
      }
    }
  });
  if (result.status !== "success") return Object.freeze(result);
  const revision = result.publication?.commit ?? request.context.authoritativeCommit;
  // The shared transaction checks exact revision before mutations. No-op must also confirm current remote state.
  if (!result.publication) {
    await request.revalidateRepository();
    const fresh = await request.input.resynchronize?.(true);
    if (
      request.input.signal.aborted ||
      !(await request.input.revalidateSession()) ||
      !fresh ||
      (fresh.status !== "up_to_date" && fresh.status !== "updated") ||
      fresh.currentCommit !== revision
    )
      return Object.freeze({ status: "needs_attention", reason: "authoritative-revision-changed" });
  }
  return Object.freeze({
    status: result.prepared.changed ? result.prepared.afterStatus : "up_to_date",
    beforeStatus: result.prepared.beforeStatus,
    afterStatus: result.prepared.afterStatus,
    authorizationBasis: result.prepared.authorizationBasis,
    revision,
    refreshRequired: result.publication?.refreshRequired ?? false
  });
};
