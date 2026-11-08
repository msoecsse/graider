// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { termLifecycleFixture } from "./termLifecycleFixtures";
import { fixtureGit as git } from "./managedOperationalFixtures";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures";
import { ManagedCourseMutationGuard } from "./managedCourseMutationGuard";
import { COURSE_MUTATION_CHANNELS } from "./courseMutationIpc";
import { IPC_CHANNELS } from "./ipc";
import type { GithubOAuthSession } from "./githubOAuthSession";
import type { RemoteRepositoryReader } from "./githubRemoteRepositories";
import { managedCoursePath } from "./managedCourses";

let currentReader: RemoteRepositoryReader;
vi.mock("./githubRemoteRepositories.js", async (original) => ({
  ...(await original<object>()),
  createRemoteRepositoryReader: () => currentReader
}));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async (actor = 44) => {
  const f = await termLifecycleFixture(true);
  roots.push(f.root);
  const course = parse(fs.readFileSync(path.join(f.writer, "course.yml"), "utf8"));
  course.course.repository_id = 20;
  course.course.organization_binding = { organization_id: 10, organization_login: "fixture" };
  fs.writeFileSync(path.join(f.writer, "course.yml"), stringify(course));
  for (const code of ["27s1", "27s2"]) {
    const file = path.join(f.writer, "terms", code, "term.yml");
    const term = parse(fs.readFileSync(file, "utf8"));
    term.term.status = "archived";
    term.term.has_ever_been_active = true;
    term.sections[0].roster = "rosters/section-001.csv";
    term.sections.push({
      id: "002",
      roster: "rosters/section-002.csv",
      faculty: { current: [], former: [] }
    });
    fs.writeFileSync(file, stringify(term));
    fs.mkdirSync(path.join(f.writer, "terms", code, "rosters"), { recursive: true });
    for (const section of ["001", "002"])
      fs.writeFileSync(
        path.join(f.writer, "terms", code, "rosters", `section-${section}.csv`),
        `student_id,github_username,section,status\nstudent-${section},student-${section},${section},active\n`
      );
  }
  await git(f.writer, ["add", "."]);
  await git(f.writer, ["commit", "-m", "Trusted operation state"]);
  await git(f.writer, ["push", "origin", "main"]);
  await f.request.input.resynchronize?.();
  let active = true;
  currentReader = { ...f.reader, terms: async () => ["27s1", "27s2"] };
  const courseState = { ...f.request.input.course, schemaVersion: 2 };
  const session = {
    mutationGeneration: 1,
    getState: () => ({
      identity: { id: actor },
      courseDiscovery: { userId: actor, courses: [courseState], diagnostics: [] }
    }),
    withSynchronizedCourse: async (_repo: number, _user: number, operation: Function) => {
      const sync = await f.request.input.resynchronize?.();
      return operation(
        {
          ...f.request.input,
          userId: actor,
          course: courseState,
          revalidateSession: async () => active
        },
        sync
      );
    }
  } as unknown as GithubOAuthSession;
  // The cache is account-scoped. Most fixtures exercise the faculty identity's own cache.
  const actorCache = managedCoursePath(f.root, actor, 20);
  if (actor !== 42) {
    fs.mkdirSync(path.dirname(actorCache), { recursive: true });
    fs.cpSync(f.cache, actorCache, { recursive: true });
  }
  const guard = new ManagedCourseMutationGuard({ ...f.deps, session, username: () => null });
  const legacyHandler = vi.fn(async () => {
    throw new Error("Legacy code must not run on v2.");
  });
  const invoke = (channel: string, fields: Record<string, unknown> = {}) =>
    guard.run(
      "registered",
      f.legacy,
      COURSE_MUTATION_CHANNELS.includes(channel) ? "new_mutation" : "read",
      legacyHandler,
      { channel, fields }
    );
  return {
    ...f,
    guard,
    invoke,
    legacyHandler,
    invalidate: () => {
      active = false;
    },
    courseState
  };
};

describe("trusted managed-operation production bridge", () => {
  it(
    "preserves immutable-ID scope after an organization rename with stale persisted locators",
    async () => {
      const f = await fixture();
      f.courseState.organizationLogin = "renamed-fixture";
      const original = currentReader.resolveId;
      currentReader = {
        ...currentReader,
        resolveId: async (id) => {
          const repo = await original(id);
          return repo ? { ...repo, owner: "renamed-fixture" } : null;
        }
      };
      expect(
        await f.invoke(IPC_CHANNELS.getRosterForSection, { termCode: "27s2", sectionId: "001" })
      ).toMatchObject({ status: "ready", rows: [{ studentId: "student-001" }] });
      expect(f.legacyHandler).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "leaves authorized term lifecycle safely unavailable without trusted remote inventory and journals",
    async () => {
      const f = await fixture(42);
      const file = path.join(f.writer, "terms", "27s2", "term.yml");
      const term = parse(fs.readFileSync(file, "utf8"));
      term.term.status = "draft";
      term.term.has_ever_been_active = false;
      fs.writeFileSync(file, stringify(term));
      await git(f.writer, ["commit", "-am", "Preparatory Draft"]);
      await git(f.writer, ["push", "origin", "main"]);
      const revision = await git(f.remote, ["rev-parse", "main"]);
      expect(
        await f.invoke(IPC_CHANNELS.changeManagedTermLifecycle, {
          operation: "delete-draft",
          targetTermCode: "27s2",
          expectedCourseRevision: revision
        })
      ).toMatchObject({
        status: "needs_attention",
        reason: "trusted-lifecycle-evidence-unavailable"
      });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(revision);
      expect(f.push).not.toHaveBeenCalled();
      expect(f.legacyHandler).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "blocks lifecycle writes when migration/reconciliation readiness cannot be proven",
    async () => {
      const f = await fixture(42);
      fs.mkdirSync(path.join(f.writer, ".graider"), { recursive: true });
      fs.writeFileSync(path.join(f.writer, ".graider", "migration.json"), "unresolved");
      await git(f.writer, ["add", "."]);
      await git(f.writer, ["commit", "-m", "Unresolved migration"]);
      await git(f.writer, ["push", "origin", "main"]);
      const revision = await git(f.remote, ["rev-parse", "main"]);
      await expect(
        f.invoke(IPC_CHANNELS.changeManagedCourseLifecycle, {
          targetStatus: "archived",
          expectedCourseRevision: revision
        })
      ).rejects.toMatchObject({ result: { reason: "reconciliation_required" } });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(revision);
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "refuses unsupported authoritative schemas before all legacy routing",
    async () => {
      const f = await fixture(42);
      const file = path.join(f.writer, "course.yml");
      fs.writeFileSync(
        file,
        fs.readFileSync(file, "utf8").replace("schema_version: 2", "schema_version: 99")
      );
      await git(f.writer, ["commit", "-am", "Unsupported authoritative version"]);
      await git(f.writer, ["push", "origin", "main"]);
      const revision = await git(f.remote, ["rev-parse", "main"]);
      await expect(f.invoke(IPC_CHANNELS.saveRoster)).rejects.toMatchObject({
        result: { reason: "remote_only_mutation_unavailable" }
      });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(revision);
      expect(f.legacyHandler).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "refuses advancement during remote observation without any operation writes",
    async () => {
      const f = await fixture(42);
      const read = currentReader.revision;
      let observations = 0;
      currentReader = {
        ...currentReader,
        revision: async (repo) => {
          observations++;
          if (observations === 2) await f.advance();
          return read(repo);
        }
      };
      await expect(f.invoke(IPC_CHANNELS.saveRoster)).rejects.toThrow();
      expect(f.push).not.toHaveBeenCalled();
      expect(f.legacyHandler).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "adapts scoped roster reads without a local username and excludes another section",
    async () => {
      const f = await fixture();
      expect(
        await f.invoke(IPC_CHANNELS.getRosterForSection, { termCode: "27s2", sectionId: "001" })
      ).toMatchObject({ status: "ready", rows: [{ studentId: "student-001" }], readOnly: true });
      await expect(
        f.invoke(IPC_CHANNELS.getRosterForSection, { termCode: "27s2", sectionId: "002" })
      ).rejects.toMatchObject({ result: { reason: "operation_not_authorized" } });
      expect(f.legacyHandler).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "requires explicit coordinator expansion and gives fallback no ordinary students",
    async () => {
      const f = await fixture(42);
      expect(await f.invoke(IPC_CHANNELS.loadRosterTerms)).toMatchObject({
        terms: [{ sections: [] }, { sections: [] }]
      });
      await expect(
        f.invoke(IPC_CHANNELS.getRosterForSection, { termCode: "27s2", sectionId: "001" })
      ).rejects.toThrow();
      expect(
        await f.invoke(IPC_CHANNELS.getRosterForSection, {
          termCode: "27s1",
          sectionId: "002",
          scope: "coordinator-term"
        })
      ).toMatchObject({ rows: [{ studentId: "student-002" }] });
      await expect(
        f.invoke(IPC_CHANNELS.getRosterForSection, {
          termCode: "27s2",
          sectionId: "002",
          scope: "coordinator-term"
        })
      ).rejects.toThrow();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "rejects every legacy mutation channel before course, runtime or student-repository writes",
    async () => {
      const f = await fixture();
      const before = await git(f.remote, ["rev-parse", "main"]);
      const local = fs.readFileSync(path.join(f.legacy, "course.yml"), "utf8");
      const student = path.join(f.root, "student.git");
      await git(f.root, ["init", "--bare", "--initial-branch=main", student]);
      const studentBefore = fs.readdirSync(student);
      for (const channel of COURSE_MUTATION_CHANNELS.filter(
        (channel) =>
          channel !== IPC_CHANNELS.changeManagedCourseLifecycle &&
          channel !== IPC_CHANNELS.changeManagedTermLifecycle
      ))
        await expect(
          f.invoke(channel, { termCode: "27s2", sectionId: "001" })
        ).rejects.toMatchObject({ result: { reason: "operation_unavailable" } });
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(before);
      expect(fs.readFileSync(path.join(f.legacy, "course.yml"), "utf8")).toBe(local);
      expect(fs.readdirSync(student)).toEqual(studentBefore);
      expect(f.legacyHandler).not.toHaveBeenCalled();
      expect(f.push).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "revalidates account state after remote awaits before any write",
    async () => {
      const f = await fixture();
      const before = await git(f.remote, ["rev-parse", "main"]);
      const resolve = currentReader.resolveId;
      currentReader = {
        ...currentReader,
        resolveId: async (id) => {
          const repo = await resolve(id);
          f.invalidate();
          return repo;
        }
      };
      await expect(f.invoke(IPC_CHANNELS.saveGradingStudentViewState)).rejects.toThrow();
      expect(await git(f.remote, ["rev-parse", "main"])).toBe(before);
      expect(f.legacyHandler).not.toHaveBeenCalled();
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
  it(
    "publishes authorized course lifecycle through the existing scoped transaction",
    async () => {
      const f = await fixture(42);
      const before = await git(f.remote, ["rev-parse", "main"]);
      expect(
        await f.invoke(IPC_CHANNELS.changeManagedCourseLifecycle, {
          targetStatus: "archived",
          expectedCourseRevision: before
        })
      ).toMatchObject({ status: "archived" });
      expect(await git(f.remote, ["diff", "--name-only", before, "main"])).toBe("course.yml");
      expect(f.legacyHandler).not.toHaveBeenCalled();
      expect(f.push).toHaveBeenCalledTimes(1);
    },
    GIT_INTEGRATION_TIMEOUT_MS
  );
});
