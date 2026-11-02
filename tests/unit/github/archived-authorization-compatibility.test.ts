import { describe, expect, it } from "vitest";
import { buildLifecycleTeamMemberships } from "../../../src/github/lifecycle-team-membership.js";
import { desiredStudentTeamGrants } from "../../../src/github/student-repository-permissions.js";
import { renderManagedTeamMetadata } from "../../../src/github/managed-team-identity.js";
import {
  ARCHIVED_SECTION_OPERATIONS,
  ARCHIVED_STRUCTURAL_OPERATIONS
} from "../../../src/faculty/archived-term-authorization-resolver.js";
import {
  course,
  terms,
  archived,
  names,
  id,
  resolver
} from "../faculty/archived-authorization-fixtures.js";

const REPOSITORY_ID = 123;
describe("Archived domain policy consumes the unchanged 8.3 desired state", () => {
  it("retains current scoped roles/write and former-only historical read without adding fallback", () => {
    const plan = buildLifecycleTeamMemberships(course, terms, REPOSITORY_ID);
    const members = (kind: string, sectionId?: string) =>
      plan.find(
        (team) =>
          team.identity.kind === kind &&
          (!sectionId || ("sectionId" in team.identity && team.identity.sectionId === sectionId))
      )?.githubUserIds;
    expect(members("course-current-coordinators")).toEqual([id("active-coordinator")]);
    expect(members("course-write")).toEqual(
      ["faculty", "teaching-coordinator", "coordinator", "multiple", "draft-coordinator"]
        .map((name) => id(name as (typeof names)[number]))
        .sort((a, b) => a - b)
    );
    expect(members("course-read")).toEqual([id("former"), id("former-coordinator")]);
    expect(members("term-current-coordinators")).toEqual([id("draft-coordinator")]);
    const archivedTeams = plan.filter(
      (team) => "termCode" in team.identity && team.identity.termCode === archived.term.code
    );
    expect(
      archivedTeams.find((team) => team.identity.kind === "term-current-coordinators")
        ?.githubUserIds
    ).toEqual([id("teaching-coordinator"), id("coordinator")]);
    expect(
      archivedTeams.find((team) => team.identity.kind === "term-former-coordinators")?.githubUserIds
    ).toEqual([id("former-coordinator"), id("multiple")]);
    expect(
      archivedTeams.find(
        (team) =>
          team.identity.kind === "section-current-faculty" &&
          "sectionId" in team.identity &&
          team.identity.sectionId === "001"
      )?.githubUserIds
    ).toEqual([id("faculty"), id("teaching-coordinator")]);
    expect(plan.every((team) => !team.githubUserIds.includes(id("fallback")))).toBe(true);
    // Infrastructure course admin in another term does not authorize this Archived term.
    expect(resolver("active-coordinator").canViewArchivedTerm().allowed).toBe(false);
  });

  it("preserves student admin for eligible current roles and read for former-only roles despite structural freeze", () => {
    const plan = buildLifecycleTeamMemberships(course, terms, REPOSITORY_ID);
    const grants = desiredStudentTeamGrants(REPOSITORY_ID, archived.term.code, "001");
    const permissions = (actorId: number) =>
      grants
        .filter((grant) =>
          plan
            .find(
              (team) =>
                renderManagedTeamMetadata(team.identity) ===
                renderManagedTeamMetadata(grant.identity)
            )
            ?.githubUserIds.includes(actorId)
        )
        .map((grant) => grant.permission);
    for (const name of ["faculty", "coordinator", "teaching-coordinator"] as const) {
      expect(permissions(id(name))).toContain("admin");
      expect(resolver(name).canEditArchivedStructure("roster-structure").allowed).toBe(false);
    }
    for (const name of ["former", "former-coordinator"] as const) {
      expect(permissions(id(name)).length).toBeGreaterThan(0);
      expect(permissions(id(name)).every((permission) => permission === "pull")).toBe(true);
      expect(resolver(name).canPerformArchivedSectionOperation("inspect", "001").allowed).toBe(
        true
      );
      expect(resolver(name).canPerformArchivedSectionOperation("grading", "001").allowed).toBe(
        false
      );
    }
    expect(permissions(id("fallback"))).toEqual([]);
  });

  it("leaves role history, lifecycle and desired state unchanged after every policy decision", () => {
    const before = structuredClone({ course, terms });
    const plan = buildLifecycleTeamMemberships(course, terms, REPOSITORY_ID);
    for (const name of names) {
      const auth = resolver(name);
      auth.canViewArchivedTerm();
      for (const operation of ARCHIVED_SECTION_OPERATIONS)
        auth.canPerformArchivedSectionOperation(operation, "001");
      for (const operation of ARCHIVED_STRUCTURAL_OPERATIONS) {
        auth.canEditArchivedStructure(operation);
        auth.canPerformArchivedAdministrativeCorrection(operation);
      }
    }
    expect({ course, terms }).toEqual(before);
    expect(buildLifecycleTeamMemberships(course, terms, REPOSITORY_ID)).toEqual(plan);
  });
});
