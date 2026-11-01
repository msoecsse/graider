import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { CourseTermLifecycle } from "../terms/course-term-lifecycle.js";
import {
  AuthorizationResolver,
  type AuthorizationDecision,
  type AuthorizationRoleFacts,
  type AuthorizationScope
} from "./authorization-resolver.js";
import { FallbackAdministrator } from "./fallback-administrator.js";

export type DraftAuthorizationBasis =
  | "draft-current-section-faculty"
  | "draft-current-coordinator"
  | "active-term-coordinator"
  | "fallback-administrator"
  | "draft-student-facing-operation-prohibited"
  | "former-role-not-authorized"
  | "no-authorizing-role"
  | "current-coordinator-required"
  | "unknown-section"
  | "invalid-scope";

export interface DraftAuthorizationDecision extends Omit<AuthorizationDecision, "basis"> {
  readonly basis: DraftAuthorizationBasis;
}

export const DRAFT_STUDENT_FACING_OPERATIONS = [
  "apply",
  "grading-dispatch",
  "grading",
  "report-publication",
  "student-repository-mutation"
] as const;
export type DraftStudentFacingOperation = (typeof DRAFT_STUDENT_FACING_OPERATIONS)[number];

export interface DraftStudentFacingDecision extends DraftAuthorizationDecision {
  readonly operation: DraftStudentFacingOperation;
}

/** These IDs authorize preparation only, never student-facing execution. */
export interface DraftSectionScope {
  readonly visibleSectionIds: readonly string[];
  readonly preparableSectionIds: readonly string[];
}

const decision = (
  allowed: boolean,
  basis: DraftAuthorizationBasis,
  effectiveScope: AuthorizationDecision["effectiveScope"] = "none"
): DraftAuthorizationDecision => Object.freeze({ allowed, basis, effectiveScope });

/**
 * V2 Draft policy only; no I/O or production v1 wiring. The caller must prove course,
 * source revision and session authenticity and supply the complete trusted term set.
 * Cross-term and fallback authority are overlays, never synthetic Draft role facts.
 */
export class DraftTermAuthorizationResolver {
  readonly roleFacts: AuthorizationRoleFacts;
  private readonly draft: AuthorizationResolver;
  private readonly active: AuthorizationResolver | undefined;
  private readonly fallbackAdministrator: boolean;
  private readonly sectionIds: readonly string[];

  constructor(
    course: RawCourseConfigV2,
    terms: readonly RawTermConfigV2[],
    targetTermCode: string,
    authenticatedGithubUserId: number
  ) {
    const courseSnapshot = rawCourseConfigV2Schema.parse(course);
    const lifecycle = new CourseTermLifecycle(terms);
    const target = lifecycle.getTerm(targetTermCode);
    if (target === undefined) throw new Error("Draft authorization target term was not found.");
    if (target.term.status !== "draft") {
      throw new Error("Draft authorization requires a Draft target term.");
    }
    // Parse frozen lifecycle snapshots into the existing role primitive's input shape.
    this.draft = new AuthorizationResolver(
      courseSnapshot,
      rawTermConfigV2Schema.parse(target),
      authenticatedGithubUserId
    );
    const active = lifecycle.getActiveTerm();
    this.active =
      active === undefined
        ? undefined
        : new AuthorizationResolver(
            courseSnapshot,
            rawTermConfigV2Schema.parse(active),
            authenticatedGithubUserId
          );
    this.fallbackAdministrator = new FallbackAdministrator(courseSnapshot).isFallbackAdministrator(
      authenticatedGithubUserId
    );
    this.roleFacts = this.draft.roleFacts;
    this.sectionIds = Object.freeze(target.sections.map((section) => section.id));
  }

  canViewDraftTerm(): DraftAuthorizationDecision {
    const coordinator = this.coordinatorBasis();
    if (coordinator) return decision(true, coordinator, "term-metadata");
    if (this.roleFacts.currentFacultySectionIds.length) {
      return decision(true, "draft-current-section-faculty", "term-metadata");
    }
    if (this.fallbackAdministrator)
      return decision(true, "fallback-administrator", "term-metadata");
    return decision(false, this.denialBasis());
  }

  canViewDraftSection(
    sectionId: string,
    scope: AuthorizationScope = "default"
  ): DraftAuthorizationDecision {
    // Drafts have no former-role read-only scope; visibility and preparation share current-role scope.
    return this.canPrepareDraftSection(sectionId, scope);
  }

  canPrepareDraftSection(
    sectionId: string,
    scope: AuthorizationScope = "default"
  ): DraftAuthorizationDecision {
    const denied = this.checkSectionRequest(sectionId, scope);
    if (denied) return denied;
    if (scope === "coordinator-term") {
      const coordinator = this.coordinatorBasis();
      return coordinator
        ? decision(true, coordinator, "term")
        : decision(
            false,
            this.denialBasis(sectionId) === "former-role-not-authorized"
              ? "former-role-not-authorized"
              : "current-coordinator-required"
          );
    }
    if (this.draft.canMutateSection(sectionId).allowed) {
      return decision(true, "draft-current-section-faculty", "section");
    }
    return decision(false, this.denialBasis(sectionId));
  }

  getDraftSectionScope(scope: AuthorizationScope = "default"): DraftSectionScope {
    return Object.freeze({
      visibleSectionIds: Object.freeze(
        this.sectionIds.filter((id) => this.canViewDraftSection(id, scope).allowed)
      ),
      preparableSectionIds: Object.freeze(
        this.sectionIds.filter((id) => this.canPrepareDraftSection(id, scope).allowed)
      )
    });
  }

  canManageDraftStructure(): DraftAuthorizationDecision {
    const coordinator = this.coordinatorBasis();
    return coordinator ? decision(true, coordinator, "term") : decision(false, this.denialBasis());
  }

  /** Handoff/setup recovery only. This does not grant ordinary structure or section access. */
  canManageDraftCoordinatorSetup(): DraftAuthorizationDecision {
    if (this.fallbackAdministrator)
      return decision(true, "fallback-administrator", "course-recovery");
    if (this.active?.roleFacts.currentCoordinator)
      return decision(true, "active-term-coordinator", "term");
    return decision(false, this.denialBasis());
  }

  /** Apply includes provisioning. Every category is denied even for coordinators/fallback. */
  canPerformStudentFacingOperation(
    operation: DraftStudentFacingOperation
  ): DraftStudentFacingDecision {
    return Object.freeze({
      ...decision(false, "draft-student-facing-operation-prohibited"),
      operation
    });
  }

  private coordinatorBasis(): "draft-current-coordinator" | "active-term-coordinator" | undefined {
    if (this.roleFacts.currentCoordinator) return "draft-current-coordinator";
    if (this.active?.roleFacts.currentCoordinator) return "active-term-coordinator";
    return undefined;
  }

  private checkSectionRequest(
    sectionId: string,
    scope: unknown
  ): DraftAuthorizationDecision | undefined {
    if (!this.sectionIds.includes(sectionId)) return decision(false, "unknown-section");
    if (scope !== "default" && scope !== "coordinator-term")
      return decision(false, "invalid-scope");
    return undefined;
  }

  private denialBasis(sectionId?: string): "former-role-not-authorized" | "no-authorizing-role" {
    const facts = this.roleFacts;
    const formerFaculty =
      sectionId === undefined
        ? facts.formerFacultySectionIds.length > 0
        : facts.formerFacultySectionIds.includes(sectionId);
    return facts.formerCoordinator || formerFaculty || this.active?.roleFacts.formerCoordinator
      ? "former-role-not-authorized"
      : "no-authorizing-role";
  }
}
