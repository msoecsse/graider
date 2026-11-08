import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLI_ENTRYPOINT = path.resolve("src/cli/index.ts");
const FIXTURE = path.resolve("tests/fixtures/config/valid-course");
const ASSIGNMENT = "terms/27s1/assignments/lab04/assignment.yml";
describe("CLI authoritative mutation refusal envelope", () => {
  it("returns a safe typed JSON failure instead of running an unverified local writer", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", CLI_ENTRYPOINT, "workflow", "generate", ASSIGNMENT, "--json"],
      {
        cwd: FIXTURE,
        encoding: "utf8",
        env: { ...process.env, GRAIDER_GITHUB_TOKEN: "", GITHUB_TOKEN: "" }
      }
    );
    const output: unknown = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      schemaVersion: 1,
      commandName: "workflow generate",
      status: "failure",
      exitCode: 1,
      errors: [{ code: "course_operation_unavailable", severity: "error" }],
      generatedFiles: [],
      summary: { operationAvailable: false }
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("Authorization:");
    expect(result.stdout).not.toContain("at checkLegacyCliMutation");
  });
});
