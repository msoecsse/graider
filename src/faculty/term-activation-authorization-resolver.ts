import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { CourseTermLifecycle } from "../terms/course-term-lifecycle.js";
import { AuthorizationResolver } from "./authorization-resolver.js";
import { FallbackAdministrator } from "./fallback-administrator.js";

export interface TermActivationDecision {
  readonly allowed: boolean;
  readonly basis:
    | "current-active-term-coordinator"
    | "fallback-administrator"
    | "initial-activation-fallback-required"
    | "no-activation-authority";
}

/** Explicit activation authority over a complete trusted v2 snapshot; no preparation capability is reused. */
export class TermActivationAuthorizationResolver {
  private readonly decision: TermActivationDecision;

  constructor(
    courseInput: RawCourseConfigV2,
    terms: readonly RawTermConfigV2[],
    targetTermCode: string,
    actorId: number
  ) {
    const course = rawCourseConfigV2Schema.parse(courseInput);
    const lifecycle = new CourseTermLifecycle(terms);
    const target = lifecycle.getTerm(targetTermCode);
    if (!target) throw new Error("Activation target term was not found.");
    if (target.term.status !== "draft") throw new Error("Activation requires a Draft target term.");
    // Validate every role/directory relationship, including unrelated Draft/Archived terms.
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
    const active = lifecycle.getActiveTerm();
    this.decision = Object.freeze(
      new FallbackAdministrator(course).isFallbackAdministrator(actorId)
        ? { allowed: true, basis: "fallback-administrator" }
        : active === undefined
          ? { allowed: false, basis: "initial-activation-fallback-required" }
          : roles.get(active.term.code)?.roleFacts.currentCoordinator
            ? { allowed: true, basis: "current-active-term-coordinator" }
            : { allowed: false, basis: "no-activation-authority" }
    );
  }

  canActivateTerm(): TermActivationDecision {
    return this.decision;
  }
}
