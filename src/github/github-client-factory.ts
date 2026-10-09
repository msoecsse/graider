import type { GitHubClient } from "./github-client.js";
import { OctokitGitHubClient } from "./octokit-github-client.js";

const EMPTY_LENGTH = 0;

export interface GitHubClientFactoryOptions {
  readonly token: string;
}

export const createGitHubClient = (options: GitHubClientFactoryOptions): GitHubClient => {
  const token = options.token.trim();

  if (token.length === EMPTY_LENGTH) {
    throw new Error("A GitHub token is required to create a production GitHub client.");
  }

  return new OctokitGitHubClient({ token });
};
