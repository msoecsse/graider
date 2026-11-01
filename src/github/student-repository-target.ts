import { z } from "zod";
import type { Manifest } from "../manifest/manifest-models.js";
import { TERM_CODE_PATTERN } from "../config/config-schemas.js";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonempty = z.string().min(1);
const targetSchema = z
  .object({
    courseRepositoryId: id,
    organizationId: id,
    repositoryId: id,
    termCode: z.string().regex(TERM_CODE_PATTERN),
    sectionId: nonempty,
    assignmentSlug: nonempty,
    targetId: nonempty,
    mode: z.enum(["individual", "group"]),
    // Trusted roster/group evidence, not a section inferred from a repository name.
    sectionIds: z.array(nonempty).min(1)
  })
  .strict();
export interface TrustedStudentRepositoryTarget extends Readonly<
  Omit<z.infer<typeof targetSchema>, "sectionIds">
> {
  readonly sectionIds: readonly string[];
}
export type StudentTargetReason =
  | "immutable_repository_id_required"
  | "invalid_repository_target"
  | "cross_section_repository_target"
  | "duplicate_repository_target"
  | "conflicting_repository_target"
  | "target_context_mismatch"
  | "unknown_target_scope"
  | "course_repository_is_not_student_target";
export type StudentTargetValidation =
  | { readonly status: "ready"; readonly target: TrustedStudentRepositoryTarget }
  | {
      readonly status: "needs_attention";
      readonly repositoryId: number | null;
      readonly termCode: string | null;
      readonly sectionId: string | null;
      readonly targetId: string | null;
      readonly reason: StudentTargetReason;
    };

/** Shape is not provenance. Only a trusted backend mapping/source revision may supply these records. */
export const validateStudentRepositoryTarget = (input: unknown): StudentTargetValidation => {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const base = {
    repositoryId:
      typeof value.repositoryId === "number" &&
      Number.isSafeInteger(value.repositoryId) &&
      value.repositoryId > 0
        ? value.repositoryId
        : null,
    termCode: typeof value.termCode === "string" ? value.termCode : null,
    sectionId: typeof value.sectionId === "string" ? value.sectionId : null,
    targetId: typeof value.targetId === "string" ? value.targetId : null
  };
  if (base.repositoryId === null)
    return Object.freeze({
      ...base,
      status: "needs_attention",
      reason: "immutable_repository_id_required"
    });
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success)
    return Object.freeze({
      ...base,
      status: "needs_attention",
      reason: "invalid_repository_target"
    });
  const sections = new Set(parsed.data.sectionIds);
  if (sections.size !== 1 || !sections.has(parsed.data.sectionId))
    return Object.freeze({
      ...base,
      status: "needs_attention",
      reason: "cross_section_repository_target"
    });
  return Object.freeze({
    status: "ready",
    target: Object.freeze({ ...parsed.data, sectionIds: Object.freeze([...sections]) })
  });
};

/** All duplicate/conflicting IDs are blocked before any remote mutation, including otherwise-invalid records. */
export const validateStudentRepositoryTargets = (
  inputs: readonly unknown[]
): readonly StudentTargetValidation[] => {
  const values = inputs.map(validateStudentRepositoryTarget);
  return Object.freeze(
    values.map((value, index) => {
      const repositoryId =
        value.status === "ready" ? value.target.repositoryId : value.repositoryId;
      if (repositoryId === null) return value;
      const sameId = values.filter(
        (other) =>
          (other.status === "ready" ? other.target.repositoryId : other.repositoryId) ===
          repositoryId
      );
      const key = (target: TrustedStudentRepositoryTarget) =>
        JSON.stringify([
          target.courseRepositoryId,
          target.organizationId,
          target.termCode,
          target.assignmentSlug,
          target.targetId,
          target.mode
        ]);
      const reverseConflict =
        value.status === "ready" &&
        values.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.status === "ready" &&
            key(other.target) === key(value.target) &&
            other.target.repositoryId !== repositoryId
        );
      if (sameId.length < 2 && !reverseConflict) return value;
      const target = value.status === "ready" ? value.target : value;
      const identical = sameId.every((other) => JSON.stringify(other) === JSON.stringify(value));
      return Object.freeze({
        status: "needs_attention",
        repositoryId,
        termCode: target.termCode,
        sectionId: target.sectionId,
        targetId: target.targetId,
        reason:
          reverseConflict || !identical
            ? "conflicting_repository_target"
            : "duplicate_repository_target"
      });
    })
  );
};

/** Existing individual records persist ID + explicit section. Names/URLs are deliberately not inputs. */
export const studentTargetsFromManifest = (
  manifest: Manifest,
  context: { readonly courseRepositoryId: number; readonly organizationId: number }
): readonly StudentTargetValidation[] => {
  if (manifest.repositoryMode === "group")
    return Object.freeze(
      (manifest.targets ?? []).map((target) =>
        Object.freeze({
          status: "needs_attention" as const,
          repositoryId: null,
          termCode: manifest.assignment.termCode,
          sectionId: target.sectionIds.length === 1 ? (target.sectionIds[0] ?? null) : null,
          targetId: target.targetId,
          reason: "immutable_repository_id_required" as const
        })
      )
    );
  return validateStudentRepositoryTargets(
    manifest.repositories.map((record) => ({
      ...context,
      repositoryId: record.repository.id,
      termCode: manifest.assignment.termCode,
      sectionId: record.section,
      sectionIds: [record.section],
      targetId: record.studentId,
      assignmentSlug: manifest.assignment.assignmentSlug,
      mode: "individual"
    }))
  );
};
