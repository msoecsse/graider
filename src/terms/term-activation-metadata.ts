import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parse, parseDocument } from "yaml";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema,
  TERM_CODE_PATTERN
} from "../config/config-schemas.js";
import { AuthorizationResolver } from "../faculty/authorization-resolver.js";
import { CourseTermLifecycle } from "./course-term-lifecycle.js";
import { planTermActivation } from "./term-activation.js";
import type { TermLifecycleSnapshot } from "./course-term-lifecycle.js";
import { validateTermCreationOrder } from "../courses/course-lifecycle.js";
import {
  activationRecoveryCheckpointSchema,
  TermRecoveryNeedsAttention
} from "./activation-recovery-checkpoint.js";
import {
  activationRecoveryPath,
  readRecoveryCheckpoints,
  writeRecoveryCheckpoint
} from "./activation-recovery-storage.js";

/** Internal v2 metadata policy for the existing isolated managed transaction, never the v1 inspector. */
export const readActivationMetadata = (root: string, organization: string) => {
  const course = rawCourseConfigV2Schema.parse(
    parse(fs.readFileSync(path.join(root, "course.yml"), "utf8"))
  );
  if (course.github.organization.toLowerCase() !== organization.toLowerCase())
    throw new Error("Activation course organization mismatch.");
  const terms = (
    fs.existsSync(path.join(root, "terms"))
      ? fs.readdirSync(path.join(root, "terms"), { withFileTypes: true })
      : []
  )
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      if (!TERM_CODE_PATTERN.test(entry.name)) throw new Error("Invalid activation term path.");
      const term = rawTermConfigV2Schema.parse(
        parse(fs.readFileSync(path.join(root, "terms", entry.name, "term.yml"), "utf8"))
      );
      if (term.term.code !== entry.name) throw new Error("Activation term path/code mismatch.");
      new AuthorizationResolver(course, term, course.fallback_administrator.github_user_id);
      return term;
    });
  new CourseTermLifecycle(terms);
  for (const record of readRecoveryCheckpoints(root, terms)) {
    if (
      ![
        record.activating_github_user_id,
        ...(record.first_activity ? [record.first_activity.actor_github_user_id] : [])
      ].every((id) => course.faculty_directory.some((faculty) => faculty.github_user_id === id))
    )
      throw new TermRecoveryNeedsAttention("checkpoint_invalid");
  }
  validateTermCreationOrder(course, terms);
  return { course, terms };
};

export const writeLifecycleTerms = (
  root: string,
  after: readonly TermLifecycleSnapshot[],
  changedCodes: readonly string[]
): void => {
  for (const code of changedCodes) {
    if (!TERM_CODE_PATTERN.test(code)) throw new Error("Unsafe lifecycle term code.");
    const term = after.find((entry) => entry.term.code === code);
    if (!term) throw new Error("Incomplete lifecycle plan.");
    const file = path.join(root, "terms", code, "term.yml");
    const document = parseDocument(fs.readFileSync(file, "utf8"), { strict: true });
    if (document.errors.length) throw new Error("Invalid lifecycle YAML.");
    document.setIn(["term", "status"], term.term.status);
    document.setIn(["term", "has_ever_been_active"], term.term.has_ever_been_active);
    fs.writeFileSync(file, document.toString());
  }
};

/** Replans from the exact cloned revision. All writes remain unpublished until the shared transaction commits. */
export const prepareTermActivation = (
  root: string,
  organization: string,
  targetCode: string,
  actorId: number,
  recoveryContext: { readonly courseRepositoryId: number; readonly revision: string }
) => {
  const state = readActivationMetadata(root, organization);
  if (readRecoveryCheckpoints(root, state.terms, recoveryContext.courseRepositoryId).length)
    throw new Error(
      "Resolve the existing activation recovery checkpoint before activating another term."
    );
  const plan = planTermActivation(state.course, state.terms, targetCode, actorId);
  const checkpoint = activationRecoveryCheckpointSchema.parse({
    schema_version: 1,
    activation_id: randomUUID(),
    course_repository_id: recoveryContext.courseRepositoryId,
    activated_from_revision: recoveryContext.revision,
    target_term_code: targetCode,
    previous_active_term_code: plan.previousActiveTermCode,
    activating_github_user_id: actorId,
    state: "rollback_available"
  });
  writeLifecycleTerms(root, plan.after, plan.changedTermCodes);
  writeRecoveryCheckpoint(root, checkpoint);
  const after = readActivationMetadata(root, organization);
  if (JSON.stringify(after.terms) !== JSON.stringify(plan.after))
    throw new Error("Activation changed unrelated domain fields.");
  return {
    course: state.course,
    plan,
    checkpoint,
    changedPaths: Object.freeze([
      ...plan.changedTermCodes.map((code) => `terms/${code}/term.yml`),
      activationRecoveryPath(targetCode)
    ])
  };
};
