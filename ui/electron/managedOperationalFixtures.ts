import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "dugite";
import { vi } from "vitest";
import {
  managedCoursePath,
  performSynchronization,
  serializeManagedOperation
} from "./managedCourses.js";
import type { GitWorkspaceWriter, GitWorkspaceSynchronizer } from "./gitWorkspaceReader.js";
import { createAuthenticatedProductionGitWorkspace } from "./gitWorkspaceReader.js";
import { ManagedCourseMutationGuard } from "./managedCourseMutationGuard.js";
import type { GithubOAuthSession, ManagedOperationInput } from "./githubOAuthSession.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";
import type { RemoteRepositoryReader } from "./githubRemoteRepositories.js";

export const fixtureGit = async (cwd: string, args: string[]) => {
  const result = await exec(args, cwd);
  if (result.exitCode) throw new Error(`Fixture Git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
};
export const fixtureCourseYaml = `schema_version: 1
course:
  code: fixture101
  title: Original title
  repository: course
github:
  organization: fixture
  repository_visibility: private
  repo_name_pattern: "{term}-{course}-{assignment}-{github_username}"
  student_permission: admin
  faculty_team: faculty
  faculty_permission: admin
defaults:
  timezone: America/Chicago
  assignment_type: individual
reports:
  formats: [markdown]
`;
export const fixtureTermYaml = `schema_version: 1
term:
  code: 27s1
  academic_year: 2027
  semester: 1
  display_name: Fall
sections:
  - id: "001"
    faculty: [jones]
`;
export const managedOperationalFixture = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-managed-transaction-"));
  const remote = path.join(root, "remote.git"),
    writer = path.join(root, "writer"),
    legacy = path.join(root, "legacy");
  const git = fixtureGit;
  await git(root, ["init", "--bare", "--initial-branch=main", remote]);
  await git(root, ["clone", "--no-hardlinks", remote, writer]);
  await git(writer, ["config", "user.name", "Fixture"]);
  await git(writer, ["config", "user.email", "fixture@example.test"]);
  fs.mkdirSync(path.join(writer, "terms", "27s1"), { recursive: true });
  fs.writeFileSync(path.join(writer, "course.yml"), fixtureCourseYaml);
  fs.writeFileSync(path.join(writer, "terms", "27s1", "term.yml"), fixtureTermYaml);
  await git(writer, ["add", "."]);
  await git(writer, ["commit", "-m", "Initial"]);
  await git(writer, ["push", "origin", "main"]);
  const head = await git(writer, ["rev-parse", "HEAD"]);
  const cache = managedCoursePath(root, 42, 20),
    url = "https://github.com/fixture/course.git";
  const prepare = async (destination: string) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    await git(root, ["clone", "--no-hardlinks", remote, destination]);
    await git(destination, ["remote", "set-url", "origin", url]);
    await git(destination, ["config", `url.${remote}.insteadOf`, url]);
  };
  await prepare(legacy);
  await prepare(cache);
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
    localFolderIds: ["registered"],
    diagnostics: []
  };
  const repository = {
    id: 20,
    nodeId: null,
    organizationId: 10,
    owner: "fixture",
    name: "course",
    fullName: "fixture/course",
    url: course.url,
    defaultBranch: "main",
    visibility: "private" as const,
    archived: false,
    disabled: false,
    topics: []
  };
  const reader: RemoteRepositoryReader = {
    resolveId: async () => repository,
    resolve: async () => repository,
    file: async (_repo, file) => {
      const result = await exec(["show", `refs/heads/main:${file}`], remote);
      return result.exitCode === 0 ? result.stdout : null;
    },
    terms: async () => ["27s1"],
    list: async () => [],
    search: async () => ({ ids: [], incomplete: false })
  };
  const auth = createAuthenticatedProductionGitWorkspace("oauth-fixture-secret");
  // Only clone transport is redirected here. Fetch/push use the real authenticated bundled backend.
  const clone = vi.fn(async (request: Parameters<typeof auth.factory.clone>[0]) => {
    if (request.remote !== url || request.authentication !== auth.authentication)
      throw new Error("Untrusted clone");
    await prepare(request.destination);
    return auth.factory.open(request.destination);
  });
  let onPush: (() => Promise<void>) | undefined;
  let afterPush: (() => Promise<void>) | undefined;
  let transactionFetchFailures = 0;
  const push = vi.fn(
    async (
      root: string,
      request: { remote: "origin"; branch: string; authentication: typeof auth.authentication }
    ) => {
      await onPush?.();
      const result = await (await auth.factory.open(root)).pushBranch!(request);
      await afterPush?.();
      return result;
    }
  );
  const authenticate = vi.fn((token: string) => {
    if (token !== "oauth-fixture-secret") throw new Error("Wrong credential");
    return {
      authentication: auth.authentication,
      factory: {
        ...auth.factory,
        inspect: auth.factory.inspect.bind(auth.factory),
        clone,
        open: async (root: string) => {
          const workspace = (await auth.factory.open(root)) as GitWorkspaceWriter &
            GitWorkspaceSynchronizer;
          return new Proxy(workspace, {
            get(target, property) {
              if (
                property === "fetchOrigin" &&
                root.includes(`${path.sep}.transactions${path.sep}`)
              )
                return async (request: { authentication: typeof auth.authentication }) => {
                  if (transactionFetchFailures) {
                    transactionFetchFailures--;
                    throw new Error("Injected transaction fetch failure");
                  }
                  return target.fetchOrigin(request);
                };
              return property === "pushBranch"
                ? (request: {
                    remote: "origin";
                    branch: string;
                    authentication: typeof auth.authentication;
                  }) => push(root, request)
                : typeof Reflect.get(target, property) === "function"
                  ? Reflect.get(target, property).bind(target)
                  : Reflect.get(target, property);
            }
          });
        }
      }
    };
  });
  let userId: number | null = 42,
    generation = 1,
    refreshFailures = 0;
  const controller = new AbortController();
  const session = {
    get mutationGeneration() {
      return generation;
    },
    getState: () => ({
      identity: userId ? { id: userId, login: "faculty" } : null,
      courseDiscovery: { userId, courses: [course] }
    }),
    withSynchronizedCourse: async <T>(
      _id: number,
      expected: number,
      operation: (
        input: ManagedOperationInput,
        sync: Awaited<ReturnType<typeof performSynchronization>>
      ) => Promise<T>
    ) => {
      const input: ManagedOperationInput = {
        token: "oauth-fixture-secret",
        userId: expected,
        course,
        signal: controller.signal,
        revalidateSession: async () => userId === expected
      };
      const synchronize = async (afterPublication = false) => {
        if (refreshFailures) {
          refreshFailures--;
          throw new Error("Injected local refresh failure");
        }
        return performSynchronization({
          ...input,
          userData: root,
          username: "jones",
          reader,
          authenticate: () => auth,
          onProgress: () => {},
          requireFacultyAuthorization: !afterPublication
        });
      };
      return serializeManagedOperation(input, async () =>
        operation({ ...input, resynchronize: synchronize }, await synchronize())
      );
    }
  } as unknown as GithubOAuthSession;
  const folders = [
    {
      id: "registered",
      path: legacy,
      displayAlias: null,
      lastOpenedAt: "",
      lastRefreshedAt: null,
      lastDashboardStatus: null
    }
  ];
  const deps = {
    userData: root,
    session,
    folders: () => folders,
    username: () => "jones",
    authenticate
  };
  const guard = new ManagedCourseMutationGuard(deps);
  const advance = async (title = "Remote winner") => {
    fs.writeFileSync(
      path.join(writer, "course.yml"),
      fixtureCourseYaml.replace("Original title", title)
    );
    await git(writer, ["commit", "-am", title]);
    await git(writer, ["push", "origin", "main"]);
    return git(writer, ["rev-parse", "HEAD"]);
  };
  return {
    root,
    remote,
    writer,
    legacy,
    cache,
    head,
    course,
    reader,
    guard,
    deps,
    auth,
    authenticate,
    clone,
    push,
    advance,
    failTransactionFetches: (count: number) => {
      transactionFetchFailures = count;
    },
    setAfterPush: (action: () => Promise<void>) => {
      afterPush = action;
    },
    setOnPush: (action: () => Promise<void>) => {
      onPush = action;
    },
    failRefresh: () => {
      refreshFailures++;
    },
    switchAccount: (id: number | null) => {
      userId = id;
      generation++;
    }
  };
};
