import path from "node:path";
import { vi } from "vitest";
import {
  getProductionGitWorkspaceFactory,
  type GitWorkspaceWriterFactory
} from "./gitWorkspaceReader";

// GitHub origins use local fixture transport for real staging/commit/push without network access.
// Production must forward authentication; only this fixture removes it for local transport.
export const localPublicationOptions = (
  factory: GitWorkspaceWriterFactory = getProductionGitWorkspaceFactory()
) => ({
  runner: vi.fn(),
  factory,
  resolveToken: vi.fn().mockResolvedValue({ status: "success", token: "fixture-token" }),
  createAuthenticatedWorkspace: vi.fn().mockImplementation(() => ({
    authentication: { id: "fixture-operation" },
    factory: {
      inspect: factory.inspect.bind(factory),
      open: async (root: string) => {
        const workspace = await factory.open(root);
        return {
          root: workspace.root,
          inspect: workspace.inspect.bind(workspace),
          remoteUrl: workspace.remoteUrl.bind(workspace),
          stage: workspace.stage.bind(workspace),
          commit: workspace.commit.bind(workspace),
          pushUpstream: () =>
            (workspace.pushUpstream as unknown as () => Promise<{ readonly kind: "pushed" }>)()
        };
      }
    }
  }))
});

export const PAGES_FIXTURE_ORIGIN = "https://github.com/csc1120/csc1120pages.git";
type FixtureGit = (root: string, args: readonly string[]) => string;
export const pagesFixtureRemote = (root: string): string =>
  path.join(root, "remotes", "csc1120", "csc1120pages");
const assertPagesTransport = (git: FixtureGit, repository: string, target: string): void => {
  if (git(repository, ["config", "--get", "remote.origin.url"]) !== PAGES_FIXTURE_ORIGIN)
    throw new Error("Pages fixture must retain its configured GitHub identity.");
  // Git's get-url expands insteadOf; workspace.remoteUrl reads the stored URL.
  for (const flags of [[], ["--push"]]) {
    if (
      path.resolve(git(repository, ["remote", "get-url", ...flags, "origin"])) !==
      path.resolve(target)
    )
      throw new Error("Pages fixture transport must resolve exclusively to the local fixture.");
  }
};
export const configurePagesFixtureOrigin = (
  git: FixtureGit,
  repository: string,
  root: string
): void => {
  git(repository, ["remote", "add", "origin", PAGES_FIXTURE_ORIGIN]);
  git(repository, ["config", `url.${pagesFixtureRemote(root)}.insteadOf`, PAGES_FIXTURE_ORIGIN]);
  assertPagesTransport(git, repository, pagesFixtureRemote(root));
};
export const redirectPagesFixtureTransport = (
  git: FixtureGit,
  repository: string,
  root: string,
  target: string
): void => {
  git(repository, ["config", "--unset-all", `url.${pagesFixtureRemote(root)}.insteadOf`]);
  git(repository, ["config", `url.${target}.insteadOf`, PAGES_FIXTURE_ORIGIN]);
  assertPagesTransport(git, repository, target);
};
