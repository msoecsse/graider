import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAssignmentRepositoryMappingsCommand } from "../../src/cli/commands/assignment.command.js";
import { renderManifestV2Yaml } from "../../src/manifest/manifest-v2-renderer.js";

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const copyFixture = (name: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-repository-mappings-"));
  fs.cpSync(path.join("tests", "fixtures", "grade", name), root, { recursive: true });
  return root;
};

describe("assignment repository-mappings command", () => {
  it("returns individual targets and student mappings from a legacy manifest without GitHub", async () => {
    const result = await runAssignmentRepositoryMappingsCommand({
      cwd: copyFixture("active-assignment"),
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true }
    });
    expect(result).toMatchObject({
      status: "success",
      manifest: { status: "present", schemaVersion: 1 },
      repositoryMode: "individual"
    });
    expect(result.summary.targetCount).toBe(result.summary.studentMappingCount);
    expect(result.targets[0]).toMatchObject({ mode: "individual" });
    expect(result.studentMappings[0]).toMatchObject({ targetId: result.targets[0]?.targetId });
  });

  it("reports a missing manifest as a non-fatal not-applied state", async () => {
    const result = await runAssignmentRepositoryMappingsCommand({
      cwd: copyFixture("missing-manifest"),
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true }
    });
    expect(result).toMatchObject({
      status: "success",
      manifest: { status: "not_applied" },
      targets: [],
      studentMappings: []
    });
    expect(result.diagnostics[0]?.message).toContain("not been created");
  });

  it("returns grouped targets and one mapping per group member from a v2 manifest", async () => {
    const cwd = copyFixture("active-assignment");
    fs.writeFileSync(
      path.join(cwd, "terms/27s1/manifests/lab04/manifest.yml"),
      renderManifestV2Yaml({
        repositoryMode: "group",
        targets: [
          {
            targetId: "team-1",
            mode: "group",
            groupId: "team-1",
            repositoryName: "27s1-se2030-lab04-team-1",
            htmlUrl: "https://github.com/example-org/27s1-se2030-lab04-team-1",
            cloneUrl: "https://github.com/example-org/27s1-se2030-lab04-team-1.git",
            sectionIds: ["001"],
            studentIds: ["jones", "smith"],
            githubUsernames: ["seanjones", "janesmith"],
            diagnostics: []
          }
        ],
        studentMappings: [
          {
            studentId: "jones",
            githubUsername: "seanjones",
            targetId: "team-1",
            repositoryName: "27s1-se2030-lab04-team-1",
            htmlUrl: "https://github.com/example-org/27s1-se2030-lab04-team-1"
          },
          {
            studentId: "smith",
            githubUsername: "janesmith",
            targetId: "team-1",
            repositoryName: "27s1-se2030-lab04-team-1",
            htmlUrl: "https://github.com/example-org/27s1-se2030-lab04-team-1"
          }
        ]
      })
    );
    const result = await runAssignmentRepositoryMappingsCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true }
    });
    expect(result).toMatchObject({
      status: "success",
      manifest: { schemaVersion: 2 },
      repositoryMode: "group",
      summary: { targetCount: 1, studentMappingCount: 2 }
    });
    expect(result.targets[0]).toMatchObject({
      targetId: "team-1",
      mode: "group",
      groupId: "team-1"
    });
    expect(result.studentMappings.map((mapping) => mapping.targetId)).toEqual(["team-1", "team-1"]);
  });

  it("requires JSON output", async () => {
    const result = await runAssignmentRepositoryMappingsCommand({
      cwd: copyFixture("active-assignment"),
      assignmentFile: ASSIGNMENT_FILE,
      options: {}
    });
    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.code).toBe("assignment_repository_mappings_json_required");
  });
});
