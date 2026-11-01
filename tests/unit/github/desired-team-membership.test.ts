import { describe, expect, it } from "vitest";
import { buildDesiredTeamMemberships } from "../../../src/github/desired-team-membership.js";
import { SectionFaculty } from "../../../src/faculty/section-faculty.js";
import { renderManagedTeamMetadata } from "../../../src/github/managed-team-identity.js";
import { TERM_LIFECYCLE_STATUSES } from "../../../src/config/config-schemas.js";
import {
  course,
  term,
  secondTerm,
  COORDINATOR,
  FACULTY,
  FORMER,
  DIRECTORY_ONLY,
  FALLBACK,
  REPOSITORY_ID,
  fixture
} from "./team-membership-fixtures.js";

const MANAGED_TEAM_KIND_COUNT = 7;

describe("pure desired managed-team membership", () => {
  it.each(TERM_LIFECYCLE_STATUSES)("keeps the complete supplied term set for %s", (status) => {
    const terms = [term, secondTerm];
    expect(
      buildDesiredTeamMemberships(
        course,
        terms.map((value) => ({
          ...value,
          term: { ...value.term, status }
        })),
        REPOSITORY_ID
      )
    ).toEqual(buildDesiredTeamMemberships(course, terms, REPOSITORY_ID));
  });

  it("builds exact term/section and strongest course memberships for all seven kinds", () => {
    const { target, plan } = fixture();
    expect(new Set(plan.map((value) => value.identity.kind)).size).toBe(MANAGED_TEAM_KIND_COUNT);
    expect(target("term-current-coordinators").desired.githubUserIds).toEqual([COORDINATOR]);
    expect(target("term-former-coordinators").desired.githubUserIds).toEqual([FORMER]);
    expect(target("section-current-faculty", "001").desired.githubUserIds).toEqual([FACULTY]);
    expect(target("section-former-faculty", "001").desired.githubUserIds).toEqual([FORMER]);
    expect(target("section-current-faculty", "002").desired.githubUserIds).toEqual([COORDINATOR]);
    expect(target("course-current-coordinators").desired.githubUserIds).toEqual([COORDINATOR]);
    expect(target("course-write").desired.githubUserIds).toEqual([FACULTY]);
    expect(target("course-read").desired.githubUserIds).toEqual([FORMER]);
    expect(
      plan.every(
        (value) =>
          !value.githubUserIds.includes(DIRECTORY_ONLY) && !value.githubUserIds.includes(FALLBACK)
      )
    ).toBe(true);
  });

  it("unions roles across supplied terms without merging exact term/section scope", () => {
    const { target } = fixture([term, secondTerm]);
    expect(target("course-current-coordinators").desired.githubUserIds).toEqual([
      COORDINATOR,
      FACULTY
    ]);
    expect(target("course-write").desired.githubUserIds).toEqual([FORMER]);
    expect(target("course-read").desired.githubUserIds).toEqual([]);
    expect(target("section-current-faculty", "001", "27s1").desired.githubUserIds).toEqual([
      FACULTY
    ]);
    expect(target("section-current-faculty", "001", "27s2").desired.githubUserIds).toEqual([
      FORMER
    ]);
  });

  it("directory-only and fallback identity never manufacture membership even with no terms", () => {
    const plan = buildDesiredTeamMemberships(course, [], REPOSITORY_ID);
    expect(plan).toHaveLength(3);
    expect(plan.every((value) => value.githubUserIds.length === 0)).toBe(true);
  });

  it("handles current → former → restored current without modifying persisted input", () => {
    const before = structuredClone({ course, term });
    const former = new SectionFaculty(course, term, "001").removeCurrentFaculty(FACULTY);
    const plan = buildDesiredTeamMemberships(course, [former], REPOSITORY_ID);
    expect(plan.find((value) => value.identity.kind === "course-write")?.githubUserIds).toEqual([]);
    expect(plan.find((value) => value.identity.kind === "course-read")?.githubUserIds).toEqual([
      FACULTY,
      FORMER
    ]);
    const restored = new SectionFaculty(course, former, "001").restoreFormerFaculty(FACULTY);
    expect(buildDesiredTeamMemberships(course, [restored], REPOSITORY_ID)).toEqual(
      buildDesiredTeamMemberships(course, [term], REPOSITORY_ID)
    );
    expect({ course, term }).toEqual(before);
  });

  it("rejects duplicate term/section scope, unknown faculty and invalid canonical IDs", () => {
    expect(() => buildDesiredTeamMemberships(course, [term, term], REPOSITORY_ID)).toThrow(
      "Duplicate supplied term"
    );
    const firstSection = term.sections[0];
    if (!firstSection) throw new Error("Missing section fixture.");
    expect(() =>
      buildDesiredTeamMemberships(
        course,
        [{ ...term, sections: [firstSection, firstSection] }],
        REPOSITORY_ID
      )
    ).toThrow("exactly one matching");
    expect(() =>
      buildDesiredTeamMemberships(
        course,
        [{ ...term, coordinators: { current: [{ github_user_id: REPOSITORY_ID }], former: [] } }],
        REPOSITORY_ID
      )
    ).toThrow("existing faculty");
    expect(() => buildDesiredTeamMemberships(course, [], 0)).toThrow();
  });

  it("returns immutable snapshots with independent logical identity keys", () => {
    const plan = buildDesiredTeamMemberships(course, [term], REPOSITORY_ID);
    const other = buildDesiredTeamMemberships(course, [term], REPOSITORY_ID + 1);
    expect(Object.isFrozen(plan)).toBe(true);
    for (const value of plan) {
      expect(Object.isFrozen(value.identity)).toBe(true);
      expect(Object.isFrozen(value.githubUserIds)).toBe(true);
    }
    expect(plan.map((value) => renderManagedTeamMetadata(value.identity))).not.toEqual(
      other.map((value) => renderManagedTeamMetadata(value.identity))
    );
  });
});
