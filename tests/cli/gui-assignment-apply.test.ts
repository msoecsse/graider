import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { exec } from "dugite";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLegacyCliMutation } from "../../src/cli/legacy-mutation-boundary.js";
import { runManagedAssignmentApply } from "../../src/execution/assignment-apply-context.js";
import * as backendAdapter from "../../ui/electron/assignmentApplyBackend.js";
import { endAuthoritativeLegacyCliMutation } from "../../src/execution/authoritative-legacy-course.js";
import * as composition from "../../src/github/github-client-composition.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import { GitHubClientError } from "../../src/github/github-errors.js";
import { applyAssignment } from "../../ui/electron/assignmentApplyRunner.js";
import {
  courseOperationAuthentication,
  managedCourseOperation
} from "../../ui/electron/managedCourseOperationContext.js";
import { saveAssignmentSetup } from "../../ui/electron/assignmentSetupService.js";
import type { ProcessRunner } from "../../ui/electron/commandRunner.js";

const BUNDLED_BACKEND = path.resolve("ui/dist-electron/assignmentApplyBackend.cjs");
const OAUTH_TOKEN = "oauth-fixture-secret";
const COURSE_ID = 20;
const USER_ID = 42;
const ASSIGNMENT_FILE = "terms/27s1/assignments/lab05/assignment.yml";
const roots: string[] = [];
const git = async (root: string, args: string[]) => {
  const result = await exec(args, root);
  if (result.exitCode !== 0) throw new Error(`Git fixture failed: ${args[0] ?? "unknown"}`);
  return result.stdout.trim();
};
afterEach(() => {
  endAuthoritativeLegacyCliMutation();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const fixture = async (repositoryMode: "individual" | "group" = "individual") => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "graider-gui-apply-"));
  roots.push(base);
  const root = path.join(base, "repo");
  fs.cpSync(path.resolve("tests/fixtures/apply/active-assignment"), root, { recursive: true });
  const courseFile = path.join(root, "course.yml");
  fs.writeFileSync(
    courseFile,
    fs
      .readFileSync(courseFile, "utf8")
      .replace("repository: se2030-graider", "repository: old-course-name")
  );
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "Fixture"]);
  await git(root, ["config", "user.email", "fixture@example.test"]);
  await git(root, ["remote", "add", "origin", "https://github.com/example-org/se2030-graider.git"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "Initial"]);
  const previousRevision = await git(root, ["rev-parse", "HEAD"]);
  expect(
    saveAssignmentSetup({
      courseFolderId: "registered",
      courseFolderPath: root,
      assignmentTitle: "Lab 05",
      assignmentSlug: "lab05",
      termCode: "27s1",
      sectionIds: ["001"],
      templateRepository: "",
      templateBranch: "",
      dueAt: "2027-06-15T23:59:00-05:00",
      gradingEnabled: false,
      points: null,
      facultyOwner: "professor",
      lmsAssignmentId: "",
      gradingCategory: "labs",
      requiredFiles: [],
      rubric: [],
      confirmed: true,
      replaceExisting: false
    })
  ).toMatchObject({ status: "success" });
  if (repositoryMode === "group") {
    const assignmentPath = path.join(root, ASSIGNMENT_FILE);
    fs.writeFileSync(
      assignmentPath,
      fs.readFileSync(assignmentPath, "utf8").replace(/grading:\n[\s\S]*$/u, "")
    );
    fs.appendFileSync(
      assignmentPath,
      "\nrepository_mode: group\ngroups:\n  file: groups.csv\ngrading:\n  enabled: true\n  mode: preset\n  preset: java-junit-checkstyle\n  workflow: .github/workflows/grade.yml\n  artifact: grading-results\n  result_file: results.json\n"
    );
    fs.writeFileSync(
      path.join(path.dirname(assignmentPath), "groups.csv"),
      "group_id,student_id\nteam-1,jones\n"
    );
  }
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "Publish new assignment"]);
  const revision = await git(root, ["rev-parse", "HEAD"]);
  const client = new FakeGitHubClient({
    authenticatedUser: { id: USER_ID, username: "faculty" },
    repositories: [
      {
        id: COURSE_ID,
        owner: "example-org",
        name: "se2030-graider",
        fullName: "example-org/se2030-graider",
        private: true,
        archived: false,
        defaultBranch: "main",
        htmlUrl: "https://github.com/example-org/se2030-graider"
      }
    ],
    teams: [{ org: "example-org", slug: "faculty", name: "Faculty" }],
    users: [{ username: "seanjones" }, { username: "janesmith" }]
  });
  const getRevision = vi.spyOn(client, "getDefaultBranchCommitSha");
  getRevision.mockImplementation((_owner, repo) =>
    Promise.resolve(repo === "se2030-graider" ? revision : "student-head")
  );
  const content = fs.readFileSync(path.join(root, "course.yml"), "utf8");
  const read = client.getRepositoryFileContent.bind(client);
  const readCourse = vi
    .spyOn(client, "getRepositoryFileContent")
    .mockImplementation(async (owner, repo, file, ref) =>
      repo === "se2030-graider" && file === "course.yml" ? content : read(owner, repo, file, ref)
    );
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const originalResolve = composition.resolveProductionGitHubClient;
  const resolve = vi.spyOn(composition, "resolveProductionGitHubClient");
  resolve.mockImplementation((options = {}) =>
    originalResolve({ ...options, githubClient: options.githubClient ?? client })
  );
  vi.spyOn(backendAdapter, "runManagedAssignmentApply").mockImplementation(async (request) => {
    expect(request.token).toBe(OAUTH_TOKEN);
    return await runManagedAssignmentApply(request, { githubClient: client });
  });
  const runner: ProcessRunner = vi.fn();
  let authorized = true;
  const revalidate = vi.fn(() =>
    authorized ? Promise.resolve() : Promise.reject(new Error(OAUTH_TOKEN))
  );
  const run = (env: NodeJS.ProcessEnv) =>
    courseOperationAuthentication.run({ token: OAUTH_TOKEN }, () =>
      managedCourseOperation.run(
        {
          userId: USER_ID,
          repositoryId: COURSE_ID,
          authoritativeCommit: revision,
          operationalCommit: revision,
          mode: "new_mutation",
          managed: true,
          courseFolderId: "registered",
          courseFolderPath: root,
          revalidate
        },
        () =>
          applyAssignment(
            {
              courseFolderId: "registered",
              courseFolderPath: root,
              assignmentFile: ASSIGNMENT_FILE
            },
            { runner, env }
          )
      )
    );
  return {
    root,
    client,
    run,
    runner,
    previousRevision,
    revision,
    getRevision,
    readCourse,
    invalidate: () => {
      authorized = false;
    }
  };
};
describe("GUI OAuth Apply backend boundary", () => {
  it("revalidates authority before a managed group workflow write and preserves its checkpoint", async () => {
    const f = await fixture("group");
    const enableActions = f.client.enableActions.bind(f.client);
    vi.spyOn(f.client, "enableActions").mockImplementation(async (owner, repo) => {
      await enableActions(owner, repo);
      f.invalidate();
    });
    const result = await f.run({});
    expect(result.apply?.status).toBe("failure");
    expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
    expect(f.client.mutations.addedCollaborators).toHaveLength(1);
    expect(f.client.mutations.teamPermissions).toHaveLength(1);
    expect(f.client.mutations.enabledActions).toHaveLength(1);
    expect(f.client.mutations.fileWrites).toEqual([]);
    expect(f.client.workflowReads).toEqual([]);
    expect(result.apply?.summary).toMatchObject({
      manifestWritten: true,
      groupTargets: [{ status: "failed", groupId: "team-1" }]
    });
    expect(JSON.stringify(result)).not.toContain(OAUTH_TOKEN);
    expect(await git(f.root, ["status", "--porcelain"])).toBe("");
  });

  it("loads the bundled backend and applies using the same guarded capability and runtime layout", async () => {
    const f = await fixture();
    const backend = createRequire(import.meta.url)(BUNDLED_BACKEND) as {
      runManagedAssignmentApply: typeof runManagedAssignmentApply;
    };
    vi.mocked(backendAdapter.runManagedAssignmentApply).mockImplementation((request) =>
      backend.runManagedAssignmentApply(request, { githubClient: f.client })
    );
    const result = await f.run({});
    expect(result.apply?.errors).toEqual([]);
    expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
    expect(await git(f.root, ["status", "--porcelain"])).toBe("");
  });
  it("rechecks the live session after planning before creating a student repository", async () => {
    const f = await fixture();
    const read = f.client.getRepository.bind(f.client);
    vi.spyOn(f.client, "getRepository").mockImplementation(async (owner, repo) => {
      if (repo !== "se2030-graider") f.invalidate();
      return await read(owner, repo);
    });
    const result = await f.run({});
    expect(result.apply?.summary).toMatchObject({ created: 0, failed: 1 });
    expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(0);
    expect(f.client.mutations.addedCollaborators).toHaveLength(0);
    expect(JSON.stringify(result)).toContain("course_authorization_changed");
    expect(JSON.stringify(result)).not.toContain(OAUTH_TOKEN);
  });
  it("checkpoints a created repository when the course changes, then resumes without recreating it", async () => {
    const f = await fixture();
    const create = f.client.createRepository.bind(f.client);
    vi.spyOn(f.client, "createRepository").mockImplementation(async (input) => {
      const repository = await create(input);
      f.getRevision.mockResolvedValue(f.previousRevision);
      return repository;
    });
    const partial = await f.run({});
    expect(partial.apply?.status).toBe("partial_success");
    expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
    expect(f.client.mutations.addedCollaborators).toHaveLength(0);
    expect(JSON.stringify(partial)).toContain("course_revision_mismatch");
    f.getRevision.mockImplementation((_owner, repo) =>
      Promise.resolve(repo === "se2030-graider" ? f.revision : "student-head")
    );
    const resumed = await f.run({});
    expect(resumed.status).toBe("success");
    expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
    expect(await git(f.root, ["status", "--porcelain"])).toBe("");
  });

  it.each([
    ["account", "course_account_mismatch"],
    ["permissions", "course_access_denied"],
    ["repository", "course_repository_mismatch"],
    ["revision", "course_revision_mismatch"],
    ["head", "course_revision_mismatch"],
    ["origin", "course_repository_mismatch"],
    ["remote_schema", "course_authoritative_schema_invalid"],
    ["local_schema", "course_local_schema_invalid"],
    ["guard", "course_authorization_changed"]
  ] as const)(
    "blocks later Apply mutations after %s changes between writes",
    async (changed, code) => {
      const f = await fixture();
      const create = f.client.createRepository.bind(f.client);
      const repository = await f.client.getRepository("example-org", "se2030-graider");
      if (!repository) throw new Error("Missing course repository fixture.");
      vi.spyOn(f.client, "createRepository").mockImplementation(async (input) => {
        const created = await create(input);
        if (changed === "account")
          vi.spyOn(f.client, "getAuthenticatedUser").mockResolvedValue({
            id: USER_ID + 1,
            username: "other"
          });
        if (changed === "permissions")
          vi.spyOn(f.client, "getRepository").mockRejectedValue(
            new GitHubClientError("permission_denied", OAUTH_TOKEN)
          );
        if (changed === "repository")
          vi.spyOn(f.client, "getRepository").mockResolvedValue({
            ...repository,
            id: COURSE_ID + 1
          });
        if (changed === "revision") f.getRevision.mockResolvedValue(f.previousRevision);
        if (changed === "head")
          await git(f.root, ["commit", "--allow-empty", "-m", "Concurrent local change"]);
        if (changed === "origin")
          await git(f.root, ["remote", "set-url", "origin", "https://github.com/other/course.git"]);
        if (changed === "remote_schema") f.readCourse.mockResolvedValue("schema_version: 2\n");
        if (changed === "local_schema")
          fs.writeFileSync(path.join(f.root, "course.yml"), "schema_version: 2\n");
        if (changed === "guard") f.invalidate();
        return created;
      });
      const result = await f.run({});
      expect(result.apply?.status).toBe("partial_success");
      expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
      expect(f.client.mutations.addedCollaborators).toHaveLength(0);
      expect(f.client.mutations.teamPermissions).toHaveLength(0);
      expect(JSON.stringify(result)).toContain(code);
      expect(JSON.stringify(result)).not.toContain(OAUTH_TOKEN);
    }
  );

  it("accepts standalone legacy metadata names after authoritative identity verification", async () => {
    const f = await fixture();
    const command = new Command("apply");
    command.args = [ASSIGNMENT_FILE];
    command.setOptionValue("json", true);
    await expect(checkLegacyCliMutation(command)).resolves.toBeUndefined();
    expect(f.getRevision).toHaveBeenCalledWith("example-org", "se2030-graider");
    expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(0);
  });

  it.each([{}, { GRAIDER_GITHUB_TOKEN: "other-github-identity", GITHUB_TOKEN: "other-fallback" }])(
    "creates then immediately applies with OAuth and no gh authentication (%j)",
    async (env) => {
      const f = await fixture();
      expect(f.previousRevision).not.toBe(f.revision);
      const result = await f.run(env);
      expect(result.apply?.errors).toEqual([]);
      expect(result.status).toBe("success");
      expect(f.runner).not.toHaveBeenCalled();
      expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
      const again = await f.run(env);
      expect(again.status).toBe("success");
      expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(1);
      expect(
        fs.existsSync(
          path.join(path.dirname(f.root), "runtime/terms/27s1/manifests/lab05/manifest.yml")
        )
      ).toBe(true);
      expect(await git(f.root, ["status", "--porcelain"])).toBe("");
      expect(JSON.stringify(result)).not.toContain(OAUTH_TOKEN);
    }
  );
  it.each([
    ["stale", "course_revision_mismatch"],
    ["wrong_account", "course_account_mismatch"],
    ["wrong_repository", "course_repository_mismatch"],
    ["denied", "course_access_denied"],
    ["schema", "course_authoritative_schema_invalid"]
  ] as const)(
    "refuses %s without modifying student repositories or writing manifests",
    async (failure, diagnosticCode) => {
      const f = await fixture();
      if (failure === "stale") f.getRevision.mockResolvedValue(f.previousRevision);
      if (failure === "wrong_account")
        vi.spyOn(f.client, "getAuthenticatedUser").mockResolvedValue({ id: 43, username: "other" });
      if (failure === "wrong_repository") {
        const repository = await f.client.getRepository("example-org", "se2030-graider");
        if (!repository) throw new Error("Missing repository fixture.");
        vi.spyOn(f.client, "getRepository").mockResolvedValue({ ...repository, id: COURSE_ID + 1 });
      }
      if (failure === "schema")
        vi.spyOn(f.client, "getRepositoryFileContent").mockResolvedValue("schema_version: 2\n");
      if (failure === "denied")
        vi.spyOn(f.client, "getRepository").mockRejectedValue(
          new GitHubClientError("permission_denied", OAUTH_TOKEN)
        );
      const result = await f.run({});
      expect(result.status).toBe("failure");
      expect(result.apply?.errors).toEqual([
        expect.objectContaining({
          code: diagnosticCode
        })
      ]);
      expect(f.client.mutations.createdRepositoriesWithoutTemplate).toHaveLength(0);
      expect(f.client.mutations.addedCollaborators).toHaveLength(0);
      expect(
        fs.existsSync(
          path.join(path.dirname(f.root), "runtime/terms/27s1/manifests/lab05/manifest.yml")
        )
      ).toBe(false);
      expect(JSON.stringify(result)).not.toContain(OAUTH_TOKEN);
    }
  );
});
