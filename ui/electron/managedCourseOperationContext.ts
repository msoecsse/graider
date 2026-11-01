import { AsyncLocalStorage } from "node:async_hooks";
import type { VerifiedCourseMutationContext } from "./managedCourseMutationGuard.js";

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
