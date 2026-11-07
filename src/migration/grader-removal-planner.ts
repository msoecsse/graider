import type { AssignmentMigrationPlan } from "./assignment-migration-models.js";
import { planAssignmentMigration } from "./assignment-migration-planner.js";
import { reviewGraderAccess, type GraderAccessReview } from "./grader-access-review.js";
import type { GraderRemovalPlan, GraderRemovalPlanData } from "./grader-removal-models.js";
import type { LegacyGraderInventory } from "./legacy-grader-models.js";
import type { CourseMigrationAnalysis } from "./migration-models.js";
import type { MigrationReviewResult } from "./migration-review-models.js";
import { freeze, stableJson } from "./migration-evidence.js";
import { positiveId } from "../github/repository-team-permission-boundary.js";

const same = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);
const validKind = (value: { readonly kind: unknown }, kind: string): boolean => value.kind === kind;
const unpublished = (value: { readonly publicationReady: unknown }): boolean =>
  value.publicationReady === false;
/** Trusted backend objects only, retained by the review service. The caller must recheck
 * freshness/authority through getCompleted()/getCompletedGrader(); IPC supplies no inputs.
 * This pure projection grants neither publication nor GitHub execution authority.
 */
export const planGraderRemoval = (
  analysis: CourseMigrationAnalysis,
  review: MigrationReviewResult,
  assignmentPlan: AssignmentMigrationPlan,
  inventory: LegacyGraderInventory,
  access: GraderAccessReview
): GraderRemovalPlan => {
  const plan: GraderRemovalPlanData = {
    kind: "schema-v1-grader-removal-plan",
    status: "ready",
    publicationReady: false,
    source: review.source,
    persistedCleanup: null,
    facultyTerms: [],
    findings: [],
    reconciliation: {
      phase: "after_publication",
      deleteTeam: false,
      deleteMemberships: false,
      grants: []
    },
    audit: { evidence: analysis.grader.evidence, inventory, accessReview: access, assignmentPlan }
  };
  const finish = (): GraderRemovalPlan => freeze(structuredClone(plan));
  const block = (
    code: GraderRemovalPlanData["findings"][number]["code"],
    message: string
  ): GraderRemovalPlan => {
    plan.status = "blocked";
    plan.findings.push({ code, message });
    return finish();
  };
  const expectedSource = { ...analysis.source, reportId: analysis.reportId };
  if (
    Object.entries(review.source).some(
      ([key, value]) => expectedSource[key as keyof typeof expectedSource] !== value
    ) ||
    !same(inventory.source, expectedSource) ||
    !same(access.source, inventory.source) ||
    !same(assignmentPlan, planAssignmentMigration(analysis, review)) ||
    !same(
      access,
      reviewGraderAccess(
        {
          inventoryId: access.inventoryId,
          inventory: structuredClone(inventory),
          review: structuredClone(review)
        },
        { inventoryId: access.inventoryId, decisions: access.decisions }
      )
    ) ||
    !same(
      [...inventory.evidence].map(stableJson).sort(),
      [...analysis.grader.evidence].map(stableJson).sort()
    )
  )
    return block(
      "binding_invalid",
      "Inputs do not match the exact retained analysis, review, assignment plan and inventory."
    );
  if (analysis.status === "not_applicable" && review.status === "not_applicable") {
    plan.status = "not_applicable";
    return finish();
  }
  if (
    !validKind(analysis, "schema-v1-migration-analysis") ||
    !analysis.validatedMigrationFacts ||
    analysis.status === "blocked" ||
    !validKind(review, "schema-v1-migration-review") ||
    !unpublished(review) ||
    review.status !== "complete" ||
    !validKind(inventory, "schema-v1-legacy-grader-inventory") ||
    !unpublished(inventory) ||
    inventory.status === "blocked" ||
    access.status !== "complete" ||
    assignmentPlan.status === "blocked"
  )
    return block(
      "review_not_authorized",
      "Completed trusted reviews and valid planning inputs are required."
    );
  const directoryIds = review.facultyDirectory.map((f) => f.github_user_id);
  const validTerms =
    review.terms.length === analysis.terms.length &&
    new Set(review.terms.map((t) => t.termCode)).size === review.terms.length &&
    review.terms.every((t) => {
      const source = analysis.terms.find((s) => s.code === t.termCode);
      return (
        source &&
        t.sections.length === source.sections.length &&
        new Set(t.sections.map((s) => s.sectionId)).size === t.sections.length &&
        t.sections.every(
          (s) =>
            source.sections.some((v) => v.id === s.sectionId) &&
            s.currentFacultyGithubUserIds !== null &&
            new Set(s.currentFacultyGithubUserIds).size === s.currentFacultyGithubUserIds.length &&
            s.currentFacultyGithubUserIds.every((id) => directoryIds.includes(id))
        ) &&
        t.currentCoordinatorGithubUserIds.every((id) => directoryIds.includes(id))
      );
    });
  if (
    !validTerms ||
    directoryIds.some((id) => !positiveId(id)) ||
    new Set(directoryIds).size !== directoryIds.length ||
    !directoryIds.includes(review.fallbackAdministratorGithubUserId ?? 0)
  )
    return block(
      "identity_invalid",
      "Faculty, term and section references must match exact reviewed records."
    );
  plan.persistedCleanup = {
    courseFields: ["grader_team", "grader_permission"],
    manifestPermissionFields: ["grader_team"],
    desiredAuthorizationRole: "faculty_only"
  };
  plan.facultyTerms = access.terms;
  const candidate = inventory.candidate;
  const resourceSafe =
    inventory.findings.length === 0 &&
    (inventory.status === "ready" || inventory.status === "not_applicable") &&
    analysis.organization.value === "organization_reconciled";
  if (
    !resourceSafe ||
    (candidate !== null &&
      (!positiveId(candidate.teamId) ||
        candidate.organizationId !== analysis.source.organizationId))
  ) {
    plan.status = "needs_attention";
    plan.findings.push({
      code: "resource_unverified",
      message:
        "Legacy resource identity, ownership or completeness remains unresolved; no grants are targeted."
    });
    return finish();
  }
  if (candidate !== null && positiveId(candidate.teamId)) {
    for (const repository of inventory.repositories) {
      const sourceOwned = repository.evidence.some(
        (e) =>
          e.repositoryId === repository.repositoryId &&
          ((e.provenance === "course-config" && e.repositoryId === analysis.source.repositoryId) ||
            (e.provenance === "source" &&
              [
                ...analysis.assignments.flatMap((a) => a.manifests),
                ...analysis.unassignedManifests
              ].some(
                (m) =>
                  m.provenance === "source" &&
                  m.state === "loaded" &&
                  m.classification === "derived" &&
                  m.location === e.location &&
                  m.repositories.some(
                    (r) =>
                      r.repositoryId === e.repositoryId && r.repositoryName === e.repositoryName
                  )
              )))
      );
      if (
        !sourceOwned ||
        !repository.associationsComplete ||
        !positiveId(repository.repositoryId) ||
        repository.owner?.toLowerCase() !== analysis.source.organizationLogin.toLowerCase() ||
        !repository.name
      ) {
        plan.status = "needs_attention";
        plan.findings.push({
          code: "resource_unverified",
          message: `Repository ${String(repository.repositoryId)} lacks complete verified ownership/grants.`
        });
      } else {
        for (const grant of repository.associations.filter(
          (g) => g.teamId === candidate.teamId && g.legacyCandidate && g.slug === candidate.slug
        ))
          plan.reconciliation.grants.push({
            organizationId: candidate.organizationId,
            teamId: grant.teamId,
            repositoryId: repository.repositoryId,
            observedPermission: grant.permission,
            requires: "published_v2_and_verified_managed_replacement_access",
            replacement: {
              facultyDirectory: access.facultyDirectory,
              terms: access.terms,
              fallbackAdministratorGithubUserId: review.fallbackAdministratorGithubUserId,
              memberDecisions: access.decisions
            }
          });
      }
    }
  }
  return finish();
};
