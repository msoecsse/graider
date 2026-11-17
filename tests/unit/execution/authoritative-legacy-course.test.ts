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
      expect(readLocalState).toHaveBeenCalledTimes(3);
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
  it("accepts legacy csc1020 identifiers in the authoritative csc1120 repository", async () => {
    const f = fixture();
    const content = fs
      .readFileSync(path.join(f.root, "course.yml"), "utf8")
      .replaceAll("example-org", "csc1120")
      .replaceAll("se2030-graider", "csc1020");
    fs.writeFileSync(path.join(f.root, "course.yml"), content);
    f.read.mockResolvedValue(content);
    f.repository.mockResolvedValue({
      id: 1342086585,
      owner: "csc1120",
      name: "csc1120",
      fullName: "csc1120/csc1120",
      private: true,
      archived: false,
      defaultBranch: "master",
      htmlUrl: "https://github.com/csc1120/csc1120"
    });
    await expect(
      assertAuthoritativeLegacyCourse({
        ...f.request,
        remoteUrl: "https://github.com/csc1120/csc1120",
        expected: { userId: 42, repositoryId: 1342086585, revision: sha }
      })
    ).resolves.toMatchObject({ repositoryId: 1342086585, revision: sha });
    expect(f.read).toHaveBeenCalledWith("csc1120", "csc1120", "course.yml", sha);
  });
  it.each(["locator", "metadata", "organization"] as const)(
    "refuses genuinely incorrect %s evidence with a legacy metadata-name mismatch",
    async (invalid) => {
      const f = fixture();
      const content = fs
        .readFileSync(path.join(f.root, "course.yml"), "utf8")
        .replaceAll("se2030-graider", "legacy-course-name");
      fs.writeFileSync(path.join(f.root, "course.yml"), content);
      f.read.mockResolvedValue(content);
      if (invalid === "locator") {
        const repo = await f.client.getRepository("example-org", "se2030-graider");
        if (!repo) throw new Error("Missing fixture");
        f.repository.mockResolvedValue({ ...repo, name: "wrong", fullName: "example-org/wrong" });
      }
      if (invalid === "metadata")
        f.read.mockResolvedValue(content.replace("legacy-course-name", "another-course"));
      if (invalid === "organization")
        f.read.mockResolvedValue(content.replaceAll("example-org", "other-org"));
      await expect(assertAuthoritativeLegacyCourse(f.request)).rejects.toMatchObject({
        diagnosticCode:
          invalid === "metadata"
            ? "course_repository_locator_mismatch"
            : "course_repository_mismatch"
      });
    }
  );
  it("preserves verified Schema 1 operations", async () => {
    const f = fixture();
    await f.run();
    expect(f.mutate).toHaveBeenCalledOnce();
  });
  it.each(["head", "origin"] as const)(
    "rejects local %s changes during remote observations",
    async (changed) => {
      const f = fixture();
      let local = { remoteUrl: f.request.remoteUrl, localRevision: sha };
      f.read.mockImplementation(() => {
        local = {
          remoteUrl: changed === "origin" ? "https://github.com/other/course.git" : local.remoteUrl,
          localRevision: changed === "head" ? "changed-head" : sha
        };
        return Promise.resolve(fs.readFileSync(path.join(f.root, "course.yml"), "utf8"));
      });
      await expect(
        assertAuthoritativeLegacyCourse({
          ...f.request,
          readLocalState: () => Promise.resolve(local)
        })
      ).rejects.toMatchObject({
        diagnosticCode:
          changed === "origin" ? "course_repository_mismatch" : "course_revision_mismatch"
      });
    }
  );
  it("reads independent evidence concurrently and drains failures before returning", async () => {
    const f = fixture();
    const events: string[] = [];
    let finishContent: ((content: string) => void) | undefined;
    f.account.mockImplementation(() => {
      events.push("identity");
      return Promise.reject(new GitHubClientError("auth_failed", "secret-token"));
    });
    f.repository.mockImplementation(() => {
      events.push("repository");
      return Promise.resolve(null);
    });
    f.revision.mockImplementation(() => {
      events.push("revision");
      return Promise.resolve(sha);
    });
    f.read.mockImplementation(() => {
      events.push("content");
      return new Promise<string>((resolve) => {
        finishContent = resolve;
      });
    });
    let completed = false;
    const pending = assertAuthoritativeLegacyCourse(f.request).catch((error: unknown) => {
      completed = true;
      return error;
    });
    await vi.waitFor(() => {
      expect(events).toEqual(["identity", "repository", "revision", "content"]);
    });
    expect(completed).toBe(false);
    expect(finishContent).toBeDefined();
    finishContent?.("schema_version: 2\n");
    expect(await pending).toMatchObject({ diagnosticCode: "course_account_unverified" });
    expect(f.revision).toHaveBeenCalledOnce();
  });
  it("checks identity after the final revision observation and retains both live guards", async () => {
    const f = fixture();
    const binding = { userId: 42, repositoryId: 20, revision: sha };
    const revalidate = vi.fn().mockResolvedValue(undefined);
    await assertAuthoritativeLegacyCourse({
      ...f.request,
      managedAuthorization: { binding, revalidate }
    });
    expect(revalidate).toHaveBeenCalledTimes(2);
    f.revision.mockResolvedValueOnce(sha).mockImplementation(() => {
      f.account.mockResolvedValue({ id: 43, username: "other" });
      return Promise.resolve(sha);
    });
    await expect(assertAuthoritativeLegacyCourse(f.request)).rejects.toMatchObject({
      diagnosticCode: "course_account_mismatch"
    });
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
