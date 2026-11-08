import { z } from "zod";
import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { CourseLifecycleAuthorizationResolver } from "../faculty/course-lifecycle-authorization-resolver.js";
import type { TrustedStudentRepositoryTarget } from "../github/student-repository-target.js";
import { migrationMetadataSchema } from "./migration-candidate-schemas.js";
import { fingerprint, stableJson } from "./migration-evidence.js";

export const RECONCILIATION_PATH = ".graider/reconciliation.json";
const MAX_GUARD_KEY_LENGTH = 4096;
export const reconciliationValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error("Required reconciliation evidence is unavailable.");
  return value;
};
export const RECONCILIATION_STEPS = [
  "organization_access",
  "teams",
  "course_access",
  "student_access",
  "branches",
  "legacy_cleanup",
  "targets"
] as const;
export class ReconciliationNeedsAttention extends Error {
  constructor(
    readonly reason:
      | "fresh_plan_required"
      | "authorization_required"
      | "checkpoint_unverified"
      | "journal_revision_changed"
      | "journal_binding_invalid"
      | "journal_outcome_unknown"
  ) {
    super(`Reconciliation needs attention: ${reason}`);
  }
}
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sha = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const code = z.string().regex(/^[a-z][a-z0-9_:-]*$/u);
const binding = z
  .object({
    repositoryId: id,
    organizationId: id,
    source: sha,
    checkpoint: z.string().regex(/^refs\/tags\/graider-migration-v1\/[a-f0-9]+$/u),
    publication: sha,
    intendedFingerprint: digest,
    version: z.literal(1)
  })
  .strict();
const resource = z
  .object({
    repositoryId: id.optional(),
    teamId: id.optional(),
    githubUserId: id.optional(),
    status: z.enum(["verified", "needs_attention"]),
    reason: code.optional()
  })
  .strict();
const step = z
  .object({
    step: code,
    status: z.enum(["verified", "needs_attention", "outcome_unknown"]),
    reasons: z.array(code),
    resources: z.array(resource)
  })
  .strict();
const guard = z
  .object({
    kind: z.enum(["invitation", "team", "branch"]),
    key: z.string().min(1).max(MAX_GUARD_KEY_LENGTH),
    actor: id
  })
  .strict();
const event = z
  .object({
    actor: id,
    observedRevision: sha,
    step: code,
    status: z.enum(["verified", "needs_attention", "outcome_unknown", "guarded", "resolved"]),
    reasons: z.array(code),
    resources: z.array(resource).optional()
  })
  .strict();
export const reconciliationRecordSchema = z
  .object({
    schema_version: z.literal(1),
    binding,
    reviewDigest: digest,
    status: z.enum(["ready", "needs_attention"]),
    guards: z.array(guard),
    steps: z.array(step),
    history: z.array(event),
    writeId: z.string().min(1)
  })
  .strict();
export type ReconciliationRecord = z.infer<typeof reconciliationRecordSchema>;
/** Constructed only from fresh authenticated Git objects by the main-owned store. */
export interface ReconciliationSnapshot {
  revision: string;
  publication: string;
  source: string;
  checkpoint: string;
  intendedFingerprint: string;
  course: RawCourseConfigV2;
  terms: RawTermConfigV2[];
  metadata: z.infer<typeof migrationMetadataSchema>;
  targets: readonly TrustedStudentRepositoryTarget[];
  targetAttention: readonly string[];
  record: ReconciliationRecord | null;
}
/** Dedicated #31 recovery capability; reuse role derivation, not archive lifecycle guards. */
export const canRecoverMigration = (
  course: RawCourseConfigV2,
  terms: readonly RawTermConfigV2[],
  actor: number
): boolean => {
  try {
    return new CourseLifecycleAuthorizationResolver(course, terms, actor).getAuthority().allowed;
  } catch {
    return false;
  }
};
export const createReconciliationRecord = (
  snapshot: ReconciliationSnapshot
): ReconciliationRecord =>
  reconciliationRecordSchema.parse({
    schema_version: 1,
    binding: {
      repositoryId: snapshot.course.course.repository_id,
      organizationId: snapshot.course.course.organization_binding?.organization_id,
      source: snapshot.source,
      checkpoint: snapshot.checkpoint,
      publication: snapshot.publication,
      intendedFingerprint: snapshot.intendedFingerprint,
      version: 1
    },
    reviewDigest: fingerprint(snapshot.metadata.audit),
    status: "needs_attention",
    guards: [],
    steps: [],
    history: [],
    writeId: "initial"
  });
export const validateReconciliationRecord = (snapshot: ReconciliationSnapshot): void => {
  if (snapshot.record) {
    const record = reconciliationRecordSchema.parse(snapshot.record);
    const expected = createReconciliationRecord(snapshot);
    if (
      stableJson(record.binding) !== stableJson(expected.binding) ||
      record.reviewDigest !== expected.reviewDigest ||
      new Set(record.guards.map((g) => `${g.kind}:${g.key}`)).size !== record.guards.length ||
      new Set(record.steps.map((s) => s.step)).size !== record.steps.length
    )
      throw new ReconciliationNeedsAttention("journal_binding_invalid");
    if (
      record.status === "ready" &&
      (record.guards.length ||
        record.steps.length !== RECONCILIATION_STEPS.length ||
        !RECONCILIATION_STEPS.every((name) =>
          record.steps.some((entry) => entry.step === name && entry.status === "verified")
        ))
    )
      throw new Error("Incomplete operational verification.");
    if (
      record.steps.some(
        (entry) =>
          entry.status === "verified" &&
          (entry.reasons.length ||
            entry.resources.some((resource) => resource.status !== "verified"))
      )
    )
      throw new ReconciliationNeedsAttention("journal_binding_invalid");
  }
};
