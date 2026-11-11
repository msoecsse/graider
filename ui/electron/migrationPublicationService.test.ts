// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeManagedOperation } from "./managedCourses.js";
import { createMigrationPublicationStore } from "./migrationPublicationStore.js";
import { createMigrationPublicationService } from "./migrationPublicationService.js";
import {
  createMigrationReviewService,
  loadMigrationReviewBackend
} from "./migrationReviewService.js";
import type { ManagedOperationInput } from "./githubOAuthSession.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";
import type * as Backend from "../dist-electron/migrationReviewBackend.cjs";

// Only this test module replaces unavailable production evidence/transport. No test
// switch, synthetic grant issuer or release assertion exists in production code.
const loadSyntheticFixtures = async () =>
  (await import(path.resolve("../tests/unit/migration/synthetic-migration-fixtures.ts"))) as {
    BasicCourse(options?: { sourceSha: string }): Backend.MigrationSnapshot;
    syntheticPublicationFixture(): { context: Backend.MigrationPublicationContext };
  };
const loadReviewFixtures = async () =>
  (await import(path.resolve("../tests/unit/migration/migration-review-fixtures.ts"))) as {
    completeSubmission(view: Backend.MigrationReviewSessionView): Backend.MigrationReviewSubmission;
  };
const GIT_INTEGRATION_TIMEOUT_MS = 30_000;
const seams = vi.hoisted(() => ({
  synthetic: false,
  evidence: (value: unknown): unknown => value,
  beforeValidation: async (_context: unknown): Promise<void> => {}
}));
vi.mock("./migrationPublicationReadiness.js", async (original) => {
  const real = await original<typeof import("./migrationPublicationReadiness.js")>();
  return {
    ...real,
    readMigrationPublicationReadiness: async (context: Backend.MigrationPublicationContext) => {
      await seams.beforeValidation(context);
      if (!seams.synthetic) return real.readMigrationPublicationReadiness(context);
      const fixture = (await loadSyntheticFixtures()).syntheticPublicationFixture();
      const compatibility = seams.evidence({
        ...fixture.context.compatibility,
        binding: context.binding,
        observationId: context.observationId,
        acknowledgement: {
          ...fixture.context.compatibility!.acknowledgement,
          binding: context.binding,
          githubUserId: context.binding.authenticatedGithubUserId
        }
      }) as Backend.MigrationCompatibilityEvidence;
      const b = loadMigrationReviewBackend();
      const result = b.validateMigrationPublication(
        { ...context, environment: "synthetic", compatibility },
        { candidate: context.candidate, binding: context.binding }
      );
      return {
        ...result,
        publicationReady:
          result.internalReady && result.productionEnablement.releaseAvailability === "verified",
        productionEnablement: {
          ...result.productionEnablement,
          enabled:
            result.internalReady && result.productionEnablement.releaseAvailability === "verified"
        }
      };
    }
  };
});
const roots: string[] = [];
const OWNER = 1;
const author = { name: "Fictional faculty", email: "faculty@example.test" };
afterEach(async () => {
  vi.unstubAllEnvs();
  seams.synthetic = false;
  seams.evidence = (value) => value;
  seams.beforeValidation = async () => {};
  const { removeGitFixture } = (await import(
    path.resolve("../tests/support/git/integration-fixtures.ts")
  )) as { removeGitFixture(root: string): Promise<void> };
  await Promise.all(roots.splice(0).map(removeGitFixture));
});
const setup = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graider migration publication "));
  roots.push(root);
  const { BasicCourse } = await loadSyntheticFixtures();
  const { completeSubmission } = await loadReviewFixtures();
  const b = loadMigrationReviewBackend();
  const { GitCommandWorkspaceFactory, createGitAuthenticationContext } = b;
  const runners = b.createMigrationGitRunners();
  const git = async (cwd: string, args: readonly string[]) =>
    (await runners.runGit({ cwd, args })).trim();
  const seed = path.join(root, "seed");
  const remote = path.join(root, "remote.git");
  const userData = path.join(root, "app data");
  fs.mkdirSync(seed);
  fs.mkdirSync(userData);
  const snapshot = BasicCourse();
  for (const [file, content] of Object.entries(snapshot.sourceFiles)) {
    const target = path.join(seed, ...file.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  await git(seed, ["init", "--initial-branch=main"]);
  await git(seed, ["add", "."]);
  await git(seed, [
    "-c",
    `user.name=${author.name}`,
    "-c",
    `user.email=${author.email}`,
    "commit",
    "-m",
    "Fictional source"
  ]);
  const sha = await git(seed, ["rev-parse", "HEAD"]);
  const inputSnapshot = BasicCourse({ sourceSha: sha });
  await git(root, ["clone", "--bare", seed, remote]);
  let generation = 1;
  let trustedUserId = snapshot.binding.authenticatedGithubUserId;
  let sessionCurrent = true;
  const controller = new AbortController();
  const factory = new GitCommandWorkspaceFactory(runners);
  const authentication = createGitAuthenticationContext("fictional-auth")!;
  const active = path.join(
    userData,
    "managed-courses",
    String(snapshot.binding.authenticatedGithubUserId),
    String(snapshot.binding.repositoryId),
    "repo"
  );
  await factory.clone({
    remote: b.createTrustedGitRemote(pathToFileURL(remote).href)!,
    destination: active,
    checkout: "default"
  });
  const observe = vi.fn(async () => ({
    repository: {
      id: snapshot.binding.repositoryId,
      organizationId: snapshot.binding.organizationId!,
      owner: snapshot.binding.organizationLogin,
      name: snapshot.binding.repositoryName,
      disabled: false,
      defaultBranch: "main",
      nodeId: null,
      fullName: `${snapshot.binding.organizationLogin}/${snapshot.binding.repositoryName}`,
      url: `https://github.com/${snapshot.binding.organizationLogin}/${snapshot.binding.repositoryName}`,
      visibility: "private" as const,
      archived: false,
      topics: []
    },
    sourceCommitSha: await git(remote, ["rev-parse", "main"])
  }));
  const reviewService = createMigrationReviewService({
    backend: loadMigrationReviewBackend,
    withCourse: async (_selector, operation) =>
      operation({
        userId: trustedUserId,
        generation,
        institutionalUsername: "jones",
        reader: {
          snapshot: async () => inputSnapshot,
          observe,
          lookupLogin: async () => ({
            githubUserId: snapshot.binding.authenticatedGithubUserId,
            githubLogin: "jones-now"
          }),
          inventory: async (analysis, review) => ({
            kind: "schema-v1-legacy-grader-inventory",
            status: "not_applicable",
            publicationReady: false,
            source: { ...analysis.source, reportId: analysis.reportId },
            runtimeCoverage: analysis.runtimeCoverage,
            evidence: [],
            repositoryEvidence: [],
            candidate: null,
            repositories: [],
            findings: []
          })
        }
      })
  });
  const selector = `managed-course:${snapshot.binding.authenticatedGithubUserId}:${snapshot.binding.repositoryId}`;
  const loaded = await reviewService.load(OWNER, { selector });
  const view = loaded.view!;
  expect(view).toBeTruthy();
  const request = { sessionId: view.sessionId, source: b.migrationReviewSource(view.analysis) };
  expect(
    (await reviewService.complete(OWNER, { ...request, submission: completeSubmission(view) }))
      .status
  ).toBe("complete");
  const graders = await reviewService.loadGrader(OWNER, request);
  expect(
    (
      await reviewService.completeGrader(OWNER, {
        ...request,
        submission: { inventoryId: graders.inventoryId, decisions: [] }
      })
    ).status
  ).toBe("complete");
  await reviewService.acknowledge(OWNER, request);
  const course = {
    repositoryId: snapshot.binding.repositoryId,
    organizationId: snapshot.binding.organizationId,
    organizationLogin: snapshot.binding.organizationLogin,
    name: snapshot.binding.repositoryName,
    url: `https://github.com/${snapshot.binding.organizationLogin}/${snapshot.binding.repositoryName}`,
    defaultBranch: "main",
    authorization: "authorized"
  } as RemoteCourse;
  const resynchronize = vi.fn(async (afterPublication = false) => {
    if (afterPublication) {
      if (!sessionCurrent) throw new Error("Synthetic session changed");
      const cache = await transport.open(active);
      await cache.fetchOrigin({ authentication });
      const target = await git(remote, ["rev-parse", "main"]);
      const head = await cache.resolveHead();
      if (target !== head)
        await cache.fastForwardToCommit({
          expectedHead: head,
          expectedBranch: b.createBranchName("main")!,
          targetCommit: target as Backend.ObjectId
        });
      return {
        status: "updated" as const,
        currentCommit: target,
        diagnostic: null,
        retryable: false
      };
    }
    return {
      status: "up_to_date" as const,
      currentCommit: sha,
      diagnostic: null,
      retryable: false
    };
  });
  const input: ManagedOperationInput = {
    token: "fictional-token",
    userId: snapshot.binding.authenticatedGithubUserId,
    course,
    signal: new AbortController().signal,
    revalidateSession: async () => sessionCurrent,
    resynchronize
  };
  // URL rewriting is restricted to this fixture's isolated bundled Git runner.
  const transportRunners = b.createMigrationGitRunners();
  const commandList: string[][] = [];
  const commands = commandList;
  let pushMode: "normal" | "lost" | "reject" | "unknown" = "normal";
  let afterPush: () => Promise<void> = async () => {};
  let beforePush: () => Promise<void> = async () => {};
  let mutationStarted = false;
  let onCommand: (cwd: string, args: readonly string[]) => Promise<void> = async () => {};
  const run: typeof runners.runGit = async (r) => {
    commandList.push([...r.args]);
    await onCommand(r.cwd, r.args);
    const mutationPush =
      r.args.includes("push") && r.args.some((arg) => arg.startsWith("HEAD:refs/heads/"));
    if (mutationPush) {
      mutationStarted = true;
      await beforePush();
      if (pushMode === "reject") throw new Error("Rejected synthetic push");
    }
    if (mutationStarted && pushMode === "unknown" && r.args.includes("fetch"))
      throw new Error("Synthetic unavailable remote");
    const result = await transportRunners.runGit({
      ...r,
      args: ["-c", `url.${pathToFileURL(remote).href}.insteadOf=${course.url}.git`, ...r.args]
    });
    if (mutationPush) {
      await afterPush();
      if (pushMode === "lost" || pushMode === "unknown") throw new Error("Lost synthetic response");
    }
    return result;
  };
  const transport = new GitCommandWorkspaceFactory({
    runGit: run,
    runGitBinary: transportRunners.runGitBinary,
    credentialResolver: {
      resolve: async () => ({ kind: "github_token", host: "github.com", token: "fictional-token" })
    }
  });
  const authenticate = () =>
    ({
      factory: transport,
      authentication
    }) as unknown as import("./gitWorkspaceReader.js").AuthenticatedGitWorkspaceContext;
  const deps = {
    userData,
    reviewService,
    session: {
      withSynchronizedCourse: async <T>(
        _repositoryId: number,
        _userId: number,
        operation: (
          value: ManagedOperationInput,
          sync: Awaited<ReturnType<typeof resynchronize>>
        ) => Promise<T>
      ) => serializeManagedOperation(input, async () => operation(input, await resynchronize()))
    },
    observe,
    authenticate,
    factory: factory as unknown as import("./gitWorkspaceReader.js").GitWorkspaceFactory,
    withCheckpointWorkspace: async <T>(
      _remote: Backend.TrustedGitRemote,
      _token: string,
      operation: (
        workspace: Backend.GitRemoteCheckpointWorkspace,
        auth: Backend.GitAuthenticationContext
      ) => Promise<T>
    ) => operation(await transport.openCheckpoint(seed), authentication)
  };
  await git(active, ["remote", "set-url", "origin", `${course.url}.git`]);
  // Infrastructure mocks are confined to fixture composition, never a production grant.
  const service = createMigrationPublicationService(deps);
  return {
    service,
    deps,
    request,
    root,
    userData,
    active,
    seed,
    remote,
    git,
    sha,
    course,
    reviewService,
    input,
    observe,
    commands,
    controller,
    resynchronize,
    onCommand: (fn: typeof onCommand) => {
      onCommand = fn;
    },
    account: () => {
      trustedUserId += 1;
    },
    generation: () => {
      generation += 1;
    },
    invalidate: () => {
      sessionCurrent = false;
    },
    push: (mode: typeof pushMode) => {
      pushMode = mode;
    },
    afterPush: (fn: typeof afterPush) => {
      afterPush = fn;
    },
    beforePush: (fn: typeof beforePush) => {
      beforePush = fn;
    }
  };
};

describe(
  "trusted migration publication transaction",
  { timeout: GIT_INTEGRATION_TIMEOUT_MS },
  () => {
    it("fails closed in production without creating a checkpoint or changing authoritative v1", async () => {
      const f = await setup();
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(f.sha);
      expect(await f.git(f.remote, ["tag", "--list"])).toBe("");
      expect(f.commands.some((args) => args.includes("push"))).toBe(false);
    });
    it("publishes one complete exact-base candidate after verifying its immutable checkpoint", async () => {
      seams.synthetic = true;
      const f = await setup();
      const result = await f.service.publish(OWNER, f.request);
      expect(result, JSON.stringify(result)).toMatchObject({ status: "published" });
      const published = await f.git(f.remote, ["rev-parse", "main"]);
      expect(published).not.toBe(f.sha);
      expect(await f.git(f.remote, ["rev-parse", `${published}^`])).toBe(f.sha);
      expect(await f.git(f.remote, ["rev-parse", `refs/tags/graider-migration-v1/${f.sha}`])).toBe(
        f.sha
      );
      expect(await f.git(f.active, ["rev-parse", "HEAD"])).toBe(published);
      expect(await f.git(f.active, ["status", "--porcelain"])).toBe("");
      const count = await f.git(f.remote, ["rev-list", "--count", "main"]);
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "published" });
      expect(await f.git(f.remote, ["rev-list", "--count", "main"])).toBe(count);
    });
    const unchanged = async (f: Awaited<ReturnType<typeof setup>>) => {
      expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(f.sha);
      expect(await f.git(f.active, ["rev-parse", "HEAD"])).toBe(f.sha);
      expect(await f.git(f.active, ["status", "--porcelain"])).toBe("");
    };
    const advance = async (f: Awaited<ReturnType<typeof setup>>) => {
      fs.writeFileSync(path.join(f.seed, "remote-winner.txt"), "Other machine\n");
      await f.git(f.seed, ["add", "remote-winner.txt"]);
      await f.git(f.seed, [
        "-c",
        `user.name=${author.name}`,
        "-c",
        `user.email=${author.email}`,
        "commit",
        "-m",
        "Remote winner"
      ]);
      await f.git(f.seed, ["push", f.remote, "main"]);
      return f.git(f.remote, ["rev-parse", "main"]);
    };
    const evidenceRefusals: readonly [
      string,
      (e: Backend.MigrationCompatibilityEvidence) => unknown
    ][] = [
      ["parser support without operational support", (e) => ({ ...e, operationalSchema: null })],
      ["incompatible operational schema", (e) => ({ ...e, operationalSchema: 1 })],
      [
        "missing fail-closed safeguards",
        (e) => ({ ...e, safeguards: { ...e.safeguards, legacyMutations: null } })
      ],
      ["missing authorized acknowledgement", (e) => ({ ...e, acknowledgement: null })],
      [
        "foreign-account acknowledgement",
        (e) => ({ ...e, acknowledgement: { ...e.acknowledgement, githubUserId: 999 } })
      ],
      [
        "stale acknowledgement",
        (e) => ({
          ...e,
          acknowledgement: {
            ...e.acknowledgement,
            binding: { ...e.binding, completionId: "older-completion" }
          }
        })
      ],
      [
        "missing production releases",
        (e) => ({ ...e, releases: { ...e.releases, windowsX64: "unknown" } })
      ],
      [
        "missing signing prerequisite",
        (e) => ({ ...e, releases: { ...e.releases, signing: "unavailable" } })
      ],
      ["stale technical evidence", (e) => ({ ...e, observationId: "stale-observation" })],
      ["renderer-supplied compatibility", (e) => ({ ...e, scope: "renderer" })]
    ];
    it.each(evidenceRefusals)(
      "refuses %s before any checkpoint/course write",
      async (_name, change) => {
        seams.synthetic = true;
        seams.evidence = (value) => change(value as Backend.MigrationCompatibilityEvidence);
        const f = await setup();
        expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
        await unchanged(f);
        expect(await f.git(f.remote, ["tag", "--list"])).toBe("");
        expect(f.commands.some((args) => args.includes("push"))).toBe(false);
      }
    );
    it("rejects renderer authority fields, precomputed candidates and publication flags", async () => {
      seams.synthetic = true;
      const f = await setup();
      for (const extra of [
        { publicationReady: true },
        { candidate: {} },
        { compatibility: { trusted: true } },
        { owner: OWNER },
        { environment: "synthetic" }
      ])
        expect(await f.service.publish(OWNER, { ...f.request, ...extra })).toMatchObject({
          status: "blocked"
        });
      await unchanged(f);
      expect(f.commands).toHaveLength(0);
    });
    it("rejects an advanced reviewed source before any checkpoint or mutation", async () => {
      seams.synthetic = true;
      const f = await setup();
      const winner = await advance(f);
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(winner);
      expect(await f.git(f.remote, ["tag", "--list"])).toBe("");
      expect(f.commands.some((args) => args.includes("push"))).toBe(false);
    });
    it("preflights before checkpointing and validates materialized bytes only after a verified checkpoint", async () => {
      seams.synthetic = true;
      const f = await setup();
      const checkpointRef = `refs/tags/graider-migration-v1/${f.sha}`;
      let observations = 0;
      let pureCandidate: Backend.MigrationCandidate | undefined;
      let candidateRoot: string | undefined;
      let actualBytesValidated = false;
      let committed = false;
      let committedBytesValidated = false;
      seams.beforeValidation = async (value) => {
        const context = value as Backend.MigrationPublicationContext;
        if (!pureCandidate) {
          pureCandidate = context.candidate;
          expect(await f.git(f.remote, ["tag", "--list"])).toBe("");
          expect(
            fs.existsSync(
              path.join(f.userData, "managed-courses", String(f.input.userId), ".transactions")
            )
          ).toBe(false);
        }
        if (context.candidate !== pureCandidate) {
          expect(candidateRoot).toBeDefined();
          expect(await f.git(f.remote, ["rev-parse", checkpointRef])).toBe(f.sha);
          for (const file of context.candidate.files) {
            expect(
              fs.readFileSync(path.join(candidateRoot!, ...file.path.split("/"))).toString("base64")
            ).toBe(file.bytesBase64);
          }
          actualBytesValidated = true;
          if (committed) committedBytesValidated = true;
        }
      };
      f.onCommand(async (_cwd, args) => {
        if (args.includes("ls-remote")) {
          observations += 1;
          if (observations <= 2)
            expect(
              fs.existsSync(
                path.join(f.userData, "managed-courses", String(f.input.userId), ".transactions")
              )
            ).toBe(false);
        }
        if (args.includes("push") && args.some((arg) => arg.endsWith(`:${checkpointRef}`))) {
          expect(pureCandidate).toBeDefined();
          expect(candidateRoot).toBeUndefined();
        }
        if (args.includes("clone")) {
          expect(pureCandidate).toBeDefined();
          expect(await f.git(f.remote, ["rev-parse", checkpointRef])).toBe(f.sha);
          expect(actualBytesValidated).toBe(false);
          candidateRoot = args.at(-1);
        }
        if (args.includes("commit")) {
          expect(actualBytesValidated).toBe(true);
          committed = true;
        }
        if (args.includes("push") && args.some((arg) => arg.startsWith("HEAD:refs/heads/"))) {
          expect(committedBytesValidated).toBe(true);
          expect(await f.git(f.remote, ["rev-parse", checkpointRef])).toBe(f.sha);
        }
      });
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "published" });
      expect(committedBytesValidated).toBe(true);
      expect(observations).toBeGreaterThanOrEqual(3);
    });
    it("refuses a conflicting checkpoint without changing its reference or authoritative course", async () => {
      seams.synthetic = true;
      const f = await setup();
      fs.writeFileSync(path.join(f.seed, "other.txt"), "Not the reviewed source");
      await f.git(f.seed, ["add", "other.txt"]);
      await f.git(f.seed, [
        "-c",
        `user.name=${author.name}`,
        "-c",
        `user.email=${author.email}`,
        "commit",
        "-m",
        "Wrong checkpoint"
      ]);
      const wrong = await f.git(f.seed, ["rev-parse", "HEAD"]);
      const tag = `refs/tags/graider-migration-v1/${f.sha}`;
      await f.git(f.seed, ["push", f.remote, `${wrong}:${tag}`]);
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      await unchanged(f);
      expect(await f.git(f.remote, ["rev-parse", tag])).toBe(wrong);
    });
    it.each(["generation", "session"] as const)(
      "invalidates %s changes during validation",
      async (mode) => {
        seams.synthetic = true;
        const f = await setup();
        let observations = 0;
        seams.beforeValidation = async () => {
          observations += 1;
          if (observations === 3) {
            if (mode === "generation") f.generation();
            else f.invalidate();
          }
        };
        expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
        await unchanged(f);
        expect(
          f.commands.some((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
        ).toBe(false);
      }
    );
    it("refuses changed readiness at the last boundary after staging/commit", async () => {
      seams.synthetic = true;
      const f = await setup();
      let observations = 0;
      seams.beforeValidation = async () => {
        observations += 1;
        if (observations === 4)
          seams.evidence = (value) => ({ ...(value as object), acknowledgement: null });
      };
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({
        status: "blocked",
        readiness: { publicationReady: false }
      });
      await unchanged(f);
      expect(f.commands.some((args) => args.includes("commit"))).toBe(true);
      expect(
        f.commands.some((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toBe(false);
    });
    it.each(["extra", "ignored", "content", "staged"] as const)(
      "rejects %s transaction tampering without changing v1",
      async (mode) => {
        seams.synthetic = true;
        const f = await setup();
        let tampered = false;
        f.onCommand(async (cwd, args) => {
          const trigger = mode === "staged" ? "commit" : "status";
          if (
            !tampered &&
            cwd.includes(`${path.sep}.transactions${path.sep}`) &&
            args.includes(trigger) &&
            fs.existsSync(path.join(cwd, ".graider", "migration.json"))
          ) {
            tampered = true;
            if (mode === "extra") fs.writeFileSync(path.join(cwd, "unexpected.txt"), "Unexpected");
            if (mode === "ignored") {
              fs.writeFileSync(path.join(cwd, ".git", "info", "exclude"), "ignored.txt\n");
              fs.writeFileSync(path.join(cwd, "ignored.txt"), "Unexpected ignored output");
            }
            if (mode === "content" || mode === "staged")
              fs.appendFileSync(path.join(cwd, "course.yml"), "# tampered\n");
            if (mode === "staged") await f.git(cwd, ["add", "course.yml"]);
          }
        });
        expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
        expect(tampered).toBe(true);
        await unchanged(f);
      }
    );
    it("surfaces validator failure without a publication push", async () => {
      seams.synthetic = true;
      const f = await setup();
      let observations = 0;
      seams.beforeValidation = async () => {
        observations += 1;
        if (observations === 3) throw new Error("Synthetic validator failure");
      };
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      await unchanged(f);
    });
    it("rejects a remote race without merge/rebase, force or blind retry", async () => {
      seams.synthetic = true;
      const f = await setup();
      let winner = "";
      f.beforePush(async () => {
        winner = await advance(f);
      });
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "not_published" });
      expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(winner);
      expect(
        f.commands.filter((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toHaveLength(1);
      expect(
        f.commands
          .flat()
          .some((arg) => ["--force", "--force-with-lease", "rebase", "merge"].includes(arg))
      ).toBe(false);
    });
    it("confirms rejected pushes remotely and allows only a fresh explicit retry", async () => {
      seams.synthetic = true;
      const f = await setup();
      f.push("reject");
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "not_published" });
      await unchanged(f);
      f.push("normal");
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "published" });
      expect(await f.git(f.remote, ["rev-list", "--count", "main"])).toBe("2");
    });
    it("independently confirms an accepted push with a lost response", async () => {
      seams.synthetic = true;
      const f = await setup();
      f.push("lost");
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "published" });
      expect(f.commands.filter((args) => args.includes("fetch")).length).toBeGreaterThan(1);
      expect(
        f.commands.filter((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toHaveLength(1);
    });
    it("recovers an ambiguous accepted publication after restart without approvals or another push", async () => {
      seams.synthetic = true;
      const f = await setup();
      f.push("unknown");
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({
        status: "outcome_unknown"
      });
      const published = await f.git(f.remote, ["rev-parse", "main"]);
      expect(published).not.toBe(f.sha);
      const record = createMigrationPublicationStore(f.userData).read(
        f.input.userId,
        f.course.repositoryId
      )!;
      expect(record.commit).toBe(published);
      expect(JSON.stringify(record)).not.toMatch(/fictional-token|authorization|https:\/\//u);
      f.reviewService.close(OWNER);
      f.push("normal");
      const restarted = createMigrationPublicationService(f.deps);
      expect(await restarted.recover(f.input.userId, f.course.repositoryId)).toMatchObject({
        status: "published",
        commit: published
      });
      expect(await restarted.publish(OWNER, f.request)).toMatchObject({
        status: "published",
        commit: published
      });
      expect(
        f.commands.filter((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toHaveLength(1);
    });
    it("preserves confirmed v2 when managed synchronization remains incomplete", async () => {
      seams.synthetic = true;
      const f = await setup();
      f.afterPush(async () => {
        f.resynchronize.mockRejectedValue(new Error("Synthetic cache unavailable"));
      });
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({
        status: "published",
        refreshRequired: true
      });
      expect(await f.git(f.remote, ["show", "main:course.yml"])).toContain("schema_version: 2");
    });
    it.each(["immediate", "validation"] as const)(
      "cancels during %s preparation without partial publication",
      async (when) => {
        seams.synthetic = true;
        const f = await setup();
        if (when === "immediate") f.controller.abort();
        else {
          let observations = 0;
          seams.beforeValidation = async () => {
            observations += 1;
            if (observations === 3) f.controller.abort();
          };
        }
        expect(await f.service.publish(OWNER, f.request, f.controller.signal)).toMatchObject({
          status: "cancelled"
        });
        await unchanged(f);
        expect(
          f.commands.some((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
        ).toBe(false);
      }
    );
    it.each(["cancel", "window closure", "renderer disconnect", "account invalidation"] as const)(
      "establishes authoritative acceptance despite %s after the backend boundary",
      async (event) => {
        seams.synthetic = true;
        const f = await setup();
        f.push("lost");
        f.beforePush(async () => {
          expect(
            createMigrationPublicationStore(f.userData).read(f.input.userId, f.course.repositoryId)
          ).not.toBeNull();
          if (event === "cancel") f.controller.abort();
          if (event === "window closure" || event === "renderer disconnect")
            f.reviewService.close(OWNER);
          if (event === "account invalidation") f.invalidate();
        });
        expect(await f.service.publish(OWNER, f.request, f.controller.signal)).toMatchObject({
          status: "published"
        });
        expect(await f.git(f.remote, ["show", "main:course.yml"])).toContain("schema_version: 2");
      }
    );
    it("retains unknown outcomes while remote proof is unavailable and refuses duplicate publication", async () => {
      seams.synthetic = true;
      const f = await setup();
      f.push("unknown");
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({
        status: "outcome_unknown"
      });
      f.observe.mockRejectedValue(new Error("Synthetic unavailable remote"));
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({
        status: "outcome_unknown"
      });
      expect(
        f.commands.filter((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toHaveLength(1);
    });
    it("does not let a tampered durable intent authorize publication or claim success", async () => {
      seams.synthetic = true;
      const f = await setup();
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "published" });
      const store = createMigrationPublicationStore(f.userData);
      const record = store.read(f.input.userId, f.course.repositoryId)!;
      store.write({ ...record, filesFingerprint: "0".repeat(64) });
      expect(await f.service.recover(f.input.userId, f.course.repositoryId)).toMatchObject({
        status: "outcome_unknown"
      });
      expect(
        f.commands.filter((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toHaveLength(1);
    });

    it("ignores inherited Git storage, signing, line-ending and push settings", async () => {
      seams.synthetic = true;
      const f = await setup();
      const configuration = path.join(f.root, "ambient gitconfig");
      fs.writeFileSync(
        configuration,
        '[core]\n autocrlf = true\n[commit]\n gpgSign = true\n[push]\n followTags = true\n[remote "origin"]\n mirror = true\n'
      );
      vi.stubEnv("GIT_CONFIG_GLOBAL", configuration);
      vi.stubEnv("GIT_INDEX_FILE", path.join(f.root, "foreign-index"));
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "published" });
      expect(fs.existsSync(path.join(f.root, "foreign-index"))).toBe(false);
      expect(await f.git(f.remote, ["tag", "--list"])).toBe(`graider-migration-v1/${f.sha}`);
    });
    it("does not let a disconnected notification consumer change the published outcome", async () => {
      seams.synthetic = true;
      const f = await setup();
      const service = createMigrationPublicationService({
        ...f.deps,
        changed: () => {
          throw new Error("Renderer disconnected");
        }
      });
      expect(await service.publish(OWNER, f.request)).toMatchObject({ status: "published" });
    });
    it("invalidates a switched account during candidate validation", async () => {
      seams.synthetic = true;
      const f = await setup();
      let observations = 0;
      seams.beforeValidation = async () => {
        observations += 1;
        if (observations === 3) f.account();
      };
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      await unchanged(f);
    });
    it("rejects replacement of an identically renewed grader review", async () => {
      seams.synthetic = true;
      const f = await setup();
      let observations = 0;
      seams.beforeValidation = async () => {
        observations += 1;
        if (observations === 3) {
          const retained = await f.reviewService.getCompletedGraderHandoff(OWNER, f.request);
          expect(retained).not.toBeNull();
          await f.reviewService.completeGrader(OWNER, {
            ...f.request,
            submission: { inventoryId: retained!.access.inventoryId, decisions: [] }
          });
        }
      };
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      await unchanged(f);
    });
    it("refuses a source advance during isolated cloning", async () => {
      seams.synthetic = true;
      const f = await setup();
      let winner = "";
      f.onCommand(async (_cwd, args) => {
        if (args.includes("clone")) winner = await advance(f);
      });
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      expect(await f.git(f.remote, ["rev-parse", "main"])).toBe(winner);
      expect(
        f.commands.some((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toBe(false);
    });
    it("retains an executing review across window closure and releases it after outcome", async () => {
      seams.synthetic = true;
      const f = await setup();
      const release = f.reviewService.retain(OWNER);
      let closed = false;
      seams.beforeValidation = async () => {
        if (!closed) {
          closed = true;
          f.reviewService.close(OWNER);
        }
      };
      const phases: { phase: string; cancellable: boolean }[] = [];
      const result = await f.service.publish(OWNER, f.request, undefined, (phase, cancellable) => {
        phases.push({ phase, cancellable });
      });
      expect(result).toMatchObject({ status: "published" });
      expect(phases).toContainEqual({ phase: "publishing", cancellable: false });
      expect(phases).toContainEqual({ phase: "checkpointing", cancellable: true });
      release();
      await expect(f.reviewService.getCompleted(OWNER, f.request)).rejects.toThrow();
    });
    it("refuses a completed review with missing exact acknowledgement before creating a checkpoint", async () => {
      seams.synthetic = true;
      const f = await setup();
      const graders = await f.reviewService.getCompletedGraderHandoff(OWNER, f.request);
      await f.reviewService.completeGrader(OWNER, {
        ...f.request,
        submission: { inventoryId: graders!.access.inventoryId, decisions: [] }
      });
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      expect(await f.git(f.remote, ["tag", "--list"])).toBe("");
      await unchanged(f);
    });
    it("serializes competing same-course requests through remote acceptance", async () => {
      seams.synthetic = true;
      const f = await setup();
      const results = await Promise.all([
        f.service.publish(OWNER, f.request),
        f.service.publish(OWNER, f.request)
      ]);
      expect(results.map((result) => result.status)).toEqual(["published", "published"]);
      expect(
        f.commands.filter((args) => args.some((arg) => arg.startsWith("HEAD:refs/heads/")))
      ).toHaveLength(1);
    });
    it("requires attention for malformed publication state instead of publishing again", async () => {
      seams.synthetic = true;
      const f = await setup();
      const file = path.join(path.dirname(f.active), "migration-publication.json");
      fs.writeFileSync(
        file,
        JSON.stringify({ kind: "migration-publication-intent", version: 999 })
      );
      expect(await f.service.publish(OWNER, f.request)).toMatchObject({ status: "blocked" });
      await unchanged(f);
      expect(f.commands).toHaveLength(0);
    });
  }
);
