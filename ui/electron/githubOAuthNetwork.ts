import { provideGithubClient, type GithubClientProvider } from "./githubClientProvider.js";
import { GithubOAuthError } from "./githubOAuthCallback.js";
import type { GithubFacultyIdentity } from "./githubOAuthTypes.js";
export const GITHUB_OAUTH_CLIENT_ID = "Ov23lilUrjxhcDiX2RBq";
export const GITHUB_OAUTH_SCOPES: readonly string[] = [];
const NETWORK_TIMEOUT_MS = 30_000;
const UNAUTHORIZED_STATUS = 401;
export interface OAuthExchange {
  readonly code: string;
  readonly redirectUri: string;
  readonly verifier: string;
  readonly secret: string;
}
export const createGithubOAuthNetwork = (
  request: typeof fetch = fetch,
  provideClient: GithubClientProvider = provideGithubClient
) => {
  const json = async (
    url: string,
    init: RequestInit,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> => {
    try {
      const response = await request(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(NETWORK_TIMEOUT_MS)])
      });
      if (!response.ok)
        throw new GithubOAuthError(
          "unavailable",
          "GitHub is temporarily unavailable or access was denied. Try again."
        );
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
      return body as Record<string, unknown>;
    } catch (error) {
      if (error instanceof GithubOAuthError) throw error;
      throw new GithubOAuthError(
        "network",
        "Unable to contact GitHub. Check your connection and try again."
      );
    }
  };
  return {
    async exchange(input: OAuthExchange, signal: AbortSignal): Promise<string> {
      const body = await json(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            client_id: GITHUB_OAUTH_CLIENT_ID,
            client_secret: input.secret,
            code: input.code,
            redirect_uri: input.redirectUri,
            code_verifier: input.verifier
          })
        },
        signal
      );
      if (body.error)
        throw new GithubOAuthError(
          "exchange",
          "GitHub could not exchange the authorization code. Try signing in again."
        );
      if (
        typeof body.access_token !== "string" ||
        !/^[A-Za-z0-9_]+$/.test(body.access_token) ||
        typeof body.token_type !== "string" ||
        body.token_type.toLowerCase() !== "bearer"
      ) {
        throw new GithubOAuthError(
          "token_response",
          "GitHub returned an invalid sign-in response. Try again."
        );
      }
      return body.access_token;
    },
    async identity(token: string, signal: AbortSignal): Promise<GithubFacultyIdentity> {
      try {
        const body = await provideClient(token).getAuthenticatedUser({ signal });
        if (
          !/^[A-Za-z0-9-]+$/.test(body.username) ||
          !Number.isSafeInteger(body.id) ||
          (body.id ?? 0) <= 0
        ) {
          throw new GithubOAuthError(
            "identity",
            "GitHub identity could not be verified. Try again."
          );
        }
        return { login: body.username, id: body.id!, name: body.name ?? null };
      } catch (error) {
        if (error instanceof GithubOAuthError) throw error;
        if (
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          error.statusCode === UNAUTHORIZED_STATUS
        ) {
          throw new GithubOAuthError(
            "invalid_credential",
            "Your GitHub sign-in has expired or been revoked. Sign in again."
          );
        }
        throw new GithubOAuthError(
          "unavailable",
          "GitHub identity could not be verified. Check your connection and try again."
        );
      }
    }
  };
};
