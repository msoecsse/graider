import type { GitHubClient } from "../github/github-client.js";
import { GitHubClientError } from "../github/github-errors.js";
import { loadCourseConfig, parseCourseConfig } from "../config/load-course-config.js";
import { validateCourseConfig } from "../config/config-validation.js";
import path from "node:path";

const REQUIREMENT_MESSAGES = {
  course_account_unverified:
    "The GitHub account could not be verified. Sign in and authorize course access.",
  course_account_mismatch:
    "The GitHub account differs from the account that started this operation. Sign in again.",
  course_repository_unavailable:
    "The course repository is unavailable or archived. Check repository access.",
  course_repository_mismatch:
    "The course origin or repository identity differs from the authorized course. Refresh course registration.",
  course_local_schema_invalid:
    "The local course configuration is invalid or requires a supported managed operation.",
  course_authoritative_schema_invalid:
    "The authoritative course configuration is invalid or requires a supported managed operation.",
  course_metadata_unavailable:
    "Authoritative course.yml is unavailable. Check repository configuration and access.",
  course_revision_unavailable:
    "The authoritative default-branch revision could not be verified. Retry synchronization.",
  course_revision_mismatch:
    "The local or requested course revision differs from GitHub. Synchronize the course and retry.",
  course_revision_changed:
    "The authoritative course revision changed during validation. Refresh the course and retry.",
  course_access_denied:
    "GitHub denied access while verifying the course. Check account authorization and repository permissions.",
  course_authorization_changed:
    "Current course or account authorization changed. Refresh the course and retry.",
  course_verification_unavailable:
    "GitHub course verification is unavailable. Check connectivity and API limits, then retry.",
  course_local_state_unavailable:
    "The local Git origin or revision could not be verified. Check course registration and repository safety.",
  course_repository_locator_mismatch:
    "Local legacy course identifiers differ from authoritative course.yml at the verified GitHub revision. Review course registration and configuration."
} as const;
export type LegacyCourseRequirement = keyof typeof REQUIREMENT_MESSAGES;

/** Fixed messages and codes only; API exceptions may contain credentials or headers. */
export class AuthoritativeLegacyCourseError extends GitHubClientError {
  override readonly diagnosticCode: LegacyCourseRequirement;
  constructor(code: LegacyCourseRequirement) {
    super(
      "permission_denied",
      `Course mutation unavailable: ${REQUIREMENT_MESSAGES[code]} No further mutation was started.`
    );
    this.diagnosticCode = code;
  }
}
export interface LegacyCourseExpectation {
  readonly userId: number;
  readonly repositoryId: number;
  readonly revision: string;
}
/** Production CLI safety boundary. Local Schema 1 is never compatibility evidence for the remote. */
interface LocalCourseState {
  readonly remoteUrl: string;
  readonly localRevision: string;
}
type LegacyCourseRequest = {
  readonly root: string;
  readonly client: GitHubClient;
  readonly expected?: LegacyCourseExpectation | undefined;
  /** Backend-only capability: a live main-process guard closure, never CLI/env/IPC assertions. */
  readonly managedAuthorization?: {
    readonly binding: LegacyCourseExpectation;
    readonly revalidate: () => Promise<void>;
  };
} & (
  | (LocalCourseState & { readonly readLocalState?: () => Promise<LocalCourseState> })
  | { readonly readLocalState: () => Promise<LocalCourseState> }
);
export const assertAuthoritativeLegacyCourse = async (
  request: LegacyCourseRequest
): Promise<LegacyCourseExpectation> => {
  const refuse = (code: LegacyCourseRequirement): never => {
    throw new AuthoritativeLegacyCourseError(code);
  };
  const expected = request.managedAuthorization?.binding ?? request.expected;
  await request.managedAuthorization?.revalidate();
  const readLocalState = async (): Promise<LocalCourseState> =>
    request.readLocalState
      ? request.readLocalState().catch(() => refuse("course_local_state_unavailable"))
      : "remoteUrl" in request
        ? request
        : refuse("course_local_state_unavailable");
  const localState = await readLocalState();
  const local = loadCourseConfig(path.join(request.root, "course.yml"));
  if (local.status !== "success" || local.value.schema_version !== 1)
    return refuse("course_local_schema_invalid");
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/u.exec(
      localState.remoteUrl
    );
  const owner = match?.[1];
  const name = match?.[2];
  if (!owner || !name || owner.toLowerCase() !== local.value.github.organization.toLowerCase())
    return refuse("course_repository_mismatch");
  const observe = async <T>(
    read: () => Promise<T>,
    unavailable: LegacyCourseRequirement
  ): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof GitHubClientError) {
        if (error.kind === "auth_missing" || error.kind === "auth_failed")
          return refuse("course_account_unverified");
        if (error.kind === "permission_denied") return refuse("course_access_denied");
        return refuse("course_verification_unavailable");
      }
      return refuse(unavailable);
    }
  };
  // These four reads are independent: file bytes are pinned to the local commit
  // and become evidence only after the fresh default-branch revision matches it.
  // Drain failures before leaving this boundary; retain deterministic diagnostics.
  const [accountRead, repositoryRead, revisionRead, contentRead] = await Promise.allSettled([
    observe(() => request.client.getAuthenticatedUser(), "course_account_unverified"),
    observe(() => request.client.getRepository(owner, name), "course_repository_unavailable"),
    observe(
      () => request.client.getDefaultBranchCommitSha(owner, name),
      "course_revision_unavailable"
    ),
    observe(
      () =>
        request.client.getRepositoryFileContent(
          owner,
          name,
          "course.yml",
          localState.localRevision
        ),
      "course_metadata_unavailable"
    )
  ]);
  const observed = <T>(result: PromiseSettledResult<T>): T => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  };
  const identity = observed(accountRead);
  if (typeof identity.id !== "number" || !Number.isSafeInteger(identity.id) || identity.id <= 0)
    return refuse("course_account_unverified");
  if (expected && identity.id !== expected.userId) return refuse("course_account_mismatch");
  const repository = observed(repositoryRead);
  if (
    !repository ||
    repository.archived ||
    !Number.isSafeInteger(repository.id) ||
    repository.id <= 0
  )
    return refuse("course_repository_unavailable");
  if (
    repository.owner.toLowerCase() !== owner.toLowerCase() ||
    repository.name.toLowerCase() !== name.toLowerCase() ||
    repository.fullName.toLowerCase() !== `${owner}/${name}`.toLowerCase()
  )
    return refuse("course_repository_mismatch");
  if (expected && repository.id !== expected.repositoryId)
    return refuse("course_repository_mismatch");
  const revision = observed(revisionRead);
  if (!revision) return refuse("course_revision_unavailable");
  if (revision !== localState.localRevision || (expected && revision !== expected.revision))
    return refuse("course_revision_mismatch");
  const bytes = observed(contentRead);
  if (bytes === null) return refuse("course_metadata_unavailable");
  const authoritative = parseCourseConfig(bytes, "authoritative course.yml");
  if (
    authoritative.status !== "success" ||
    authoritative.value.schema_version !== 1 ||
    validateCourseConfig("authoritative course.yml", authoritative.value).length
  )
    return refuse("course_authoritative_schema_invalid");
  if (authoritative.value.github.organization.toLowerCase() !== owner.toLowerCase())
    return refuse("course_repository_mismatch");
  // Schema 1 identifiers are course metadata, not a physical repository locator.
  // Origin resolution, stable ID binding, pinned remote metadata and fresh HEAD
  // establish authority independently of legacy naming conventions.
  if (
    !request.managedAuthorization &&
    (authoritative.value.course.repository !== local.value.course.repository ||
      authoritative.value.course.code !== local.value.course.code)
  )
    return refuse("course_repository_locator_mismatch");
  if (
    (await observe(
      () => request.client.getDefaultBranchCommitSha(owner, name),
      "course_revision_unavailable"
    )) !== revision
  )
    return refuse("course_revision_changed");
  if (
    (await observe(() => request.client.getAuthenticatedUser(), "course_account_unverified")).id !==
    identity.id
  )
    return refuse("course_account_mismatch");
  await request.managedAuthorization?.revalidate();
  const finalLocalState = await readLocalState();
  if (finalLocalState.remoteUrl !== localState.remoteUrl)
    return refuse("course_repository_mismatch");
  if (finalLocalState.localRevision !== localState.localRevision)
    return refuse("course_revision_mismatch");
  return { userId: identity.id, repositoryId: repository.id, revision };
};

let productionBoundary: (() => Promise<void>) | undefined;
/** Installed only by the CLI after fresh remote validation, never from serialized support assertions. */
export const beginAuthoritativeLegacyCliMutation = async (
  request: LegacyCourseRequest
): Promise<void> => {
  productionBoundary = undefined;
  const binding = await assertAuthoritativeLegacyCourse(request);
  productionBoundary = async () => {
    await assertAuthoritativeLegacyCourse({ ...request, expected: binding });
  };
};
export const endAuthoritativeLegacyCliMutation = (): void => {
  productionBoundary = undefined;
};

export const GITHUB_MUTATION_METHODS: readonly (keyof GitHubClient)[] = Object.freeze([
  "createRepositoryFromTemplate",
  "createRepository",
  "addCollaborator",
  "removeCollaborator",
  "addTeamPermission",
  "enableActions",
  "conditionalWriteRepositoryFile",
  "dispatchWorkflow",
  "archiveRepository",
  "writeRepositoryFile",
  "createPullRequest",
  "deleteRepositoryBranch",
  "createOrganizationInvitation",
  "createManagedTeam",
  "setManagedTeamMembership",
  "setCourseRepositoryTeamPermission",
  "setCourseFallbackPermission",
  "createManagedBranchRule",
  "tightenManagedBranchRule",
  "setCourseRepositoryTopic"
]);
/** Every production GitHub write re-observes the exact source and account, including after planning awaits. */
export const guardProductionLegacyClient = (client: GitHubClient): GitHubClient => {
  const boundary = productionBoundary;
  if (!boundary) return client;
  return new Proxy(client, {
    get(target, key) {
      const method = target[key as keyof GitHubClient];
      if (typeof method !== "function") return method;
      return GITHUB_MUTATION_METHODS.includes(key as keyof GitHubClient)
        ? async (...args: unknown[]) => {
            await boundary();
            const result: unknown = await Reflect.apply(method, target, args);
            return result;
          }
        : method.bind(target);
    }
  });
};
