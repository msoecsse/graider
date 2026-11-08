// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteCourseSetupService } from "./remoteCourseSetupService";
import { managedOperationalFixture, fixtureGit as git } from "./managedOperationalFixtures";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures";
import type { GitHubClient } from "./githubClientProvider";
import type { GithubOAuthSession, AuthenticatedAccountOperation } from "./githubOAuthSession";

// Test transports stay outside Electron's production source tree and package graph.
interface BranchClientFixture extends GitHubClient {
  organizationId: number;
  accountId: number;
  scopes: string;
  role: string;
  organizationMembers: Map<string, { id: number; username: string }[]>;
  defaultBranches: Map<number, string>;
  branches: Map<number, Set<string>>;
  addPermissionRepository(id: number, organization: string, name: string): void;
  teamsCreated: unknown[];
  creations: unknown[];
  permissionRepositories: Map<number, unknown>;
}
interface FallbackClientFixture extends GitHubClient {
  organizationId: number;
  repository: { id: number; name: string; node_id: string; owner: { id: number; login: string } };
  getCourseFallbackPermissionPage: NonNullable<GitHubClient["getCourseFallbackPermissionPage"]>;
  setCourseFallbackPermission: NonNullable<GitHubClient["setCourseFallbackPermission"]>;
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const request = {
  organization: "fixture",
  repositoryName: "course",
  courseCode: "CSC",
  courseTitle: "New course",
  creatorInstitutionalUsername: "creator",
  termCode: "27s1",
  coordinators: [{ institutionalUsername: "coordinator", githubLogin: "coordinator-login" }],
  sections: [
    { id: "001", faculty: [{ institutionalUsername: "teacher", githubLogin: "teacher-login" }] }
  ]
};
const fixture = async () => {
  const branchModulePath = pathToFileURL(
    path.resolve("../src/github/fake-managed-branch-client.ts")
  ).href;
  const fallbackModulePath = pathToFileURL(
    path.resolve("../src/github/fake-course-permission-client.ts")
  ).href;
  const { FakeManagedBranchClient } = (await import(/* @vite-ignore */ branchModulePath)) as {
    FakeManagedBranchClient: new (users: { id: number; username: string }[]) => BranchClientFixture;
  };
  const { FakeCoursePermissionClient } = (await import(/* @vite-ignore */ fallbackModulePath)) as {
    FakeCoursePermissionClient: new (
      users: { id: number; username: string }[]
    ) => FallbackClientFixture;
  };
  const f = await managedOperationalFixture();
  roots.push(f.root);
  fs.rmSync(path.join(f.writer, "course.yml"));
  fs.rmSync(path.join(f.writer, "terms"), { recursive: true });
  fs.writeFileSync(path.join(f.writer, "README.md"), "New empty private repository\n");
  await git(f.writer, ["add", "."]);
  await git(f.writer, ["commit", "-m", "Empty setup base"]);
  await git(f.writer, ["push", "origin", "main"]);
  const users = [
    { id: 42, username: "creator-login" },
    { id: 43, username: "coordinator-login" },
    { id: 44, username: "teacher-login" }
  ];
  const client = new FakeManagedBranchClient(users);
  client.organizationId = 10;
  client.accountId = 42;
  client.scopes = "repo admin:org";
  client.organizationMembers.set("fixture", users);
  const fallback = new FakeCoursePermissionClient(users);
  fallback.organizationId = 10;
  fallback.repository.id = 20;
  fallback.repository.owner.id = 10;
  fallback.repository.owner.login = "fixture";
  fallback.repository.name = "course";
  fallback.repository.node_id = "repository-20";
  const topic = vi.fn(async () => {});
  let created = false;
  const create = vi.fn(async () => {
    created = true;
    client.addPermissionRepository(20, "fixture", "course");
    client.defaultBranches.set(20, "main");
    client.branches.set(20, new Set(["main"]));
    return {
      owner: "fixture",
      name: "course",
      fullName: "fixture/course",
      id: 20,
      private: true,
      archived: false,
      defaultBranch: "main",
      htmlUrl: "https://github.com/fixture/course"
    };
  });
  Object.assign(client, {
    createRepository: create,
    getAuthenticatedUser: async () => users[0]!,
    getCourseRepository: async () => ({ status: 404, headers: {}, data: {} }),
    getCourseMetadataPath: async () => ({ status: 404, headers: {}, data: {} }),
    getCourseFallbackPermissionPage: fallback.getCourseFallbackPermissionPage.bind(fallback),
    setCourseFallbackPermission: fallback.setCourseFallbackPermission.bind(fallback),
    setCourseRepositoryTopic: topic
  });
  let generation = 1;
  let active = true;
  const input: AuthenticatedAccountOperation = {
    token: "oauth-fixture-secret",
    userId: 42,
    signal: new AbortController().signal,
    revalidateSession: async () => active
  };
  const session = {
    get mutationGeneration() {
      return generation;
    },
    withAuthenticatedAccount: async (operation: Function) => operation(input)
  } as unknown as GithubOAuthSession;
  const service = new RemoteCourseSetupService({
    userData: f.root,
    session,
    provideClient: () => client as unknown as GitHubClient,
    reader: () => ({
      ...f.reader,
      resolve: async (...args) => (created ? f.reader.resolve(...args) : null)
    }),
    authenticate: f.authenticate
  });
  return {
    ...f,
    service,
    client,
    create,
    topic,
    invalidate: () => {
      generation++;
      active = false;
    },
    remoteCourse: async () => parse(await git(f.remote, ["show", "main:course.yml"]))
  };
};

describe("main-owned remote Schema 2 setup", () => {
  it(
    "requires a renewed review when a selected login resolves to a different immutable account",
    async () => {
      const f = await fixture();
      const preview = await f.service.preview(1, request);
      const readUser = f.client.getUser.bind(f.client);
      vi.spyOn(f.client, "getUser").mockImplementation(async (login) => {
        const user = await readUser(login);
        return user && login === "coordinator-login" ? { ...user, id: 99 } : user;
      });
      await expect(f.service.create(1, preview.previewId, true)).rejects.toThrow(
        "identities changed"
      );
      expect(f.create).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
      expect(f.client.teamsCreated).toEqual([]);
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "reverifies immutable roles, publishes one canonical Draft commit, then configures real Phase 7 policies",
    async () => {
      const f = await fixture();
      const before = await git(f.remote, ["rev-parse", "main"]);
      const preview = await f.service.preview(1, request);
      expect(f.create).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
      expect(preview.creator.githubUserId).toBe(42);
      expect(preview.coordinators.map((person) => person.githubUserId)).toEqual([43]);
      const result = await f.service.create(1, preview.previewId, true);
      expect(result).toMatchObject({ status: "created", repositoryId: 20 });
      expect(f.create).toHaveBeenCalledWith(
        expect.objectContaining({ private: true, autoInitialize: true })
      );
      const course = await f.remoteCourse();
      expect(course.schema_version).toBe(2);
      expect(course.fallback_administrator.github_user_id).toBe(42);
      expect(course.course).toMatchObject({
        repository_id: 20,
        lifecycle: "unarchived",
        term_creation_order: ["27s1"]
      });
      const term = parse(await git(f.remote, ["show", "main:terms/27s1/term.yml"]));
      expect(term.term).toMatchObject({ status: "draft", has_ever_been_active: false });
      expect(term.coordinators.current).toEqual([{ github_user_id: 43 }]);
      expect(term.sections[0].faculty.current).toEqual([{ github_user_id: 44 }]);
      expect(await git(f.remote, ["diff", "--name-only", before, "main"])).toBe(
        "course.yml\nterms/27s1/term.yml"
      );
      expect(await git(f.remote, ["ls-tree", "-r", "--name-only", "main"])).not.toContain(
        "migration.json"
      );
      expect(f.client.teamsCreated.length).toBeGreaterThan(0);
      expect(f.client.creations).toHaveLength(1);
      expect(f.topic).toHaveBeenCalledWith("fixture", "course");
      expect(f.client.permissionRepositories.size).toBe(1);
      expect(f.create).toHaveBeenCalledTimes(1);
      expect(f.push).toHaveBeenCalledTimes(1);
      await expect(f.service.create(1, preview.previewId, true)).rejects.toThrow();
      expect(f.create).toHaveBeenCalledTimes(1);
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "rejects invalid selections and insufficient privileges with zero course/student writes",
    async () => {
      const f = await fixture();
      const before = await git(f.remote, ["rev-parse", "main"]);
      for (const invalid of [
        { ...request, coordinators: [] },
        {
          ...request,
          sections: [
            {
              id: "001",
              faculty: [{ institutionalUsername: "unknown", githubLogin: "missing-account" }]
            }
          ]
        },
        { ...request, coordinators: [{ ...request.coordinators[0], githubUserId: 42 }] }
      ])
        await expect(f.service.preview(1, invalid)).rejects.toThrow();
      f.client.role = "member";
      await expect(f.service.preview(1, request)).rejects.toThrow();
      expect(f.create).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
      expect(f.client.teamsCreated).toEqual([]);
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(before);
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "invalidates reviews on account changes and refuses renderer-created or another window's preview",
    async () => {
      const f = await fixture();
      const preview = await f.service.preview(1, request);
      await expect(f.service.create(2, preview.previewId, true)).rejects.toThrow();
      await expect(f.service.create(1, "renderer-forgery", true)).rejects.toThrow();
      f.invalidate();
      await expect(f.service.create(1, preview.previewId, true)).rejects.toThrow();
      expect(f.create).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "keeps a published course when external configuration fails, and never silently retries creation",
    async () => {
      const f = await fixture();
      const preview = await f.service.preview(1, request);
      f.topic.mockRejectedValue(new Error("fictional provider failure"));
      const result = await f.service.create(1, preview.previewId, true);
      expect(result.status).toBe("created_needs_attention");
      expect((await f.remoteCourse()).schema_version).toBe(2);
      await expect(f.service.create(1, preview.previewId, true)).rejects.toThrow();
      expect(f.push).toHaveBeenCalledTimes(1);
      expect(f.create).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain("oauth-fixture-secret");
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
});
