import { z } from "zod";
import { rawCourseConfigV2Schema } from "../config/config-schemas.js";
import type { GraderRemovalPlan } from "./grader-removal-models.js";
import { graderAccessSubmissionSchema } from "./grader-access-review.js";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1);
const permission = z.enum(["none", "pull", "triage", "push", "maintain", "admin"]);
const status = z.enum(["ready", "needs_attention", "blocked", "not_applicable"]);
const source = z
  .object({
    repositoryId: id,
    sourceCommitSha: text,
    reportId: text,
    authenticatedGithubUserId: id,
    organizationId: id.optional(),
    historicalOrganizationId: id.optional(),
    historicalRepositoryId: id.optional(),
    organizationLogin: text,
    repositoryName: text
  })
  .strict();
const terms = z.array(
  z
    .object({
      termCode: text,
      currentCoordinatorGithubUserIds: z.array(id),
      status: z.enum(["draft", "active", "archived"]).nullable(),
      hasEverBeenActive: z.boolean().nullable(),
      sections: z.array(
        z.object({ sectionId: text, currentFacultyGithubUserIds: z.array(id).nullable() }).strict()
      )
    })
    .strict()
);
const directory = rawCourseConfigV2Schema.shape.faculty_directory;
const decisions = graderAccessSubmissionSchema.shape.decisions;
const replacement = z
  .object({
    facultyDirectory: directory,
    terms,
    fallbackAdministratorGithubUserId: id.nullable(),
    memberDecisions: decisions
  })
  .strict();

/** Small persisted intent/evidence projection. It contains no local bytes, credentials or live approval. */
export const legacyRecoveryPlanSchema = z
  .object({
    status,
    source,
    persistedCleanup: z
      .object({
        courseFields: z.tuple([z.literal("grader_team"), z.literal("grader_permission")]),
        manifestPermissionFields: z.tuple([z.literal("grader_team")]),
        desiredAuthorizationRole: z.literal("faculty_only")
      })
      .strict()
      .nullable(),
    facultyTerms: terms,
    reconciliation: z
      .object({
        phase: z.literal("after_publication"),
        deleteTeam: z.literal(false),
        deleteMemberships: z.literal(false),
        grants: z.array(
          z
            .object({
              organizationId: id,
              teamId: id,
              repositoryId: id,
              observedPermission: permission,
              requires: z.literal("published_v2_and_verified_managed_replacement_access"),
              replacement
            })
            .strict()
        )
      })
      .strict(),
    audit: z
      .object({
        inventory: z
          .object({
            status,
            source,
            candidate: z
              .object({
                classification: z.literal("legacy_candidate"),
                organizationId: id,
                organizationLogin: text,
                slug: text,
                teamId: id.nullable(),
                membershipComplete: z.boolean(),
                members: z.array(z.object({ id, login: text }).strict())
              })
              .strict()
              .nullable(),
            repositories: z.array(
              z
                .object({
                  repositoryId: id,
                  owner: text.nullable(),
                  name: text.nullable(),
                  associationsComplete: z.boolean(),
                  associations: z.array(
                    z
                      .object({
                        teamId: id,
                        slug: text,
                        permission,
                        parentId: id.nullable(),
                        legacyCandidate: z.boolean()
                      })
                      .strict()
                  )
                })
                .strict()
            ),
            findings: z.array(
              z
                .object({
                  code: text,
                  classification: z.enum(["unresolved", "blocking"]),
                  location: text
                })
                .strict()
            )
          })
          .strict(),
        accessReview: z
          .object({
            status: z.enum(["complete", "blocked", "incomplete"]),
            source,
            facultyDirectory: directory,
            terms,
            decisions
          })
          .strict()
      })
      .strict()
  })
  .strict();
export type LegacyRecoveryPlan = z.infer<typeof legacyRecoveryPlanSchema>;

export const legacyRecoveryPlan = (plan: GraderRemovalPlan): LegacyRecoveryPlan => {
  const inventory = plan.audit.inventory;
  const access = plan.audit.accessReview;
  return legacyRecoveryPlanSchema.parse({
    status: plan.status,
    source: inventory.source,
    persistedCleanup: plan.persistedCleanup,
    facultyTerms: plan.facultyTerms,
    reconciliation: plan.reconciliation,
    audit: {
      inventory: {
        status: inventory.status,
        source: inventory.source,
        candidate: inventory.candidate,
        repositories: inventory.repositories.map(
          ({ repositoryId, owner, name, associationsComplete, associations }) => ({
            repositoryId,
            owner,
            name,
            associationsComplete,
            associations
          })
        ),
        findings: inventory.findings
      },
      accessReview: {
        status: access.status,
        source: access.source,
        facultyDirectory: access.facultyDirectory,
        terms: access.terms,
        decisions: access.decisions
      }
    }
  });
};
