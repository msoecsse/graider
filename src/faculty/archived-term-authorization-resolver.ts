import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { CourseTermLifecycle } from "../terms/course-term-lifecycle.js";
import {
  AuthorizationResolver,
  type AuthorizationBasis,
  type AuthorizationDecision,
  type AuthorizationRoleFacts,
  type AuthorizationScope
} from "./authorization-resolver.js";
import { FallbackAdministrator } from "./fallback-administrator.js";

export const ARCHIVED_SECTION_OPERATIONS = Object.freeze([
  "inspect",
  "grading-dispatch",
  "grading",
  "report-publication",
  "apply",
  "student-repository-mutation"
] as const);
export type ArchivedSectionOperation = (typeof ARCHIVED_SECTION_OPERATIONS)[number];

export const ARCHIVED_STRUCTURAL_OPERATIONS = Object.freeze([
  "section-structure",
  "roster-structure",
  "assignment-structure",
  "deadline",
  "faculty-assignment"
] as const);
export type ArchivedStructuralOperation = (typeof ARCHIVED_STRUCTURAL_OPERATIONS)[number];

export type ArchivedAuthorizationBasis =
  | "archived-current-section-faculty"
  | "archived-current-coordinator"
  | "archived-former-section-faculty"
  | "archived-former-coordinator"
  | "fallback-administrator"
  | "historical-read-only"
  | "no-authorizing-role"
  | "unknown-section"
  | "invalid-scope"
  | "current-coordinator-required"
  | "archived-structure-frozen"
  | "archived-provisioning-prohibited"
  | "archived-student-repository-mutation-prohibited"
  | "invalid-operation";

export interface ArchivedAuthorizationDecision extends Omit<AuthorizationDecision, "basis"> {
  readonly basis: ArchivedAuthorizationBasis;
}
export interface ArchivedOperationDecision extends ArchivedAuthorizationDecision {
  readonly operation: ArchivedSectionOperation | ArchivedStructuralOperation;
}
export interface ArchivedSectionScope {
  readonly visibleSectionIds: readonly string[];
  /** The same scope permits dispatch, grading/regrading and publication/republication only. */
  readonly gradableSectionIds: readonly string[];
  readonly historicalReadOnlySectionIds: readonly string[];
}

const roleBases: Record<AuthorizationBasis, ArchivedAuthorizationBasis> = {
  "current-section-faculty": "archived-current-section-faculty",
  "current-coordinator": "archived-current-coordinator",
  "former-section-faculty": "archived-former-section-faculty",
  "former-coordinator": "archived-former-coordinator",
  "fallback-administrator": "fallback-administrator",
  "historical-read-only": "historical-read-only",
  "no-authorizing-role": "no-authorizing-role",
  "unknown-section": "unknown-section",
  "invalid-scope": "invalid-scope",
  "current-coordinator-required": "current-coordinator-required"
};
const decision = (
  allowed: boolean,
  basis: ArchivedAuthorizationBasis,
  effectiveScope: AuthorizationDecision["effectiveScope"] = "none"
): ArchivedAuthorizationDecision => Object.freeze({ allowed, basis, effectiveScope });
const fromRoleDecision = (source: AuthorizationDecision): ArchivedAuthorizationDecision =>
  decision(source.allowed, roleBases[source.basis], source.effectiveScope);
const forOperation = (
  operation: ArchivedSectionOperation | ArchivedStructuralOperation,
  source: ArchivedAuthorizationDecision
): ArchivedOperationDecision => Object.freeze({ ...source, operation });
const isStructuralOperation = (operation: unknown): operation is ArchivedStructuralOperation =>
  ARCHIVED_STRUCTURAL_OPERATIONS.some((value) => value === operation);

/**
 * Archived-only v2 domain policy, with no I/O or production wiring. Caller supplies the
 * complete trusted term set and proves course/source/session authenticity externally.
 * Current Archived roles mean normal completion; former roles mean explicit removal.
 * GitHub write/admin access is never an authorization input.
 */
export class ArchivedTermAuthorizationResolver {
  readonly roleFacts: AuthorizationRoleFacts;
  private readonly roles: AuthorizationResolver;
  private readonly fallbackAdministrator: boolean;

  constructor(
    courseInput: RawCourseConfigV2,
    terms: readonly RawTermConfigV2[],
    targetTermCode: string,
    authenticatedGithubUserId: number
  ) {
    const course = rawCourseConfigV2Schema.parse(courseInput);
    const lifecycle = new CourseTermLifecycle(terms);
    const target = lifecycle.getTerm(targetTermCode);
    if (!target) throw new Error("Archived authorization target term was not found.");
    if (target.term.status !== "archived")
      throw new Error("Archived authorization requires an Archived target term.");
    // Validate every supplied term's role references and current-coordinator invariant.
    const roles = new Map(
      terms.map((term) => [
        term.term.code,
        new AuthorizationResolver(
          course,
          rawTermConfigV2Schema.parse(lifecycle.getTerm(term.term.code)),
          authenticatedGithubUserId
        )
      ])
    );
    const selected = roles.get(targetTermCode);
    if (!selected) throw new Error("Incomplete Archived authorization context.");
    this.roles = selected;
    this.roleFacts = selected.roleFacts;
    this.fallbackAdministrator = new FallbackAdministrator(course).isFallbackAdministrator(
      authenticatedGithubUserId
    );
  }

  canViewArchivedTerm(): ArchivedAuthorizationDecision {
    const native = this.roles.canViewTerm();
    return native.allowed
      ? fromRoleDecision(native)
      : this.fallbackAdministrator
        ? decision(true, "fallback-administrator", "term-metadata")
        : fromRoleDecision(native);
  }

  /** Closed operation categories keep historical reads separate from permitted late work. */
  canPerformArchivedSectionOperation(
    operation: ArchivedSectionOperation,
    sectionId: string,
    scope: AuthorizationScope = "default"
  ): ArchivedOperationDecision {
    const inspection = this.roles.canViewSection(sectionId, scope);
    if (inspection.basis === "unknown-section" || inspection.basis === "invalid-scope") {
      return forOperation(operation, fromRoleDecision(inspection));
    }
    switch (operation) {
      case "inspect":
        return forOperation(operation, fromRoleDecision(inspection));
      case "grading-dispatch":
      case "grading":
      case "report-publication":
        return forOperation(
          operation,
          fromRoleDecision(this.roles.canMutateSection(sectionId, scope))
        );
      case "apply":
        return forOperation(operation, decision(false, "archived-provisioning-prohibited"));
      case "student-repository-mutation":
        return forOperation(
          operation,
          decision(false, "archived-student-repository-mutation-prohibited")
        );
      default:
        return forOperation(operation, decision(false, "invalid-operation"));
    }
  }

  getArchivedSectionScope(scope: AuthorizationScope = "default"): ArchivedSectionScope {
    const roleScope = this.roles.getSectionScope(scope);
    return Object.freeze({
      visibleSectionIds: roleScope.visibleSectionIds,
      gradableSectionIds: roleScope.mutableSectionIds,
      historicalReadOnlySectionIds: roleScope.historicalReadOnlySectionIds
    });
  }

  /** Ordinary structural workflows remain frozen, including for coordinators and fallback. */
  canEditArchivedStructure(operation: ArchivedStructuralOperation): ArchivedOperationDecision {
    return forOperation(
      operation,
      decision(
        false,
        isStructuralOperation(operation) ? "archived-structure-frozen" : "invalid-operation"
      )
    );
  }

  /** Explicit corrective path only: no student visibility, grading, provisioning or reactivation is implied. */
  canPerformArchivedAdministrativeCorrection(
    operation: ArchivedStructuralOperation
  ): ArchivedOperationDecision {
    if (!isStructuralOperation(operation))
      return forOperation(operation, decision(false, "invalid-operation"));
    if (this.roleFacts.currentCoordinator)
      return forOperation(operation, decision(true, "archived-current-coordinator", "term"));
    if (this.fallbackAdministrator)
      return forOperation(operation, decision(true, "fallback-administrator", "course-recovery"));
    return forOperation(operation, decision(false, "current-coordinator-required"));
  }
}
