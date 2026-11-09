// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { GithubOAuthSession } from "./githubOAuthSession.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";

const USER = 101;
const REPOSITORY = 700;
const fixture = async () => {
  const store = {
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {})
  };
  const network = {
    discoverOrganizations: vi.fn(async () => ({
      status: "ready" as const,
      organizations: [],
      message: null,
      stale: false
    })),
    exchange: vi.fn(async () => "oauth-token"),
    verifyAccount: vi.fn(async () => ({
      identity: { id: USER, login: "faculty", name: null },
      scopes: ["read:org", "repo"],
      repositoryCapability: true,
      organizationCapability: true
    }))
  };
  const synchronizeCourse = vi.fn();
  const session = new GithubOAuthSession({
    store,
    network,
    synchronizeCourse,
    openBrowser: vi.fn(async () => {}),
    secret: () => "secret",
    callback: vi.fn(async () => ({
      redirectUri: "http://127.0.0.1:1234/callback",
      code: Promise.resolve("code"),
      cancel: vi.fn()
    })),
    discoverCourses: vi.fn(async () => ({
      status: "ready" as const,
      userId: USER,
      discoveredAt: null,
      diagnostics: [],
      courses: [
        {
          repositoryId: REPOSITORY,
          authorization: "authorized",
          schemaVersion: 1,
          localStatus: "remote_only",
          localFolderIds: []
        } as unknown as RemoteCourse
      ]
    }))
  });
  await session.signIn();
  await session.refreshOrganizations();
  store.save.mockClear();
  store.delete.mockClear();
  synchronizeCourse.mockClear();
  return { session, network, store, synchronizeCourse };
};

describe("OAuth migration review read boundary", () => {
  it("authorizes remote-only selectors without synchronization, bootstrap or credential writes", async () => {
    const f = await fixture();
    const result = await f.session.withReadOnlyCourse(REPOSITORY, USER, async (input) => {
      expect(input.userId).toBe(USER);
      expect(input.course.repositoryId).toBe(REPOSITORY);
      expect(input.resynchronize).toBeUndefined();
      expect(await input.revalidateSession()).toBe(true);
      return "review";
    });
    expect(result).toBe("review");
    expect(f.synchronizeCourse).not.toHaveBeenCalled();
    expect(f.store.save).not.toHaveBeenCalled();
    expect(f.store.delete).not.toHaveBeenCalled();
  });
  it("rejects arbitrary repository and account selectors", async () => {
    const f = await fixture();
    const operation = vi.fn();
    await expect(f.session.withReadOnlyCourse(REPOSITORY + 1, USER, operation)).rejects.toThrow();
    await expect(f.session.withReadOnlyCourse(REPOSITORY, USER + 1, operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
  it("account changes during a read invalidate its result", async () => {
    const f = await fixture();
    await expect(
      f.session.withReadOnlyCourse(REPOSITORY, USER, async (input) => {
        await f.session.signOut();
        expect(input.signal.aborted).toBe(true);
        expect(await input.revalidateSession()).toBe(false);
        return "must not return";
      })
    ).rejects.toThrow(/account authorization changed/);
  });
});
