import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPlanCommand } from "../../src/cli/commands/plan.command.js";
import { runValidateCommand } from "../../src/cli/commands/validate.command.js";
import { normalizeCommonCommandOptions } from "../../src/core/command-context.js";
import { ExitCode } from "../../src/core/exit-codes.js";
import { readGitHubToken } from "../../src/github/github-client-factory.js";

enum PortabilityNumber {
  ExpectedGeneratedFileCount = 1
}

const FIXTURE_ROOT = path.resolve("tests/fixtures/plan/active-assignment");
const ROOT_ASSIGNMENT_FILE = "terms/27s1/assignments/lab04/assignment.yml";
const SUBDIRECTORY_ASSIGNMENT_FILE = "assignments/lab04/assignment.yml";
const SUBDIRECTORY = path.join("terms", "27s1");
const GRAIDER_TOKEN = "graider-token";
const GITHUB_TOKEN = "github-token";
const FIXED_TIMESTAMP = "2026-09-01T14:30:00.000Z";
const FORWARD_SLASH_PATTERN = /\//u;
const BACKSLASH_PATTERN = /\\/u;

const options = normalizeCommonCommandOptions({});
const fixedClock = {
  now: () => new Date(FIXED_TIMESTAMP)
};

const copyFixtureToTemp = (): string => {
  const destinationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider-portability-"));

  fs.cpSync(FIXTURE_ROOT, destinationRoot, { recursive: true });

  return destinationRoot;
};

describe("portability hardening", () => {
  it("TC-PORT-001 runs validate from the repository root", async () => {
    const repoRoot = copyFixtureToTemp();
    const result = await runValidateCommand({
      cwd: repoRoot,
      assignmentFile: ROOT_ASSIGNMENT_FILE,
      options
    });

    expect(result.exitCode).toBe(ExitCode.Success);
  });

  it("TC-PORT-002 runs validate from a subdirectory", async () => {
    const repoRoot = copyFixtureToTemp();
    const result = await runValidateCommand({
      cwd: path.join(repoRoot, SUBDIRECTORY),
      assignmentFile: SUBDIRECTORY_ASSIGNMENT_FILE,
      options
    });

    expect(result.exitCode).toBe(ExitCode.Success);
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

  it("TC-PORT-004 does not require GitHub CLI authentication for normal command runners", async () => {
    const repoRoot = copyFixtureToTemp();
    const result = await runValidateCommand({
      cwd: repoRoot,
      assignmentFile: ROOT_ASSIGNMENT_FILE,
      options
    });

    expect(result.exitCode).toBe(ExitCode.Success);
  });

  it("emits repository-relative generated paths with forward slashes", async () => {
    const repoRoot = copyFixtureToTemp();
    const result = await runPlanCommand({
      cwd: repoRoot,
      assignmentFile: ROOT_ASSIGNMENT_FILE,
      options,
      clock: fixedClock
    });

    expect(result.generatedFiles).toHaveLength(PortabilityNumber.ExpectedGeneratedFileCount);
    expect(result.generatedFiles[0]).toMatch(FORWARD_SLASH_PATTERN);
    expect(result.generatedFiles[0]).not.toMatch(BACKSLASH_PATTERN);
    expect(path.isAbsolute(result.generatedFiles[0] ?? "")).toBe(false);
  });
});
