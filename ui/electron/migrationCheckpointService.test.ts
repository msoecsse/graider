import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMigrationCheckpointService } from "./migrationCheckpointService.js";
import {
  createMigrationReviewService,
  loadMigrationReviewBackend
} from "./migrationReviewService.js";
import {
  migrationSnapshotFixture,
  reviewedSubmissionFixture,
  REVIEW_ORG,
  REVIEW_SELECTOR,
  REVIEW_USER,
  REVIEW_OTHER_USER,
  REVIEW_NEW_SHA
} from "./migrationReviewFixtures.js";
import type { ManagedOperationInput } from "./githubOAuthSession.js";
import type { CourseRepository } from "./githubRemoteRepositories.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";
const OWNER = 1;
const DIGEST_LENGTH = 64;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const setup = async () => {
  const backend = loadMigrationReviewBackend();
  const snapshot = migrationSnapshotFixture();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider checkpoint service "));
  roots.push(root);
  const repository: CourseRepository = {
    id: snapshot.binding.repositoryId,
    organizationId: REVIEW_ORG,
    owner: "example-org",
    name: "se2030-graider",
    fullName: "example-org/se2030-graider",
    url: "https://github.com/example-org/se2030-graider",
    nodeId: null,
    defaultBranch: "main",
    visibility: "private",
    archived: false,
    disabled: false,
    topics: []
  };
  let userId = REVIEW_USER;
  let generation = 1;
  let institutionalUsername: string | null = "prof";
  let currentSha = snapshot.binding.sourceCommitSha;
  let fingerprint = "c".repeat(DIGEST_LENGTH);
  let sessionCurrent = true;
  let tag: string | null = null;
  const observe = vi.fn(async () => ({ repository, sourceCommitSha: currentSha }));
  const reader = {
    snapshot: async () => snapshot,
    observe,
    lookupLogin: async (githubLogin: string) => ({ githubUserId: REVIEW_USER, githubLogin })
  };
  const reviewService = createMigrationReviewService({
    backend: loadMigrationReviewBackend,
    withCourse: async (_selector, operation) =>
      operation({ userId, generation, institutionalUsername, reader })
  });
  const loaded = await reviewService.load(OWNER, { selector: REVIEW_SELECTOR });
  const view = loaded.view!;
  const request = {
    sessionId: view.sessionId,
    source: backend.migrationReviewSource(view.analysis)
  };
  expect(
    (
      await reviewService.complete(OWNER, {
        ...request,
        submission: reviewedSubmissionFixture(view)
      })
    ).status
  ).toBe("complete");
  const workspace = {
    readRemoteCheckpoint: vi.fn(async () => tag),
    createRemoteCheckpoint: vi.fn(
      async (
        _request: Parameters<Backend.GitRemoteCheckpointWorkspace["createRemoteCheckpoint"]>[0]
      ) => {
        tag = currentSha;
      }
    )
  };
  const withWorkspace = vi.fn(async (_remote, _token, operation) =>
    operation(workspace, { id: "operation-auth" })
  );
  const input: ManagedOperationInput = {
    userId: REVIEW_USER,
    token: "fake-secret-token",
    course: { repositoryId: repository.id, organizationId: REVIEW_ORG } as RemoteCourse,
    signal: new AbortController().signal,
    revalidateSession: vi.fn(async () => sessionCurrent)
  };
  const candidate = vi.fn(async () => fingerprint);
  const service = createMigrationCheckpointService({
    userData: root,
    reviewService,
    withCourse: async (_selector, operation) => operation(input),
    observe,
    readCandidateFingerprint: candidate,
    backend: () => ({ ...backend, withMigrationCheckpointWorkspace: withWorkspace })
  });
  return {
    service,
    input,
    repository,
    observe,
    workspace,
    withWorkspace,
    candidate,
    reviewService,
    request,
    view,
    root,
    source: () => {
      currentSha = REVIEW_NEW_SHA;
    },
    account: () => {
      userId = REVIEW_OTHER_USER;
    },
    generation: () => {
      generation += 1;
    },
    deauthorize: () => {
      institutionalUsername = null;
    },
    session: () => {
      sessionCurrent = false;
    },
    candidateMismatch: () => {
      fingerprint = "d".repeat(DIGEST_LENGTH);
    },
    tag: (value: string | null) => {
      tag = value;
    }
  };
};
describe("main-only migration checkpoint and retry infrastructure", () => {
  it("uses the canonical remote and operation authentication without touching an active cache", async () => {
    const f = await setup();
    const active = path.join(
      f.root,
      "managed-courses",
      String(REVIEW_USER),
      String(f.repository.id),
      "repo"
    );
    fs.mkdirSync(active, { recursive: true });
    fs.writeFileSync(path.join(active, "dirty.txt"), "untouched");
    expect(await f.service.checkpoint(OWNER, f.request)).toMatchObject({
      status: "verified",
      commit: f.request.source.sourceCommitSha,
      publicationReady: false
    });
    expect(f.withWorkspace.mock.calls[0]?.slice(0, 2)).toEqual([
      `${f.repository.url}.git`,
      "fake-secret-token"
    ]);
    expect(f.workspace.createRemoteCheckpoint.mock.calls[0]?.[0]).toMatchObject({
      sourceCommit: f.request.source.sourceCommitSha,
      remote: `${f.repository.url}.git`,
      authentication: { id: "operation-auth" }
    });
    expect(fs.readFileSync(path.join(active, "dirty.txt"), "utf8")).toBe("untouched");
    expect(fs.readdirSync(active)).toEqual(["dirty.txt"]);
  });
  it.each(["source", "account", "generation", "deauthorize", "session"] as const)(
    "rejects %s changes before any remote writes",
    async (change) => {
      const f = await setup();
      f[change]();
      expect((await f.service.checkpoint(OWNER, f.request)).status).toBe("needs_attention");
      expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
    }
  );
  it.each(["id", "organizationId"] as const)(
    "rejects canonical repository %s mismatch",
    async (key) => {
      const f = await setup();
      Object.assign(f.repository, { [key]: 999 });
      expect((await f.service.checkpoint(OWNER, f.request)).status).toBe("needs_attention");
      expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
    }
  );
  it("requires a trusted completed review and validates request ownership", async () => {
    const f = await setup();
    expect((await f.service.checkpoint(OWNER + 1, f.request)).status).toBe("needs_attention");
    await f.reviewService.refresh(OWNER, f.request);
    expect((await f.service.checkpoint(OWNER, f.request)).status).toBe("needs_attention");
    expect(f.withWorkspace).not.toHaveBeenCalled();
  });
  it("refuses success when the remote advances during push without undoing the checkpoint", async () => {
    const f = await setup();
    f.workspace.createRemoteCheckpoint.mockImplementationOnce(async () => {
      f.tag(f.request.source.sourceCommitSha);
      f.source();
    });
    expect(await f.service.checkpoint(OWNER, f.request)).toMatchObject({
      status: "needs_attention",
      reason: "validation_failed"
    });
    expect(f.workspace.createRemoteCheckpoint).toHaveBeenCalledOnce();
  });
  it("revalidates after asynchronous attempt cleanup before reporting success", async () => {
    const f = await setup();
    f.withWorkspace.mockImplementationOnce(async (_remote, _token, operation) => {
      const result = await operation(f.workspace, { id: "operation-auth" });
      f.source();
      return result;
    });
    expect((await f.service.checkpoint(OWNER, f.request)).status).toBe("needs_attention");
  });
  it.each(["account", "deauthorize", "session", "review"])(
    "rejects %s changes during remote observation",
    async (change) => {
      const f = await setup();
      f.workspace.readRemoteCheckpoint.mockImplementationOnce(async () => {
        if (change === "review")
          await f.reviewService.complete(OWNER, {
            ...f.request,
            submission: reviewedSubmissionFixture(f.view)
          });
        else f[change as "account" | "deauthorize" | "session"]();
        return f.request.source.sourceCommitSha;
      });
      expect((await f.service.checkpoint(OWNER, f.request)).status).toBe("needs_attention");
      expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
    }
  );
  it("retains only a strict redacted record and revalidates every retry", async () => {
    const f = await setup();
    await f.service.checkpoint(OWNER, f.request);
    expect(await f.service.retainFailure(OWNER, f.request, "prepublication_failed")).toEqual({
      status: "retained",
      publicationReady: false
    });
    const file = path.join(
      f.root,
      "managed-courses",
      String(REVIEW_USER),
      String(f.repository.id),
      "migration-retry.json"
    );
    const contents = fs.readFileSync(file, "utf8");
    expect(contents).not.toMatch(
      /fake-secret|Authorization|operation-auth|token|authorized|publicationReady/
    );
    expect(JSON.parse(contents).binding).toMatchObject({
      authenticatedGithubUserId: REVIEW_USER,
      repositoryId: f.repository.id,
      organizationId: REVIEW_ORG,
      sourceCommitSha: f.request.source.sourceCommitSha,
      reportId: f.request.source.reportId,
      candidateFingerprint: "c".repeat(DIGEST_LENGTH),
      checkpointCommit: f.request.source.sourceCommitSha
    });
    const before = f.observe.mock.calls.length;
    expect(await f.service.retry(OWNER, f.request)).toEqual({
      status: "reusable",
      publicationReady: false
    });
    expect(f.observe.mock.calls.length).toBeGreaterThan(before);
    expect(f.workspace.createRemoteCheckpoint).toHaveBeenCalledOnce();
    const restarted = createMigrationCheckpointService({
      userData: f.root,
      reviewService: f.reviewService,
      withCourse: async (_selector, operation) => operation(f.input),
      observe: f.observe,
      readCandidateFingerprint: f.candidate,
      backend: () => ({
        ...loadMigrationReviewBackend(),
        withMigrationCheckpointWorkspace: f.withWorkspace
      })
    });
    expect((await restarted.retry(OWNER, f.request)).status).toBe("reusable");
  });
  it.each([
    "source",
    "account",
    "generation",
    "deauthorize",
    "session",
    "candidateMismatch"
  ] as const)("invalidates retained retry after %s", async (change) => {
    const f = await setup();
    await f.service.checkpoint(OWNER, f.request);
    await f.service.retainFailure(OWNER, f.request, "prepublication_failed");
    f[change]();
    expect((await f.service.retry(OWNER, f.request)).status).toBe("invalidated");
  });
  it.each(["repository", "organization", "review", "refresh", "close", "tag", "missing-tag"])(
    "invalidates retained retry after %s replacement",
    async (change) => {
      const f = await setup();
      await f.service.checkpoint(OWNER, f.request);
      await f.service.retainFailure(OWNER, f.request, "prepublication_failed");
      if (change === "repository") Object.assign(f.repository, { id: 999 });
      if (change === "organization") Object.assign(f.repository, { organizationId: 999 });
      if (change === "review")
        await f.reviewService.complete(OWNER, {
          ...f.request,
          submission: reviewedSubmissionFixture(f.view)
        });
      if (change === "refresh") await f.reviewService.refresh(OWNER, f.request);
      if (change === "close") f.reviewService.close(OWNER);
      if (change === "tag") f.tag(REVIEW_NEW_SHA);
      if (change === "missing-tag") f.tag(null);
      expect((await f.service.retry(OWNER, f.request)).status).toBe("invalidated");
      expect(f.workspace.createRemoteCheckpoint).toHaveBeenCalledOnce();
    }
  );
  it("a forged valid disk record cannot bypass current authorization", async () => {
    const f = await setup();
    await f.service.checkpoint(OWNER, f.request);
    await f.service.retainFailure(OWNER, f.request, "prepublication_failed");
    f.session();
    expect((await f.service.retry(OWNER, f.request)).status).toBe("invalidated");
  });
  it("a new completed review at the same source cannot restore an old retry record", async () => {
    const f = await setup();
    await f.service.checkpoint(OWNER, f.request);
    await f.service.retainFailure(OWNER, f.request, "prepublication_failed");
    const refreshed = await f.reviewService.refresh(OWNER, f.request);
    const view = refreshed.view!;
    const request = {
      sessionId: view.sessionId,
      source: loadMigrationReviewBackend().migrationReviewSource(view.analysis)
    };
    await f.reviewService.complete(OWNER, {
      ...request,
      submission: reviewedSubmissionFixture(view)
    });
    expect((await f.service.retry(OWNER, request)).status).toBe("invalidated");
    expect(f.workspace.createRemoteCheckpoint).toHaveBeenCalledOnce();
  });
  it("rejects arbitrary failure text, and never retains an unverified checkpoint", async () => {
    const f = await setup();
    expect((await f.service.retainFailure(OWNER, f.request, "prepublication_failed")).status).toBe(
      "invalidated"
    );
    await f.service.checkpoint(OWNER, f.request);
    expect(
      (await f.service.retainFailure(OWNER, f.request, "Authorization: fake-secret" as never))
        .status
    ).toBe("invalidated");
    expect(fs.existsSync(path.join(f.root, "managed-courses"))).toBe(false);
  });
  it("rechecks candidate and retained review after asynchronous remote observation", async () => {
    const f = await setup();
    await f.service.checkpoint(OWNER, f.request);
    await f.service.retainFailure(OWNER, f.request, "prepublication_failed");
    f.workspace.readRemoteCheckpoint.mockImplementationOnce(async () => {
      f.candidateMismatch();
      return f.request.source.sourceCommitSha;
    });
    expect((await f.service.retry(OWNER, f.request)).status).toBe("invalidated");
  });
});
