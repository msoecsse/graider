import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGraiderConfig } from "../../../src/config/config-loader.js";
import { executeGroupTargets } from "../../../src/groups/group-target-executor.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";
import type { GroupApplyPreviewTarget } from "../../../src/groups/group-preview-planner.js";

const target = (
  groupId: string,
  students: string[],
  usernames: string[]
): GroupApplyPreviewTarget => ({
  targetId: groupId,
  mode: "group",
  groupId,
  repositoryName: `27s1-se2030-lab04-${groupId}`,
  sectionIds: ["001"],
  studentIds: students,
  githubUsernames: usernames,
  plannedStudentPermission: "admin",
  facultyTeam: "faculty",
  facultyTeamPermission: "admin",
  graderTeam: "graders",
  graderTeamPermission: "maintain",
  diagnostics: []
});

describe("group target executor", () => {
  it("creates once per target, adds all members as admins, and returns manifest-ready data", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [
        target("team-1", ["alpha", "beta"], ["alpha-gh", "beta-gh"]),
        target("team-2", ["gamma"], ["gamma-gh"])
      ]
    });
    expect(githubClient.mutations.createdRepositories.map((item) => item.input.name)).toEqual([
      "27s1-se2030-lab04-team-1",
      "27s1-se2030-lab04-team-2"
    ]);
    expect(githubClient.mutations.addedCollaborators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: "alpha-gh",
          permission: "admin",
          repo: "27s1-se2030-lab04-team-1"
        }),
        expect.objectContaining({
          username: "beta-gh",
          permission: "admin",
          repo: "27s1-se2030-lab04-team-1"
        }),
        expect.objectContaining({
          username: "gamma-gh",
          permission: "admin",
          repo: "27s1-se2030-lab04-team-2"
        })
      ])
    );
    expect(githubClient.mutations.teamPermissions).toHaveLength(4);
    const firstTarget = result.targets.find((item) => item.target.targetId === "team-1");
    if (firstTarget === undefined) throw new Error("team-1 result must be present.");
    expect(firstTarget.target.groupId).toBe("team-1");
    expect(firstTarget.target.studentIds).toEqual(["alpha", "beta"]);
    expect(firstTarget.status).toBe("created");
    expect(typeof firstTarget.htmlUrl).toBe("string");
    expect(typeof firstTarget.cloneUrl).toBe("string");
    expect(firstTarget.diagnostics).toEqual([]);
  });

  it("deduplicates collaborator usernames within a target", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ]
    });
    await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [target("team-dup", ["delta", "epsilon"], ["shared-gh", "shared-gh"])]
    });
    expect(githubClient.mutations.addedCollaborators).toHaveLength(1);
  });

  it("fails fast without collaborators or teams when repository creation fails", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      failures: [{ method: "createRepositoryFromTemplate", kind: "api_error" }]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [target("team-fail", ["a"], ["a-gh"]), target("later", ["b"], ["b-gh"])]
    });
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-fail", repositoryName: "27s1-se2030-lab04-team-fail" }
    });
    expect(githubClient.mutations.createdRepositories).toHaveLength(0);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
  });

  it("fails fast without teams when the first collaborator cannot be added", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ],
      failures: [{ method: "addCollaborator", kind: "api_error" }]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [
        target("team-collab", ["alpha", "beta"], ["alpha-gh", "beta-gh"]),
        target("later", ["gamma"], ["gamma-gh"])
      ]
    });
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-collab", repositoryName: "27s1-se2030-lab04-team-collab" }
    });
    expect(githubClient.mutations.createdRepositories.map((entry) => entry.input.name)).toEqual([
      "27s1-se2030-lab04-team-collab"
    ]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
  });

  it("stops remaining collaborators and later targets when a later collaborator fails", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ]
    });
    const addCollaborator = githubClient.addCollaborator.bind(githubClient);
    let calls = 0;
    githubClient.addCollaborator = async (input) => {
      calls += 1;
      if (calls === 2) throw new Error("mock collaborator failure");
      return addCollaborator(input);
    };
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [
        target("team-1", ["alpha", "beta", "gamma"], ["alpha-gh", "beta-gh", "gamma-gh"]),
        target("team-2", ["later"], ["later-gh"])
      ]
    });
    expect(githubClient.mutations.addedCollaborators.map((entry) => entry.username)).toEqual([
      "alpha-gh"
    ]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.createdRepositories.map((entry) => entry.input.name)).toEqual([
      "27s1-se2030-lab04-team-1"
    ]);
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-1", repositoryName: "27s1-se2030-lab04-team-1" }
    });
  });

  it("stops before the grader team when faculty team permission fails", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ]
    });
    githubClient.addTeamPermission = () => Promise.reject(new Error("faculty failure"));
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [
        target("team-faculty", ["alpha"], ["alpha-gh"]),
        target("later", ["beta"], ["beta-gh"])
      ]
    });
    expect(githubClient.mutations.addedCollaborators).toHaveLength(1);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-faculty", repositoryName: "27s1-se2030-lab04-team-faculty" }
    });
  });

  it("stops after faculty team permission when grader team permission fails", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ]
    });
    const addTeam = githubClient.addTeamPermission.bind(githubClient);
    let calls = 0;
    githubClient.addTeamPermission = async (input) => {
      calls += 1;
      if (calls === 2) throw new Error("grader failure");
      return addTeam(input);
    };
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [
        target("team-grader", ["alpha"], ["alpha-gh"]),
        target("later", ["beta"], ["beta-gh"])
      ]
    });
    expect(githubClient.mutations.teamPermissions).toHaveLength(1);
    expect(githubClient.mutations.teamPermissions[0]?.teamSlug).toBe("faculty");
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-grader", repositoryName: "27s1-se2030-lab04-team-grader" }
    });
  });

  it("accepts a detected grading workflow without workflow diagnostics", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ],
      workflows: [
        {
          owner: "example-org",
          repo: "27s1-se2030-lab04-team-workflow",
          workflow: { id: 1, name: "Grade", path: "grade.yml", supportsDispatch: true }
        }
      ]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [target("team-workflow", ["alpha"], ["alpha-gh"])]
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.targets[0]).toMatchObject({
      status: "created",
      target: { groupId: "team-workflow", repositoryName: "27s1-se2030-lab04-team-workflow" }
    });
  });

  it("reports pending rather than missing when a new repository workflow is not observable", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [target("team-pending", ["alpha"], ["alpha-gh"])]
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toMatchObject({
      code: "grading_workflow_pending",
      context: { groupId: "team-pending", repositoryName: "27s1-se2030-lab04-team-pending" }
    });
  });

  it("returns a safe group-scoped failure when workflow lookup fails", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ],
      failures: [{ method: "getWorkflow", kind: "api_error" }]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [target("team-api", ["alpha"], ["alpha-gh"]), target("later", ["beta"], ["beta-gh"])]
    });
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-api", repositoryName: "27s1-se2030-lab04-team-api" }
    });
    expect(result.errors[0]?.message).not.toContain("api_error");
    expect(githubClient.mutations.createdRepositories).toHaveLength(1);
  });

  it("does not adopt an unexpected untracked existing repository", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      repositories: [
        {
          owner: "example-org",
          name: "27s1-se2030-lab04-team-existing",
          fullName: "example-org/27s1-se2030-lab04-team-existing",
          id: 8,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/27s1-se2030-lab04-team-existing"
        }
      ]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [
        target("team-existing", ["alpha"], ["alpha-gh"]),
        target("later", ["beta"], ["beta-gh"])
      ]
    });
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-existing", repositoryName: "27s1-se2030-lab04-team-existing" }
    });
    expect(result.errors[0]?.message).toContain(
      "will not adopt untracked repositories automatically"
    );
    expect(githubClient.mutations.createdRepositories).toEqual([]);
    expect(githubClient.mutations.addedCollaborators).toEqual([]);
    expect(githubClient.mutations.teamPermissions).toEqual([]);
  });

  it("returns prior successes but stops on a later untracked repository collision", async () => {
    const loaded = loadGraiderConfig({
      cwd: path.resolve("tests/fixtures/plan/active-assignment"),
      assignmentFile: "terms/27s1/assignments/lab04/assignment.yml"
    });
    if (loaded.status === "failure") throw new Error("Fixture config must load.");
    const githubClient = new FakeGitHubClient({
      templateRepositories: [
        {
          owner: "example-org",
          name: "lab04-template",
          fullName: "example-org/lab04-template",
          id: 1,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/lab04-template",
          isTemplate: true,
          branches: ["main"],
          files: [],
          latestCommitSha: "sha"
        }
      ],
      repositories: [
        {
          owner: "example-org",
          name: "27s1-se2030-lab04-team-2",
          fullName: "example-org/27s1-se2030-lab04-team-2",
          id: 9,
          private: true,
          archived: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/example-org/27s1-se2030-lab04-team-2"
        }
      ]
    });
    const result = await executeGroupTargets({
      config: loaded.config,
      githubClient,
      targets: [
        target("team-1", ["alpha"], ["alpha-gh"]),
        target("team-2", ["beta"], ["beta-gh"]),
        target("team-3", ["gamma"], ["gamma-gh"])
      ]
    });
    expect(result.targets[0]).toMatchObject({ status: "created", target: { groupId: "team-1" } });
    expect(result.errors[0]).toMatchObject({
      context: { groupId: "team-2", repositoryName: "27s1-se2030-lab04-team-2" }
    });
    expect(githubClient.mutations.createdRepositories.map((entry) => entry.input.name)).toEqual([
      "27s1-se2030-lab04-team-1"
    ]);
    expect(githubClient.mutations.addedCollaborators.map((entry) => entry.username)).toEqual([
      "alpha-gh"
    ]);
    expect(githubClient.mutations.teamPermissions).toHaveLength(2);
  });
});
