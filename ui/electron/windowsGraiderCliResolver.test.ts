import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWindowsGraiderCli } from "./windowsGraiderCliResolver.js";

const NPM_PREFIX = path.join("C:\\Users\\sean\\AppData\\Roaming", "npm");
const SYSTEM_DIRECTORY = "C:\\Windows\\System32";
const DEFAULT_PATH_EXTENSIONS = ".COM;.EXE;.BAT;.CMD";

const createFileExists =
  (existingFiles: readonly string[]) =>
  (candidatePath: string): boolean =>
    existingFiles.includes(candidatePath);

describe("resolveWindowsGraiderCli", () => {
  it("resolves a global npm shim to the JavaScript entry point named by the package manifest", () => {
    const packageDirectory = path.join(NPM_PREFIX, "node_modules", "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");

    expect(
      resolveWindowsGraiderCli({
        env: {
          Path: `${SYSTEM_DIRECTORY};${NPM_PREFIX}`,
          PATHEXT: DEFAULT_PATH_EXTENSIONS
        },
        fileExists: createFileExists([
          path.join(NPM_PREFIX, "graider.cmd"),
          path.join(packageDirectory, "package.json"),
          scriptPath
        ]),
        readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
      })
    ).toEqual({
      kind: "node_script",
      scriptPath
    });
  });

  it("resolves a node_modules/.bin shim through the sibling package directory", () => {
    const projectModules = path.join("C:\\projects\\course tools", "node_modules");
    const packageDirectory = path.join(projectModules, "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");

    expect(
      resolveWindowsGraiderCli({
        env: {
          Path: path.join(projectModules, ".bin"),
          PATHEXT: DEFAULT_PATH_EXTENSIONS
        },
        fileExists: createFileExists([
          path.join(projectModules, ".bin", "graider.cmd"),
          path.join(packageDirectory, "package.json"),
          scriptPath
        ]),
        readFile: () => JSON.stringify({ bin: "dist/index.js" })
      })
    ).toEqual({
      kind: "node_script",
      scriptPath
    });
  });

  it("prefers a real executable and reports it as directly spawnable", () => {
    const executablePath = path.join(NPM_PREFIX, "graider.exe");

    expect(
      resolveWindowsGraiderCli({
        env: {
          Path: NPM_PREFIX,
          PATHEXT: DEFAULT_PATH_EXTENSIONS
        },
        fileExists: createFileExists([executablePath, path.join(NPM_PREFIX, "graider.cmd")]),
        readFile: () => ""
      })
    ).toEqual({
      kind: "executable",
      executablePath
    });
  });

  it("reads PATH regardless of the casing Windows reports it with", () => {
    const packageDirectory = path.join(NPM_PREFIX, "node_modules", "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");

    expect(
      resolveWindowsGraiderCli({
        env: {
          PATH: NPM_PREFIX,
          PathExt: DEFAULT_PATH_EXTENSIONS
        },
        fileExists: createFileExists([
          path.join(NPM_PREFIX, "graider.cmd"),
          path.join(packageDirectory, "package.json"),
          scriptPath
        ]),
        readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
      })
    ).toEqual({
      kind: "node_script",
      scriptPath
    });
  });

  it("ignores quoted and empty PATH entries", () => {
    const packageDirectory = path.join(NPM_PREFIX, "node_modules", "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");

    expect(
      resolveWindowsGraiderCli({
        env: {
          Path: `;"${SYSTEM_DIRECTORY}";;"${NPM_PREFIX}";`,
          PATHEXT: DEFAULT_PATH_EXTENSIONS
        },
        fileExists: createFileExists([
          path.join(NPM_PREFIX, "graider.cmd"),
          path.join(packageDirectory, "package.json"),
          scriptPath
        ]),
        readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
      })
    ).toEqual({
      kind: "node_script",
      scriptPath
    });
  });

  it("falls back to the default extension list when PATHEXT is unset", () => {
    const packageDirectory = path.join(NPM_PREFIX, "node_modules", "graider");
    const scriptPath = path.join(packageDirectory, "dist", "index.js");

    expect(
      resolveWindowsGraiderCli({
        env: { Path: NPM_PREFIX },
        fileExists: createFileExists([
          path.join(NPM_PREFIX, "graider.cmd"),
          path.join(packageDirectory, "package.json"),
          scriptPath
        ]),
        readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
      })
    ).toEqual({
      kind: "node_script",
      scriptPath
    });
  });

  it("returns null when no graider shim is on PATH", () => {
    expect(
      resolveWindowsGraiderCli({
        env: { Path: SYSTEM_DIRECTORY, PATHEXT: DEFAULT_PATH_EXTENSIONS },
        fileExists: () => false,
        readFile: () => ""
      })
    ).toBeNull();
  });

  it("returns null when the shim exists but its package entry point cannot be resolved", () => {
    expect(
      resolveWindowsGraiderCli({
        env: { Path: NPM_PREFIX, PATHEXT: DEFAULT_PATH_EXTENSIONS },
        fileExists: createFileExists([path.join(NPM_PREFIX, "graider.cmd")]),
        readFile: () => JSON.stringify({ bin: { graider: "dist/index.js" } })
      })
    ).toBeNull();
  });

  it("returns null when the package manifest is not valid JSON", () => {
    const packageDirectory = path.join(NPM_PREFIX, "node_modules", "graider");

    expect(
      resolveWindowsGraiderCli({
        env: { Path: NPM_PREFIX, PATHEXT: DEFAULT_PATH_EXTENSIONS },
        fileExists: createFileExists([
          path.join(NPM_PREFIX, "graider.cmd"),
          path.join(packageDirectory, "package.json"),
          path.join(packageDirectory, "dist", "index.js")
        ]),
        readFile: () => "{ not json"
      })
    ).toBeNull();
  });

  it("does not resolve the extensionless shell shim npm writes alongside the .cmd file", () => {
    expect(
      resolveWindowsGraiderCli({
        env: { Path: NPM_PREFIX, PATHEXT: DEFAULT_PATH_EXTENSIONS },
        fileExists: createFileExists([path.join(NPM_PREFIX, "graider")]),
        readFile: () => ""
      })
    ).toBeNull();
  });
});
