import { describe, expect, it } from "vitest";
import { createGitHubClient, readGitHubToken } from "../../src/github/github-client-factory.js";

const LIVE_TESTS_ENABLED = "true";
const DESTRUCTIVE_LIVE_TESTS_ENABLED = "true";
const EMPTY_LENGTH = 0;

const requiredLiveEnvNames = [
  "GRAIDER_LIVE_ORG",
  "GRAIDER_LIVE_TEMPLATE_REPO",
  "GRAIDER_LIVE_TEMPLATE_BRANCH",
  "GRAIDER_LIVE_SANDBOX_REPO_PREFIX",
  "GRAIDER_LIVE_TEST_USER",
  "GRAIDER_LIVE_FACULTY_TEAM",
  "GRAIDER_LIVE_GRADER_TEAM"
] as const;
const tokenEnvNames = ["GRAIDER_GITHUB_TOKEN", "GITHUB_TOKEN"] as const;

const liveTestsReady =
  process.env.GRAIDER_RUN_LIVE_GITHUB_TESTS === LIVE_TESTS_ENABLED &&
  readGitHubToken() !== undefined &&
  tokenEnvNames.some((name) => process.env[name]?.trim().length !== EMPTY_LENGTH) &&
  requiredLiveEnvNames.every((name) => process.env[name]?.trim().length !== EMPTY_LENGTH);

const destructiveLiveTestsReady =
  liveTestsReady &&
  process.env.GRAIDER_RUN_LIVE_DESTRUCTIVE_TESTS === DESTRUCTIVE_LIVE_TESTS_ENABLED;

const describeLive = liveTestsReady ? describe : describe.skip;
const itDestructive = destructiveLiveTestsReady ? it : it.skip;

describeLive("OctokitGitHubClient live sandbox tests", () => {
  const client = createGitHubClient();
  const org = process.env.GRAIDER_LIVE_ORG ?? "";
  const templateRepo = process.env.GRAIDER_LIVE_TEMPLATE_REPO ?? "";
  const templateBranch = process.env.GRAIDER_LIVE_TEMPLATE_BRANCH ?? "";
  const testUser = process.env.GRAIDER_LIVE_TEST_USER ?? "";
  const facultyTeam = process.env.GRAIDER_LIVE_FACULTY_TEAM ?? "";
  const graderTeam = process.env.GRAIDER_LIVE_GRADER_TEAM ?? "";
  const sandboxRepoPrefix = process.env.GRAIDER_LIVE_SANDBOX_REPO_PREFIX ?? "";

  it("TC-LIVE-001 validates a real template repository", async () => {
    const repository = await client.getTemplateRepository(org, templateRepo);

    expect(repository?.owner).toBe(org);
    expect(repository?.name).toBe(templateRepo);
    expect(repository?.branches).toContain(templateBranch);
  });

  it("TC-LIVE-003 reads a sandbox test user", async () => {
    const user = await client.getUser(testUser);

    expect(user?.username.toLowerCase()).toBe(testUser.toLowerCase());
  });

  it("TC-LIVE-004 reads sandbox faculty and grader teams", async () => {
    await expect(client.getTeam(org, facultyTeam)).resolves.toMatchObject({
      slug: facultyTeam
    });
    await expect(client.getTeam(org, graderTeam)).resolves.toMatchObject({
      slug: graderTeam
    });
  });

  itDestructive(
    "TC-LIVE-002 creates one student repo from a template when destructive live tests are enabled",
    async () => {
      const repoName = `${sandboxRepoPrefix}-slice19`;
      const repository = await client.createRepositoryFromTemplate({
        templateOwner: org,
        templateRepo,
        owner: org,
        name: repoName,
        private: true
      });

      expect(repository.fullName).toBe(`${org}/${repoName}`);
    }
  );

  itDestructive(
    "TC-LIVE-007 publishes a student report to a sandbox repo when destructive live tests are enabled",
    async () => {
      const repoName = `${sandboxRepoPrefix}-slice19`;
      const result = await client.writeRepositoryFile({
        owner: org,
        repo: repoName,
        path: "grading/report.md",
        content: "# Graider live sandbox report\n",
        message: "Update Graider live sandbox report",
        branch: templateBranch
      });

      expect(result.path).toBe("grading/report.md");
    }
  );
});
