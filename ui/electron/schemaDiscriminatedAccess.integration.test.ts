// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { describeGitIntegration as describe, removeGitFixture } from "./gitIntegrationFixtures.js";
import { managedOperationalFixture, fixtureGit as git } from "./managedOperationalFixtures.js";
import {
  inspectManagedCourse,
  performSynchronization,
  type ManagedSynchronizationRequest
} from "./managedCourses.js";
import { discoverRemoteCourses } from "./remoteCourseDiscovery.js";
import { schemaTwoCourse, schemaTwoTerm, metadataYaml } from "./schemaDiscriminatedFixtures.js";
import type { RemoteRepositoryReader } from "./githubRemoteRepositories.js";

const remote = vi.hoisted(() => ({ reader: null as RemoteRepositoryReader | null }));
vi.mock("./githubRemoteRepositories.js", async (original) => ({
  ...(await original<object>()),
  createRemoteRepositoryReader: () => remote.reader
}));

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async () => {
  const f = await managedOperationalFixture();
  remote.reader = f.reader;
  roots.push(f.root);
  const request: ManagedSynchronizationRequest = {
    userData: f.root,
    userId: 42,
    course: { ...f.course, bootstrap: { status: "ready", diagnostic: null, retryable: false } },
    username: null,
    signal: new AbortController().signal,
    revalidateSession: async () => true,
    reader: f.reader,
    authenticate: () => f.auth,
    onProgress: () => {}
  };
  const publish = async (version = 2, userId = 42) => {
    const term = schemaTwoTerm();
    term.sections[0]!.faculty.current = [{ github_user_id: userId }];
    fs.writeFileSync(
      path.join(f.writer, "course.yml"),
      metadataYaml({ ...schemaTwoCourse(), schema_version: version })
    );
    fs.writeFileSync(path.join(f.writer, "terms", "27s1", "term.yml"), metadataYaml(term));
    await git(f.writer, ["commit", "-am", "Synthetic schema publication"]);
    await git(f.writer, ["push", "origin", "main"]);
    return git(f.remote, ["rev-parse", "refs/heads/main"]);
  };
  return {
    ...f,
    request,
    publish,
    sync: () => performSynchronization({ ...request, onProgress: () => {} })
  };
};

describe("authoritative schema cutover with real local/bare Git", () => {
  it("refuses stale Schema 1 inspection, synchronizes to v2, and rediscovers immediately", async () => {
    const f = await fixture();
    const target = await f.publish();
    await expect(inspectManagedCourse(f.request)).rejects.toThrow("stale");
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.head);
    expect(await f.sync()).toMatchObject({
      status: "updated",
      currentCommit: target,
      metadata: { schemaVersion: 2 }
    });
    expect(await inspectManagedCourse(f.request)).toMatchObject({
      code: "fixture101",
      terms: ["27s1"]
    });
    const repository = (await f.reader.resolveId(20))!;
    const discovery = await discoverRemoteCourses({
      userId: 42,
      username: null,
      locals: [],
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
      reader: {
        ...f.reader,
        list: async () => [repository],
        search: async () => ({ ids: [20], incomplete: false })
      }
    });
    expect(discovery.courses[0]).toMatchObject({ schemaVersion: 2, authorization: "authorized" });
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(target);
    expect(f.push).not.toHaveBeenCalled();
  });
  it.each([2, 3])(
    "prevents stale legacy mutation and downgrade after schema %s publication",
    async (version) => {
      const f = await fixture();
      await f.guard.cutover("registered");
      const target = await f.publish(version);
      const mutate = vi.fn();
      await expect(f.guard.run("registered", f.legacy, "new_mutation", mutate)).rejects.toThrow();
      expect(mutate).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(target);
      expect(fs.readFileSync(path.join(f.legacy, "course.yml"), "utf8")).toContain(
        "schema_version: 1"
      );
    }
  );
  it("refuses an uncut legacy read after authoritative migration instead of using the stale username", async () => {
    const f = await fixture();
    const target = await f.publish();
    const read = vi.fn();
    await expect(f.guard.read("registered", f.legacy, read)).rejects.toMatchObject({
      result: { reason: "remote_only_mutation_unavailable" }
    });
    expect(read).not.toHaveBeenCalled();
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.head);
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(target);
  });
  it("does not fall back to an uncut Schema 1 folder when discovery excludes an incompatible schema", async () => {
    const f = await fixture();
    await f.publish(3);
    const state = f.deps.session.getState();
    Object.assign(f.deps.session, {
      getState: () => ({
        ...state,
        courseDiscovery: {
          ...state.courseDiscovery,
          courses: [],
          diagnostics: [
            {
              organizationId: 10,
              repositoryId: 20,
              status: "unsupported_schema",
              message: "Update required.",
              localFolderIds: ["registered"]
            }
          ]
        }
      })
    });
    const read = vi.fn();
    await expect(f.guard.read("registered", f.legacy, read)).rejects.toMatchObject({
      result: { reason: "remote_only_mutation_unavailable" }
    });
    expect(read).not.toHaveBeenCalled();
  });
  it("refuses v2 access when the stale v1 username still matches but immutable identity has lost its role", async () => {
    const f = await fixture();
    const target = await f.publish(2, 47);
    await expect(inspectManagedCourse({ ...f.request, username: "jones" })).rejects.toThrow(
      "authorization"
    );
    expect(await f.sync()).toMatchObject({
      status: "needs_attention",
      reason: "authorization_lost"
    });
    expect(await git(f.cache, ["rev-parse", "HEAD"])).toBe(f.head);
    expect(await git(f.remote, ["rev-parse", "main"])).toBe(target);
  });
});
