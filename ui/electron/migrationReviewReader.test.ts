// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMigrationReviewReader } from "./migrationReviewReader.js";
import { loadMigrationReviewBackend } from "./migrationReviewService.js";
import {
  migrationSnapshotFixture,
  REVIEW_REPO,
  REVIEW_ORG,
  REVIEW_USER,
  REVIEW_NEW_SHA
} from "./migrationReviewFixtures.js";
import type { GitHubClient } from "./githubClientProvider.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";

const directories: string[] = [];
afterEach(() => {
  for (const root of directories.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const setup = (snapshot = migrationSnapshotFixture(false)) => {
  const entries = Object.entries(snapshot.sourceFiles).map(([file, content]) => {
    const bytes = Buffer.from(content);
    return {
      path: file,
      type: "blob",
      mode: "100644",
      size: bytes.length,
      sha: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
    };
  });
  const response = (data: unknown) => ({ status: 200, headers: {}, data });
  const client = {
    getCourseRepositoryById: vi.fn(async () =>
      response({
        id: REVIEW_REPO,
        node_id: "R_course",
        owner: { id: REVIEW_ORG, login: "example-org" },
        name: "se2030-graider",
        default_branch: "main",
        archived: false,
        disabled: false,
        private: true,
        topics: []
      })
    ),
    getRepositoryBranch: vi.fn(async () => ({
      name: "main",
      commitSha: snapshot.binding.sourceCommitSha
    })),
    getMigrationCommit: vi.fn(async () =>
      response({
        sha: snapshot.binding.sourceCommitSha,
        tree: { sha: snapshot.binding.sourceCommitSha }
      })
    ),
    getMigrationTree: vi.fn(async () =>
      response({ sha: snapshot.binding.sourceCommitSha, truncated: false, tree: entries })
    ),
    getMigrationBlob: vi.fn(async (_owner: string, _name: string, sha: string) => {
      const entry = entries.find((item) => item.sha === sha);
      if (!entry) throw new Error("Unknown blob.");
      return response({
        sha,
        encoding: "base64",
        content: Buffer.from(snapshot.sourceFiles[entry.path] ?? "").toString("base64")
      });
    }),
    getUser: vi.fn(async (username: string) => ({ id: REVIEW_USER, username })),
    writeRepositoryFile: vi.fn(),
    createRepository: vi.fn(),
    addTeamPermission: vi.fn(),
    createOrganizationInvitation: vi.fn(),
    createManagedBranchRule: vi.fn()
  };
  const userData = fs.mkdtempSync("/private/tmp/graider-review-reader-");
  directories.push(userData);
  const actual = loadMigrationReviewBackend();
  const backend = {
    ...actual,
    readLocalMigrationReviewEvidence: vi.fn(async () => ({
      runtime: { coverage: "unavailable" as const, files: {} }
    }))
  };
  const input = {
    token: "private-token",
    userId: REVIEW_USER,
    course: {
      repositoryId: REVIEW_REPO,
      organizationId: REVIEW_ORG,
      authorization: "authorized",
      defaultBranch: "main"
    } as RemoteCourse,
    signal: new AbortController().signal,
    revalidateSession: vi.fn(async () => true)
  };
  const reader = createMigrationReviewReader(
    input,
    userData,
    "prof",
    backend,
    () => client as unknown as GitHubClient
  );
  return { snapshot, entries, client, input, userData, reader, backend };
};

describe("read-only authoritative migration source adapter", () => {
  it("supports a remote-only course via exact remote tree/blob GETs without registration or writes", async () => {
    const f = setup();
    const writes = [
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "mkdirSync"),
      vi.spyOn(fs, "copyFileSync"),
      vi.spyOn(fs, "renameSync")
    ];
    try {
      const result = await f.reader.snapshot();
      expect(result.sourceFiles).toEqual(f.snapshot.sourceFiles);
      expect(result.binding).toMatchObject({
        repositoryId: REVIEW_REPO,
        sourceCommitSha: f.snapshot.binding.sourceCommitSha,
        authenticatedGithubUserId: REVIEW_USER
      });
      expect(result.binding.historicalOrganizationId).toBeUndefined();
      expect(f.client.getMigrationTree).toHaveBeenCalledWith(
        "example-org",
        "se2030-graider",
        result.binding.sourceCommitSha,
        expect.any(AbortSignal)
      );
      expect(f.client.getMigrationBlob).toHaveBeenCalledTimes(f.entries.length);
      for (const spy of writes) expect(spy).not.toHaveBeenCalled();
      for (const mutation of [
        f.client.writeRepositoryFile,
        f.client.createRepository,
        f.client.addTeamPermission,
        f.client.createOrganizationInvitation,
        f.client.createManagedBranchRule
      ])
        expect(mutation).not.toHaveBeenCalled();
      expect(fs.readdirSync(f.userData)).toEqual([]);
    } finally {
      writes.forEach((spy) => spy.mockRestore());
    }
  });
  it("fails closed on truncated source, instead of partially analyzing", async () => {
    const f = setup();
    f.client.getMigrationTree.mockResolvedValue({
      status: 200,
      headers: {},
      data: { sha: f.snapshot.binding.sourceCommitSha, truncated: true, tree: f.entries }
    });
    await expect(f.reader.snapshot()).rejects.toThrow(/Complete repository/);
  });
  it("fails closed if faculty assignment or account authorization is lost", async () => {
    const f = setup();
    f.input.revalidateSession.mockResolvedValue(false);
    await expect(f.reader.snapshot()).rejects.toThrow(/account/);
    f.input.revalidateSession.mockResolvedValue(true);
    const reader = createMigrationReviewReader(
      f.input,
      f.userData,
      "unassigned",
      f.backend,
      () => f.client as unknown as GitHubClient
    );
    await expect(reader.snapshot()).rejects.toThrow(/faculty assignment/);
  });
  it("unrelated malformed configuration cannot bypass current faculty authorization", async () => {
    const snapshot = migrationSnapshotFixture(false);
    snapshot.sourceFiles = {
      ...snapshot.sourceFiles,
      "terms/27s1/assignments/lab04/assignment.yml": "["
    };
    const f = setup(snapshot);
    const reader = createMigrationReviewReader(
      f.input,
      f.userData,
      "unassigned",
      f.backend,
      () => f.client as unknown as GitHubClient
    );
    await expect(reader.snapshot()).rejects.toThrow(/faculty assignment/);
    expect(
      loadMigrationReviewBackend().analyzeSchemaV1Migration(await f.reader.snapshot()).status
    ).toBe("blocked");
  });
  it("observes current remote revision, never local HEAD", async () => {
    const f = setup();
    f.client.getRepositoryBranch.mockResolvedValue({ name: "main", commitSha: REVIEW_NEW_SHA });
    expect((await f.reader.observe()).sourceCommitSha).toBe(REVIEW_NEW_SHA);
  });
  it("verifies current GitHub login and immutable ID using only getUser", async () => {
    const f = setup();
    expect(await f.reader.lookupLogin("faculty-now")).toEqual({
      githubUserId: REVIEW_USER,
      githubLogin: "faculty-now"
    });
    expect(f.client.getUser).toHaveBeenCalledWith("faculty-now");
  });
  it("an existing runtime directory is read without routing/seeding it", async () => {
    const f = setup();
    const source = path.join(f.userData, "no-cache");
    const runtime = path.join(f.userData, "runtime");
    const before = fs.readdirSync(f.userData);
    const evidence = await loadMigrationReviewBackend().readLocalMigrationReviewEvidence(
      source,
      runtime,
      f.snapshot.binding.sourceCommitSha
    );
    expect(evidence.runtime.files).toEqual({});
    expect(fs.readdirSync(f.userData)).toEqual(before);
    expect(fs.existsSync(runtime)).toBe(false);
  });
});
