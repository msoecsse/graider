import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAuthenticatedProductionGitWorkspace,
  getProductionGitWorkspaceFactory
} from "./gitWorkspaceReader.js";

const temporaryDirectories: string[] = [];

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { force: true, recursive: true });
});

describe("production Git workspace loader", () => {
  it("loads the generated Dugite backend and opens a repository through the default Dugite factory", async () => {
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
      dugiteBackend.createDugiteGitWorkspaceFactory().verifyAvailable()
    ).resolves.toBeUndefined();

    const workspace = await getProductionGitWorkspaceFactory().open(root);
    await expect(workspace.resolveHead()).resolves.toBe(head);
  });
});

it("loads operation-scoped authenticated composition from the existing backend", async () => {
  const first = createAuthenticatedProductionGitWorkspace("  backend-fixture-token  ");
  const second = createAuthenticatedProductionGitWorkspace("backend-fixture-token");
  expect(first.authentication.id).not.toBe(second.authentication.id);
  expect(first.factory).not.toBe(second.factory);
  expect(Object.keys(first).sort()).toEqual(["authentication", "factory"]);
  expect(JSON.stringify(first.authentication)).not.toContain("backend-fixture-token");
  expect(() => createAuthenticatedProductionGitWorkspace(" ")).toThrow(/authentication/u);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-authenticated-loader-"));
  temporaryDirectories.push(root);
  git(root, ["init"]);
  await expect(first.factory.inspect(root)).resolves.toMatchObject({ kind: "repository" });
});
