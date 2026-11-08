import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type * as Backend from "../dist-electron/migrationReconciliationBackend.cjs";
import type { GithubOAuthSession, ManagedOperationInput } from "./githubOAuthSession.js";
import { provideGithubClient, type GithubClientProvider } from "./githubClientProvider.js";
import {
  createRemoteRepositoryReader,
  type RemoteRepositoryReader
} from "./githubRemoteRepositories.js";
import { managedCoursePath } from "./managedCourses.js";
import {
  publishManagedCourseTransaction,
  observeManagedCoursePublication
} from "./managedCourseTransaction.js";
import type {
  AuthenticatedGitWorkspaceContext,
  GitWorkspaceFactory
} from "./gitWorkspaceReader.js";

export const loadMigrationReconciliationBackend = (): typeof Backend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "migrationReconciliationBackend.cjs"
    )
  );
interface StoreDependencies {
  readonly userData: string;
  readonly input: ManagedOperationInput;
  readonly reader: RemoteRepositoryReader;
  readonly client: Pick<
    Backend.ReconciliationClient,
    "getOrganizationScopeResponse" | "getOrganizationMembership" | "getCourseRepositoryById"
  >;
  readonly factory?: GitWorkspaceFactory;
  readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
  readonly withCheckpointWorkspace?: typeof Backend.withMigrationCheckpointWorkspace;
  readonly changed?: () => void;
}

/** Main-only store. The synchronized account/course lease is held by its caller throughout. */
export const createMigrationReconciliationStore = (
  deps: StoreDependencies
): Backend.ReconciliationStore & {
  inspectHistory(): Promise<Backend.MigrationHistorySnapshot>;
  assertHistoryCurrent(snapshot: Backend.MigrationHistorySnapshot): Promise<void>;
  freshPlan(): Promise<Backend.ReconciliationSnapshot>;
} => {
  const b = loadMigrationReconciliationBackend();
  const input = deps.input;
  const factory =
    deps.factory ??
    (new b.GitCommandWorkspaceFactory(
      b.createMigrationGitRunners()
    ) as unknown as GitWorkspaceFactory);
  const authenticate =
    deps.authenticate ??
    ((token: string) =>
      b.createAuthenticatedMigrationGitWorkspace(
        token
      ) as unknown as AuthenticatedGitWorkspaceContext);
  let current: Backend.ReconciliationSnapshot | undefined;
  let executionCurrent = false;
  const remote = async (expectedRevision?: string) => {
    input.signal.throwIfAborted();
    if (!(await input.revalidateSession()))
      throw new b.ReconciliationNeedsAttention("authorization_required");
    const permission = await b.resolvePermissionRepository(
      deps.client,
      { organizationId: input.course.organizationId, authenticatedUserId: input.userId },
      input.course.repositoryId,
      input.signal
    );
    const repository = await deps.reader.resolveId(input.course.repositoryId);
    if (
      !repository ||
      repository.id !== permission.id ||
      repository.organizationId !== permission.organizationId ||
      repository.visibility !== "private" ||
      repository.archived ||
      repository.disabled ||
      repository.defaultBranch !== input.course.defaultBranch ||
      repository.url !== input.course.url ||
      repository.owner !== permission.owner ||
      repository.name !== permission.name
    )
      throw new Error("Course repository identity or privilege changed.");
    const revision = await deps.reader.revision(repository);
    if ((expectedRevision && revision !== expectedRevision) || !(await input.revalidateSession()))
      throw new b.ReconciliationNeedsAttention("journal_revision_changed");
    return { repository, revision };
  };
  const assertCurrent = async (snapshot: Backend.ReconciliationSnapshot) => {
    if (
      snapshot !== current ||
      snapshot.course.course.repository_id !== input.course.repositoryId ||
      snapshot.course.course.organization_binding?.organization_id !==
        input.course.organizationId ||
      !b.canRecoverMigration(snapshot.course, snapshot.terms, input.userId)
    )
      throw new b.ReconciliationNeedsAttention("authorization_required");
    await remote(snapshot.revision);
  };
  const observeHistory = async () => {
    current = undefined;
    executionCurrent = false;
    const before = await remote();
    let observed: Backend.MigrationHistorySnapshot | undefined;
    const result = await observeManagedCoursePublication({
      userData: deps.userData,
      input,
      factory,
      authenticate,
      verifyCommit: async (root, revision) => {
        if (revision !== before.revision) throw new Error("Source advanced during observation.");
        observed = await b.readMigrationHistorySnapshot(root, revision);
        return true;
      }
    });
    if (!result.accepted || !observed) throw new Error("Published migration is unverified.");
    current = observed;
    await assertCurrent(observed);
    const source = b.createExactCommitRevision(observed.source);
    const url = b.createTrustedGitRemote(`${before.repository.url}.git`);
    if (!source || !url) throw new Error("Invalid checkpoint binding.");
    const checkpoint = await (deps.withCheckpointWorkspace ?? b.withMigrationCheckpointWorkspace)(
      url,
      input.token,
      (workspace, authentication) =>
        b.verifyMigrationCheckpoint(
          workspace,
          { remote: url, sourceCommit: source, authentication },
          () => assertCurrent(observed!),
          { create: false }
        )
    );
    if (checkpoint.status !== "verified" || checkpoint.reference !== observed.checkpoint)
      throw new b.ReconciliationNeedsAttention("checkpoint_unverified");
    await assertCurrent(observed);
    executionCurrent = observed.executionState === "current_plan";
    return observed;
  };
  const observe = async () => {
    const observed = await observeHistory();
    if (!executionCurrent) throw new b.ReconciliationNeedsAttention("fresh_plan_required");
    return observed;
  };
  const publish = async (
    expectedRevision: string,
    value: Backend.ReconciliationRecord,
    fresh = false
  ): Promise<Backend.ReconciliationSnapshot> => {
    if (!current || current.revision !== expectedRevision)
      throw new Error("Stale reconciliation journal request.");
    if (!fresh && !executionCurrent)
      throw new b.ReconciliationNeedsAttention("fresh_plan_required");
    const prior = current;
    await assertCurrent(prior);
    const record = b.reconciliationRecordSchema.parse(value);
    if (fresh) {
      const expected = b.createFreshReconciliationRecord(
        { ...prior, executionState: executionCurrent ? "current_plan" : "fresh_plan_required" },
        input.userId
      );
      if (b.stableJson({ ...record, writeId: expected.writeId }) !== b.stableJson(expected))
        throw new Error("Invalid fresh plan request.");
    } else if (b.stableJson(record.plan) !== b.stableJson(prior.record?.plan)) {
      throw new Error("A fresh plan requires an explicit invocation.");
    }
    b.validateReconciliationRecord({ ...prior, record });
    if (
      b.stableJson(record.history.slice(0, prior.record?.history.length ?? 0)) !==
      b.stableJson(prior.record?.history ?? [])
    )
      throw new Error("Permanent audit cannot be replaced.");
    const context = {
      managed: true as const,
      userId: input.userId,
      repositoryId: input.course.repositoryId,
      authoritativeCommit: expectedRevision,
      operationalCommit: expectedRevision,
      courseFolderId: `managed-course:${input.userId}:${input.course.repositoryId}`,
      courseFolderPath: managedCoursePath(deps.userData, input.userId, input.course.repositoryId),
      mode: "new_mutation" as const
    };
    let commit: string | undefined;
    try {
      const result = await publishManagedCourseTransaction({
        userData: deps.userData,
        context,
        input,
        expectedRevision,
        factory,
        authenticate,
        revalidateRepository: () => assertCurrent(prior),
        author: {
          name: `faculty-${input.userId}`,
          email: `${input.userId}+faculty@users.noreply.github.com`
        },
        allows: (file) => file === b.RECONCILIATION_PATH,
        validateChangedPaths: (paths) => {
          if (paths.length !== 1 || paths[0] !== b.RECONCILIATION_PATH)
            throw new Error("Unexpected journal transaction paths.");
        },
        validateMetadata: (root) => b.validateReconciliationWorkspace(root, prior, record),
        mutate: async (root) => {
          await assertCurrent(prior);
          const file = path.join(root, b.RECONCILIATION_PATH);
          const existing = fs.existsSync(file)
            ? b.reconciliationRecordSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
            : null;
          if (b.stableJson(existing) !== b.stableJson(prior.record))
            throw new Error("Journal changed before editing.");
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, `${b.stableJson(record)}\n`);
          return { status: "success" as const };
        },
        changed: deps.changed ?? (() => {}),
        publication: {
          beforeStage: async (root) => {
            await assertCurrent(prior);
            b.validateReconciliationWorkspace(root, prior, record);
          },
          beforePush: async () => assertCurrent(prior),
          verifyAcceptance: true
        }
      });
      commit = (result as typeof result & { publication?: { commit: string } }).publication?.commit;
    } catch {
      // An accepted-but-lost journal response is resolved by fresh shared history, never a second push.
      const observed = await observe();
      if (observed.record?.writeId !== record.writeId)
        throw new b.ReconciliationNeedsAttention("journal_outcome_unknown");
      return observed;
    }
    if (!commit) throw new b.ReconciliationNeedsAttention("journal_outcome_unknown");
    const refreshed = await remote(commit);
    const bytes = await deps.reader.file(refreshed.repository, b.RECONCILIATION_PATH, commit);
    if (
      !bytes ||
      b.stableJson(b.reconciliationRecordSchema.parse(JSON.parse(bytes))) !== b.stableJson(record)
    )
      throw new b.ReconciliationNeedsAttention("journal_outcome_unknown");
    current = { ...prior, revision: commit, record };
    executionCurrent = true;
    await assertCurrent(current);
    return current;
  };
  return {
    observe,
    inspectHistory: observeHistory,
    assertHistoryCurrent: assertCurrent,
    assertCurrent: async (snapshot) => {
      if (!executionCurrent) throw new b.ReconciliationNeedsAttention("fresh_plan_required");
      await assertCurrent(snapshot);
    },
    publish: (revision, record) => publish(revision, record),
    freshPlan: async () => {
      const observed = await observeHistory();
      const record = b.createFreshReconciliationRecord(observed, input.userId);
      // Unique winning write ID is separate from historical reviewer/session identities.
      record.writeId = randomUUID();
      return publish(observed.revision, record, true);
    }
  };
};

interface Dependencies {
  readonly userData: string;
  readonly session: Pick<GithubOAuthSession, "withSynchronizedCourse">;
  readonly provideClient?: GithubClientProvider;
  readonly reader?: (token: string, signal: AbortSignal) => RemoteRepositoryReader;
  readonly factory?: GitWorkspaceFactory;
  readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
  readonly withCheckpointWorkspace?: typeof Backend.withMigrationCheckpointWorkspace;
  readonly changed?: () => void;
}
/** Called inside an existing trusted course lease; never acquires a nested lease or writes a journal. */
export const verifyCurrentMigrationAccess = async (
  deps: Omit<Dependencies, "session"> & { readonly input: ManagedOperationInput }
): Promise<boolean> => {
  try {
    const b = loadMigrationReconciliationBackend();
    const client = (deps.provideClient ?? provideGithubClient)(
      deps.input.token
    ) as Backend.ReconciliationClient;
    const store = createMigrationReconciliationStore({
      ...deps,
      client,
      reader: (deps.reader ?? createRemoteRepositoryReader)(deps.input.token, deps.input.signal)
    });
    return (
      (
        await b.verifyPublishedMigrationAccess(
          { store, client, authenticatedUserId: deps.input.userId },
          deps.input.signal
        )
      ).status === "ready"
    );
  } catch {
    return false;
  }
};
/** Capability only; #25 owns production controls and IPC. No new-course bootstrap is used. */
export const createMigrationReconciliationService = (deps: Dependencies) => ({
  /** Permanent audit remains available after Ready, restart and synchronization. No mutation or retry. */
  async inspect(userId: number, repositoryId: number) {
    return deps.session.withSynchronizedCourse(repositoryId, userId, async (input) => {
      if (input.userId !== userId || input.course.repositoryId !== repositoryId)
        throw new Error("Course/account binding changed.");
      const client = (deps.provideClient ?? provideGithubClient)(input.token);
      if (
        !client.getOrganizationScopeResponse ||
        !client.getOrganizationMembership ||
        !client.getCourseRepositoryById
      )
        throw new Error("Current recovery inspection is unavailable.");
      const store = createMigrationReconciliationStore({
        ...deps,
        input,
        client: {
          getOrganizationScopeResponse: client.getOrganizationScopeResponse.bind(client),
          getOrganizationMembership: client.getOrganizationMembership.bind(client),
          getCourseRepositoryById: client.getCourseRepositoryById.bind(client)
        },
        reader: (deps.reader ?? createRemoteRepositoryReader)(input.token, input.signal)
      });
      const observed = await store.inspectHistory();
      const currentAccess = (await verifyCurrentMigrationAccess({ ...deps, input }))
        ? ("ready" as const)
        : ("needs_attention" as const);
      await store.assertHistoryCurrent(observed);
      return {
        migrationDate: observed.publicationDate ?? null,
        reviewedAuthority: observed.reviewedAuthority ?? null,
        currentAccess,
        source: observed.source,
        checkpoint: observed.checkpoint,
        publication: observed.publication,
        journalRevision: observed.revision,
        executionState: observed.executionState,
        operationalReadiness: "unverified" as const,
        reviewedIdentity: observed.metadata.source.authenticated_github_user_id,
        review: observed.metadata.audit.review,
        reviewedRoles: observed.metadata.recovery?.legacy.facultyTerms ?? [],
        findings: observed.metadata.findings,
        deferredWork: observed.metadata.deferred_work,
        evidence: observed.metadata.evidence,
        reconciliation: observed.record
      };
    });
  },
  async reconcile(
    userId: number,
    repositoryId: number,
    request?: { readonly freshPlan: true }
  ): Promise<Backend.MigrationReconciliationResult> {
    try {
      return await deps.session.withSynchronizedCourse(repositoryId, userId, async (input) => {
        if (input.userId !== userId || input.course.repositoryId !== repositoryId)
          throw new Error("Course/account binding changed.");
        const b = loadMigrationReconciliationBackend();
        const client = (deps.provideClient ?? provideGithubClient)(input.token);
        const methods = [
          "getOrganizationScopeResponse",
          "getOrganizationMembership",
          "getCourseRepositoryById",
          "getUser",
          "listOrganizationMembersPage",
          "listPendingOrganizationInvitationsPage",
          "createOrganizationInvitation",
          "listManagedOrganizationTeamsPage",
          "getManagedTeam",
          "createManagedTeam",
          "listManagedTeamMembersPage",
          "setManagedTeamMembership",
          "listCourseRepositoryTeamsPage",
          "setCourseRepositoryTeamPermission",
          "getCourseFallbackPermissionPage",
          "setCourseFallbackPermission",
          "getManagedBranchRulesPage",
          "getManagedBranchProtection",
          "listManagedBranchRulesetsPage",
          "listManagedEffectiveBranchRulesPage",
          "createManagedBranchRule",
          "tightenManagedBranchRule"
        ] as const;
        if (methods.some((method) => typeof client[method] !== "function"))
          throw new Error("Reconciliation capabilities are unavailable.");
        const backendClient = client as Backend.ReconciliationClient;
        const store = createMigrationReconciliationStore({
          ...deps,
          input,
          client: backendClient,
          reader: (deps.reader ?? createRemoteRepositoryReader)(input.token, input.signal)
        });
        if (request?.freshPlan) await store.freshPlan();
        return b.reconcilePublishedMigration(
          { store, client: backendClient, authenticatedUserId: input.userId },
          input.signal
        );
      });
    } catch {
      return {
        published: null,
        status: "needs_attention",
        studentFacingReady: false,
        attention: ["reconciliation_context_unverified"]
      };
    }
  }
});
