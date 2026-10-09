import { describe, expect, it, vi } from "vitest";
import { runAssignmentDetailCommand } from "../../src/cli/commands/assignment.command.js";
import { runDashboardCommand } from "../../src/cli/commands/dashboard.command.js";
import { FakeGitHubClient } from "../../src/github/fake-github-client.js";
import { createGitHubClient } from "../../src/github/github-client-factory.js";

vi.mock("../../src/github/github-client-factory.js", () => ({ createGitHubClient: vi.fn() }));

const cwd = "tests/fixtures/grade/active-assignment";
const assignmentFile = "terms/27s1/assignments/lab04/assignment.yml";
const commands = [
  {
    name: "assignment",
    missingCode: "github_token_required",
    run: (env: Record<string, string | undefined>, githubClient?: FakeGitHubClient) =>
      runAssignmentDetailCommand({
        cwd,
        assignmentFile,
        options: { json: true },
        env,
        ...(githubClient === undefined ? {} : { githubClient })
      })
  },
  {
    name: "dashboard",
    missingCode: "github_token_missing",
    run: (env: Record<string, string | undefined>, githubClient?: FakeGitHubClient) =>
      runDashboardCommand({
        cwd,
        options: { json: true },
        env,
        ...(githubClient === undefined ? {} : { githubClient })
      })
  }
];

describe.each(commands)("$name GitHub client composition", ({ run, missingCode }) => {
  it("uses the custom environment rather than ambient credentials", async () => {
    vi.stubEnv("GRAIDER_GITHUB_TOKEN", "ambient-token");
    vi.mocked(createGitHubClient).mockReturnValue(new FakeGitHubClient());
    try {
      await run({ GITHUB_TOKEN: "custom-token" });
      expect(createGitHubClient).toHaveBeenCalledExactlyOnceWith({ token: "custom-token" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps an empty custom environment token-missing despite ambient credentials", async () => {
    vi.stubEnv("GRAIDER_GITHUB_TOKEN", "ambient-token");
    vi.mocked(createGitHubClient).mockReturnValue(new FakeGitHubClient());
    try {
      const result = await run({});
      expect(JSON.stringify(result)).toContain(missingCode);
      expect(createGitHubClient).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses an injected client without inspecting the custom environment", async () => {
    const lookup = vi.fn(() => {
      throw new Error("Unexpected credential lookup");
    });
    await run(
      {
        get GRAIDER_GITHUB_TOKEN(): string {
          return lookup();
        }
      },
      new FakeGitHubClient()
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(createGitHubClient).not.toHaveBeenCalled();
  });
});
