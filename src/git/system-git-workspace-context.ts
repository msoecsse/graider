import { SystemGitWorkspaceFactory } from "./system-git-workspace.js";

export const createSystemGitWorkspaceFactory = (): SystemGitWorkspaceFactory =>
  new SystemGitWorkspaceFactory();
