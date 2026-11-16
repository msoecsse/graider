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
import { GitHubClientError } from "../../../src/github/github-errors.js";

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
  const repository = vi.spyOn(client, "getRepository").mockResolvedValue({
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
  const request = {
    root,
    client,
    remoteUrl: "https://github.com/example-org/se2030-graider.git",
    localRevision: sha
  };
  return { root, client, revision, read, mutate, run, account, repository, request };
};
describe("authoritative legacy mutation compatibility", () => {
  it.each([
    ["account", "course_account_unverified"],
    ["conflicting_account", "course_account_mismatch"],
    ["repository", "course_repository_unavailable"],
    ["conflicting_repository", "course_repository_mismatch"],
    ["revision_unavailable", "course_revision_unavailable"],
    ["stale", "course_revision_mismatch"],
    ["raced", "course_revision_changed"],
    ["missing", "course_metadata_unavailable"],
    ["schema", "course_authoritative_schema_invalid"],
    ["denied", "course_access_denied"],
    ["network", "course_verification_unavailable"]
  ] as const)("reports %s safely and prevents every student write", async (failure, code) => {
    const f = fixture();
    if (failure === "account") f.account.mockResolvedValue({ username: "unknown" });
    if (failure === "conflicting_account")
      f.account.mockResolvedValue({ id: 43, username: "other" });
    if (failure === "repository") f.repository.mockResolvedValue(null);
    if (failure === "conflicting_repository") {
      const repository = await f.client.getRepository("example-org", "se2030-graider");
      if (!repository) throw new Error("Missing repository fixture.");
      f.repository.mockResolvedValue({ ...repository, id: 21 });
    }
    if (failure === "revision_unavailable") f.revision.mockResolvedValue(undefined);
    if (failure === "stale") f.revision.mockResolvedValue("b".repeat(SHA_LENGTH));
    if (failure === "raced")
      f.revision.mockResolvedValueOnce(sha).mockResolvedValue("b".repeat(SHA_LENGTH));
    if (failure === "missing") f.read.mockResolvedValue(null);
    if (failure === "schema") f.read.mockResolvedValue("schema_version: 2\n");
    if (failure === "denied")
      f.repository.mockRejectedValue(
        new GitHubClientError("permission_denied", "Authorization: secret-token")
      );
    if (failure === "network")
      f.repository.mockRejectedValue(new GitHubClientError("network_error", "secret-token"));
    const write = vi.spyOn(f.client, "createRepository");
    const attempt = async () => {
      await beginAuthoritativeLegacyCliMutation({
        ...f.request,
        expected: { userId: 42, repositoryId: 20, revision: sha }
      });
      await guardProductionLegacyClient(f.client).createRepository({
        owner: "example-org",
        name: "student",
        private: true
      });
      f.mutate();
    };
    await expect(attempt()).rejects.toMatchObject({ diagnosticCode: code });
    expect(write).not.toHaveBeenCalled();
    expect(f.mutate).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(f.root, "unauthorized-write"))).toBe(false);
    try {
      await attempt();
    } catch (error) {
      expect(String(error)).not.toContain("secret-token");
      expect(String(error)).not.toContain("Authorization:");
    }
  });
  it("rejects forged operation constraints instead of using them as authority", async () => {
    const f = fixture();
    const expected = { userId: 42, repositoryId: 20, revision: sha };
    f.read.mockResolvedValue("schema_version: 2\n");
    await expect(assertAuthoritativeLegacyCourse({ ...f.request, expected })).rejects.toMatchObject(
      { diagnosticCode: "course_authoritative_schema_invalid" }
    );
  });
  it.each(["head", "origin", "account", "remote_revision"] as const)(
    "revalidates %s after planning, before a student repository write",
    async (changed) => {
      const f = fixture();
      const readLocalState = vi.fn(() =>
        Promise.resolve({
          remoteUrl: f.request.remoteUrl,
          localRevision: sha
        })
      );
      await beginAuthoritativeLegacyCliMutation({ ...f.request, readLocalState });
      const write = vi.spyOn(f.client, "createRepository");
      const guarded = guardProductionLegacyClient(f.client);
      if (changed === "head")
        readLocalState.mockResolvedValue({
          remoteUrl: f.request.remoteUrl,
          localRevision: "b".repeat(SHA_LENGTH)
        });
      if (changed === "origin")
        readLocalState.mockResolvedValue({
          remoteUrl: "https://github.com/other/course.git",
          localRevision: sha
        });
      if (changed === "account") f.account.mockResolvedValue({ id: 43, username: "other" });
      if (changed === "remote_revision") f.revision.mockResolvedValue("b".repeat(SHA_LENGTH));
      await expect(
        guarded.createRepository({ owner: "example-org", name: "student", private: true })
      ).rejects.toThrow("Course mutation unavailable");
      expect(write).not.toHaveBeenCalled();
      expect(readLocalState).toHaveBeenCalledTimes(2);
    }
  );
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
