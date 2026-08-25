import { describe, expect, it } from "vitest";
import { getIndividualTargetPrimaryStudentId } from "../../../src/manifest/individual-target-compatibility.js";
import type { ApplyRepositoryTarget } from "../../../src/planning/repository-targets.js";

const individual: ApplyRepositoryTarget = {
  targetId: "student-a",
  mode: "individual",
  repositoryName: "repo",
  sectionIds: ["001"],
  studentIds: ["student-a"],
  githubUsernames: ["student-a"],
  primaryStudentId: "student-a",
  plannedStudentPermission: "admin",
  facultyTeamPermission: "admin",
  graderTeamPermission: "maintain",
  diagnostics: []
};

describe("individual target manifest compatibility", () => {
  it("permits only one-student individual targets to use v1 manifest records", () => {
    expect(getIndividualTargetPrimaryStudentId(individual)).toBe("student-a");
    expect(
      getIndividualTargetPrimaryStudentId({
        ...individual,
        targetId: "team-1",
        mode: "group",
        groupId: "team-1",
        studentIds: ["student-a", "student-b"]
      })
    ).toBeUndefined();
  });
});
