import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawTermConfigV2Schema } from "../config/config-schemas.js";
import { TermActivationAuthorizationResolver } from "../faculty/term-activation-authorization-resolver.js";
import {
  CourseTermLifecycle,
  assertTermStatusTransition,
  type TermLifecycleSnapshot
} from "./course-term-lifecycle.js";

export interface TermActivationPlan {
  readonly targetTermCode: string;
  readonly previousActiveTermCode: string | null;
  readonly changedTermCodes: readonly string[];
  readonly before: readonly TermLifecycleSnapshot[];
  readonly after: readonly TermLifecycleSnapshot[];
}

/** Pure, immutable plan. Persistence must publish every changed term in one exact-revision commit. */
export const planTermActivation = (
  course: RawCourseConfigV2,
  termInputs: readonly RawTermConfigV2[],
  targetTermCode: string,
  authenticatedGithubUserId: number
): TermActivationPlan => {
  const terms = termInputs.map((term) => rawTermConfigV2Schema.parse(term));
  const lifecycle = new CourseTermLifecycle(terms);
  const authorization = new TermActivationAuthorizationResolver(
    course,
    terms,
    targetTermCode,
    authenticatedGithubUserId
  ).canActivateTerm();
  if (!authorization.allowed) throw new Error(`Term activation denied: ${authorization.basis}.`);
  const previous = lifecycle.getActiveTerm();
  const after = terms.map((term) => {
    if (term.term.code === targetTermCode) {
      assertTermStatusTransition(term.term.status, "active");
      return {
        ...term,
        term: { ...term.term, status: "active" as const, has_ever_been_active: true }
      };
    }
    if (term.term.code === previous?.term.code) {
      assertTermStatusTransition(term.term.status, "archived");
      return { ...term, term: { ...term.term, status: "archived" as const } };
    }
    return term;
  });
  const final = new CourseTermLifecycle(after);
  if (final.requireActiveTerm().term.code !== targetTermCode)
    throw new Error("Invalid activation result.");
  const snapshots = (model: CourseTermLifecycle) =>
    Object.freeze(
      terms.map((term) => {
        const snapshot = model.getTerm(term.term.code);
        if (!snapshot) throw new Error("Incomplete activation snapshot.");
        return snapshot;
      })
    );
  return Object.freeze({
    targetTermCode,
    previousActiveTermCode: previous?.term.code ?? null,
    changedTermCodes: Object.freeze(
      previous ? [previous.term.code, targetTermCode] : [targetTermCode]
    ),
    before: snapshots(lifecycle),
    after: snapshots(final)
  });
};
