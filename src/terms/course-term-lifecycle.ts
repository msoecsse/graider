import type { RawTermConfigV2, TermLifecycleStatus } from "../config/config-models.js";
import { rawTermConfigV2Schema } from "../config/config-schemas.js";

const snapshotRoleHistory = (history: RawTermConfigV2["coordinators"]) =>
  Object.freeze({
    current: Object.freeze(history.current.map((reference) => Object.freeze(reference))),
    former: Object.freeze(history.former.map((reference) => Object.freeze(reference)))
  });

const snapshotTerm = (input: RawTermConfigV2) => {
  const term = rawTermConfigV2Schema.parse(input);
  return Object.freeze({
    ...term,
    term: Object.freeze(term.term),
    coordinators: snapshotRoleHistory(term.coordinators),
    sections: Object.freeze(
      term.sections.map((section) =>
        Object.freeze({ ...section, faculty: snapshotRoleHistory(section.faculty) })
      )
    )
  });
};

export type TermLifecycleSnapshot = ReturnType<typeof snapshotTerm>;

/** Normal transitions only. Same-state assignment is a no-op, not a transition. */
export const canTransitionTermStatus = (
  from: TermLifecycleStatus,
  to: TermLifecycleStatus
): boolean => (from === "draft" && to === "active") || (from === "active" && to === "archived");

/** Accepts no-ops; exceptional activation rollback must use a separate recovery contract. */
export const assertTermStatusTransition = (
  from: TermLifecycleStatus,
  to: TermLifecycleStatus
): void => {
  if (from !== to && !canTransitionTermStatus(from, to)) {
    throw new Error(`Invalid normal term status transition: ${from} → ${to}.`);
  }
};

/**
 * Pure lifecycle snapshot over the complete supplied v2 term set. The caller is
 * responsible for completeness. No dates, role history, authorization or GitHub policy
 * are inferred. At most one Active is valid; workflows requiring one must ask explicitly.
 */
export class CourseTermLifecycle {
  private readonly byTermCode = new Map<string, TermLifecycleSnapshot>();
  private readonly draft: readonly TermLifecycleSnapshot[];
  private readonly archived: readonly TermLifecycleSnapshot[];
  private readonly active: TermLifecycleSnapshot | undefined;

  constructor(termInputs: readonly RawTermConfigV2[]) {
    const terms = termInputs.map(snapshotTerm);
    for (const term of terms) {
      if (this.byTermCode.has(term.term.code)) {
        throw new Error("Duplicate supplied term code.");
      }
      this.byTermCode.set(term.term.code, term);
    }
    const active = terms.filter((term) => term.term.status === "active");
    if (active.length > 1) {
      throw new Error("A course term lifecycle permits at most one Active term.");
    }
    this.active = active[0];
    this.draft = Object.freeze(terms.filter((term) => term.term.status === "draft"));
    this.archived = Object.freeze(terms.filter((term) => term.term.status === "archived"));
  }

  getDraftTerms(): readonly TermLifecycleSnapshot[] {
    return this.draft;
  }

  getArchivedTerms(): readonly TermLifecycleSnapshot[] {
    return this.archived;
  }

  /** Zero Active terms is valid during initial setup, course archive, or recovery. */
  getActiveTerm(): TermLifecycleSnapshot | undefined {
    return this.active;
  }

  requireActiveTerm(): TermLifecycleSnapshot {
    if (this.active === undefined) {
      throw new Error("This operation requires an Active term.");
    }
    return this.active;
  }

  /** Unknown codes return undefined, matching faculty directory lookup conventions. */
  getTerm(termCode: string): TermLifecycleSnapshot | undefined {
    return this.byTermCode.get(termCode);
  }

  getStatus(termCode: string): TermLifecycleStatus | undefined {
    return this.getTerm(termCode)?.term.status;
  }
}
