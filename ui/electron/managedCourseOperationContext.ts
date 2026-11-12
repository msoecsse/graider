import { AsyncLocalStorage } from "node:async_hooks";
import type { VerifiedCourseOperationContext } from "./managedCourseMutationTypes.js";

/** Main-only projection for services that historically resolved paths via the registry. */
export const managedCourseOperation = new AsyncLocalStorage<
  VerifiedCourseOperationContext & {
    readonly transaction?: boolean;
    readonly authoritativePath?: string;
    readonly afterPublication?: Array<() => Promise<unknown>>;
  }
>();

/** Document identity propagates through synchronization; never passed by renderer. */
export const courseOperationDocument = new AsyncLocalStorage<number>();

/** Rechecked after awaited preparation and immediately before local/backend writes. */
export const revalidateCourseOperation = async (): Promise<void> => {
  const operation = managedCourseOperation.getStore();
  if (operation?.mode === "local_read" || operation?.mode === "evidence_read")
    throw new Error("Local read authorization cannot authorize writes.");
  if (operation?.mode === "local_grading") await operation.revalidateLocal();
  else await operation?.revalidate?.();
};

/** Close the submission race introduced by awaited course validation before a local write. */
export const revalidateGradingSubmission = async (
  readHead: () => Promise<import("./localRepositoryHead.js").LocalRepositoryHeadResult>,
  expected: string
): Promise<boolean> => {
  await revalidateCourseOperation();
  const operation = managedCourseOperation.getStore();
  if (operation?.mode !== "local_grading") return true;
  const current = await readHead();
  operation.assertCurrent();
  return current.status === "success" && current.submissionCommitSha === expected;
};

/** Review Import releases the course lease while its native picker is open, then
 * reacquires local grading authorization for planning and optional student updates. */
export const reviewImportPreparation = new AsyncLocalStorage<{
  run<T>(operation: () => Promise<T>): Promise<T>;
}>();
export const withReviewImportPreparation = <T>(operation: () => Promise<T>): Promise<T> => {
  const preparation = reviewImportPreparation.getStore();
  return preparation === undefined ? operation() : preparation.run(operation);
};
