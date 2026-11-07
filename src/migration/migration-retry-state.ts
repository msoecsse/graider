import { z } from "zod";
import { stableJson } from "./migration-evidence.js";
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
export const migrationRetryBindingSchema = z
  .object({
    authenticatedGithubUserId: id,
    repositoryId: id,
    organizationId: id,
    sourceCommitSha: sha,
    reportId: digest,
    reviewId: digest,
    candidateFingerprint: digest,
    checkpointReference: z.string(),
    checkpointCommit: sha
  })
  .strict()
  .refine(
    (binding) =>
      binding.checkpointCommit === binding.sourceCommitSha &&
      binding.checkpointReference === `refs/tags/graider-migration-v1/${binding.sourceCommitSha}`
  );
export const migrationRetryFailureSchema = z.enum([
  "prepublication_failed",
  "validation_failed",
  "checkpoint_unverified"
]);
export const migrationRetryArtifactSchema = z
  .object({
    kind: z.literal("migration-prepublication-retry"),
    version: z.literal(1),
    binding: migrationRetryBindingSchema,
    failure: migrationRetryFailureSchema
  })
  .strict();
export type MigrationRetryBinding = z.infer<typeof migrationRetryBindingSchema>;
export type MigrationRetryArtifact = z.infer<typeof migrationRetryArtifactSchema>;
export type MigrationRetryFailure = z.infer<typeof migrationRetryFailureSchema>;
/** Matching is a necessary check only. A disk record can never prove authority or publication. */
export const matchesMigrationRetryBinding = (
  record: unknown,
  current: MigrationRetryBinding
): boolean => {
  const parsed = migrationRetryArtifactSchema.safeParse(record);
  const trusted = migrationRetryBindingSchema.safeParse(current);
  return (
    parsed.success &&
    trusted.success &&
    stableJson(parsed.data.binding) === stableJson(trusted.data)
  );
};
