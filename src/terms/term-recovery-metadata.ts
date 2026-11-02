import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import { FacultyDirectory } from "../faculty/faculty-directory.js";
import { readActivationMetadata, writeLifecycleTerms } from "./term-activation-metadata.js";
import {
  activationRecoveryPath,
  readRecoveryCheckpoints,
  writeRecoveryCheckpoint
} from "./activation-recovery-storage.js";
import {
  activationRecoveryCheckpointSchema,
  validateRecoveryCheckpoint,
  STUDENT_ACTIVITY_CATEGORIES,
  TermRecoveryNeedsAttention,
  type ActivityEvidenceContext,
  type StudentActivityCategory
} from "./activation-recovery-checkpoint.js";
import { CourseTermLifecycle } from "./course-term-lifecycle.js";
import {
  planDraftDeletion,
  planActivationRecovery,
  type ActivationRecoveryResolution
} from "./term-recovery-plan.js";
import { validateStudentRepositoryTargets } from "../github/student-repository-target.js";

export const assertNoKnownStudentTargets = (termCode: string, inputs: readonly unknown[]): void => {
  for (const value of validateStudentRepositoryTargets(inputs)) {
    if (value.status !== "ready") throw new TermRecoveryNeedsAttention("activity_unknown");
    if (value.target.termCode === termCode)
      throw new TermRecoveryNeedsAttention("activity_present");
  }
};
export const inspectTermRecoveryCheckpoint = (
  root: string,
  organization: string,
  context: ActivityEvidenceContext
) => {
  const state = readActivationMetadata(root, organization);
  const input = readRecoveryCheckpoints(root, state.terms, context.courseRepositoryId).find(
    (record) => record.target_term_code === context.termCode
  );
  return validateRecoveryCheckpoint(
    input,
    new CourseTermLifecycle(state.terms),
    context.courseRepositoryId,
    context.termCode
  );
};

/** Presence corroborates activity. Absence here is never accepted as cross-machine proof. */
const assertNoTrackedActivity = (root: string, code: string): void => {
  for (const relative of [
    `terms/${code}/manifests`,
    `terms/${code}/grading`,
    `terms/${code}/reports`,
    `terms/${code}/runtime`,
    `.graider/terms/${code}`,
    `.graider/grading/${code}`
  ]) {
    if (fs.existsSync(path.join(root, relative)))
      throw new TermRecoveryNeedsAttention("activity_present");
  }
  const assignments = path.join(root, "terms", code, "assignments");
  if (fs.existsSync(assignments))
    for (const entry of fs.readdirSync(assignments, { withFileTypes: true })) {
      if (entry.isDirectory())
        for (const kind of ["apply", "manifests", "grading", "reports", "publications"]) {
          if (fs.existsSync(path.join(assignments, entry.name, kind)))
            throw new TermRecoveryNeedsAttention("activity_present");
        }
    }
};
const preparatoryPath =
  /^(?:term\.yml|rosters\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:csv|source\.json)|sections\/[A-Za-z0-9_-]+\/(?:section\.yml|roster\.csv|roster-history\.yml)|assignments\/[A-Za-z0-9_-]+\/(?:assignment\.yml|groups\.csv|sections\/[A-Za-z0-9_-]+\.yml|\.github\/workflows\/grade\.yml))$/u;
const draftFiles = (root: string, code: string): readonly string[] => {
  const base = path.join(root, "terms", code);
  const files: string[] = [];
  const visit = (directory: string, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), `${relative}/`);
      else if (entry.isFile() && preparatoryPath.test(relative))
        files.push(`terms/${code}/${relative}`);
      else throw new TermRecoveryNeedsAttention("activity_unknown");
    }
  };
  visit(base);
  return Object.freeze(files);
};

/** Runs only in the existing isolated transaction clone. Never delete a cache/runtime directory. */
export const prepareDraftDeletion = (
  root: string,
  organization: string,
  context: ActivityEvidenceContext,
  evidence: unknown
) => {
  const state = readActivationMetadata(root, organization);
  const checkpoints = readRecoveryCheckpoints(root, state.terms, context.courseRepositoryId);
  const plan = planDraftDeletion(
    state.course,
    state.terms,
    context,
    evidence,
    checkpoints.some((record) => record.target_term_code === context.termCode)
  );
  assertNoTrackedActivity(root, context.termCode);
  const changedPaths = Object.freeze([...draftFiles(root, context.termCode), "course.yml"]);
  const target = state.terms.find((term) => term.term.code === context.termCode);
  if (!target) throw new Error("Missing Draft target.");
  const coursePath = path.join(root, "course.yml");
  const courseDocument = parseDocument(fs.readFileSync(coursePath, "utf8"), { strict: true });
  if (courseDocument.errors.length) throw new Error("Invalid course YAML.");
  courseDocument.setIn(
    ["course", "term_creation_order"],
    state.course.course.term_creation_order.filter((code) => code !== context.termCode)
  );
  fs.writeFileSync(coursePath, courseDocument.toString());
  fs.rmSync(path.join(root, "terms", context.termCode), { recursive: true });
  const after = readActivationMetadata(root, organization);
  if (JSON.stringify(after.terms) !== JSON.stringify(plan.after))
    throw new Error("Draft deletion changed unrelated term fields.");
  return { course: after.course, plan, changedPaths, retiredDraftTerms: [target] };
};

export const prepareActivationRecovery = (
  root: string,
  organization: string,
  context: ActivityEvidenceContext,
  expectedActivationId: string,
  resolution: ActivationRecoveryResolution,
  evidence?: unknown
) => {
  const state = readActivationMetadata(root, organization);
  const records = readRecoveryCheckpoints(root, state.terms, context.courseRepositoryId);
  const checkpoint = records.find((record) => record.target_term_code === context.termCode);
  const plan = planActivationRecovery(
    state.course,
    state.terms,
    context,
    checkpoint,
    expectedActivationId,
    resolution,
    evidence
  );
  if ("status" in plan) return plan;
  if (resolution === "safe-rollback") assertNoTrackedActivity(root, context.termCode);
  writeLifecycleTerms(root, plan.after, plan.changedTermCodes);
  const checkpointPath = activationRecoveryPath(context.termCode);
  fs.unlinkSync(path.join(root, checkpointPath));
  const after = readActivationMetadata(root, organization);
  if (JSON.stringify(after.terms) !== JSON.stringify(plan.after))
    throw new Error("Activation recovery changed unrelated domain fields.");
  return {
    course: state.course,
    plan,
    changedPaths: Object.freeze([
      ...plan.changedTermCodes.map((code) => `terms/${code}/term.yml`),
      checkpointPath
    ]),
    retiredDraftTerms: []
  };
};

/** Necessary safety marker only, never role authorization for executing the requested operation. */
export const prepareStudentActivityMarker = (
  root: string,
  organization: string,
  context: ActivityEvidenceContext,
  expectedActivationId: string,
  category: StudentActivityCategory
) => {
  z.enum(STUDENT_ACTIVITY_CATEGORIES).parse(category);
  const state = readActivationMetadata(root, organization);
  if (!new FacultyDirectory(state.course).resolveByGithubUserId(context.authenticatedGithubUserId))
    throw new Error("Activity marker requires a known authenticated faculty identity.");
  const input = readRecoveryCheckpoints(root, state.terms, context.courseRepositoryId).find(
    (record) => record.target_term_code === context.termCode
  );
  const checkpoint = validateRecoveryCheckpoint(
    input,
    new CourseTermLifecycle(state.terms),
    context.courseRepositoryId,
    context.termCode
  );
  if (checkpoint.activation_id !== expectedActivationId)
    throw new Error("Activation identity changed.");
  const marked =
    checkpoint.state === "recovery_required"
      ? checkpoint
      : activationRecoveryCheckpointSchema.parse({
          ...checkpoint,
          state: "recovery_required",
          first_activity: {
            category,
            actor_github_user_id: context.authenticatedGithubUserId,
            recorded_at: new Date().toISOString()
          }
        });
  const changedPaths =
    checkpoint.state === "recovery_required" ? [] : [activationRecoveryPath(context.termCode)];
  if (changedPaths.length) writeRecoveryCheckpoint(root, marked);
  return { checkpoint: marked, changedPaths: Object.freeze(changedPaths) };
};
