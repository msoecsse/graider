import type { GitHubClient } from "./githubClientProvider.js";
// @vitest-environment node
import { createHash } from "node:crypto";
import { request } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { startOAuthCallback, GithubOAuthError } from "./githubOAuthCallback.js";
import { createOAuthProof, GithubOAuthSession } from "./githubOAuthSession.js";
import { createGithubOAuthNetwork, GITHUB_OAUTH_CLIENT_ID } from "./githubOAuthNetwork.js";
import { createGithubOAuthCredentialStore } from "./githubOAuthCredentialStore.js";

const TOKEN = "fake_oauth_token";
const SECRET = "fake_client_secret";
const IDENTITY = { login: "octocat", id: 42, name: "Octo Cat" };
const httpGet = (url: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += String(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode!, body }));
    });
    req.on("error", reject);
    req.end();
  });
const fixture = () => {
  const store = {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
  const network = {
    organizationCapability: vi.fn().mockResolvedValue(true),
    discoverOrganizations: vi
      .fn()
      .mockResolvedValue({ status: "ready", organizations: [], message: null, stale: false }),
    exchange: vi.fn().mockResolvedValue(TOKEN),
    identity: vi.fn().mockResolvedValue(IDENTITY)
  };
  const callback = vi.fn().mockResolvedValue({
    redirectUri: "http://127.0.0.1:54321/callback",
    code: Promise.resolve("code123"),
    cancel: vi.fn()
  });
  const openBrowser = vi.fn().mockResolvedValue(undefined);
  const deps = { store, network, callback, openBrowser, secret: () => SECRET };
  return { ...deps, session: new GithubOAuthSession(deps) };
};

describe("PKCE and loopback callback", () => {
  it("uses independent secure random proofs and a correct S256 challenge", () => {
    const first = createOAuthProof();
    const second = createOAuthProof();
    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.challenge).toBe(createHash("sha256").update(first.verifier).digest("base64url"));
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(second.verifier);
  });
  it("binds an ephemeral IPv4 loopback port, rejects unrelated paths and accepts a single callback", async () => {
    const listener = await startOAuthCallback("expected", new AbortController().signal);
    const url = new URL(listener.redirectUri);
    expect(url.hostname).toBe("127.0.0.1");
    expect(Number(url.port)).toBeGreaterThan(0);
    expect((await httpGet(`${url.origin}/other`)).status).toBe(404);
    const response = await httpGet(`${listener.redirectUri}?state=expected&code=code123`);
    expect(response.status).toBe(200);
    expect(response.body).not.toContain("code123");
    await expect(listener.code).resolves.toBe("code123");
    await expect(httpGet(`${listener.redirectUri}?state=expected&code=code123`)).rejects.toThrow();
  });
  it.each([
    ["state=wrong&code=code123", "state_mismatch"],
    ["state=expected&error=access_denied", "denied"],
    ["state=expected", "missing_code"],
    ["state=expected&state=expected&code=code123", "state_mismatch"],
    ["state=expected&code=code123&code=second", "missing_code"]
  ])("closes after invalid callback %s", async (query, code) => {
    const listener = await startOAuthCallback("expected", new AbortController().signal);
    const rejection = expect(listener.code).rejects.toMatchObject({ code });
    expect((await httpGet(`${listener.redirectUri}?${query}`)).status).toBe(400);
    await rejection;
    await expect(httpGet(listener.redirectUri)).rejects.toThrow();
  });
  it("times out and closes", async () => {
    const TIMEOUT_MS = 20;
    const listener = await startOAuthCallback("expected", new AbortController().signal, TIMEOUT_MS);
    await expect(listener.code).rejects.toMatchObject({ code: "timeout" });
    await expect(httpGet(listener.redirectUri)).rejects.toThrow();
  });
  it("closes on app cancellation", async () => {
    const controller = new AbortController();
    const listener = await startOAuthCallback("expected", controller.signal);
    controller.abort();
    await expect(listener.code).rejects.toMatchObject({ code: "canceled" });
    await expect(httpGet(listener.redirectUri)).rejects.toThrow();
  });
});

describe("faculty session", () => {
  it("constructs trusted browser authorization and passes exact exchange data without projecting credentials", async () => {
    const f = fixture();
    const state = await f.session.signIn();
    const url = new URL(f.openBrowser.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(GITHUB_OAUTH_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:54321/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("read:org");
    expect(url.searchParams.get("state")).toBeTruthy();
    const exchange = f.network.exchange.mock.calls[0][0];
    expect(exchange).toMatchObject({
      code: "code123",
      secret: SECRET,
      redirectUri: url.searchParams.get("redirect_uri")
    });
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(exchange.verifier).digest("base64url")
    );
    expect(f.network.identity).toHaveBeenCalledWith(TOKEN, expect.any(AbortSignal));
    expect(f.store.save).toHaveBeenCalledWith(TOKEN);
    expect(state).toMatchObject({ status: "signed_in", identity: IDENTITY, persistence: "secure" });
    expect(JSON.stringify(state)).not.toContain(TOKEN);
    expect(JSON.stringify(state)).not.toContain(SECRET);
  });
  it("retains prior account on failed switch and commits a successful replacement", async () => {
    const f = fixture();
    await f.session.signIn();
    f.network.exchange.mockRejectedValueOnce(new Error(TOKEN + SECRET));
    const failed = await f.session.signIn(true);
    expect(failed.identity).toEqual(IDENTITY);
    expect(JSON.stringify(failed)).not.toContain(TOKEN);
    expect(f.store.save).toHaveBeenCalledTimes(1);
    expect(new URL(f.openBrowser.mock.calls[1][0]).searchParams.get("prompt")).toBe(
      "select_account"
    );
    const replacement = { login: "second", id: 99, name: null };
    f.network.identity.mockResolvedValueOnce(replacement);
    expect((await f.session.signIn(true)).identity).toEqual(replacement);
    expect(f.store.save).toHaveBeenCalledTimes(2);
  });
  it("preserves previous account when secure replacement fails", async () => {
    const f = fixture();
    await f.session.signIn();
    f.store.save.mockRejectedValueOnce(new Error(SECRET));
    f.network.identity.mockResolvedValueOnce({ login: "second", id: 99, name: null });
    expect((await f.session.signIn(true)).identity).toEqual(IDENTITY);
  });
  it("supports memory-only sign-in on storage failure, then clears identity on sign out", async () => {
    const f = fixture();
    f.store.save.mockRejectedValue(new Error(TOKEN));
    expect(await f.session.signIn()).toMatchObject({ status: "signed_in", persistence: "memory" });
    expect(await f.session.signOut()).toMatchObject({ status: "signed_out", identity: null });
    expect(f.store.delete).toHaveBeenCalledOnce();
  });
  it("restores once and deletes only revoked credentials", async () => {
    const f = fixture();
    f.store.load.mockResolvedValue(TOKEN);
    await Promise.all([f.session.restore(), f.session.restore()]);
    expect(f.session.getState().identity).toEqual(IDENTITY);
    expect(f.store.load).toHaveBeenCalledOnce();
    const revoked = fixture();
    revoked.store.load.mockResolvedValue(TOKEN);
    revoked.network.identity.mockRejectedValue(
      new GithubOAuthError("invalid_credential", "Sign in again.")
    );
    await revoked.session.restore();
    expect(revoked.store.delete).toHaveBeenCalledOnce();
    expect(revoked.session.getState().status).toBe("signed_out");
    const offline = fixture();
    offline.store.load.mockResolvedValue(TOKEN);
    offline.network.identity.mockRejectedValue(new Error(TOKEN));
    await offline.session.restore();
    expect(offline.store.delete).not.toHaveBeenCalled();
    expect(offline.session.getState().status).toBe("unavailable");
  });
  it("prevents competing flows and shutdown cancels the real active listener", async () => {
    const f = fixture();
    const session = new GithubOAuthSession({ ...f, callback: startOAuthCallback });
    const attempt = session.signIn();
    expect((await session.signIn()).busy).toBe(true);
    await vi.waitFor(() => expect(f.openBrowser).toHaveBeenCalledOnce());
    const uri = new URL(f.openBrowser.mock.calls[0][0]).searchParams.get("redirect_uri")!;
    session.shutdown();
    expect((await attempt).status).toBe("signed_out");
    await expect(httpGet(uri)).rejects.toThrow();
  });
  it("retains account on canceled switch", async () => {
    const f = fixture();
    await f.session.signIn();
    f.callback.mockRejectedValueOnce(new GithubOAuthError("canceled", "Sign-in canceled."));
    expect((await f.session.signIn(true)).identity).toEqual(IDENTITY);
  });
  it("cancels even when the OS browser-open promise has not settled", async () => {
    const f = fixture();
    f.openBrowser.mockReturnValue(new Promise(() => undefined));
    const session = new GithubOAuthSession({ ...f, callback: startOAuthCallback });
    const attempt = session.signIn();
    await vi.waitFor(() => expect(f.openBrowser).toHaveBeenCalledOnce());
    session.cancel();
    expect((await attempt).message).toContain("canceled");
    expect(f.network.exchange).not.toHaveBeenCalled();
  });
  it("sanitizes configuration/browser/network errors", async () => {
    const f = fixture();
    const missing = new GithubOAuthSession({ ...f, secret: () => undefined });
    expect((await missing.signIn()).message).toContain("not configured");
    expect(f.openBrowser).not.toHaveBeenCalled();
    f.openBrowser.mockRejectedValueOnce(new Error(SECRET));
    const state = await f.session.signIn();
    expect(state.message).toContain("default browser");
    expect(JSON.stringify(state)).not.toContain(SECRET);
    expect(f.network.exchange).not.toHaveBeenCalled();
  });
});

describe("trusted network boundary", () => {
  it("posts the client secret and verifier only to GitHub and projects canonical identity", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: TOKEN, token_type: "bearer" }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...IDENTITY, email: "ignored", access_token: TOKEN }))
      );
    const network = createGithubOAuthNetwork(
      fetcher,
      () =>
        ({
          getAuthenticatedUser: async () => ({
            username: IDENTITY.login,
            id: IDENTITY.id,
            name: IDENTITY.name
          })
        }) as GitHubClient
    );
    const signal = new AbortController().signal;
    expect(
      await network.exchange(
        {
          code: "code123",
          redirectUri: "http://127.0.0.1:4321/callback",
          verifier: "verifier",
          secret: SECRET
        },
        signal
      )
    ).toBe(TOKEN);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(init.body.get("client_secret")).toBe(SECRET);
    expect(init.body.get("code_verifier")).toBe("verifier");
    expect(init.body.get("client_id")).toBe(GITHUB_OAUTH_CLIENT_ID);
    expect(init.redirect).toBe("error");
    expect(await network.identity(TOKEN, signal)).toEqual(IDENTITY);
  });
  it.each([
    [401, "invalid_credential"],
    [403, "unavailable"],
    [500, "unavailable"]
  ])("distinguishes identity status %s", async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(SECRET + TOKEN, { status }));
    await expect(
      createGithubOAuthNetwork(
        fetcher,
        () =>
          ({
            getAuthenticatedUser: async () => {
              throw { statusCode: status };
            }
          }) as unknown as GitHubClient
      ).identity(TOKEN, new AbortController().signal)
    ).rejects.toMatchObject({ code });
  });
  it("rejects invalid token responses without including the body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: SECRET, token_type: "invalid" }))
      );
    await expect(
      createGithubOAuthNetwork(fetcher).exchange(
        { code: "code", redirectUri: "uri", verifier: "verifier", secret: SECRET },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: "token_response" });
  });
});

describe("OS encrypted credential store", () => {
  it("writes ciphertext only, restores it and deletes it; no plaintext fallback", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "graider-auth-"));
    const file = path.join(directory, "credential");
    const ciphertext = Buffer.from("fake-OS-encrypted-ciphertext");
    const storage = {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn(() => ciphertext),
      decryptString: vi.fn(() => TOKEN),
      getSelectedStorageBackend: () => "unknown"
    };
    const store = createGithubOAuthCredentialStore(file, storage, "darwin");
    try {
      expect(await store.load()).toBeNull();
      await store.save(TOKEN);
      expect(await readFile(file)).toEqual(ciphertext);
      expect(await readFile(file, "utf8")).not.toContain(TOKEN);
      expect(await store.load()).toBe(TOKEN);
      storage.isEncryptionAvailable.mockReturnValue(false);
      await expect(store.save("replacement")).rejects.toThrow();
      expect(await readFile(file)).toEqual(ciphertext);
      await store.delete();
      expect(await store.load()).toBeNull();
      await expect(readFile(file)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("organization session lifecycle and authorization upgrades", () => {
  it("detects an existing no-scope token and upgrades transactionally across restart", async () => {
    const f = fixture();
    f.store.load.mockResolvedValue(TOKEN);
    f.network.organizationCapability.mockResolvedValue(false);
    await f.session.restore();
    await f.session.refreshOrganizations();
    expect(f.session.getState()).toMatchObject({
      status: "signed_in",
      organizationPermission: "required",
      organizationDiscovery: { status: "authorization_required" }
    });
    expect(f.network.discoverOrganizations).not.toHaveBeenCalled();
    f.network.exchange.mockResolvedValue("fake_upgraded_token");
    f.network.organizationCapability.mockResolvedValue(true);
    await f.session.signIn();
    expect(f.store.save).toHaveBeenCalledWith("fake_upgraded_token");
    f.store.load.mockResolvedValue("fake_upgraded_token");
    const restarted = new GithubOAuthSession(f);
    await restarted.restore();
    await restarted.refreshOrganizations();
    expect(restarted.getState()).toMatchObject({
      identity: IDENTITY,
      organizationPermission: "available",
      organizationDiscovery: { status: "ready" }
    });
    expect(JSON.stringify(restarted.getState())).not.toContain("fake_upgraded_token");
  });
  it.each(["denied", "exchange", "callback", "canceled"])(
    "preserves the old credential when an upgrade fails: %s",
    async (code) => {
      const f = fixture();
      f.store.load.mockResolvedValue(TOKEN);
      f.network.organizationCapability.mockResolvedValue(false);
      await f.session.restore();
      await f.session.refreshOrganizations();
      f.network.exchange.mockRejectedValueOnce(new GithubOAuthError(code, "Authorization failed."));
      await f.session.signIn();
      expect(f.session.getState()).toMatchObject({
        identity: IDENTITY,
        status: "signed_in",
        organizationPermission: "required"
      });
      expect(f.store.save).not.toHaveBeenCalled();
      expect(f.store.delete).not.toHaveBeenCalled();
    }
  );
  it("cancels a pending authorization attempt without deleting the old session", async () => {
    const f = fixture();
    f.store.load.mockResolvedValue(TOKEN);
    await f.session.restore();
    let rejectCode!: (error: Error) => void;
    f.callback.mockImplementationOnce(async (_state, signal) => ({
      redirectUri: "http://127.0.0.1:54321/callback",
      code: new Promise<string>((_resolve, reject) => {
        rejectCode = reject;
        signal.addEventListener("abort", () =>
          reject(new GithubOAuthError("canceled", "Canceled"))
        );
      }),
      cancel: vi.fn()
    }));
    const attempt = f.session.signIn();
    await vi.waitFor(() => expect(rejectCode).toBeDefined());
    f.session.cancel();
    expect((await attempt).identity).toEqual(IDENTITY);
    expect(f.store.save).not.toHaveBeenCalled();
    expect(f.store.delete).not.toHaveBeenCalled();
  });
  it("preserves state on transient discovery failure, and clears only definitively invalid credentials", async () => {
    const f = fixture();
    await f.session.signIn();
    await f.session.refreshOrganizations();
    for (const code of ["network_unavailable", "rate_limited", "forbidden", "error"]) {
      f.network.discoverOrganizations.mockRejectedValueOnce(
        new GithubOAuthError(code, "Retry later.")
      );
      expect((await f.session.refreshOrganizations()).status).toBe("signed_in");
      expect(f.store.delete).not.toHaveBeenCalled();
    }
    f.network.discoverOrganizations.mockRejectedValueOnce(
      new GithubOAuthError("invalid_credential", "Revoked")
    );
    expect(await f.session.refreshOrganizations()).toMatchObject({
      status: "signed_out",
      identity: null,
      organizationDiscovery: { organizations: [] }
    });
    expect(f.store.delete).toHaveBeenCalledOnce();
  });
  it("never runs discovery signed out and ignores late results after switching or signing out", async () => {
    const f = fixture();
    await f.session.refreshOrganizations();
    expect(f.network.organizationCapability).not.toHaveBeenCalled();
    await f.session.signIn();
    await f.session.refreshOrganizations();
    let finish!: (value: unknown) => void;
    f.network.discoverOrganizations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = f.session.refreshOrganizations();
    await vi.waitFor(() => expect(finish).toBeDefined());
    f.network.identity.mockResolvedValueOnce({ id: 99, login: "second", name: null });
    await f.session.signIn(true);
    finish({
      status: "ready",
      organizations: [{ login: "old-account-private" }],
      message: null,
      stale: false
    });
    await pending;
    expect(JSON.stringify(f.session.getState())).not.toContain("old-account-private");
    await f.session.signOut();
    expect(f.session.getState().organizationDiscovery.organizations).toEqual([]);
  });
  it("opens only the fixed GitHub authorization destination", async () => {
    const f = fixture();
    await f.session.manageAuthorization();
    expect(f.openBrowser).toHaveBeenCalledWith("https://github.com/settings/applications");
  });
});
