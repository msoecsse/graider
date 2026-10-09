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
