import type { GitCredentialResolver } from "./git-credential-resolver.js";
import { SystemGitWorkspaceFactory } from "./system-git-workspace.js";

export const createSystemGitWorkspaceFactory = (
  credentialResolver?: GitCredentialResolver
): SystemGitWorkspaceFactory =>
  new SystemGitWorkspaceFactory(credentialResolver === undefined ? {} : { credentialResolver });
