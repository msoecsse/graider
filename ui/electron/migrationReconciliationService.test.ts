// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMigrationReconciliationStore,
  createMigrationReconciliationService,
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

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const fixture = async () => {
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
  const artifacts = synthetic.completeSyntheticMigration(original, ["active"]);
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
    invalidate: () => {
      active = false;
    },
    lost: () => {
      loseResponse = true;
    }
  };
};

describe("shared production journal transaction", { timeout: GIT_INTEGRATION_TIMEOUT_MS }, () => {
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
    await expect(f.store("home").observe()).rejects.toThrow();
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
