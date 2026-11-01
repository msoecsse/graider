import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { FallbackAdministrator } from "./fallback-administrator.js";
import { SectionFaculty } from "./section-faculty.js";
import { TermCoordinators } from "./term-coordinators.js";

export type AuthorizationScope = "default" | "coordinator-term";

/** Independent identity facts, never inferred from logins or other roles. */
export interface AuthorizationRoleFacts {
  readonly githubUserId: number;
  readonly termCode: string;
  readonly fallbackAdministrator: boolean;
  readonly currentCoordinator: boolean;
  readonly formerCoordinator: boolean;
  readonly currentFacultySectionIds: readonly string[];
  readonly formerFacultySectionIds: readonly string[];
}

export type AuthorizationBasis =
  | "current-section-faculty"
  | "former-section-faculty"
  | "current-coordinator"
  | "former-coordinator"
  | "fallback-administrator"
  | "unknown-section"
  | "invalid-scope"
  | "current-coordinator-required"
  | "historical-read-only"
  | "no-authorizing-role";

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly basis: AuthorizationBasis;
  readonly effectiveScope: "none" | "section" | "term" | "term-metadata" | "course-recovery";
}

export interface AuthorizedSectionScope {
  readonly visibleSectionIds: readonly string[];
  readonly mutableSectionIds: readonly string[];
  /** Effective read-only scope, excluding sections independently mutable via a current role. */
  readonly historicalReadOnlySectionIds: readonly string[];
}

const decision = (
  allowed: boolean,
  basis: AuthorizationBasis,
  effectiveScope: AuthorizationDecision["effectiveScope"] = "none"
): AuthorizationDecision => Object.freeze({ allowed, basis, effectiveScope });

/**
 * V2 domain policy only; not wired into operational v1 services.
 * Callers must supply a trusted authenticated GitHub user ID and selected course/term state.
 * This will become the shared authorization boundary on v2 activation; session/repository/
 * source-revision checks remain the responsibility of Electron's outer trust boundary.
 */
export class AuthorizationResolver {
  readonly roleFacts: AuthorizationRoleFacts;
  private readonly sectionIds: readonly string[];

  constructor(course: RawCourseConfigV2, term: RawTermConfigV2, authenticatedGithubUserId: number) {
    const courseSnapshot = rawCourseConfigV2Schema.parse(course);
    const termSnapshot = rawTermConfigV2Schema.parse(term);
    const fallback = new FallbackAdministrator(courseSnapshot);
    const coordinators = new TermCoordinators(courseSnapshot, termSnapshot);
    this.sectionIds = Object.freeze(termSnapshot.sections.map((section) => section.id));
    const sections = this.sectionIds.map((id) => ({
      id,
      faculty: new SectionFaculty(courseSnapshot, termSnapshot, id)
    }));
    this.roleFacts = Object.freeze({
      githubUserId: authenticatedGithubUserId,
      termCode: termSnapshot.term.code,
      fallbackAdministrator: fallback.isFallbackAdministrator(authenticatedGithubUserId),
      currentCoordinator: coordinators.isCurrentCoordinator(authenticatedGithubUserId),
      formerCoordinator: coordinators.isFormerCoordinator(authenticatedGithubUserId),
      currentFacultySectionIds: Object.freeze(
        sections
          .filter(({ faculty }) => faculty.isCurrentFaculty(authenticatedGithubUserId))
          .map(({ id }) => id)
      ),
      formerFacultySectionIds: Object.freeze(
        sections
          .filter(({ faculty }) => faculty.isFormerFaculty(authenticatedGithubUserId))
          .map(({ id }) => id)
      )
    });
  }

  /** Term context/metadata visibility does not imply access to every section. */
  canViewTerm(): AuthorizationDecision {
    const facts = this.roleFacts;
    if (facts.currentCoordinator) return decision(true, "current-coordinator", "term-metadata");
    if (facts.formerCoordinator) return decision(true, "former-coordinator", "term-metadata");
    if (facts.currentFacultySectionIds.length)
      return decision(true, "current-section-faculty", "term-metadata");
    if (facts.formerFacultySectionIds.length)
      return decision(true, "former-section-faculty", "term-metadata");
    return decision(false, "no-authorizing-role");
  }

  canViewSection(sectionId: string, scope: AuthorizationScope = "default"): AuthorizationDecision {
    const denied = this.checkSectionRequest(sectionId, scope);
    if (denied) return denied;
    const facts = this.roleFacts;
    if (scope === "coordinator-term") return decision(true, "current-coordinator", "term");
    if (facts.currentFacultySectionIds.includes(sectionId))
      return decision(true, "current-section-faculty", "section");
    if (facts.formerFacultySectionIds.includes(sectionId))
      return decision(true, "former-section-faculty", "section");
    if (facts.formerCoordinator) return decision(true, "former-coordinator", "term");
    return decision(false, "no-authorizing-role");
  }

  canMutateSection(
    sectionId: string,
    scope: AuthorizationScope = "default"
  ): AuthorizationDecision {
    const denied = this.checkSectionRequest(sectionId, scope);
    if (denied) return denied;
    if (scope === "coordinator-term") return decision(true, "current-coordinator", "term");
    if (this.roleFacts.currentFacultySectionIds.includes(sectionId))
      return decision(true, "current-section-faculty", "section");
    if (
      this.roleFacts.formerCoordinator ||
      this.roleFacts.formerFacultySectionIds.includes(sectionId)
    )
      return decision(false, "historical-read-only");
    return decision(false, "no-authorizing-role");
  }

  /** Coordinator-level structure/faculty management; no lifecycle operations are implied. */
  canManageTermStructure(): AuthorizationDecision {
    return this.roleFacts.currentCoordinator
      ? decision(true, "current-coordinator", "term")
      : decision(false, "current-coordinator-required");
  }

  hasFallbackAdministration(): AuthorizationDecision {
    return this.roleFacts.fallbackAdministrator
      ? decision(true, "fallback-administrator", "course-recovery")
      : decision(false, "no-authorizing-role");
  }

  getSectionScope(scope: AuthorizationScope = "default"): AuthorizedSectionScope {
    const visibleSectionIds = this.sectionIds.filter(
      (id) => this.canViewSection(id, scope).allowed
    );
    const mutableSectionIds = this.sectionIds.filter(
      (id) => this.canMutateSection(id, scope).allowed
    );
    return Object.freeze({
      visibleSectionIds: Object.freeze(visibleSectionIds),
      mutableSectionIds: Object.freeze(mutableSectionIds),
      historicalReadOnlySectionIds: Object.freeze(
        visibleSectionIds.filter((id) => !mutableSectionIds.includes(id))
      )
    });
  }

  private checkSectionRequest(
    sectionId: string,
    scope: unknown
  ): AuthorizationDecision | undefined {
    if (!this.sectionIds.includes(sectionId)) return decision(false, "unknown-section");
    if (scope !== "default" && scope !== "coordinator-term")
      return decision(false, "invalid-scope");
    if (scope === "coordinator-term" && !this.roleFacts.currentCoordinator)
      return decision(false, "current-coordinator-required");
    return undefined;
  }
}
