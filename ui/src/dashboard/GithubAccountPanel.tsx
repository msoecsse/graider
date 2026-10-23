import { useEffect, useState, type ReactElement } from "react";
import type { GithubOAuthApi, GithubOAuthState } from "../../electron/githubOAuthTypes";

const AUTH_STATE_POLL_INTERVAL_MS = 500;

export const GithubAccountPanel = (): ReactElement => {
  const api = window.graiderUI.githubOAuth;
  const [state, setState] = useState<GithubOAuthState | null>(null);
  const [pending, setPending] = useState(false);
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
      state?.busy && api
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
  }, [state?.busy, api]);
  const run = async (operation: keyof GithubOAuthApi): Promise<void> => {
    if (api) {
      setPending(true);
      setError(null);
      try {
        setState(await api[operation]());
      } catch {
        setError("GitHub account operation could not be completed. Try again.");
      } finally {
        setPending(false);
      }
    }
  };
  const busy = pending || state?.busy;
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
      {busy ? (
        <button type="button" onClick={() => void api?.cancel()}>
          Cancel GitHub sign-in
        </button>
      ) : null}
      {state?.message || error ? <p role="status">{error ?? state?.message}</p> : null}
      <p>
        Faculty sign-in establishes your identity. Course and repository operations still use the
        existing GitHub credentials.
      </p>
    </div>
  );
};
