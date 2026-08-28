import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  downloadAssignmentRepositories,
  type RepositoryDownloadDependencies
} from "../../../src/repository-download/repository-download.js";
import { renderManifestV2Yaml } from "../../../src/manifest/manifest-v2-renderer.js";

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const copyFixture = (): string => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-repository-download-"));
  fs.cpSync(path.join("tests", "fixtures", "grade", "active-assignment"), cwd, {
    recursive: true
  });
  return cwd;
};

const createDependencies = (
  execFile = vi.fn().mockResolvedValue(undefined)
): RepositoryDownloadDependencies => ({
  existsSync: vi.fn().mockReturnValue(false),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  execFile
});

describe("downloadAssignmentRepositories", () => {
  it("clones one target for each individual manifest repository with safe target rows", async () => {
    const cwd = copyFixture();
    const execFile = vi.fn().mockResolvedValue(undefined);
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(execFile)
    });

    expect(result).toMatchObject({
      commandName: "assignment download-repositories",
      repositoryMode: "individual",
      status: "success",
      totalTargets: 4,
      clonedCount: 4,
      failedCount: 0
    });
    expect(result.targets.map((target) => target.repositoryName)).toEqual([
      "27s1-se2030-lab04-seanjones",
      "27s1-se2030-lab04-janesmith",
      "27s1-se2030-lab04-kimstudent",
      "27s1-se2030-lab04-leehold"
    ]);
    expect(execFile).toHaveBeenCalledTimes(5);
    expect(execFile).toHaveBeenNthCalledWith(1, "git", ["--version"]);
    expect(result.targets[0]).toMatchObject({
      studentIds: ["jones"],
      githubUsernames: ["seanjones"],
      status: "cloned"
    });
  });

  it("deduplicates group members into one clone target and continues after a failed clone", async () => {
    const cwd = copyFixture();
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
          },
          {
            targetId: "team-2",
            mode: "group",
            groupId: "team-2",
            repositoryName: "27s1-se2030-lab04-team-2",
            htmlUrl: "https://github.com/example-org/27s1-se2030-lab04-team-2",
            sectionIds: ["002"],
            studentIds: ["lee"],
            githubUsernames: ["leehold"],
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
          },
          {
            studentId: "lee",
            githubUsername: "leehold",
            targetId: "team-2",
            repositoryName: "27s1-se2030-lab04-team-2",
            htmlUrl: "https://github.com/example-org/27s1-se2030-lab04-team-2"
          }
        ]
      })
    );
    const execFile = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("clone failed"))
      .mockResolvedValueOnce(undefined);
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(execFile)
    });

    expect(result).toMatchObject({
      repositoryMode: "group",
      status: "partial_success",
      totalTargets: 2,
      clonedCount: 1,
      failedCount: 1
    });
    expect(result.targets[0]).toMatchObject({
      targetId: "team-1",
      groupId: "team-1",
      studentIds: ["jones", "smith"],
      status: "failed"
    });
    expect(result.targets[1]).toMatchObject({ targetId: "team-2", status: "cloned" });
    expect(execFile).toHaveBeenCalledTimes(3);
    expect(execFile).toHaveBeenNthCalledWith(2, "git", [
      "clone",
      "https://github.com/example-org/27s1-se2030-lab04-team-1.git",
      "/downloads/lab04/27s1-se2030-lab04-team-1"
    ]);
    expect(execFile).toHaveBeenNthCalledWith(3, "git", [
      "clone",
      "https://github.com/example-org/27s1-se2030-lab04-team-2",
      "/downloads/lab04/27s1-se2030-lab04-team-2"
    ]);
  });
});
