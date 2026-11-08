import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertAuthoritativeLegacyCourse,
  beginAuthoritativeLegacyCliMutation,
  endAuthoritativeLegacyCliMutation,
  guardProductionLegacyClient
} from "../../../src/execution/authoritative-legacy-course.js";
import { FakeGitHubClient } from "../../../src/github/fake-github-client.js";

const SHA_LENGTH = 40;
const UNKNOWN_SCHEMA_VERSION = 99;
const sha = "a".repeat(SHA_LENGTH);
const roots: string[] = [];
afterEach(() => {
  endAuthoritativeLegacyCliMutation();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-authoritative-legacy-"));
  roots.push(root);
  const content = fs.readFileSync("tests/fixtures/config/valid-course/course.yml", "utf8");
  fs.writeFileSync(path.join(root, "course.yml"), content);
  const client = new FakeGitHubClient();
  const account = vi
    .spyOn(client, "getAuthenticatedUser")
    .mockResolvedValue({ id: 42, username: "faculty" });
  vi.spyOn(client, "getRepository").mockResolvedValue({
    id: 20,
    owner: "example-org",
    name: "se2030-graider",
    fullName: "example-org/se2030-graider",
    private: true,
    archived: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/example-org/se2030-graider"
  });
  const revision = vi.spyOn(client, "getDefaultBranchCommitSha").mockResolvedValue(sha);
  const read = vi.spyOn(client, "getRepositoryFileContent").mockResolvedValue(content);
  const mutate = vi.fn(() => {
    fs.writeFileSync(path.join(root, "unauthorized-write"), "unsafe");
  });
  const run = async () => {
    await assertAuthoritativeLegacyCourse({
      root,
      client,
      remoteUrl: "https://github.com/example-org/se2030-graider.git",
      localRevision: sha
    });
    mutate();
  };
  return { root, client, revision, read, mutate, run, account };
};
describe("authoritative legacy mutation compatibility", () => {
  it("revalidates before each production API mutation, refusing migration during planning", async () => {
    const f = fixture();
    await beginAuthoritativeLegacyCliMutation({
      root: f.root,
      client: f.client,
      remoteUrl: "https://github.com/example-org/se2030-graider.git",
      localRevision: sha
    });
    const write = vi.spyOn(f.client, "writeRepositoryFile");
    const guarded = guardProductionLegacyClient(f.client);
    f.read.mockResolvedValue("schema_version: 2\n");
    await expect(
      guarded.writeRepositoryFile({
        owner: "example-org",
        repo: "student",
        path: "report.html",
        content: "report",
        message: "Publish"
      })
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it("preserves verified Schema 1 operations", async () => {
    const f = fixture();
    await f.run();
    expect(f.mutate).toHaveBeenCalledOnce();
  });
  it.each([2, 3, UNKNOWN_SCHEMA_VERSION])(
    "rejects authoritative schema %s despite a valid Schema 1 cache",
    async (version) => {
      const f = fixture();
      f.read.mockResolvedValue(`schema_version: ${String(version)}\n`);
      await expect(f.run()).rejects.toThrow("Course mutation unavailable");
      expect(f.mutate).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(f.root, "unauthorized-write"))).toBe(false);
    }
  );
  it.each(["missing", "stale", "raced", "invalidated"] as const)(
    "fails closed for %s evidence",
    async (failure) => {
      const f = fixture();
      if (failure === "missing") f.read.mockResolvedValue(null);
      if (failure === "stale") f.revision.mockResolvedValue("b".repeat(SHA_LENGTH));
      if (failure === "raced")
        f.revision.mockResolvedValueOnce(sha).mockResolvedValue("b".repeat(SHA_LENGTH));
      if (failure === "invalidated")
        f.account
          .mockResolvedValueOnce({ id: 42, username: "faculty" })
          .mockResolvedValue({ id: 43, username: "other" });
      await expect(f.run()).rejects.toThrow();
      expect(f.mutate).not.toHaveBeenCalled();
    }
  );
});
