// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { GithubOAuthError } from "./githubOAuthCallback.js";
import { GithubOAuthSession } from "./githubOAuthSession.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";
const course = (
  repositoryId: number,
  authorization: RemoteCourse["authorization"] = "authorized"
): RemoteCourse => ({
  repositoryId,
  organizationId: 10,
  organizationLogin: "org",
  name: "course",
  fullName: "org/course",
  url: "https://github.com/org/course",
  nodeId: null,
  defaultBranch: "master",
  visibility: "private",
  archived: false,
  code: "CSC1120",
  title: "Course",
  schemaVersion: 1,
  discoveryHints: ["topic"],
  authorization,
  localStatus: "remote_only",
  localFolderIds: [],
  diagnostics: []
});
const fixture = (courses = [course(20)]) => {
  const network = {
    identity: vi.fn().mockResolvedValue({ id: 42, login: "faculty", name: null }),
    organizationCapability: vi.fn().mockResolvedValue(true),
    repositoryCapability: vi.fn().mockResolvedValue(true),
    discoverOrganizations: vi
      .fn()
      .mockResolvedValue({ status: "ready", organizations: [], message: null, stale: false }),
    exchange: vi.fn().mockResolvedValue("oauth-secret")
  };
  const bootstrapCourse = vi
    .fn()
    .mockResolvedValue({ status: "ready", diagnostic: null, retryable: false });
  const discoverCourses = vi
    .fn()
    .mockImplementation((_token, userId) =>
      Promise.resolve({ status: "ready", userId, discoveredAt: "now", courses, diagnostics: [] })
    );
  const store = { load: vi.fn().mockResolvedValue("oauth-secret"), save: vi.fn(), delete: vi.fn() };
  const session = new GithubOAuthSession({
    store,
    network,
    bootstrapCourse,
    discoverCourses,
    secret: () => "secret",
    openBrowser: async () => {},
    callback: async () => ({
      redirectUri: "http://127.0.0.1/callback",
      code: Promise.resolve("code"),
      cancel: () => {}
    })
  });
  return { session, network, bootstrapCourse, discoverCourses, store };
};
describe("automatic bootstrap session orchestration", () => {
  it("queues only trusted authorized discovery results automatically", async () => {
    const f = fixture([
      course(20),
      course(21, "not_authorized"),
      course(22, "faculty_identity_required"),
      course(23, "unavailable")
    ]);
    await f.session.restore();
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0]?.bootstrap?.status).toBe("ready")
    );
    expect(f.bootstrapCourse).toHaveBeenCalledOnce();
    expect(f.bootstrapCourse.mock.calls[0][0].course.repositoryId).toBe(20);
    expect(JSON.stringify(f.session.getState())).not.toContain("oauth-secret");
    f.session.shutdown();
  });
  it("publishes asynchronous progress and bounds workers while another course fails", async () => {
    const f = fixture([course(20), course(21), course(22)]);
    let finish!: () => void;
    f.bootstrapCourse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ status: "failed", diagnostic: "offline", retryable: true });
        })
    );
    await f.session.restore();
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0]?.bootstrap?.status).toBe(
        "bootstrapping"
      )
    );
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[2]?.bootstrap?.status).toBe("ready")
    );
    finish();
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0]?.bootstrap?.status).toBe("failed")
    );
    expect(f.session.getState().status).toBe("signed_in");
    f.session.shutdown();
  });
  it("sign-out clears active courses, discards late results and revokes session closure", async () => {
    const f = fixture();
    let finish!: () => void;
    f.bootstrapCourse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ status: "ready", diagnostic: null, retryable: false });
        })
    );
    await f.session.restore();
    await vi.waitFor(() => expect(f.bootstrapCourse).toHaveBeenCalledOnce());
    const input = f.bootstrapCourse.mock.calls[0][0];
    expect(await input.revalidateSession()).toBe(true);
    await f.session.signOut();
    finish();
    await vi.waitFor(() => expect(f.session.getState().courseDiscovery.courses).toEqual([]));
    expect(await input.revalidateSession()).toBe(false);
    expect(input.signal.aborted).toBe(true);
    expect(f.session.getState().identity).toBeNull();
    f.session.shutdown();
  });
  it("account switch cannot accept old bootstrap results; switching back uses original namespace", async () => {
    const f = fixture();
    let finish!: () => void;
    f.bootstrapCourse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ status: "ready", diagnostic: null, retryable: false });
        })
    );
    await f.session.restore();
    await vi.waitFor(() => expect(f.bootstrapCourse).toHaveBeenCalledOnce());
    f.network.identity.mockResolvedValue({ id: 99, login: "other", name: null });
    await f.session.signIn(true);
    await vi.waitFor(() => expect(f.session.getState().courseDiscovery.userId).toBe(99));
    finish();
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0]?.bootstrap?.status).toBe("ready")
    );
    expect(f.bootstrapCourse.mock.calls.map(([input]) => input.userId)).toEqual([42, 99]);
    f.network.identity.mockResolvedValue({ id: 42, login: "renamed-account", name: null });
    await f.session.signIn(true);
    await vi.waitFor(() => expect(f.bootstrapCourse).toHaveBeenCalledTimes(3));
    expect(f.bootstrapCourse.mock.calls[2][0].userId).toBe(42);
    f.session.shutdown();
  });
  it("revalidates current identity and both OAuth capabilities", async () => {
    const f = fixture();
    await f.session.restore();
    await vi.waitFor(() => expect(f.bootstrapCourse).toHaveBeenCalledOnce());
    const input = f.bootstrapCourse.mock.calls[0][0];
    expect(await input.revalidateSession()).toBe(true);
    f.network.repositoryCapability.mockResolvedValue(false);
    expect(await input.revalidateSession()).toBe(false);
    f.network.repositoryCapability.mockResolvedValue(true);
    f.network.organizationCapability.mockResolvedValue(false);
    expect(await input.revalidateSession()).toBe(false);
    f.network.organizationCapability.mockResolvedValue(true);
    f.network.identity.mockResolvedValue({ id: 99, login: "other", name: null });
    expect(await input.revalidateSession()).toBe(false);
    f.session.shutdown();
  });
});

describe("startup, refresh and synchronization lifecycle", () => {
  const synchronizationFixture = (courses = [course(20)]) => {
    const f = fixture(courses);
    const synchronizeCourse = vi
      .fn()
      .mockResolvedValue({ status: "up_to_date", diagnostic: null, retryable: false });
    const session = new GithubOAuthSession({
      store: f.store,
      network: f.network,
      bootstrapCourse: f.bootstrapCourse,
      discoverCourses: f.discoverCourses,
      synchronizeCourse,
      secret: () => "secret",
      openBrowser: async () => {},
      callback: async () => ({
        redirectUri: "http://127.0.0.1/callback",
        code: Promise.resolve("code"),
        cancel: () => {}
      })
    });
    return { ...f, session, synchronizeCourse };
  };
  it("bootstrap precedes sync; restoration returns before a fetch finishes; refresh reruns both", async () => {
    const f = synchronizationFixture();
    let finish!: () => void;
    f.synchronizeCourse.mockImplementationOnce(async (input) => {
      expect(f.bootstrapCourse).toHaveBeenCalledOnce();
      input.onProgress({ status: "fetching", diagnostic: null, retryable: false });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { status: "up_to_date", diagnostic: null, retryable: false };
    });
    await f.session.restore();
    await vi.waitFor(() => expect(f.synchronizeCourse).toHaveBeenCalledOnce());
    expect(f.session.getState().courseDiscovery.courses[0].synchronization?.status).toBe(
      "fetching"
    );
    finish();
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0].synchronization?.status).toBe(
        "up_to_date"
      )
    );
    await f.session.refreshOrganizations();
    expect(f.synchronizeCourse).toHaveBeenCalledTimes(2);
    expect(f.bootstrapCourse).toHaveBeenCalledTimes(2);
    expect(f.discoverCourses).toHaveBeenCalledTimes(2);
    f.session.shutdown();
  });
  it("one sync failure does not stop another course; refresh retries transient failures", async () => {
    const f = synchronizationFixture([course(20), course(21), course(22, "not_authorized")]);
    f.synchronizeCourse.mockRejectedValueOnce(new Error("private raw error"));
    await f.session.restore();
    await vi.waitFor(() => expect(f.synchronizeCourse).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0].synchronization?.status).toBe("failed")
    );
    expect(f.session.getState().courseDiscovery.courses[1].synchronization?.status).toBe(
      "up_to_date"
    );
    expect(f.session.getState().status).toBe("signed_in");
    expect(f.store.delete).not.toHaveBeenCalled();
    await f.session.refreshOrganizations();
    expect(f.session.getState().courseDiscovery.courses[0].synchronization?.status).toBe(
      "up_to_date"
    );
    f.session.shutdown();
  });
  it("ignores progress and results arriving after sign-out", async () => {
    const f = synchronizationFixture();
    let finish!: () => void;
    f.synchronizeCourse.mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      input.onProgress({ status: "updated", diagnostic: null, retryable: false });
      return { status: "updated", diagnostic: null, retryable: false };
    });
    await f.session.restore();
    await vi.waitFor(() => expect(f.synchronizeCourse).toHaveBeenCalledOnce());
    await f.session.signOut();
    finish();
    await vi.waitFor(() => expect(f.session.getState().identity).toBeNull());
    expect(f.session.getState().courseDiscovery.courses).toEqual([]);
    f.session.shutdown();
  });
  it("late old-account synchronization cannot overwrite a newly signed-in account", async () => {
    const f = synchronizationFixture();
    let finish!: () => void;
    f.synchronizeCourse.mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      input.onProgress({
        status: "needs_attention",
        diagnostic: "Old account diagnostic",
        retryable: false
      });
      return { status: "updated", diagnostic: null, retryable: false };
    });
    await f.session.restore();
    await vi.waitFor(() => expect(f.synchronizeCourse).toHaveBeenCalledOnce());
    f.network.identity.mockResolvedValue({ id: 99, login: "new", name: null });
    await f.session.signIn(true);
    await vi.waitFor(() => expect(f.synchronizeCourse).toHaveBeenCalledTimes(2));
    finish();
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0].synchronization?.status).toBe(
        "up_to_date"
      )
    );
    expect(f.session.getState().courseDiscovery.userId).toBe(99);
    expect(JSON.stringify(f.session.getState())).not.toContain("Old account");
    f.session.shutdown();
  });
  it("lost faculty authorization disables active managed navigation without signing out", async () => {
    const f = synchronizationFixture();
    f.synchronizeCourse.mockResolvedValueOnce({
      status: "needs_attention",
      reason: "authorization_lost",
      diagnostic: "Faculty authorization changed",
      retryable: false
    });
    await f.session.restore();
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.courses[0].authorization).toBe("unavailable")
    );
    expect(f.session.getState().status).toBe("signed_in");
    f.session.shutdown();
  });
});

it("keeps a valid global identity on Git authentication rejection, but clears a confirmed globally invalid credential", async () => {
  const f = fixture();
  const synchronizeCourse = vi.fn().mockResolvedValue({
    status: "failed",
    reason: "authentication_failed",
    diagnostic: "Git transport rejected",
    retryable: true
  });
  const session = new GithubOAuthSession({
    store: f.store,
    network: f.network,
    bootstrapCourse: f.bootstrapCourse,
    discoverCourses: f.discoverCourses,
    synchronizeCourse,
    secret: () => "secret",
    openBrowser: async () => {}
  });
  await session.restore();
  await vi.waitFor(() =>
    expect(session.getState().courseDiscovery.courses[0].synchronization?.status).toBe("failed")
  );
  expect(session.getState().status).toBe("signed_in");
  expect(f.store.delete).not.toHaveBeenCalled();
  synchronizeCourse.mockImplementation(async () => {
    f.network.identity.mockRejectedValue(
      new GithubOAuthError("invalid_credential", "Expired sign-in")
    );
    return {
      status: "failed",
      reason: "authentication_failed",
      diagnostic: "Git transport rejected",
      retryable: true
    };
  });
  await session.refreshOrganizations();
  expect(session.getState().status).toBe("signed_out");
  expect(f.store.delete).toHaveBeenCalledOnce();
  session.shutdown();
});
