import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
  BUNDLED_GRAIDER_CLI_NOT_FOUND_MESSAGE,
  createNodeProcessRunner,
  getBundledGraiderCliPath,
  resolveProcessRunRequest
} from "./commandRunner.js";

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
      signal: null,
      error: null,
      diagnostic: {
        runnerMode: "direct",
        command: process.execPath,
        args: [
          "-e",
          "process.stdout.write(process.argv[1]); process.stderr.write(process.argv[2]);",
          "stdout-value",
          "stderr-value"
        ],
        cwd: null,
        executablePath: process.execPath,
        helperPath: null
      }
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

    expect(source).toContain("spawn(resolvedRequest.command, [...resolvedRequest.args]");
    expect(source).toContain("shell: false");
    expect(source).not.toContain("exec(");
    expect(source).not.toContain("execFile(");
  });

  it("preserves the external graider command in development mode", () => {
    const request = {
      command: "graider",
      args: ["dashboard", "--json"],
      cwd: "/Users/sean/Box Sync/WebstormProjects/graider-sandbox/csc1120",
      env: {
        GRAIDER_GITHUB_TOKEN: "token-value"
      }
    };

    expect(
      resolveProcessRunRequest(request, {
        graiderCli: {
          mode: "external"
        }
      })
    ).toEqual(request);
  });

  it("resolves packaged graider commands through the bundled CLI helper mode", () => {
    const appPath = path.join(
      "release",
      "mac-arm64",
      "Graider.app",
      "Contents",
      "Resources",
      "app.asar"
    );
    const execPath = path.join(
      "release",
      "mac-arm64",
      "Graider.app",
      "Contents",
      "MacOS",
      "Graider"
    );
    const result = resolveProcessRunRequest(
      {
        command: "graider",
        args: ["assignment", "grade-status", "assignment.yml", "--json"],
        cwd: "/Users/sean/Box Sync/WebstormProjects/graider-sandbox/csc1120",
        env: {
          GRAIDER_GITHUB_TOKEN: "token-value"
        }
      },
      {
        graiderCli: {
          mode: "bundled",
          appPath,
          execPath
        }
      }
    );

    expect(result).toEqual({
      command: execPath,
      args: [
        getBundledGraiderCliPath(appPath),
        "assignment",
        "grade-status",
        "assignment.yml",
        "--json"
      ],
      cwd: "/Users/sean/Box Sync/WebstormProjects/graider-sandbox/csc1120",
      env: {
        GRAIDER_GITHUB_TOKEN: "token-value",
        ELECTRON_RUN_AS_NODE: "1"
      }
    });
    expect(result.args[0]).toContain("app.asar.unpacked");
  });

  it("executes bundled helper mode with a cwd containing spaces", async () => {
    const tempRoot = fs.mkdtempSync(path.join("/private/tmp", "graider bundled helper-"));
    const appPath = path.join(tempRoot, "app.asar");
    const helperPath = getBundledGraiderCliPath(appPath);
    const courseFolderPath = path.join(tempRoot, "Box Sync", "course root");

    fs.mkdirSync(path.dirname(helperPath), { recursive: true });
    fs.mkdirSync(courseFolderPath, { recursive: true });
    fs.writeFileSync(
      helperPath,
      "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\n",
      "utf8"
    );

    try {
      const runner = createNodeProcessRunner({
        graiderCli: {
          mode: "bundled",
          appPath,
          execPath: process.execPath
        }
      });

      const result = await runner({
        command: "graider",
        args: ["dashboard", "--json"],
        cwd: courseFolderPath
      });

      expect(JSON.parse(result.stdout)).toEqual({
        argv: ["dashboard", "--json"],
        cwd: courseFolderPath
      });
      expect(result.diagnostic).toMatchObject({
        runnerMode: "bundled",
        cwd: courseFolderPath,
        executablePath: process.execPath,
        helperPath
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns a safe packaged CLI error when the bundled CLI resource is missing", async () => {
    const runner = createNodeProcessRunner({
      graiderCli: {
        mode: "bundled",
        appPath: path.join(process.cwd(), "missing-packaged-app"),
        execPath: process.execPath
      }
    });

    const result = await runner({
      command: "graider",
      args: ["dashboard", "--json"],
      cwd: process.cwd()
    });

    expect(result).toEqual({
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      error: {
        code: BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
        message: BUNDLED_GRAIDER_CLI_NOT_FOUND_MESSAGE
      },
      diagnostic: {
        runnerMode: "bundled",
        command: "graider",
        args: ["dashboard", "--json"],
        cwd: process.cwd(),
        executablePath: process.execPath,
        helperPath: getBundledGraiderCliPath(path.join(process.cwd(), "missing-packaged-app"))
      }
    });
  });
});
