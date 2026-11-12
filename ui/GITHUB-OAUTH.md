# GitHub sign-in and managed-course access

Graider uses a GitHub OAuth App authorization-code flow with S256 PKCE and the system browser. The verified account is the faculty identity used by managed-course discovery, synchronization, reconciliation, guarded course administration, and supported local cache reads and grading workflows. The exact managed operation boundaries and authorization checks are defined in the [remote-course architecture](../docs/graider-remote-course-architecture.md). This page summarizes OAuth-specific behavior.

## Public native client and approved risk model

Graider is a **public native OAuth client**. Its packaged client secret is recoverable from desktop binaries and must not be considered confidential, used to authenticate the executable, or relied on instead of PKCE, user authentication, or authorization checks. Faculty approved retaining this architecture; no hosted exchange service, device flow, or GitHub App migration is part of this decision.

The secret is sent to GitHub during code exchange alongside the one-time authorization code, exact loopback redirect URI, and PKCE verifier. Possession of the secret alone does not provide a user's access token or authorize repository operations. A malicious client that impersonates Graider can nevertheless initiate the same OAuth App flow and request the app's scopes; GitHub still requires a user authorization and enforces the resulting token's permissions. This leaves client-impersonation risk inherent to a public client. Do not reuse the distributed secret for confidential infrastructure. Rotate it if it is reused by confidential infrastructure and that infrastructure may be exposed, or if there is separate evidence of compromise or abuse. Routine rotation cannot conceal a replacement secret distributed in desktop binaries.

The following OAuth App owner checks are **unverified**: registered callback configuration, device-flow setting, expiring-token setting, whether the distributed secret is reused in a confidential service, and evidence of credential abuse. No OAuth App settings were inspected for this documentation update. The implementation binds its callback to `127.0.0.1` on an OS-selected port and uses that exact runtime URI; confirm the app registration supports this loopback callback.

## Flow and security roles

Electron main generates independent cryptographic PKCE verifier and state values for each sign-in. PKCE (S256) binds the authorization code to the initiating app flow, so interception of the code alone is insufficient. State binds the callback to the pending request and rejects unsolicited or mismatched callbacks. The single-use loopback listener accepts only `GET /callback`, uses `127.0.0.1` with an ephemeral port, and closes on completion, failure, timeout, cancellation, or shutdown. These controls protect the flow; the client secret does not prove executable identity.

Trusted main-process code builds the authorization URL and opens it in the system browser. The exchange refuses redirects and applies request timeouts. The renderer receives sanitized identity/status only; tokens, secret, authorization code, state, and verifier do not cross IPC. The existing operational token and CLI credential paths remain distinct from this OAuth session.

## Scopes and authorization

The current request explicitly asks for `read:org` and `repo`. `read:org` supports private organization membership discovery. `repo` supports private repository discovery and the managed-course repository operations described in the [architecture](../docs/graider-remote-course-architecture.md). `repo` is broad: it grants the token broad access to repositories available to the authorizing user, not only repositories Graider lists as managed courses. Graider's internal faculty and course authorization rules apply inside Graider; they do not constrain someone who directly uses a stolen GitHub access token. GitHub enforces the token's actual permissions at each remote operation.

Graider checks authenticated `/user` scope evidence and immutable numeric user ID, and uses organization/repository identity, faculty policy, and operation-specific authorization checks. Missing scope evidence is not treated as permission. GitHub may retain broader prior grants for the OAuth App. Faculty authorization inside Graider is not a substitute for protecting the token.

## Credential storage and lifetime

The production credential store encrypts the access token with Electron `safeStorage` and writes ciphertext to `userData/github-oauth.credential` using temporary-file replacement. On macOS this uses Keychain; on Windows it uses OS-backed encryption. There is no plaintext fallback; unsupported/basic-text storage is refused. Encryption at rest reduces exposure from casual file access, but does not protect against malware or an attacker running as the same user, compromised app processes, or direct use of a token recovered from an authorized session. Stable macOS application signing identity supports consistent Keychain access.

The current exchange stores and uses an access token; Graider does not implement refresh-token support or refresh-token rotation. It validates a stored token against `/user` at startup and when needed. A definitive 401 removes the rejected credential and requires sign-in again; network errors, 403, and server failures preserve it. If secure persistence fails during first sign-in, the session can remain in memory with a restart warning.

## Managed courses, cache, and offline limits

Managed-course workflows use the OAuth session under the operation boundaries in the [remote-course architecture](../docs/graider-remote-course-architecture.md). A trusted session and authorization/discovery evidence are established through GitHub; remote synchronization and mutations require current remote checks. Supported local reads and grading work can use an already authorized, validated local cache during a transient outage. This is cache-first behavior for those supported operations, not offline-first startup or queued offline mutation: restart or discovery refresh may require GitHub, and remote mutations still synchronize and revalidate. A local catalog alone does not authorize access. Legacy/manual token, GitHub CLI, Git credential, and other existing operation paths are not implicitly migrated by OAuth sign-in.

## Future security work

Separate future work may evaluate expiring access tokens with refresh-token rotation, a GitHub App for finer-grained repository permissions, and OAuth scope redesign. These are not part of the approved architecture change. Renderer sandboxing and other Electron hardening are also separate work.

References: [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [authenticated user and scopes](https://docs.github.com/en/rest/users/users#get-the-authenticated-user), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
