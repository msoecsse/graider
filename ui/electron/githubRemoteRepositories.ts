import {
  provideGithubClient,
  type GithubClientProvider,
  type GitHubClient
} from "./githubClientProvider.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";

const PAGE_SIZE = 100;
const SEARCH_RESULT_LIMIT = 1000;
const TIMEOUT_MS = 30_000;
const MAX_METADATA_BYTES = 512 * 1024;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_RATE_LIMIT = 429;
const HTTP_SERVER_ERROR = 500;
export interface CourseRepository {
  readonly id: number;
  readonly nodeId: string | null;
  readonly organizationId: number;
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly url: string;
  readonly defaultBranch: string;
  readonly visibility: "private" | "public" | "internal";
  readonly archived: boolean;
  readonly disabled: boolean;
  readonly topics: readonly string[];
}
export const REPOSITORY_FAILURE_MESSAGES = {
  invalid_credential: "GitHub sign-in could not be verified. Sign in again.",
  insufficient_scope: "Authorize course access to read private course metadata.",
  oauth_approval_required: "An organization owner must approve Graider course access.",
  sso_required: "Authorize Graider for your organization SSO session.",
  repository_inaccessible: "Course metadata is inaccessible or the repository disappeared.",
  rate_limited: "GitHub is limiting course discovery requests. Wait and refresh courses.",
  network_unavailable: "Course discovery temporarily unavailable. Your sign-in is preserved.",
  error: "GitHub returned an unexpected course metadata response. Refresh courses."
};
type Failure = keyof typeof REPOSITORY_FAILURE_MESSAGES;
const fail = (code: Failure): never => {
  throw new GithubOAuthError(code, REPOSITORY_FAILURE_MESSAGES[code]);
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("error");
  return value as Record<string, unknown>;
};
const positiveId = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return fail("error");
  return value;
};
const segment = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9._-]+$/.test(value) ||
    value === "." ||
    value === ".."
  )
    return fail("error");
  return value;
};
const normalize = (value: unknown): CourseRepository => {
  const repo = object(value);
  const owner = object(repo.owner);
  const login = segment(owner.login);
  const name = segment(repo.name);
  if (
    typeof repo.default_branch !== "string" ||
    !repo.default_branch ||
    typeof repo.archived !== "boolean" ||
    typeof repo.disabled !== "boolean" ||
    !Array.isArray(repo.topics) ||
    !repo.topics.every((topic) => typeof topic === "string")
  )
    return fail("error");
  return {
    id: positiveId(repo.id),
    nodeId: typeof repo.node_id === "string" ? repo.node_id : null,
    organizationId: positiveId(owner.id),
    owner: login,
    name,
    fullName: `${login}/${name}`,
    url: `https://github.com/${login}/${name}`,
    defaultBranch: repo.default_branch,
    visibility:
      repo.visibility === "internal" ? "internal" : repo.private === true ? "private" : "public",
    archived: repo.archived,
    disabled: repo.disabled,
    topics: repo.topics as string[]
  };
};
type Response = Awaited<ReturnType<NonNullable<GitHubClient["getCourseRepository"]>>>;
/** GitHub response/status/pagination boundary. Returned facade contains no write methods. */
export const createRemoteRepositoryReader = (
  token: string,
  signal: AbortSignal,
  provide: GithubClientProvider = provideGithubClient
) => {
  const client = provide(token);
  const request = async (
    read: (bounded: AbortSignal) => Promise<Response>,
    nullable = false
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await read(AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]));
    } catch {
      return fail("network_unavailable");
    }
    const headers = new Headers(response.headers);
    const body = response.data;
    const message =
      body && typeof body === "object" && "message" in body ? String(body.message) : "";
    if (response.status === HTTP_UNAUTHORIZED) {
      // A single repository cannot revoke a global session.
      let identity: Response;
      try {
        identity = await client.getOrganizationScopeResponse!(
          AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        );
      } catch {
        return fail("network_unavailable");
      }
      return fail(
        identity.status === HTTP_UNAUTHORIZED ? "invalid_credential" : "repository_inaccessible"
      );
    }
    if (
      response.status === HTTP_RATE_LIMIT ||
      headers.get("x-ratelimit-remaining") === "0" ||
      headers.has("retry-after") ||
      /rate limit/i.test(message)
    )
      return fail("rate_limited");
    if (/^required\b/i.test(headers.get("x-github-sso") ?? "")) return fail("sso_required");
    if (
      headers.has("x-oauth-scopes") &&
      !headers.get("x-oauth-scopes")!.split(/[ ,]+/).includes("repo")
    )
      return fail("insufficient_scope");
    if (/OAuth.*restric|third.party.*(restric|approv)/i.test(message))
      return fail("oauth_approval_required");
    if (response.status >= HTTP_SERVER_ERROR) return fail("network_unavailable");
    if (response.status === HTTP_NOT_FOUND && nullable) return null;
    if (response.status === HTTP_NOT_FOUND || response.status === HTTP_FORBIDDEN)
      return fail("repository_inaccessible");
    if (response.status < 200 || response.status >= 300) return fail("error");
    return body;
  };
  const metadata = async (repo: CourseRepository, metadataPath: string) =>
    request(
      (bounded) =>
        client.getCourseMetadataPath!(
          repo.owner,
          repo.name,
          metadataPath,
          repo.defaultBranch,
          bounded
        ),
      true
    );
  return {
    async list(org: string): Promise<CourseRepository[]> {
      const repos = new Map<number, CourseRepository>();
      let page = 1;
      let more = true;
      while (more && !signal.aborted) {
        const body = await request((bounded) =>
          client.listCourseRepositoriesPage!(org, page, PAGE_SIZE, bounded)
        );
        if (!Array.isArray(body)) return fail("error");
        for (const value of body) {
          const repo = normalize(value);
          repos.set(repo.id, repo);
        }
        more = body.length === PAGE_SIZE;
        page += 1;
      }
      if (signal.aborted) return fail("network_unavailable");
      return [...repos.values()];
    },
    async search(org: string): Promise<{ ids: number[]; incomplete: boolean }> {
      const ids = new Set<number>();
      let page = 1;
      let more = true;
      let incomplete = false;
      while (more && !signal.aborted) {
        const body = object(
          await request((bounded) =>
            client.searchCourseMetadataPage!(org, page, PAGE_SIZE, bounded)
          )
        );
        if (!Array.isArray(body.items) || typeof body.total_count !== "number")
          return fail("error");
        for (const value of body.items) {
          const item = object(value);
          if (item.path === "course.yml") ids.add(positiveId(object(item.repository).id));
        }
        incomplete ||= body.incomplete_results === true || body.total_count > SEARCH_RESULT_LIMIT;
        more =
          body.items.length === PAGE_SIZE &&
          page * PAGE_SIZE < Math.min(body.total_count, SEARCH_RESULT_LIMIT);
        page += 1;
      }
      return { ids: [...ids], incomplete };
    },
    async resolve(owner: string, name: string): Promise<CourseRepository | null> {
      const body = await request(
        (bounded) => client.getCourseRepository!(segment(owner), segment(name), bounded),
        true
      );
      return body === null ? null : normalize(body);
    },
    async file(repo: CourseRepository, metadataPath: string): Promise<string | null> {
      if (!/^(?:course\.yml|terms\/[A-Za-z0-9._-]+\/term\.yml)$/.test(metadataPath))
        return fail("error");
      const body = await metadata(repo, metadataPath);
      if (body === null) return null;
      const file = object(body);
      if (
        file.type !== "file" ||
        file.path !== metadataPath ||
        file.encoding !== "base64" ||
        typeof file.content !== "string" ||
        typeof file.size !== "number" ||
        file.size > MAX_METADATA_BYTES ||
        file.content.length > MAX_METADATA_BYTES * 2
      )
        return fail("error");
      return Buffer.from(file.content, "base64").toString("utf8");
    },
    async terms(repo: CourseRepository): Promise<string[]> {
      const body = await metadata(repo, "terms");
      if (body === null) return [];
      // Contents API directories are capped at 1000; never claim a complete negative at the cap.
      if (!Array.isArray(body) || body.length >= SEARCH_RESULT_LIMIT) return fail("error");
      return body
        .map(object)
        .filter(
          (entry) =>
            entry.type === "dir" &&
            typeof entry.name === "string" &&
            /^\d{2}s[123]$/.test(entry.name)
        )
        .map((entry) => String(entry.name));
    }
  };
};
export type RemoteRepositoryReader = ReturnType<typeof createRemoteRepositoryReader>;
