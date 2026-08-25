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
      "graider-ui:github-auth:check",
      "graider-ui:course-registry:list",
      "graider-ui:course-registry:select-folder",
      "graider-ui:student-repository-access-page:select-pages-folder",
      "graider-ui:course-setup:select-folder",
      "graider-ui:course-setup:preview",
      "graider-ui:course-setup:save",
      "graider-ui:student-access-pages:save-config",
      "graider-ui:assignment-setup:terms",
      "graider-ui:assignment-setup:preview",
      "graider-ui:assignment-setup:save",
      "graider-ui:assignment-edit:get",
      "graider-ui:assignment-edit:preview",
      "graider-ui:assignment-edit:save",
      "graider-ui:assignment-groups:get",
      "graider-ui:assignment-groups:save",
      "graider-ui:student-repo-email-preview:get",
      "graider-ui:student-repo-email-history:get",
      "graider-ui:student-repo-email-transport-status:get",
      "graider-ui:student-repository-access-page:status",
      "graider-ui:student-repository-access-page:generate",
      "graider-ui:student-repository-access-page:publish-status",
      "graider-ui:student-repository-access-page:publish",
      "graider-ui:course-publish:status",
      "graider-ui:course-publish:publish",
      "graider-ui:roster-manager:terms",
      "graider-ui:roster-manager:get",
      "graider-ui:roster-manager:preview",
      "graider-ui:roster-manager:save",
      "graider-ui:template-workflow:get",
      "graider-ui:template-workflow:preview-save",
      "graider-ui:template-workflow:save",
      "graider-ui:course-registry:remove",
      "graider-ui:dashboard:refresh-course-folder",
      "graider-ui:dashboard:refresh-all",
      "graider-ui:assignment-detail:get",
      "graider-ui:assignment-apply-preview:get",
      "graider-ui:assignment-grade-preview:get",
      "graider-ui:assignment-grade-status:get",
      "graider-ui:faculty-report:get",
      "graider-ui:assignment-apply:run",
      "graider-ui:assignment-grade:run"
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
