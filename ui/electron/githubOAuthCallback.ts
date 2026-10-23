import { createServer } from "node:http";

export const OAUTH_CALLBACK_TIMEOUT_MS = 180_000;
const LOOPBACK_HOST = "127.0.0.1";
const EPHEMERAL_PORT = 0;
const MAX_CODE_LENGTH = 1024;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
export class GithubOAuthError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
export interface OAuthCallback {
  readonly redirectUri: string;
  readonly code: Promise<string>;
  cancel(): void;
}
export const startOAuthCallback = async (
  state: string,
  signal: AbortSignal,
  timeoutMs = OAUTH_CALLBACK_TIMEOUT_MS
): Promise<OAuthCallback> => {
  let settled = false;
  let accepting = true;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Cancellation may precede the coordinator awaiting the callback.
  void code.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (error: Error | null, value?: string): void => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      server.close();
      server.closeAllConnections();
      if (error) rejectCode(error);
      else resolveCode(value!);
    }
  };
  const cancel = (): void => {
    finish(new GithubOAuthError("canceled", "GitHub sign-in canceled."));
  };
  const server = createServer((request, response) => {
    const rawUrl = request.url ?? "/";
    const url = URL.canParse(rawUrl, `http://${LOOPBACK_HOST}`)
      ? new URL(rawUrl, `http://${LOOPBACK_HOST}`)
      : null;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (request.method !== "GET" || url?.pathname !== "/callback" || !accepting) {
      response.writeHead(HTTP_NOT_FOUND).end("Not found.");
    } else {
      accepting = false;
      const params = url!.searchParams;
      const authorizationCode = params.get("code");
      const error =
        params.getAll("state").length !== 1 || params.get("state") !== state
          ? new GithubOAuthError(
              "state_mismatch",
              "GitHub sign-in security check failed. Try again."
            )
          : params.has("error")
            ? new GithubOAuthError("denied", "GitHub authorization was denied or canceled.")
            : params.getAll("code").length !== 1 ||
                !authorizationCode ||
                authorizationCode.length > MAX_CODE_LENGTH ||
                !/^[A-Za-z0-9_-]+$/.test(authorizationCode)
              ? new GithubOAuthError(
                  "missing_code",
                  "GitHub did not return a valid authorization code."
                )
              : null;
      response
        .writeHead(error ? HTTP_BAD_REQUEST : HTTP_OK)
        .end(
          error
            ? "GitHub sign-in could not be completed. Return to Graider for details."
            : "GitHub sign-in complete. You may return to Graider.",
          () => finish(error, authorizationCode ?? undefined)
        );
    }
  });
  server.requestTimeout = timeoutMs;
  server.headersTimeout = timeoutMs;
  await new Promise<void>((resolve, reject) => {
    server.once("error", () =>
      reject(
        new GithubOAuthError("callback_unavailable", "Unable to start GitHub sign-in callback.")
      )
    );
    server.listen(EPHEMERAL_PORT, LOOPBACK_HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new GithubOAuthError("callback_unavailable", "Unable to start GitHub sign-in callback.");
  timer = setTimeout(
    () => finish(new GithubOAuthError("timeout", "GitHub sign-in timed out. Try again.")),
    timeoutMs
  );
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  return { redirectUri: `http://${LOOPBACK_HOST}:${address.port}/callback`, code, cancel };
};
