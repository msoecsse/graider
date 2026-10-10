import { vi } from "vitest";
import {
  getProductionGitWorkspaceFactory,
  type GitWorkspaceWriterFactory
} from "./gitWorkspaceReader";

// Filesystem remotes exercise staging/commit/push without live GitHub credentials.
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
