import { describe, expect, it, vi } from "vitest";
import { verifyMigrationCheckpoint } from "../../../src/migration/migration-checkpoint.js";
import {
  createExactCommitRevision,
  createGitAuthenticationContext,
  createTrustedGitRemote,
  type ObjectId
} from "../../../src/git/git-workspace.js";
const SHA_LENGTH = 40;
const required = <T>(value: T | null): T => {
  if (value === null) throw new Error("Invalid fixture value");
  return value;
};
const SOURCE = "a".repeat(SHA_LENGTH) as ObjectId;
const OTHER = "b".repeat(SHA_LENGTH) as ObjectId;
const ref = `refs/tags/graider-migration-v1/${SOURCE}`;
const setup = () => {
  let remote: ObjectId | null = null;
  const workspace = {
    readRemoteCheckpoint: vi.fn(() => Promise.resolve(remote)),
    createRemoteCheckpoint: vi.fn(() => {
      remote = SOURCE;
      return Promise.resolve();
    })
  };
  const revalidate = vi.fn(() => Promise.resolve());
  const request = {
    remote: required(createTrustedGitRemote("https://github.com/example/course.git")),
    sourceCommit: required(createExactCommitRevision(SOURCE)),
    authentication: required(createGitAuthenticationContext("session"))
  };
  return {
    workspace,
    request,
    revalidate,
    setRemote: (value: ObjectId | null) => {
      remote = value;
    },
    run: () => verifyMigrationCheckpoint(workspace, request, revalidate)
  };
};
describe("verified migration v1 checkpoint", () => {
  it("creates an absent checkpoint, independently rereads it and revalidates current authority", async () => {
    const f = setup();
    expect(await f.run()).toEqual({
      status: "verified",
      reference: ref,
      commit: SOURCE,
      publicationReady: false
    });
    expect(f.workspace.createRemoteCheckpoint).toHaveBeenCalledExactlyOnceWith(f.request);
    expect(f.workspace.readRemoteCheckpoint).toHaveBeenCalledTimes(2);
    expect(f.revalidate).toHaveBeenCalledTimes(4);
  });
  it("treats the exact existing remote tag as idempotent", async () => {
    const f = setup();
    f.setRemote(SOURCE);
    expect((await f.run()).status).toBe("verified");
    expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
  });
  it("leaves a conflicting tag untouched as Needs attention", async () => {
    const f = setup();
    f.setRemote(OTHER);
    expect(await f.run()).toMatchObject({
      status: "needs_attention",
      reason: "checkpoint_conflict",
      publicationReady: false
    });
    expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
  });
  it("recovers a lost push response only after fresh remote observation", async () => {
    const f = setup();
    f.workspace.createRemoteCheckpoint.mockImplementationOnce(() => {
      f.setRemote(SOURCE);
      throw new Error("lost response fake-secret");
    });
    expect((await f.run()).status).toBe("verified");
    expect(f.workspace.readRemoteCheckpoint).toHaveBeenCalledTimes(2);
  });
  it.each([null, OTHER])(
    "does not claim success after failed push when remote is %s",
    async (remote) => {
      const f = setup();
      f.workspace.createRemoteCheckpoint.mockImplementationOnce(() => {
        f.setRemote(remote);
        throw new Error("secret Authorization");
      });
      expect(await f.run()).toMatchObject({
        status: "needs_attention",
        reason: remote === null ? "checkpoint_unverified" : "checkpoint_conflict"
      });
    }
  );
  it("requires verification even after a successful push response", async () => {
    const f = setup();
    f.workspace.createRemoteCheckpoint.mockImplementationOnce(() => Promise.resolve());
    expect((await f.run()).status).toBe("needs_attention");
  });
  it("cannot use an unavailable remote observation as local success", async () => {
    const f = setup();
    f.workspace.readRemoteCheckpoint.mockRejectedValue(new Error("fake-secret"));
    expect(await f.run()).toMatchObject({
      status: "needs_attention",
      reason: "checkpoint_unverified"
    });
    expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3, 4])(
    "blocks when source/session/authorization changes at validation %i",
    async (call) => {
      const f = setup();
      let calls = 0;
      f.revalidate.mockImplementation(() => {
        calls += 1;
        if (calls === call) throw new Error("stale or unauthorized fake-secret");
        return Promise.resolve();
      });
      const result = await f.run();
      expect(result).toMatchObject({ status: "needs_attention", reason: "validation_failed" });
      expect(JSON.stringify(result)).not.toContain("fake-secret");
      if (call <= 2) expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
    }
  );
  it("verify-only retry observes absence without creating a tag", async () => {
    const f = setup();
    expect(
      await verifyMigrationCheckpoint(f.workspace, f.request, f.revalidate, { create: false })
    ).toMatchObject({ status: "needs_attention", reason: "checkpoint_unverified" });
    expect(f.workspace.createRemoteCheckpoint).not.toHaveBeenCalled();
  });
});
