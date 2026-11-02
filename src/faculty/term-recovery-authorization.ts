import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { CourseTermLifecycle } from "../terms/course-term-lifecycle.js";
import { AuthorizationResolver } from "./authorization-resolver.js";
import { FallbackAdministrator } from "./fallback-administrator.js";

export interface TermRecoveryDecision {
  readonly allowed: boolean;
  readonly basis:
    | "fallback-administrator"
    | "current-active-term-coordinator"
    | "initial-draft-coordinator"
    | "no-deletion-authority"
    | "no-recovery-authority"
    | "ever-active-deletion-prohibited";
}
const context = (
  courseInput: RawCourseConfigV2,
  terms: readonly RawTermConfigV2[],
  actorId: number
) => {
  const course = rawCourseConfigV2Schema.parse(courseInput);
  const lifecycle = new CourseTermLifecycle(terms);
  const roles = new Map(
    terms.map((term) => [
      term.term.code,
      new AuthorizationResolver(
        course,
        rawTermConfigV2Schema.parse(lifecycle.getTerm(term.term.code)),
        actorId
      )
    ])
  );
  return {
    lifecycle,
    roles,
    fallback: new FallbackAdministrator(course).isFallbackAdministrator(actorId)
  };
};
export class DraftDeletionAuthorizationResolver {
  private readonly decision: TermRecoveryDecision;
  constructor(
    course: RawCourseConfigV2,
    terms: readonly RawTermConfigV2[],
    targetCode: string,
    actorId: number
  ) {
    const state = context(course, terms, actorId);
    const target = state.lifecycle.getTerm(targetCode);
    if (!target || target.term.status !== "draft")
      throw new Error("Draft deletion requires an existing Draft target.");
    const active = state.lifecycle.getActiveTerm();
    this.decision = Object.freeze(
      target.term.has_ever_been_active
        ? { allowed: false, basis: "ever-active-deletion-prohibited" }
        : state.fallback
          ? { allowed: true, basis: "fallback-administrator" }
          : active && state.roles.get(active.term.code)?.roleFacts.currentCoordinator
            ? { allowed: true, basis: "current-active-term-coordinator" }
            : !active && state.roles.get(targetCode)?.roleFacts.currentCoordinator
              ? { allowed: true, basis: "initial-draft-coordinator" }
              : { allowed: false, basis: "no-deletion-authority" }
    );
  }
  canDeleteDraft(): TermRecoveryDecision {
    return this.decision;
  }
}
export class TermActivationRecoveryAuthorizationResolver {
  private readonly decision: TermRecoveryDecision;
  constructor(
    course: RawCourseConfigV2,
    terms: readonly RawTermConfigV2[],
    targetCode: string,
    actorId: number
  ) {
    const state = context(course, terms, actorId);
    if (state.lifecycle.getActiveTerm()?.term.code !== targetCode)
      throw new Error("Recovery requires the currently Active target.");
    this.decision = Object.freeze(
      state.fallback
        ? { allowed: true, basis: "fallback-administrator" }
        : state.roles.get(targetCode)?.roleFacts.currentCoordinator
          ? { allowed: true, basis: "current-active-term-coordinator" }
          : { allowed: false, basis: "no-recovery-authority" }
    );
  }
  canRecoverActivation(): TermRecoveryDecision {
    return this.decision;
  }
}
