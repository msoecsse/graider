import { createHash } from "node:crypto";
import type { RawCourseConfigV2, RawTermConfigV2 } from "../config/config-models.js";
import { rawCourseConfigV2Schema, rawTermConfigV2Schema } from "../config/config-schemas.js";
import { TermCoordinators } from "../faculty/term-coordinators.js";
import { SectionFaculty } from "../faculty/section-faculty.js";
import {
  createManagedTeamIdentity,
  renderManagedTeamMetadata,
  type ManagedTeamIdentity
} from "./managed-team-identity.js";

export interface DesiredTeamMembership {
  readonly identity: ManagedTeamIdentity;
  readonly githubUserIds: readonly number[];
}

/** Roles across exactly the supplied terms. No lifecycle filtering, fallback insertion or GitHub I/O. */
export const buildDesiredTeamMemberships = (
  courseInput: RawCourseConfigV2,
  termInputs: readonly RawTermConfigV2[],
  courseRepositoryId: number
): readonly DesiredTeamMembership[] => {
  const course = rawCourseConfigV2Schema.parse(courseInput);
  const terms = termInputs.map((input) => rawTermConfigV2Schema.parse(input));
  const termCodes = new Set<string>();
  const coordinators = new Set<number>();
  const current = new Set<number>();
  const historical = new Set<number>();
  const teams: DesiredTeamMembership[] = [];
  const append = (input: unknown, ids: readonly number[]) => {
    teams.push(
      Object.freeze({
        identity: createManagedTeamIdentity(input),
        githubUserIds: Object.freeze([...new Set(ids)].sort((a, b) => a - b))
      })
    );
  };
  // Validate the canonical course ID even with no supplied terms.
  createManagedTeamIdentity({ courseRepositoryId, kind: "course-read" });
  for (const term of terms) {
    if (termCodes.has(term.term.code)) throw new Error("Duplicate supplied term code.");
    termCodes.add(term.term.code);
    const roles = new TermCoordinators(course, term);
    const currentCoordinators = roles.getCurrentCoordinators().map((value) => value.github_user_id);
    const formerCoordinators = roles.getFormerCoordinators().map((value) => value.github_user_id);
    currentCoordinators.forEach((id) => coordinators.add(id));
    formerCoordinators.forEach((id) => historical.add(id));
    const scope = { courseRepositoryId, termCode: term.term.code };
    append({ ...scope, kind: "term-current-coordinators" }, currentCoordinators);
    append({ ...scope, kind: "term-former-coordinators" }, formerCoordinators);
    const sectionIds = new Set<string>();
    for (const section of term.sections) {
      if (sectionIds.has(section.id)) throw new Error("Duplicate supplied section ID.");
      sectionIds.add(section.id);
      const faculty = new SectionFaculty(course, term, section.id);
      const currentFaculty = faculty.getCurrentFaculty().map((value) => value.github_user_id);
      const formerFaculty = faculty.getFormerFaculty().map((value) => value.github_user_id);
      currentFaculty.forEach((id) => current.add(id));
      formerFaculty.forEach((id) => historical.add(id));
      append({ ...scope, kind: "section-current-faculty", sectionId: section.id }, currentFaculty);
      append({ ...scope, kind: "section-former-faculty", sectionId: section.id }, formerFaculty);
    }
  }
  append({ courseRepositoryId, kind: "course-current-coordinators" }, [...coordinators]);
  append(
    { courseRepositoryId, kind: "course-write" },
    [...current].filter((id) => !coordinators.has(id))
  );
  append(
    { courseRepositoryId, kind: "course-read" },
    [...historical].filter((id) => !coordinators.has(id) && !current.has(id))
  );
  return Object.freeze(teams);
};

/** Presentation only; authority always comes from the canonical description and numeric team ID. */
export const managedTeamDisplayName = (identity: ManagedTeamIdentity): string => {
  const description = renderManagedTeamMetadata(identity);
  const suffixLength = 8;
  const displayLength = 80;
  const suffix = createHash("sha256").update(description).digest("hex").slice(0, suffixLength);
  const scope =
    `${"termCode" in identity ? identity.termCode : ""} ${"sectionId" in identity ? identity.sectionId : ""}`.trim();
  const label = `Graider ${String(identity.courseRepositoryId)} ${identity.kind} ${scope}`
    .trim()
    .replace(/[^a-z\d -]/gi, "-");
  return `${label.slice(0, displayLength)} ${suffix}`;
};
