import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeProcessRunner } from "./commandRunner.js";

const COMMAND_RUNNER_SOURCE = path.join(__dirname, "commandRunner.ts");
const SUCCESS_EXIT_CODE = 0;

describe("commandRunner", () => {
  it("runs a command with an argument array and captures stdout, stderr, and exit code", async () => {
    const runner = createNodeProcessRunner();
    const result = await runner({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write(process.argv[1]); process.stderr.write(process.argv[2]);",
        "stdout-value",
        "stderr-value"
      ]
    });

    expect(result).toEqual({
      stdout: "stdout-value",
      stderr: "stderr-value",
      exitCode: SUCCESS_EXIT_CODE,
      error: null
    });
  });

  it("handles spawn failure without throwing", async () => {
    const runner = createNodeProcessRunner();
    const result = await runner({
      command: "graider-ui-command-that-does-not-exist",
      args: []
    });

    expect(result.exitCode).toBeNull();
    expect(result.error?.code).toBe("ENOENT");
  });

  it("uses spawn without shell execution", () => {
    const source = fs.readFileSync(COMMAND_RUNNER_SOURCE, "utf8");

    expect(source).toContain("spawn(request.command, [...request.args]");
    expect(source).toContain("shell: false");
    expect(source).not.toContain("exec(");
    expect(source).not.toContain("execFile(");
  });
});
