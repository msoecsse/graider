import type { GitHubPermission } from "../github/github-models.js";
import type { AssignmentMigrationPlan } from "./assignment-migration-models.js";
import type { GraderAccessReview } from "./grader-access-review.js";
import type { LegacyGraderInventory } from "./legacy-grader-models.js";
import type { CourseMigrationAnalysis, Immutable } from "./migration-models.js";
import type { MigrationReviewResult, MigrationReviewSource } from "./migration-review-models.js";

export interface GraderRemovalPlanData {
  kind: "schema-v1-grader-removal-plan";
  status: "ready" | "needs_attention" | "blocked" | "not_applicable";
  publicationReady: false;
  source: MigrationReviewSource;
  /** Instructions for the separate v2 candidate only; never edits to source files. */
  persistedCleanup: null | {
    courseFields: ["grader_team", "grader_permission"];
    manifestPermissionFields: ["grader_team"];
    desiredAuthorizationRole: "faculty_only";
  };
  facultyTerms: MigrationReviewResult["terms"];
  findings: Array<{
    code: "binding_invalid" | "review_not_authorized" | "identity_invalid" | "resource_unverified";
    message: string;
  }>;
  reconciliation: {
    phase: "after_publication";
    deleteTeam: false;
    deleteMemberships: false;
    grants: Array<{
      organizationId: number;
      teamId: number;
      repositoryId: number;
      observedPermission: GitHubPermission;
      requires: "published_v2_and_verified_managed_replacement_access";
      /** Verify the published faculty/coordinator/fallback policy for this exact repository.
       * Establish all replacement grants and confirm effective access before removal.
       * A failed/ambiguous verification must leave the legacy grant untouched.
       */
      replacement: {
        facultyDirectory: MigrationReviewResult["facultyDirectory"];
        terms: MigrationReviewResult["terms"];
        fallbackAdministratorGithubUserId: number | null;
        memberDecisions: GraderAccessReview["decisions"];
      };
    }>;
  };
  /** Historical evidence only. Never feed this branch into desired-state execution. */
  audit: {
    evidence: CourseMigrationAnalysis["grader"]["evidence"];
    inventory: LegacyGraderInventory;
    accessReview: GraderAccessReview;
    assignmentPlan: AssignmentMigrationPlan;
  };
}
export type GraderRemovalPlan = Immutable<GraderRemovalPlanData>;
