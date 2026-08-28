import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runValidateCommand } from "../../src/cli/commands/validate.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { readGitHubToken } from "../../src/github/github-client-factory.js";

const FIXTURE_ROOT = path.resolve("tests/fixtures/plan/active-assignment");
const ROOT_ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const SUBDIRECTORY_ASSIGNMENT_FILE = "assignments/lab04/assignment.yml";
const SUBDIRECTORY = path.join("terms", "27s1");
const GRAIDER_TOKEN = "graider-token";
const GITHUB_TOKEN = "github-token";

const options = normalizeCommonCommandOptions({});
const copyFixtureToTemp = (): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-portability-"));

  fs.cpSync(FIXTURE_ROOT, destinationRoot, { recursive: true });

  return destinationRoot;
};

const withoutGitHubTokens = async (action: () => Promise<void>): Promise<void> => {
  vi.stubEnv("GRAIDER_GITHUB_TOKEN", "");
  vi.stubEnv("GITHUB_TOKEN", "");

  try {
    await action();
  } finally {
    vi.unstubAllEnvs();
  }
};

describe("portability hardening", () => {
  it("TC-PORT-001 returns a structured token failure from the repository root", async () => {
    await withoutGitHubTokens(async () => {
      const repoRoot = copyFixtureToTemp();
      const result = await runValidateCommand({
        cwd: repoRoot,
        assignmentFile: ROOT_ASSIGNMENT_FILE,
        options
      });

      expect(result.errors).toEqual([expect.objectContaining({ code: "github_token_required" })]);
    });
  });

  it("TC-PORT-002 returns a structured token failure from a subdirectory", async () => {
    await withoutGitHubTokens(async () => {
      const repoRoot = copyFixtureToTemp();
      const result = await runValidateCommand({
        cwd: path.join(repoRoot, SUBDIRECTORY),
        assignmentFile: SUBDIRECTORY_ASSIGNMENT_FILE,
        options
      });

      expect(result.errors).toEqual([expect.objectContaining({ code: "github_token_required" })]);
    });
  });

  it("TC-PORT-003 reads GitHub tokens from environment variables in deterministic order", () => {
    expect(
      readGitHubToken({
        GRAIDER_GITHUB_TOKEN: GRAIDER_TOKEN,
        GITHUB_TOKEN
      })
    ).toBe(GRAIDER_TOKEN);
    expect(readGitHubToken({ GITHUB_TOKEN })).toBe(GITHUB_TOKEN);
    expect(readGitHubToken({})).toBeUndefined();
  });
});
