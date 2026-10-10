import { randomUUID } from "node:crypto";
import { createGitAuthenticationContext, type GitAuthenticationContext } from "./git-workspace.js";
import type { GitCredentialResolver } from "./git-credential-resolver.js";
import { createDugiteGitRunners } from "./dugite-git-runners.js";
import { GitCommandWorkspaceFactory } from "./git-command-workspace.js";

export const createDugiteGitWorkspaceFactory = (
  credentialResolver?: GitCredentialResolver
): GitCommandWorkspaceFactory =>
  new GitCommandWorkspaceFactory({
    ...createDugiteGitRunners(),
    ...(credentialResolver === undefined ? {} : { credentialResolver })
  });

export interface AuthenticatedDugiteGitWorkspace {
  readonly factory: GitCommandWorkspaceFactory;
  readonly authentication: GitAuthenticationContext;
}

export const createAuthenticatedDugiteGitWorkspace = (
  token: string
): AuthenticatedDugiteGitWorkspace => {
  const trimmedToken = token.trim();
  if (trimmedToken.length === 0) throw new Error("GitHub authentication is required.");
  const authentication = createGitAuthenticationContext(randomUUID());
  if (authentication === null) throw new Error("Unable to create Git authentication context.");
  const credentialResolver: GitCredentialResolver = {
    resolve: (context) =>
      Promise.resolve(
        context === authentication
          ? { kind: "github_token", host: "github.com", token: trimmedToken }
          : null
      )
  };
  return { factory: createDugiteGitWorkspaceFactory(credentialResolver), authentication };
};
