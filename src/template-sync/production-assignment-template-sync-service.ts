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
  bridge?: typeof runProductionAssignmentTemplateSync;
  /** Explicit operation-scoped Git transport credential from trusted composition. */
  resolvedToken: string;
}

export const runProductionAssignmentTemplateSyncService = async (
  input: ProductionAssignmentTemplateSyncServiceInput
): Promise<
  ProductionAssignmentTemplateSyncServiceResult<
    Awaited<ReturnType<typeof runProductionAssignmentTemplateSync>>
  >
> => {
  const token = input.resolvedToken.trim();
  if (token.length === 0)
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
  const { bridge: injectedBridge } = input;
  const bridgeInput: Omit<
    ProductionAssignmentTemplateSyncBridgeInput,
    "token" | "templateCloneUrl"
  > = {
    manifest: input.manifest,
    ...(input.studentId === undefined ? {} : { studentId: input.studentId }),
    options: input.options,
    resolveCurrentTemplateCommitSha: input.resolveCurrentTemplateCommitSha,
    persistManifest: input.persistManifest,
    ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
    workspace: input.workspace
  };
  const bridge = injectedBridge ?? runProductionAssignmentTemplateSync;
  const result = await bridge({ ...bridgeInput, token, templateCloneUrl: template.cloneUrl });
  return { status: "success", result };
};
