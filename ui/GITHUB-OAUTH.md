# GitHub faculty sign-in (Phase 2 / Slice 2.1)

Faculty settings on the dashboard contains GitHub sign-in, sign-out, and account switching. The existing local MSOE username remains a separate local preference. Login and immutable numeric GitHub user ID establish the canonical GitHub identity; email is never used. Avatars are intentionally omitted to avoid introducing remote image rendering.

## OAuth App configuration

- Public client ID: `Ov23lilUrjxhcDiX2RBq`.
- Registered callback: `http://127.0.0.1/callback`.
- Device flow and expiring access tokens remain disabled.
- Development: launch Electron with `GRAIDER_GITHUB_OAUTH_CLIENT_SECRET` in its environment. Never use a `VITE_` variable or enter the secret in application settings.
- Release: CI must supply `GRAIDER_GITHUB_OAUTH_CLIENT_SECRET` to the packaging command (`npm run package:mac` / `npm run package:win`). The Electron Builder `beforePack` hook writes `dist-electron/github-oauth.release.json`, included inside the main-process app archive. Missing configuration fails packaging. The generated directory is gitignored. Plain `npm run build` needs no secret, and sign-in explains missing configuration at runtime.
- Restrict release artifact access appropriately. Native/public applications cannot cryptographically hide a bundled client secret; it is recoverable from an installed application. PKCE and state are mandatory independently of the secret. Do not commit a generated config or publish build logs containing secret values. Use clean CI workspaces and remove generated release configuration after packaging before reusing a workspace for development.

## Flow and boundaries

`GithubOAuthSession` coordinates injected browser, network, callback, and credential-store boundaries entirely in Electron main. It generates independent 32-byte cryptographic random PKCE verifier and state values per attempt; the verifier uses base64url and the challenge is SHA-256 (`S256`). They exist only in memory. Trusted code constructs `https://github.com/login/oauth/authorize` and opens it with `shell.openExternal`, using the system default browser. No login BrowserWindow is created.

The callback binds only `127.0.0.1` with port zero, allowing the OS to select an available port. Its exact runtime redirect URI is reused in the code exchange. Only GET `/callback` is accepted; unrelated requests receive 404. Duplicate/mismatched state, duplicate/missing/malformed code, and denial responses fail the flow. A callback is single-use. The named timeout is 180 seconds. Success, terminal failure, timeout, cancellation, and app shutdown close the listener. Static completion HTML has no reflected parameters, assets, or JavaScript. One flow can run at a time. Token exchange refuses redirects. Token exchange and identity requests have a 30-second timeout. Identity lookup reuses the existing GitHub client adapter with explicit OAuth credentials, preserving the operational credential resolver.

Preload exposes only `get`, `signIn`, `signOut`, `switchAccount`, and `cancel`; their IPC handlers accept no arguments. The renderer receives only sanitized identity/status. Client secret, tokens, authorization codes, state, and PKCE verifier do not cross IPC. Token exchange uses a dedicated transport; identity uses the existing adapter. Neither logs requests, responses, or sensitive exceptions.

## Scopes

`GITHUB_OAUTH_SCOPES` centralizes an empty scope set. Authenticated `GET https://api.github.com/user` returns the login, numeric ID, and public display name without scopes. No repository, organization, email, or private-profile scope is needed. GitHub may retain scopes a user previously granted this same OAuth App; this slice does not request additional scopes. Later course operations must deliberately assess repository/organization scopes and reauthorization before migrating.

References: [authenticated user endpoint](https://docs.github.com/en/rest/users/users#get-the-authenticated-user), [OAuth/PKCE and loopback callbacks](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

## Persistence and lifecycle

`GithubOAuthCredentialStore` supports load/save/delete. Its production implementation encrypts using Electron `safeStorage` (macOS Keychain; Windows OS-backed encryption) and writes only ciphertext to `userData/github-oauth.credential`, with a temporary-file/rename replacement and restrictive file permissions. No normal settings, localStorage, or plaintext fallback is used. Linux basic-text/unknown backends are refused. macOS release signing should use a stable application identity for consistent Keychain behavior.

If secure persistence fails for a first sign-in, the validated session remains in main-process memory with an explicit restart warning. A failed account replacement preserves the previous identity and credential. Successful switching uses `prompt=select_account`, validates the new identity, atomically saves the replacement, then replaces the in-memory session. Sign-out deletes the saved credential and clears memory; a deletion failure is surfaced so the user can retry. It does not sign the browser out of github.com.

Startup loads the encrypted credential once and validates it with `/user`. HTTP 401 removes the rejected token and asks the user to sign in again. Network errors, 403 (including policy/rate limiting), and server failures preserve the stored credential and show unavailable state; they never trigger global credential deletion. No unverified identity is presented as authenticated. A restart retries stored-credential validation, or the user can initiate fresh sign-in. Future organization authorization must remain separate from global identity validity.

## Intentionally unchanged

`GRAIDER_GITHUB_TOKEN`, `GITHUB_TOKEN`, GitHub CLI resolution, operational GitHub clients, injected test clients, Git credentials, course synchronization, repository operations, and organization authorization retain their existing authentication paths. Faculty sign-in does not imply these operations have migrated.

## Verification

Focused tests: `npx vitest run electron/githubOAuth.test.ts src/dashboard/GithubAccountPanel.test.tsx electron/tokenResolver.test.ts electron/githubClientProvider.test.ts electron/preload.test.ts`. Loopback integration tests require permission to bind local sockets; no automated test contacts GitHub.

Real OAuth smoke test requires the configured client secret and interactive faculty browser authorization. From signed out: sign in, verify system browser and local completion page, check login, fully quit/relaunch and verify restoration, sign out/relaunch and verify signed out, sign in again, switch accounts if available, simulate a network outage without deleting credentials, and confirm course/repository operations retain legacy authentication. Test macOS Apple Silicon and Windows x64 with actual OS credential storage before release.
