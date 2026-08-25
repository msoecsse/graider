import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGroupApplyManifestV2 } from "../../../src/groups/group-apply-manifest-finalizer.js";
import { runAssignmentRepositoryMappingsCommand } from "../../../src/cli/commands/assignment.command.js";
import type { GroupApplyPreviewTarget } from "../../../src/groups/group-preview-planner.js";
import type { GroupTargetExecutionResult } from "../../../src/groups/group-target-executor.js";
import { renderManifestV2Yaml } from "../../../src/manifest/manifest-v2-renderer.js";
import { loadManifest } from "../../../src/manifest/manifest-loader.js";
import { normalizeManifestRepositories } from "../../../src/manifest/repository-targets.js";

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";

const target = (id: string, students: string[], sectionId = "111"): GroupApplyPreviewTarget => ({
  targetId: id,
  mode: "group",
  groupId: id,
  repositoryName: `repo-${id}`,
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

const copyFixture = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-finalizer-mappings-"));
  fs.cpSync(path.join("tests", "fixtures", "grade", "active-assignment"), root, {
    recursive: true
  });
  return root;
};
const success = (targets: GroupApplyPreviewTarget[]): GroupTargetExecutionResult => ({
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

describe("group apply manifest finalizer", () => {
  it("builds shared student mappings only after every target succeeds", () => {
    const planned = [target("team-1", ["alpha", "beta"]), target("team-2", ["gamma"])];
    const result = buildGroupApplyManifestV2(planned, success(planned));
    expect(result.status).toBe("success");
    expect(result.targets).toHaveLength(2);
    expect(result.studentMappings).toHaveLength(3);
    expect(result.studentMappings.filter((mapping) => mapping.studentId !== "gamma")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: "team-1", repositoryName: "repo-team-1" })
      ])
    );
    expect(result.targets[0]).toMatchObject({
      groupId: "team-1",
      cloneUrl: "https://github.com/example/repo-team-1.git"
    });
    expect("cloneUrl" in (result.targets[1] ?? {})).toBe(false);
  });
  it("refuses failed or incomplete execution without partial data", () => {
    const planned = [target("team-1", ["alpha"]), target("team-2", ["beta"])];
    const incompleteExecution = success([target("team-1", ["alpha"])]);
    const failedTargetExecution = success(planned);
    for (const execution of [
      {
        ...success(planned),
        errors: [{ code: "failed", severity: "error" as const, message: "failed" }]
      },
      incompleteExecution,
      {
        ...failedTargetExecution,
        targets: failedTargetExecution.targets.map((targetResult, index) =>
          index === 0 ? { ...targetResult, status: "failed" as const } : targetResult
        )
      }
    ]) {
      const result = buildGroupApplyManifestV2(planned, execution);
      expect(result.status).toBe("failure");
      expect(result.targets).toEqual([]);
      expect(result.studentMappings).toEqual([]);
      expect(result.diagnostics[0]?.message).not.toContain("token");
    }
  });
  it("round-trips finalizer output through the v2 renderer and loader", () => {
    const planned = [
      target("team-1", ["alpha", "beta"], "111"),
      target("team-2", ["gamma"], "121")
    ];
    const finalized = buildGroupApplyManifestV2(planned, success(planned));
    if (finalized.status === "failure") {
      throw new Error("Finalization must succeed.");
    }

    const yaml = renderManifestV2Yaml({
      repositoryMode: "group",
      targets: finalized.targets,
      studentMappings: finalized.studentMappings
    });
    expect(yaml).toContain("repository_mode: group");
    expect(yaml).toContain("group_id: team-1");
    expect(yaml).toContain("clone_url: https://github.com/example/repo-team-1.git");

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "graider-v2-")), "manifest.yml");
    fs.writeFileSync(file, yaml);
    const loaded = loadManifest(file);
    if (loaded.status !== "loaded") {
      throw new Error("Manifest must load.");
    }
    const normalized = normalizeManifestRepositories(loaded.manifest);

    expect(loaded.manifest.repositoryMode).toBe("group");
    expect(normalized.targets).toHaveLength(2);
    expect(normalized.studentMappings).toHaveLength(3);
    expect(normalized.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: "team-1",
          groupId: "team-1",
          repositoryName: "repo-team-1",
          repositoryUrl: "https://github.com/example/repo-team-1",
          cloneUrl: "https://github.com/example/repo-team-1.git",
          sectionIds: ["111"],
          githubUsernames: ["alpha-gh", "beta-gh"]
        }),
        expect.objectContaining({
          targetId: "team-2",
          groupId: "team-2",
          sectionIds: ["121"]
        })
      ])
    );
    expect(
      normalized.studentMappings
        .filter((mapping) => mapping.studentId !== "gamma")
        .map((mapping) => mapping.targetId)
    ).toEqual(["team-1", "team-1"]);
    expect(
      normalized.studentMappings
        .filter((mapping) => mapping.studentId !== "gamma")
        .map((mapping) => ({
          repositoryName: mapping.repositoryName,
          repositoryUrl: mapping.repositoryUrl
        }))
    ).toEqual([
      {
        repositoryName: "repo-team-1",
        repositoryUrl: "https://github.com/example/repo-team-1"
      },
      {
        repositoryName: "repo-team-1",
        repositoryUrl: "https://github.com/example/repo-team-1"
      }
    ]);
    expect(normalized.targets[1]).not.toHaveProperty("cloneUrl");
  });

  it("is consumable by assignment repository-mappings", async () => {
    const planned = [
      target("team-1", ["alpha", "beta"], "111"),
      target("team-2", ["gamma"], "121")
    ];
    const finalized = buildGroupApplyManifestV2(planned, success(planned));
    if (finalized.status === "failure") {
      throw new Error("Finalization must succeed.");
    }

    const cwd = copyFixture();
    const manifestPath = path.join(cwd, "terms/27s1/manifests/lab04/manifest.yml");
    fs.writeFileSync(
      manifestPath,
      renderManifestV2Yaml({
        repositoryMode: "group",
        targets: finalized.targets,
        studentMappings: finalized.studentMappings
      })
    );

    const result = await runAssignmentRepositoryMappingsCommand({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      options: { json: true }
    });

    expect(result).toMatchObject({
      status: "success",
      repositoryMode: "group",
      summary: { targetCount: 2, studentMappingCount: 3 }
    });
    expect(result.studentMappings.filter((mapping) => mapping.studentId !== "gamma")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentId: "alpha",
          targetId: "team-1",
          repositoryName: "repo-team-1",
          repositoryUrl: "https://github.com/example/repo-team-1"
        }),
        expect.objectContaining({
          studentId: "beta",
          targetId: "team-1",
          repositoryName: "repo-team-1",
          repositoryUrl: "https://github.com/example/repo-team-1"
        })
      ])
    );
  });
});
