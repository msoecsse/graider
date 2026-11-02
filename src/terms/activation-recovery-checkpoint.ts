import { z } from "zod";
import { CourseTermLifecycle } from "./course-term-lifecycle.js";
import { TERM_CODE_PATTERN } from "../config/config-schemas.js";
import { DRAFT_STUDENT_FACING_OPERATIONS } from "../faculty/draft-term-authorization-resolver.js";

export const ACTIVATION_RECOVERY_FILE = "activation-recovery.yml";
export const STUDENT_ACTIVITY_CATEGORIES = Object.freeze([...DRAFT_STUDENT_FACING_OPERATIONS]);
export type StudentActivityCategory = (typeof STUDENT_ACTIVITY_CATEGORIES)[number];
const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const courseRevisionSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const activitySchema = z
  .object({
    category: z.enum(STUDENT_ACTIVITY_CATEGORIES),
    actor_github_user_id: positiveId,
    recorded_at: z.iso.datetime()
  })
  .strict()
  .readonly();
export const activationRecoveryCheckpointSchema = z
  .object({
    schema_version: z.literal(1),
    activation_id: z.uuid(),
    course_repository_id: positiveId,
    activated_from_revision: courseRevisionSchema,
    target_term_code: z.string().regex(TERM_CODE_PATTERN),
    previous_active_term_code: z.string().regex(TERM_CODE_PATTERN).nullable(),
    activating_github_user_id: positiveId,
    state: z.enum(["rollback_available", "recovery_required"]),
    first_activity: activitySchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.state === "recovery_required") !== (value.first_activity !== undefined))
      context.addIssue({
        code: "custom",
        path: ["first_activity"],
        message: "Activity evidence must agree with checkpoint state."
      });
    if (value.target_term_code === value.previous_active_term_code)
      context.addIssue({
        code: "custom",
        path: ["previous_active_term_code"],
        message: "An activation cannot name itself as predecessor."
      });
  })
  .readonly();
export type ActivationRecoveryCheckpoint = z.infer<typeof activationRecoveryCheckpointSchema>;

export class TermRecoveryNeedsAttention extends Error {
  readonly status = "needs_attention";
  constructor(
    readonly reason:
      | "checkpoint_missing"
      | "checkpoint_invalid"
      | "predecessor_missing"
      | "activity_unknown"
      | "activity_present"
      | "contradictory_activity"
  ) {
    super(reason);
  }
}

export const validateRecoveryCheckpoint = (
  input: unknown,
  lifecycle: CourseTermLifecycle,
  repositoryId: number,
  targetCode: string
): ActivationRecoveryCheckpoint => {
  const result = activationRecoveryCheckpointSchema.safeParse(input);
  if (!result.success)
    throw new TermRecoveryNeedsAttention(
      input === undefined ? "checkpoint_missing" : "checkpoint_invalid"
    );
  const value = result.data;
  if (
    value.course_repository_id !== repositoryId ||
    value.target_term_code !== targetCode ||
    lifecycle.getActiveTerm()?.term.code !== targetCode
  )
    throw new TermRecoveryNeedsAttention("checkpoint_invalid");
  if (value.previous_active_term_code !== null) {
    const previous = lifecycle.getTerm(value.previous_active_term_code);
    if (!previous) throw new TermRecoveryNeedsAttention("predecessor_missing");
    if (previous.term.status !== "archived")
      throw new TermRecoveryNeedsAttention("checkpoint_invalid");
  }
  return value;
};

/** Complete remote evidence is supplied by the trusted outer reader, never inferred from local files. */
export const termActivityEvidenceSchema = z
  .object({
    schema_version: z.literal(1),
    source: z.literal("trusted-remote"),
    course_repository_id: positiveId,
    revision: courseRevisionSchema,
    term_code: z.string().regex(TERM_CODE_PATTERN),
    authenticated_github_user_id: positiveId,
    categories: z
      .object({
        apply: z.enum(["absent", "present", "unknown"]),
        "grading-dispatch": z.enum(["absent", "present", "unknown"]),
        grading: z.enum(["absent", "present", "unknown"]),
        "report-publication": z.enum(["absent", "present", "unknown"]),
        "student-repository-mutation": z.enum(["absent", "present", "unknown"])
      })
      .strict()
      .readonly()
  })
  .strict()
  .readonly();
export interface ActivityEvidenceContext {
  readonly courseRepositoryId: number;
  readonly revision: string;
  readonly termCode: string;
  readonly authenticatedGithubUserId: number;
}
export const requireNoTermActivity = (input: unknown, context: ActivityEvidenceContext): void => {
  const result = termActivityEvidenceSchema.safeParse(input);
  if (!result.success) throw new TermRecoveryNeedsAttention("activity_unknown");
  const value = result.data;
  if (
    value.course_repository_id !== context.courseRepositoryId ||
    value.revision !== context.revision ||
    value.term_code !== context.termCode ||
    value.authenticated_github_user_id !== context.authenticatedGithubUserId
  )
    throw new TermRecoveryNeedsAttention("activity_unknown");
  if (Object.values(value.categories).includes("present"))
    throw new TermRecoveryNeedsAttention("activity_present");
  if (Object.values(value.categories).includes("unknown"))
    throw new TermRecoveryNeedsAttention("activity_unknown");
};
