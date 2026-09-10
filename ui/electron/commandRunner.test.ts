import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_GRAIDER_CLI_MISSING_PROCESS_CODE,
  BUNDLED_GRAIDER_CLI_NOT_FOUND_MESSAGE,
  createNodeProcessRunner,
  getBundledGraiderCliPath,
  getDevelopmentGraiderCliPath,
  resolveGraiderCli,
  resolveProcessRunRequest
} from "./commandRunner.js";

const COMMAND_RUNNER_SOURCE = path.join(__dirname, "commandRunner.ts");
const SUCCESS_EXIT_CODE = 0;
const WINDOWS_EXEC_PATH = "C:\\Program Files\\Graider\\Graider.exe";

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
        helperPath: null,
        resolutionSource: null
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

  it("preserves the external graider command on platforms that can spawn it directly", () => {
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
          mode: "external",
          platform: "darwin"
        }
      })
    ).toEqual(request);
  });

  it("runs the external Windows graider shim under Node instead of spawning a .cmd file", () => {
    const npmPrefix = path.join("C:\\Users\\sean\\AppData\\Roaming", "npm");
    const packageDirectory = path.join(npmPrefix, "node_modules", "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");
    const existingFiles = new Set([
      path.join(npmPrefix, "graider.cmd"),
      path.join(packageDirectory, "package.json"),
      scriptPath
    ]);

    const result = resolveProcessRunRequest(
      {
        command: "graider",
        args: ["dashboard", "--json"],
        cwd: "C:\\Box Sync\\course root",
        env: {
          GRAIDER_GITHUB_TOKEN: "token-value"
        }
      },
      {
        graiderCli: {
          mode: "external",
          platform: "win32",
          execPath: WINDOWS_EXEC_PATH,
          env: {
            Path: npmPrefix,
            PATHEXT: ".COM;.EXE;.BAT;.CMD"
          },
          fileExists: (candidatePath) => existingFiles.has(candidatePath),
          readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
        }
      }
    );

    expect(result).toEqual({
      command: WINDOWS_EXEC_PATH,
      args: [scriptPath, "dashboard", "--json"],
      cwd: "C:\\Box Sync\\course root",
      env: {
        GRAIDER_GITHUB_TOKEN: "token-value",
        ELECTRON_RUN_AS_NODE: "1"
      }
    });
  });

  it("spawns a real graider executable directly when PATH provides one", () => {
    const installRoot = "C:\\Program Files\\graider";
    const executablePath = path.join(installRoot, "graider.exe");

    expect(
      resolveProcessRunRequest(
        {
          command: "graider",
          args: ["dashboard", "--json"]
        },
        {
          graiderCli: {
            mode: "external",
            platform: "win32",
            execPath: WINDOWS_EXEC_PATH,
            env: { Path: installRoot, PATHEXT: ".EXE;.CMD" },
            fileExists: (candidatePath) => candidatePath === executablePath,
            readFile: () => ""
          }
        }
      )
    ).toEqual({
      command: executablePath,
      args: ["dashboard", "--json"]
    });
  });

  it("leaves the external graider command alone when no Windows shim is on PATH", () => {
    const request = { command: "graider", args: ["dashboard", "--json"] };

    expect(
      resolveProcessRunRequest(request, {
        graiderCli: {
          mode: "external",
          platform: "win32",
          execPath: WINDOWS_EXEC_PATH,
          env: { Path: "C:\\Windows\\System32", PATHEXT: ".EXE;.CMD" },
          fileExists: () => false,
          readFile: () => ""
        }
      })
    ).toEqual(request);
  });

  it("executes the resolved external Windows helper and reports it in the diagnostic", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider external shim-"));
    const packageDirectory = path.join(tempRoot, "node_modules", "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");
    const existingFiles = new Set([
      path.join(tempRoot, "graider.cmd"),
      path.join(packageDirectory, "package.json"),
      scriptPath
    ]);

    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(
      scriptPath,
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
      "utf8"
    );

    try {
      const runner = createNodeProcessRunner({
        graiderCli: {
          mode: "external",
          platform: "win32",
          execPath: process.execPath,
          env: { Path: tempRoot, PATHEXT: ".EXE;.CMD" },
          fileExists: (candidatePath) => existingFiles.has(candidatePath),
          readFile: () => JSON.stringify({ bin: "dist/index.js" })
        }
      });

      const result = await runner({ command: "graider", args: ["dashboard", "--json"] });

      expect(result.stdout).toBe(JSON.stringify(["dashboard", "--json"]));
      expect(result.diagnostic).toMatchObject({
        runnerMode: "external",
        command: "graider",
        executablePath: process.execPath,
        helperPath: scriptPath
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider bundled helper-"));
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
        helperPath: getBundledGraiderCliPath(path.join(process.cwd(), "missing-packaged-app")),
        resolutionSource: null
      }
    });
  });

  it("prefers an explicit GRAIDER_CLI_PATH override over every other location", () => {
    const overridePath = path.join("C:\\tools", "graider-cli", "index.js");
    const appPath = path.join("C:\\apps", "graider", "ui");

    const result = resolveProcessRunRequest(
      { command: "graider", args: ["dashboard", "--json"], env: {} },
      {
        graiderCli: {
          mode: "external",
          platform: "win32",
          appPath,
          execPath: WINDOWS_EXEC_PATH,
          env: { GRAIDER_CLI_PATH: overridePath, Path: "C:\\Windows\\System32" },
          fileExists: () => true,
          readFile: () => ""
        }
      }
    );

    expect(result).toEqual({
      command: WINDOWS_EXEC_PATH,
      args: [overridePath, "dashboard", "--json"],
      env: { ELECTRON_RUN_AS_NODE: "1" }
    });
  });

  it("spawns an executable override directly instead of running it under Node", () => {
    const overridePath = path.join("C:\\tools", "graider.exe");

    expect(
      resolveProcessRunRequest(
        { command: "graider", args: ["dashboard", "--json"] },
        {
          graiderCli: {
            mode: "external",
            platform: "win32",
            execPath: WINDOWS_EXEC_PATH,
            env: { GRAIDER_CLI_PATH: overridePath },
            fileExists: (candidatePath) => candidatePath === overridePath,
            readFile: () => ""
          }
        }
      )
    ).toEqual({ command: overridePath, args: ["dashboard", "--json"] });
  });

  it("falls back to the repository CLI build in development when PATH has no graider", () => {
    const appPath = path.join("C:\\apps", "graider", "ui");
    const developmentPath = getDevelopmentGraiderCliPath(appPath);

    const result = resolveProcessRunRequest(
      { command: "graider", args: ["dashboard", "--json"], env: {} },
      {
        graiderCli: {
          mode: "external",
          platform: "win32",
          appPath,
          execPath: WINDOWS_EXEC_PATH,
          env: { Path: "C:\\Windows\\System32", PATHEXT: ".EXE;.CMD" },
          fileExists: (candidatePath) => candidatePath === developmentPath,
          readFile: () => ""
        }
      }
    );

    expect(developmentPath).toBe(path.join("C:\\apps", "graider", "dist", "index.js"));
    expect(result).toEqual({
      command: WINDOWS_EXEC_PATH,
      args: [developmentPath, "dashboard", "--json"],
      env: { ELECTRON_RUN_AS_NODE: "1" }
    });
  });

  it("prefers the repository build over a stale bundled build in development", () => {
    const appPath = path.join("C:\\apps", "graider", "ui");

    expect(
      resolveGraiderCli({
        mode: "external",
        platform: "win32",
        appPath,
        fileExists: () => true,
        env: {}
      })
    ).toEqual({
      kind: "node_script",
      scriptPath: getDevelopmentGraiderCliPath(appPath),
      source: "development"
    });
  });

  it("runs the bundled build when packaged", () => {
    const appPath = path.join("C:\\Program Files", "Graider", "resources", "app.asar");

    expect(
      resolveGraiderCli({
        mode: "bundled",
        platform: "win32",
        appPath,
        fileExists: () => true,
        env: {}
      })
    ).toEqual({
      kind: "node_script",
      scriptPath: getBundledGraiderCliPath(appPath),
      source: "bundled"
    });
  });

  it("does not silently substitute a PATH install for a missing bundled build", () => {
    const npmPrefix = path.join("C:\\Users\\sean\\AppData\\Roaming", "npm");
    const packageDirectory = path.join(npmPrefix, "node_modules", "graider");
    const existingFiles = new Set([
      path.join(npmPrefix, "graider.cmd"),
      path.join(packageDirectory, "package.json"),
      path.join(packageDirectory, "dist", "index.js")
    ]);

    expect(
      resolveGraiderCli({
        mode: "bundled",
        platform: "win32",
        appPath: path.join("C:\\Program Files", "Graider", "resources", "app.asar"),
        env: { Path: npmPrefix, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        fileExists: (candidatePath) => existingFiles.has(candidatePath),
        readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
      })
    ).toBeNull();
  });

  it("still honours an explicit override when packaged", () => {
    const overridePath = path.join("C:\\tools", "graider-cli", "index.js");

    expect(
      resolveGraiderCli({
        mode: "bundled",
        platform: "win32",
        appPath: path.join("C:\\Program Files", "Graider", "resources", "app.asar"),
        env: { GRAIDER_CLI_PATH: overridePath },
        fileExists: (candidatePath) => candidatePath === overridePath
      })
    ).toEqual({ kind: "node_script", scriptPath: overridePath, source: "env_override" });
  });

  it("resolves without PATH when the environment has no npm shim directory", () => {
    const appPath = path.join("C:\\apps", "graider", "ui");
    const developmentPath = getDevelopmentGraiderCliPath(appPath);

    expect(
      resolveGraiderCli({
        mode: "external",
        platform: "win32",
        appPath,
        env: { Path: "", PATHEXT: ".EXE;.CMD" },
        fileExists: (candidatePath) => candidatePath === developmentPath,
        readFile: () => ""
      })
    ).toEqual({
      kind: "node_script",
      scriptPath: developmentPath,
      source: "development"
    });
  });

  it("falls back to the PATH shim only when no shipped CLI build exists", () => {
    const npmPrefix = path.join("C:\\Users\\sean\\AppData\\Roaming", "npm");
    const packageDirectory = path.join(npmPrefix, "node_modules", "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");
    const existingFiles = new Set([
      path.join(npmPrefix, "graider.cmd"),
      path.join(packageDirectory, "package.json"),
      scriptPath
    ]);

    expect(
      resolveGraiderCli({
        mode: "external",
        platform: "win32",
        appPath: path.join("C:\\apps", "graider", "ui"),
        env: { Path: npmPrefix, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        fileExists: (candidatePath) => existingFiles.has(candidatePath),
        readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
      })
    ).toEqual({ kind: "node_script", scriptPath, source: "path_shim" });
  });

  it("reports which tier resolved the CLI in the run diagnostic", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graider override-"));
    const overridePath = path.join(tempRoot, "cli.js");

    fs.writeFileSync(overridePath, "process.stdout.write('override');\n", "utf8");

    try {
      const runner = createNodeProcessRunner({
        graiderCli: {
          mode: "external",
          execPath: process.execPath,
          env: { GRAIDER_CLI_PATH: overridePath }
        }
      });

      const result = await runner({ command: "graider", args: ["dashboard"] });

      expect(result.stdout).toBe("override");
      expect(result.diagnostic).toMatchObject({
        runnerMode: "external",
        resolutionSource: "env_override",
        helperPath: overridePath
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
