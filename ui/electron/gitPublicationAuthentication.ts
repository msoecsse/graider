import type { ProcessRunner } from "./commandRunner.js";
import {
  createAuthenticatedProductionGitWorkspace,
  type AuthenticatedGitWorkspaceContext,
  type GitWorkspaceInspectionFactory
} from "./gitWorkspaceReader.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";
import { managedCourseOperation } from "./managedCourseOperationContext.js";

export interface GitPublicationOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly factory?: GitWorkspaceInspectionFactory;
  readonly resolveToken?: () => Promise<GithubTokenResolution>;
  readonly createAuthenticatedWorkspace?: (token: string) => AuthenticatedGitWorkspaceContext;
}

export const authenticateGitPublication = async (
  options: GitPublicationOptions
): Promise<AuthenticatedGitWorkspaceContext | null> => {
  if (
    ["local_read", "local_grading", "evidence_read"].includes(
      managedCourseOperation.getStore()?.mode ?? ""
    )
  )
    throw new Error("Local course operations cannot authorize Git publication.");
  try {
    const resolution = await (options.resolveToken ?? (() => resolveGithubToken(options)))();
    if (resolution.status !== "success") return null;
    const authenticated = (
      options.createAuthenticatedWorkspace ?? createAuthenticatedProductionGitWorkspace
    )(resolution.token);
    const operation = managedCourseOperation.getStore();
    if (!operation?.revalidate) return authenticated;
    await operation.revalidate();
    const writes = [
      "stage",
      "commit",
      "pushBranch",
      "pushUpstream",
      "pullUpstream",
      "fastForwardToCommit",
      "fastForwardUpstream"
    ];
    return {
      ...authenticated,
      factory: {
        ...authenticated.factory,
        inspect: authenticated.factory.inspect.bind(authenticated.factory),
        clone: authenticated.factory.clone.bind(authenticated.factory),
        open: async (root) => {
          const workspace = (await authenticated.factory.open(root)) as Awaited<
            ReturnType<AuthenticatedGitWorkspaceContext["factory"]["open"]>
          >;
          return new Proxy(workspace, {
            get(target, key) {
              const method = Reflect.get(target, key) as unknown;
              if (typeof method !== "function") return method;
              return writes.includes(String(key))
                ? async (...args: unknown[]) => {
                    await operation.revalidate?.();
                    return Reflect.apply(method, target, args);
                  }
                : method.bind(target);
            }
          });
        }
      }
    };
  } catch {
    return null;
  }
};
