import type { GitCredentialResolver } from "./git-credential-resolver.js";
import { createDugiteGitRunners } from "./dugite-git-runners.js";
import { SystemGitWorkspaceFactory } from "./system-git-workspace.js";

export const createDugiteGitWorkspaceFactory = (
  credentialResolver?: GitCredentialResolver
): SystemGitWorkspaceFactory =>
  new SystemGitWorkspaceFactory({
    ...createDugiteGitRunners(),
    ...(credentialResolver === undefined ? {} : { credentialResolver })
  });
