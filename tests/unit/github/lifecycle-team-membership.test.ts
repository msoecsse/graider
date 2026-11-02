import { describe, expect, it } from "vitest";
import { buildLifecycleTeamMemberships } from "../../../src/github/lifecycle-team-membership.js";
import { buildDesiredTeamMemberships } from "../../../src/github/desired-team-membership.js";
import { rawTermConfigV2Schema } from "../../../src/config/config-schemas.js";
import { planTermActivation } from "../../../src/terms/term-activation.js";
import {
  course,
  terms,
  draft,
  FALLBACK,
  COORDINATOR,
  FACULTY,
  FORMER,
  HISTORY_ONLY,
  ARCHIVED_FACULTY,
  REPOSITORY_ID
} from "../terms/activation-fixtures.js";

describe("explicit lifecycle-aware team projection", () => {
  it("moves effective course administration on activation while retaining every scoped team", () => {
    const before = buildLifecycleTeamMemberships(course, terms, REPOSITORY_ID);
    const plan = planTermActivation(course, terms, draft.term.code, FALLBACK);
    const after = buildLifecycleTeamMemberships(
      course,
      plan.after.map((term) => rawTermConfigV2Schema.parse(term)),
      REPOSITORY_ID
    );
    const ids = (teams: typeof before, kind: string) =>
      teams.find((team) => team.identity.kind === kind)?.githubUserIds;
    expect(ids(before, "course-current-coordinators")).toEqual([COORDINATOR]);
    expect(ids(after, "course-current-coordinators")).toEqual([FACULTY]);
    expect(ids(before, "course-write")).toEqual([FACULTY, FORMER, ARCHIVED_FACULTY]);
    expect(ids(after, "course-write")).toEqual([COORDINATOR, FORMER, ARCHIVED_FACULTY]);
    expect(ids(before, "course-read")).toEqual([HISTORY_ONLY]);
    expect(ids(after, "course-read")).toEqual([HISTORY_ONLY]);
    const scoped = (teams: typeof before) => teams.filter((team) => "termCode" in team.identity);
    expect(scoped(after)).toEqual(scoped(before));
    expect(after.every((team) => !team.githubUserIds.includes(FALLBACK))).toBe(true);
    for (const team of after) {
      expect(Object.isFrozen(team)).toBe(true);
      expect(Object.isFrozen(team.githubUserIds)).toBe(true);
    }
  });
  it("preserves the Phase 7 default and supports initial zero-Active preparation", () => {
    const original = buildDesiredTeamMemberships(course, terms, REPOSITORY_ID);
    expect(
      original.find((team) => team.identity.kind === "course-current-coordinators")?.githubUserIds
    ).toEqual([COORDINATOR, FACULTY]);
    const initial = buildLifecycleTeamMemberships(course, [draft], REPOSITORY_ID);
    expect(
      initial.find((team) => team.identity.kind === "course-current-coordinators")?.githubUserIds
    ).toEqual([]);
    expect(initial.find((team) => team.identity.kind === "course-write")?.githubUserIds).toContain(
      FACULTY
    );
    expect(buildDesiredTeamMemberships(course, terms, REPOSITORY_ID)).toEqual(original);
  });
});
