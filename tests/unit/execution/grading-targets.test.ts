import { describe, expect, it } from "vitest";
import {
  normalizeGradingTargets,
  selectGradingTargets
} from "../../../src/execution/grading-targets.js";
import type { Manifest } from "../../../src/manifest/manifest-models.js";

const groupManifest: Manifest = {
  schemaVersion: 2,
  repositoryMode: "group",
  assignment: {
    termCode: "27s2",
    courseCode: "CSC1120",
    assignmentSlug: "lab02",
    assignmentTitle: "Lab 2"
  },
  source: { sourceFiles: [], inputFingerprint: "fixture" },
  template: { repository: "CSC1120/template", branch: "main" },
  repositories: [],
  operationHistory: [],
  warnings: [],
  errors: [],
  targets: [
    {
      targetId: "team-1",
      mode: "group",
      groupId: "team-1",
      repositoryName: "27s2-csc1120-lab02-team-1",
      sectionIds: ["111"],
      studentIds: ["alpha", "beta"],
      githubUsernames: ["alpha-gh", "beta-gh"],
      diagnostics: []
    },
    {
      targetId: "team-2",
      mode: "group",
      groupId: "team-2",
      repositoryName: "27s2-csc1120-lab02-team-2",
      sectionIds: ["121"],
      studentIds: ["gamma"],
      githubUsernames: ["gamma-gh"],
      diagnostics: []
    }
  ],
  studentMappings: [
    {
      studentId: "alpha",
      githubUsername: "alpha-gh",
      targetId: "team-1",
      repositoryName: "27s2-csc1120-lab02-team-1"
    },
    {
      studentId: "beta",
      githubUsername: "beta-gh",
      targetId: "team-1",
      repositoryName: "27s2-csc1120-lab02-team-1"
    },
    {
      studentId: "gamma",
      githubUsername: "gamma-gh",
      targetId: "team-2",
      repositoryName: "27s2-csc1120-lab02-team-2"
    }
  ]
};

describe("grading targets", () => {
  it("normalizes shared group repositories and selects each target once", () => {
    const normalized = normalizeGradingTargets(groupManifest, "csc1120");
    const selected = selectGradingTargets(normalized, [
      {
        studentId: "alpha",
        githubUsername: "alpha-gh",
        section: "111",
        status: "active",
        rosterPath: "fixture.csv",
        rowNumber: 2
      },
      {
        studentId: "beta",
        githubUsername: "beta-gh",
        section: "111",
        status: "active",
        rosterPath: "fixture.csv",
        rowNumber: 3
      },
      {
        studentId: "gamma",
        githubUsername: "gamma-gh",
        section: "121",
        status: "active",
        rosterPath: "fixture.csv",
        rowNumber: 2
      }
    ]);

    expect(normalized.repositoryMode).toBe("group");
    expect(selected).toHaveLength(2);
    expect(selected[0]).toMatchObject({
      targetId: "team-1",
      groupId: "team-1",
      fullName: "csc1120/27s2-csc1120-lab02-team-1",
      studentIds: ["alpha", "beta"]
    });
  });
});
