import { useEffect, useState, type ReactElement } from "react";
import type { GithubOAuthApi, GithubOAuthState } from "../../electron/githubOAuthTypes";

const organizationStatusLabels = {
  accessible: "Accessible",
  pending: "Invitation pending",
  oauth_approval_required: "Graider needs approval for this organization",
  sso_required: "SSO authorization required",
  authorization_required: "Organization authorization required",
  insufficient_scope: "Organization permission required",
  forbidden: "Organization access denied",
  network_unavailable: "Network unavailable",
  rate_limited: "GitHub request limit reached",
  error: "Unable to validate access"
};
const AUTH_STATE_POLL_INTERVAL_MS = 500;

export const GithubAccountPanel = (): ReactElement => {
  const api = window.graiderUI.githubOAuth;
  const [state, setState] = useState<GithubOAuthState | null>(null);
  const [pending, setPending] = useState<keyof GithubOAuthApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void api
      ?.get()
      .then((value) => {
        if (mounted) setState(value);
      })
      .catch(() => {
        if (mounted) setError("GitHub account status is unavailable.");
      });
    return () => {
      mounted = false;
    };
  }, [api]);
  // A flow may finish while this panel is closed; refresh a remounted busy session.
  useEffect(() => {
    let mounted = true;
    const timer =
      (state?.busy || state?.organizationDiscovery.status === "loading") && api
        ? setInterval(() => {
            void api
              .get()
              .then((value) => {
                if (mounted) setState(value);
              })
              .catch(() => {
                if (mounted) setError("GitHub account status is unavailable.");
              });
          }, AUTH_STATE_POLL_INTERVAL_MS)
        : undefined;
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [state?.busy, state?.organizationDiscovery.status, api]);
  const run = async (operation: keyof GithubOAuthApi): Promise<void> => {
    if (api) {
      setPending(operation);
      setError(null);
      try {
        setState(await api[operation]());
      } catch {
        setError("GitHub account operation could not be completed. Try again.");
      } finally {
        setPending(null);
      }
    }
  };
  const busy = Boolean(pending) || state?.busy;
  return (
    <div aria-label="GitHub faculty account">
      <p>
        {state?.identity
          ? `Signed in to GitHub as ${state.identity.login}`
          : state?.status === "unavailable"
            ? "GitHub: Saved sign-in unavailable"
            : "GitHub: Not signed in"}
      </p>
      {state?.identity?.name ? <p>{state.identity.name}</p> : null}
      {state?.identity ? (
        <>
          <button type="button" disabled={busy} onClick={() => void run("signOut")}>
            Sign out
          </button>{" "}
          <button type="button" disabled={busy} onClick={() => void run("switchAccount")}>
            Sign in as another account
          </button>
        </>
      ) : (
        <button type="button" disabled={busy || !api} onClick={() => void run("signIn")}>
          Sign in to GitHub
        </button>
      )}
      {state?.status === "unavailable" ? (
        <button type="button" disabled={busy} onClick={() => void run("signOut")}>
          Sign out
        </button>
      ) : null}
      {state?.busy || pending === "signIn" || pending === "switchAccount" ? (
        <button type="button" onClick={() => void api?.cancel()}>
          Cancel GitHub sign-in
        </button>
      ) : null}
      {state?.identity ? (
        <section aria-label="Organizations">
          <h3>Organizations</h3>
          {state.organizationPermission === "required" ? (
            <button type="button" disabled={busy} onClick={() => void run("signIn")}>
              Authorize organization access
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || state.organizationDiscovery.status === "loading"}
            onClick={() => void run("refreshOrganizations")}
          >
            Refresh organizations
          </button>{" "}
          <button type="button" disabled={busy} onClick={() => void run("manageAuthorization")}>
            Manage GitHub authorization
          </button>{" "}
          {state.organizationPermission === "available" ? (
            <button type="button" disabled={busy} onClick={() => void run("signIn")}>
              Update GitHub authorization
            </button>
          ) : null}
          {state.organizationDiscovery.status === "loading" ? (
            <p role="status">Loading organizations…</p>
          ) : null}
          {state.organizationDiscovery.message ? (
            <p role="status">{state.organizationDiscovery.message}</p>
          ) : null}
          {state.organizationDiscovery.stale ? (
            <p>Previously discovered organizations; refresh to verify current access.</p>
          ) : null}
          <ul>
            {state.organizationDiscovery.organizations.map((org) => (
              <li key={org.organizationId}>
                <strong>{org.login}</strong> — {org.membershipRole === "admin" ? "Owner" : "Member"}{" "}
                — {organizationStatusLabels[org.accessStatus]}
                <p>{org.accessDiagnostic}</p>
                {org.accessStatus === "oauth_approval_required" ||
                org.accessStatus === "sso_required" ||
                org.accessStatus === "authorization_required" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run("manageAuthorization")}
                  >
                    Manage GitHub authorization
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {state.organizationDiscovery.status === "ready" &&
          state.organizationDiscovery.organizations.length === 0 ? (
            <p>No organization memberships were returned by GitHub.</p>
          ) : null}
          <p>
            GitHub may hide organizations restricted by policy. Manage GitHub authorization if an
            expected organization is missing.
          </p>
        </section>
      ) : (
        <p>Sign in to discover organizations.</p>
      )}
      {state?.message || error ? <p role="status">{error ?? state?.message}</p> : null}
      <p>
        Faculty sign-in establishes your identity. Course and repository operations still use the
        existing GitHub credentials.
      </p>
    </div>
  );
};
