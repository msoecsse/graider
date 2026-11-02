import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import type { CourseLifecycleStatus } from "../config/config-models.js";
import { COURSE_LIFECYCLE_STATUSES } from "../config/config-schemas.js";
import { readActivationMetadata } from "../terms/term-activation-metadata.js";
import { readRecoveryCheckpoints } from "../terms/activation-recovery-storage.js";
import { CourseLifecycleAuthorizationResolver } from "../faculty/course-lifecycle-authorization-resolver.js";

/** Internal exact-revision transaction policy only. The caller ALSO gates future organization migration state. */
export const prepareCourseLifecycleChange = (
  root: string,
  organization: string,
  repositoryId: number,
  actorId: number,
  targetStatus: CourseLifecycleStatus
) => {
  z.enum(COURSE_LIFECYCLE_STATUSES).parse(targetStatus);
  const state = readActivationMetadata(root, organization);
  const recovery = {
    complete: true,
    checkpoints: readRecoveryCheckpoints(root, state.terms, repositoryId)
  };
  const resolver = new CourseLifecycleAuthorizationResolver(
    state.course,
    state.terms,
    actorId,
    recovery
  );
  const beforeStatus = resolver.lifecycle.getStatus();
  const sameState = beforeStatus === targetStatus;
  const decision = sameState
    ? resolver.getAuthority()
    : targetStatus === "archived"
      ? resolver.canArchiveCourse()
      : resolver.canUnarchiveCourse();
  const base = {
    beforeStatus,
    afterStatus: beforeStatus,
    authorizationBasis: resolver.getAuthority().basis
  };
  if (!decision.allowed)
    return Object.freeze({ ...base, status: "needs_attention" as const, reason: decision.basis });
  if (!sameState) {
    const file = path.join(root, "course.yml");
    const document = parseDocument(fs.readFileSync(file, "utf8"), { strict: true });
    if (document.errors.length) throw new Error("Invalid course lifecycle YAML.");
    document.setIn(["course", "lifecycle"], targetStatus);
    fs.writeFileSync(file, document.toString());
    const after = readActivationMetadata(root, organization);
    const expected = {
      ...state.course,
      course: { ...state.course.course, lifecycle: targetStatus }
    };
    if (
      JSON.stringify(after.course) !== JSON.stringify(expected) ||
      JSON.stringify(after.terms) !== JSON.stringify(state.terms)
    )
      throw new Error("Course lifecycle change modified unrelated metadata.");
    new CourseLifecycleAuthorizationResolver(after.course, after.terms, actorId, recovery);
  }
  return Object.freeze({
    ...base,
    status: "success" as const,
    afterStatus: targetStatus,
    changed: !sameState
  });
};
