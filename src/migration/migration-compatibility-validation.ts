import { z } from "zod";
import {
  MIGRATION_RELEASE_REQUIREMENTS,
  MIGRATION_SAFEGUARDS,
  type MigrationPublicationContext,
  type MigrationPublicationResultData
} from "./migration-publication-models.js";
import { stableJson } from "./migration-evidence.js";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const publicationBindingSchema = z
  .object({
    repositoryId: id,
    organizationId: id,
    authenticatedGithubUserId: id,
    sourceCommitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
    reportId: digest,
    reviewId: digest,
    assignmentPlanId: digest,
    graderRemovalPlanId: digest,
    candidateFingerprint: digest,
    sessionId: z.string().min(1),
    completionId: z.string().min(1),
    generation: z.number().int().nonnegative()
  })
  .strict();
const evidenceSchema = z
  .object({
    scope: z.literal("synthetic"),
    observationId: z.string().min(1),
    binding: publicationBindingSchema,
    operationalSchema: z.number().int().nullable(),
    safeguards: z.strictObject(
      Object.fromEntries(MIGRATION_SAFEGUARDS.map((key) => [key, z.boolean().nullable()]))
    ),
    acknowledgement: z
      .object({
        binding: publicationBindingSchema,
        githubUserId: id,
        consequence: z.literal("incompatible-clients-lose-access-until-update")
      })
      .strict()
      .nullable(),
    releases: z.strictObject(
      Object.fromEntries(
        MIGRATION_RELEASE_REQUIREMENTS.map((key) => [
          key,
          z.enum(["verified", "unknown", "unavailable"])
        ])
      )
    )
  })
  .strict();

/** Only evaluates supplied observations. Synthetic observations can exercise the model
 * but never assert production availability. No production verifier/provider is invented. */
export const validateMigrationCompatibility = (
  context: MigrationPublicationContext,
  result: MigrationPublicationResultData
): void => {
  const add = (
    code: MigrationPublicationResultData["blockers"][number]["code"],
    location: string,
    action: string
  ): void => {
    result.blockers.push({ code, location, action });
  };
  const evidence = context.compatibility;
  const parsed = evidenceSchema.safeParse(evidence);
  const usable = context.environment === "synthetic" && parsed.success;
  if (evidence === undefined) {
    add(
      "compatibility_missing",
      "compatibility",
      "Obtain trusted operational Schema v2 and fail-closed evidence after #22/#23; parser support and version strings are insufficient."
    );
  } else if (!usable) {
    add(
      "compatibility_untrusted",
      "compatibility",
      "Use backend-retained evidence. Synthetic/renderer/serialized assertions cannot establish production readiness."
    );
  } else if (
    stableJson(evidence.binding) !== stableJson(context.binding) ||
    stableJson(evidence.binding) !== stableJson(context.current) ||
    evidence.observationId !== context.observationId
  ) {
    add(
      "compatibility_stale",
      "compatibility",
      "Reobserve compatibility for this exact current account, session, review and candidate."
    );
  } else {
    if (evidence.operationalSchema === null)
      add(
        "operational_support_unknown",
        "initiating-client",
        "Establish full operational Schema v2 support; parsing alone is insufficient."
      );
    else if (evidence.operationalSchema !== 2)
      add(
        "operational_support_incompatible",
        "initiating-client",
        "Complete the operational Schema v2 cutover (#22/#23) before enabling migration."
      );
    else result.compatibility.operationalSupport = "verified";
    for (const key of MIGRATION_SAFEGUARDS)
      if (evidence.safeguards[key] !== true)
        add(
          "safeguard_unproven",
          key,
          "Verify fail-closed access and every managed/legacy mutation route, including authoritative revision checks, stale caches, overwrite and downgrade refusal (#22/#23)."
        );
    if (MIGRATION_SAFEGUARDS.every((key) => evidence.safeguards[key] === true))
      result.compatibility.safeguards = "verified";
    const ack = evidence.acknowledgement;
    if (
      !ack ||
      !context.authorizedFaculty ||
      ack.githubUserId !== context.binding.authenticatedGithubUserId ||
      stableJson(ack.binding) !== stableJson(context.binding)
    )
      add(
        "acknowledgement_invalid",
        "acknowledgement",
        "Obtain and retain current authorized faculty acknowledgement of incompatible-client access loss for this exact reviewed migration (#25)."
      );
    else result.compatibility.acknowledgement = "verified";
    result.compatibility.evidenceScope = "synthetic";
    if (MIGRATION_RELEASE_REQUIREMENTS.every((key) => evidence.releases[key] === "verified"))
      result.productionEnablement.releaseAvailability = "verified";
  }
  for (const key of MIGRATION_RELEASE_REQUIREMENTS)
    if (
      !usable ||
      evidence?.releases[key] !== "verified" ||
      result.compatibility.evidenceScope !== "synthetic"
    )
      result.productionEnablement.blockers.push({
        code: "production_release_unproven",
        location: key,
        action:
          "Verify compatible macOS arm64 and Windows x64 production releases and Phase 3 signing/distribution/update prerequisites. Preview artifacts and development tests are insufficient."
      });
  result.productionEnablement.blockers.push({
    code:
      context.environment === "synthetic"
        ? "synthetic_evidence"
        : "production_evidence_unavailable",
    location: "production",
    action:
      "Production migration remains disabled. Trusted operational safeguards (#22/#23), faculty acknowledgement (#25) and Phase 3 release evidence must be composed and revalidated at publication (#21); no production evidence provider is installed."
  });
};
