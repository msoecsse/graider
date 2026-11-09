// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createGithubOAuthNetwork } from "./githubOAuthNetwork.js";
import { GithubOAuthSession, type ManagedOperationInput } from "./githubOAuthSession.js";
import { createGithubClientProvider, type GitHubClient } from "./githubClientProvider.js";
import { createRemoteRepositoryReader } from "./githubRemoteRepositories.js";
import type { RemoteCourse } from "./remoteCourseTypes.js";

const IDENTITY = { id: 42, login: "faculty", name: "Faculty" };
const TOKEN = "fake_session_token";
const course = (repositoryId: number): RemoteCourse => ({
  repositoryId,
  organizationId: 10,
  organizationLogin: "org",
  name: "course",
  fullName: "org/course",
  url: "https://github.com/org/course",
  nodeId: null,
  defaultBranch: "main",
  visibility: "private",
  archived: false,
  code: "CSC1120",
  title: "Course",
  schemaVersion: 1,
  discoveryHints: ["topic"],
  authorization: "authorized",
  localStatus: "remote_only",
  localFolderIds: [],
  diagnostics: []
});
const fixture = () => {
  const account = vi.fn(
    async (): Promise<{ status: number; headers: Record<string, string>; data: unknown }> => ({
      status: 200,
      headers: { "x-oauth-scopes": "read:org, repo" },
      data: IDENTITY
    })
  );
  const memberships = vi.fn(async () => ({ status: 200, headers: {}, data: [] }));
  const repository = vi.fn(async () => ({ status: 401, headers: {}, data: {} }));
  const client = {
    getCourseRepository: repository,
    getOrganizationScopeResponse: account,
    getAuthenticatedUser: vi.fn(async () => {
      await account();
      return { ...IDENTITY, username: IDENTITY.login };
    }),
    listOrganizationMembershipsPage: memberships
  } as unknown as GitHubClient;
  const exchange = vi.fn(
    async () => new Response(JSON.stringify({ access_token: TOKEN, token_type: "bearer" }))
  );
  const provideClient = createGithubClientProvider(() => ({
    resolveProductionGitHubClient: () => ({ status: "available", githubClient: client }),
    GITHUB_MUTATION_METHODS: []
  }));
  const network = createGithubOAuthNetwork(exchange, provideClient);
  const leases: ManagedOperationInput[] = [];
  const validate = async (input: ManagedOperationInput) => {
    leases.push(input);
    expect(await input.revalidateSession()).toBe(true);
    expect(await input.revalidateSession()).toBe(true);
  };
  const store = {
    load: vi.fn(async (): Promise<string | null> => TOKEN),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {})
  };
  const session = new GithubOAuthSession({
    network,
    store,
    secret: () => "fake_secret",
    openBrowser: async () => {},
    callback: async () => ({
      redirectUri: "http://127.0.0.1:1234/callback",
      code: Promise.resolve("code"),
      cancel: () => {}
    }),
    discoverCourses: async (_token, userId) => ({
      status: "ready",
      userId,
      discoveredAt: null,
      courses: [course(20), course(21)],
      diagnostics: []
    }),
    bootstrapCourse: async (input) => {
      await validate(input);
      return { status: "ready", diagnostic: null, retryable: false };
    },
    synchronizeCourse: async (input) => {
      await validate(input);
      return { status: "up_to_date", diagnostic: null, retryable: false };
    },
    reconcileCourse: async (input) => {
      await validate(input);
      return {
        repositoryId: input.course.repositoryId,
        status: "idle",
        eligible: false,
        diagnostic: null,
        retryable: false
      };
    }
  });
  const settled = async () =>
    vi.waitFor(() =>
      expect(
        session
          .getState()
          .courseDiscovery.courses.every((c) => c.synchronization?.status === "up_to_date") &&
          leases.length >= 4
      ).toBe(true)
    );
  return {
    account,
    memberships,
    network,
    store,
    session,
    settled,
    leases,
    provideClient,
    reader: (signal: AbortSignal) => createRemoteRepositoryReader(TOKEN, signal, provideClient)
  };
};

describe("single account verification and reusable session", () => {
  it.each(["sign-in", "restore"])(
    "uses exactly one /user for %s, discovery, multiple bootstraps and routine operations",
    async (mode) => {
      const f = fixture();
      if (mode === "restore") await f.session.restore();
      else await f.session.signIn();
      await f.settled();
      expect(f.account).toHaveBeenCalledTimes(1);
      await f.session.refreshOrganizations();
      await f.session.withAuthenticatedAccount(async (input) => {
        expect(await input.revalidateSession()).toBe(true);
        expect(await input.revalidateSession()).toBe(true);
      });
      await Promise.all(
        [20, 21].map((id) =>
          f.session.withReadOnlyCourse(id, IDENTITY.id, async (input) => {
            expect(await input.revalidateSession()).toBe(true);
            expect(await input.revalidateSession()).toBe(true);
          })
        )
      );
      await f.session.withSynchronizedCourse(20, IDENTITY.id, async (input) => {
        expect(await input.revalidateSession()).toBe(true);
      });
      await f.session.reconcileCourse(20, "plan");
      await f.session.withLocalCourse(20, IDENTITY.id, async (input) => input.assertCurrent());
      expect(f.account).toHaveBeenCalledTimes(1);
      await f.session.signOut();
      expect(f.account).toHaveBeenCalledTimes(1);
      expect(await f.leases[0].revalidateSession()).toBe(false);
    }
  );
  it("verifies a replacement once and invalidates all old leases even for the same account/token", async () => {
    const f = fixture();
    await f.session.restore();
    await f.settled();
    const old = f.leases[0];
    await f.session.signIn(true);
    await f.settled();
    expect(await old.revalidateSession()).toBe(false);
    expect(f.account).toHaveBeenCalledTimes(2);
    f.session.shutdown();
  });
});

it.each([
  ["read:org, repo", true, true],
  ["write:org, repo", true, true],
  ["admin:org, repo", true, true],
  ["read:org, public_repo, repo:status", true, false],
  ["repo", false, true],
  ["", false, false]
])(
  "extracts identity and exact capabilities from one response: %s",
  async (scopes, organizationCapability, repositoryCapability) => {
    const f = fixture();
    f.account.mockResolvedValue({
      status: 200,
      headers: { "x-oauth-scopes": scopes },
      data: { ...IDENTITY, name: null, access_token: TOKEN }
    });
    expect(await f.network.verifyAccount(TOKEN, new AbortController().signal)).toEqual({
      identity: { ...IDENTITY, name: null },
      scopes: scopes.split(/[ ,]+/).filter(Boolean),
      organizationCapability,
      repositoryCapability
    });
    expect(f.account).toHaveBeenCalledTimes(1);
  }
);

it("reports missing OAuth evidence and retains the saved credential without authorizing operations", async () => {
  const f = fixture();
  f.account.mockResolvedValue({ status: 200, headers: {}, data: IDENTITY });
  await f.session.restore();
  expect(f.session.getState()).toMatchObject({
    status: "unavailable",
    identity: null,
    message: expect.stringContaining("scope evidence")
  });
  expect(f.account).toHaveBeenCalledTimes(1);
  expect(f.store.delete).not.toHaveBeenCalled();
  await expect(f.session.withAuthenticatedAccount(async () => {})).rejects.toThrow();
});

it("restricts limited scopes until one verified upgrade replaces the session", async () => {
  const f = fixture();
  f.account.mockResolvedValueOnce({
    status: 200,
    headers: { "x-oauth-scopes": "read:org" },
    data: IDENTITY
  });
  await f.session.restore();
  await f.session.refreshOrganizations();
  expect(f.session.getState().repositoryPermission).toBe("required");
  await expect(f.session.withAuthenticatedAccount(async () => {})).rejects.toThrow();
  expect(f.account).toHaveBeenCalledTimes(1);
  await f.session.signIn();
  await f.settled();
  await f.session.withAuthenticatedAccount(async (input) =>
    expect(await input.revalidateSession()).toBe(true)
  );
  expect(f.account).toHaveBeenCalledTimes(2);
  f.session.shutdown();
});

it("retains the verified account after replacement storage failure and revokes its old leases", async () => {
  const f = fixture();
  await f.session.restore();
  await f.settled();
  const old = f.leases[0];
  f.store.save.mockRejectedValueOnce(new Error("storage unavailable"));
  f.account.mockResolvedValueOnce({
    status: 200,
    headers: { "x-oauth-scopes": "read:org, repo" },
    data: { id: 99, login: "replacement" }
  });
  await f.session.signIn(true);
  expect(f.session.getState().identity).toEqual(IDENTITY);
  expect(await old.revalidateSession()).toBe(false);
  await f.session.withAuthenticatedAccount(async (input) =>
    expect(await input.revalidateSession()).toBe(true)
  );
  expect(f.account).toHaveBeenCalledTimes(2);
  f.session.shutdown();
});

it("preserves the session through organization-specific and rate-limited 403s without /user probes", async () => {
  const f = fixture();
  await f.session.restore();
  await f.settled();
  for (const headers of [{}, { "x-ratelimit-remaining": "0" }]) {
    f.memberships.mockResolvedValueOnce({ status: 403, headers, data: [] });
    await f.session.refreshOrganizations();
    expect(f.session.getState().status).toBe("signed_in");
    expect(f.store.delete).not.toHaveBeenCalled();
  }
  expect(f.account).toHaveBeenCalledTimes(1);
  f.session.shutdown();
});

it.each([200, 401, 403, 503])(
  "shares one bounded global confirmation across concurrent and repeated repository 401s: /user %s",
  async (status) => {
    const f = fixture();
    await f.session.restore();
    await f.settled();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.account.mockImplementationOnce(async () => {
      await pending;
      return { status, headers: {}, data: IDENTITY };
    });
    const operations = [20, 21].map((id) =>
      f.session.withReadOnlyCourse(id, IDENTITY.id, async (input) => {
        await f.reader(input.signal).resolve("org", "course");
      })
    );
    const results = Promise.allSettled(operations);
    await vi.waitFor(() => expect(f.account).toHaveBeenCalledTimes(2));
    finish();
    expect((await results).every((result) => result.status === "rejected")).toBe(true);
    expect(f.account).toHaveBeenCalledTimes(2);
    if (status === 401) {
      expect(f.session.getState().status).toBe("signed_out");
      expect(f.store.delete).toHaveBeenCalledTimes(1);
      expect(await f.leases[0].revalidateSession()).toBe(false);
      await expect(f.session.withAuthenticatedAccount(async () => {})).rejects.toThrow();
    } else {
      expect(f.session.getState().status).toBe("signed_in");
      expect(f.store.delete).not.toHaveBeenCalled();
      await f.session.withAuthenticatedAccount(async (input) => {
        expect(await input.revalidateSession()).toBe(true);
        await expect(f.reader(input.signal).resolve("org", "course")).rejects.toMatchObject({
          code: "repository_inaccessible"
        });
      });
      expect(f.account).toHaveBeenCalledTimes(2);
    }
    f.session.shutdown();
  }
);

it("discards a late invalidation confirmation after account replacement", async () => {
  const f = fixture();
  await f.session.restore();
  await f.settled();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  f.account.mockImplementationOnce(async () => {
    await pending;
    return { status: 401, headers: {}, data: {} };
  });
  const read = f.session.withReadOnlyCourse(20, IDENTITY.id, (input) =>
    f.reader(input.signal).resolve("org", "course")
  );
  const rejected = expect(read).rejects.toThrow();
  await vi.waitFor(() => expect(f.account).toHaveBeenCalledTimes(2));
  await f.session.signIn(true);
  finish();
  await rejected;
  expect(f.session.getState().status).toBe("signed_in");
  expect(f.store.delete).not.toHaveBeenCalled();
  expect(f.account).toHaveBeenCalledTimes(3);
  f.session.shutdown();
});

it("never establishes a canceled replacement after secure persistence completes", async () => {
  const f = fixture();
  await f.session.restore();
  await f.settled();
  let finish!: () => void;
  f.store.save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  f.account.mockResolvedValueOnce({
    status: 200,
    headers: { "x-oauth-scopes": "read:org, repo" },
    data: { id: 99, login: "replacement" }
  });
  const replacing = f.session.signIn(true);
  await vi.waitFor(() => expect(finish).toBeDefined());
  f.session.cancel();
  finish();
  await replacing;
  expect(f.session.getState().identity).toEqual(IDENTITY);
  expect(f.store.save).toHaveBeenLastCalledWith(TOKEN);
  expect(f.account).toHaveBeenCalledTimes(2);
  f.session.shutdown();
});

it("reuses verified evidence through backend client methods without skipping repository requests", async () => {
  const f = fixture();
  await f.session.restore();
  await f.settled();
  let captured!: GitHubClient;
  await f.session.withAuthenticatedAccount(async (input) => {
    captured = f.provideClient(input.token);
    expect(await captured.getAuthenticatedUser({ signal: input.signal })).toEqual({
      id: IDENTITY.id,
      username: IDENTITY.login,
      name: IDENTITY.name
    });
    expect(await captured.getOrganizationScopeResponse!(input.signal)).toMatchObject({
      status: 200,
      data: IDENTITY,
      headers: { "x-oauth-scopes": "read:org,repo" }
    });
    expect(await captured.getOrganizationScopeResponse!(input.signal)).toMatchObject({
      status: 200,
      data: IDENTITY
    });
  });
  expect(f.account).toHaveBeenCalledTimes(1);
  await f.session.signOut();
  await expect(captured.getAuthenticatedUser()).rejects.toThrow();
  await expect(
    captured.getOrganizationScopeResponse!(new AbortController().signal)
  ).rejects.toThrow();
  expect(f.account).toHaveBeenCalledTimes(1);
});

it.each(["verification", "persistence"])(
  "sign-out cancels replacement during %s and cannot be undone by its late result",
  async (phase) => {
    const f = fixture();
    await f.session.restore();
    await f.settled();
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    if (phase === "verification")
      f.account.mockImplementationOnce(async () => {
        entered();
        await held;
        return {
          status: 200,
          headers: { "x-oauth-scopes": "read:org, repo" },
          data: { id: 99, login: "replacement" }
        };
      });
    else
      f.store.save.mockImplementationOnce(async () => {
        entered();
        await held;
      });
    const replacing = f.session.signIn(true);
    await started;
    const signingOut = f.session.signOut();
    expect(f.session.getState().identity).toBeNull();
    expect(await f.leases[0].revalidateSession()).toBe(false);
    finish();
    await Promise.all([signingOut, replacing]);
    expect(f.session.getState().status).toBe("signed_out");
    expect(f.store.delete).toHaveBeenCalled();
    expect(f.account).toHaveBeenCalledTimes(2);
  }
);

it("shares confirmation between organization refresh and repository failures", async () => {
  const f = fixture();
  await f.session.restore();
  await f.settled();
  f.memberships.mockResolvedValue({ status: 401, headers: {}, data: [] });
  await Promise.all([
    f.session.refreshOrganizations(),
    f.session.withAuthenticatedAccount(async (input) => {
      await expect(f.reader(input.signal).resolve("org", "course")).rejects.toMatchObject({
        code: "repository_inaccessible"
      });
    })
  ]);
  await f.session.refreshOrganizations();
  expect(f.session.getState().status).toBe("signed_in");
  expect(f.store.delete).not.toHaveBeenCalled();
  expect(f.account).toHaveBeenCalledTimes(2);
  f.session.shutdown();
});

it("does not lend verified evidence to another credential and preserves exact broader scopes", async () => {
  const f = fixture();
  f.account.mockResolvedValueOnce({
    status: 200,
    headers: { "x-oauth-scopes": "write:org, repo" },
    data: IDENTITY
  });
  await f.session.restore();
  await f.settled();
  await f.session.withAuthenticatedAccount(async (input) => {
    expect(
      await f.provideClient(input.token).getOrganizationScopeResponse!(input.signal)
    ).toMatchObject({ headers: { "x-oauth-scopes": "write:org,repo" } });
    await f.provideClient("another_fake_token").getOrganizationScopeResponse!(input.signal);
  });
  expect(f.account).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(f.session.getState())).not.toMatch(
    /scopes|credential|generation|fake_session_token/
  );
  f.session.shutdown();
});

it("blocks operations if global confirmation identifies a different account, preserving credentials", async () => {
  const f = fixture();
  await f.session.restore();
  await f.settled();
  f.account.mockResolvedValueOnce({
    status: 200,
    headers: { "x-oauth-scopes": "read:org, repo" },
    data: { id: 99, login: "other" }
  });
  await expect(
    f.session.withAuthenticatedAccount((input) => f.reader(input.signal).resolve("org", "course"))
  ).rejects.toThrow();
  expect(f.session.getState()).toMatchObject({ status: "unavailable", identity: null });
  expect(f.store.delete).not.toHaveBeenCalled();
  expect(await f.leases[0].revalidateSession()).toBe(false);
  expect(f.account).toHaveBeenCalledTimes(2);
  f.session.shutdown();
});

it.each([{}, { login: "faculty", id: 0 }, { login: "bad/login", id: 42 }])(
  "rejects malformed account identity without granting capabilities: %j",
  async (data) => {
    const f = fixture();
    f.account.mockResolvedValue({
      status: 200,
      headers: { "x-oauth-scopes": "read:org, repo" },
      data
    });
    await f.session.restore();
    expect(f.session.getState().identity).toBeNull();
    expect(f.account).toHaveBeenCalledTimes(1);
    expect(f.store.delete).not.toHaveBeenCalled();
  }
);
