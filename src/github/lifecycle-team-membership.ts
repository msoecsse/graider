import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { CourseTermLifecycle } from "../terms/course-term-lifecycle.js";
import {
  buildDesiredTeamMemberships,
  type DesiredTeamMembership
} from "./desired-team-membership.js";

/** Explicit lifecycle projection. Phase 7's default builder remains lifecycle-neutral. */
export const buildLifecycleTeamMemberships = (
  course: RawCourseConfigV2,
  terms: readonly RawTermConfigV2[],
  courseRepositoryId: number
): readonly DesiredTeamMembership[] => {
  const lifecycle = new CourseTermLifecycle(terms);
  const baseline = buildDesiredTeamMemberships(course, terms, courseRepositoryId);
  const admins = new Set(
    lifecycle.getActiveTerm()?.coordinators.current.map((ref) => ref.github_user_id)
  );
  const writers = new Set<number>();
  const readers = new Set<number>();
  for (const input of terms) {
    const term = lifecycle.getTerm(input.term.code);
    if (!term) throw new Error("Incomplete lifecycle projection.");
    // Normally completed Archived current roles retain late grading/publication work.
    for (const history of [term.coordinators, ...term.sections.map((section) => section.faculty)]) {
      history.current.forEach((ref) => writers.add(ref.github_user_id));
      history.former.forEach((ref) => readers.add(ref.github_user_id));
    }
  }
  const ids = (values: Set<number>) => Object.freeze([...values].sort((a, b) => a - b));
  admins.forEach((id) => writers.delete(id));
  [...admins, ...writers].forEach((id) => readers.delete(id));
  return Object.freeze(
    baseline.map((team) => {
      const members =
        team.identity.kind === "course-current-coordinators"
          ? admins
          : team.identity.kind === "course-write"
            ? writers
            : team.identity.kind === "course-read"
              ? readers
              : undefined;
      return members
        ? Object.freeze({ identity: team.identity, githubUserIds: ids(members) })
        : team;
    })
  );
};
