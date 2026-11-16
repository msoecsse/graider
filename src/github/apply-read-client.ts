import { measureApplyPhase, type ApplyPhase } from "./apply-performance.js";
import type { GitHubClient } from "./github-client.js";

// Group execution has no PlanOperation envelope. Attribute its calls here; an enclosing
// individual phase takes precedence, including authority reads performed by write guards.
const methodPhases: Partial<Record<keyof GitHubClient, ApplyPhase>> = {
  getTemplateRepository: "readiness",
  getRepository: "repositoryCreation",
  createRepository: "repositoryCreation",
  createRepositoryFromTemplate: "repositoryCreation",
  getCollaboratorPermission: "permissions",
  addCollaborator: "permissions",
  getTeamPermission: "permissions",
  addTeamPermission: "permissions",
  getActionsState: "actionsConfiguration",
  enableActions: "actionsConfiguration",
  getRepositoryFileContent: "workflowDeployment",
  writeRepositoryFile: "workflowDeployment",
  getWorkflow: "verification"
};

/** Reuse the readiness template snapshot for manifest initialization, within this Apply only.
 * Never memoize account/OAuth/authority checks, missing repository checks or writes.
 */
export const createApplyReadClient = (client: GitHubClient): GitHubClient => {
  const templates = new Map<string, ReturnType<GitHubClient["getTemplateRepository"]>>();
  return new Proxy(client, {
    get(target, key) {
      if (key === "getTemplateRepository")
        return (owner: string, repo: string) => {
          const cacheKey = JSON.stringify([owner, repo]);
          const previous = templates.get(cacheKey);
          if (previous !== undefined) return previous;
          const pending = measureApplyPhase("readiness", () =>
            target.getTemplateRepository(owner, repo)
          ).catch((error: unknown) => {
            templates.delete(cacheKey);
            throw error;
          });
          templates.set(cacheKey, pending);
          return pending;
        };
      const method = target[key as keyof GitHubClient];
      if (typeof method !== "function") return method;
      const phase = methodPhases[key as keyof GitHubClient];
      return phase === undefined
        ? method.bind(target)
        : (...args: unknown[]) =>
            measureApplyPhase(phase, () => Reflect.apply(method, target, args) as Promise<unknown>);
    }
  });
};
