import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAssignmentRepositoryMappingsCommand } from "../../../src/cli/commands/assignment.command.js";
import { writeGroupApplyManifestV2 } from "../../../src/groups/group-apply-manifest-writer.js";
import type { GroupTargetExecutionResult } from "../../../src/groups/group-target-executor.js";
import type { GroupApplyPreviewTarget } from "../../../src/groups/group-preview-planner.js";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../../src/manifest/manifest-paths.js";

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";

const target = (id: string, students: string[], sectionId = "111"): GroupApplyPreviewTarget => ({
  targetId: id,
  mode: "group",
  groupId: id,
  repositoryName: `27s1-se2030-lab04-${id}`,
  sectionIds: [sectionId],
  studentIds: students,
  githubUsernames: students.map((student) => `${student}-gh`),
  plannedStudentPermission: "admin",
  facultyTeam: "faculty",
  facultyTeamPermission: "admin",
  graderTeam: "graders",
  graderTeamPermission: "maintain",
  diagnostics: []
});

const successfulExecution = (
  targets: readonly GroupApplyPreviewTarget[]
): GroupTargetExecutionResult => ({
  targets: targets.map((item, index) => ({
    target: item,
    htmlUrl: `https://github.com/example/${item.repositoryName}`,
    ...(index === 0
      ? { cloneUrl: `https://github.com/example/${item.repositoryName}.git` }
      : { cloneUrl: null }),
    status: "created",
    diagnostics: []
  })),
  warnings: [],
  errors: []
});

const copyFixture = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-group-manifest-writer-"));
  fs.cpSync(path.join("tests", "fixtures", "grade", "active-assignment"), root, {
    recursive: true
  });
  return root;
};

describe("group apply manifest writer", () => {
  it("writes a finalized v2 group manifest that repository-mappings can read", async () => {
    const repoRoot = copyFixture();
    const plannedTargets = [
      target("team-1", ["alpha", "beta"], "111"),
      target("team-2", ["gamma"], "121")
    ];
    const result = writeGroupApplyManifestV2({
      repoRoot,
      termCode: "27s1",
      assignmentSlug: "lab04",
      plannedTargets,
      execution: successfulExecution(plannedTargets)
    });

    const manifestPath = createManifestPath(repoRoot, "27s1", "lab04");
    expect(result).toEqual({
      status: "success",
      manifestPath: manifestPath.relativePath,
      diagnostics: []
    });
    expect(fs.existsSync(manifestPath.absolutePath)).toBe(true);

    const manifest = loadManifest(manifestPath.absolutePath);
    if (manifest.status !== "loaded") {
      throw new Error("Written group manifest must load.");
    }
    expect(manifest.manifest.repositoryMode).toBe("group");
    expect(manifest.manifest.targets).toHaveLength(2);
    expect(manifest.manifest.studentMappings).toHaveLength(3);

    const mappings = await runAssignmentRepositoryMappingsCommand({
      cwd: repoRoot,
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true }
    });
    expect(mappings).toMatchObject({
      status: "success",
      repositoryMode: "group",
      summary: { targetCount: 2, studentMappingCount: 3 }
    });
    expect(mappings.studentMappings.filter((mapping) => mapping.studentId !== "gamma")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: "alpha",
          targetId: "team-1",
          repositoryName: "27s1-se2030-lab04-team-1",
          repositoryUrl: "https://github.com/example/27s1-se2030-lab04-team-1"
        }),
        expect.objectContaining({
          studentId: "beta",
          targetId: "team-1",
          repositoryName: "27s1-se2030-lab04-team-1",
          repositoryUrl: "https://github.com/example/27s1-se2030-lab04-team-1"
        })
      ])
    );
  });

  it("refuses incomplete execution without creating a partial manifest", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-group-manifest-refusal-"));
    const plannedTargets = [target("team-1", ["alpha"]), target("team-2", ["beta"])];
    const completeExecution = successfulExecution(plannedTargets);
    const incompleteExecution = successfulExecution([target("team-1", ["alpha"])]);
    const failedExecution = {
      ...completeExecution,
      targets: completeExecution.targets.map((result, index) =>
        index === 1 ? { ...result, status: "failed" as const } : result
      )
    };
    const missingUrlExecution = {
      ...completeExecution,
      targets: completeExecution.targets.map((result, index) =>
        index === 0 ? { ...result, htmlUrl: null } : result
      )
    };
    const mismatchedTargetExecution = {
      ...completeExecution,
      targets: completeExecution.targets.map((result, index) =>
        index === 0 ? { ...result, target: { ...result.target, targetId: "unexpected" } } : result
      )
    };

    for (const execution of [
      {
        ...completeExecution,
        errors: [{ code: "failed", severity: "error" as const, message: "x" }]
      },
      incompleteExecution,
      failedExecution,
      missingUrlExecution,
      mismatchedTargetExecution
    ]) {
      const result = writeGroupApplyManifestV2({
        repoRoot,
        termCode: "27s1",
        assignmentSlug: "lab04",
        plannedTargets,
        execution
      });
      expect(result.status).toBe("failure");
      expect(result.diagnostics[0]?.message).not.toContain("token");
      expect(fs.existsSync(createManifestPath(repoRoot, "27s1", "lab04").absolutePath)).toBe(false);
    }
  });

  it("returns a safe failure when the manifest write fails", () => {
    const repoRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "graider-group-manifest-write-failure-")
    );
    const plannedTargets = [target("team-1", ["alpha"])];
    const result = writeGroupApplyManifestV2({
      repoRoot,
      termCode: "27s1",
      assignmentSlug: "lab04",
      plannedTargets,
      execution: successfulExecution(plannedTargets),
      fileSystem: {
        mkdirSync: () => undefined,
        writeFileSync: () => {
          throw new Error("mock write failure");
        }
      }
    });

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.code).toBe("manifest_write_failed");
    expect(result.diagnostics[0]?.message).not.toContain("mock write failure");
    expect(result.diagnostics[0]?.message).not.toContain("token");
    expect(fs.existsSync(createManifestPath(repoRoot, "27s1", "lab04").absolutePath)).toBe(false);
  });

  it("rejects a derived path outside the repository root without writing", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-group-manifest-path-"));
    const plannedTargets = [target("team-1", ["alpha"])];
    const result = writeGroupApplyManifestV2({
      repoRoot,
      termCode: "../outside",
      assignmentSlug: "lab04",
      plannedTargets,
      execution: successfulExecution(plannedTargets)
    });

    expect(result.status).toBe("failure");
    expect(result.diagnostics[0]?.message).toContain("outside the repository root");
    expect(
      fs.existsSync(path.join(repoRoot, "outside", "manifests", "lab04", "manifest.yml"))
    ).toBe(false);
  });
});
