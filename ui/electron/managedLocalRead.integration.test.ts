// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GithubOAuthSession } from "./githubOAuthSession";
import { ManagedCourseMutationGuard } from "./managedCourseMutationGuard";
import { catalogEntry, saveEntry, state } from "./managedCourses";
import { managedOperationalFixture, fixtureGit } from "./managedOperationalFixtures";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures";
import { createCourseMutationIpc } from "./courseMutationIpc";
import { IPC_CHANNELS } from "./ipc";
import { inspectLocalManagedCourse } from "./managedCourseLocalRead";

const remoteRequests = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("GitHub unavailable");
  })
);
vi.mock("./githubRemoteRepositories.js", async (original) => ({
  ...(await original<object>()),
  createRemoteRepositoryReader: remoteRequests
}));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async () => {
  const f = await managedOperationalFixture();
  roots.push(f.root);
  const course = { ...f.course, localFolderIds: [], bootstrap: state("ready") };
  saveEntry(f.root, catalogEntry(f.root, 42, 20, course, state("ready"), new Date().toISOString()));
  const network = {
    verifyAccount: vi.fn().mockResolvedValue({
      identity: { id: 42, login: "faculty", name: null },
      scopes: ["read:org", "repo"],
      repositoryCapability: true,
      organizationCapability: true
    }),
    discoverOrganizations: vi
      .fn()
      .mockResolvedValue({ status: "ready", organizations: [], message: null, stale: false }),
    exchange: vi.fn().mockResolvedValue("test-only-token")
  };
  const discoverCourses = vi.fn().mockImplementation(async () => ({
    status: "ready",
    userId: 42,
    courses: [course],
    diagnostics: [],
    discoveredAt: null
  }));
  const synchronizeCourse = vi.fn().mockRejectedValue(new Error("Unexpected synchronization"));
  const session = new GithubOAuthSession({
    store: { load: async () => "test-only-token", save: async () => {}, delete: async () => {} },
    network,
    discoverCourses,
    synchronizeCourse,
    secret: () => "test-only-secret",
    openBrowser: async () => {},
    callback: async () => ({
      redirectUri: "http://127.0.0.1:12345/callback",
      code: Promise.resolve("test-code"),
      cancel: () => {}
    })
  });
  await session.restore();
  await vi.waitFor(() => expect(session.getState().courseDiscovery.status).toBe("ready"));
  const guard = new ManagedCourseMutationGuard({ ...f.deps, session });
  const selector = guard.remoteSelectors()[0];
  const read = (
    operation = async (context: unknown) => context,
    channel: string = IPC_CHANNELS.getAssignmentDetail
  ) => guard.read(selector.id, selector.path, operation, { channel, fields: {} });
  const sync = vi.spyOn(session, "withSynchronizedCourse");
  const revalidate = vi.spyOn(session, "withReadOnlyCourse");
  vi.clearAllMocks();
  return {
    ...f,
    session,
    course,
    network,
    discoverCourses,
    synchronizeCourse,
    guard,
    selector,
    read,
    sync,
    revalidate
  };
};

describe("verified local managed reads", () => {
  it(
    "reads repeatedly during a GitHub outage with zero GitHub, authorization, resolution or synchronization calls",
    async () => {
      const f = await fixture();
      for (const method of Object.values(f.network))
        method.mockRejectedValue(new Error("GitHub unavailable"));
      for (const channel of [
        IPC_CHANNELS.getAssignmentDetail,
        IPC_CHANNELS.loadRosterTerms,
        IPC_CHANNELS.loadGradingCommentLibrary
      ]) {
        const context = await f.read(undefined, channel);
        expect(context).toMatchObject({
          mode: "local_read",
          cachedCommit: f.head,
          courseFolderPath: f.cache,
          userId: 42
        });
        expect(context).not.toHaveProperty("authoritativeCommit");
        expect(context).not.toHaveProperty("revalidate");
        expect(context).not.toHaveProperty("token");
      }
      expect(f.sync).not.toHaveBeenCalled();
      expect(f.revalidate).not.toHaveBeenCalled();
      expect(f.synchronizeCourse).not.toHaveBeenCalled();
      expect(remoteRequests).not.toHaveBeenCalled();
      for (const method of Object.values(f.network)) expect(method).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "derives publish status through IPC locally and identifies its cached revision",
    async () => {
      const f = await fixture();
      const handlers = new Map<string, Function>();
      const ipc = createCourseMutationIpc(
        {
          handle: (name, handler) => {
            handlers.set(name, handler);
          }
        },
        () => f.guard
      );
      const legacy = vi.fn();
      ipc.handle(IPC_CHANNELS.getCoursePublishStatus, legacy);
      const sender = Object.assign(new EventEmitter(), {
        id: 1,
        isDestroyed: () => false,
        send: vi.fn()
      });
      expect(
        await handlers.get(IPC_CHANNELS.getCoursePublishStatus)!({ sender }, f.selector.id)
      ).toMatchObject({
        status: "up_to_date",
        courseReadRevision: f.head,
        courseReadRevisionSource: "local_cache"
      });
      expect(legacy).not.toHaveBeenCalled();
      expect(f.sync).not.toHaveBeenCalled();
      expect(remoteRequests).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "opens Course details without acquiring a GitHub client or changing the cache",
    async () => {
      const f = await fixture();
      const before = fs.readFileSync(path.join(f.cache, "course.yml"), "utf8");
      const catalog = fs.readFileSync(
        path.join(f.root, "managed-courses", "42", "catalog.json"),
        "utf8"
      );
      const details = await f.session.withLocalCourse(20, 42, (input) =>
        inspectLocalManagedCourse({ userData: f.root, input, username: "jones" })
      );
      expect(details).toMatchObject({
        revision: f.head,
        revisionSource: "local_cache",
        terms: ["27s1"]
      });
      expect(fs.readFileSync(path.join(f.cache, "course.yml"), "utf8")).toBe(before);
      expect(
        fs.readFileSync(path.join(f.root, "managed-courses", "42", "catalog.json"), "utf8")
      ).toBe(catalog);
      expect(remoteRequests).not.toHaveBeenCalled();
      for (const method of Object.values(f.network)) expect(method).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "keeps remote mutation authorization dependent on fresh synchronization",
    async () => {
      const f = await fixture();
      const mutate = vi.fn();
      await expect(
        f.guard.run(f.selector.id, f.selector.path, "new_mutation", mutate)
      ).rejects.toThrow();
      expect(f.sync).toHaveBeenCalledOnce();
      expect(f.synchronizeCourse).toHaveBeenCalledOnce();
      expect(mutate).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "refuses cached content after synchronization records known authorization loss",
    async () => {
      const f = await fixture();
      f.synchronizeCourse.mockResolvedValueOnce({
        status: "needs_attention",
        reason: "authorization_lost",
        diagnostic: "Access revoked",
        retryable: false
      });
      await f.session.withSynchronizedCourse(20, 42, async () => {});
      vi.clearAllMocks();
      await expect(f.read()).rejects.toThrow();
      expect(remoteRequests).not.toHaveBeenCalled();
      for (const method of Object.values(f.network)) expect(method).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it.each(["unknown-channel", IPC_CHANNELS.saveRoster, IPC_CHANNELS.prepareGradingWorkspace])(
    "denies read authorization for %s",
    async (channel) => {
      const f = await fixture();
      const operation = vi.fn();
      await expect(f.read(operation, channel)).rejects.toMatchObject({
        result: { reason: "operation_unavailable" }
      });
      expect(operation).not.toHaveBeenCalled();
      expect(f.sync).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it.each([
    "path",
    "organization",
    "catalog-only",
    "dirty",
    "external-storage",
    "schema",
    "missing-cache",
    "linked-cache",
    "forged-catalog",
    "account",
    "hidden-metadata-change"
  ])(
    "rejects %s without legacy fallback",
    async (invalid) => {
      const f = await fixture();
      if (invalid === "hidden-metadata-change") {
        await fixtureGit(f.cache, ["update-index", "--skip-worktree", "course.yml"]);
        fs.appendFileSync(path.join(f.cache, "course.yml"), "\n# hidden metadata change\n");
        expect(await fixtureGit(f.cache, ["status", "--porcelain"])).toBe("");
      }
      if (invalid === "organization") {
        Object.assign(f.course, { organizationId: 99 });
        await f.session.refreshOrganizations();
      }
      if (invalid === "catalog-only") {
        Object.assign(f.course, { authorization: "unavailable" });
        await f.session.refreshOrganizations();
      }
      if (invalid === "dirty") fs.appendFileSync(path.join(f.cache, "course.yml"), "\n# changed");
      if (invalid === "external-storage")
        fs.writeFileSync(path.join(f.cache, ".git", "objects", "info", "alternates"), f.legacy);
      if (invalid === "schema") {
        fs.writeFileSync(path.join(f.cache, "course.yml"), "schema_version: 99\n");
        await fixtureGit(f.cache, ["add", "."]);
      }
      if (invalid === "missing-cache") fs.renameSync(f.cache, `${f.cache}-missing`);
      if (invalid === "linked-cache") {
        fs.renameSync(f.cache, `${f.cache}-linked`);
        fs.symlinkSync(`${f.cache}-linked`, f.cache, "junction");
      }
      if (invalid === "forged-catalog") {
        const file = path.join(f.root, "managed-courses", "42", "catalog.json");
        const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
        catalog.courses["20"].managedPath = f.legacy;
        fs.writeFileSync(file, JSON.stringify(catalog));
      }
      if (invalid === "account") {
        f.discoverCourses.mockResolvedValueOnce({
          ...f.session.getState().courseDiscovery,
          userId: 99
        });
        await f.session.refreshOrganizations();
      }
      const operation = vi.fn();
      await expect(
        f.guard.read(f.selector.id, invalid === "path" ? f.cache : f.selector.path, operation, {
          channel: IPC_CHANNELS.getAssignmentDetail,
          fields: {}
        })
      ).rejects.toThrow();
      expect(operation).not.toHaveBeenCalled();
      expect(f.sync).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it.each(
    ["sign-out", "switch", "revocation"].flatMap((change) =>
      ["read", "grading"].map((mode) => ({ change, mode }))
    )
  )(
    "invalidates an in-flight $mode on $change",
    async ({ change, mode }) => {
      const f = await fixture();
      let release!: () => void;
      let started!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const operation = async () => {
        started();
        await held;
        return "private content";
      };
      const result =
        mode === "read"
          ? f.read(operation)
          : f.guard.localGrading(
              f.selector.id,
              f.selector.path,
              async (context) => {
                await operation();
                if (context?.mode === "local_grading") await context.revalidateLocal();
                return "private content";
              },
              { channel: IPC_CHANNELS.saveGradingStudentViewState, fields: {} }
            );
      const rejected = expect(result).rejects.toThrow();
      await Promise.race([entered, result]);
      if (change === "sign-out") await f.session.signOut();
      if (change === "switch") {
        f.network.verifyAccount.mockResolvedValue({
          identity: { id: 99, login: "second", name: null },
          scopes: ["read:org", "repo"],
          repositoryCapability: true,
          organizationCapability: true
        });
        await f.session.signIn(true);
      }
      if (change === "revocation") {
        Object.assign(f.course, { authorization: "not_authorized" });
        await f.session.refreshOrganizations();
      }
      release();
      await rejected;
      await expect(f.read()).rejects.toThrow();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
});
