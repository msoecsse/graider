import { managedOperationalFixture } from "./managedOperationalFixtures";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures";
import { ManagedCourseMutationGuard } from "./managedCourseMutationGuard";
import { discoverRemoteCourses } from "./remoteCourseDiscovery";
import { IPC_CHANNELS } from "./ipc";
// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GithubOAuthSession } from "./githubOAuthSession";
import { loadCourseSnapshot, saveCourseSnapshot } from "./courseDiscoverySnapshot";
import type { RemoteCourse, RemoteCourseDiscovery } from "./remoteCourseTypes";
vi.mock("./githubRemoteRepositories.js", async (original) => ({
  ...(await original<object>()),
  createRemoteRepositoryReader: () => {
    throw new Error("Unexpected remote reader from local grading.");
  }
}));
const course: RemoteCourse = {
  repositoryId: 20,
  nodeId: null,
  organizationId: 10,
  organizationLogin: "fixture",
  name: "course",
  fullName: "fixture/course",
  url: "https://github.com/fixture/course",
  defaultBranch: "main",
  visibility: "private",
  archived: false,
  code: "fixture101",
  title: "Original title",
  schemaVersion: 1,
  discoveryHints: [],
  authorization: "authorized",
  localStatus: "registered_local",
  localFolderIds: ["folder"],
  diagnostics: []
};
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const setup = (cold = false) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-course-startup-"));
  roots.push(root);
  saveCourseSnapshot(root, 42, [course]);
  const scan = deferred<RemoteCourseDiscovery>();
  const verifyCourse = vi.fn(async (): Promise<RemoteCourse> => ({ ...course }));
  const discoverCourses = vi.fn(() => scan.promise);
  const findRegisteredCourse = vi.fn(async () => ({ ...course }));
  const saveSnapshot = vi.fn((userId: number, courses: readonly RemoteCourse[]) =>
    saveCourseSnapshot(root, userId, courses)
  );
  const session = new GithubOAuthSession({
    store: { load: async () => "fixture-token", save: async () => {}, delete: async () => {} },
    secret: () => "fixture-secret",
    openBrowser: async () => {},
    network: {
      exchange: async () => "fixture-token",
      verifyAccount: async () => ({
        identity: { id: 42, login: "faculty", name: null },
        scopes: ["repo", "read:org"],
        repositoryCapability: true,
        organizationCapability: true
      }),
      discoverOrganizations: async () => ({
        status: "ready",
        organizations: [
          {
            organizationId: 10,
            login: "fixture",
            membershipState: "active",
            membershipRole: "member",
            directMembership: true,
            accessStatus: "accessible",
            accessDiagnostic: "ok"
          }
        ],
        message: null,
        stale: false
      })
    },
    loadSnapshot: (userId) => (cold ? [] : loadCourseSnapshot(root, userId)),
    saveSnapshot,
    ...(cold ? { findRegisteredCourse } : {}),
    verifyCourse,
    discoverCourses
  });
  const finish = (courses = [course]) =>
    scan.resolve({ status: "ready", userId: 42, discoveredAt: null, courses, diagnostics: [] });
  return {
    root,
    scan,
    session,
    verifyCourse,
    discoverCourses,
    findRegisteredCourse,
    saveSnapshot,
    finish
  };
};
describe("cache-first startup", () => {
  it("displays cached cards and authorizes selected Schema 1 before discovery, then reuses session authority", async () => {
    const f = setup();
    f.verifyCourse.mockResolvedValueOnce({ ...course, title: "New targeted observation" });
    await f.session.restore();
    expect(f.session.getState().courseDiscovery.courses[0]).toMatchObject({
      freshness: "cached",
      authorization: "unavailable"
    });
    await expect(f.session.withLocalCourse(20, 42, async () => {})).rejects.toThrow();
    await f.session.waitForCourseStartup("folder");
    for (const action of ["prepare", "switch", "save", "complete"]) {
      await f.session.waitForCourseStartup("folder");
      expect(await f.session.withLocalCourse(20, 42, async () => action)).toBe(action);
    }
    expect(f.verifyCourse).toHaveBeenCalledOnce();
    expect(f.session.getState().courseDiscovery.status).toBe("loading");
    const refresh = f.session.refreshOrganizations();
    expect(f.session.getState().courseDiscovery.courses).toHaveLength(1);
    expect(f.discoverCourses).toHaveBeenCalledOnce();
    f.finish([course, { ...course, repositoryId: 21, localFolderIds: [] }]);
    await refresh;
    await vi.waitFor(() => expect(f.session.getState().courseDiscovery.courses).toHaveLength(2));
    expect(f.session.getState().courseDiscovery.courses[0].title).toBe("New targeted observation");
    f.session.shutdown();
  });
  it("coalesces concurrent registered startup reads when no discovery snapshot exists", async () => {
    const f = setup(true);
    await f.session.restore();
    await Promise.all(Array.from({ length: 4 }, () => f.session.waitForCourseStartup("folder")));
    expect(f.findRegisteredCourse).toHaveBeenCalledOnce();
    expect(f.verifyCourse).not.toHaveBeenCalled();
    expect(f.session.getState().courseDiscovery.courses).toHaveLength(1);
    await expect(f.session.withLocalCourse(20, 42, async () => "ready")).resolves.toBe("ready");
    f.finish();
    f.session.shutdown();
  });
  it("preserves visible cards after transient failure and rejects unverified cache operations", async () => {
    const f = setup();
    await f.session.restore();
    await vi.waitFor(() => expect(f.discoverCourses).toHaveBeenCalledOnce());
    f.scan.reject(new Error("injected outage"));
    await vi.waitFor(() => expect(f.session.getState().courseDiscovery.status).toBe("error"));
    expect(f.session.getState().courseDiscovery.courses).toHaveLength(1);
    f.verifyCourse.mockRejectedValueOnce(new Error("revoked"));
    await expect(f.session.waitForCourseStartup("folder")).rejects.toThrow("fixture101");
    expect(f.session.getState().courseDiscovery.courses[0].freshness).toBe("needs_attention");
    f.session.shutdown();
  });
  it("isolates account snapshots, strips credentials and rejects corrupt persistence", () => {
    const f = setup();
    saveCourseSnapshot(f.root, 42, [{ ...course, credential: "must-not-persist" } as RemoteCourse]);
    const target = path.join(f.root, "course-discovery-42.json");
    const stored = fs.readFileSync(target, "utf8");
    expect(stored).not.toContain("must-not-persist");
    expect(loadCourseSnapshot(f.root, 43)).toEqual([]);
    expect(() =>
      saveCourseSnapshot(f.root, 42, [{ ...course, repositoryId: Number.NaN }])
    ).toThrow();
    expect(loadCourseSnapshot(f.root, 42)).toHaveLength(1);
    fs.writeFileSync(target, stored.replace('"userId":42', '"userId":43'));
    expect(loadCourseSnapshot(f.root, 42)).toEqual([]);
    f.session.shutdown();
  });
  it.each(["visibility", "localStatus"] as const)(
    "rejects non-string persisted %s instead of coercing it",
    (field) => {
      const f = setup();
      const malformed = { ...course, [field]: [course[field]] };
      const target = path.join(f.root, "course-discovery-42.json");
      fs.writeFileSync(target, JSON.stringify({ version: 1, userId: 42, courses: [malformed] }));
      expect(loadCourseSnapshot(f.root, 42)).toEqual([]);
      f.session.shutdown();
    }
  );
  it("rejects account changes and source replacements during targeted verification", async () => {
    const f = setup();
    await f.session.restore();
    f.verifyCourse.mockResolvedValueOnce({ ...course, repositoryId: 99 });
    await expect(f.session.waitForCourseStartup("folder")).rejects.toThrow();
    const pending = deferred<RemoteCourse>();
    f.verifyCourse.mockImplementationOnce(() => pending.promise);
    const opening = f.session.waitForCourseStartup("folder");
    await vi.waitFor(() => expect(f.verifyCourse).toHaveBeenCalledTimes(2));
    await f.session.signOut();
    pending.resolve(course);
    await expect(opening).rejects.toThrow();
    f.finish();
    await expect(f.session.withLocalCourse(20, 42, async () => {})).rejects.toThrow();
    expect(f.session.getState().courseDiscovery.courses).toEqual([]);
    expect(f.saveSnapshot).not.toHaveBeenCalled();
    f.session.shutdown();
  });
  it("retains established access during a transient course check and invalidates a definitive repository refusal", async () => {
    const f = setup();
    await f.session.restore();
    await f.session.waitForCourseStartup("folder");
    f.scan.resolve({
      status: "partial_failure",
      userId: 42,
      discoveredAt: null,
      courses: [],
      diagnostics: [
        {
          organizationId: 10,
          repositoryId: 20,
          localFolderIds: ["folder"],
          status: "network_unavailable",
          message: "Temporary fixture outage"
        }
      ]
    });
    await vi.waitFor(() =>
      expect(f.session.getState().courseDiscovery.status).toBe("partial_failure")
    );
    await expect(f.session.withLocalCourse(20, 42, async () => "cached access")).resolves.toBe(
      "cached access"
    );
    f.discoverCourses.mockResolvedValueOnce({
      status: "partial_failure",
      userId: 42,
      discoveredAt: null,
      courses: [],
      diagnostics: [
        {
          organizationId: 10,
          repositoryId: 20,
          localFolderIds: ["folder"],
          status: "repository_inaccessible",
          message: "Access revoked"
        }
      ]
    });
    await f.session.refreshOrganizations();
    await expect(f.session.withLocalCourse(20, 42, async () => {})).rejects.toThrow();
    f.session.shutdown();
  });
  it("does not overwrite a newer authorization refusal with a late targeted response", async () => {
    const f = setup();
    await f.session.restore();
    const pending = deferred<RemoteCourse>();
    f.verifyCourse.mockImplementationOnce(() => pending.promise);
    const opening = f.session.waitForCourseStartup("folder");
    await vi.waitFor(() => expect(f.verifyCourse).toHaveBeenCalledOnce());
    f.finish([{ ...course, authorization: "not_authorized" }]);
    await vi.waitFor(() => expect(f.session.getState().courseDiscovery.status).toBe("ready"));
    pending.resolve(course);
    await expect(opening).rejects.toThrow();
    expect(f.session.getState().courseDiscovery.courses[0].authorization).toBe("not_authorized");
    await expect(f.session.withLocalCourse(20, 42, async () => {})).rejects.toThrow();
    f.session.shutdown();
  });
});

it(
  "opens a registered Schema 1 Git source through the production local guard while broad discovery remains pending",
  async () => {
    const git = await managedOperationalFixture();
    const f = setup();
    const list = vi.spyOn(git.reader, "list");
    const search = vi.spyOn(git.reader, "search");
    f.verifyCourse.mockImplementation(async () => {
      const result = await discoverRemoteCourses({
        targeted: true,
        userId: 42,
        username: "jones",
        organizations: [
          {
            organizationId: 10,
            login: "fixture",
            membershipState: "active",
            membershipRole: "member",
            directMembership: true,
            accessStatus: "accessible",
            accessDiagnostic: "ok"
          }
        ],
        locals: [],
        managedRegistrations: [{ repositoryId: 20, organizationId: 10, folderIds: ["folder"] }],
        reader: git.reader
      });
      if (!result.courses[0]) throw new Error("Fixture course access failed.");
      return result.courses[0];
    });
    const guard = new ManagedCourseMutationGuard({
      ...git.deps,
      session: f.session,
      folders: () => git.deps.folders().map((folder) => ({ ...folder, id: "folder" }))
    });
    try {
      await f.session.restore();
      const context = await guard.read("folder", git.legacy, async (context) => context, {
        channel: IPC_CHANNELS.getAssignmentDetail,
        fields: {}
      });
      expect(context).toMatchObject({ userId: 42, repositoryId: 20, cachedCommit: git.head });
      expect(f.session.getState().courseDiscovery.status).toBe("loading");
      await expect(
        guard.read("folder", git.legacy, async () => "ready", {
          channel: IPC_CHANNELS.loadGradingStudentSnapshot,
          fields: {}
        })
      ).resolves.toBe("ready");
      for (const channel of [
        IPC_CHANNELS.prepareGradingWorkspace,
        IPC_CHANNELS.saveGradingStudentViewState,
        IPC_CHANNELS.addGradingStudentComment,
        IPC_CHANNELS.markGradingStudentComplete
      ])
        await expect(
          guard.localGrading("folder", git.legacy, async () => "saved", { channel, fields: {} })
        ).resolves.toBe("saved");
      expect(f.verifyCourse).toHaveBeenCalledOnce();
      expect(list).not.toHaveBeenCalled();
      expect(search).not.toHaveBeenCalled();
      f.finish();
    } finally {
      f.session.shutdown();
      await removeGitFixture(git.root);
    }
  },
  GIT_INTEGRATION_TIMEOUT_MS
);
