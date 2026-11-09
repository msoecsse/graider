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
  if (operation?.mode === "local_read")
    throw new Error("Local read authorization cannot authorize writes.");
  if (operation?.mode === "local_grading") await operation.revalidateLocal();
  else await operation?.revalidate?.();
};
