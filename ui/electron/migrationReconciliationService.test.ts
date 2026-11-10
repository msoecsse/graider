// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMigrationReconciliationStore,
  createMigrationReconciliationService,
  verifyCurrentMigrationAccess,
  loadMigrationReconciliationBackend
} from "./migrationReconciliationService.js";
import type { GitHubClient } from "./githubClientProvider.js";
import type * as Backend from "../dist-electron/migrationReconciliationBackend.cjs";
import type { ManagedOperationInput } from "./githubOAuthSession.js";
import type { RemoteRepositoryReader } from "./githubRemoteRepositories.js";
import type {
  GitWorkspaceFactory,
  AuthenticatedGitWorkspaceContext
} from "./gitWorkspaceReader.js";
import { removeGitFixture, GIT_INTEGRATION_TIMEOUT_MS } from "./gitIntegrationFixtures.js";
import { changeManagedCourseLifecycle } from "./courseLifecycleService.js";
import { managedCoursePath } from "./managedCourses.js";
import { parse, stringify } from "yaml";

// Complete reconciliation publishes each journal step separately and revalidates
// the growing permanent history each time. The archive/recovery scenario alone
// performs 39 pushes, 56 clones and 115 fetches (~18s in isolation). Budget these
// multi-transaction scenarios separately from individual Git integration cases;
// keep the deadline bounded and retain the production subprocess/cancel limits.
// Native Windows CI measured 75s and 84s for single full reconciliations;
// archive/recovery performs two plus independent history/access observations.
// Allow three such ~90s transactions, rounded to a bounded five-minute budget.
const DEFAULT_TRANSACTION_BUDGETS = 3;
const WINDOWS_TRANSACTION_BUDGETS = 10;
const SCENARIO_TIMEOUT_MS =
  (process.platform === "win32" ? WINDOWS_TRANSACTION_BUDGETS : DEFAULT_TRANSACTION_BUDGETS) *
  GIT_INTEGRATION_TIMEOUT_MS;

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async (lifecycle: "active" | "archived" = "active") => {
  const b = loadMigrationReconciliationBackend();
  const synthetic = (await import(
    path.resolve("../tests/unit/migration/synthetic-migration-fixtures.ts")
  )) as {
    BasicCourse(options?: { sourceSha?: string }): Backend.MigrationSnapshot;
    completeSyntheticMigration(
      snapshot: Backend.MigrationSnapshot,
      statuses?: readonly string[]
    ): Omit<Backend.MigrationCandidateInput, "boundary">;
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider shared journal "));
  roots.push(root);
  const seed = path.join(root, "seed"),
    remote = path.join(root, "remote.git");
  fs.mkdirSync(seed);
  const runners = b.createMigrationGitRunners();
  const git = async (cwd: string, args: string[]) => (await runners.runGit({ cwd, args })).trim();
  const write = (file: string, content: string) => {
    const location = path.join(seed, ...file.split("/"));
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content);
  };
  await git(seed, ["init", "--initial-branch=main"]);
  for (const [file, content] of Object.entries(synthetic.BasicCourse().sourceFiles))
    write(file, content);
  const commit = async (message: string) => {
    await git(seed, ["add", "."]);
    await git(seed, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-m",
      message
    ]);
    return git(seed, ["rev-parse", "HEAD"]);
  };
  const source = await commit("Fictional source");
  const original = synthetic.BasicCourse({ sourceSha: source });
  const artifacts = synthetic.completeSyntheticMigration(original, [lifecycle]);
  const candidate = b.buildMigrationCandidate({
    ...artifacts,
    boundary: b.STAGED_PHASE_9_BOUNDARY
  });
  if (candidate.status === "blocked") throw new Error(candidate.problems.join(" "));
  for (const file of candidate.files) write(file.path, file.content);
  const publication = await commit("Fictional publication");
  await git(root, ["clone", "--bare", seed, remote]);
  await git(remote, ["update-ref", `refs/tags/graider-migration-v1/${source}`, source]);
  const binding = original.binding;
  const repository = {
    id: binding.repositoryId,
    organizationId: binding.organizationId!,
    owner: binding.organizationLogin,
    name: binding.repositoryName,
    fullName: `${binding.organizationLogin}/${binding.repositoryName}`,
    url: `https://github.com/${binding.organizationLogin}/${binding.repositoryName}`,
    defaultBranch: "main",
    visibility: "private" as const,
    archived: false,
    disabled: false,
    nodeId: "node",
    topics: []
  };
  let active = true;
  let loseResponse = false;
  const authentication = b.createGitAuthenticationContext("fake-journal-auth")!;
  const transport = new b.GitCommandWorkspaceFactory({
    runGit: async (request) => {
      const result = await runners.runGit({
        ...request,
        args: [
          "-c",
          `url.${pathToFileURL(remote).href}.insteadOf=${repository.url}.git`,
          ...request.args
        ]
      });
      if (loseResponse && request.args.includes("push")) throw new Error("Accepted but lost");
      return result;
    },
    runGitBinary: runners.runGitBinary,
    credentialResolver: {
      resolve: async () => ({ kind: "github_token", host: "github.com", token: "fake-secret" })
    }
  });
  const input: ManagedOperationInput = {
    userId: binding.authenticatedGithubUserId,
    token: "fake-secret",
    signal: new AbortController().signal,
    revalidateSession: async () => active,
    course: {
      ...repository,
      repositoryId: repository.id,
      organizationLogin: repository.owner,
      schemaVersion: 2,
      code: "fixture",
      title: "Fixture",
      authorization: "authorized",
      localStatus: "remote_only",
      localFolderIds: [],
      discoveryHints: [],
      diagnostics: []
    }
  };
  const reader: RemoteRepositoryReader = {
    resolveId: async () => repository,
    resolve: async () => repository,
    // Simulate a fresh GitHub ref GET from the fixture's actual bare ref.
    // Every transaction/fetch/commit/push and cross-machine CAS still uses bundled Git;
    // thousands of preflight observations do not each need another Git subprocess.
    revision: () => {
      const loose = path.join(remote, "refs", "heads", "main");
      const revision = fs.existsSync(loose)
        ? fs.readFileSync(loose, "utf8").trim()
        : fs
            .readFileSync(path.join(remote, "packed-refs"), "utf8")
            .split("\n")
            .find((line) => line.endsWith(" refs/heads/main"))
            ?.split(" ")[0];
      if (!revision) throw new Error("Fixture branch is unavailable.");
      return Promise.resolve(revision);
    },
    file: async (_repo, file, revision = "main") => git(remote, ["show", `${revision}:${file}`]),
    terms: async () => ["27s1"],
    list: async () => [],
    search: async () => ({ ids: [], incomplete: false })
  };
  const authority = {
    getOrganizationScopeResponse: async () => ({
      status: 200,
      headers: { "x-oauth-scopes": "repo admin:org" },
      data: { id: input.userId }
    }),
    getOrganizationMembership: async () => ({
      status: 200,
      headers: {},
      data: {
        state: "active",
        role: "admin",
        organization: { id: repository.organizationId, login: repository.owner }
      }
    }),
    getCourseRepositoryById: async () => ({
      status: 200,
      headers: {},
      data: {
        id: repository.id,
        name: repository.name,
        node_id: "node",
        owner: { id: repository.organizationId, login: repository.owner, type: "Organization" },
        archived: false,
        disabled: false,
        permissions: { admin: true },
        default_branch: "main"
      }
    })
  };
  const dependencies = (
    machine: string,
    client: typeof authority | Backend.ReconciliationClient = authority
  ): Parameters<typeof createMigrationReconciliationStore>[0] => ({
    userData: path.join(root, machine),
    input,
    reader,
    client,
    factory: transport as unknown as GitWorkspaceFactory,
    authenticate: () =>
      ({ factory: transport, authentication }) as unknown as AuthenticatedGitWorkspaceContext,
    withCheckpointWorkspace: async (_remote, _token, operation) =>
      operation(await transport.openCheckpoint(seed), authentication)
  });
  const store = (
    machine: string,
    client: typeof authority | Backend.ReconciliationClient = authority
  ) => createMigrationReconciliationStore(dependencies(machine, client));
  const service = (client: Backend.ReconciliationClient) =>
    createMigrationReconciliationService({
      ...dependencies("service", client),
      provideClient: () => client as unknown as GitHubClient,
      reader: () => reader,
      session: {
        withSynchronizedCourse: async (_repositoryId, _userId, operation) =>
          operation(input, {
            status: "up_to_date",
            currentCommit: await reader.revision(repository),
            diagnostic: null,
            retryable: false
          })
      }
    });
  const currentAccess = (client: Backend.ReconciliationClient) =>
    verifyCurrentMigrationAccess({
      ...dependencies("access", client),
      provideClient: () => client as unknown as GitHubClient,
      reader: () => reader
    });
  const changeLifecycle = async (
    targetStatus: "archived" | "unarchived",
    client: Backend.ReconciliationClient
  ) => {
    // These are the same independent gates used by the managed operation bridge.
    if (!(await currentAccess(client))) throw new Error("Required current access is unverified.");
    const current = await store("lifecycle", client).observe();
    const userData = dependencies("lifecycle", client).userData;
    return changeManagedCourseLifecycle({
      userData,
      input,
      context: {
        managed: true,
        userId: input.userId,
        repositoryId: repository.id,
        authoritativeCommit: current.revision,
        operationalCommit: current.revision,
        courseFolderId: `managed-course:${input.userId}:${repository.id}`,
        courseFolderPath: managedCoursePath(userData, input.userId, repository.id),
        mode: "new_mutation"
      },
      expectedRevision: current.revision,
      targetStatus,
      revalidateRepository: async () => {
        if (
          !(await input.revalidateSession()) ||
          (await reader.revision(repository)) !== current.revision
        )
          throw new Error("Current authority changed.");
      },
      changed: () => {},
      factory: transport as unknown as GitWorkspaceFactory,
      authenticate: () =>
        ({ factory: transport, authentication }) as unknown as AuthenticatedGitWorkspaceContext,
      author: { name: "Fixture", email: "fixture@example.test" }
    });
  };
  return {
    b,
    root,
    seed,
    remote,
    source,
    publication,
    input,
    reader,
    repository,
    git,
    write,
    commit,
    store,
    dependencies,
    service,
    currentAccess,
    changeLifecycle,
    invalidate: () => {
      active = false;
    },
    lost: () => {
      loseResponse = true;
    }
  };
};

describe("shared production journal transaction", { timeout: SCENARIO_TIMEOUT_MS }, () => {
  it("runs complete reconciliation and retains Ready audit on another machine without additional GitHub or Git writes", async () => {
    const f = await fixture();
    const fixtures = (await import(
      path.resolve("../tests/unit/migration/migration-reconciliation-fixtures.ts")
    )) as {
      reconciliationFixture(): {
        client: Backend.ReconciliationClient & { teamsCreated: unknown[]; creations: unknown[] };
      };
    };
    const client = fixtures.reconciliationFixture().client;
    const service = createMigrationReconciliationService({
      ...f.dependencies("office", client),
      provideClient: () => client as unknown as GitHubClient,
      reader: () => f.reader,
      session: {
        withSynchronizedCourse: async (_repositoryId, _userId, operation) =>
          operation(f.input, {
            status: "up_to_date",
            currentCommit: await f.reader.revision(f.repository),
            diagnostic: null,
            retryable: false
          })
      }
    });
    const result = await service.reconcile(f.input.userId, f.repository.id);
    expect(result.status).toBe("ready");
    const office = await f.store("office-restart", client).observe();
    expect(office.record?.status).toBe("ready");
    expect(office.metadata.deferred_work.length).toBeGreaterThan(0);
    const creates = client.teamsCreated.length;
    const head = await f.git(f.remote, ["rev-parse", "main"]);
    expect(
      (
        await f.b.reconcilePublishedMigration({
          store: f.store("home", client),
          client,
          authenticatedUserId: f.input.userId
        })
      ).status
    ).toBe("ready");
    expect(client.teamsCreated).toHaveLength(creates);
    expect(client.creations).toHaveLength(1);
    expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(head);
    const home = await f.store("home-restart", client).observe();
    expect(home.record).toEqual(office.record);
    expect(home.metadata.audit).toEqual(office.metadata.audit);
    expect(home.publication).toBe(f.publication);
    const audit = await service.inspect(f.input.userId, f.repository.id);
    expect(audit.source).toBe(f.source);
    expect(audit.migrationDate).toBe(
      await f.git(f.remote, ["show", "-s", "--format=%cI", f.publication, "--"])
    );
    expect(audit.currentAccess).toBe("ready");
    expect(audit.publication).toBe(f.publication);
    expect(audit.reconciliation?.status).toBe("ready");
    expect(audit.findings).toEqual(home.metadata.findings);
    expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(head);
  });

  it("carries invisible creation outcomes to a second machine and resolves them solely from later observation", async () => {
    const f = await fixture();
    const fixtures = (await import(
      path.resolve("../tests/unit/migration/migration-reconciliation-fixtures.ts")
    )) as {
      reconciliationFixture(): {
        client: Backend.ReconciliationClient & { teamsCreated: unknown[] };
      };
    };
    const client = fixtures.reconciliationFixture().client;
    const visibility = vi
      .spyOn(client, "listManagedOrganizationTeamsPage")
      .mockResolvedValue({ status: 200, headers: {}, data: [] });
    expect(
      (
        await f.b.reconcilePublishedMigration({
          store: f.store("office", client),
          client,
          authenticatedUserId: f.input.userId
        })
      ).status
    ).toBe("needs_attention");
    const creates = client.teamsCreated.length;
    expect(creates).toBeGreaterThan(0);
    expect(
      (
        await f.b.reconcilePublishedMigration({
          store: f.store("home", client),
          client,
          authenticatedUserId: f.input.userId
        })
      ).status
    ).toBe("needs_attention");
    expect(client.teamsCreated).toHaveLength(creates);
    visibility.mockRestore();
    expect(
      (
        await f.b.reconcilePublishedMigration({
          store: f.store("repaired", client),
          client,
          authenticatedUserId: f.input.userId
        })
      ).status
    ).toBe("ready");
    expect(client.teamsCreated).toHaveLength(creates);
    expect((await f.store("verified", client).observe()).record?.guards).toEqual([]);
  });
  it("synchronizes unresolved guards and permanent source/publication audit onto another machine", async () => {
    const f = await fixture();
    const first = f.store("office");
    const observed = await first.observe();
    const record = f.b.createReconciliationRecord(observed);
    record.writeId = "office-first-intent";
    record.guards.push({
      kind: "team",
      key: "managed-team-create:fictional",
      actor: f.input.userId
    });
    const published = await first.publish(observed.revision, record);
    const home = await f.store("home").observe();
    expect(home.record).toEqual(record);
    expect(home.revision).toBe(published.revision);
    expect(home.publication).toBe(f.publication);
    expect(home.source).toBe(f.source);
    expect(home.metadata.audit).toEqual(observed.metadata.audit);
    expect(await f.git(f.remote, ["rev-parse", home.checkpoint])).toBe(f.source);
    expect(JSON.stringify(home.record)).not.toContain("fake-secret");
  });
  it("allows only one journal claim from two machines at the same exact base", async () => {
    const f = await fixture();
    const office = f.store("office"),
      home = f.store("home");
    const a = await office.observe(),
      b = await home.observe();
    const claim = (snapshot: typeof a, name: string) => ({
      ...f.b.createReconciliationRecord(snapshot),
      writeId: name,
      guards: [{ kind: "team" as const, key: "same-resource", actor: f.input.userId }]
    });
    const outcomes = await Promise.allSettled([
      office.publish(a.revision, claim(a, "office")),
      home.publish(b.revision, claim(b, "home"))
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const result = await f.store("restart").observe();
    expect(result.record?.guards).toHaveLength(1);
    expect(["office", "home"]).toContain(result.record?.writeId);
  });
  it("independently proves accepted-but-lost journal publication without another push", async () => {
    const f = await fixture();
    const store = f.store("office");
    const observed = await store.observe();
    f.lost();
    const record = { ...f.b.createReconciliationRecord(observed), writeId: "lost-response" };
    const result = await store.publish(observed.revision, record);
    expect(result.record?.writeId).toBe("lost-response");
    expect(await f.git(f.remote, ["rev-list", "--count", `${f.publication}..main`])).toBe("1");
  });
  it("refuses deleted checkpoints, account invalidation and transferred repositories", async () => {
    const f = await fixture();
    const store = f.store("office");
    const observed = await store.observe();
    f.repository.organizationId++;
    await expect(store.assertCurrent(observed)).rejects.toThrow();
    f.repository.organizationId--;
    await f.git(f.remote, ["update-ref", "-d", observed.checkpoint]);
    const home = f.store("home");
    await expect(home.inspectHistory()).rejects.toThrow();
    await expect(
      home.publish(observed.revision, f.b.createReconciliationRecord(observed))
    ).rejects.toThrow();
    await expect(home.freshPlan()).rejects.toThrow();
    f.invalidate();
    await expect(
      store.publish(observed.revision, {
        ...f.b.createReconciliationRecord(observed),
        writeId: "refused"
      })
    ).rejects.toThrow();
    expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(f.publication);
  });
  it("does not mutate an unexpectedly advanced publication", async () => {
    const f = await fixture();
    const store = f.store("office");
    const observed = await store.observe();
    f.write("unexpected.txt", "Other operation\n");
    const winner = await f.commit("Remote changed");
    await f.git(f.seed, ["push", pathToFileURL(f.remote).href, "HEAD:main"]);
    await expect(
      store.publish(observed.revision, {
        ...f.b.createReconciliationRecord(observed),
        writeId: "stale"
      })
    ).rejects.toThrow();
    await expect(f.store("home").observe()).rejects.toThrow();
    expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(winner);
  });
});

const operationalClient = async () => {
  const fixtures = (await import(
    path.resolve("../tests/unit/migration/migration-reconciliation-fixtures.ts")
  )) as {
    reconciliationFixture(): {
      client: Backend.ReconciliationClient & {
        teamsCreated: unknown[];
        creations: unknown[];
        accountId: number;
        repositoryGrants: Map<number, Map<number, string>>;
        teamPermissionWrites: unknown[];
      };
    };
  };
  return fixtures.reconciliationFixture().client;
};

describe(
  "permanent history and explicit current recovery",
  { timeout: SCENARIO_TIMEOUT_MS },
  () => {
    it("retains Ready history through archive, independently revalidates a fresh plan and safely unarchives", async () => {
      const f = await fixture("archived");
      const client = await operationalClient();
      const service = f.service(client);
      expect((await service.reconcile(f.input.userId, f.repository.id)).status).toBe("ready");
      const original = await service.inspect(f.input.userId, f.repository.id);
      expect((await f.changeLifecycle("archived", client)).status).toBe("archived");
      const archiveHead = await f.reader.revision(f.repository);
      const history = await service.inspect(f.input.userId, f.repository.id);
      expect(history).toMatchObject({
        publication: f.publication,
        source: f.source,
        journalRevision: archiveHead,
        executionState: "fresh_plan_required",
        operationalReadiness: "unverified"
      });
      expect(history.review).toEqual(original.review);
      expect(history.reconciliation).toEqual(original.reconciliation);
      expect(history.reconciliation?.status).toBe("ready");
      expect((await service.reconcile(f.input.userId, f.repository.id)).attention).toContain(
        "fresh_plan_required"
      );
      expect(await f.reader.revision(f.repository)).toBe(archiveHead);
      await expect(f.changeLifecycle("unarchived", client)).rejects.toThrow("unverified");
      const fresh = await f.store("fresh", client).freshPlan();
      expect(fresh.record?.plan).toEqual({ baseRevision: archiveHead, actor: f.input.userId });
      expect(fresh.record?.steps).toEqual([]);
      expect(fresh.record?.status).toBe("needs_attention");
      expect(await f.currentAccess(client)).toBe(false);
      const ready = await service.reconcile(f.input.userId, f.repository.id);
      expect(ready.status).toBe("ready");
      expect(ready.studentFacingReady).toBe(false);
      expect((await f.changeLifecycle("unarchived", client)).status).toBe("unarchived");
      const final = await service.inspect(f.input.userId, f.repository.id);
      expect(final.executionState).toBe("fresh_plan_required");
      expect(final.review).toEqual(original.review);
      expect(
        final.reconciliation?.history.slice(0, original.reconciliation?.history.length)
      ).toEqual(original.reconciliation?.history);
      expect(final.publication).toBe(f.publication);
      expect(await f.git(f.remote, ["rev-parse", final.checkpoint])).toBe(f.source);
      expect(await f.git(f.remote, ["rev-list", "--count", `${f.source}..${f.publication}`])).toBe(
        "1"
      );
    });

    it("requires another explicit current plan and verifies access after unarchive", async () => {
      const f = await fixture("archived");
      const client = await operationalClient();
      const service = f.service(client);
      const course = parse(fs.readFileSync(path.join(f.seed, "course.yml"), "utf8"));
      course.course.lifecycle = "archived";
      f.write("course.yml", stringify(course));
      await f.commit("Archived starting course");
      await f.git(f.seed, ["push", pathToFileURL(f.remote).href, "HEAD:main"]);
      expect(
        (await service.reconcile(f.input.userId, f.repository.id, { freshPlan: true })).status
      ).toBe("ready");
      expect((await f.changeLifecycle("unarchived", client)).status).toBe("unarchived");
      const history = await service.inspect(f.input.userId, f.repository.id);
      expect(history.executionState).toBe("fresh_plan_required");
      expect((await service.reconcile(f.input.userId, f.repository.id)).attention).toContain(
        "fresh_plan_required"
      );
      const result = await service.reconcile(f.input.userId, f.repository.id, { freshPlan: true });
      expect(result.status).toBe("ready");
      expect(result.studentFacingReady).toBe(false);
      expect(await f.currentAccess(client)).toBe(true);
      const final = await service.inspect(f.input.userId, f.repository.id);
      expect(final.review).toEqual(history.review);
      expect(final.publication).toBe(f.publication);
      expect(final.source).toBe(f.source);
    });

    it("keeps historical Ready evidence visible when independent operational verification detects external drift", async () => {
      const f = await fixture();
      const client = await operationalClient();
      const service = f.service(client);
      expect((await service.reconcile(f.input.userId, f.repository.id)).status).toBe("ready");
      const original = await service.inspect(f.input.userId, f.repository.id);
      const writes = vi.spyOn(client, "setCourseRepositoryTeamPermission");
      client.repositoryGrants.get(f.repository.id)?.clear();
      const beforeCheck = await f.reader.revision(f.repository);
      expect(await f.currentAccess(client)).toBe(false);
      expect(writes).not.toHaveBeenCalled();
      expect(await f.reader.revision(f.repository)).toBe(beforeCheck);
      const history = await service.inspect(f.input.userId, f.repository.id);
      expect(history.review).toEqual(original.review);
      expect(history.reconciliation?.status).toBe("ready");
      expect(history.operationalReadiness).toBe("unverified");
      expect((await service.reconcile(f.input.userId, f.repository.id)).status).toBe("ready");
      expect(await f.currentAccess(client)).toBe(true);
    });

    it("preserves ambiguous creation guards after a domain change and never recreates the resource", async () => {
      const f = await fixture();
      const client = await operationalClient();
      const create = vi
        .spyOn(client, "createManagedTeam")
        .mockRejectedValue(new Error("unknown create outcome"));
      const service = f.service(client);
      expect((await service.reconcile(f.input.userId, f.repository.id)).status).toBe(
        "needs_attention"
      );
      const original = await f.store("before", client).inspectHistory();
      expect(original.record?.guards.length).toBeGreaterThan(0);
      const creates = create.mock.calls.length;
      await f.git(f.seed, ["fetch", pathToFileURL(f.remote).href, "main"]);
      await f.git(f.seed, ["reset", "--hard", "FETCH_HEAD"]);
      const file = path.join(f.seed, "course.yml");
      fs.appendFileSync(file, "\n# fresh domain revision\n");
      await f.commit("Advance domain");
      await f.git(f.seed, ["push", pathToFileURL(f.remote).href, "HEAD:main"]);
      const fresh = await f.store("fresh", client).freshPlan();
      expect(fresh.record?.guards).toEqual(original.record?.guards);
      expect(fresh.record?.steps).toEqual([]);
      expect((await service.reconcile(f.input.userId, f.repository.id)).status).toBe(
        "needs_attention"
      );
      expect(create).toHaveBeenCalledTimes(creates);
      expect(
        (await service.inspect(f.input.userId, f.repository.id)).reconciliation?.guards
      ).toEqual(original.record?.guards);
    });

    it("requires current account and role authorization for history and fresh plans with zero unauthorized writes", async () => {
      const f = await fixture();
      const client = await operationalClient();
      const original = await f.store("before", client).inspectHistory();
      const retained = f.store("retained", client);
      const oldSnapshot = await retained.observe();
      const replacement = original.course.faculty_directory.find(
        (faculty) => faculty.github_user_id !== f.input.userId
      )!.github_user_id;
      const course = parse(fs.readFileSync(path.join(f.seed, "course.yml"), "utf8"));
      course.fallback_administrator.github_user_id = replacement;
      const term = parse(fs.readFileSync(path.join(f.seed, "terms/27s1/term.yml"), "utf8"));
      term.coordinators.former.push(...term.coordinators.current);
      term.coordinators.current = [{ github_user_id: replacement }];
      f.write("course.yml", stringify(course));
      f.write("terms/27s1/term.yml", stringify(term));
      const changed = await f.commit("Current role authority changes");
      await f.git(f.seed, ["push", pathToFileURL(f.remote).href, "HEAD:main"]);
      await expect(
        retained.publish(oldSnapshot.revision, f.b.createReconciliationRecord(oldSnapshot))
      ).rejects.toThrow();
      await expect(f.service(client).inspect(f.input.userId, f.repository.id)).rejects.toThrow();
      await expect(f.store("former", client).freshPlan()).rejects.toThrow();
      expect(await f.reader.revision(f.repository)).toBe(changed);
      const currentDependencies = {
        ...f.dependencies("replacement", client),
        input: { ...f.input, userId: replacement }
      };
      client.accountId = replacement;
      const currentStore = createMigrationReconciliationStore(currentDependencies);
      const history = await currentStore.inspectHistory();
      expect(history.metadata).toEqual(original.metadata);
      expect((await currentStore.freshPlan()).record?.plan?.actor).toBe(replacement);
      const currentHead = await f.reader.revision(f.repository);
      await expect(f.service(client).inspect(f.input.userId, f.repository.id)).rejects.toThrow();
      f.invalidate();
      await expect(currentStore.freshPlan()).rejects.toThrow();
      expect(await f.reader.revision(f.repository)).toBe(currentHead);
      expect(client.teamsCreated).toEqual([]);
      expect(client.creations).toEqual([]);
      expect(client.teamPermissionWrites).toEqual([]);
    });
  }
);
