import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../electron/ipc";

const currentFile = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(currentFile), "..");
const RENDERER_SOURCE_ROOT = path.join(PROJECT_ROOT, "src");
const PRELOAD_SOURCE = path.join(PROJECT_ROOT, "electron", "preload.ts");
const FORBIDDEN_RENDERER_IMPORTS = [
  "child_process",
  "node:child_process",
  "fs",
  "node:fs",
  "process",
  "node:process"
] as const;

const readSourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return readSourceFiles(entryPath);
    }

    const isSourceFile = /\.(ts|tsx)$/.test(entry.name);
    const isTestHarnessFile = /\.test\.(ts|tsx)$/.test(entry.name) || entry.name === "setup.ts";

    return entry.isFile() && isSourceFile && !isTestHarnessFile ? [entryPath] : [];
  });

describe("UI security boundary", () => {
  it("uses specific IPC channels and no generic command channel", () => {
    const channelNames = Object.values(IPC_CHANNELS);

    expect(channelNames).toEqual([
      "graider-ui:get-app-info",
      "graider-ui:course-registry:list",
      "graider-ui:course-registry:select-folder",
      "graider-ui:course-registry:remove",
      "graider-ui:dashboard:refresh-course-folder",
      "graider-ui:dashboard:refresh-all",
      "graider-ui:assignment-detail:get",
      "graider-ui:assignment-apply-preview:get",
      "graider-ui:assignment-apply:run"
    ]);
    expect(channelNames).not.toContain("runCommand");
    expect(channelNames).not.toContain("shell");
    expect(channelNames).not.toContain("execute");
    expect(channelNames).not.toContain("spawn");
    expect(channelNames).not.toContain("readFile");
    expect(channelNames).not.toContain("writeFile");
  });

  it("preload exposes only the graiderUI namespace", () => {
    const preloadSource = fs.readFileSync(PRELOAD_SOURCE, "utf8");

    expect(preloadSource).toContain('exposeInMainWorld("graiderUI"');
    expect(preloadSource).not.toContain('exposeInMainWorld("process"');
    expect(preloadSource).not.toContain('exposeInMainWorld("fs"');
  });

  it("renderer source does not import Node filesystem, process, or shell modules", () => {
    const rendererSources = readSourceFiles(RENDERER_SOURCE_ROOT).map((sourcePath) =>
      fs.readFileSync(sourcePath, "utf8")
    );

    for (const source of rendererSources) {
      for (const importName of FORBIDDEN_RENDERER_IMPORTS) {
        expect(source).not.toContain(`from "${importName}"`);
        expect(source).not.toContain(`from '${importName}'`);
      }
    }
  });
});
