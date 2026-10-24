# GitHub faculty sign-in and organizations (Phase 2 / Slice 2.2)

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

Preload exposes only `get`, `signIn`, `signOut`, `switchAccount`, `cancel`, `refreshOrganizations`, and `manageAuthorization`; their IPC handlers accept no arguments. The renderer receives only sanitized identity/status. Client secret, tokens, authorization codes, state, and PKCE verifier do not cross IPC. Token exchange uses a dedicated transport; identity uses the existing adapter. Neither logs requests, responses, or sensitive exceptions.

## Scopes

`GITHUB_OAUTH_SCOPES` explicitly requests only `read:org`, needed for private organization membership discovery. No `repo`, `workflow`, or organization administration scope is requested. GitHub may retain prior grants for this OAuth App. Capabilities come from authoritative `X-OAuth-Scopes` on authenticated `/user`, including implied organization-read scope from existing broader grants. Missing headers mean unknown/error, never assumed permission.

Existing Slice 2.1 no-scope credentials restore normally and show **Authorize organization access**. This reuses authorization-code + PKCE in the system browser without signing out. Identity and organization scope are validated before atomic credential replacement. Cancellation, denial, callback/exchange/network/validation failure, or replacement storage failure retains the previous valid session. The encrypted token remains the persistence format; scope is rechecked at startup, so no credential-file migration is needed.

References: [authenticated user endpoint](https://docs.github.com/en/rest/users/users#get-the-authenticated-user), [OAuth/PKCE and loopback callbacks](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

## Persistence and lifecycle

`GithubOAuthCredentialStore` supports load/save/delete. Its production implementation encrypts using Electron `safeStorage` (macOS Keychain; Windows OS-backed encryption) and writes only ciphertext to `userData/github-oauth.credential`, with a temporary-file/rename replacement and restrictive file permissions. No normal settings, localStorage, or plaintext fallback is used. Linux basic-text/unknown backends are refused. macOS release signing should use a stable application identity for consistent Keychain behavior.

If secure persistence fails for a first sign-in, the validated session remains in main-process memory with an explicit restart warning. A failed account replacement preserves the previous identity and credential. Successful switching uses `prompt=select_account`, validates the new identity, atomically saves the replacement, then replaces the in-memory session. Sign-out deletes the saved credential and clears memory; a deletion failure is surfaced so the user can retry. It does not sign the browser out of github.com.

Startup loads the encrypted credential once and validates it with `/user`. HTTP 401 removes the rejected token and asks the user to sign in again. Network errors, 403 (including policy/rate limiting), and server failures preserve the stored credential and show unavailable state; they never trigger global credential deletion. No unverified identity is presented as authenticated. A restart retries stored-credential validation, or the user can initiate fresh sign-in. Future organization authorization must remain separate from global identity validity.

## Intentionally unchanged

`GRAIDER_GITHUB_TOKEN`, `GITHUB_TOKEN`, GitHub CLI resolution, operational GitHub clients, injected test clients, Git credentials, course synchronization, and repository operations retain their existing authentication paths. Faculty sign-in does not imply these operations have migrated.

## Verification

Focused tests: `npx vitest run electron/githubOAuth.test.ts src/dashboard/GithubAccountPanel.test.tsx electron/tokenResolver.test.ts electron/githubClientProvider.test.ts electron/preload.test.ts`. Loopback integration tests require permission to bind local sockets; no automated test contacts GitHub.

Real OAuth smoke test requires the configured client secret and interactive faculty browser authorization. From signed out: sign in, verify system browser and local completion page, check login, fully quit/relaunch and verify restoration, sign out/relaunch and verify signed out, sign in again, switch accounts if available, simulate a network outage without deleting credentials, and confirm course/repository operations retain legacy authentication. Test macOS Apple Silicon and Windows x64 with actual OS credential storage before release.

## Organization discovery and validation

The OAuth service delegates transport to three narrow read-only methods on the shared GitHub client adapter, using the existing GitHub REST conventions (`application/vnd.github+json`, API version `2026-03-10`), bounded requests, and refused redirects. `GET /user/memberships/orgs` lists authenticated memberships, including `active` and `pending`, with `admin` (displayed as Owner) or `member`. It follows numbered pages through `Link: rel="next"` and full pages, using 100 results per page, and deduplicates numeric organization IDs. No public-list fallback or operational PAT/CLI credential is used.

The normalized `GithubOrganization` carries immutable `organizationId`, login, membership state and role, optional direct-membership evidence, typed access status, and a fixed sanitized diagnostic. It deliberately omits remote avatars and raw provider messages. Active organizations receive the narrow `GET /user/memberships/orgs/{org}` probe. Pending invitations are never accepted or considered accessible. Successful probes verify matching organization identity and refreshed membership state. Accessible means organization membership access is usable; future repository permissions remain untested.

Statuses distinguish accessible, pending, OAuth approval required, SSO required, broader authorization required, insufficient scope, forbidden, network unavailable, rate limited, and unexpected error. Explicit OAuth restriction wording supports approval classification; generic 403 stays forbidden. A membership-probe 404 means authorization/visibility or membership may have changed, never proof of nonmembership. `X-GitHub-SSO: required` supports SSO classification; ambiguous denials never imply SAML. Rate-limit headers, 429, and recognized primary/secondary rate messages receive retry guidance. Provider response bodies never reach IPC.

Only a definitive `/user` 401 clears the global credential (organization 401 responses are confirmed against `/user` first), following Slice 2.1. Organization policy failures, 403/404, outages, server failures and rate limits preserve sign-in. Discovery failure retains same-account prior results as explicitly stale in memory. No persistent organization cache exists. Account replacement clears the previous list, sign-out clears it, and token plus immutable faculty ID and abort guards reject late results. Startup launches discovery in the background after identity restoration; it does not wait for organization probes to create the window. Settings polls loading state and provides **Refresh organizations**.

GitHub may omit restricted organizations from authenticated listings. Graider cannot recover undisclosed organization IDs/logins or promise complete visibility beyond what GitHub returns. Empty results do not prove no memberships. The UI explains missing organizations; `partial-results` SSO headers produce an explicit incomplete-result diagnostic.

**Manage GitHub authorization** opens only the trusted, fixed `https://github.com/settings/applications` in the system browser. Faculty can inspect Graider's Authorized OAuth App entry and request owner approval there. Approval is never automated. After approval or invitation acceptance, refresh organizations. For SAML, establish the organization's SAML session in the browser and use **Update GitHub authorization** when needed, then refresh. No embedded SAML flow or provider-supplied URL launching is implemented. See [GitHub OAuth authorization](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps) and [membership API](https://docs.github.com/en/rest/orgs/members#list-organization-memberships-for-the-authenticated-user).

## Slice 2.2 smoke checklist

Use the existing no-scope credential: restore, verify upgrade action, cancel once and verify identity persists, authorize `read:org`, check expected organizations and roles, fully restart and verify scope restoration, then refresh. Where available, exercise owner approval and SAML and verify only that organization is affected; refresh after browser remediation. Test offline refresh and legacy course operations separately. Automated tests use injected fake transports and never contact GitHub.

Live verification on 2026-10-24 restored the existing `themrsean` no-scope credential, detected the missing organization permission, completed the system-browser `read:org` upgrade, and discovered `csc1120` as active/admin (Owner), accessible. A fresh session restored the upgraded credential and refreshed the same organization. The built Electron Faculty settings screen displayed that identity, organization, role/status, and refresh control. A simulated discovery outage preserved sign-in, retained explicitly stale membership data, and left encrypted credential bytes unchanged. The legacy dashboard authentication indicator remained Connected; no live course/grading/repository mutation was performed. Restricted-organization owner approval and SAML were covered with injected boundaries, not exercised live because the available organization was accessible.

## Phase 2.3 boundary

The OAuth credential is used only for faculty identity and organization membership discovery/access validation. Course discovery, repository enumeration, synchronization, cloning, course creation, roster/workflow/grading mutations and their authentication paths are unchanged. Phase 2.3 may consume the normalized organization model to deliberately add remote-course discovery and assess additional permissions; this slice adds no course/repository models or operations.
