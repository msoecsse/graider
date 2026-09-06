import { readGitHubToken } from "../github/github-client-factory.js";
import {
  runProductionAssignmentTemplateSync,
  type ProductionAssignmentTemplateSyncBridgeInput
} from "./production-assignment-template-sync-bridge.js";
import { resolveTemplateCloneUrl } from "./repository-clone-url.js";

export type ProductionAssignmentTemplateSyncServiceResult<T> =
  | { status: "success"; result: T }
  | { status: "failure"; message: string };

export interface ProductionAssignmentTemplateSyncServiceInput extends Omit<
  ProductionAssignmentTemplateSyncBridgeInput,
  "token" | "templateCloneUrl"
> {
  configuredOrganization: string;
  configuredTemplateRepository: string;
  env?: Record<string, string | undefined>;
  bridge?: typeof runProductionAssignmentTemplateSync;
}

export const runProductionAssignmentTemplateSyncService = async (
  input: ProductionAssignmentTemplateSyncServiceInput
): Promise<
  ProductionAssignmentTemplateSyncServiceResult<
    Awaited<ReturnType<typeof runProductionAssignmentTemplateSync>>
  >
> => {
  const token = readGitHubToken(input.env);
  if (token === undefined) return { status: "failure", message: "GitHub token is required." };
  const template = resolveTemplateCloneUrl(
    input.configuredOrganization,
    input.configuredTemplateRepository
  );
  if (template.status === "failure") return { status: "failure", message: template.message };
  const bridge = input.bridge ?? runProductionAssignmentTemplateSync;
  const result = await bridge({ ...input, token, templateCloneUrl: template.cloneUrl });
  return { status: "success", result };
};
