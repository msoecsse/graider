import { z } from "zod";
import type {
  RawCourseConfigV2,
  RawTermConfigV2,
  CourseLifecycleStatus
} from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { AuthorizationResolver } from "../faculty/authorization-resolver.js";
import { CourseTermLifecycle } from "../terms/course-term-lifecycle.js";
import {
  activationRecoveryCheckpointSchema,
  validateRecoveryCheckpoint
} from "../terms/activation-recovery-checkpoint.js";

export interface CourseRecoveryInventory {
  /** The trusted reader must enumerate the complete exact-revision checkpoint namespace. */
  readonly complete: boolean;
  readonly checkpoints: readonly unknown[];
}
export type CourseArchiveGuardReason =
  | "archive-guards-satisfied"
  | "active-term-exists"
  | "draft-term-exists"
  | "activation-recovery-unresolved"
  | "recovery-state-unknown"
  | "recovery-state-invalid";
export interface CourseArchiveGuard {
  readonly allowed: boolean;
  readonly basis: CourseArchiveGuardReason;
}
const LAST_ENTRY_OFFSET = -1;
const inventorySchema = z
  .object({ complete: z.boolean(), checkpoints: z.array(z.unknown()) })
  .strict();

/** Exact existing-term order, oldest first. No filesystem/date/array-order inference is permitted. */
export const validateTermCreationOrder = (
  course: RawCourseConfigV2,
  terms: readonly RawTermConfigV2[]
): void => {
  const codes = course.course.term_creation_order;
  const existing = new Set(terms.map((term) => term.term.code));
  if (codes.length !== existing.size || codes.some((code) => !existing.has(code)))
    throw new Error("Course term creation order must reference every existing term exactly once.");
};

/** Pure v2 snapshot. Future production composition must ALSO prove no unresolved organization migration. */
export class CourseLifecycle {
  private readonly status: CourseLifecycleStatus;
  private readonly terms: CourseTermLifecycle;
  private readonly latestCode: string | undefined;
  private readonly guard: CourseArchiveGuard;

  constructor(
    courseInput: RawCourseConfigV2,
    termInputs: readonly RawTermConfigV2[],
    recoveryInventory?: CourseRecoveryInventory
  ) {
    const course = rawCourseConfigV2Schema.parse(courseInput);
    const terms = termInputs.map((term) => rawTermConfigV2Schema.parse(term));
    this.terms = new CourseTermLifecycle(terms);
    validateTermCreationOrder(course, terms);
    for (const term of terms)
      new AuthorizationResolver(course, term, course.fallback_administrator.github_user_id);
    this.status = course.course.lifecycle;
    this.latestCode = course.course.term_creation_order.at(LAST_ENTRY_OFFSET);
    if (
      this.status === "archived" &&
      (this.terms.getActiveTerm() || this.terms.getDraftTerms().length)
    )
      throw new Error("Archived course contains non-Archived terms.");
    const inventory = inventorySchema.safeParse(recoveryInventory);
    let basis: CourseArchiveGuardReason = "archive-guards-satisfied";
    if (!inventory.success || !inventory.data.complete) basis = "recovery-state-unknown";
    else {
      try {
        if (inventory.data.checkpoints.length > 1)
          throw new Error("Multiple recovery checkpoints.");
        for (const input of inventory.data.checkpoints) {
          const checkpoint = activationRecoveryCheckpointSchema.parse(input);
          validateRecoveryCheckpoint(
            checkpoint,
            this.terms,
            checkpoint.course_repository_id,
            checkpoint.target_term_code
          );
          for (const id of [
            checkpoint.activating_github_user_id,
            ...(checkpoint.first_activity ? [checkpoint.first_activity.actor_github_user_id] : [])
          ])
            if (!course.faculty_directory.some((faculty) => faculty.github_user_id === id))
              throw new Error("Unknown recovery actor.");
        }
        if (inventory.data.checkpoints.length) basis = "activation-recovery-unresolved";
        else if (this.terms.getActiveTerm()) basis = "active-term-exists";
        else if (this.terms.getDraftTerms().length) basis = "draft-term-exists";
      } catch {
        basis = "recovery-state-invalid";
      }
    }
    this.guard = Object.freeze({ allowed: basis === "archive-guards-satisfied", basis });
  }

  getStatus(): CourseLifecycleStatus {
    return this.status;
  }
  isArchived(): boolean {
    return this.status === "archived";
  }
  getMostRecentTerm() {
    return this.latestCode === undefined ? undefined : this.terms.getTerm(this.latestCode);
  }
  canArchiveState(): CourseArchiveGuard {
    return this.guard;
  }
  assertArchiveGuards(): void {
    if (!this.guard.allowed) throw new Error(`Course archive blocked: ${this.guard.basis}.`);
  }
}

export const COURSE_CREATION_OPERATIONS = Object.freeze([
  "create-term",
  "create-assignment"
] as const);
export type CourseCreationOperation = (typeof COURSE_CREATION_OPERATIONS)[number];

/** Necessary lifecycle gate only. Passing never grants role/ownership authority. */
export const checkCourseCreationLifecycle = (
  course: RawCourseConfigV2,
  operation: CourseCreationOperation
) => {
  z.enum(COURSE_CREATION_OPERATIONS).parse(operation);
  const archived = rawCourseConfigV2Schema.parse(course).course.lifecycle === "archived";
  return Object.freeze({
    operation,
    allowed: !archived,
    basis: archived ? ("course-archived" as const) : ("role-authorization-required" as const)
  });
};

/** For already-authorized discovery results; local visibility never changes shared/sync state. */
export const projectCourseLifecycle = (
  course: RawCourseConfigV2,
  options: { readonly showArchived: boolean; readonly locallyHidden: boolean }
) => {
  const status = rawCourseConfigV2Schema.parse(course).course.lifecycle;
  return Object.freeze({
    lifecycle: status,
    dashboardVisible: !options.locallyHidden && (status === "unarchived" || options.showArchived),
    discoveryEligible: true as const,
    synchronizationEligible: true as const,
    bootstrapEligible: true as const
  });
};
