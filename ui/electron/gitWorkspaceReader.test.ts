import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getProductionGitWorkspaceFactory } from "./gitWorkspaceReader.js";

const temporaryDirectories: string[] = [];

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { force: true, recursive: true });
});

describe("production Git workspace loader", () => {
  it("loads both generated backends and opens a repository through the default Dugite factory", async () => {
    const systemBackend = require("../dist-electron/systemGitWorkspaceBackend.cjs") as {
      createSystemGitWorkspaceFactory(): { verifyAvailable(): Promise<void> };
    };
    const dugiteBackend = require("../dist-electron/dugiteGitWorkspaceBackend.cjs") as {
      createDugiteGitWorkspaceFactory(): {
        verifyAvailable(): Promise<void>;
      };
    };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-production-dugite-"));
    temporaryDirectories.push(root);
    fs.writeFileSync(path.join(root, "README.md"), "Dugite default\n", "utf8");
    git(root, ["init"]);
    git(root, ["config", "user.email", "faculty@example.test"]);
    git(root, ["config", "user.name", "Faculty"]);
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "Initial"]);
    const head = git(root, ["rev-parse", "HEAD"]);

    await expect(
      systemBackend.createSystemGitWorkspaceFactory().verifyAvailable()
    ).resolves.toBeUndefined();
    await expect(
      dugiteBackend.createDugiteGitWorkspaceFactory().verifyAvailable()
    ).resolves.toBeUndefined();

    const workspace = await getProductionGitWorkspaceFactory().open(root);
    await expect(workspace.resolveHead()).resolves.toBe(head);
  });
});
