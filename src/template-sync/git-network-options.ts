/** Makes a missing or rejected credential fail at once instead of prompting on the terminal. */
export const NON_INTERACTIVE_GIT_ENVIRONMENT = { GIT_TERMINAL_PROMPT: "0" } as const;

/** Per-command authorization header; it is never written to a clone's configuration. */
export const createGitAuthorizationArguments = (token: string | null): string[] =>
  token === null
    ? []
    : [
        "-c",
        `http.extraHeader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`
      ];

export const createNonInteractiveGitEnvironment = (): NodeJS.ProcessEnv => ({
  ...process.env,
  ...NON_INTERACTIVE_GIT_ENVIRONMENT
});
