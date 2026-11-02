import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import {
  CourseLifecycle,
  type CourseRecoveryInventory,
  type CourseArchiveGuardReason
} from "../courses/course-lifecycle.js";
import { AuthorizationResolver } from "./authorization-resolver.js";
import { FallbackAdministrator } from "./fallback-administrator.js";

export type CourseLifecycleAuthorizationBasis =
  | "fallback-administrator"
  | "most-recent-term-current-coordinator"
  | "no-course-lifecycle-authority"
  | "already-archived"
  | "already-unarchived"
  | CourseArchiveGuardReason;
export interface CourseLifecycleDecision {
  readonly allowed: boolean;
  readonly basis: CourseLifecycleAuthorizationBasis;
}
const decision = (
  allowed: boolean,
  basis: CourseLifecycleAuthorizationBasis
): CourseLifecycleDecision => Object.freeze({ allowed, basis });

/** Dedicated course authority, independent of Draft preparation and historical read access. */
export class CourseLifecycleAuthorizationResolver {
  readonly lifecycle: CourseLifecycle;
  private readonly authority: CourseLifecycleDecision;
  constructor(
    courseInput: RawCourseConfigV2,
    terms: readonly RawTermConfigV2[],
    authenticatedGithubUserId: number,
    recoveryInventory?: CourseRecoveryInventory
  ) {
    const course = rawCourseConfigV2Schema.parse(courseInput);
    this.lifecycle = new CourseLifecycle(course, terms, recoveryInventory);
    const latest = this.lifecycle.getMostRecentTerm();
    const fallback = new FallbackAdministrator(course).isFallbackAdministrator(
      authenticatedGithubUserId
    );
    const coordinator =
      latest !== undefined &&
      new AuthorizationResolver(
        course,
        rawTermConfigV2Schema.parse(latest),
        authenticatedGithubUserId
      ).roleFacts.currentCoordinator;
    this.authority = fallback
      ? decision(true, "fallback-administrator")
      : coordinator
        ? decision(true, "most-recent-term-current-coordinator")
        : decision(false, "no-course-lifecycle-authority");
  }
  /** Also used to authorize idempotent requests; no-op state does not grant strangers authority. */
  getAuthority(): CourseLifecycleDecision {
    return this.authority;
  }
  canArchiveCourse(): CourseLifecycleDecision {
    if (!this.authority.allowed) return this.authority;
    if (this.lifecycle.isArchived()) return decision(false, "already-archived");
    const guard = this.lifecycle.canArchiveState();
    return guard.allowed ? this.authority : decision(false, guard.basis);
  }
  canUnarchiveCourse(): CourseLifecycleDecision {
    if (!this.authority.allowed) return this.authority;
    return this.lifecycle.isArchived() ? this.authority : decision(false, "already-unarchived");
  }
}
