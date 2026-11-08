import { AsyncLocalStorage } from "node:async_hooks";
import type { VerifiedCourseMutationContext } from "./managedCourseMutationTypes.js";

/** Main-only projection for services that historically resolved paths via the registry. */
export const managedCourseOperation = new AsyncLocalStorage<
  VerifiedCourseMutationContext & {
    readonly transaction?: boolean;
    readonly authoritativePath?: string;
    readonly afterPublication?: Array<() => Promise<unknown>>;
  }
>();

/** Document identity propagates through synchronization; never passed by renderer. */
export const courseOperationDocument = new AsyncLocalStorage<number>();

/** Rechecked after awaited preparation and immediately before local/backend writes. */
export const revalidateCourseOperation = async (): Promise<void> => {
  await managedCourseOperation.getStore()?.revalidate?.();
};
