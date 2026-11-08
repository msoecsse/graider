import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type * as Backend from "../dist-electron/managedOperationBackend.cjs";
import {
  provideGithubClient,
  type GitHubClient,
  type GithubClientProvider
} from "./githubClientProvider.js";
import {
  createRemoteRepositoryReader,
  type RemoteRepositoryReader
} from "./githubRemoteRepositories.js";
import type { GithubOAuthSession, AuthenticatedAccountOperation } from "./githubOAuthSession.js";
import { publishManagedCourseTransaction } from "./managedCourseTransaction.js";
import {
  accountRoot,
  managedCoursePath,
  safeDirectories,
  serializeManagedOperation
} from "./managedCourses.js";
import type {
  AuthenticatedGitWorkspaceContext,
  GitWorkspaceFactory
} from "./gitWorkspaceReader.js";
import type {
  NewRemoteCourseRequest,
  RemoteCourseSetupPreview,
  RemoteCourseSetupResult,
  VerifiedSetupFaculty
} from "./remoteCourseSetupTypes.js";

const loadBackend = (): typeof Backend =>
  require(
    path.join(
      __dirname,
      path.basename(__dirname) === "electron" ? "../dist-electron" : "",
      "managedOperationBackend.cjs"
    )
  );
const REQUIRED_SETUP_METHODS = [
  "getOrganizationMembership",
  "getCourseRepositoryById",
  "getCourseRepository",
  "getCourseMetadataPath",
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
  "tightenManagedBranchRule",
  "setCourseRepositoryTopic"
] as const satisfies readonly (keyof GitHubClient)[];
const SETUP_JOURNAL_SCHEMA_VERSION = 1;
const MAX_SETUP_JOURNAL_BYTES = 512 * 1024;

/** Durable write-intent keys for the existing reconcilers. No credentials or role assertions. */
const setupJournal = (userData: string, userId: number, repositoryId: number) => {
  const directory = path.join(accountRoot(userData, userId), String(repositoryId));
  safeDirectories(userData, directory, true);
  const file = path.join(directory, "setup-journal.json");
  const read = (): Set<string> => {
    if (!fs.existsSync(file)) return new Set();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_SETUP_JOURNAL_BYTES)
      throw new Error("Setup journal requires attention.");
    const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid setup journal.");
    const record = value as Record<string, unknown>;
    if (
      record.schemaVersion !== SETUP_JOURNAL_SCHEMA_VERSION ||
      record.userId !== userId ||
      record.repositoryId !== repositoryId ||
      Object.keys(record).some(
        (key) => !["schemaVersion", "userId", "repositoryId", "keys"].includes(key)
      ) ||
      !Array.isArray(record.keys) ||
      record.keys.some((entry) => typeof entry !== "string")
    )
      throw new Error("Invalid setup journal.");
    return new Set(record.keys as string[]);
  };
  const save = (keys: Set<string>) => {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const descriptor = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(
        descriptor,
        JSON.stringify({
          schemaVersion: SETUP_JOURNAL_SCHEMA_VERSION,
          userId,
          repositoryId,
          keys: [...keys]
        })
      );
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, file);
  };
  return {
    has: (key: string) => read().has(key),
    add: (key: string) => {
      const keys = read();
      keys.add(key);
      save(keys);
    },
    delete: (key: string) => {
      const keys = read();
      keys.delete(key);
      save(keys);
    }
  };
};

interface Dependencies {
  readonly userData: string;
  readonly session: GithubOAuthSession;
  readonly provideClient?: GithubClientProvider;
  readonly reader?: (token: string, signal: AbortSignal) => RemoteRepositoryReader;
  readonly factory?: GitWorkspaceFactory;
  readonly authenticate?: (token: string) => AuthenticatedGitWorkspaceContext;
}
interface Review {
  readonly request: NewRemoteCourseRequest;
  readonly userId: number;
  readonly generation: number;
  readonly organizationId: number;
  readonly preview: RemoteCourseSetupPreview;
}
export class RemoteCourseSetupService {
  private readonly reviews = new Map<number, Review>();
  private readonly busy = new Set<number>();
  constructor(private readonly deps: Dependencies) {}
  close(owner: number): void {
    this.reviews.delete(owner);
  }
  private client(input: AuthenticatedAccountOperation): GitHubClient {
    const client = (this.deps.provideClient ?? provideGithubClient)(input.token);
    if (
      REQUIRED_SETUP_METHODS.some(
        (method) => typeof client[method as keyof GitHubClient] !== "function"
      )
    )
      throw new Error("This client cannot complete remote course setup. Update Graider.");
    return client;
  }
  private async verify(input: AuthenticatedAccountOperation, request: NewRemoteCourseRequest) {
    const client = this.client(input);
    const active = async () => {
      if (!(await input.revalidateSession()) || input.signal.aborted)
        throw new Error("Account authorization changed.");
    };
    await active();
    const creatorAccount = await client.getAuthenticatedUser({ signal: input.signal });
    if (creatorAccount.id !== input.userId) throw new Error("Creator identity changed.");
    const membership = await client.getOrganizationMembership!(request.organization, input.signal);
    const member = membership.data as {
      state?: unknown;
      role?: unknown;
      organization?: { id?: unknown; login?: unknown };
    };
    if (
      membership.status !== 200 ||
      member.state !== "active" ||
      member.role !== "admin" ||
      !Number.isSafeInteger(member.organization?.id) ||
      Number(member.organization?.id) <= 0 ||
      typeof member.organization?.login !== "string" ||
      member.organization.login.toLowerCase() !== request.organization.toLowerCase()
    )
      throw new Error(
        "Setup requires verified organization owner privileges to create repositories, teams and permissions."
      );
    const verifyFaculty = async (selection: {
      institutionalUsername: string;
      githubLogin: string;
    }): Promise<VerifiedSetupFaculty> => {
      const account = await client.getUser(selection.githubLogin);
      await active();
      if (
        !account ||
        !Number.isSafeInteger(account.id) ||
        Number(account.id) <= 0 ||
        account.username.toLowerCase() !== selection.githubLogin.toLowerCase()
      )
        throw new Error(
          "A selected GitHub account could not be independently verified. Refresh the selection."
        );
      return {
        institutionalUsername: selection.institutionalUsername,
        githubUserId: account.id!,
        githubLogin: account.username
      };
    };
    const creator = await verifyFaculty({
      institutionalUsername: request.creatorInstitutionalUsername,
      githubLogin: creatorAccount.username
    });
    if (creator.githubUserId !== input.userId) throw new Error("Creator identity changed.");
    const coordinators: VerifiedSetupFaculty[] = [];
    for (const selection of request.coordinators) coordinators.push(await verifyFaculty(selection));
    const sections: RemoteCourseSetupPreview["sections"][number][] = [];
    for (const section of request.sections) {
      const faculty: VerifiedSetupFaculty[] = [];
      for (const selection of section.faculty) faculty.push(await verifyFaculty(selection));
      if (new Set(faculty.map((person) => person.githubUserId)).size !== faculty.length)
        throw new Error("Duplicate section faculty selection.");
      sections.push({ id: section.id, faculty });
    }
    loadBackend().validateSetupDirectory([
      creator,
      ...coordinators,
      ...sections.flatMap((section) => section.faculty)
    ]);
    if (
      new Set(coordinators.map((person) => person.githubUserId)).size !== coordinators.length ||
      new Set(sections.map((section) => section.id)).size !== sections.length
    )
      throw new Error("Coordinator and section selections must be unique.");
    await active();
    return { creator, coordinators, sections, organizationId: Number(member.organization!.id) };
  }
  async preview(owner: number, value: unknown): Promise<RemoteCourseSetupPreview> {
    if (this.busy.has(owner)) throw new Error("Course creation is already running.");
    this.close(owner);
    const request = loadBackend().newRemoteCourseRequestSchema.parse(value);
    return this.deps.session.withAuthenticatedAccount(async (input) => {
      const verified = await this.verify(input, request);
      const reader = (this.deps.reader ?? createRemoteRepositoryReader)(input.token, input.signal);
      if (await reader.resolve(request.organization, request.repositoryName))
        throw new Error(
          "That repository already exists. Choose a new private course repository name."
        );
      if (!(await input.revalidateSession())) throw new Error("Account changed.");
      const { organizationId, ...faculty } = verified;
      const preview = { ...faculty, previewId: randomUUID() };
      this.reviews.set(owner, {
        request,
        preview,
        organizationId,
        userId: input.userId,
        generation: this.deps.session.mutationGeneration
      });
      return structuredClone(preview);
    });
  }
  async create(
    owner: number,
    previewId: unknown,
    confirmed: unknown
  ): Promise<RemoteCourseSetupResult> {
    const review = this.reviews.get(owner);
    if (
      !review ||
      review.preview.previewId !== previewId ||
      confirmed !== true ||
      this.busy.has(owner)
    )
      throw new Error("Review and confirm the current remote setup first.");
    this.close(owner);
    this.busy.add(owner);
    try {
      return await this.deps.session.withAuthenticatedAccount(async (input) => {
        if (
          input.userId !== review.userId ||
          this.deps.session.mutationGeneration !== review.generation
        )
          throw new Error("Account changed. Review setup again.");
        const verified = await this.verify(input, review.request);
        const { organizationId, ...faculty } = verified;
        const { previewId: _id, ...reviewedFaculty } = review.preview;
        if (
          organizationId !== review.organizationId ||
          JSON.stringify(faculty) !== JSON.stringify(reviewedFaculty)
        )
          throw new Error("Verified identities changed. Review setup again.");
        const client = this.client(input);
        const reader = (this.deps.reader ?? createRemoteRepositoryReader)(
          input.token,
          input.signal
        );
        if (await reader.resolve(review.request.organization, review.request.repositoryName))
          throw new Error("Repository now exists. Setup will not overwrite it.");
        if (!(await input.revalidateSession())) throw new Error("Account authorization changed.");
        const created = await client.createRepository({
          owner: review.request.organization,
          name: review.request.repositoryName,
          private: true,
          autoInitialize: true,
          description: review.request.courseTitle
        });
        let revision: string | undefined;
        const attention = (): RemoteCourseSetupResult => ({
          status: "created_needs_attention",
          repositoryId: created.id,
          repositoryUrl: `https://github.com/${review.request.organization}/${review.request.repositoryName}`,
          revision,
          message:
            "The private repository was created. Setup needs attention; refresh courses and inspect it before any retry. No student repositories were created or changed."
        });
        try {
          const repo = await reader.resolveId(created.id);
          if (
            !repo ||
            repo.organizationId !== organizationId ||
            repo.visibility !== "private" ||
            repo.disabled ||
            repo.archived
          )
            return attention();
          const initialRevision = await reader.revision(repo);
          const backend = loadBackend();
          const metadata = backend.buildNewCourseMetadata(
            review.request as Parameters<typeof backend.buildNewCourseMetadata>[0],
            {
              repositoryId: repo.id,
              repositoryName: repo.name,
              organizationId,
              organizationLogin: repo.owner,
              creator: verified.creator,
              coordinators: verified.coordinators,
              sectionFaculty: Object.fromEntries(
                verified.sections.map((section) => [section.id, section.faculty])
              )
            }
          );
          const course = {
            repositoryId: repo.id,
            organizationId,
            organizationLogin: repo.owner,
            name: repo.name,
            nodeId: repo.nodeId,
            fullName: repo.fullName,
            url: repo.url,
            defaultBranch: repo.defaultBranch,
            visibility: repo.visibility,
            archived: false,
            code: review.request.courseCode,
            title: review.request.courseTitle,
            schemaVersion: 2,
            discoveryHints: [],
            authorization: "authorized" as const,
            localStatus: "remote_only" as const,
            localFolderIds: [],
            diagnostics: []
          };
          let expected = initialRevision;
          const revalidate = async () => {
            if (!(await input.revalidateSession()) || input.signal.aborted)
              throw new Error("Account changed.");
            const current = await reader.resolveId(repo.id);
            if (
              !current ||
              current.organizationId !== organizationId ||
              current.visibility !== "private" ||
              current.disabled ||
              current.archived ||
              current.defaultBranch !== repo.defaultBranch ||
              (await reader.revision(current)) !== expected
            )
              throw new Error("Authoritative setup source changed.");
          };
          return await serializeManagedOperation({ ...input, course }, async () => {
            await revalidate();
            const result = await publishManagedCourseTransaction({
              userData: this.deps.userData,
              input: { ...input, course },
              context: {
                managed: true,
                userId: input.userId,
                repositoryId: repo.id,
                authoritativeCommit: initialRevision,
                operationalCommit: initialRevision,
                courseFolderId: `managed-course:${input.userId}:${repo.id}`,
                courseFolderPath: managedCoursePath(this.deps.userData, input.userId, repo.id),
                mode: "new_mutation"
              },
              expectedRevision: initialRevision,
              revalidateRepository: revalidate,
              author: {
                name: verified.creator.githubLogin,
                email: `${input.userId}+${verified.creator.githubLogin}@users.noreply.github.com`
              },
              allows: (file) => metadata.files.some((candidate) => candidate.path === file),
              validateMetadata: (root) => {
                backend.readManagedOperationState(root, {
                  organization: repo.owner,
                  organizationId,
                  repositoryId: repo.id,
                  userId: input.userId
                });
              },
              mutate: async (root) => {
                await revalidate();
                if (
                  ["course.yml", "terms", ".graider"].some((file) =>
                    fs.existsSync(path.join(root, file))
                  )
                )
                  throw new Error("Setup source is no longer empty.");
                for (const file of metadata.files) {
                  fs.mkdirSync(path.dirname(path.join(root, file.path)), { recursive: true });
                  fs.writeFileSync(path.join(root, file.path), file.content, { flag: "wx" });
                }
                return { status: "success" as const };
              },
              changed: () => {},
              factory: this.deps.factory,
              authenticate: this.deps.authenticate
            });
            const publication = (result as typeof result & { publication?: { commit: string } })
              .publication;
            if (!publication) return attention();
            revision = publication.commit;
            expected = revision;
            await revalidate();
            const guarded = new Proxy(client, {
              get(target, key) {
                const method = target[key as keyof GitHubClient];
                return typeof method !== "function"
                  ? method
                  : async (...args: unknown[]) => {
                      await revalidate();
                      const response = await Reflect.apply(method, target, args);
                      await revalidate();
                      return response;
                    };
              }
            }) as Required<GitHubClient>;
            const journal = setupJournal(this.deps.userData, input.userId, repo.id);
            // This is a newly created exact-source Draft: no assignment or student target exists.
            const reconciliationInput = {
              course: metadata.course,
              terms: [metadata.term],
              activeTermCode: null,
              courseRepositoryId: repo.id,
              organizationId,
              authenticatedUserId: input.userId,
              studentTargets: [],
              client: guarded,
              invitationJournal: journal,
              teamCreationJournal: journal
            };
            const reconciled = await backend.reconcileCourseTermLifecycle(
              reconciliationInput,
              input.signal
            );
            const branches = await new backend.ManagedBranchReconciler(
              guarded,
              reconciliationInput,
              journal
            ).reconcile(input.signal);
            await guarded.setCourseRepositoryTopic(repo.owner, repo.name);
            await revalidate();
            const complete =
              reconciled.status === "reconciled" &&
              branches.every((branch) => branch.status !== "needs_attention");
            return {
              status: complete ? "created" : "created_needs_attention",
              repositoryId: repo.id,
              repositoryUrl: repo.url,
              revision,
              message: complete
                ? "Schema 2 course created with an initial Draft term. Refresh courses to synchronize. Activation and student-facing operations require their separate trusted readiness evidence."
                : "Course metadata was published, but GitHub invitations, teams, permissions or branch policy need attention. Refresh courses and inspect the repository; do not retry course creation. Student-facing operations remain unavailable."
            };
          });
        } catch {
          return attention();
        }
      });
    } finally {
      this.busy.delete(owner);
    }
  }
}
