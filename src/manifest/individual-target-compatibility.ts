import type { ApplyRepositoryTarget } from "../planning/repository-targets.js";

/**
 * v1 manifest records are intentionally limited to a single student-owned
 * repository. Group targets must not be persisted through this adapter.
 */
export const getIndividualTargetPrimaryStudentId = (
  target: ApplyRepositoryTarget
): string | undefined =>
  target.mode === "individual" && target.studentIds.length === 1
    ? target.primaryStudentId
    : undefined;
