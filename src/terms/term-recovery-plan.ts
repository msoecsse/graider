import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { z } from "zod";
import { rawTermConfigV2Schema } from "../config/config-schemas.js";
import {
  DraftDeletionAuthorizationResolver,
  TermActivationRecoveryAuthorizationResolver
} from "../faculty/term-recovery-authorization.js";
import { CourseTermLifecycle, type TermLifecycleSnapshot } from "./course-term-lifecycle.js";
import {
  validateRecoveryCheckpoint,
  requireNoTermActivity,
  TermRecoveryNeedsAttention,
  type ActivityEvidenceContext
} from "./activation-recovery-checkpoint.js";

export const ACTIVATION_RECOVERY_RESOLUTIONS = Object.freeze([
  "safe-rollback",
  "accept-current",
  "restore-predecessor"
] as const);
export type ActivationRecoveryResolution = (typeof ACTIVATION_RECOVERY_RESOLUTIONS)[number];
export interface TermRecoveryPlan {
  readonly operation: "delete-draft" | ActivationRecoveryResolution;
  readonly targetTermCode: string;
  readonly previousActiveTermCode: string | null;
  readonly activationId: string | null;
  readonly before: readonly TermLifecycleSnapshot[];
  readonly after: readonly TermLifecycleSnapshot[];
  readonly changedTermCodes: readonly string[];
}
const snapshot = (terms: readonly RawTermConfigV2[]) => {
  const model = new CourseTermLifecycle(terms);
  return Object.freeze(
    terms.map((term) => {
      const value = model.getTerm(term.term.code);
      if (!value) throw new Error("Incomplete recovery snapshot.");
      return value;
    })
  );
};
export const planDraftDeletion = (
  course: RawCourseConfigV2,
  terms: readonly RawTermConfigV2[],
  context: ActivityEvidenceContext,
  evidence: unknown,
  checkpointExists: boolean
): TermRecoveryPlan => {
  const allowed = new DraftDeletionAuthorizationResolver(
    course,
    terms,
    context.termCode,
    context.authenticatedGithubUserId
  ).canDeleteDraft();
  if (!allowed.allowed) throw new Error(`Draft deletion denied: ${allowed.basis}.`);
  if (checkpointExists)
    throw new Error("Draft deletion is prohibited while recovery evidence exists.");
  requireNoTermActivity(evidence, context);
  const before = snapshot(terms);
  return Object.freeze({
    operation: "delete-draft",
    targetTermCode: context.termCode,
    previousActiveTermCode: null,
    activationId: null,
    before,
    after: snapshot(terms.filter((term) => term.term.code !== context.termCode)),
    changedTermCodes: Object.freeze([context.termCode])
  });
};

export const planActivationRecovery = (
  course: RawCourseConfigV2,
  termInputs: readonly RawTermConfigV2[],
  context: ActivityEvidenceContext,
  checkpointInput: unknown,
  expectedActivationId: string,
  resolution: ActivationRecoveryResolution,
  evidence?: unknown
): TermRecoveryPlan | { readonly status: "recovery_required"; readonly activationId: string } => {
  z.enum(ACTIVATION_RECOVERY_RESOLUTIONS).parse(resolution);
  const terms = termInputs.map((term) => rawTermConfigV2Schema.parse(term));
  const lifecycle = new CourseTermLifecycle(terms);
  const allowed = new TermActivationRecoveryAuthorizationResolver(
    course,
    terms,
    context.termCode,
    context.authenticatedGithubUserId
  ).canRecoverActivation();
  if (!allowed.allowed) throw new Error(`Activation recovery denied: ${allowed.basis}.`);
  const checkpoint = validateRecoveryCheckpoint(
    checkpointInput,
    lifecycle,
    context.courseRepositoryId,
    context.termCode
  );
  if (
    ![
      checkpoint.activating_github_user_id,
      ...(checkpoint.first_activity ? [checkpoint.first_activity.actor_github_user_id] : [])
    ].every((id) => course.faculty_directory.some((faculty) => faculty.github_user_id === id))
  )
    throw new TermRecoveryNeedsAttention("checkpoint_invalid");
  if (checkpoint.activation_id !== expectedActivationId)
    throw new Error("Activation identity changed.");
  if (resolution === "safe-rollback") {
    if (checkpoint.state === "recovery_required")
      return Object.freeze({ status: "recovery_required", activationId: checkpoint.activation_id });
    requireNoTermActivity(evidence, context);
  } else if (checkpoint.state !== "recovery_required")
    throw new Error("Post-activity resolution requires the write-ahead activity marker.");
  if (resolution === "restore-predecessor" && checkpoint.previous_active_term_code === null)
    throw new Error("Initial activation has no predecessor to restore.");
  const after = terms.map((term) => {
    if (resolution === "accept-current") return term;
    // Explicit recovery exceptions, deliberately not ordinary transition helpers.
    if (term.term.code === context.termCode)
      return {
        ...term,
        term: {
          ...term.term,
          status: resolution === "safe-rollback" ? ("draft" as const) : ("archived" as const),
          has_ever_been_active: true
        }
      };
    if (term.term.code === checkpoint.previous_active_term_code)
      return {
        ...term,
        term: { ...term.term, status: "active" as const, has_ever_been_active: true }
      };
    return term;
  });
  return Object.freeze({
    operation: resolution,
    targetTermCode: context.termCode,
    previousActiveTermCode: checkpoint.previous_active_term_code,
    activationId: checkpoint.activation_id,
    before: snapshot(terms),
    after: snapshot(after),
    changedTermCodes: Object.freeze(
      resolution === "accept-current"
        ? []
        : checkpoint.previous_active_term_code === null
          ? [context.termCode]
          : [context.termCode, checkpoint.previous_active_term_code]
    )
  });
};
