import { readGitHubToken } from "../github/github-client-factory.js";
import {
  runProductionAssignmentTemplateSync,
  type ProductionAssignmentTemplateSyncBridgeInput
} from "./production-assignment-template-sync-bridge.js";
import { resolveTemplateCloneUrl } from "./repository-clone-url.js";

export type ProductionAssignmentTemplateSyncServiceResult<T> =
  | { status: "success"; result: T }
  | { status: "failure"; code: string; message: string };

export interface ProductionAssignmentTemplateSyncServiceInput extends Omit<
  ProductionAssignmentTemplateSyncBridgeInput,
  "token" | "templateCloneUrl"
> {
  configuredOrganization: string;
  configuredTemplateRepository: string;
  env?: Record<string, string | undefined>;
  bridge?: typeof runProductionAssignmentTemplateSync;
  /** Internal pre-resolved token used when composition also needs a GitHub client. */
  resolvedToken?: string;
}

export const runProductionAssignmentTemplateSyncService = async (
  input: ProductionAssignmentTemplateSyncServiceInput
): Promise<
  ProductionAssignmentTemplateSyncServiceResult<
    Awaited<ReturnType<typeof runProductionAssignmentTemplateSync>>
  >
> => {
  const injectedToken = input.resolvedToken?.trim();
  const environmentToken = readGitHubToken(input.env);
  const token =
    injectedToken !== undefined && injectedToken.length > 0 ? injectedToken : environmentToken;
  if (token === undefined || token.length === 0)
    return {
      status: "failure",
      code: "github_token_required",
      message: "GitHub authentication is required. Configure a token or sign in with GitHub CLI."
    };
  const template = resolveTemplateCloneUrl(
    input.configuredOrganization,
    input.configuredTemplateRepository
  );
  if (template.status === "failure")
    return { status: "failure", code: "invalid_template_repository", message: template.message };
  const {
    bridge: injectedBridge,
    env: _env,
    resolvedToken: _resolvedToken,
    ...bridgeInput
  } = input;
  const bridge = injectedBridge ?? runProductionAssignmentTemplateSync;
  const result = await bridge({ ...bridgeInput, token, templateCloneUrl: template.cloneUrl });
  return { status: "success", result };
};
