import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  downloadAssignmentRepositories as download,
  type RepositoryDownloadDependencies
} from "../../../src/repository-download/repository-download.js";
import {
  GitError,
  type GitAuthenticationContext,
  type CloneRequest,
  type GitWorkspaceFactory,
  type GitWorkspaceReader,
  type GitWorkspacePreparer
} from "../../../src/git/git-workspace.js";
import { SystemGitWorkspaceFactory } from "../../../src/git/system-git-workspace.js";
import * as dugiteContext from "../../../src/git/dugite-git-workspace-context.js";
import { renderManifestV2Yaml } from "../../../src/manifest/manifest-v2-renderer.js";

vi.mock("../../../src/git/dugite-git-workspace-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof dugiteContext>();
  return {
    ...actual,
    createDugiteGitWorkspaceFactory: vi.fn(actual.createDugiteGitWorkspaceFactory)
  };
});

const ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const downloadAssignmentRepositories = (request: Parameters<typeof download>[0]) =>
  download({ token: "unit-download-token", ...request });
const copyFixture = (): string => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "graider-repository-download-"));
  fs.cpSync(path.join("tests", "fixtures", "grade", "active-assignment"), cwd, {
    recursive: true
  });
  return cwd;
};

const createDependencies = (
  git = createGitFactory(),
  existsSync: (value: string) => boolean = vi.fn().mockReturnValue(false)
): RepositoryDownloadDependencies => ({
  existsSync,
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  git
});

const createGitFactory = (
  configuration: {
    readonly verifyAvailable?: () => Promise<void>;
    readonly clone?: (request: CloneRequest) => Promise<GitWorkspaceReader>;
  } = {}
): GitWorkspaceFactory => ({
  verifyAvailable:
    configuration.verifyAvailable ?? vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  clone:
    configuration.clone ??
    vi
      .fn<(request: CloneRequest) => Promise<GitWorkspaceReader>>()
      .mockResolvedValue({ root: "/downloaded" } as GitWorkspaceReader),
  inspect: vi.fn(),
  open: vi.fn()
});

describe("downloadAssignmentRepositories", () => {
  it("composes the Dugite factory by default with the download credential resolver", async () => {
    const git = new SystemGitWorkspaceFactory();
    vi.spyOn(git, "verifyAvailable").mockResolvedValue(undefined);
    const clone = vi
      .spyOn(git, "clone")
      .mockResolvedValue({ root: "/downloaded" } as GitWorkspacePreparer);
    const factory = vi.mocked(dugiteContext.createDugiteGitWorkspaceFactory).mockReturnValue(git);
    try {
      const { git: injectedGit, ...filesystem } = createDependencies(git);
      expect(injectedGit).toBe(git);
      const result = await downloadAssignmentRepositories({
        cwd: copyFixture(),
        assignmentFile: ASSIGNMENT_FILE,
        destination: "/downloads/lab04",
        dependencies: filesystem
      });
      expect(factory).toHaveBeenCalledTimes(1);
      expect(typeof factory.mock.calls[0]?.[0]?.resolve).toBe("function");
      expect(result.status).toBe("success");
      expect(clone).toHaveBeenCalledTimes(4);
    } finally {
      factory.mockRestore();
    }
  });

  it("does not invoke Git when authentication is unavailable with an injected factory", async () => {
    const verifyAvailable = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const clone = vi.fn<(request: CloneRequest) => Promise<GitWorkspaceReader>>();
    const git = createGitFactory({ verifyAvailable, clone });
    const result = await download({
      cwd: copyFixture(),
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(git)
    });
    expect(result).toMatchObject({ status: "failure", exitCode: 1, targets: [] });
    expect(result.diagnostics[0]?.code).toBe("github_auth_missing");
    expect(verifyAvailable).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });

  it("keeps credential-bearing clone errors out of results and diagnostics", async () => {
    const token = "repository-download-distinctive-fake-secret";
    const clone = vi
      .fn<(request: CloneRequest) => Promise<GitWorkspaceReader>>()
      .mockRejectedValue(new Error(token));
    const git = createGitFactory({ clone });
    const result = await download({
      cwd: copyFixture(),
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      token,
      dependencies: createDependencies(git)
    });
    expect(result.status).toBe("failure");
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result.diagnostics)).not.toContain(token);
    expect(JSON.stringify(clone.mock.calls)).not.toContain(token);
  });
  it("clones one target for each individual manifest repository with safe target rows", async () => {
    const cwd = copyFixture();
    const clone = vi.fn().mockResolvedValue({ root: "/downloaded" });
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(createGitFactory({ clone }))
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
    expect(clone).toHaveBeenCalledTimes(4);
    expect(clone.mock.calls.map(([request]) => request as CloneRequest)).toEqual([
      {
        remote: "https://github.com/example-org/27s1-se2030-lab04-seanjones",
        destination: "/downloads/lab04/27s1-se2030-lab04-seanjones",
        checkout: "default",
        authentication: expect.any(Object) as GitAuthenticationContext
      },
      {
        remote: "https://github.com/example-org/27s1-se2030-lab04-janesmith",
        destination: "/downloads/lab04/27s1-se2030-lab04-janesmith",
        checkout: "default",
        authentication: expect.any(Object) as GitAuthenticationContext
      },
      {
        remote: "https://github.com/example-org/27s1-se2030-lab04-kimstudent",
        destination: "/downloads/lab04/27s1-se2030-lab04-kimstudent",
        checkout: "default",
        authentication: expect.any(Object) as GitAuthenticationContext
      },
      {
        remote: "https://github.com/example-org/27s1-se2030-lab04-leehold",
        destination: "/downloads/lab04/27s1-se2030-lab04-leehold",
        checkout: "default",
        authentication: expect.any(Object) as GitAuthenticationContext
      }
    ]);
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
    const clone = vi
      .fn()
      .mockRejectedValueOnce(new Error("clone failed"))
      .mockResolvedValueOnce({ root: "/downloaded" });
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(createGitFactory({ clone }))
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
    expect(clone).toHaveBeenCalledTimes(2);
    expect(clone).toHaveBeenNthCalledWith(2, {
      remote: "https://github.com/example-org/27s1-se2030-lab04-team-2",
      destination: "/downloads/lab04/27s1-se2030-lab04-team-2",
      checkout: "default",
      authentication: expect.any(Object) as GitAuthenticationContext
    });
  });

  it("fails before target validation when the Git engine is unavailable", async () => {
    const cwd = copyFixture();
    const clone = vi.fn();
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(
        createGitFactory({
          verifyAvailable: vi
            .fn()
            .mockRejectedValue(new GitError("engine_unavailable", "verify_available")),
          clone
        })
      )
    });

    expect(result).toMatchObject({
      status: "failure",
      exitCode: 1,
      clonedCount: 0,
      failedCount: 0,
      targets: []
    });
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "repository_download_git_unavailable"
    ]);
    expect(clone).not.toHaveBeenCalled();
  });

  it("does not clone an existing destination", async () => {
    const cwd = copyFixture();
    const clone = vi.fn();
    const existsSync = vi.fn((value: string) => value.endsWith("seanjones"));
    const dependencies = createDependencies(createGitFactory({ clone }), existsSync);
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies
    });

    expect(result.targets[0]?.diagnostics[0]?.code).toBe("repository_download_destination_exists");
    expect(clone).toHaveBeenCalledTimes(3);
  });

  it("does not clone an unsafe repository-name-derived destination", async () => {
    const cwd = copyFixture();
    const clone = vi.fn();
    const manifestPath = path.join(cwd, "terms/27s1/manifests/lab04/manifest.yml");
    fs.writeFileSync(
      manifestPath,
      fs
        .readFileSync(manifestPath, "utf8")
        .replace("name: 27s1-se2030-lab04-seanjones", "name: ../outside-download-root")
    );
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(createGitFactory({ clone }))
    });

    expect(result.targets[0]?.diagnostics[0]?.code).toBe("repository_download_unsafe_path");
    expect(clone).toHaveBeenCalledTimes(3);
  });

  it("retains missing clone-source diagnostics without invoking clone", async () => {
    const cwd = copyFixture();
    const clone = vi.fn();
    const manifestPath = path.join(cwd, "terms/27s1/manifests/lab04/manifest.yml");
    fs.writeFileSync(
      manifestPath,
      fs.readFileSync(manifestPath, "utf8").replaceAll(/html_url: .*/gu, 'html_url: ""')
    );
    const result = await downloadAssignmentRepositories({
      cwd,
      assignmentFile: ASSIGNMENT_FILE,
      destination: "/downloads/lab04",
      dependencies: createDependencies(createGitFactory({ clone }))
    });

    expect(result.targets[0]?.diagnostics[0]?.code).toBe("repository_download_clone_url_missing");
    expect(clone).not.toHaveBeenCalled();
  });
});
