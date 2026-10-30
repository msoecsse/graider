// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "dugite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireSynchronizedCommit,
  validateOperationalCourseSource,
  ManagedCourseMutationGuard
} from "./managedCourseMutationGuard";
import { createCourseMutationIpc, COURSE_MUTATION_CHANNELS } from "./courseMutationIpc";
import type { RemoteCourse, ManagedSynchronizationState } from "./remoteCourseTypes";
import type { GithubOAuthSession } from "./githubOAuthSession";
import { getProductionGitWorkspaceFactory } from "./gitWorkspaceReader";

const sha = "a".repeat(40);
const course: RemoteCourse = {
  repositoryId: 20,
  organizationId: 10,
  nodeId: null,
  organizationLogin: "fixture",
  name: "course",
  fullName: "fixture/course",
  url: "https://github.com/fixture/course",
  defaultBranch: "main",
  visibility: "private",
  archived: false,
  code: "csc",
  title: "Course",
  schemaVersion: 1,
  discoveryHints: [],
  authorization: "authorized",
  localStatus: "registered_local",
  localFolderIds: ["registered"],
  diagnostics: []
};
const ready: ManagedSynchronizationState = {
  status: "up_to_date",
  currentCommit: sha,
  diagnostic: null,
  retryable: false
};
const roots: string[] = [];
const git = async (cwd: string, args: string[]) => {
  const result = await exec(args, cwd);
  if (result.exitCode !== 0) throw new Error(`Fixture failed: ${args[0]}`);
  return result.stdout.trim();
};
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const fixture = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider-mutation-"));
  roots.push(root);
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "Fixture"]);
  await git(root, ["config", "user.email", "fixture@example.test"]);
  fs.writeFileSync(path.join(root, "course.yml"), "initial\n");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "Initial"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["remote", "add", "origin", "https://github.com/fixture/course.git"]);
  await git(root, ["update-ref", "refs/remotes/origin/main", head]);
  await git(root, ["branch", "--set-upstream-to=origin/main", "main"]);
  const request = {
    root,
    course,
    authoritativeCommit: head,
    mode: "new_mutation" as const,
    factory: getProductionGitWorkspaceFactory(),
    resolveOrigin: async () => ({ id: 20, organizationId: 10 })
  };
  return { root, head, request, validate: () => validateOperationalCourseSource(request) };
};
describe("trusted mutation synchronization outcomes", () => {
  it.each(["up_to_date", "updated"] as const)("accepts exact commit for %s", (status) =>
    expect(requireSynchronizedCommit(course, { ...ready, status })).toBe(sha)
  );
  it.each([
    ["failed", "network_failure", "synchronization_retry_required", "retry"],
    ["needs_attention", "local_changes", "managed_cache_review_required", "review_cache"],
    ["needs_attention", "unsafe_repository", "managed_cache_manual_review_required", "attention"],
    ["needs_attention", "organization_transfer", "organization_migration_required", "attention"],
    ["needs_attention", "authorization_lost", "course_access_lost", "authorization"],
    ["failed", "local_storage_failure", "local_storage_failure", "retry"]
  ] as const)("blocks %s / %s", (status, reason, expected, action) => {
    try {
      requireSynchronizedCommit(course, { ...ready, status, reason });
      throw new Error("Expected block");
    } catch (error) {
      expect(error).toMatchObject({ result: { reason: expected, action } });
    }
  });
  it("fails closed without an authoritative SHA", () =>
    expect(() =>
      requireSynchronizedCommit(course, { ...ready, currentCommit: undefined })
    ).toThrow());
});
describe("real bundled Git operational source validation", () => {
  it("accepts current source and unrelated local files", async () => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.root, "notes.txt"), "unrelated");
    expect(await f.validate()).toBe(f.head);
  });
  it.each([false, true])(
    "blocks existing course changes, staged=%s; permits publication retry",
    async (staged) => {
      const f = await fixture();
      fs.writeFileSync(path.join(f.root, "course.yml"), "pending\n");
      if (staged) await git(f.root, ["add", "course.yml"]);
      await expect(f.validate()).rejects.toMatchObject({
        result: { reason: "operational_source_unsafe" }
      });
      expect(
        await validateOperationalCourseSource({ ...f.request, mode: "publication_retry" })
      ).toBe(f.head);
    }
  );
  it("blocks normal ahead history, permits retry, then clears after published authoritative state", async () => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.root, "course.yml"), "pending\n");
    await git(f.root, ["commit", "-am", "Publish Graider course changes"]);
    const ahead = await git(f.root, ["rev-parse", "HEAD"]);
    await expect(f.validate()).rejects.toMatchObject({
      result: { reason: "operational_source_stale" }
    });
    expect(await validateOperationalCourseSource({ ...f.request, mode: "publication_retry" })).toBe(
      ahead
    );
    expect(
      await validateOperationalCourseSource({ ...f.request, authoritativeCommit: ahead })
    ).toBe(ahead);
  });
  it("blocks behind baseline and publication retry when remote has advanced", async () => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.root, "course.yml"), "remote\n");
    await git(f.root, ["commit", "-am", "Remote advance"]);
    const authoritativeCommit = await git(f.root, ["rev-parse", "HEAD"]);
    await git(f.root, ["checkout", "-B", "main", f.head]);
    fs.writeFileSync(path.join(f.root, "course.yml"), "pending\n");
    for (const mode of ["new_mutation", "publication_retry"] as const)
      await expect(
        validateOperationalCourseSource({ ...f.request, authoritativeCommit, mode })
      ).rejects.toThrow();
    expect(fs.readFileSync(path.join(f.root, "course.yml"), "utf8")).toBe("pending\n");
  });
  it("blocks diverged publication history", async () => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.root, "course.yml"), "remote\n");
    await git(f.root, ["commit", "-am", "Remote"]);
    const remote = await git(f.root, ["rev-parse", "HEAD"]);
    await git(f.root, ["checkout", "-B", "main", f.head]);
    fs.writeFileSync(path.join(f.root, "course.yml"), "local\n");
    await git(f.root, ["commit", "-am", "Local"]);
    await expect(
      validateOperationalCourseSource({
        ...f.request,
        mode: "publication_retry",
        authoritativeCommit: remote
      })
    ).rejects.toThrow();
  });
  it("rejects conflicts and interrupted legacy operations without changing evidence", async () => {
    const f = await fixture();
    await git(f.root, ["checkout", "-b", "other"]);
    fs.writeFileSync(path.join(f.root, "course.yml"), "other branch\n");
    await git(f.root, ["commit", "-am", "Other"]);
    await git(f.root, ["checkout", "main"]);
    fs.writeFileSync(path.join(f.root, "course.yml"), "main branch\n");
    await git(f.root, ["commit", "-am", "Main"]);
    expect((await exec(["merge", "other"], f.root)).exitCode).toBe(1);
    const evidence = fs.readFileSync(path.join(f.root, "course.yml"), "utf8");
    await expect(f.validate()).rejects.toThrow();
    expect(fs.readFileSync(path.join(f.root, "course.yml"), "utf8")).toBe(evidence);
  });
  it("rejects wrong branches, unavailable sources, and arbitrary ancestry revisions", async () => {
    const f = await fixture();
    const workspace = await f.request.factory.open(f.root);
    await expect(workspace.isAncestor("HEAD", f.head)).rejects.toThrow();
    await git(f.root, ["checkout", "-b", "other"]);
    await expect(f.validate()).rejects.toThrow();
    await expect(
      validateOperationalCourseSource({ ...f.request, root: path.join(f.root, "missing") })
    ).rejects.toThrow();
  });
  it("rejects detached HEAD", async () => {
    const f = await fixture();
    await git(f.root, ["checkout", "--detach"]);
    await expect(f.validate()).rejects.toThrow();
  });
  it.each([
    { id: 99, organizationId: 10 },
    { id: 20, organizationId: 99 }
  ])("rejects immutable identity mismatch %j", async (repo) => {
    const f = await fixture();
    await expect(
      validateOperationalCourseSource({ ...f.request, resolveOrigin: async () => repo })
    ).rejects.toMatchObject({ result: { reason: "operational_source_mismatch" } });
  });
  it("rejects external object storage before Git inspection", async () => {
    const f = await fixture();
    fs.writeFileSync(path.join(f.root, ".git", "objects", "info", "alternates"), "/tmp/foreign");
    await expect(f.validate()).rejects.toThrow();
  });
  it("rejects credential-bearing origin", async () => {
    const f = await fixture();
    await git(f.root, [
      "remote",
      "set-url",
      "origin",
      "https://secret@github.com/fixture/course.git"
    ]);
    await expect(f.validate()).rejects.toThrow();
  });
});
describe("IPC enforcement inventory", () => {
  it.each(COURSE_MUTATION_CHANNELS)(
    "blocks %s before any handler, save or publication",
    async (channel) => {
      const handles = new Map<string, Function>();
      const guard = { run: vi.fn().mockRejectedValue(new Error("Blocked")) };
      const adapter = createCourseMutationIpc(
        {
          handle: (name, handler) => {
            handles.set(name, handler);
          }
        },
        () => guard as unknown as ManagedCourseMutationGuard
      );
      const mutation = vi.fn();
      adapter.handle(channel, mutation);
      await expect(
        handles.get(channel)!(
          { sender: { isDestroyed: () => false, send: vi.fn() } },
          { courseFolderId: "registered" }
        )
      ).rejects.toThrow();
      expect(guard.run).toHaveBeenCalledOnce();
      expect(mutation).not.toHaveBeenCalled();
    }
  );
  it("keeps the mutation destination on the verified legacy request", async () => {
    const handles = new Map<string, Function>();
    const order: string[] = [];
    const guard = {
      run: vi.fn(async (_id, _path, _mode, operation) => {
        order.push("guard");
        return operation({ courseFolderPath: "/legacy" });
      })
    };
    const adapter = createCourseMutationIpc(
      {
        handle: (name, handler) => {
          handles.set(name, handler);
        }
      },
      () => guard as unknown as ManagedCourseMutationGuard
    );
    const channel = COURSE_MUTATION_CHANNELS[0];
    adapter.handle(channel, async (_event, request) => {
      order.push("save-and-publish");
      expect(request.courseFolderPath).toBe("/legacy");
    });
    await handles.get(channel)!(
      { sender: { isDestroyed: () => false, send: vi.fn() } },
      { courseFolderId: "registered", courseFolderPath: "/legacy" }
    );
    expect(order).toEqual(["guard", "save-and-publish"]);
  });
});

vi.mock("./githubRemoteRepositories.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createRemoteRepositoryReader: () => ({
    resolve: async (_owner: string, name: string) => ({
      id: name === "other" ? 21 : 20,
      organizationId: 10
    })
  })
}));
const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
describe("guard execution and account isolation", () => {
  const execution = async () => {
    const f = await fixture();
    let generation = 1;
    let signedIn = true;
    const sync = vi.fn(async (_repo, _user, operation) =>
      operation(
        {
          userId: 42,
          token: "never-rendered",
          course,
          signal: new AbortController().signal,
          revalidateSession: async () => signedIn
        },
        { ...ready, currentCommit: f.head }
      )
    );
    const session = {
      get mutationGeneration() {
        return generation;
      },
      getState: () => ({
        identity: signedIn ? { id: 42 } : null,
        courseDiscovery: { userId: 42, courses: [course] }
      }),
      withSynchronizedCourse: sync
    } as unknown as GithubOAuthSession;
    const deps = {
      userData: f.root,
      session,
      folders: () => [
        {
          id: "registered",
          path: f.root,
          displayAlias: null,
          lastOpenedAt: "",
          lastRefreshedAt: null,
          lastDashboardStatus: null
        }
      ],
      username: () => "faculty"
    };
    return {
      ...f,
      sync,
      deps,
      guard: new ManagedCourseMutationGuard(deps),
      invalidate: () => {
        generation += 1;
        signedIn = false;
      }
    };
  };
  it("rejects a managed destination even if it was registered as a legacy source", async () => {
    const f = await execution();
    fs.symlinkSync(f.root, path.join(f.root, "managed-courses"));
    const operation = vi.fn(async () => {});
    await expect(
      f.guard.run("registered", f.root, "new_mutation", operation)
    ).rejects.toMatchObject({ result: { reason: "remote_only_mutation_unavailable" } });
    expect(operation).not.toHaveBeenCalled();
  });
  it.each(["new_mutation", "source_update"] as const)(
    "different repositories enter %s synchronization independently",
    async (mode) => {
      const f = await execution();
      const secondSource = await fixture();
      await git(secondSource.root, [
        "remote",
        "set-url",
        "origin",
        "https://github.com/fixture/other.git"
      ]);
      const other = { ...course, repositoryId: 21, localFolderIds: ["other"] };
      f.sync.mockImplementation(async (_repo, _user, operation) =>
        operation(
          { course: other, userId: 42, token: "test", revalidateSession: async () => true },
          { ...ready, currentCommit: secondSource.head }
        )
      );
      const session = f.deps.session;
      Object.assign(session, {
        getState: () => ({
          identity: { id: 42 },
          courseDiscovery: { userId: 42, courses: [course, other] }
        })
      });
      const held = deferred();
      const started = deferred();
      f.sync.mockImplementationOnce(async (_repo, _user, operation) => {
        started.release();
        await held.promise;
        return operation(
          { course, userId: 42, token: "test", revalidateSession: async () => true },
          { ...ready, currentCommit: f.head }
        );
      });
      const guard = new ManagedCourseMutationGuard({
        ...f.deps,
        folders: () => [
          ...f.deps.folders(),
          { ...f.deps.folders()[0], id: "other", path: secondSource.root }
        ]
      });
      const first = guard.run("registered", f.root, mode, async () => {});
      await started.promise;
      const second = guard.run("other", secondSource.root, mode, async () => {});
      // It need not wait for the first course's held synchronization.
      await second;
      expect(f.sync).toHaveBeenCalledTimes(2);
      held.release();
      await first;
    }
  );
  it("ready context stays internal and still targets legacy", async () => {
    const f = await execution();
    const operation = vi.fn(async (context) => context.courseFolderPath);
    expect(await f.guard.run("registered", f.root, "new_mutation", operation)).toBe(f.root);
    expect(f.sync).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledOnce();
    expect(operation.mock.calls[0][0]).not.toHaveProperty("token");
  });
  it("serializes synchronization through immediate publication", async () => {
    const f = await execution();
    const held = deferred();
    const started = deferred();
    const first = f.guard.run("registered", f.root, "new_mutation", async () => {
      started.release();
      await held.promise;
    });
    await started.promise;
    const secondOperation = vi.fn(async () => {});
    const second = f.guard.run("registered", f.root, "new_mutation", secondOperation);
    await Promise.resolve();
    expect(f.sync).toHaveBeenCalledTimes(1);
    expect(secondOperation).not.toHaveBeenCalled();
    held.release();
    await Promise.all([first, second]);
    expect(f.sync).toHaveBeenCalledTimes(2);
  });
  it("sign-out or account switch invalidates waiting requests before synchronization", async () => {
    const f = await execution();
    const held = deferred();
    const started = deferred();
    const first = f.guard.run("registered", f.root, "new_mutation", async () => {
      started.release();
      await held.promise;
    });
    await started.promise;
    const operation = vi.fn(async () => {});
    const second = f.guard.run("registered", f.root, "new_mutation", operation);
    f.invalidate();
    held.release();
    await first;
    await expect(second).rejects.toMatchObject({ result: { reason: "authorization_required" } });
    expect(operation).not.toHaveBeenCalled();
    expect(f.sync).toHaveBeenCalledOnce();
  });
  it("late synchronization from old account cannot mutate", async () => {
    const f = await execution();
    const original = f.sync.getMockImplementation()!;
    f.sync.mockImplementationOnce(async (...args) => {
      f.invalidate();
      return original(...args);
    });
    const operation = vi.fn(async () => {});
    await expect(f.guard.run("registered", f.root, "new_mutation", operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
  it("blocks missing faculty identity, unmapped registration and forged paths without writes", async () => {
    const f = await execution();
    const operation = vi.fn(async () => {});
    await expect(
      new ManagedCourseMutationGuard({ ...f.deps, username: () => null }).run(
        "registered",
        f.root,
        "new_mutation",
        operation
      )
    ).rejects.toMatchObject({ result: { reason: "faculty_identity_required" } });
    await expect(
      f.guard.run("registered", "/forged-managed-path", "new_mutation", operation)
    ).rejects.toThrow();
    await expect(
      f.guard.run("remote-only", undefined, "new_mutation", operation)
    ).rejects.toMatchObject({ result: { reason: "remote_only_mutation_unavailable" } });
    await expect(
      new ManagedCourseMutationGuard({
        ...f.deps,
        folders: () => [{ ...f.deps.folders()[0], id: "unmapped" }]
      }).run("unmapped", f.root, "new_mutation", operation)
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    expect(f.sync).not.toHaveBeenCalled();
  });
  it("retries run synchronization again; no cached readiness authorizes a write", async () => {
    const f = await execution();
    const operation = vi.fn(async () => {});
    f.sync.mockImplementationOnce(async (_r, _u, callback) =>
      callback({ course }, { ...ready, status: "needs_attention", reason: "local_changes" })
    );
    await expect(f.guard.run("registered", f.root, "new_mutation", operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    await f.guard.run("registered", f.root, "new_mutation", operation);
    expect(operation).toHaveBeenCalledOnce();
    expect(f.sync).toHaveBeenCalledTimes(2);
  });
});

describe("new-course exception is resolved only in main", () => {
  it("allows trusted initial creation but ignores renderer claims for existing courses", async () => {
    const handles = new Map<string, Function>();
    const run = vi.fn().mockRejectedValue(new Error("Blocked existing source"));
    const mutation = vi.fn(async () => ({ status: "success" }));
    let isNew = true;
    const adapter = createCourseMutationIpc(
      {
        handle: (channel, handler) => {
          handles.set(channel, handler);
        }
      },
      () => ({ run }) as unknown as ManagedCourseMutationGuard,
      () => ({ isNew, folderId: "registered" })
    );
    const channel = "graider-ui:course-setup:save";
    adapter.handle(channel, mutation);
    const event = { sender: { id: 1, isDestroyed: () => false, send: vi.fn() } };
    await handles.get(channel)!(event, { courseFolderPath: "/new" });
    expect(mutation).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    isNew = false;
    await expect(
      handles.get(channel)!(event, { courseFolderPath: "/existing", isNew: true, ready: true })
    ).rejects.toThrow();
    expect(mutation).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });
});
